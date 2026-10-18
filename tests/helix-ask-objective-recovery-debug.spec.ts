import { describe, expect, it } from "vitest";

import { applyObjectiveRecoveryDebugPayload } from "../server/services/helix-ask/surface/objective-recovery-debug";

describe("helix ask objective recovery debug", () => {
  it("clips retrieval history and copies proposal/recovery fields", () => {
    const debugPayload: Record<string, unknown> = {};
    const objectiveRetrievalPasses = Array.from({ length: 30 }, (_, index) => ({ pass: index + 1 }));
    const objectiveRetrievalQueriesLog = Array.from({ length: 30 }, (_, index) => ({ query: `q-${index + 1}` }));
    const objectiveRetrievalSelectedFilesLog = Array.from({ length: 30 }, (_, index) => ({ file: `f-${index + 1}` }));
    const objectiveRetrievalConfidenceDeltaLog = Array.from({ length: 30 }, (_, index) => ({ delta: index + 1 }));

    applyObjectiveRecoveryDebugPayload({
      debugPayload,
      objectiveRetrievalPasses,
      objectiveRetrievalQueriesLog,
      objectiveRetrievalSelectedFilesLog,
      objectiveRetrievalConfidenceDeltaLog,
      objectiveRetrievalExhausted: true,
      objectiveRetrieveProposalMode: "llm",
      objectiveRetrieveProposalLlmAttempted: true,
      objectiveRetrieveProposalLlmInvoked: true,
      objectiveRetrieveProposalFailReason: "none",
      objectiveRetrieveProposalPromptPreview: "proposal prompt",
      objectiveRetrieveProposalAppliedCount: 3,
      objectiveRetrieveProposalRepairAttempted: true,
      objectiveRetrieveProposalRepairSuccess: false,
      objectiveRetrieveProposalRepairFailReason: "timeout",
      objectiveRecoveryNoContextRetryableCount: 2,
      objectiveRecoveryNoContextTerminalCount: 1,
      objectiveRecoveryErrorRetryableCount: 4,
      objectiveRecoveryErrorTerminalCount: 3,
    });

    expect(debugPayload.objective_retrieval_passes).toEqual(objectiveRetrievalPasses.slice(-24));
    expect(debugPayload.objective_retrieval_queries).toEqual(objectiveRetrievalQueriesLog.slice(-24));
    expect(debugPayload.objective_retrieval_selected_files).toEqual(
      objectiveRetrievalSelectedFilesLog.slice(-24),
    );
    expect(debugPayload.objective_retrieval_confidence_delta).toEqual(
      objectiveRetrievalConfidenceDeltaLog.slice(-24),
    );
    expect(debugPayload.objective_retrieval_exhausted).toBe(true);
    expect(debugPayload.objective_retrieve_proposal_mode).toBe("llm");
    expect(debugPayload.objective_retrieve_proposal_applied_count).toBe(3);
    expect(debugPayload.objective_retrieve_proposal_repair_fail_reason).toBe("timeout");
    expect(debugPayload.objective_recovery_no_context_retryable_count).toBe(2);
    expect(debugPayload.objective_recovery_error_terminal_count).toBe(3);
  });
});
