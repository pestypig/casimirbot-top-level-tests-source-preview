import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCasimirDpOrPhaseStage2Report,
} from "../shared/casimir-dp-or-phase-stage2";
import { evaluateCasimirDpProposalReadiness } from "../shared/casimir-dp-proposal-readiness";
import {
  CasimirDpNextComputationsConfig,
} from "../shared/contracts/casimir-dp-next-computations.v1";
import {
  CasimirDpOrPhaseStage2Config,
} from "../shared/contracts/casimir-dp-or-phase-stage2.v1";
import {
  CasimirDpProposalClosureConfig,
} from "../shared/contracts/casimir-dp-proposal-closure.v1";
import {
  CASIMIR_DP_OR_PHASE_STAGE2_RUN_ORDER,
  renderCasimirDpOrPhaseStage2Markdown,
} from "../scripts/research/run-casimir-dp-or-phase-stage2";
import {
  buildCasimirDpNextComputationsReport,
} from "../scripts/research/run-casimir-dp-next-computations";

const root = process.cwd();
const config = CasimirDpOrPhaseStage2Config.parse(JSON.parse(
  readFileSync(
    path.resolve(root, "configs/research/casimir-dp-or-phase-stage2.v1.json"),
    "utf8",
  ),
));
const stage1Config = CasimirDpNextComputationsConfig.parse(JSON.parse(
  readFileSync(
    path.resolve(root, "configs/research/casimir-dp-next-computations.v1.json"),
    "utf8",
  ),
));
const proposalConfig = CasimirDpProposalClosureConfig.parse(JSON.parse(
  readFileSync(
    path.resolve(root, "configs/research/casimir-dp-proposal-closure.v1.json"),
    "utf8",
  ),
));

function sha256File(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(path.resolve(root, relativePath)))
    .digest("hex");
}

function buildReport(overrides?: {
  stage1Gates?: {
    numerical_convergence_gate: "pass" | "not_ready";
    branch_sampling_gate: "pass" | "not_ready";
    provenance_gate: "pass" | "review" | "not_ready";
    experimental_bounds_gate: "pass" | "review" | "not_ready";
  };
  stage1DpIdentity?: {
    mass_kg: number;
    radius_m: number;
    branch_separation_m: number;
    ell_m: number;
  };
}) {
  const now = new Date("2026-07-23T00:00:00.000Z");
  const stage1 = buildCasimirDpNextComputationsReport({
    config: stage1Config,
    now,
  });
  const proposal = evaluateCasimirDpProposalReadiness(proposalConfig);
  return buildCasimirDpOrPhaseStage2Report({
    config,
    proposal: proposalConfig,
    stage1Gates: overrides?.stage1Gates ?? {
      numerical_convergence_gate: stage1.dp.numerical_convergence_gate,
      branch_sampling_gate: stage1.dp.branch_sampling_gate,
      provenance_gate: stage1.dp.provenance_gate,
      experimental_bounds_gate: stage1.dp.experimental_bounds_gate,
    },
    stage1DpIdentity: overrides?.stage1DpIdentity ?? {
      mass_kg: stage1Config.dp_campaign.mass_kg,
      radius_m: stage1Config.dp_campaign.radius_m,
      branch_separation_m:
        stage1Config.dp_campaign.branch_separation_m,
      ell_m: stage1Config.dp_campaign.ell_m,
    },
    proposalGates: {
      proposal_package: proposal.gate_ledger.proposal_package,
      measured_switching_and_decoherence_evidence:
        proposal.gate_ledger.measured_switching_and_decoherence_evidence,
      collapse_identification: proposal.gate_ledger.collapse_identification,
      manifold_dynamics: proposal.gate_ledger.manifold_dynamics,
    },
    upstreamIntegrity: config.upstream_authorities.map((authority) => {
      const actual = sha256File(authority.path);
      return {
        role: authority.role,
        path: authority.path,
        expected_sha256: authority.sha256,
        actual_sha256: actual,
        gate: actual === authority.sha256
          ? "pass" as const
          : "not_ready" as const,
      };
    }),
    now,
  });
}

