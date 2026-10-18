import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { llmLocalHandlerMock } = vi.hoisted(() => ({
  llmLocalHandlerMock: vi.fn(),
}));

vi.mock("../server/skills/llm.local", async () => {
  const actual = await vi.importActual<typeof import("../server/skills/llm.local")>(
    "../server/skills/llm.local",
  );
  return {
    ...actual,
    llmLocalHandler: llmLocalHandlerMock,
  };
});

const buildApp = async () => {
  const { planRouter } = await import("../server/routes/agi.plan");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/agi", planRouter);
  return app;
};

const historyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-conversation-history-route-"));
const historyLogPath = path.join(historyTempDir, "helix-conversation-history.jsonl");
const threadLedgerPath = path.join(historyTempDir, "helix-thread-ledger.jsonl");
const threadIndexPath = path.join(historyTempDir, "helix-thread-index.json");

describe("conversation-turn route", () => {
  beforeEach(() => {
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_ASK_CONVERSATION_HISTORY_AUDIT_PATH = historyLogPath;
    process.env.HELIX_ASK_CONVERSATION_HISTORY_PERSIST = "1";
    process.env.HELIX_THREAD_LEDGER_PATH = threadLedgerPath;
    process.env.HELIX_THREAD_INDEX_PATH = threadIndexPath;
    process.env.HELIX_THREAD_PERSIST = "1";
    llmLocalHandlerMock.mockReset();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    for (const name of fs.readdirSync(historyTempDir)) {
      if (name.endsWith(".jsonl") || name.endsWith(".json")) {
        fs.rmSync(path.join(historyTempDir, name), { force: true });
      }
    }
    const { __resetConversationHistoryStore } = await import(
      "../server/services/helix-ask/conversation-history"
    );
    const { __resetHelixThreadLedgerStore } = await import(
      "../server/services/helix-thread/ledger"
    );
    const { __resetHelixThreadRegistryStore } = await import(
      "../server/services/helix-thread/registry"
    );
    __resetConversationHistoryStore();
    __resetHelixThreadLedgerStore();
    __resetHelixThreadRegistryStore();
    delete process.env.HELIX_ASK_CONVERSATION_HISTORY_AUDIT_PATH;
    delete process.env.HELIX_ASK_CONVERSATION_HISTORY_PERSIST;
    delete process.env.HELIX_THREAD_LEDGER_PATH;
    delete process.env.HELIX_THREAD_INDEX_PATH;
    delete process.env.HELIX_THREAD_PERSIST;
  });

  afterAll(() => {
    fs.rmSync(historyTempDir, { recursive: true, force: true });
  });

  it("returns classifier + brief schema for representative verify prompts", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "verify",
          confidence: 0.91,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Verification intent detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief:
            "I heard your verification request. Next step: run the verify lane and report pass/fail evidence.",
        }),
      });

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "Please verify this claim and give me pass/fail evidence.",
      traceId: "trace-conversation-verify",
      recentTurns: ["user: previous context", "dottie: previous brief"],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.classification).toMatchObject({
      mode: "verify",
      dispatch_hint: true,
      clarify_needed: false,
    });
    expect(typeof res.body.classification.reason).toBe("string");
    expect(typeof res.body.brief.text).toBe("string");
    expect(res.body.dispatch).toMatchObject({
      dispatch_hint: true,
    });
    expect(llmLocalHandlerMock).toHaveBeenCalledTimes(2);
    const briefPrompt = String(llmLocalHandlerMock.mock.calls[1]?.[0]?.prompt ?? "");
    expect(briefPrompt).toContain("Route reason: dispatch:verify");
    expect(briefPrompt).toContain("Do not output raw route/status codes.");
  }, 30000);

  it("keeps brief empty when LLM brief payload is invalid", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.78,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Substantive exploratory turn detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: "Acknowledging the request. I am thinking through this in the background.",
      });

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "Explain how quantum structures map to system behavior.",
      traceId: "trace-conversation-brief-fallback",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.classification).toMatchObject({
      mode: "observe",
      dispatch_hint: true,
    });
    expect(res.body.route_reason_code).toMatch(/^dispatch:/);
    expect(res.body.dispatch?.dispatch_hint).toBe(true);
    expect(res.body.brief?.source).toBe("none");
    expect(String(res.body.fail_reason ?? "")).toMatch(/conversation_brief_(parse|policy)_none/);
    expect(String(res.body.brief?.text ?? "")).toBe("");
  }, 30000);

  it("auto-seeds recentTurns from persisted conversation history when omitted", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "verify",
          confidence: 0.88,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Verification intent detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I heard your verification request and will keep the same evidence trail.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.77,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Follow-up explanatory turn detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am carrying forward the prior verification context into this follow-up.",
        }),
      });

    const app = await buildApp();
    await request(app).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-history-seed",
      traceId: "turn-history-1",
      transcript: "Please verify this claim and give me pass/fail evidence.",
    }).expect(200);

    const { __resetConversationHistoryStore } = await import(
      "../server/services/helix-ask/conversation-history"
    );
    const { getHelixThreadLedgerEvents } = await import(
      "../server/services/helix-thread/ledger"
    );
    const seededEventTypes = getHelixThreadLedgerEvents({
      sessionId: "session-history-seed",
    }).map((entry) => entry.event_type);
    expect(seededEventTypes).toEqual(
      expect.arrayContaining([
        "thread_started",
        "turn_started",
        "item_started",
        "item_completed",
        "conversation_turn_started",
        "conversation_turn_classified",
        "conversation_turn_brief_ready",
        "turn_completed",
        "conversation_turn_completed",
      ]),
    );
    expect(
      seededEventTypes.filter((eventType) =>
        [
          "conversation_turn_started",
          "conversation_turn_classified",
          "conversation_turn_brief_ready",
          "conversation_turn_completed",
        ].includes(eventType),
      ),
    ).toEqual([
      "conversation_turn_started",
      "conversation_turn_classified",
      "conversation_turn_brief_ready",
      "conversation_turn_completed",
    ]);
    __resetConversationHistoryStore();
    for (const name of fs.readdirSync(historyTempDir)) {
      if (name.startsWith("helix-conversation-history") && name.endsWith(".jsonl")) {
        fs.rmSync(path.join(historyTempDir, name), { force: true });
      }
    }

    const followUp = await request(app).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-history-seed",
      traceId: "turn-history-2",
      transcript: "Where is that coming from in the prior answer?",
    });

    expect(followUp.status).toBe(200);
    expect(followUp.body.turn_id).toBe("turn-history-2");
    const seededClassifierPrompt = String(llmLocalHandlerMock.mock.calls[2]?.[0]?.prompt ?? "");
    expect(seededClassifierPrompt).toContain("user: Please verify this claim and give me pass/fail evidence.");
    expect(seededClassifierPrompt).toContain(
      "dottie: I heard your verification request and will keep the same evidence trail.",
    );
  }, 20000);

  it("re-hydrates persisted conversation history after router reload", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.83,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Initial explanatory turn detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am explaining the current evidence trail in a conversational follow-up.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.79,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Follow-up explanatory turn detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am still using the earlier answer as conversational context after restart.",
        }),
      });

    const firstApp = await buildApp();
    await request(firstApp).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-history-restart",
      traceId: "restart-history-1",
      transcript: "Explain the earlier answer in one conversational follow-up.",
    }).expect(200);

    vi.resetModules();
    const restartedApp = await buildApp();
    const followUp = await request(restartedApp).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-history-restart",
      traceId: "restart-history-2",
      transcript: "Now connect that to the prior answer again.",
    });

    expect(followUp.status).toBe(200);
    expect(followUp.body.ok).toBe(true);
    expect(followUp.body.classification?.mode).toBe("observe");
    expect(followUp.body.dispatch?.dispatch_hint).toBe(true);
    const restartedClassifierPrompt = String(llmLocalHandlerMock.mock.calls[2]?.[0]?.prompt ?? "");
    expect(restartedClassifierPrompt).toContain(
      "user: Explain the earlier answer in one conversational follow-up.",
    );
    expect(restartedClassifierPrompt).toContain(
      "dottie: I am explaining the current evidence trail in a conversational follow-up.",
    );
    const { getHelixThreadLedgerEvents } = await import("../server/services/helix-thread/ledger");
    const restartedEventTypes = getHelixThreadLedgerEvents({
      sessionId: "session-history-restart",
    }).map((entry) => entry.event_type);
    expect(restartedEventTypes).toEqual(
      expect.arrayContaining([
        "thread_started",
        "thread_resumed",
        "turn_started",
        "item_started",
        "item_completed",
        "conversation_turn_started",
        "conversation_turn_classified",
        "conversation_turn_brief_ready",
        "turn_completed",
        "conversation_turn_completed",
      ]),
    );
    expect(
      restartedEventTypes.filter((eventType) =>
        [
          "conversation_turn_started",
          "conversation_turn_classified",
          "conversation_turn_brief_ready",
          "conversation_turn_completed",
        ].includes(eventType),
      ),
    ).toEqual([
      "conversation_turn_started",
      "conversation_turn_classified",
      "conversation_turn_brief_ready",
      "conversation_turn_completed",
      "conversation_turn_started",
      "conversation_turn_classified",
      "conversation_turn_brief_ready",
      "conversation_turn_completed",
    ]);
  }, 20000);

  it("rejects clarifier-style brief text for observe turns even when JSON is valid", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.79,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Exploratory question detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: 'I heard: "Okay, what is a system.". Share one specific goal or constraint.',
        }),
      });

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "Okay, what is a system?",
      traceId: "trace-observe-brief-policy-fallback",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.classification?.mode).toBe("observe");
    expect(res.body.dispatch?.dispatch_hint).toBe(true);
    expect(res.body.brief?.source).toBe("none");
    expect(String(res.body.fail_reason ?? "")).toContain("conversation_brief_policy_none");
    expect(String(res.body.brief?.text ?? "")).toBe("");
  }, 20000);

  it("falls back deterministically when model/parse paths fail", async () => {
    llmLocalHandlerMock
      .mockRejectedValueOnce(new Error("model unavailable"))
      .mockRejectedValueOnce(new Error("brief unavailable"));

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "Implement this patch and run the action flow now.",
      traceId: "trace-conversation-fallback",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.classification?.source).toBe("fallback");
    expect(res.body.classification?.mode).toBe("act");
    expect(res.body.brief?.source).toBe("fallback");
    expect(typeof res.body.brief?.text).toBe("string");
    expect(["conversation_classifier_model_fallback", "conversation_classifier_parse_fallback"]).toContain(
      res.body.fail_reason,
    );
    expect(res.body.dispatch?.dispatch_hint).toBe(true);
    expect(String(res.body.brief?.text ?? "")).not.toBe("");
    expect(String(res.body.brief?.text ?? "").toLowerCase()).toContain("action");
    expect(llmLocalHandlerMock).toHaveBeenCalledTimes(2);
  }, 20000);

  it("produces a grounded verify brief when classifier fallback is unavoidable", async () => {
    llmLocalHandlerMock
      .mockRejectedValueOnce(new Error("classifier unavailable"))
      .mockRejectedValueOnce(new Error("brief unavailable"));

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "Please verify the current route extraction status and summarize the result.",
      traceId: "trace-conversation-verify-fallback-brief",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.classification?.source).toBe("fallback");
    expect(res.body.classification?.mode).toBe("verify");
    expect(res.body.route_reason_code).toBe("dispatch:verify");
    expect(res.body.brief?.source).toBe("fallback");
    expect(String(res.body.brief?.text ?? "")).not.toBe("");
    expect(String(res.body.brief?.text ?? "").toLowerCase()).toContain("verification");
    expect(res.body.fail_reason).toBe("conversation_classifier_model_fallback");
  }, 20000);

  it("routes exploratory broad prompts to observe with dispatch enabled", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "clarify",
          confidence: 0.51,
          dispatch_hint: false,
          clarify_needed: true,
          reason: "Needs more detail.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: "I’ll run an observe-first pass and report the concrete path next.",
        }),
      });

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "How is a full solve done?",
      traceId: "trace-conversation-explore",
    });

    expect(res.status).toBe(200);
    expect(res.body.classification).toMatchObject({
      mode: "observe",
      dispatch_hint: true,
      clarify_needed: false,
    });
    expect(res.body.route_reason_code).toBe("dispatch:observe_explore");
    expect(res.body.exploration_turn).toBe(true);
    expect(res.body.clarifier_policy).toBe("after_first_attempt");
    expect(res.body.exploration_packet?.topic).toContain("How is a full solve done");
    expect(Array.isArray(res.body.exploration_packet?.unknowns)).toBe(true);
  }, 20000);

  it("suppresses filler turns with deterministic reason code", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.84,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Observe",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: "Acknowledged.",
        }),
      });

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "ok thanks",
      traceId: "trace-conversation-filler",
    });

    expect(res.status).toBe(200);
    expect(res.body.classification?.mode).toBe("clarify");
    expect(res.body.dispatch?.dispatch_hint).toBe(false);
    expect(res.body.route_reason_code).toBe("suppressed:filler");
    expect(res.body.exploration_turn).toBe(false);
  }, 20000);

  it("does not down-rank substantive turns that start with 'okay'", async () => {
    llmLocalHandlerMock
      .mockRejectedValueOnce(new Error("classifier unavailable"))
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: "Okay, what is a system? I will run a short observe pass and return a direct answer.",
        }),
      });

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "Okay, what is a system?",
      traceId: "trace-leading-ok-substantive",
    });

    expect(res.status).toBe(200);
    expect(res.body.classification?.source).toBe("fallback");
    expect(res.body.classification?.mode).toBe("observe");
    expect(res.body.dispatch?.dispatch_hint).toBe(true);
    expect(String(res.body.route_reason_code ?? "")).toMatch(/^dispatch:/);
    expect(String(res.body.brief?.text ?? "").toLowerCase()).not.toContain("share one specific goal or constraint");
  }, 20000);

  it("dispatches multilingual direct questions that use full-width punctuation", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.41,
          dispatch_hint: false,
          clarify_needed: false,
          reason: "Fallback classify output.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: "这是一个关于曲速泡的问题，我将进入观察推理并给出解释。",
        }),
      });

    const app = await buildApp();
    const res = await request(app).post("/api/agi/ask/conversation-turn").send({
      transcript: "什么是二库比叶尔扭曲炮？",
      traceId: "trace-multilang-fullwidth-question",
      sourceLanguage: "zh-hans",
      languageDetected: "zh-hans",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.classification?.mode).toBe("observe");
    expect(
      /^(?:dispatch:|suppressed:low_salience)/.test(String(res.body.route_reason_code ?? "")),
    ).toBe(true);
  }, 20000);

  it("reuses an explicit thread id across restart instead of falling back to the session id", async () => {
    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.81,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Initial turn detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am keeping the thread continuity explicit and replayable.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.79,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Follow-up turn detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am still on the same thread after restart.",
        }),
      });

    const firstApp = await buildApp();
    const first = await request(firstApp).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-explicit-thread",
      traceId: "explicit-thread-1",
      transcript: "Keep this continuity on one thread.",
    });
    expect(first.status).toBe(200);
    expect(String(first.body.thread_id ?? "")).toMatch(/^thread:/);
    expect(first.body.thread_id).not.toBe("session-explicit-thread");

    vi.resetModules();
    const restartedApp = await buildApp();
    const second = await request(restartedApp).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-explicit-thread",
      traceId: "explicit-thread-2",
      transcript: "Resume that same thread after restart.",
    });
    expect(second.status).toBe(200);
    expect(second.body.thread_id).toBe(first.body.thread_id);
  }, 20000);

  it("supports same-turn steering for steerable turns and rejects non-steerable ones", async () => {
    const {
      appendHelixTurnEvent,
      appendHelixThreadItemEvent,
      getHelixThreadLedgerEvents,
    } = await import("../server/services/helix-thread/ledger");
    const {
      startHelixThread,
      updateHelixThreadRecord,
    } = await import("../server/services/helix-thread/registry");

    const steerThread = startHelixThread({
      sessionId: "session-steerable-turn",
      titlePreview: "steerable thread",
    });
    updateHelixThreadRecord({
      threadId: steerThread.thread_id,
      patch: {
        status: "active",
        latest_turn_id: "active-conversation-turn",
        active_turn_id: "active-conversation-turn",
      },
    });
    appendHelixTurnEvent({
      thread_id: steerThread.thread_id,
      route: "/ask/conversation-turn",
      event_type: "turn_started",
      turn_id: "active-conversation-turn",
      session_id: "session-steerable-turn",
      trace_id: "seed-steerable-turn",
      turn_kind: "conversation_turn",
      thread_status: "active",
    });
    appendHelixThreadItemEvent({
      thread_id: steerThread.thread_id,
      route: "/ask/conversation-turn",
      event_type: "item_started",
      turn_id: "active-conversation-turn",
      session_id: "session-steerable-turn",
      trace_id: "seed-steerable-turn",
      turn_kind: "conversation_turn",
      item_id: "seed-user-item",
      item_type: "userMessage",
      item_status: "in_progress",
      user_text: "Seed turn text",
    });

    const reviewThread = startHelixThread({
      sessionId: "session-review-turn",
      titlePreview: "review thread",
    });
    updateHelixThreadRecord({
      threadId: reviewThread.thread_id,
      patch: {
        status: "active",
        latest_turn_id: "active-review-turn",
        active_turn_id: "active-review-turn",
      },
    });
    appendHelixTurnEvent({
      thread_id: reviewThread.thread_id,
      route: "/ask/conversation-turn",
      event_type: "turn_started",
      turn_id: "active-review-turn",
      session_id: "session-review-turn",
      trace_id: "seed-review-turn",
      turn_kind: "review",
      thread_status: "active",
    });

    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.73,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Steering follow-up detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am continuing the same active turn.",
        }),
      });

    const app = await buildApp();
    const steered = await request(app).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-steerable-turn",
      threadId: steerThread.thread_id,
      steerActiveTurn: true,
      expectedTurnId: "active-conversation-turn",
      transcript: "Keep going in the same turn.",
    });
    expect(steered.status).toBe(200);
    expect(steered.body.turn_id).toBe("active-conversation-turn");
    expect(steered.body.thread_id).toBe(steerThread.thread_id);
    expect(
      getHelixThreadLedgerEvents({
        threadId: steerThread.thread_id,
        turnId: "active-conversation-turn",
      }).some((entry) => entry.item_type === "userMessage"),
    ).toBe(true);

    const rejected = await request(app).post("/api/agi/ask/conversation-turn").send({
      sessionId: "session-review-turn",
      threadId: reviewThread.thread_id,
      steerActiveTurn: true,
      expectedTurnId: "active-review-turn",
      transcript: "Try to steer the review turn.",
    });
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe("active_turn_not_steerable");
    expect(rejected.body.turn_kind).toBe("review");
  }, 20000);
});
