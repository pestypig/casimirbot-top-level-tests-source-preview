import { describe, expect, it } from "vitest";
import { buildSectorControlPlan } from "../server/control/sectorControlPlanner";

describe("buildSectorControlPlan", () => {
  it("builds deterministic allocation and duty mapping", () => {
    const result = buildSectorControlPlan({
      mode: "diagnostic",
      allocation: { sectorCount: 10, concurrentSectors: 2, negativeFraction: 0.3 },
      duty: { dutyCycle: 0.4, dutyBurst: 0.5 },
    });

    expect(result.plan.allocation.negSectors).toBe(3);
    expect(result.plan.allocation.posSectors).toBe(7);
    expect(result.plan.duty.dutyEffective_FR).toBeCloseTo(0.04, 8);
    expect(result.ok).toBe(true);
  });

  it("fails closed on first hard guardrail in deterministic order", () => {
    const result = buildSectorControlPlan({
      mode: "diagnostic",
      constraints: {
        FordRomanQI: "pass",
        ThetaAudit: "fail",
        grConstraintGate: "fail",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.firstFail).toBe("ThetaAudit");
    }
  });

  it("keeps maturity diagnostic by default", () => {
    const result = buildSectorControlPlan({ mode: "diagnostic" });
    expect(result.plan.maturity).toBe("diagnostic");
  });
});


it("respects concurrency caps and deterministic firstFail under hard violations", () => {
  const result = buildSectorControlPlan({
    mode: "diagnostic",
    allocation: { sectorCount: 4, concurrentSectors: 99, negativeFraction: 0.5 },
    constraints: { FordRomanQI: "fail", ThetaAudit: "fail" },
  });

  expect(result.plan.allocation.concurrentSectors).toBeLessThanOrEqual(result.plan.allocation.sectorCount);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.firstFail).toBe("FordRomanQI");
  }
});

it("tracks observer-grid debt and fail-closes FordRomanQI on overflow", () => {
  const result = buildSectorControlPlan({
    mode: "diagnostic",
    constraints: { FordRomanQI: "pass", ThetaAudit: "pass", grConstraintGate: "pass" },
    observerGrid: {
      paybackGain: 1.5,
      observers: [
        {
          observerId: "hull_band",
          rho_Jm3: -5e3,
          debt_Jm3s: 0.3,
          maxDebt_Jm3s: 0.1,
          dt_ms: 2,
        },
      ],
    },
  });

  expect(result.plan.observerGrid?.observers.length).toBeGreaterThan(0);
  expect(result.plan.observerGrid?.overflowCount).toBeGreaterThan(0);
  expect(result.plan.constraints.FordRomanQI).toBe("fail");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.firstFail).toBe("FordRomanQI");
  }
});
