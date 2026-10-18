import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importLedger = () => import("../server/services/helix-thread/ledger");
const importReducer = () => import("../server/services/helix-thread/reducer");
const importProjection = () => import("../server/services/helix-thread/projection");
const importCarryForward = () => import("../server/services/helix-thread/carry-forward");
const importRegistry = () => import("../server/services/helix-thread/registry");

describe("helix thread ledger", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-thread-ledger-"));
    process.env.HELIX_THREAD_LEDGER_PATH = path.join(tempDir, "helix-thread-ledger.jsonl");
    process.env.HELIX_THREAD_INDEX_PATH = path.join(tempDir, "helix-thread-index.json");
    process.env.HELIX_THREAD_PERSIST = "1";
    process.env.HELIX_THREAD_ROTATE_MAX_BYTES = "160";
    process.env.HELIX_THREAD_ROTATE_MAX_FILES = "4";
    process.env.HELIX_ASK_SESSION_PERSIST_PATH = path.join(tempDir, "helix-session-memory.json");
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.HELIX_THREAD_LEDGER_PATH;
    delete process.env.HELIX_THREAD_INDEX_PATH;
    delete process.env.HELIX_THREAD_PERSIST;
    delete process.env.HELIX_THREAD_ROTATE_MAX_BYTES;
    delete process.env.HELIX_THREAD_ROTATE_MAX_FILES;
    delete process.env.HELIX_ASK_SESSION_PERSIST_PATH;
    vi.clearAllMocks();
  });

  it("replays append-only thread history deterministically across restart and preserves legacy parity", async () => {
    const { appendHelixThreadEvent, getHelixThreadLedgerEvents } = await importLedger();
    const { buildHelixThreadTurnsFromEvents, buildRecentTurnsFromHelixThread } =
      await importReducer();
    const { buildLegacyParityTurnsFromHelixThread } = await importProjection();

    const longUser =
      "Verify the turn ledger and keep the replay deterministic across restart boundaries. "
        .repeat(4)
        .trim();
    const longAssistant =
      "I will keep the replay deterministic, preserve citations, and rebuild the prior turns exactly after restart. "
        .repeat(4)
        .trim();

    appendHelixThreadEvent({
      route: "/ask/conversation-turn",
      event_type: "conversation_turn_started",
      turn_id: "thread-turn-1",
      session_id: "thread-session-1",
      trace_id: "trace-thread-1",
      user_text: longUser,
    });
    appendHelixThreadEvent({
      route: "/ask/conversation-turn",
      event_type: "conversation_turn_brief_ready",
      turn_id: "thread-turn-1",
      session_id: "thread-session-1",
      trace_id: "trace-thread-1",
      assistant_text: longAssistant,
      brief_status: "ready",
    });
    appendHelixThreadEvent({
      route: "/ask/conversation-turn",
      event_type: "conversation_turn_completed",
      turn_id: "thread-turn-1",
      session_id: "thread-session-1",
      trace_id: "trace-thread-1",
      assistant_text: longAssistant,
      final_gate_outcome: "dispatch:verify",
    });
    appendHelixThreadEvent({
      route: "/ask",
      event_type: "ask_started",
      turn_id: "thread-turn-2",
      session_id: "thread-session-1",
      trace_id: "trace-thread-2",
      user_text: "Where did the prior answer get the repo evidence and how does replay keep it attached?",
    });
    appendHelixThreadEvent({
      route: "/ask",
      event_type: "ask_failed",
      turn_id: "thread-turn-2",
      session_id: "thread-session-1",
      trace_id: "trace-thread-2",
      fail_reason: "objective_zero_confidence_missing_evidence_linkage",
      final_gate_outcome: "failed:objective_zero_confidence_missing_evidence_linkage",
    });

    const firstEvents = getHelixThreadLedgerEvents({ sessionId: "thread-session-1" });
    const firstReplay = buildHelixThreadTurnsFromEvents(firstEvents);
    const parity = buildLegacyParityTurnsFromHelixThread(firstEvents);

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
        turn_id: "thread-turn-1",
        status: "completed",
        route: "/ask/conversation-turn",
        user_text: longUser,
        assistant_text: longAssistant,
        final_gate_outcome: "dispatch:verify",
        fail_reason: null,
      },
      {
        turn_id: "thread-turn-2",
        status: "failed",
        route: "/ask",
        user_text: "Where did the prior answer get the repo evidence and how does replay keep it attached?",
        assistant_text: null,
        final_gate_outcome: "failed:objective_zero_confidence_missing_evidence_linkage",
        fail_reason: "objective_zero_confidence_missing_evidence_linkage",
      },
    ]);
    expect(
      parity.legacyTurns.map((entry) => ({
        turn_id: entry.turn_id,
        status: entry.status,
        route: entry.route,
      })),
    ).toEqual(
      parity.threadTurns.map((entry) => ({
        turn_id: entry.turn_id,
        status: entry.status,
        route: entry.route,
      })),
    );
    expect(
      buildRecentTurnsFromHelixThread({
        sessionId: "thread-session-1",
        limit: 4,
      }),
    ).toEqual([
      `user: ${longUser}`,
      `dottie: ${longAssistant}`,
    ]);

    vi.resetModules();
    const reloadedLedger = await importLedger();
    const reloadedReducer = await importReducer();
    const secondReplay = reloadedReducer.buildHelixThreadTurnsFromEvents(
      reloadedLedger.getHelixThreadLedgerEvents({ sessionId: "thread-session-1" }),
    );

    expect(secondReplay).toEqual(firstReplay);
    expect(
      fs.readdirSync(tempDir).filter((name) => name.endsWith(".jsonl")).length,
    ).toBeGreaterThan(1);
  });

  it("keeps answer surface and memory citation linkage on ask completion events", async () => {
    const { appendHelixThreadEvent, getHelixThreadLedgerEvents } = await importLedger();

    appendHelixThreadEvent({
      route: "/ask",
      event_type: "ask_started",
      turn_id: "ask-turn-1",
      session_id: "ask-session-1",
      trace_id: "trace-ask-1",
      user_text: "Explain why the answer surface stays conversational.",
    });
    appendHelixThreadEvent({
      route: "/ask",
      event_type: "ask_completed",
      turn_id: "ask-turn-1",
      session_id: "ask-session-1",
      trace_id: "trace-ask-1",
      assistant_text: "It stays conversational because the report scaffolds are kept in metadata and sidecars.",
      final_gate_outcome: "completed",
      answer_surface_mode: "conversational",
      memory_citation: {
        entries: [
          {
            path: "server/routes/agi.plan.ts",
            line_start: 68432,
            line_end: 68716,
            note: "source=evidence_ref; ref=server/routes/agi.plan.ts:L68432-L68716",
          },
        ],
        rollout_ids: ["ask-turn-1"],
      },
    });

    const completed = getHelixThreadLedgerEvents({ sessionId: "ask-session-1" }).at(-1);

    expect(completed?.event_type).toBe("ask_completed");
    expect(completed?.answer_surface_mode).toBe("conversational");
    expect(completed?.memory_citation).toEqual({
      entries: [
        {
          path: "server/routes/agi.plan.ts",
          line_start: 68432,
          line_end: 68716,
          note: "source=evidence_ref; ref=server/routes/agi.plan.ts:L68432-L68716",
        },
      ],
      rollout_ids: ["ask-turn-1"],
    });
  });

  it("centralizes carry-forward writes through the thread adapter", async () => {
    const {
      clearHelixThreadSessionGraphLock,
      getHelixThreadSessionGraphLock,
      getHelixThreadSessionMemory,
      recordHelixThreadCarryForward,
      setHelixThreadSessionGraphLock,
    } = await importCarryForward();

    recordHelixThreadCarryForward({
      sessionId: "carry-forward-session",
      pinnedFiles: ["server/routes/agi.plan.ts", "server/services/helix-thread/ledger.ts"],
      recentTopics: ["thread replay", "citation persistence"],
      graphTreeIds: ["docs/knowledge/warp/warp-mechanics-tree.json"],
      userPrefs: {
        preferredResponseLanguage: "en",
        frontierLensLock: true,
      },
    });

    expect(getHelixThreadSessionMemory("carry-forward-session")).toMatchObject({
      pinnedFiles: ["server/routes/agi.plan.ts", "server/services/helix-thread/ledger.ts"],
      recentTopics: ["thread replay", "citation persistence"],
      graphTreeIds: ["docs/knowledge/warp/warp-mechanics-tree.json"],
      userPrefs: {
        preferredResponseLanguage: "en",
        frontierLensLock: true,
      },
    });

    expect(
      setHelixThreadSessionGraphLock({
        sessionId: "carry-forward-session",
        treeIds: ["docs/knowledge/physics/gr-solver-tree.json"],
        mode: "merge",
      }),
    ).toEqual([
      "docs/knowledge/warp/warp-mechanics-tree.json",
      "docs/knowledge/physics/gr-solver-tree.json",
    ]);
    expect(getHelixThreadSessionGraphLock("carry-forward-session")).toEqual([
      "docs/knowledge/warp/warp-mechanics-tree.json",
      "docs/knowledge/physics/gr-solver-tree.json",
    ]);

    clearHelixThreadSessionGraphLock("carry-forward-session");
    expect(getHelixThreadSessionGraphLock("carry-forward-session")).toEqual([]);
  });

  it("persists explicit thread identity separately from the session mapping", async () => {
    const { startHelixThread, resumeHelixThread, getActiveHelixThreadForSession } =
      await importRegistry();

    const started = startHelixThread({
      sessionId: "explicit-thread-session",
      titlePreview: "Thread identity should outlive the fallback alias.",
    });
    expect(started.thread_id).toMatch(/^thread:/);
    expect(started.session_id).toBe("explicit-thread-session");
    expect(getActiveHelixThreadForSession("explicit-thread-session")).toBe(started.thread_id);

    vi.resetModules();

    const reloadedRegistry = await importRegistry();
    const resumed = reloadedRegistry.resumeHelixThread({
      sessionId: "explicit-thread-session",
    });
    expect(resumed.thread_id).toBe(started.thread_id);
    expect(resumed.session_id).toBe("explicit-thread-session");
  });
});
