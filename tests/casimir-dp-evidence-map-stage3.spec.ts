import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderCasimirDpEvidenceMapStage3Markdown,
  runCasimirDpEvidenceMapStage3,
} from "../scripts/research/run-casimir-dp-evidence-map-stage3";
import {
  CASIMIR_DP_STAGE3_CROSS_AXIS_SIGNATURES,
  CASIMIR_DP_STAGE3_OUTCOME_TO_CLAIM_MAP,
} from "../shared/casimir-dp-evidence-map-stage3";
import {
  CASIMIR_DP_EVIDENCE_MAP_STAGE3_RUN_ORDER,
  CasimirDpEvidenceMapStage3Config,
} from "../shared/contracts/casimir-dp-evidence-map-stage3.v1";

const configPath = path.resolve(
  process.cwd(),
  "configs/research/casimir-dp-evidence-map-stage3.v1.json",
);
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "casimir-dp-stage3-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

describe("Casimir-DP Stage-3 evidence-map campaign", () => {
  it("freezes the composite null, nested hypotheses, and revised order", async () => {
    const config = CasimirDpEvidenceMapStage3Config.parse(
      JSON.parse(await readFile(configPath, "utf8")),
    );

    expect(config.run_order).toEqual([
      ...CASIMIR_DP_EVIDENCE_MAP_STAGE3_RUN_ORDER,
    ]);
    expect(config.run_order.indexOf("preflight_manifold_kernel_registry"))
      .toBeLessThan(
        config.run_order.indexOf(
          "freeze_signatures_likelihoods_priors_criteria_and_falsifiers",
        ),
      );
    expect(config.run_order.indexOf(
      "freeze_signatures_likelihoods_priors_criteria_and_falsifiers",
    )).toBeLessThan(
      config.run_order.indexOf(
        "run_blinded_held_out_joint_model_comparison",
      ),
    );
    expect(config.preregistration.composite_null_components).toEqual([
      "M_qed_phase",
      "M_technical_dephasing",
      "M_qed_environmental_decoherence",
      "M_ordinary_gravity",
    ]);
    expect(config.preregistration.frozen_models.map((model) => model.model_id))
      .toContain("M_dp_regularized_synthetic_v1");
    expect(config.preregistration.frozen_models.find((model) =>
      model.model_id === "M_bridge_tensor_noise_v1"
    )?.requires_registered_bridge).toBe(true);
    expect(config.evidence_policy.synthetic_can_satisfy_measured_gate).toBe(
      false,
    );
  });

  it("runs all six synthetic lanes without promoting measured physics", async () => {
    const outRoot = await temporaryRoot();
    const result = await runCasimirDpEvidenceMapStage3({
      configPath,
      outRoot,
      reportDoc: null,
      now: new Date("2026-07-25T12:00:00.000Z"),
    });

    expect(result.report.final_gates).toMatchObject({
      software_and_synthetic_diagnostics: "pass",
      measured_evidence: "not_ready",
      ordinary_decoherence_closure: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      bridge_registration: "registered_not_validated",
      publication_claim: "diagnostic_protocol_only",
    });
    expect(result.report.fixture_integrity).toHaveLength(6);
    expect(result.report.fixture_integrity.every((row) =>
      row.gate === "pass"
    )).toBe(true);
    const stageGates = new Map(
      result.report.run_order.map((stage) => [stage.stage, stage.gate]),
    );
    expect(stageGates.get(
      "validate_blind_provenance_randomization_and_control_coverage",
    )).toBe("not_ready");
    expect(stageGates.get(
      "evaluate_phase_conditioning_path_swap_and_echo",
    )).toBe("not_ready");
    expect(stageGates.get(
      "evaluate_decay_shape_and_time_grid_identifiability",
    )).toBe("diagnostic");
    expect(stageGates.get(
      "validate_material_green_noise_and_technical_sidecars",
    )).toBe("not_ready");
    expect(result.report.runtimes.complex_coherence.maximum_claim).toBe(
      "synthetic_pipeline_validation",
    );
    expect(
      (
        result.report.runtimes.qed_green_noise.readiness as {
          maximum_claim: string;
        }
      ).maximum_claim,
    ).toBe("synthetic_pipeline_validation");
    expect(result.report.runtimes.dp_companion.status).toBe("diagnostic");
    expect(result.report.runtimes.gravity_upper_bound.maximum_claim).toBe(
      "scalar_upper_bound",
    );
    expect(result.receipt.prior_stage2_certificate_reused).toBe(false);
    expect(result.receipt.fresh_casimir_certificate).toEqual({
      status: "pending_external_verification",
      certificate_sha256: null,
      integrity: null,
    });
  });

  it("registers the bridge schema without pretending it was compared or validated", async () => {
    const result = await runCasimirDpEvidenceMapStage3({
      configPath,
      outRoot: await temporaryRoot(),
      reportDoc: null,
      now: new Date("2026-07-25T12:00:00.000Z"),
    });
    const registry = result.report.runtimes.manifold_kernel_registry;

    expect(result.report.registry_preflight).toEqual({
      status: "registered",
      bridge_schema_registered: true,
      bridge_admitted_to_comparison: false,
      registration_is_empirical_validation: false,
    });
    expect(registry.numerical_bridge_output).toBeNull();
    expect(registry.registration_is_empirical_validation).toBe(false);
    expect(result.report.preregistration.nested_extensions.find((model) =>
      model.model_id === "M_bridge_tensor_noise_v1"
    )?.admitted_to_comparison).toBe(false);
    expect(
      (
        result.report.runtimes.model_comparison.model_results as Array<{
          model_id: string;
        }>
      ).some((model) => model.model_id === "M_bridge_tensor_noise_v1"),
    ).toBe(false);
  });

  it("keeps outcome-map claims and rendered wording synchronized", async () => {
    const result = await runCasimirDpEvidenceMapStage3({
      configPath,
      outRoot: await temporaryRoot(),
      reportDoc: null,
      now: new Date("2026-07-25T12:00:00.000Z"),
    });
    const markdown = renderCasimirDpEvidenceMapStage3Markdown(result.report);

    expect(result.report.outcome_to_claim_map).toEqual(
      CASIMIR_DP_STAGE3_OUTCOME_TO_CLAIM_MAP,
    );
    expect(result.report.cross_axis_signature_matrix).toEqual(
      CASIMIR_DP_STAGE3_CROSS_AXIS_SIGNATURES,
    );
    for (const outcome of CASIMIR_DP_STAGE3_OUTCOME_TO_CLAIM_MAP) {
      expect(markdown).toContain(`\`${outcome.outcome_id}\``);
      expect(markdown).toContain(outcome.does_not_establish);
    }
    expect(markdown).toContain(
      "`not_disfavored_within_powered_region`, not \"confirmed.\"",
    );
    expect(markdown).toContain(
      "A frozen\nbridge predictor is included in this comparison:\n`false`",
    );
  });

  it("fails closed before computation when a fixture hash is altered", async () => {
    const root = await temporaryRoot();
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      runtime_fixtures: {
        qed_green_noise: {
          sha256: string;
        };
      };
    };
    config.runtime_fixtures.qed_green_noise.sha256 = "0".repeat(64);
    const tamperedConfigPath = path.join(root, "tampered-config.json");
    await writeFile(
      tamperedConfigPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );

    await expect(
      runCasimirDpEvidenceMapStage3({
        configPath: tamperedConfigPath,
        outRoot: path.join(root, "out"),
        reportDoc: null,
      }),
    ).rejects.toThrow(
      "stage3_integrity_failure:casimir-dp-stage3-qed-green-noise.synthetic.v1.json",
    );
  });
});
