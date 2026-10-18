import { describe, expect, it } from "vitest";

import {
  applyHelixAskObjectiveCoverageSnapshotRuntime,
  applyHelixAskObjectiveCoverageSnapshot,
  beginHelixAskObjectiveRetrievalPass,
  buildHelixAskObjectiveLoopState,
  buildHelixAskObjectivePlainReasoningTrace,
  finalizeHelixAskObjectiveLoopRuntime,
  finalizeHelixAskObjectiveLoopState,
  initializeHelixAskObjectiveLoopRuntime,
  rebuildHelixAskObjectiveLoopStateFromContract,
  reconcileHelixAskObjectiveLoopFromSupport,
  setHelixAskObjectiveLoopPhase,
  type HelixAskObjectiveMiniAnswer,
  type HelixAskObjectiveStepTranscript,
  type HelixAskObjectiveTransition,
} from "../server/services/helix-ask/objectives/objective-loop-debug";

describe("objective-loop-debug", () => {
  it("builds objective loop state with contract fallback slots", () => {
    const states = buildHelixAskObjectiveLoopState(
      {
        required_slots: ["Docs Path", "Runtime Flag"],
        objectives: [{ label: "Explain fast mode deadlines" }],
      },
      {
        slugifySectionId: (value, fallback) =>
          value ? value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : fallback,
      },
    );

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      objective_id: "explain-fast-mode-deadlines",
      required_slots: ["docs-path", "runtime-flag"],
      matched_slots: [],
      status: "pending",
    });
  });

  it("transitions covered objectives into synthesizing and final complete", () => {
    const transitions: HelixAskObjectiveTransition[] = [];
    const [covered] = applyHelixAskObjectiveCoverageSnapshot({
      states: [
        {
          objective_id: "objective_1",
          objective_label: "Explain fast mode deadlines",
          required_slots: ["docs-path"],
          matched_slots: [],
          status: "retrieving",
          attempt: 1,
        },
      ],
      coveredSlots: ["docs-path"],
      retrievalConfidence: 0.92,
      transitionLog: transitions,
    });

    expect(covered.status).toBe("synthesizing");
    expect(covered.matched_slots).toEqual(["docs-path"]);
    expect(transitions.at(-1)).toMatchObject({
      objective_id: "objective_1",
      to: "synthesizing",
    });

    const [finalized] = finalizeHelixAskObjectiveLoopState({
      states: [covered],
      validationPassed: true,
      transitionLog: transitions,
    });

    expect(finalized.status).toBe("complete");
    expect(finalized.ended_at).toBeTruthy();
    expect(transitions.at(-1)).toMatchObject({
      objective_id: "objective_1",
      to: "complete",
      reason: "objective_finalize_complete",
    });
  });

  it("renders plain reasoning traces from mini answers, transitions, and critic steps", () => {
    const miniAnswers: HelixAskObjectiveMiniAnswer[] = [
      {
        objective_id: "objective_1",
        objective_label: "Explain fast mode deadlines",
        status: "partial",
        matched_slots: ["docs-path"],
        missing_slots: ["runtime-flag"],
        evidence_refs: ["docs/helix-ask-reasoning-ladder-research-report.md"],
        summary: "Need the runtime flag path to close the answer.",
        unknown_block: {
          unknown: "runtime flag source",
          why: "The current evidence only covers docs.",
          what_i_checked: ["docs/helix-ask-reasoning-ladder-research-report.md"],
          next_retrieval: "Search runtime config files for fast quality toggles.",
        },
      },
    ];
    const stepTranscripts: HelixAskObjectiveStepTranscript[] = [
      {
        objective_id: "objective_1",
        attempt: 1,
        verb: "MINI_CRITIC",
        phase: "objective_loop",
        started_at: "2026-04-10T00:00:00.000Z",
        ended_at: "2026-04-10T00:00:01.000Z",
        decision: "critic",
        decision_reason: "runtime-flag still missing",
      },
    ];
    const transitions: HelixAskObjectiveTransition[] = [
      {
        objective_id: "objective_1",
        from: "pending",
        to: "retrieving",
        reason: "initial_retrieval",
        at: "2026-04-10T00:00:00.000Z",
      },
      {
        objective_id: "objective_1",
        from: "retrieving",
        to: "synthesizing",
        reason: "objective_coverage_satisfied",
        at: "2026-04-10T00:00:02.000Z",
      },
    ];
    const traces = buildHelixAskObjectivePlainReasoningTrace({
      miniAnswers,
      states: [
        {
          objective_id: "objective_1",
          objective_label: "Explain fast mode deadlines",
          required_slots: ["docs-path", "runtime-flag"],
          matched_slots: ["docs-path"],
          status: "blocked",
          attempt: 1,
          blocked_reason: "missing_required_slots",
          retrieval_confidence: 0.5,
        },
      ],
      scores: [
        {
          objective_id: "objective_1",
          score: 0.61,
          threshold: 0.75,
          pass: false,
          slot_ratio: 0.5,
          evidence_ref_count: 1,
          linked_evidence_ref_count: 1,
          retrieval_confidence: 0.5,
          status: "partial",
          reason: "objective_oes_below_threshold",
        },
      ],
      transitions,
      stepTranscripts,
      retrievalQueries: [{ objective_id: "objective_1" }, { objective_id: "objective_1" }],
      terminalizationReasons: { objective_1: "objective_unresolved" },
      normalizeText: (value, maxChars) => value.replace(/\s+/g, " ").trim().slice(0, maxChars),
    });

    expect(traces).toHaveLength(1);
    expect(traces[0].plain_reasoning).toContain("Status partial.");
    expect(traces[0].plain_reasoning).toContain("Mini-critic reason: runtime-flag still missing.");
    expect(traces[0].plain_reasoning).toContain("Objective-scoped retrieval passes observed: 2.");
    expect(traces[0].used_telemetry.retrieval_pass_count).toBe(2);
    expect(traces[0].transition_tail).toEqual([
      "pending -> retrieving (initial_retrieval)",
      "retrieving -> synthesizing (objective_coverage_satisfied)",
    ]);
  });

  it("begins retrieval passes and updates coverage snapshots with pass metadata", () => {
    const begun = beginHelixAskObjectiveRetrievalPass({
      objectiveLoopEnabled: true,
      objectiveLoopState: [
        {
          objective_id: "objective_1",
          objective_label: "Explain fast mode deadlines",
          required_slots: ["docs-path"],
          matched_slots: [],
          status: "pending",
          attempt: 0,
        },
      ],
      objectiveTransitionLog: [],
      objectiveRetrievalPasses: [],
      retrievalConfidence: 0.25,
      reason: "initial_retrieval",
      queries: ["fast quality mode deadlines"],
      objectiveTransitionLogMax: 16,
      objectiveRetrievalPassLogMax: 8,
      at: "2026-04-10T00:00:00.000Z",
    });

    expect(begun.objectiveLoopState[0]).toMatchObject({
      status: "retrieving",
      attempt: 1,
    });
    expect(begun.objectiveTransitionLog.at(-1)).toMatchObject({
      objective_id: "objective_1",
      to: "retrieving",
      reason: "initial_retrieval",
    });
    expect(begun.objectiveRetrievalPasses[0]).toMatchObject({
      pass_index: 1,
      query_count: 1,
      retrieval_confidence_before: 0.25,
      retrieval_confidence_after: 0.25,
      exhausted: true,
    });

    const covered = applyHelixAskObjectiveCoverageSnapshotRuntime({
      objectiveLoopEnabled: true,
      objectiveLoopState: begun.objectiveLoopState,
      objectiveTransitionLog: begun.objectiveTransitionLog,
      objectiveRetrievalPasses: begun.objectiveRetrievalPasses,
      coveredSlots: ["docs-path"],
      reason: "objective_coverage_satisfied",
      files: ["docs/helix-ask-reasoning-ladder-research-report.md"],
      retrievalConfidence: 0.9,
    });

    expect(covered.objectiveLoopState[0]).toMatchObject({
      status: "synthesizing",
      matched_slots: ["docs-path"],
      retrieval_confidence: 0.9,
    });
    expect(covered.objectiveTransitionLog.at(-1)).toMatchObject({
      objective_id: "objective_1",
      to: "synthesizing",
    });
    expect(covered.objectiveRetrievalPasses[0]).toMatchObject({
      selected_files_count: 1,
      selected_files: ["docs/helix-ask-reasoning-ladder-research-report.md"],
      retrieval_confidence_after: 0.9,
      exhausted: true,
    });
  });

  it("reconciles support, advances phases, and finalizes loop runtime", () => {
    const reconciled = reconcileHelixAskObjectiveLoopFromSupport({
      objectiveLoopEnabled: true,
      objectiveLoopState: [
        {
          objective_id: "objective_1",
          objective_label: "Explain fast mode deadlines",
          required_slots: ["docs-path"],
          matched_slots: [],
          status: "pending",
          attempt: 0,
        },
      ],
      objectiveTransitionLog: [],
      objectiveSupport: [
        {
          objective: "Explain fast mode deadlines",
          supported: true,
          matched_slots: ["docs-path"],
        },
      ],
      objectiveTransitionLogMax: 16,
    });

    expect(reconciled.objectiveLoopState[0]).toMatchObject({
      status: "synthesizing",
      matched_slots: ["docs-path"],
    });

    const phased = setHelixAskObjectiveLoopPhase({
      objectiveLoopEnabled: true,
      objectiveLoopState: reconciled.objectiveLoopState,
      objectiveTransitionLog: reconciled.objectiveTransitionLog,
      nextStatus: "critiqued",
      reason: "mini_critic_complete",
      objectiveTransitionLogMax: 16,
    });

    expect(phased.objectiveLoopState[0].status).toBe("critiqued");

    const finalized = finalizeHelixAskObjectiveLoopRuntime({
      objectiveLoopEnabled: true,
      objectiveLoopState: phased.objectiveLoopState,
      objectiveTransitionLog: phased.objectiveTransitionLog,
      validationPassed: false,
      failReason: "quality_gate_fail",
      objectiveTransitionLogMax: 16,
    });

    expect(finalized.objectiveLoopState[0]).toMatchObject({
      status: "blocked",
      blocked_reason: "quality_gate_fail",
    });
    expect(finalized.objectiveRetrievalExhausted).toBe(false);
    expect(finalized.objectiveTransitionLog.at(-1)).toMatchObject({
      objective_id: "objective_1",
      to: "blocked",
      reason: "quality_gate_fail",
    });
  });

  it("initializes plan transcript and rebuilds loop state from the turn contract", () => {
    const states = buildHelixAskObjectiveLoopState(
      {
        required_slots: ["Docs Path"],
        objectives: [{ label: "Explain fast mode deadlines" }],
      },
      {
        slugifySectionId: (value, fallback) =>
          value ? value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : fallback,
      },
    );

    const initialized = initializeHelixAskObjectiveLoopRuntime({
      objectiveLoopEnabled: true,
      objectiveLoopState: states,
      baseQuestion: "How does fast quality mode alter answer generation deadlines?",
      llmModel: "gpt-4o-mini",
      clipText: (value, maxChars) => value.slice(0, maxChars),
    });

    expect(initialized.objectiveTransitionLog).toHaveLength(1);
    expect(initialized.planTranscript).toMatchObject({
      objective_id: "explain-fast-mode-deadlines",
      decision: "plan_initialized",
      schema_name: "helix.ask.plan.v2",
    });

    const rebuilt = rebuildHelixAskObjectiveLoopStateFromContract({
      objectiveLoopEnabled: true,
      objectiveLoopState: [
        {
          objective_id: "explain-fast-mode-deadlines",
          objective_label: "Explain fast mode deadlines",
          required_slots: ["docs-path", "runtime-flag"],
          matched_slots: ["docs-path"],
          status: "retrieving",
          attempt: 1,
          started_at: "2026-04-10T00:00:00.000Z",
          retrieval_confidence: 0.5,
        },
      ],
      objectiveTransitionLog: initialized.objectiveTransitionLog,
      contract: {
        required_slots: ["Docs Path", "Runtime Flag"],
        objectives: [
          { label: "Explain fast mode deadlines" },
          { label: "Summarize failover paths" },
        ],
      },
      slugifySectionId: (value, fallback) =>
        value ? value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : fallback,
      objectiveTransitionLogMax: 16,
      at: "2026-04-10T00:00:00.000Z",
    });

    expect(rebuilt.objectiveLoopState[0]).toMatchObject({
      matched_slots: ["docs-path"],
      status: "retrieving",
      attempt: 1,
      retrieval_confidence: 0.5,
    });
    expect(rebuilt.objectiveLoopState[1]).toMatchObject({
      objective_id: "summarize-failover-paths",
      status: "pending",
      required_slots: ["docs-path", "runtime-flag"],
    });
    expect(rebuilt.objectiveTransitionLog.at(-1)).toMatchObject({
      objective_id: "summarize-failover-paths",
      to: "pending",
      reason: "contract_rebuild",
    });
  });
});
