import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("helix thread request-user-input", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-thread-request-input-"));
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_THREAD_LEDGER_PATH = path.join(tempDir, "helix-thread-ledger.jsonl");
    process.env.HELIX_THREAD_INDEX_PATH = path.join(tempDir, "helix-thread-index.json");
    process.env.HELIX_THREAD_PERSIST = "1";
    llmLocalHandlerMock.mockReset();
    vi.resetModules();
  });

  afterEach(async () => {
    const { __resetHelixThreadLedgerStore } = await import(
      "../server/services/helix-thread/ledger"
    );
    const { __resetHelixThreadRegistryStore } = await import(
      "../server/services/helix-thread/registry"
    );
    __resetHelixThreadLedgerStore();
    __resetHelixThreadRegistryStore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ENABLE_AGI;
    delete process.env.HELIX_THREAD_LEDGER_PATH;
    delete process.env.HELIX_THREAD_INDEX_PATH;
    delete process.env.HELIX_THREAD_PERSIST;
    vi.clearAllMocks();
  });

  it("keeps unresolved request state replayable across restart", async () => {
    const {
      appendHelixThreadServerRequestEvent,
      appendHelixTurnEvent,
    } = await import("../server/services/helix-thread/ledger");
    const {
      startHelixThread,
      updateHelixThreadRecord,
    } = await import("../server/services/helix-thread/registry");
    const { buildHelixThreadState } = await import("../server/services/helix-thread/reducer");

    const thread = startHelixThread({
      sessionId: "request-replay-session",
      titlePreview: "missing input thread",
    });
    updateHelixThreadRecord({
      threadId: thread.thread_id,
      patch: {
        status: "interrupted",
        latest_turn_id: "request-turn-1",
        active_turn_id: "request-turn-1",
      },
    });
    appendHelixTurnEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "turn_started",
      turn_id: "request-turn-1",
      session_id: "request-replay-session",
      trace_id: "request-trace-1",
      turn_kind: "ask",
      thread_status: "active",
    });
    appendHelixThreadServerRequestEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "server_request_created",
      turn_id: "request-turn-1",
      session_id: "request-replay-session",
      trace_id: "request-trace-1",
      turn_kind: "ask",
      request_id: "request-input-1",
      request_kind: "request_user_input",
      request_payload: {
        questions: [{ id: "clarify", text: "Which module should this target?" }],
      },
    });

    expect(
      buildHelixThreadState({ threadId: thread.thread_id }).unresolved_requests.map(
        (entry) => entry.request_id,
      ),
    ).toEqual(["request-input-1"]);

    vi.resetModules();
    const reloadedReducer = await import("../server/services/helix-thread/reducer");
    expect(
      reloadedReducer
        .buildHelixThreadState({ threadId: thread.thread_id })
        .unresolved_requests.map((entry) => entry.request_id),
    ).toEqual(["request-input-1"]);
  });

  it("resolves a pending request into the same active turn when resumeRequestId matches", async () => {
    const {
      appendHelixThreadServerRequestEvent,
      appendHelixTurnEvent,
      getHelixThreadRequests,
    } = await import("../server/services/helix-thread/ledger");
    const {
      startHelixThread,
      updateHelixThreadRecord,
    } = await import("../server/services/helix-thread/registry");

    const thread = startHelixThread({
      sessionId: "request-resume-session",
      titlePreview: "resume request thread",
    });
    updateHelixThreadRecord({
      threadId: thread.thread_id,
      patch: {
        status: "interrupted",
        latest_turn_id: "resume-turn-1",
        active_turn_id: "resume-turn-1",
      },
    });
    appendHelixTurnEvent({
      thread_id: thread.thread_id,
      route: "/ask/conversation-turn",
      event_type: "turn_started",
      turn_id: "resume-turn-1",
      session_id: "request-resume-session",
      trace_id: "resume-trace-seed",
      turn_kind: "conversation_turn",
      thread_status: "active",
    });
    appendHelixThreadServerRequestEvent({
      thread_id: thread.thread_id,
      route: "/ask/conversation-turn",
      event_type: "server_request_created",
      turn_id: "resume-turn-1",
      session_id: "request-resume-session",
      trace_id: "resume-trace-seed",
      turn_kind: "conversation_turn",
      request_id: "resume-request-1",
      request_kind: "request_user_input",
      request_payload: {
        questions: [{ id: "clarify", text: "What should I continue from?" }],
      },
    });

    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.76,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Resumed follow-up detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am resuming the same paused turn with your new detail.",
        }),
      });

    const app = await buildApp();
    const response = await request(app).post("/api/agi/ask/conversation-turn").send({
      sessionId: "request-resume-session",
      threadId: thread.thread_id,
      expectedTurnId: "resume-turn-1",
      resumeRequestId: "resume-request-1",
      transcript: "Continue from the warp-module side.",
    });

    expect(response.status).toBe(200);
    expect(response.body.thread_id).toBe(thread.thread_id);
    expect(response.body.turn_id).toBe("resume-turn-1");
    expect(getHelixThreadRequests({ threadId: thread.thread_id, unresolvedOnly: true })).toEqual([]);
  }, 20000);
});