describe("Casimir-DP OR/phase Stage-2 runtime", () => {
  it("freezes the registered dependency order and upstream hashes", () => {
    expect(config.run_order).toEqual([...CASIMIR_DP_OR_PHASE_STAGE2_RUN_ORDER]);
    for (const authority of config.upstream_authorities) {
      expect(sha256File(authority.path)).toBe(authority.sha256);
    }
  });

  it("passes algebraic diagnostics while preserving open convergence and evidence gates", () => {
    const report = buildReport();
    expect(report.upstream_integrity.gate).toBe("pass");
    expect(report.dp_audit.potential.gate).toBe("pass");
    expect(report.dp_audit.component_identity.gate).toBe("pass");
    expect(report.dp_audit.branch_sampling.mass_conservation_gate).toBe("pass");
    expect(report.dp_audit.branch_sampling.branch_symmetry_gate).toBe("pass");
    expect(report.dp_audit.branch_sampling.containment_gate).toBe("pass");
    expect(report.dp_audit.fixed_branch_boundary_null.gate).toBe("pass");
    expect(report.dp_audit.fixed_branch_boundary_null.delta_boundary_rate_s).toBe(0);
    expect(report.dp_audit.numerical_audit_gate).toBe("pass");
    expect(report.dp_audit.stage1_input_compatibility.gate).toBe("not_ready");
    expect(report.dp_audit.proposal_resolution_sweep.convergence_gate)
      .toBe("not_ready");
    expect(report.dp_audit.stage1_authority_transfer_gate).toBe("not_ready");
    expect(report.final_gates.software_and_algebraic_diagnostics).toBe("pass");
    expect(report.final_gates.stage1_spatial_convergence).toBe("not_ready");
    expect(report.final_gates.measured_qed_phase_and_coherence).toBe("not_ready");
    expect(report.final_gates.collapse_identification).toBe("blocked");
    expect(report.final_gates.manifold_dynamics).toBe("blocked");
  });

  it("separates ordinary phase, visibility, ambient gravity, and OR notation", () => {
    const report = buildReport();
    expect(report.ordinary_phase_and_coherence.boundary_phase.boundary_phase_contrast_rad).toBe(0);
    expect(report.ordinary_phase_and_coherence.visibility).toBeCloseTo(0.8065414402, 9);
    expect(
      report.ordinary_phase_and_coherence.interference.reconstructed_visibility,
    ).toBeCloseTo(report.ordinary_phase_and_coherence.visibility, 14);
    expect(report.ambient_gravity_control.fully_vertical_phase_rad).toBeGreaterThan(7.2e8);
    expect(report.ambient_gravity_control.maximum_small_angle_tilt_rad).toBeLessThan(1.4e-10);
    expect(report.notation.compton_bridge_status).toBe("blocked");
    expect(report.notation.dp_characteristic_frequency_Hz).not.toBe(
      report.notation.compton_frequency_Hz,
    );
  });

  it("emits categorical plausibility lanes and fails closed on the missing bridge", () => {
    const report = buildReport();
    expect(report.plausibility_lanes.map((lane) => lane.lane_id)).toEqual([
      "qed_open_system_baseline",
      "or_dp_branch_instability",
      "boundary_conditioned_spacetime_bridge",
    ]);
    expect(report.plausibility_lanes[0].evidence_gate).toBe("not_ready");
    expect(report.plausibility_lanes[1].evidence_gate).toBe("not_ready");
    expect(report.plausibility_lanes[2].evidence_gate).toBe("blocked");
    expect(report.bridge_gate.status).toBe("blocked");
    expect(report.bridge_gate.missing_fields).toContain(
      "causal_metric_response_kernel",
    );
    expect(report.bridge_gate.no_numerical_plausibility_score).toBe(true);
    expect(report.orch_or_scope.status).toBe("out_of_scope");

    const markdown = renderCasimirDpOrPhaseStage2Markdown(report);
    expect(markdown).toContain("No numerical plausibility score is produced");
    expect(markdown).toContain("No manifold-response rate is computed");
    expect(markdown).toContain("Required preregistered falsifiers");
    for (const falsifier of config.bridge_registration.required_falsifiers) {
      expect(markdown).toContain(falsifier);
    }
  });

  it("freezes the perturbation grid and fails closed below its spatial resolution", () => {
    const report = buildReport();
    const rows = report.dp_audit.branch_perturbation_sensitivity.rows;
    const nominal = rows.find((row) => row.branch_separation_offset_m === 0)!;
    const shifted = rows.filter((row) => row.branch_separation_offset_m !== 0);
    expect(nominal.branch_receipt_changed).toBe(false);
    expect(shifted.every((row) => row.branch_receipt_changed)).toBe(true);
    expect(shifted.every((row) =>
      row.grid_dims.join("x") === nominal.grid_dims.join("x") &&
      row.voxel_size_m.join(",") === nominal.voxel_size_m.join(",")
    )).toBe(true);
    expect(
      report.dp_audit.branch_perturbation_sensitivity
        .frozen_grid_identity_gate,
    ).toBe("pass");
    expect(
      report.dp_audit.branch_perturbation_sensitivity
        .spatial_resolution_gate,
    ).toBe("not_ready");
    expect(report.final_gates.perturbation_sensitivity).toBe("not_ready");
  });

  it("requires compatible inputs and every Stage-1 promotion gate before authority transfer", () => {
    const proposalMass =
      (4 / 3) *
      Math.PI *
      proposalConfig.architecture.particle_radius_m ** 3 *
      proposalConfig.architecture.particle_density_kg_m3;
    const matchingIdentity = {
      mass_kg: proposalMass,
      radius_m: proposalConfig.architecture.particle_radius_m,
      branch_separation_m:
        proposalConfig.architecture.branch_separation_m,
      ell_m: config.dp_audit.ell_m,
    };
    const allPass = {
      numerical_convergence_gate: "pass" as const,
      branch_sampling_gate: "pass" as const,
      provenance_gate: "pass" as const,
      experimental_bounds_gate: "pass" as const,
    };
    expect(buildReport({
      stage1Gates: allPass,
    }).dp_audit.stage1_authority_transfer_gate).toBe("not_ready");
    expect(buildReport({
      stage1Gates: {
        ...allPass,
        branch_sampling_gate: "not_ready",
      },
      stage1DpIdentity: matchingIdentity,
    }).dp_audit.stage1_authority_transfer_gate).toBe("not_ready");
    expect(buildReport({
      stage1Gates: {
        ...allPass,
        experimental_bounds_gate: "not_ready",
      },
      stage1DpIdentity: matchingIdentity,
    }).dp_audit.stage1_authority_transfer_gate).toBe("not_ready");
  });
});
