import { describe, expect, it } from "vitest";

import type { HelixAskTraceEvent } from "../server/services/helix-ask/surface/response-debug-payload";
import {
  attachHelixAskReasoningTheaterStateToDebug,
  buildHelixAskReasoningTheaterStateFromDebug,
} from "../server/services/helix-ask/surface/reasoning-theater-state";

describe("helix ask reasoning theater state", () => {
  it("derives deterministic state from debug telemetry and trace events", () => {
    const traceEvents: HelixAskTraceEvent[] = [
      {
        ts: "2026-04-10T00:00:00.000Z",
        tool: "helix.ask.event",
        stage: "Routing prior",
        detail: "intent profile selected",
        durationMs: 20,
      },
      {
        ts: "2026-04-10T00:00:01.000Z",
        tool: "helix.ask.event",
        stage: "Retrieval",
        detail: "repo search",
        durationMs: 145,
      },
      {
        ts: "2026-04-10T00:00:02.000Z",
        tool: "helix.ask.event",
        stage: "Verify proof",
        detail: "verdict=PASS",
        durationMs: 40,
        meta: {
          verification: {
            proof_verdict: "PASS",
            certificate_integrity_ok: true,
          },
        },
      },
    ];
    const debugRecord: Record<string, unknown> = {
      trace_id: "trace-123",
      evidence_gate_ok: true,
      coverage_ratio: 0.88,
      evidence_claim_ratio: 0.9,
      belief_unsupported_rate: 0.1,
      belief_contradictions: 0,
      ambiguity_terms: ["scope", "runtime"],
      alignment_gate_decision: "PASS",
      graph_congruence_diagnostics: {
        allowedEdges: 12,
        blockedEdges: 3,
        resolvedInTreeEdges: 8,
        resolvedCrossTreeEdges: 6,
      },
    };

    const state = buildHelixAskReasoningTheaterStateFromDebug({
      debugRecord,
      traceEvents,
    });

    expect(state.contract_version).toBe("reasoning_theater.v1");
    expect(state.trace_id).toBe("trace-123");
    expect(state.phase).toBe("verify");
    expect(state.telemetry.proof_verdict).toBe("PASS");
    expect(state.telemetry.certificate_integrity_ok).toBe(true);
    expect(state.stance).not.toBe("fail_closed");
    expect(state.indices.momentum).toBeGreaterThan(0.4);
    expect(state.indices.ambiguity_pressure).toBeLessThan(0.45);
    expect(state.scenario_id).toMatch(/^[a-f0-9]{16}$/);
    expect(Number.isInteger(state.seed)).toBe(true);
  });

  it("forces fail_closed when certificate integrity fails", () => {
    const traceEvents: HelixAskTraceEvent[] = [
      {
        ts: "2026-04-10T00:00:03.000Z",
        tool: "helix.ask.event",
        stage: "Verify proof",
        detail: "verdict=FAIL",
      },
    ];
    const debugRecord: Record<string, unknown> = {
      trace_id: "trace-fail",
      evidence_gate_ok: true,
      coverage_ratio: 0.92,
      evidence_claim_ratio: 0.94,
      belief_unsupported_rate: 0.03,
      belief_contradictions: 0,
      proof_verdict: "PASS",
      certificate_integrity_ok: false,
    };

    const state = buildHelixAskReasoningTheaterStateFromDebug({
      debugRecord,
      traceEvents,
    });

    expect(state.stance).toBe("fail_closed");
    expect(state.telemetry.certificate_integrity_ok).toBe(false);
  });

  it("attaches state onto debug payload", () => {
    const debugRecord: Record<string, unknown> = {
      trace_id: "trace-attach",
      coverage_ratio: 0.6,
      evidence_claim_ratio: 0.55,
      belief_unsupported_rate: 0.3,
      belief_contradictions: 1,
      ambiguity_terms: ["unknown"],
    };
    const traceEvents: HelixAskTraceEvent[] = [
      {
        ts: "2026-04-10T00:00:00.000Z",
        tool: "helix.ask.event",
        stage: "Finalization",
        detail: "response_ready",
      },
    ];

    attachHelixAskReasoningTheaterStateToDebug({
      debugRecord,
      traceEvents,
    });

    expect(debugRecord.reasoning_theater_state_v1).toEqual(
      expect.objectContaining({
        contract_version: "reasoning_theater.v1",
        trace_id: "trace-attach",
        telemetry: expect.any(Object),
        indices: expect.any(Object),
      }),
    );
  });
});
