import { describe, expect, it } from "vitest";
import { stepTsAutoscale } from "../server/ts/ts-autoscale.js";

describe("ts autoscale servo", () => {
  it("shrinks burst width toward target TS while respecting the floor", () => {
    const result = stepTsAutoscale({
      enable: true,
      targetTS: 100,
      slewPerSec: 0.25,
      floor_ns: 20,
      windowTol: 0.05,
      TS_ratio: 50,
      tauPulse_ns: 60,
      dt_s: 4,
      prevBurst_ns: 60,
    });

    expect(result.engaged).toBe(true);
    expect(result.appliedBurst_ns).toBeCloseTo(30, 1);
    expect(result.appliedBurst_ns).toBeGreaterThanOrEqual(20);
  });
});
