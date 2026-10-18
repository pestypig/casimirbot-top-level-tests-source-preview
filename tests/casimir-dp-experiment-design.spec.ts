import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CasimirDpExperimentDesignConfig } from "../shared/contracts/casimir-dp-experiment-design.v1";
import {
  CASIMIR_DP_DESIGN_RUN_ORDER,
  buildCasimirDpExperimentDesignReport,
  renderCasimirDpExperimentDesignMarkdown,
} from "../scripts/research/run-casimir-dp-experiment-design";

const CONFIG_PATH = path.resolve(
  process.cwd(),
  "configs/research/casimir-dp-experiment-design.v1.json",
);

function readConfig() {
  return CasimirDpExperimentDesignConfig.parse(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
}

describe("Casimir-DP experiment design campaign", () => {
  it("freezes the evidence-gated run order and candidate set", () => {
    const config = readConfig();

    expect(config.run_order).toEqual([...CASIMIR_DP_DESIGN_RUN_ORDER]);
    expect(config.candidates.map((candidate) => candidate.platform_class)).toEqual(
      expect.arrayContaining([
        "levitated_nanoparticle",
        "nanomechanical_resonator",
        "free_flight_matter_wave",
      ]),
    );
    expect(config.candidates.map((candidate) => candidate.study_role)).toEqual(
      expect.arrayContaining([
        "integrated_development_candidate",
        "casimir_calibration_candidate",
        "spatial_superposition_benchmark",
      ]),
    );
    expect(config.candidates.every((candidate) => candidate.manifold_response.status === "blocked")).toBe(true);
    expect(config.candidates.every((candidate) => candidate.manifold_response.rate_s === null)).toBe(true);
  });

  it("computes reference, coherence, and DP diagnostics without promoting a candidate", () => {
    const report = buildCasimirDpExperimentDesignReport({
      config: readConfig(),
      now: new Date("2026-07-21T00:00:00.000Z"),
    });

    expect(report.promotion_allowed).toBe(false);
    expect(report.candidates).toHaveLength(3);
    expect(report.candidates.every((candidate) => candidate.promotion_allowed === false)).toBe(true);
    expect(report.candidates.every((candidate) => candidate.gates.manifold_response_model === "blocked")).toBe(true);
    expect(report.candidates.every((candidate) => candidate.gates.collapse_identifiability === "blocked")).toBe(true);
    expect(report.candidates.every((candidate) => Number.isFinite(candidate.reference_casimir.force_N))).toBe(true);
    expect(report.candidates.every((candidate) => candidate.coherence.environment_visibility >= 0)).toBe(true);
    expect(report.candidates.find((candidate) => candidate.candidate_id === "cryo-resonator-superconducting")?.dp.status).toBe(
      "unresolved",
    );
    expect(report.ranking.every((row) => row.disposition === "design_candidate_only")).toBe(true);
  });

  it("renders claim boundaries and open campaign gates into the report", () => {
    const report = buildCasimirDpExperimentDesignReport({
      config: readConfig(),
      now: new Date("2026-07-21T00:00:00.000Z"),
    });
    const markdown = renderCasimirDpExperimentDesignMarkdown(report);

    expect(markdown).toContain("Engineering index");
    expect(markdown).toContain("`manifold_response_dynamics`: `blocked`");
    expect(markdown).toContain("No manifold-response or boundary-conditioned objective-collapse rate is computed.");
    expect(markdown).toContain("Cryogenic levitated nanoparticle");
  });
});
