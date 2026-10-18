import { describe, it, expect } from "vitest";
import { calculateNatarioWarpBubble, type NatarioWarpParams } from "../modules/warp/natario-warp";

describe("natario metric stress diagnostics", () => {
  const baseParams: NatarioWarpParams = {
    bowlRadius: 25000,
    sagDepth: 16,
    gap: 1,
    cavityQ: 1e9,
    burstDuration: 10,
    cycleDuration: 1000,
    sectorCount: 400,
    dutyFactor: 0.01,
    effectiveDuty: 2.5e-5,
    shiftAmplitude: 1e-6,
    expansionTolerance: 1e-12,
    warpFieldType: "natario",
  };

  it("emits K-trace and K^2 diagnostics", () => {
    const result = calculateNatarioWarpBubble(baseParams);
    const diag = result.metricStressDiagnostics;
    expect(diag?.sampleCount ?? 0).toBeGreaterThan(0);
    expect(Number.isFinite(diag?.kTraceMean as number)).toBe(true);
    expect(Number.isFinite(diag?.kSquaredMean as number)).toBe(true);
  });
});
