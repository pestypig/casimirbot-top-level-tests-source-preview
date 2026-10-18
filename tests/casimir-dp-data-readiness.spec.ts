import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AcquisitionSidecarArtifact,
  estimateCorrelationPower,
  validateAcquisitionSidecar,
} from "../shared/casimir-dp-data-readiness";
import { CasimirDpDataReadinessConfig } from "../shared/contracts/casimir-dp-data-readiness.v1";
import {
  CASIMIR_DP_DATA_READINESS_RUN_ORDER,
  buildCasimirDpDataReadinessReport,
  renderCasimirDpDataReadinessMarkdown,
} from "../scripts/research/run-casimir-dp-data-readiness";

const root = process.cwd();
const config = CasimirDpDataReadinessConfig.parse(JSON.parse(readFileSync(
  path.resolve(root, "configs/research/casimir-dp-data-readiness.v1.json"),
  "utf8",
)));

describe("Casimir-DP data-readiness campaign", () => {
  it("keeps the preregistered order and claim gates fail-closed", async () => {
    expect(config.run_order).toEqual([...CASIMIR_DP_DATA_READINESS_RUN_ORDER]);
    expect(config.secondary_observable_protocol.blinded_boundary_labels).toBe(true);
    expect(config.secondary_observable_protocol.collapse_signature_source_ref).toBeNull();
    const report = await buildCasimirDpDataReadinessReport({
      root,
      config,
      now: new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(report.gates.runnable_pipeline).toBe("pass");
    expect(report.optical_response.kramers_kronig_analytic_validation).toBe("pass");
    expect(report.optical_response.measured_material_gate).toBe("not_ready");
    expect(report.sidecars.switching.structurally_runnable).toBe(true);
    expect(report.sidecars.switching.gates.measured_evidence).toBe("not_ready");
    expect(report.gates.collapse_identifiability).toBe("blocked");
    expect(report.gates.manifold_dynamics).toBe("blocked");
    expect(report.promotion_allowed).toBe(false);
    expect(report.sources.imported_as_apparatus_measurements).toBe(0);
    expect(report.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(renderCasimirDpDataReadinessMarkdown(report)).toContain("do not size or identify objective collapse");
  }, 20_000);

  it("rejects a non-positive-semidefinite covariance matrix", () => {
    const artifact = AcquisitionSidecarArtifact.parse({
      schema_version: "casimir_dp_acquisition_sidecar/1",
      sidecar_id: "bad-covariance",
      candidate_id: "test",
      evidence_class: "measured",
      acquisition_window_s: 1,
      blinded_boundary_label: "X",
      calibration_refs: ["cal"],
      observable_order: ["a", "b"],
      observables: {
        a: { value: 1, standard_uncertainty: 1, unit: "1" },
        b: { value: 1, standard_uncertainty: 1, unit: "1" },
      },
      covariance: [[1, 2], [2, 1]],
    });
    const result = validateAcquisitionSidecar({
      artifact,
      expected_sha256: "a".repeat(64),
      actual_sha256: "a".repeat(64),
    });
    expect(result.gates.covariance.positive_semidefinite).toBe("not_ready");
    expect(result.structurally_runnable).toBe(false);
    expect(result.gates.measured_evidence).toBe("not_ready");
  });

  it("requires more paired windows for a smaller correlation", () => {
    const base = {
      schema_version: "casimir_dp_correlation_power/1" as const,
      null_correlation: 0,
      type_i_error: 0.05,
      target_power: 0.9,
      multiplicity: 4,
    };
    const small = estimateCorrelationPower({ ...base, alternative_correlation: 0.1 });
    const moderate = estimateCorrelationPower({ ...base, alternative_correlation: 0.2 });
    expect(small.paired_windows).toBeGreaterThan(moderate.paired_windows);
    expect(small.claim_boundary.some((note) => note.includes("cannot identify objective collapse"))).toBe(true);
  });
});

