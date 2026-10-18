import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimateVisibilityRatePower } from "../shared/casimir-dp-inference";
import { CasimirDpNextComputationsConfig } from "../shared/contracts/casimir-dp-next-computations.v1";
import {
  CASIMIR_DP_NEXT_RUN_ORDER,
  buildCasimirDpNextComputationsReport,
  renderCasimirDpNextComputationsMarkdown,
} from "../scripts/research/run-casimir-dp-next-computations";

const config = CasimirDpNextComputationsConfig.parse(
  JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), "configs/research/casimir-dp-next-computations.v1.json"),
      "utf8",
    ),
  ),
);

describe("Casimir-DP gated computations Stage-1 campaign", () => {
  it("keeps the dependency order and manifold registration fail-closed", () => {
    expect(config.run_order).toEqual([...CASIMIR_DP_NEXT_RUN_ORDER]);
    expect(config.manifold_response_registration.status).toBe("blocked");
    expect(config.manifold_response_registration.causal_metric_response_kernel).toBeNull();
    expect(config.unsupported_boundary_models).toHaveLength(3);
  });

  it("produces numerical progress without promoting evidence gates", () => {
    const report = buildCasimirDpNextComputationsReport({
      config,
      now: new Date("2026-07-21T00:00:00.000Z"),
    });

    expect(report.lifshitz.ideal_validation_gate).toBe("pass");
    expect(report.lifshitz.publication_grade_gate).toBe("not_ready");
    expect(report.dp.exact_distinct_resolutions).toBe(true);
    expect(report.dp.mass_conservation_gate).toBe("pass");
    expect(report.dp.branch_symmetry_gate).toBe("pass");
    expect(report.dp.boundary_containment_gate).toBe("pass");
    expect(report.dp.numerical_convergence_gate).toBe("not_ready");
    expect(report.dp.provenance_gate).toBe("not_ready");
    expect(report.inference.rate_only_accessibility_gate).toBe("not_ready");
    expect(report.inference.collapse_identifiability_gate).toBe("blocked");
    expect(report.manifold.status).toBe("blocked");
    expect(report.promotion_allowed).toBe(false);

    const markdown = renderCasimirDpNextComputationsMarkdown(report);
    expect(markdown).toContain("No manifold-response rate is computed");
    expect(markdown).toContain("Publication-grade gate: `not_ready`");
  }, 20_000);

  it("shows that a smaller rate target requires more fringe samples", () => {
    const common = {
      schema_version: "casimir_dp_visibility_power/1" as const,
      baseline_rate_s: 2.15,
      observation_time_s: 0.1,
      type_i_error: 0.05,
      target_power: 0.9,
      technical_variance_inflation: 2,
    };
    const larger = estimateVisibilityRatePower({ ...common, target_additional_rate_s: 1e-5 });
    const smaller = estimateVisibilityRatePower({ ...common, target_additional_rate_s: 1e-7 });

    expect(smaller.total_shots).toBeGreaterThan(larger.total_shots);
    expect(smaller.assumptions.some((note) => note.includes("cannot identify objective collapse"))).toBe(true);
  });
});
