import { describe, expect, it } from "vitest";
import { HBAR } from "@shared/physics-const";
import { DpPlanResult } from "@shared/dp-planner";
import { buildDpPlanResult } from "../server/services/dp-planner";

describe("dp planner", () => {
  it("computes visibility targets and detectability ratios", () => {
    const gammaEnv = 1e-3;
    const input = {
      schema_version: "dp_plan/1",
      dp: {
        schema_version: "dp_collapse/1",
        ell_m: 2e-10,
        grid: {
          dims: [16, 16, 16],
          voxel_size_m: [1e-9, 1e-9, 1e-9],
          origin_m: [0, 0, 0],
        },
        branch_a: {
          kind: "analytic",
          primitives: [
            { kind: "gaussian", mass_kg: 5e-16, sigma_m: 1e-9, center_m: [-1e-9, 0, 0] },
          ],
        },
        branch_b: {
          kind: "analytic",
          primitives: [
            { kind: "gaussian", mass_kg: 5e-16, sigma_m: 1e-9, center_m: [1e-9, 0, 0] },
          ],
        },
      },
      visibility: { v0: 1 },
      environment: { gamma_env_s: gammaEnv, label: "env" },
    };

    const result = buildDpPlanResult(input, "2025-01-01T00:00:00.000Z");
    const parsed = DpPlanResult.parse(result);

    const gammaExpected = parsed.dp.deltaE_J / HBAR;
    expect(parsed.gamma_dp_s).toBeCloseTo(gammaExpected, 9);
    expect(parsed.visibility?.target_source).toBe("default");
    expect(parsed.visibility?.time_to_target_s).toBeCloseTo(parsed.dp.tau_s, 6);

    if (parsed.detectability?.ratio != null) {
      expect(parsed.detectability.ratio).toBeCloseTo(parsed.gamma_dp_s / gammaEnv, 9);
    }
  });
});
