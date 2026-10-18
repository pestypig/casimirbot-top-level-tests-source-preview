import { describe, expect, it } from "vitest";

import {
  appendObjectiveRetrievalProbe,
  appendObjectiveStepTranscript,
  applyObjectiveAnswerPlanShadowDebugPayload,
  applyObjectiveComposerShadowDebugPayload,
  applyObjectiveLoopReportTailDebugPayload,
  applyObjectivePlanStreamSeedDebugPayload,
  applyObjectiveTurnContractDebugPayload,
  createObjectivePromptRewriteTelemetry,
  HELIX_ASK_OBJECTIVE_LOOP_PATCH_REVISION,
  OBJECTIVE_SCOPED_RETRIEVAL_PASS_MAX,
  recordObjectivePromptRewriteStage,
} from "../server/services/helix-ask/surface/objective-report-tail-debug";

describe("helix ask objective report tail debug", () => {
  it("records prompt rewrite telemetry and clips transcript and retrieval probe logs", () => {
    const telemetry = createObjectivePromptRewriteTelemetry();
    recordObjectivePromptRewriteStage(telemetry, "mini_synth", {
      applied: true,
      effectiveHash: "hash-a",
      effectiveTokenEstimate: 111,
      rewrittenHash: "hash-b",
      rewrittenTokenEstimate: 222,
    }, 333);

    expect(telemetry.applied.mini_synth).toBe(true);
    expect(telemetry.promptHashes.mini_synth).toBe("hash-a");
    expect(telemetry.tokenEstimates.mini_synth).toBe(111);
    expect(telemetry.promptBudgets.mini_synth).toBe(333);
    expect(telemetry.shadowPromptHashes.mini_synth).toBe("hash-b");
    expect(telemetry.shadowTokenEstimates.mini_synth).toBe(222);

    const transcripts = Array.from({ length: 170 }, (_, index) => ({
      objective_id: `o-${index + 1}`,
      attempt: 1,
      verb: "PLAN" as const,
      phase: "turn" as const,
      started_at: `start-${index + 1}`,
      ended_at: `end-${index + 1}`,
      decision: `decision-${index + 1}`,
    })).reduce(
      (acc, entry) => appendObjectiveStepTranscript({ transcripts: acc, entry }),
      [] as Array<Record<string, unknown>>,
    );
    expect(transcripts).toHaveLength(160);
    expect(transcripts[0]?.objective_id).toBe("o-11");

    let retrievalLogs = {
      objectiveRetrievalQueriesLog: [] as Array<Record<string, unknown>>,
      objectiveRetrievalSelectedFilesLog: [] as Array<Record<string, unknown>>,
      objectiveRetrievalConfidenceDeltaLog: [] as Array<Record<string, unknown>>,
    };
    for (let index = 0; index < OBJECTIVE_SCOPED_RETRIEVAL_PASS_MAX + 6; index += 1) {
      retrievalLogs = appendObjectiveRetrievalProbe({
        ...retrievalLogs,
        objectiveId: `o-${index + 1}`,
        queries: [`q-${index + 1}`],
        files: [`f-${index + 1}`],
        before: index,
        after: index + 0.5,
        currentPassCount: index + 1,
      });
    }
    expect(retrievalLogs.objectiveRetrievalQueriesLog).toHaveLength(
      OBJECTIVE_SCOPED_RETRIEVAL_PASS_MAX,
    );
    expect(retrievalLogs.objectiveRetrievalSelectedFilesLog).toHaveLength(
      OBJECTIVE_SCOPED_RETRIEVAL_PASS_MAX,
    );
    expect(retrievalLogs.objectiveRetrievalConfidenceDeltaLog).toHaveLength(
      OBJECTIVE_SCOPED_RETRIEVAL_PASS_MAX,
    );
  });

  it("packs turn-contract, plan-stream, and answer-plan-shadow objective debug fields", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveTurnContractDebugPayload({
      debugPayload,
      helixIntentPolicyEnvelope: {
        prompt_family: "repo",
        prompt_specificity: "high",
        requires_code_floor: true,
        requires_doc_floor: false,
        clarify_allowed_pre_lock: false,
        lock_required_for_family: true,
        budget_profile: "deep",
        allow_two_pass: true,
        allow_retrieval_retry: true,
        question_fingerprint: "fp-1",
      },
      requiresRepoEvidence: true,
      helixTurnContract: {
        planner: { valid: true, mode: "deterministic", source: "planner" },
        goal: "trace the route",
        grounding_mode: "repo",
        output_family: "implementation_code_path",
        objectives: [{ id: "o-1" }, { id: "o-2" }],
        required_slots: ["code_path", "mechanism"],
        query_hints: ["server/routes/agi.plan.ts"],
        risk_flags: ["long_context"],
        obligations: [
          {
            id: "obl-1",
            label: "Where in repo",
            kind: "repo",
            required: true,
            required_slots: ["code_path"],
          },
        ],
      },
      helixTurnContractHash: "hash-123",
      helixTurnRetrievalPlan: {
        depth_budget: 3,
        diversity_budget: 2,
        connectivity_budget: 1,
        must_include: ["server/routes/agi.plan.ts"],
        query_count: 4,
      },
      promptResearchRetrievalContract: {
        must_read_paths: ["docs/helix-ask-flow.md"],
        precedence_paths: ["server/routes/agi.plan.ts"],
        expansion_rule: "adjacent",
        missing_required_paths: [],
        unreadable_required_paths: [],
      },
      retrievalScope: "repo",
    });

    applyObjectivePlanStreamSeedDebugPayload({
      debugPayload,
      objectivePlanSeedLabels: ["State sync", "Evidence checks"],
      objectiveSeedDraft: "State sync | Evidence checks",
      fallbackQuestionSeed: "fallback seed",
    });

    applyObjectiveAnswerPlanShadowDebugPayload({
      debugPayload,
      answerPlanShadow: {
        prompt_family: "roadmap_planning",
        evidence_pack: {
          evidence_hash: "evidence-hash",
          slot_missing: ["code_path"],
          evidence_gap: true,
          objective_support: [{ objective: "State sync" }],
          obligation_coverage: [
            { status: "covered", label: "Covered" },
            { status: "missing", label: "Missing" },
          ],
          obligation_evidence: ["server/routes/agi.plan.ts"],
          evidence_blocks: ["block-a", "block-b"],
        },
        sections: [
          {
            id: "summary",
            title: "Summary",
            kind: "answer",
            coverage_status: "covered",
            obligation_ids: ["obl-1"],
          },
        ],
      },
      validatedAfterEnforce: { anchor_integrity_violations: [] },
      helixTurnContractHash: "hash-123",
      helixTurnContract: {
        planner: { valid: true, mode: "deterministic", source: "planner" },
        goal: "trace the route",
        grounding_mode: "repo",
        output_family: "implementation_code_path",
        objectives: [{ id: "o-1" }, { id: "o-2" }],
        required_slots: [],
        query_hints: [],
        risk_flags: [],
        obligations: [
          {
            id: "obl-1",
            label: "Where in repo",
            kind: "repo",
            required: true,
            required_slots: ["code_path"],
          },
        ],
      },
      evidenceGap: true,
      openWorldBypassMode: "off",
      intentDomain: "repo",
      composerV2FallbackReason: null,
      composerSoftEnforceAction: null,
      answerPlanValidationShadowDegradeReason: null,
    });

    expect(debugPayload.policy_prompt_family).toBe("repo");
    expect(debugPayload.objective_count).toBe(2);
    expect(debugPayload.objective_plan_stream_seed_labels).toEqual([
      "State sync",
      "Evidence checks",
    ]);
    expect(debugPayload.answer_obligations_missing).toEqual(["Missing"]);
    expect(debugPayload.answer_mode).toBe("partial_roadmap");
    expect(debugPayload.anchor_integrity_ok).toBe(true);
  });

  it("packs composer shadow and answer-plan diagnostics", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveComposerShadowDebugPayload({
      debugPayload,
      answerPlanShadow: {
        profile_id: "profile-a",
        profile_version: "v1",
        prompt_family: "roadmap_planning",
        prompt_specificity: "high",
        degrade_path_id: "degrade-a",
        selection_lock: {
          lock_id: "lock-1",
          selector_locked: true,
          selector_primary_key: "roadmap",
          selector_family: "repo",
        },
        evidence_pack: {
          evidence_hash: "evidence-hash",
          slot_missing: ["code_path"],
          evidence_gap: true,
          objective_support: [{ objective: "State sync" }],
          obligation_coverage: [{ status: "missing", label: "Missing" }],
          obligation_evidence: ["server/routes/agi.plan.ts"],
          evidence_blocks: ["block-a"],
        },
        sections: [
          {
            id: "summary",
            title: "Summary",
            kind: "answer",
            coverage_status: "partial",
            obligation_ids: ["obl-1"],
          },
        ],
      },
      answerPlanValidationShadow: {
        fail_reasons: ["shadow_fail"],
        sections_present: 2,
        required_section_count: 3,
        required_section_present_count: 2,
        family_format_accuracy: 0.5,
        degrade_reason: "shadow_degrade",
      },
      validatedAfterEnforce: {
        schema_valid: false,
        fail_reasons: ["validator_fail"],
        sections_present: 2,
        required_section_count: 3,
        required_section_present_count: 2,
        family_format_accuracy: 0.66,
        anchor_integrity_violations: ["anchor_miss"],
        debug_leak_hits: ["debug_leak"],
        placeholder_section_count: 1,
        degraded: true,
        degrade_reason: "validator_degrade",
      },
      promptResearchValidationAfter: {
        fail_reasons: ["prompt_research_fail"],
        missing_verbatim_constraints: ["constraint-a"],
        missing_required_sections: ["section-a"],
        missing_support_sections: ["support-a"],
        missing_provenance_columns: ["column-a"],
        placeholder_hits: ["placeholder-a"],
      },
      promptResearchRepairActions: ["append_sectional_compose_sections"],
      hardComposerGuardTriggered: false,
      softSectionGuardTriggered: true,
      composerSoftObserveRewriteApplied: false,
      deterministicPreserveBlocked: false,
      softSectionGuardEscalatedEnforce: false,
      gateMode: "observe",
      softSectionGuardEligible: true,
      softSectionGuardObserved: true,
      softSectionGuardObserveSkipped: false,
      composerSoftObserveReason: "observe_reason",
      composerSoftHardGuardReason: null,
      composerSoftEnforceTriggerReason: "soft_guard",
      composerSoftEnforceAction: "rewrite",
      composerFamilyDegradeSuppressed: true,
      composerFamilyDegradeSuppressedReason: "suppressed",
      objectiveLoopPrimaryComposerGuard: true,
      composerV2Enabled: true,
      composerV2Applied: true,
      composerV2BriefSource: "digest",
      composerV2EvidenceDigestSource: "repo",
      composerV2EvidenceDigestClaimCount: 3,
      composerV2HandoffSource: "shadow",
      composerV2HandoffBlockCount: 2,
      composerV2HandoffChars: 120,
      composerV2HandoffTruncated: false,
      composerV2ClaimCounts: { total: 4 },
      composerV2PreLinkFailReasons: ["pre_fail"],
      composerV2PostLinkFailReasons: ["post_fail"],
      composerV2RepairAttempted: true,
      composerV2FallbackReason: "fallback",
      composerV2ExpandCharCount: 250,
      composerV2ExpandRawPreview: "expand-preview",
      composerV2RepairCharCount: 150,
      composerV2RepairRawPreview: "repair-preview",
      composerV2ExpandAttempts: 2,
      composerV2RepairAttempts: 1,
      composerV2ExpandTransientRetries: 1,
      composerV2RepairSkippedDueToExpandError: false,
      composerV2ExpandErrorCode: "none",
      composerV2ProjectionApplied: true,
      composerV2BestAttemptStage: "repair",
      composerV2ProjectionRegressionGuard: {
        triggered: true,
        hard: false,
        mode: "observe",
        retrieval_healthy: true,
        llm_healthy: false,
        reasons: ["projection_guard"],
      },
      helixTurnContractHash: "hash-123",
      helixTurnContract: {
        planner: { valid: true, mode: "deterministic", source: "planner" },
        goal: "trace the route",
        grounding_mode: "repo",
        output_family: "implementation_code_path",
        objectives: [{ id: "o-1" }],
        required_slots: [],
        query_hints: [],
        risk_flags: [],
        obligations: [
          {
            id: "obl-1",
            label: "Where in repo",
            kind: "repo",
            required: true,
            required_slots: ["code_path"],
          },
        ],
      },
      evidenceGap: true,
      openWorldBypassMode: "off",
      intentDomain: "repo",
    });

    expect(debugPayload.composer_shadow_enabled).toBe(true);
    expect(debugPayload.composer_profile_id).toBe("profile-a");
    expect(debugPayload.composer_soft_enforce_effective_mode).toBe("enforce");
    expect(debugPayload.composer_v2_projection_guard_triggered).toBe(true);
    expect(debugPayload.composer_selection_lock_id).toBe("lock-1");
    expect(debugPayload.prompt_research_validation_failures).toEqual(["prompt_research_fail"]);
    expect(debugPayload.answer_validation_failures).toEqual([
      "validator_fail",
      "prompt_research_fail",
    ]);
    expect(debugPayload.answer_mode).toBe("partial_roadmap");
  });

  it("applies the objective loop report-tail sync payload", () => {
    const debugPayload: Record<string, unknown> = {
      answer_obligations_missing: ["Missing obligation"],
      composer_validation_fail_reasons: ["validator_fail"],
    };
    const promptRewriteTelemetry = createObjectivePromptRewriteTelemetry();
    recordObjectivePromptRewriteStage(promptRewriteTelemetry, "assembly", {
      applied: true,
      effectiveHash: "assembly-hash",
      effectiveTokenEstimate: 200,
      rewrittenHash: "shadow-hash",
      rewrittenTokenEstimate: 220,
    });

    applyObjectiveLoopReportTailDebugPayload({
      debugPayload,
      objectiveLoopEnabled: true,
      objectiveLoopState: [
        {
          objective_id: "o-1",
          objective_label: "State sync",
          required_slots: ["code_path"],
          matched_slots: ["code_path"],
          status: "complete",
          attempt: 1,
          retrieval_confidence: 0.9,
        },
      ],
      objectiveTransitionLog: [
        { objective_id: "o-1", from: null, to: "pending", reason: "initialized", at: "t0" },
        { objective_id: "o-1", from: "pending", to: "complete", reason: "done", at: "t1" },
      ],
      objectiveStepTranscripts: [
        {
          objective_id: "o-1",
          attempt: 1,
          verb: "PLAN",
          phase: "turn",
          started_at: "t0",
          ended_at: "t1",
          llm_model: "gpt-test",
          decision: "initialized",
        },
      ],
      objectivePromptRewriteMode: "on",
      objectivePromptRewriteTelemetry: promptRewriteTelemetry,
      objectiveMiniAnswers: [
        {
          objective_id: "o-1",
          objective_label: "State sync",
          status: "covered",
          matched_slots: ["code_path"],
          missing_slots: [],
          evidence_refs: ["server/routes/agi.plan.ts"],
          summary: "Covered.",
        },
      ],
      objectiveMiniValidation: {
        total: 1,
        covered: 1,
        partial: 0,
        blocked: 0,
        unresolved: 0,
      },
      objectiveUnknownBlockObjectiveIds: [],
      objectiveUnresolvedWithoutUnknownBlockIds: [],
      objectiveMissingScopedRetrievalCount: 0,
      objectiveOesScores: [
        {
          objective_id: "o-1",
          score: 0.9,
          threshold: 0.75,
          pass: true,
          slot_ratio: 1,
          evidence_ref_count: 1,
          retrieval_confidence: 0.9,
          status: "covered",
          reason: "enough evidence",
        },
      ],
      objectiveTerminalizationReasons: {},
      objectiveRetrievalPasses: [],
      objectiveRetrievalQueriesLog: [],
      objectiveRetrievalSelectedFilesLog: [],
      objectiveRetrievalConfidenceDeltaLog: [],
      objectiveRetrievalExhausted: false,
      objectiveRetrieveProposalMode: "llm",
      objectiveRetrieveProposalLlmAttempted: true,
      objectiveRetrieveProposalLlmInvoked: true,
      objectiveRetrieveProposalFailReason: null,
      objectiveRetrieveProposalPromptPreview: "proposal prompt",
      objectiveRetrieveProposalAppliedCount: 1,
      objectiveRetrieveProposalRepairAttempted: false,
      objectiveRetrieveProposalRepairSuccess: false,
      objectiveRetrieveProposalRepairFailReason: null,
      objectiveRecoveryNoContextRetryableCount: 0,
      objectiveRecoveryNoContextTerminalCount: 0,
      objectiveRecoveryErrorRetryableCount: 0,
      objectiveRecoveryErrorTerminalCount: 0,
      objectiveMiniSynthMode: "llm",
      objectiveMiniSynthLlmAttempted: true,
      objectiveMiniSynthLlmInvoked: true,
      objectiveMiniSynthFailReason: null,
      objectiveMiniSynthPromptPreview: "synth prompt",
      objectiveMiniSynthRepairAttempted: false,
      objectiveMiniSynthRepairSuccess: false,
      objectiveMiniSynthRepairFailReason: null,
      objectiveMiniCriticMode: "llm",
      objectiveMiniCriticLlmAttempted: true,
      objectiveMiniCriticLlmInvoked: true,
      objectiveMiniCriticFailReason: null,
      objectiveMiniCriticPromptPreview: "critic prompt",
      objectiveMiniCriticRepairAttempted: false,
      objectiveMiniCriticRepairSuccess: false,
      objectiveMiniCriticRepairFailReason: null,
      objectiveAssemblyMode: "llm",
      objectiveAssemblyFailReason: null,
      objectiveAssemblyBlockedReason: null,
      objectiveAssemblyLlmAttempted: true,
      objectiveAssemblyLlmInvoked: true,
      objectiveAssemblyPromptPreview: "assembly prompt",
      objectiveAssemblyRescuePromptPreview: null,
      objectiveAssemblyRescueAttempted: false,
      objectiveAssemblyRescueSuccess: false,
      objectiveAssemblyRescueFailReason: null,
      objectiveAssemblyRepairAttempted: false,
      objectiveAssemblyRepairSuccess: false,
      objectiveAssemblyRepairFailReason: null,
      objectiveAssemblyRescueRepairAttempted: false,
      objectiveAssemblyRescueRepairSuccess: false,
      objectiveAssemblyRescueRepairFailReason: null,
      objectiveAssemblyWeakRejectCount: 0,
      routingSalvageApplied: true,
      routingSalvageReason: "added retrieval",
      routingSalvageRetrievalAddedCount: 2,
      normalizeText: (value) => value,
    });

    expect(debugPayload.objective_loop_patch_revision).toBe(
      HELIX_ASK_OBJECTIVE_LOOP_PATCH_REVISION,
    );
    expect(debugPayload.objective_prompt_rewrite_stage_applied).toEqual({
      assembly: true,
    });
    expect(debugPayload.objective_finalize_gate_mode).toBe("strict_covered");
    expect(debugPayload.objective_reasoning_trace).toBeTruthy();
    expect(debugPayload.objective_step_transcript_count).toBe(1);
    expect(debugPayload.routing_salvage_applied).toBe(true);
  });
});
