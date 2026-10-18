import { describe, expect, it } from "vitest";
import { computeTimeDilationRenderPlan } from "../client/src/lib/time-dilation-render-policy";
import type { EnergyPipelineState } from "../client/src/hooks/use-energy-pipeline";
import type { GrEvolveBrickDecoded } from "../client/src/lib/gr-evolve-brick";
import type { LapseBrickDecoded } from "../client/src/lib/lapse-brick";

const baseUi = {
  hasHull: true,
  wallDetectionAvailable: false,
  wallDetected: null,
  grRequested: true,
  grCertified: true,
  anyProxy: false,
  mathStageOK: true,
  cellSize: 1,
  solverStatus: "CERTIFIED",
  visualTuning: {
    betaScale: 1,
    gammaScale: 1,
    kijScale: 1,
    gammaEnabled: true,
    kijEnabled: true,
  },
  betaPercentile: 2,
  thetaPercentile: 2,
  gammaPercentile: 2,
  shearPercentile: 2,
};

const grBrick = {
  channels: {
    theta: { min: -2, max: 2 },
  },
} as unknown as GrEvolveBrickDecoded;

const lapseBrick = {
  channels: {
    alpha: { min: 1, max: 1 },
  },
} as unknown as LapseBrickDecoded;

const pipeline = (warpFieldType: string) =>
  ({ warpFieldType } as unknown as EnergyPipelineState);

describe("computeTimeDilationRenderPlan", () => {
  it("returns a NO_HULL plan when no hull is applied", () => {
    const plan = computeTimeDilationRenderPlan(pipeline("alcubierre"), grBrick, lapseBrick, {
      ...baseUi,
      hasHull: false,
    });

    expect(plan.banner).toBe("NO_HULL");
    expect(plan.enableGeometryWarp).toBe(false);
    expect(plan.geomWarpScale).toBe(0);
    expect(plan.sourceForTheta).toBe("none");
  });

  it("keeps Natario mode geometry warp disabled", () => {
    const plan = computeTimeDilationRenderPlan(pipeline("natario"), grBrick, lapseBrick, baseUi);

    expect(plan.mode).toBe("natario");
    expect(plan.banner).toBe("CERTIFIED");
    expect(plan.enableGeometryWarp).toBe(false);
    expect(plan.geomWarpScale).toBe(0);
  });

  it("enables geometry warp for Alcubierre with certified GR", () => {
    const plan = computeTimeDilationRenderPlan(pipeline("alcubierre"), grBrick, lapseBrick, baseUi);

    expect(plan.mode).toBe("alcubierre");
    expect(plan.banner).toBe("CERTIFIED");
    expect(plan.enableGeometryWarp).toBe(true);
    expect(plan.geomWarpScale).toBe(1);
    expect(plan.sourceForAlpha).toBe("gr-brick");
    expect(plan.sourceForBeta).toBe("gr-brick");
  });

  it("falls back when GR is requested but missing", () => {
    const plan = computeTimeDilationRenderPlan(pipeline("alcubierre"), null, lapseBrick, {
      ...baseUi,
      grRequested: true,
    });

    expect(plan.banner).toBe("WAITING_GR");
    expect(plan.enableGeometryWarp).toBe(false);
    expect(plan.sourceForAlpha).toBe("lapse-brick");
    expect(plan.sourceForTheta).toBe("none");
    expect(plan.reasons).toContain("waiting for GR brick");
  });

  it("disables geometry warp when invariants show no wall", () => {
    const plan = computeTimeDilationRenderPlan(pipeline("alcubierre"), grBrick, lapseBrick, {
      ...baseUi,
      wallDetectionAvailable: true,
      wallDetected: false,
    });

    expect(plan.banner).toBe("NO_HULL");
    expect(plan.enableGeometryWarp).toBe(false);
    expect(plan.reasons).toContain("invariant wall not detected");
  });
});
