import { describe, expect, it } from "vitest";

import {
  collectFinalModeGateConsistencyReasons,
  collectGlobalTerminalValidatorReasons,
  shouldSuppressRelationFallbackObjectiveObligations,
} from "../server/services/helix-ask/surface/terminal-consistency";
import {
  applyFinalModeGateSoftSuppression,
  evaluateGlobalTerminalRewritePolicy,
  shouldApplyFallbackShapeRepair,
} from "../server/services/helix-ask/surface/terminal-rewrite-policy";

describe("helix ask terminal consistency helpers", () => {
  it("collects global terminal validator reasons without over-adding roadmap gaps", () => {
    const reasons = collectGlobalTerminalValidatorReasons({
      weakObjectiveAssembly: true,
      hasObjectiveScaffoldLeak: true,
      hasPlanStreamLeakage: false,
      strictCoveredUnknownLeak: true,
      enforceShortTextFloor: true,
      finalPlanValidationFailReasons: ["required_sections_missing", "anchor_integrity_violation"],
      visibleSourcesRequired: true,
      hasSourcesLine: false,
      structuredSurface: true,
      frontierIntent: true,
      hasRequiredFrontierHeadings: false,
      promptFamily: "roadmap_planning",
      roadmapMissingReasons: [
        "roadmap_repo_grounded_findings_missing",
        "roadmap_next_anchors_needed_missing",
      ],
    });

    expect(reasons).toEqual([
      "weak_output",
      "objective_scaffold_leak",
      "strict_covered_unknown_leak",
      "text_too_short",
      "required_sections_missing",
      "anchor_integrity_violation",
      "sources_missing",
      "frontier_required_headings_missing",
      "roadmap_repo_grounded_findings_missing",
      "roadmap_next_anchors_needed_missing",
    ]);
  });

  it("collects final mode gate reasons including objective obligations", () => {
    const reasons = collectFinalModeGateConsistencyReasons({
      structuredSurface: true,
      finalPlanValidationFailReasons: ["required_sections_missing"],
      frontierIntent: false,
      hasRequiredFrontierHeadings: false,
      visibleSourcesRequired: true,
      hasSourcesLine: false,
      promptFamily: "general_overview",
      roadmapMissingReasons: [],
      objectiveLoopEnabled: true,
      objectiveObligationGateRequired: true,
      finalObjectiveFinalizeMode: "strict_covered",
      finalObjectiveObligationsMissingCount: 2,
    });

    expect(reasons).toEqual([
      "required_sections_missing",
      "sources_missing",
      "objective_obligations_missing",
    ]);
  });

  it("suppresses stale objective obligations for grounded relation fallback output", () => {
    expect(
      shouldSuppressRelationFallbackObjectiveObligations({
        objectiveLoopEnabled: true,
        relationIntent: true,
        relationPacketPresent: true,
        relationPacketFloorsOk: true,
        relationDualDomainOk: true,
        relationFallbackApplied: true,
      }),
    ).toBe(true);

    expect(
      shouldSuppressRelationFallbackObjectiveObligations({
        objectiveLoopEnabled: true,
        relationIntent: true,
        relationPacketPresent: true,
        relationPacketFloorsOk: false,
        relationDualDomainOk: true,
        relationFallbackApplied: true,
      }),
    ).toBe(false);
  });
});

describe("helix ask terminal rewrite policy helpers", () => {
  it("allows minimal repair for soft family reasons on strict covered answers", () => {
    const policy = evaluateGlobalTerminalRewritePolicy({
      reasons: ["required_sections_missing", "sources_missing"],
      structuredSurface: true,
      frontierIntent: false,
      promptFamily: "general_overview",
      objectiveStrictCovered: true,
      preserveConversationalAnswer: false,
    });

    expect(policy.allowMinimalSoftRepair).toBe(true);
    expect(policy.allowConversationalSoftObserve).toBe(false);
    expect(policy.requiresFamilySectionRepair).toBe(true);
    expect(policy.prioritizeFrontierContractRepair).toBe(false);
  });

  it("allows conversational observe for soft conversational reasons", () => {
    const policy = evaluateGlobalTerminalRewritePolicy({
      reasons: ["required_sections_missing", "anchor_integrity_violation"],
      structuredSurface: false,
      frontierIntent: false,
      promptFamily: "general_overview",
      objectiveStrictCovered: true,
      preserveConversationalAnswer: true,
    });

    expect(policy.allowConversationalSoftObserve).toBe(true);
    expect(policy.allowMinimalSoftRepair).toBe(false);
  });

  it("suppresses soft final-mode reasons and preserves hard ones", () => {
    const suppressed = applyFinalModeGateSoftSuppression({
      reasons: ["required_sections_missing", "sources_missing", "objective_obligations_missing"],
      allowSoftModeGateSuppression: true,
      repoOrHybrid: false,
    });

    expect(suppressed.suppressed).toBe(true);
    expect(suppressed.reasons).toEqual(["objective_obligations_missing"]);
    expect(suppressed.suppressedReasons).toEqual([
      "required_sections_missing",
      "anchor_integrity_violation",
      "sources_missing",
    ]);
  });

  it("detects when fallback shape repair should run", () => {
    expect(
      shouldApplyFallbackShapeRepair({
        structuredSurface: true,
        repoOrHybrid: true,
        frontierIntent: false,
        globalTerminalMode: "minimal_repair",
        intentProfileId: "repo.technical",
        hasPlanShadow: true,
        hasAcceptedRepoFallbackShape: false,
      }),
    ).toBe(true);

    expect(
      shouldApplyFallbackShapeRepair({
        structuredSurface: true,
        repoOrHybrid: true,
        frontierIntent: false,
        globalTerminalMode: "rewrite",
        intentProfileId: "repo.technical",
        hasPlanShadow: true,
        hasAcceptedRepoFallbackShape: false,
      }),
    ).toBe(false);
  });
});
