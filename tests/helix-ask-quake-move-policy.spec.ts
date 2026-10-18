import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeRelationSecondPassDelta,
  decideRelationSecondPassAttempt,
  selectDeterministicMoveWithDebug,
} from "../server/services/helix-ask/quake-frame-loop";

describe("HELIX-PS3 quake-style weighted move policy", () => {
  it("returns deterministic debug fields", () => {
    const out = selectDeterministicMoveWithDebug({
      groundedness: 0.7,
      uncertainty: 0.2,
      safety: 0.2,
      coverage: 0.75,
      evidenceGain: 0.2,
      latencyCost: 0.3,
      risk: 0.2,
      budgetPressure: 0.1,
      profile: "balanced",
    });
    expect(typeof out.selectedMove).toBe("string");
    expect(Object.keys(out.moveScores).sort()).toEqual([
      "clarify",
      "direct_answer",
      "fail_closed",
      "relation_build",
      "retrieve_more",
    ]);
    expect(Array.isArray(out.rejectedMoves)).toBe(true);
    expect(typeof out.rejectReasons).toBe("object");
    expect(typeof out.budgetPressure).toBe("number");
    expect(typeof out.stopReason).toBe("string");
  });

  it("is deterministic across repeated calls", () => {
    const input = {
      groundedness: 0.45,
      uncertainty: 0.55,
      safety: 0.4,
      coverage: 0.4,
      evidenceGain: 0.6,
      latencyCost: 0.5,
      risk: 0.45,
      budgetPressure: 0.4,
      relationIntentActive: true,
      profile: "evidence_first" as const,
    };
    const a = selectDeterministicMoveWithDebug(input);
    const b = selectDeterministicMoveWithDebug(input);
    expect(a).toEqual(b);
  });
});

describe("HELIX_ASK_MOVE_PROFILE_WEIGHTS hardening", () => {
  afterEach(() => {
    delete process.env.HELIX_ASK_MOVE_PROFILE_WEIGHTS;
    vi.resetModules();
  });

  it("ignores invalid partial override fields and keeps finite move_scores", async () => {
    process.env.HELIX_ASK_MOVE_PROFILE_WEIGHTS = JSON.stringify({
      balanced: { goal: "not-a-number", evidenceGain: 1.2 },
    });
    vi.resetModules();
    const { selectDeterministicMoveWithDebug: selectWithOverride } = await import("../server/services/helix-ask/quake-frame-loop");
    const out = selectWithOverride({
      groundedness: 0.63,
      uncertainty: 0.31,
      safety: 0.2,
      coverage: 0.7,
      evidenceGain: 0.4,
      latencyCost: 0.3,
      risk: 0.2,
      budgetPressure: 0.2,
      profile: "balanced",
    });

    for (const value of Object.values(out.moveScores)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).not.toBeNaN();
    }
  });

  it("preserves deterministic move selection under partial overrides", async () => {
    const input = {
      groundedness: 0.4,
      uncertainty: 0.5,
      safety: 0.2,
      coverage: 0.3,
      evidenceGain: 0.9,
      latencyCost: 0.85,
      risk: 0.2,
      budgetPressure: 0.7,
      profile: "evidence_first" as const,
    };

    delete process.env.HELIX_ASK_MOVE_PROFILE_WEIGHTS;
    vi.resetModules();
    const baseModule = await import("../server/services/helix-ask/quake-frame-loop");
    const baseline = baseModule.selectDeterministicMoveWithDebug(input).selectedMove;

    process.env.HELIX_ASK_MOVE_PROFILE_WEIGHTS = JSON.stringify({
      evidence_first: { evidenceGain: 1.6, goal: "bad-value" },
    });
    vi.resetModules();
    const overrideModule = await import("../server/services/helix-ask/quake-frame-loop");
    const overridden = overrideModule.selectDeterministicMoveWithDebug(input).selectedMove;

    expect(overridden).toBe(baseline);
  });
});



