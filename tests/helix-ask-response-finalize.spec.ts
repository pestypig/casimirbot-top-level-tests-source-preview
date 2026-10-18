import { describe, expect, it, vi } from "vitest";

import {
  attachFinalTraceDebugPayload,
  attachOverflowRetryDebugPayload,
  buildFinalResponsePayload,
} from "../server/services/helix-ask/surface/response-debug-payload";
import {
  applyFinalFailureClassification,
  buildFinalResponseObservability,
} from "../server/services/helix-ask/surface/response-finalize";

describe("helix ask response finalize helpers", () => {
  it("applies strict concept fail classification before strict ready fail classification", () => {
    const result: Record<string, unknown> = {};

    applyFinalFailureClassification({
      result,
      strictConceptFailReason: "CONCEPT_FAIL",
      strictReadyFailReason: "READY_FAIL",
    });

    expect(result.fail_reason).toBe("CONCEPT_FAIL");
    expect(result.fail_class).toBe("input_contract");
  });

  it("builds final response observability payload from proof and arbiter context", () => {
    const verificationMeta = { verdict: "PASS", certificateHash: "abc", integrity_ok: true };
    const epistemicMeta = { claim_tier: "bounded" };
    const intentMeta = { intent_id: "repo.technical" };

    const built = buildFinalResponseObservability({
      result: {
        proof: {
          verdict: "PASS",
          certificate: { certificateHash: "abc", integrityOk: true },
        },
      },
      debugPayload: { arbiter_mode: "proof" },
      arbiterAnswerArtifacts: {
        claim_tier: "bounded",
        provenance_class: "repo",
        certifying: true,
      },
      strictReadyFailReason: null,
      buildConvergenceVerificationMeta: () => verificationMeta,
      buildConvergenceEpistemicMeta: () => epistemicMeta,
      buildConvergenceIntentMeta: () => intentMeta,
    });

    expect(built.finalProofRecord?.verdict).toBe("PASS");
    expect(built.finalVerificationMeta).toBe(verificationMeta);
    expect(built.epistemicMeta).toBe(epistemicMeta);
    expect(built.intentMeta).toBe(intentMeta);
  });
});

describe("helix ask response debug payload helpers", () => {
  it("attaches final trace journal fields and reasoning sidebar", () => {
    const debugPayload: Record<string, unknown> = {};
    const attachReasoningSidebarToDebug = vi.fn();
    const traceEvents = [
      {
        ts: "2026-04-11T00:00:00.000Z",
        tool: "helix.ask.event",
        stage: "answer",
        detail: "finalize",
        ok: true,
        durationMs: 45,
        meta: { fn: "finalizeHelixAskAnswerSurface" },
      },
    ];

    attachFinalTraceDebugPayload({
      debugPayload,
      captureLiveHistory: true,
      traceEvents,
      buildEventStableFields: () => ({ stable: true }),
      hashStableJson: () => "hash123",
      attachReasoningSidebarToDebug,
      retrievalRoute: "retrieval:repo",
      fallbackDecision: "none",
      contractRendererPath: "qualityFloor:deterministic_contract",
      gateOutcomes: {
        evidence_gate_ok: true,
        claim_gate_ok: true,
        doc_slot_gate_ok: false,
      },
    });

    expect(debugPayload.live_events).toEqual(traceEvents);
    expect(debugPayload.trace_summary).toEqual([
      expect.objectContaining({ stage: "answer", durationMs: 45 }),
    ]);
    expect(debugPayload.event_journal).toEqual({
      version: "quake_frame_loop_v1",
      replay_parity: true,
      deterministic: true,
      event_count: 1,
      event_hash: "hash123",
      stable_fields: { stable: true },
    });
    expect(attachReasoningSidebarToDebug).toHaveBeenCalledOnce();
  });

  it("attaches overflow retry metadata", () => {
    const debugPayload: Record<string, unknown> = {};

    attachOverflowRetryDebugPayload({
      debugPayload,
      overflowHistory: [
        { label: "retryA", steps: ["a", "b"], attempts: 1 },
        { label: "retryB", steps: ["b", "c"], attempts: 2 },
      ],
    });

    expect(debugPayload.overflow_retry_applied).toBe(true);
    expect(debugPayload.overflow_retry_steps).toEqual(["a", "b", "c"]);
    expect(debugPayload.overflow_retry_labels).toEqual(["retryA", "retryB"]);
    expect(debugPayload.overflow_retry_attempts).toBe(3);
  });

  it("builds final response payload and attaches context capsule", () => {
    const attachContextCapsuleToResult = vi.fn();

    const payload = buildFinalResponsePayload({
      result: { ok: true, text: "answer" },
      debugPayload: { debug_key: "value" },
      finalText: "answer",
      attachContextCapsuleToResult,
    });

    expect(payload).toEqual({
      ok: true,
      text: "answer",
      debug: { debug_key: "value" },
    });
    expect(attachContextCapsuleToResult).toHaveBeenCalledWith(payload, "answer");
  });
});
