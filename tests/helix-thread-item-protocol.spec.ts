import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importLedger = () => import("../server/services/helix-thread/ledger");
const importReducer = () => import("../server/services/helix-thread/reducer");
const importRegistry = () => import("../server/services/helix-thread/registry");

describe("helix thread item protocol", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-thread-items-"));
    process.env.HELIX_THREAD_LEDGER_PATH = path.join(tempDir, "helix-thread-ledger.jsonl");
    process.env.HELIX_THREAD_INDEX_PATH = path.join(tempDir, "helix-thread-index.json");
    process.env.HELIX_THREAD_PERSIST = "1";
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.HELIX_THREAD_LEDGER_PATH;
    delete process.env.HELIX_THREAD_INDEX_PATH;
    delete process.env.HELIX_THREAD_PERSIST;
    vi.clearAllMocks();
  });

  it("replays ordered turn items while keeping recent-turn continuity answer-only", async () => {
    const {
      appendHelixThreadLifecycleEvent,
      appendHelixThreadItemEvent,
      appendHelixTurnEvent,
    } = await importLedger();
    const {
      buildHelixThreadExecutionView,
      buildHelixTurnState,
      buildRecentTurnsFromHelixThread,
    } = await importReducer();
    const { startHelixThread } = await importRegistry();

    const thread = startHelixThread({
      sessionId: "item-protocol-session",
      titlePreview: "item protocol thread",
    });

    appendHelixThreadLifecycleEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "thread_started",
      turn_id: "item-turn-1",
      session_id: "item-protocol-session",
      trace_id: "item-trace-1",
      thread_status: "active",
      turn_kind: "ask",
    });
    appendHelixTurnEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "turn_started",
      turn_id: "item-turn-1",
      session_id: "item-protocol-session",
      trace_id: "item-trace-1",
      thread_status: "active",
      turn_kind: "ask",
    });

    const appendCompletedItem = (
      itemId: string,
      itemType:
        | "userMessage"
        | "plan"
        | "retrieval"
        | "validation"
        | "answer",
      text: string,
      extra?: Record<string, unknown>,
    ) => {
      appendHelixThreadItemEvent({
        thread_id: thread.thread_id,
        route: "/ask",
        event_type: "item_started",
        turn_id: "item-turn-1",
        session_id: "item-protocol-session",
        trace_id: "item-trace-1",
        turn_kind: "ask",
        item_id: itemId,
        item_type: itemType,
        item_status: "in_progress",
      });
      appendHelixThreadItemEvent({
        thread_id: thread.thread_id,
        route: "/ask",
        event_type: "item_delta",
        turn_id: "item-turn-1",
        session_id: "item-protocol-session",
        trace_id: "item-trace-1",
        turn_kind: "ask",
        item_id: itemId,
        item_type: itemType,
        item_status: "in_progress",
        delta_text: text,
        ...extra,
      });
      appendHelixThreadItemEvent({
        thread_id: thread.thread_id,
        route: "/ask",
        event_type: "item_completed",
        turn_id: "item-turn-1",
        session_id: "item-protocol-session",
        trace_id: "item-trace-1",
        turn_kind: "ask",
        item_id: itemId,
        item_type: itemType,
        item_status: "completed",
        user_text: itemType === "userMessage" ? text : null,
        assistant_text: itemType === "answer" ? text : null,
        ...extra,
      });
    };

    appendCompletedItem("item-user", "userMessage", "Why does the replay keep plan chatter hidden?");
    appendCompletedItem("item-plan", "plan", "family=repo_technical strategy=direct_answer");
    appendCompletedItem("item-retrieval", "retrieval", "docs/helix-ask-readiness-debug-loop.md", {
      observation_ref: {
        path: "docs/helix-ask-readiness-debug-loop.md",
        line_start: 1,
        line_end: 24,
        note: "retrieval_span",
      },
    });
    appendCompletedItem("item-validation", "validation", "objective_finalize=strict_covered");
    appendCompletedItem(
      "item-answer",
      "answer",
      "The replay keeps plan chatter hidden by projecting only user and final answer items into continuity.",
      {
        source_item_ids: ["item-retrieval"],
        claim_links: [
          {
            claim_id: "answer:item-turn-1",
            source_item_ids: ["item-retrieval"],
          },
        ],
      },
    );

    appendHelixTurnEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "turn_completed",
      turn_id: "item-turn-1",
      session_id: "item-protocol-session",
      trace_id: "item-trace-1",
      thread_status: "idle",
      turn_kind: "ask",
      final_gate_outcome: "completed",
    });

    const turnState = buildHelixTurnState({
      threadId: thread.thread_id,
      turnId: "item-turn-1",
    });
    const executionView = buildHelixThreadExecutionView({
      threadId: thread.thread_id,
      turnId: "item-turn-1",
    });

    expect(turnState?.items.map((item) => item.item_type)).toEqual([
      "userMessage",
      "plan",
      "retrieval",
      "validation",
      "answer",
    ]);
    expect(executionView?.plan_items).toHaveLength(1);
    expect(executionView?.retrieval_items).toHaveLength(1);
    expect(executionView?.validation_items).toHaveLength(1);
    expect(executionView?.answer_items).toHaveLength(1);
    expect(
      buildRecentTurnsFromHelixThread({
        threadId: thread.thread_id,
        limit: 4,
      }),
    ).toEqual([
      "user: Why does the replay keep plan chatter hidden?",
      "dottie: The replay keeps plan chatter hidden by projecting only user and final answer items into continuity.",
    ]);
  });

  it("reconstructs citation lineage from observation items after restart", async () => {
    const {
      appendHelixThreadItemEvent,
      appendHelixTurnEvent,
    } = await importLedger();
    const { buildHelixThreadCitationView } = await importReducer();
    const { startHelixThread } = await importRegistry();

    const thread = startHelixThread({
      sessionId: "citation-lineage-session",
      titlePreview: "citation lineage",
    });

    appendHelixTurnEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "turn_started",
      turn_id: "citation-turn-1",
      session_id: "citation-lineage-session",
      trace_id: "citation-trace-1",
      turn_kind: "ask",
      thread_status: "active",
    });
    appendHelixThreadItemEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "item_completed",
      turn_id: "citation-turn-1",
      session_id: "citation-lineage-session",
      trace_id: "citation-trace-1",
      turn_kind: "ask",
      item_id: "obs-1",
      item_type: "toolObservation",
      item_status: "completed",
      observation_ref: {
        path: "server/routes/agi.plan.ts",
        line_start: 68442,
        line_end: 68716,
        note: "source=evidence_ref",
      },
    });
    appendHelixThreadItemEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "item_completed",
      turn_id: "citation-turn-1",
      session_id: "citation-lineage-session",
      trace_id: "citation-trace-1",
      turn_kind: "ask",
      item_id: "answer-1",
      item_type: "answer",
      item_status: "completed",
      assistant_text: "The final answer now derives its compatibility citation from observation lineage.",
      source_item_ids: ["obs-1"],
      claim_links: [
        {
          claim_id: "claim:answer-1",
          source_item_ids: ["obs-1"],
        },
      ],
    });
    appendHelixTurnEvent({
      thread_id: thread.thread_id,
      route: "/ask",
      event_type: "turn_completed",
      turn_id: "citation-turn-1",
      session_id: "citation-lineage-session",
      trace_id: "citation-trace-1",
      turn_kind: "ask",
      thread_status: "idle",
    });

    vi.resetModules();

    const reloadedReducer = await importReducer();
    const citationView = reloadedReducer.buildHelixThreadCitationView({
      threadId: thread.thread_id,
      turnId: "citation-turn-1",
    });

    expect(citationView?.source_item_ids).toEqual(["obs-1"]);
    expect(citationView?.memory_citation).toEqual({
      entries: [
        {
          path: "server/routes/agi.plan.ts",
          line_start: 68442,
          line_end: 68716,
          note: "source=evidence_ref",
        },
      ],
      rollout_ids: ["citation-turn-1"],
    });
  });
});

