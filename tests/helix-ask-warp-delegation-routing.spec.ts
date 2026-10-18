import { describe, expect, it } from "vitest";

import { __testWarpDelegationGuard } from "../server/routes/agi.plan";

describe("helix ask warp delegation guard routing", () => {
  it("does not apply warp delegation guard for general prompts", () => {
    const applied = __testWarpDelegationGuard.shouldApplyWarpDelegationGuard({
      warpDelegationRequested: true,
      intentStrategy: "general_explain",
      intentId: "general.conceptual_define_compare",
    });
    expect(applied).toBe(false);
  });

  it("applies warp delegation guard for constraint report strategy", () => {
    const applied = __testWarpDelegationGuard.shouldApplyWarpDelegationGuard({
      warpDelegationRequested: true,
      intentStrategy: "constraint_report",
      intentId: "general.conceptual_define_compare",
    });
    expect(applied).toBe(true);
  });

  it("applies warp delegation guard for explicit viability intent", () => {
    const applied = __testWarpDelegationGuard.shouldApplyWarpDelegationGuard({
      warpDelegationRequested: true,
      intentStrategy: "general_explain",
      intentId: "falsifiable.constraints.gr_viability_certificate",
    });
    expect(applied).toBe(true);
  });

  it("does not apply when warp delegation is not requested", () => {
    const applied = __testWarpDelegationGuard.shouldApplyWarpDelegationGuard({
      warpDelegationRequested: false,
      intentStrategy: "constraint_report",
      intentId: "falsifiable.constraints.gr_viability_certificate",
    });
    expect(applied).toBe(false);
  });
});
