import { describe, expect, it } from "vitest";
import { sectorControlPlanHandler } from "../server/skills/physics.warp.sector-control.plan";
import { buildSectorControlPlan } from "../server/control/sectorControlPlanner";

describe("warp sector-control integration", () => {
  it("returns schema-valid plan for sector-control tool handler", async () => {
    const output = await sectorControlPlanHandler({ mode: "diagnostic" }, {} as any);
    expect(output.mode).toBe("diagnostic");
    expect(output.maturity).toBe("diagnostic");
    expect(output.constraints.FordRomanQI).toBe("pass");
    expect(output.observerGrid?.observers.length).toBeGreaterThan(0);
  });

  it("fail-closes on QI hard violation", () => {
    const result = buildSectorControlPlan({ mode: "diagnostic", constraints: { FordRomanQI: "fail" } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.firstFail).toBe("FordRomanQI");
    }
  });
});