describe("HELIX dynamic relation deficit weighting", () => {
  afterEach(() => {
    delete process.env.HELIX_ASK_QUAKE_BRIDGE_GAP_WEIGHT;
    delete process.env.HELIX_ASK_QUAKE_EVIDENCE_GAP_WEIGHT;
    delete process.env.HELIX_ASK_QUAKE_DUAL_DOMAIN_GAP_WEIGHT;
    delete process.env.HELIX_ASK_QUAKE_RELATION_DYNAMIC_BIAS_MAX;
    delete process.env.HELIX_ASK_QUAKE_RETRIEVE_DYNAMIC_BIAS_MAX;
    vi.resetModules();
  });

  it("boosts relation/retrieve scores when deficits rise", () => {
    const base = selectDeterministicMoveWithDebug({
      groundedness: 0.5,
      uncertainty: 0.5,
      safety: 0.2,
      coverage: 0.5,
      evidenceGain: 0.5,
      latencyCost: 0.3,
      risk: 0.2,
      budgetPressure: 0.2,
      relationIntentActive: true,
      bridgeGap: 0,
      evidenceGap: 0,
      dualDomainGap: 0,
      profile: "evidence_first",
    });
    const boosted = selectDeterministicMoveWithDebug({
      groundedness: 0.5,
      uncertainty: 0.5,
      safety: 0.2,
      coverage: 0.5,
      evidenceGain: 0.5,
      latencyCost: 0.3,
      risk: 0.2,
      budgetPressure: 0.2,
      relationIntentActive: true,
      bridgeGap: 1,
      evidenceGap: 1,
      dualDomainGap: 1,
      profile: "evidence_first",
    });

    expect(boosted.moveScores.retrieve_more).toBeGreaterThan(base.moveScores.retrieve_more);
    expect(boosted.moveScores.relation_build).toBeGreaterThan(base.moveScores.relation_build);
    expect(boosted.dynamicBiases.relationBuildBias).toBeGreaterThan(0);
    expect(boosted.dynamicBiases.retrieveMoreBias).toBeGreaterThan(0);
  });

  it("clamps env-tuned dynamic bias knobs and gaps", async () => {
    process.env.HELIX_ASK_QUAKE_BRIDGE_GAP_WEIGHT = "9";
    process.env.HELIX_ASK_QUAKE_EVIDENCE_GAP_WEIGHT = "9";
    process.env.HELIX_ASK_QUAKE_DUAL_DOMAIN_GAP_WEIGHT = "9";
    process.env.HELIX_ASK_QUAKE_RELATION_DYNAMIC_BIAS_MAX = "5";
    process.env.HELIX_ASK_QUAKE_RETRIEVE_DYNAMIC_BIAS_MAX = "5";
    vi.resetModules();
    const mod = await import("../server/services/helix-ask/quake-frame-loop");
    const out = mod.selectDeterministicMoveWithDebug({
      groundedness: 0.5,
      uncertainty: 0.5,
      safety: 0.2,
      coverage: 0.5,
      evidenceGain: 0.5,
      latencyCost: 0.3,
      risk: 0.2,
      budgetPressure: 0.2,
      relationIntentActive: true,
      bridgeGap: 2,
      evidenceGap: -1,
      dualDomainGap: 7,
      profile: "evidence_first",
    });

    expect(out.dynamicBiases.bridgeGap).toBe(1);
    expect(out.dynamicBiases.evidenceGap).toBe(0);
    expect(out.dynamicBiases.dualDomainGap).toBe(1);
    expect(out.dynamicBiases.relationBuildBias).toBeLessThanOrEqual(0.8);
    expect(out.dynamicBiases.retrieveMoreBias).toBeLessThanOrEqual(0.8);
  });

  it("keeps baseline behavior when gaps are absent", () => {
    const noGaps = selectDeterministicMoveWithDebug({
      groundedness: 0.45,
      uncertainty: 0.55,
      safety: 0.3,
      coverage: 0.4,
      evidenceGain: 0.6,
      latencyCost: 0.4,
      risk: 0.25,
      budgetPressure: 0.3,
      relationIntentActive: true,
      profile: "evidence_first",
    });
    const explicitZeroGaps = selectDeterministicMoveWithDebug({
      groundedness: 0.45,
      uncertainty: 0.55,
      safety: 0.3,
      coverage: 0.4,
      evidenceGain: 0.6,
      latencyCost: 0.4,
      risk: 0.25,
      budgetPressure: 0.3,
      relationIntentActive: true,
      bridgeGap: 0,
      evidenceGap: 0,
      dualDomainGap: 0,
      profile: "evidence_first",
    });

    expect(explicitZeroGaps).toEqual(noGaps);
  });
});

describe("HELIX relation second-pass deterministic policy", () => {
  it("triggers second pass for retrieve_more/relation_build when deficits exist", () => {
    const retrieveMore = decideRelationSecondPassAttempt({
      selectedMove: "retrieve_more",
      deficits: { bridgeDeficit: false, evidenceDeficit: true, dualDomainDeficit: false },
    });
    const relationBuild = decideRelationSecondPassAttempt({
      selectedMove: "relation_build",
      deficits: { bridgeDeficit: true, evidenceDeficit: false, dualDomainDeficit: false },
    });
    expect(retrieveMore).toEqual({ shouldAttempt: true });
    expect(relationBuild).toEqual({ shouldAttempt: true });
  });

  it("enforces max one extra pass and returns deterministic skip reasons", () => {
    const firstSkip = decideRelationSecondPassAttempt({
      selectedMove: "clarify",
      deficits: { bridgeDeficit: true, evidenceDeficit: true, dualDomainDeficit: true },
    });
    const secondSkip = decideRelationSecondPassAttempt({
      selectedMove: "retrieve_more",
      deficits: { bridgeDeficit: true, evidenceDeficit: true, dualDomainDeficit: true },
      alreadyAttempted: true,
    });
    expect(firstSkip).toEqual({ shouldAttempt: false, skippedReason: "move_not_eligible" });
    expect(secondSkip).toEqual({ shouldAttempt: false, skippedReason: "already_attempted" });
  });


  it("forces one deterministic retry for dual-domain minimums even when move is not eligible", () => {
    const forcedRetry = decideRelationSecondPassAttempt({
      selectedMove: "clarify",
      deficits: { bridgeDeficit: false, evidenceDeficit: false, dualDomainDeficit: true },
      enforceMinimums: true,
    });
    expect(forcedRetry).toEqual({ shouldAttempt: true });
  });

  it("computes deterministic second-pass deltas from recomputed relation fields", () => {
    const delta = computeRelationSecondPassDelta({
      before: { bridgeCount: 1, evidenceCount: 2, dualDomainOk: false },
      after: { bridgeCount: 3, evidenceCount: 5, dualDomainOk: true },
    });
    expect(delta).toEqual({
      bridgeDelta: 2,
      evidenceDelta: 3,
      dualDomainDelta: "gained",
    });
  });
});
