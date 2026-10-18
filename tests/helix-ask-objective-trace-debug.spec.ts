import { describe, expect, it } from "vitest";

import { applyObjectiveTraceDebugPayload } from "../server/services/helix-ask/surface/objective-trace-debug";

describe("helix ask objective trace debug", () => {
  it("copies bounded trace and telemetry fields into the debug payload", () => {
    const debugPayload: Record<string, unknown> = {};
    const objectiveReasoningTrace = Array.from({ length: 15 }, (_, index) => ({
      step: index + 1,
      label: `trace-${index + 1}`,
    }));
    const objectiveTelemetryUsed = {
      version: "v1",
      objective_finalize_gate_mode: "repair",
    };
    const stepTranscripts = [
      { step: 1, complete: true },
      { step: 2, complete: false },
      { step: 3, complete: true },
    ];

    applyObjectiveTraceDebugPayload({
      debugPayload,
      objectiveReasoningTrace,
      objectiveTelemetryUsed,
      stepTranscripts,
      llmStepCount: 2,
      expectedLlmStepCount: 3,
      transcriptCompleteCount: 2,
      routingSalvageApplied: true,
      routingSalvageReason: "added scoped retrieval",
      routingSalvageRetrievalAddedCount: 4,
    });

    expect(debugPayload.objective_reasoning_trace).toEqual(objectiveReasoningTrace.slice(0, 12));
    expect(debugPayload.objective_telemetry_used).toBe(objectiveTelemetryUsed);
    expect(debugPayload.objective_step_transcripts).toBe(stepTranscripts);
    expect(debugPayload.objective_step_transcript_count).toBe(3);
    expect(debugPayload.objective_step_llm_call_count).toBe(2);
    expect(debugPayload.per_step_llm_call_rate).toBe(0.6667);
    expect(debugPayload.transcript_completeness_rate).toBe(0.6667);
    expect(debugPayload.routing_salvage_applied).toBe(true);
    expect(debugPayload.routing_salvage_reason).toBe("added scoped retrieval");
    expect(debugPayload.routing_salvage_retrieval_added_count).toBe(4);
  });

  it("returns zero ratios when the denominators are empty or invalid", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveTraceDebugPayload({
      debugPayload,
      objectiveReasoningTrace: [],
      objectiveTelemetryUsed: { version: "v1" },
      stepTranscripts: [],
      llmStepCount: 5,
      expectedLlmStepCount: 0,
      transcriptCompleteCount: 3,
      routingSalvageApplied: false,
      routingSalvageReason: null,
      routingSalvageRetrievalAddedCount: 0,
    });

    expect(debugPayload.per_step_llm_call_rate).toBe(0);
    expect(debugPayload.transcript_completeness_rate).toBe(0);
    expect(debugPayload.objective_reasoning_trace).toEqual([]);
    expect(debugPayload.objective_step_transcript_count).toBe(0);
  });
});
