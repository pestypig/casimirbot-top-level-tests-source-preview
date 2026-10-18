import { describe, expect, it } from "vitest";

import {
  buildHelixAskObjectiveScopedRecoveryEscalationHints,
  buildHelixAskObjectiveScopedRecoveryQueryVariants,
  collectHelixAskObjectiveIdsWithoutScopedRetrievalPass,
  collectHelixAskObjectiveScopedRetrievalRecoveryTargets,
  computeHelixAskObjectiveScopedRecoveryMaxAttempts,
  enforceHelixAskObjectiveScopedRetrievalRequirementForMiniAnswers,
  shouldBypassHelixAskObjectiveScopedRetrievalAgentGate,
} from "../server/services/helix-ask/retrieval/objective-scoped-recovery";

describe("helix ask objective retrieval recovery", () => {
  it("allows exactly one baseline bypass when the agent gate is blocked", () => {
    expect(
      shouldBypassHelixAskObjectiveScopedRetrievalAgentGate({
        canAgentAct: false,
        objectiveAttempt: 0,
        objectiveHasPriorRetrievalPass: false,
      }),
    ).toBe(true);
    expect(
      shouldBypassHelixAskObjectiveScopedRetrievalAgentGate({
        canAgentAct: false,
        objectiveAttempt: 1,
        objectiveHasPriorRetrievalPass: false,
      }),
    ).toBe(false);
  });

  it("selects unresolved objectives without retrieval passes for recovery", () => {
    const targets = collectHelixAskObjectiveScopedRetrievalRecoveryTargets({
      states: [
        {
          objective_id: "obj_1",
          objective_label: "first objective",
          required_slots: ["definition"],
          matched_slots: [],
          status: "pending" as const,
          attempt: 0,
        },
        {
          objective_id: "obj_2",
          objective_label: "second objective",
          required_slots: ["mechanism"],
          matched_slots: [],
          status: "retrieving" as const,
          attempt: 1,
        },
        {
          objective_id: "obj_3",
          objective_label: "third objective",
          required_slots: ["repo-mapping"],
          matched_slots: ["repo-mapping"],
          status: "complete" as const,
          attempt: 1,
        },
      ],
      retrievalQueries: [{ objective_id: "obj_2" }],
      maxObjectives: 4,
    });

    expect(targets.map((entry) => entry.objective_id)).toEqual(["obj_1"]);
  });

  it("builds bounded escalation hints and diversified query variants", () => {
    const hints = buildHelixAskObjectiveScopedRecoveryEscalationHints({
      objectiveLabel: "casimir tile mechanism in full solve congruence",
      missingSlots: ["mechanism", "code-path"],
      priorEvidenceRefs: ["docs/casimir-tile-mechanism.md", "modules/warp/warp-module.ts"],
      maxHints: 6,
    });
    const variants = buildHelixAskObjectiveScopedRecoveryQueryVariants({
      baseQuestion: "what is a casimir tile in the full solve congruence",
      primaryQueries: [
        "what is a casimir tile in the full solve congruence",
        "casimir tile mechanism",
      ],
      objectiveLabel: "casimir tile in full solve congruence",
      missingSlots: ["mechanism", "code-path"],
      maxQueries: 8,
      maxVariants: 2,
    });

    expect(computeHelixAskObjectiveScopedRecoveryMaxAttempts({
      missingSlots: ["mechanism", "code-path"],
      routingSalvageEligible: false,
    })).toBe(3);
    expect(hints.length).toBeLessThanOrEqual(6);
    expect(hints.join(" ").toLowerCase()).toContain("mechanism");
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants.length).toBeLessThanOrEqual(2);
  });

  it("forces partial coverage when scoped retrieval is missing", () => {
    const ids = collectHelixAskObjectiveIdsWithoutScopedRetrievalPass({
      states: [
        {
          objective_id: "obj_pending",
          objective_label: "pending objective",
          required_slots: ["mechanism"],
          matched_slots: [],
          status: "pending" as const,
          attempt: 0,
        },
      ],
      retrievalQueries: [],
      unresolvedOnly: true,
      maxObjectives: 4,
    });
    const enforced = enforceHelixAskObjectiveScopedRetrievalRequirementForMiniAnswers({
      miniAnswers: [
        {
          objective_id: "obj_pending",
          objective_label: "pending objective",
          status: "covered" as const,
          matched_slots: ["definition"],
          missing_slots: [],
          evidence_refs: ["docs/knowledge/warp/warp-bubble.md"],
          summary: "pending objective: covered.",
        },
      ],
      states: [
        {
          objective_id: "obj_pending",
          objective_label: "pending objective",
          required_slots: ["definition", "mechanism"],
          matched_slots: ["definition"],
          status: "pending" as const,
          attempt: 0,
        },
      ],
      retrievalQueries: [],
      maxObjectives: 4,
    });

    expect(ids).toEqual(["obj_pending"]);
    expect(enforced.missingObjectiveIds).toEqual(["obj_pending"]);
    expect(enforced.miniAnswers[0]?.status).toBe("partial");
    expect(enforced.miniAnswers[0]?.missing_slots).toEqual(expect.arrayContaining(["mechanism"]));
  });

  it("does not require scoped retrieval for definition-only objectives", () => {
    const ids = collectHelixAskObjectiveIdsWithoutScopedRetrievalPass({
      states: [
        {
          objective_id: "obj_definition",
          objective_label: "definition objective",
          required_slots: ["definition"],
          matched_slots: ["definition"],
          status: "pending" as const,
          attempt: 0,
        },
      ],
      retrievalQueries: [],
      unresolvedOnly: true,
      maxObjectives: 4,
    });
    const enforced = enforceHelixAskObjectiveScopedRetrievalRequirementForMiniAnswers({
      miniAnswers: [
        {
          objective_id: "obj_definition",
          objective_label: "definition objective",
          status: "covered" as const,
          matched_slots: ["definition"],
          missing_slots: [],
          evidence_refs: ["docs/knowledge/trees/paper-ingestion-runtime-tree.md"],
          summary: "definition objective: covered.",
        },
      ],
      states: [
        {
          objective_id: "obj_definition",
          objective_label: "definition objective",
          required_slots: ["definition"],
          matched_slots: ["definition"],
          status: "pending" as const,
          attempt: 0,
        },
      ],
      retrievalQueries: [],
      maxObjectives: 4,
    });

    expect(ids).toEqual([]);
    expect(enforced.missingObjectiveIds).toEqual([]);
    expect(enforced.miniAnswers[0]?.status).toBe("covered");
    expect(enforced.miniAnswers[0]?.missing_slots).toEqual([]);
  });
});
