import { describe, expect, it, vi } from "vitest";

import {
  applyFastQualityDecisionSummary,
  applyShortCircuitDebugPayload,
  attachFastPathResponseDebugPayload,
  attachFinalResponseObservabilityDebugPayload,
  applyForcedShortCircuitAnswerDebugPayload,
  attachFinalTraceDebugPayload,
  attachTraceSummaryDebugPayload,
  buildTraceSummary,
  type HelixAskTraceEvent,
} from "../server/services/helix-ask/surface/response-debug-payload";

const makeEvent = (overrides: Partial<HelixAskTraceEvent> = {}): HelixAskTraceEvent => ({
  ts: "2026-04-10T00:00:00.000Z",
  tool: "helix.ask.event",
  stage: "retrieval",
  detail: "lookup",
  ok: true,
  durationMs: 120,
  meta: { fn: "buildAskContextFromQueries" },
  ...overrides,
});

describe("helix ask response debug payload", () => {
  it("builds a duration-sorted trace summary from instrumented events", () => {
    const summary = buildTraceSummary([
      makeEvent({ stage: "slow", durationMs: 400 }),
      makeEvent({ stage: "fast", durationMs: 10 }),
      makeEvent({ stage: "skip-no-fn", meta: {} }),
      makeEvent({ stage: "skip-zero", durationMs: 0 }),
    ]);

    expect(summary).toEqual([
      expect.objectContaining({ stage: "slow", durationMs: 400 }),
      expect.objectContaining({ stage: "fast", durationMs: 10 }),
    ]);
  });

  it("attaches live events, trace events, and summary to the debug payload", () => {
    const debugPayload: Record<string, unknown> = {};
    const attachReasoningSidebarToDebug = vi.fn();
    const traceEvents = [makeEvent({ stage: "retrieval" }), makeEvent({ stage: "finalize", durationMs: 220 })];

    attachTraceSummaryDebugPayload({
      debugPayload,
      traceEvents,
      attachReasoningSidebarToDebug,
    });

    expect(debugPayload.live_events).toBe(traceEvents);
    expect(debugPayload.trace_events).toBe(traceEvents);
    expect(debugPayload.trace_summary).toEqual([
      expect.objectContaining({ stage: "finalize", durationMs: 220 }),
      expect.objectContaining({ stage: "retrieval", durationMs: 120 }),
    ]);
    expect(attachReasoningSidebarToDebug).toHaveBeenCalledOnce();
  });

  it("adds stable event fields and journal metadata for the final trace payload", () => {
    const debugPayload: Record<string, unknown> = {};
    const traceEvents = [makeEvent({ stage: "retrieval" }), makeEvent({ stage: "finalize", durationMs: 220 })];
    const attachReasoningSidebarToDebug = vi.fn();

    attachFinalTraceDebugPayload({
      debugPayload,
      captureLiveHistory: true,
      traceEvents,
      buildEventStableFields: () => ({ retrieval_route: "repo" }),
      hashStableJson: () => "stable-hash",
      attachReasoningSidebarToDebug,
      retrievalRoute: "retrieval:repo",
      fallbackDecision: "none",
      contractRendererPath: "unknown",
      gateOutcomes: {
        evidence_gate_ok: true,
        claim_gate_ok: true,
        doc_slot_gate_ok: true,
      },
    });

    expect(debugPayload.trace_summary).toEqual([
      expect.objectContaining({ stage: "finalize", durationMs: 220 }),
      expect.objectContaining({ stage: "retrieval", durationMs: 120 }),
    ]);
    expect(debugPayload.event_stable_fields).toEqual({ retrieval_route: "repo" });
    expect(debugPayload.event_journal).toEqual(
      expect.objectContaining({
        version: "quake_frame_loop_v1",
        replay_parity: true,
        deterministic: true,
        event_count: 2,
        event_hash: "stable-hash",
        stable_fields: { retrieval_route: "repo" },
      }),
    );
    expect(attachReasoningSidebarToDebug).toHaveBeenCalledOnce();
  });

  it("records short-circuit rule metadata and stage05 hard-fail invariants", () => {
    const debugPayload: Record<string, unknown> = {};

    applyShortCircuitDebugPayload({
      debugPayload,
      shouldShortCircuitAnswer: true,
      shortCircuitReason: "forced_answer_hard",
      bypassShortCircuit: false,
      isStage05HardFailForcedRule: true,
    });

    expect(debugPayload.llm_short_circuit_rule).toBe("fallback_answer_short_circuit_v1");
    expect(debugPayload.llm_short_circuit_reason).toBe("forced_answer_hard");
    expect(debugPayload.llm_short_circuit_bypassed).toBe(false);
    expect(debugPayload.stage05_hard_fail_invariant_ok).toBe(true);
    expect(debugPayload.stage05_hard_fail_short_circuit).toBe(true);
  });

  it("packs forced short-circuit answer diagnostics and fast-path observability", () => {
    const debugPayload: Record<string, unknown> = {};
    const attachReasoningSidebarToDebug = vi.fn();
    const traceEvents = [makeEvent({ stage: "retrieval" }), makeEvent({ stage: "finalize", durationMs: 220 })];

    applyForcedShortCircuitAnswerDebugPayload({
      debugPayload,
      answerShortSentences: 2,
      answerShortTokens: 14,
      blocked: true,
      stopReason: "Fail-closed",
    });
    attachFastPathResponseDebugPayload({
      debugPayload,
      forcedFinalText: "Bounded final text",
      answerPath: ["answer:forced", "answer:fast_path_finalize"],
      qualityFloorReasons: ["trimmed"],
      captureLiveHistory: true,
      traceEvents,
      overflowHistory: [{ label: "retry", steps: ["trim"], attempts: 2 }],
      fastQualityMode: true,
      fastQualityDecisions: [
        { stage: "plan", decision: "allow", reason: "ok" },
        { stage: "finalize", decision: "deadline", reason: "timer" },
      ],
      attachReasoningSidebarToDebug,
      clipText: (text) => text,
      answerPreviewChars: 160,
    });

    expect(debugPayload.answer_short_sentences).toBe(2);
    expect(debugPayload.answer_short_tokens).toBe(14);
    expect(debugPayload.answer_stream_mode).toBe("final_only_forced_short_circuit");
    expect(debugPayload.answer_blocked).toBe(true);
    expect(debugPayload.answer_stop_reason).toBe("Fail-closed");
    expect(debugPayload.answer_after_fallback).toBe("Bounded final text");
    expect(debugPayload.answer_final_text).toBe("Bounded final text");
    expect(debugPayload.answer_path).toEqual(["answer:forced", "answer:fast_path_finalize"]);
    expect(debugPayload.answer_extension_available).toBe(false);
    expect(debugPayload.micro_pass).toBe(false);
    expect(debugPayload.answer_quality_floor_applied).toBe(true);
    expect(debugPayload.answer_quality_floor_reasons).toEqual(["trimmed"]);
    expect(debugPayload.trace_summary).toEqual([
      expect.objectContaining({ stage: "finalize", durationMs: 220 }),
      expect.objectContaining({ stage: "retrieval", durationMs: 120 }),
    ]);
    expect(debugPayload.overflow_retry_applied).toBe(true);
    expect(debugPayload.overflow_retry_attempts).toBe(2);
    expect(debugPayload.fast_quality_deadline_misses).toEqual(["finalize:timer"]);
    expect(attachReasoningSidebarToDebug).toHaveBeenCalledOnce();
  });

  it("packs final response observability with journal, overflow, timing, and fail defaults", () => {
    const debugPayload: Record<string, unknown> = {
      timeline: [
        { stage: "retrieval", duration_ms: 12 },
        { name: "finalize", ms: 7 },
      ],
    };
    const attachReasoningSidebarToDebug = vi.fn();
    const attachStageTiming = vi.fn((debugRecord: Record<string, unknown>, key: string, durationMs: number) => {
      const stageTiming = (debugRecord.stage_timing_ms as Record<string, number> | undefined) ?? {};
      debugRecord.stage_timing_ms = { ...stageTiming, [key]: durationMs };
    });

    attachFinalResponseObservabilityDebugPayload({
      debugPayload,
      captureLiveHistory: true,
      traceEvents: [makeEvent({ stage: "retrieval" }), makeEvent({ stage: "finalize", durationMs: 220 })],
      buildEventStableFields: () => ({ retrieval_route: "repo" }),
      hashStableJson: () => "stable-hash",
      attachReasoningSidebarToDebug,
      retrievalRoute: "retrieval:repo",
      fallbackDecision: "none",
      contractRendererPath: "unknown",
      gateOutcomes: {
        evidence_gate_ok: true,
        claim_gate_ok: true,
        doc_slot_gate_ok: true,
      },
      overflowHistory: [{ label: "retry", steps: ["trim"], attempts: 1 }],
      fastQualityMode: true,
      fastQualityDecisions: [{ stage: "finalize", decision: "deadline", reason: "timer" }],
      attachStageTiming,
    });

    expect(debugPayload.event_stable_fields).toEqual({ retrieval_route: "repo" });
    expect(debugPayload.event_journal).toEqual(
      expect.objectContaining({
        version: "quake_frame_loop_v1",
        event_hash: "stable-hash",
        stable_fields: { retrieval_route: "repo" },
      }),
    );
    expect(debugPayload.overflow_retry_applied).toBe(true);
    expect(debugPayload.fast_quality_deadline_misses).toEqual(["finalize:timer"]);
    expect(debugPayload.stage_timing_ms).toEqual({ retrieval: 12, finalize: 7 });
    expect(debugPayload.helix_ask_fail_reason).toBeNull();
    expect(debugPayload.helix_ask_fail_class).toBeNull();
    expect(attachStageTiming).toHaveBeenCalledTimes(2);
    expect(attachReasoningSidebarToDebug).toHaveBeenCalledOnce();
  });

  it("only writes fast-quality decisions when fast mode is enabled", () => {
    const debugPayload: Record<string, unknown> = {};

    applyFastQualityDecisionSummary({
      debugPayload,
      fastQualityMode: false,
      fastQualityDecisions: [{ stage: "finalize", decision: "deadline", reason: "timer" }],
    });

    expect(debugPayload.fast_quality_decisions).toBeUndefined();
    expect(debugPayload.fast_quality_deadline_misses).toBeUndefined();
  });
});
