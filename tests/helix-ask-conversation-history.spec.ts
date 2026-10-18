import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importConversationHistory = () =>
  import("../server/services/helix-ask/conversation-history");

describe("helix ask conversation history", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-ask-conversation-history-"));
    process.env.HELIX_ASK_CONVERSATION_HISTORY_AUDIT_PATH = path.join(
      tempDir,
      "helix-conversation-history.jsonl",
    );
    process.env.HELIX_ASK_CONVERSATION_HISTORY_PERSIST = "1";
    process.env.HELIX_ASK_CONVERSATION_HISTORY_ROTATE_MAX_BYTES = "120";
    process.env.HELIX_ASK_CONVERSATION_HISTORY_ROTATE_MAX_FILES = "4";
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.HELIX_ASK_CONVERSATION_HISTORY_AUDIT_PATH;
    delete process.env.HELIX_ASK_CONVERSATION_HISTORY_PERSIST;
    delete process.env.HELIX_ASK_CONVERSATION_HISTORY_ROTATE_MAX_BYTES;
    delete process.env.HELIX_ASK_CONVERSATION_HISTORY_ROTATE_MAX_FILES;
    vi.clearAllMocks();
  });

  it("replays append-only turn history deterministically across restart", async () => {
    const history = await importConversationHistory();
    const longUser =
      "Verify the constraint pack and keep the citations linked across the replay boundary. ".repeat(4).trim();
    const longAssistant =
      "I will verify it, preserve the repo evidence trail, and keep the prior turn reconstructable after restart. "
        .repeat(4)
        .trim();
    history.appendConversationHistoryEvent({
      route: "/ask/conversation-turn",
      event_type: "conversation_turn_started",
      turn_id: "turn-1",
      session_id: "session-1",
      trace_id: "trace-1",
      user_text: longUser,
    });
    history.appendConversationHistoryEvent({
      route: "/ask/conversation-turn",
      event_type: "conversation_turn_brief_ready",
      turn_id: "turn-1",
      session_id: "session-1",
      trace_id: "trace-1",
      assistant_text: longAssistant,
      brief_status: "ready",
    });
    history.appendConversationHistoryEvent({
      route: "/ask/conversation-turn",
      event_type: "conversation_turn_completed",
      turn_id: "turn-1",
      session_id: "session-1",
      trace_id: "trace-1",
      assistant_text: longAssistant,
      final_gate_outcome: "dispatch:verify",
    });
    history.appendConversationHistoryEvent({
      route: "/ask",
      event_type: "ask_started",
      turn_id: "turn-2",
      session_id: "session-1",
      trace_id: "trace-2",
      user_text: "Where did the last answer get that evidence and why was it not linked?",
    });
    history.appendConversationHistoryEvent({
      route: "/ask",
      event_type: "ask_failed",
      turn_id: "turn-2",
      session_id: "session-1",
      trace_id: "trace-2",
      fail_reason: "objective_zero_confidence_missing_evidence_linkage",
      final_gate_outcome: "failed:objective_zero_confidence_missing_evidence_linkage",
    });

    const firstReplay = history.buildConversationTurnsFromEvents(
      history.getConversationHistoryEvents({ sessionId: "session-1" }),
    );
    expect(
      firstReplay.map((entry) => ({
        turn_id: entry.turn_id,
        status: entry.status,
        route: entry.route,
        user_text: entry.user_text,
        assistant_text: entry.assistant_text,
        final_gate_outcome: entry.final_gate_outcome,
        fail_reason: entry.fail_reason,
      })),
    ).toEqual([
      {
        turn_id: "turn-1",
        status: "completed",
        route: "/ask/conversation-turn",
        user_text: longUser,
        assistant_text: longAssistant,
        final_gate_outcome: "dispatch:verify",
        fail_reason: null,
      },
      {
        turn_id: "turn-2",
        status: "failed",
        route: "/ask",
        user_text: "Where did the last answer get that evidence and why was it not linked?",
        assistant_text: null,
        final_gate_outcome: "failed:objective_zero_confidence_missing_evidence_linkage",
        fail_reason: "objective_zero_confidence_missing_evidence_linkage",
      },
    ]);

    vi.resetModules();
    const reloaded = await importConversationHistory();
    const secondReplay = reloaded.buildConversationTurnsFromEvents(
      reloaded.getConversationHistoryEvents({ sessionId: "session-1" }),
    );

    expect(secondReplay).toEqual(firstReplay);
    expect(
      fs.readdirSync(tempDir).filter((name) => name.endsWith(".jsonl")).length,
    ).toBeGreaterThan(1);
  });

  it("builds structured memory citation entries linked to evidence refs", async () => {
    const { buildHelixAskMemoryCitation } = await importConversationHistory();
    const citation = buildHelixAskMemoryCitation({
      evidenceRefs: [
        "server/routes/agi.plan.ts:L66390-L66413",
        "docs/helix-ask-flow.md",
        "server/routes/agi.plan.ts:L66390-L66413",
      ],
      rolloutIds: ["trace-verify-1", "turn-verify-1", "trace-verify-1"],
    });

    expect(citation).toEqual({
      entries: [
        {
          path: "server/routes/agi.plan.ts",
          line_start: 66390,
          line_end: 66413,
          note: "source=evidence_ref; ref=server/routes/agi.plan.ts:L66390-L66413",
        },
        {
          path: "docs/helix-ask-flow.md",
          line_start: null,
          line_end: null,
          note: "source=evidence_ref; ref=docs/helix-ask-flow.md",
        },
      ],
      rollout_ids: ["trace-verify-1", "turn-verify-1"],
    });
  });
});
