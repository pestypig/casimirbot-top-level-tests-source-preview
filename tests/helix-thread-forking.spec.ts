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

describe("helix thread forking", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-thread-forking-"));
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

  it("forks visible history into a new thread without inheriting an active parent turn as completed", async () => {
    const {
      appendHelixThreadItemEvent,
      appendHelixTurnEvent,
    } = await import("../server/services/helix-thread/ledger");
    const {
      startHelixThread,
      updateHelixThreadRecord,
    } = await import("../server/services/helix-thread/registry");
    const { buildHelixThreadState } = await import("../server/services/helix-thread/reducer");

    const appendCompletedItem = (args: {
      threadId: string;
      turnId: string;
      traceId: string;
      text: string;
      itemType: "userMessage" | "answer";
    }) => {
      appendHelixThreadItemEvent({
        thread_id: args.threadId,
        route: "/ask/conversation-turn",
        event_type: "item_started",
        turn_id: args.turnId,
        session_id: "fork-parent-session",
        trace_id: args.traceId,
        turn_kind: "conversation_turn",
        item_id: `${args.turnId}:${args.itemType}`,
        item_type: args.itemType,
        item_status: "in_progress",
      });
      appendHelixThreadItemEvent({
        thread_id: args.threadId,
        route: "/ask/conversation-turn",
        event_type: "item_completed",
        turn_id: args.turnId,
        session_id: "fork-parent-session",
        trace_id: args.traceId,
        turn_kind: "conversation_turn",
        item_id: `${args.turnId}:${args.itemType}`,
        item_type: args.itemType,
        item_status: "completed",
        user_text: args.itemType === "userMessage" ? args.text : null,
        assistant_text: args.itemType === "answer" ? args.text : null,
      });
    };

    const parent = startHelixThread({
      sessionId: "fork-parent-session",
      titlePreview: "parent thread",
    });
    updateHelixThreadRecord({
      threadId: parent.thread_id,
      patch: {
        status: "active",
        latest_turn_id: "parent-turn-active",
        active_turn_id: "parent-turn-active",
      },
    });

    appendHelixTurnEvent({
      thread_id: parent.thread_id,
      route: "/ask/conversation-turn",
      event_type: "turn_started",
      turn_id: "parent-turn-complete",
      session_id: "fork-parent-session",
      trace_id: "parent-trace-1",
      turn_kind: "conversation_turn",
      thread_status: "active",
    });
    appendCompletedItem({
      threadId: parent.thread_id,
      turnId: "parent-turn-complete",
      traceId: "parent-trace-1",
      itemType: "userMessage",
      text: "Keep this completed history visible in the fork.",
    });
    appendCompletedItem({
      threadId: parent.thread_id,
      turnId: "parent-turn-complete",
      traceId: "parent-trace-1",
      itemType: "answer",
      text: "The completed turn should appear in the child thread.",
    });
    appendHelixTurnEvent({
      thread_id: parent.thread_id,
      route: "/ask/conversation-turn",
      event_type: "turn_completed",
      turn_id: "parent-turn-complete",
      session_id: "fork-parent-session",
      trace_id: "parent-trace-1",
      turn_kind: "conversation_turn",
      thread_status: "idle",
    });

    appendHelixTurnEvent({
      thread_id: parent.thread_id,
      route: "/ask/conversation-turn",
      event_type: "turn_started",
      turn_id: "parent-turn-active",
      session_id: "fork-parent-session",
      trace_id: "parent-trace-2",
      turn_kind: "conversation_turn",
      thread_status: "active",
    });
    appendCompletedItem({
      threadId: parent.thread_id,
      turnId: "parent-turn-active",
      traceId: "parent-trace-2",
      itemType: "userMessage",
      text: "This active turn should not look completed in the fork.",
    });

    llmLocalHandlerMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: "observe",
          confidence: 0.8,
          dispatch_hint: true,
          clarify_needed: false,
          reason: "Fork follow-up detected.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          brief: "I am branching from the prior thread without inheriting the active suffix as completed.",
        }),
      });

    const app = await buildApp();
    const response = await request(app).post("/api/agi/ask/conversation-turn").send({
      sessionId: "fork-child-session",
      threadForkFromId: parent.thread_id,
      traceId: "fork-trace-1",
      transcript: "Create a child thread from that history.",
    });

    expect(response.status).toBe(200);
    expect(response.body.thread_id).not.toBe(parent.thread_id);

    const childState = buildHelixThreadState({ threadId: response.body.thread_id });
    expect(childState.turns.map((turn) => turn.status)).toContain("completed");
    expect(childState.turns.map((turn) => turn.status)).toContain("interrupted");
    expect(
      childState.turns.some(
        (turn) =>
          turn.source_thread_id === parent.thread_id &&
          turn.source_turn_id === "parent-turn-active" &&
          turn.status === "interrupted",
      ),
    ).toBe(true);
    expect(
      childState.turns.some(
        (turn) =>
          turn.source_thread_id === parent.thread_id &&
          turn.source_turn_id === "parent-turn-complete" &&
          turn.status === "completed",
      ),
    ).toBe(true);
    expect(buildHelixThreadState({ threadId: parent.thread_id }).latest_turn_id).toBe(
      "parent-turn-active",
    );
  }, 20000);
});
