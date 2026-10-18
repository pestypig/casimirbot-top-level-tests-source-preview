import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderCasimirDpPolarizationCongruenceStage4Markdown,
  runCasimirDpPolarizationCongruenceStage4,
} from "../scripts/research/run-casimir-dp-polarization-congruence-stage4";
import {
  CASIMIR_DP_STAGE4_OUTCOME_TO_CLAIM_MAP,
  CASIMIR_DP_STAGE4_PREDICTION_SIGNATURES,
  buildCasimirDpPolarizationCongruenceStage4Report,
} from "../shared/casimir-dp-polarization-congruence-stage4";
import {
  CASIMIR_DP_POLARIZATION_CONGRUENCE_STAGE4_RUN_ORDER,
  CasimirDpPolarizationCongruenceStage4Config,
} from "../shared/contracts/casimir-dp-polarization-congruence-stage4.v1";

const configPath = path.resolve(
  process.cwd(),
  "configs/research/casimir-dp-polarization-congruence-stage4.v1.json",
);
const temporaryRoots: string[] = [];
const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "casimir-dp-stage4-"));
  temporaryRoots.push(root);
  return root;
}

async function temporaryOutputPath(): Promise<string> {
  return path.join(await temporaryRoot(), "immutable-run");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

describe("Casimir-DP polarization and congruence Stage-4 campaign", () => {
  it("freezes the expanded null, unchanged named DP manifest, and run order", async () => {
    const config = CasimirDpPolarizationCongruenceStage4Config.parse(
      JSON.parse(await readFile(configPath, "utf8")),
    );

    expect(config.run_order).toEqual([
      ...CASIMIR_DP_POLARIZATION_CONGRUENCE_STAGE4_RUN_ORDER,
    ]);
    expect(config.run_order.indexOf(
      "run_tensor_dimensional_and_semantic_congruence",
    )).toBeLessThan(config.run_order.indexOf(
      "freeze_helicity_mirror_material_temperature_and_companion_signatures",
    ));
    expect(config.run_order.indexOf(
      "version_expanded_null_unchanged_dp_and_registered_bridge_comparator",
    )).toBeLessThan(config.run_order.indexOf(
      "run_blinded_synthetic_prediction_comparison",
    ));
    expect(config.preregistration.expanded_null_components).toEqual([
      "M_qed_phase",
      "M_technical_dephasing",
      "M_qed_environmental_decoherence",
      "M_ordinary_gravity",
      "M_polarization_resolved_qed",
      "M_thermal_radiative_fdt",
    ]);
    expect(config.preregistration.named_dp_reuse_policy).toBe(
      "reused_without_mutation",
    );
    expect(
      config.evidence_policy.standard_dp_is_polarization_blind_at_fixed_delta_rho,
    ).toBe(true);
    expect(config.evidence_policy.same_dimension_implies_connection).toBe(
      false,
    );
    expect(config.blinding).toEqual({
      lane_status: "synthetic_contract_only",
      blind_labels: [
        "POLARIZATION_CELL_ALPHA",
        "POLARIZATION_CELL_BETA",
      ],
      mapping_stored_in_repository: false,
      custodian_receipt_status: "not_created",
      custodian_receipt_path: null,
      custodian_mapping_sha256: null,
      preregistration_timestamp: "2026-07-25T00:00:00.000Z",
      measured_comparison_allowed: false,
      unblinding_timestamp: null,
      automatic_unblinding_allowed: false,
    });
  });

  it("runs three synthetic lanes while leaving scientific identification blocked", async () => {
    const result = await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T16:00:00.000Z"),
    });

    expect(result.report.final_gates).toMatchObject({
      software_and_synthetic_predictions: "pass",
      synthetic_blinding_contract: "pass",
      measured_evidence: "not_ready",
      ordinary_physics_closure: "not_ready",
      polarization_qed_measured_lane: "not_ready",
      thermal_measured_lane: "not_ready",
      tensor_dimensional_congruence: "pass",
      unchanged_named_dp: "reused_without_mutation",
      registered_bridge_numeric_comparison: "blocked",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
      publication_claim: "diagnostic_protocol_only",
    });
    expect(result.report.blinding).toMatchObject({
      lane_status: "synthetic_contract_only",
      custodian_receipt_status: "not_created",
      custodian_receipt_path: null,
      custodian_mapping_sha256: null,
      measured_comparison_allowed: false,
      unblinding_timestamp: null,
      automatic_unblinding_allowed: false,
      gate: "pass",
    });
    expect(
      result.report.run_order.find((row) =>
        row.stage ===
          "freeze_polarization_states_randomization_blinding_and_calibration"
      )?.gate,
    ).toBe("not_ready");
    expect(result.report.fixture_integrity).toHaveLength(3);
    expect(result.report.fixture_integrity.every((row) =>
      row.gate === "pass"
    )).toBe(true);
    expect(result.report.runtimes.polarization_qed.schema_version).toBe(
      "casimir_dp_polarization_qed_control_result/1",
    );
    expect(result.report.runtimes.thermal_radiative.schema_version).toBe(
      "casimir_dp_radiative_thermal_closure_result/1",
    );
    expect(result.report.runtimes.tensor_congruence.status).toBe("pass");
    expect(
      (result.report.runtimes.tensor_congruence.frequency_non_bridge as {
        status: string;
      }).status,
    ).toBe("same_dimension_not_connected");
    expect(result.receipt.prior_stage3_certificate_artifact_reused).toBe(
      false,
    );
    expect(result.receipt.fresh_casimir_certificate).toEqual({
      status: "pending_external_verification",
      certificate_sha256: null,
      integrity: null,
    });
  });

  it("does not mutate DP or admit a schema-only bridge", async () => {
    const result = await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T16:00:00.000Z"),
    });
    const models = new Map(
      result.report.model_comparator.models.map((model) => [
        model.model_id,
        model,
      ]),
    );

    expect(models.get("M_dp_regularized_synthetic_v1")).toMatchObject({
      state: "reused_without_mutation",
      parameter_manifest_sha256:
        "4868b598b05e76f43f9814858f81c27cf8d8a783d360deb56e26793aad7047c6",
      polarization_rule:
        "no_polarization_or_boundary_term_at_fixed_delta_rho",
    });
    expect(models.get("M_bridge_tensor_noise_v1")).toMatchObject({
      state: "blocked_no_registered_numeric_kernel",
      admitted_to_numeric_comparison: false,
      maximum_claim: "schema_congruence_only",
    });
    expect(result.report.model_comparator.blinded_measured_comparison_run).toBe(
      false,
    );
    expect(result.report.model_comparator.unblinding_allowed).toBe(false);
    expect(result.report.model_comparator).toMatchObject({
      blinding_lane_status: "synthetic_contract_only",
      measured_comparison_allowed: false,
    });
  });

  it("renders every outcome and the synthetic playground boundary", async () => {
    const result = await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T16:00:00.000Z"),
    });
    const markdown =
      renderCasimirDpPolarizationCongruenceStage4Markdown(result.report);

    expect(result.report.outcome_to_claim_map).toEqual(
      CASIMIR_DP_STAGE4_OUTCOME_TO_CLAIM_MAP,
    );
    expect(result.report.prediction_signature_matrix).toEqual(
      CASIMIR_DP_STAGE4_PREDICTION_SIGNATURES,
    );
    for (const outcome of CASIMIR_DP_STAGE4_OUTCOME_TO_CLAIM_MAP) {
      expect(markdown).toContain(`\`${outcome.outcome_id}\``);
      expect(markdown).toContain(outcome.does_not_establish);
    }
    expect(markdown).toContain(
      "Use `not_disfavored_within_powered_region`, not \"confirmed.\"",
    );
    expect(markdown).toContain(
      "Changing a synthetic fixture explores predictions only",
    );
    expect(markdown).toContain(
      "A bridge is admitted to numeric\ncomparison: `false`",
    );
    expect(markdown).toContain(
      "blinding lane reserves labels for synthetic contract tests only",
    );
  });

  it("fails closed before prediction when a fixture hash is altered", async () => {
    const root = await temporaryRoot();
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      runtime_fixtures: {
        thermal_radiative: {
          sha256: string;
        };
      };
    };
    config.runtime_fixtures.thermal_radiative.sha256 = "f".repeat(64);
    const tamperedConfigPath = path.join(root, "tampered-config.json");
    await writeFile(
      tamperedConfigPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );

    await expect(
      runCasimirDpPolarizationCongruenceStage4({
        configPath: tamperedConfigPath,
        outRoot: path.join(root, "out"),
        reportDoc: null,
      }),
    ).rejects.toThrow(
      "stage4_integrity_failure:casimir-dp-stage4-thermal.synthetic.v1.json",
    );
  });

  it("recomputes every runtime closure instead of trusting passing summaries", async () => {
    const config = CasimirDpPolarizationCongruenceStage4Config.parse(
      JSON.parse(await readFile(configPath, "utf8")),
    );
    const baseline = await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T16:00:00.000Z"),
    });
    const rebuild = (
      runtimes: typeof baseline.report.runtimes,
      second: number,
    ) =>
      buildCasimirDpPolarizationCongruenceStage4Report({
        config,
        authorityIntegrity: baseline.report.authority_integrity,
        sourceIntegrity: baseline.report.software_source_integrity,
        fixtureIntegrity: baseline.report.fixture_integrity,
        runtimes,
        bridgeNumericallyAdmitted: false,
        now: new Date(`2026-07-25T16:00:${String(second).padStart(2, "0")}.000Z`),
      });

    const polarizationFailure = structuredClone(
      baseline.report.runtimes,
    );
    (polarizationFailure.polarization_qed.basis_invariance as {
      gate: string;
    }).gate = "not_ready";
    const polarizationReport = rebuild(polarizationFailure, 1);
    expect(
      polarizationReport.final_gates.software_and_synthetic_predictions,
    ).toBe("blocked");
    expect(
      polarizationReport.final_gates.polarization_qed_synthetic_closure,
    ).toBe("blocked");

    const thermalSummaryFailure = structuredClone(baseline.report.runtimes);
    (thermalSummaryFailure.thermal_radiative.readiness as {
      thermal_closure_gate: string;
    }).thermal_closure_gate = "not_ready";
    const thermalSummaryReport = rebuild(thermalSummaryFailure, 2);
    expect(
      thermalSummaryReport.final_gates.software_and_synthetic_predictions,
    ).toBe("blocked");
    expect(
      thermalSummaryReport.final_gates.thermal_radiative_synthetic_closure,
    ).toBe("blocked");

    const thermalSubgateFailure = structuredClone(
      baseline.report.runtimes,
    );
    expect(
      (thermalSubgateFailure.thermal_radiative.readiness as {
        thermal_closure_gate: string;
      }).thermal_closure_gate,
    ).toBe("pass");
    (thermalSubgateFailure.thermal_radiative.planck_stefan_boltzmann as {
      gate: string;
    }).gate = "not_ready";
    expect(
      rebuild(thermalSubgateFailure, 3).final_gates
        .software_and_synthetic_predictions,
    ).toBe("blocked");

    const thermalNumericalFailure = structuredClone(
      baseline.report.runtimes,
    );
    (thermalNumericalFailure.thermal_radiative.numerical_validity as {
      gate: string;
    }).gate = "not_ready";
    expect(
      rebuild(thermalNumericalFailure, 4).final_gates
        .software_and_synthetic_predictions,
    ).toBe("blocked");

    const thermalNearFieldEnvelopeFailure = structuredClone(
      baseline.report.runtimes,
    );
    (thermalNearFieldEnvelopeFailure.thermal_radiative
      .near_field_validation as {
        gate: string;
      }).gate = "pass";
    expect(
      rebuild(thermalNearFieldEnvelopeFailure, 5).final_gates
        .software_and_synthetic_predictions,
    ).toBe("blocked");

    const tensorSubgateFailure = structuredClone(
      baseline.report.runtimes,
    );
    expect(tensorSubgateFailure.tensor_congruence.status).toBe("pass");
    (tensorSubgateFailure.tensor_congruence.invariance as {
      unit_round_trip_gate: string;
    }).unit_round_trip_gate = "blocked";
    const tensorSubgateReport = rebuild(tensorSubgateFailure, 6);
    expect(
      tensorSubgateReport.final_gates.software_and_synthetic_predictions,
    ).toBe("blocked");
    expect(
      tensorSubgateReport.final_gates.tensor_dimensional_congruence,
    ).toBe("blocked");

    const tensorFailureEnvelope = structuredClone(
      baseline.report.runtimes,
    );
    tensorFailureEnvelope.tensor_congruence.failures = [{
      code: "INCONSISTENT_PASS_ENVELOPE",
    }];
    expect(
      rebuild(tensorFailureEnvelope, 7).final_gates
        .software_and_synthetic_predictions,
    ).toBe("blocked");
  });

  it("fails synthetic promotion when a provenance evidence class is relabeled", async () => {
    const config = CasimirDpPolarizationCongruenceStage4Config.parse(
      JSON.parse(await readFile(configPath, "utf8")),
    );
    const baseline = await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T16:00:00.000Z"),
    });
    const runtimes = structuredClone(baseline.report.runtimes);
    ((runtimes.thermal_radiative.provenance as {
      receipt_evidence_classes: Record<string, string | null>;
    }).receipt_evidence_classes).authority = "measured";

    const report = buildCasimirDpPolarizationCongruenceStage4Report({
      config,
      authorityIntegrity: baseline.report.authority_integrity,
      sourceIntegrity: baseline.report.software_source_integrity,
      fixtureIntegrity: baseline.report.fixture_integrity,
      runtimes,
      bridgeNumericallyAdmitted: false,
      now: new Date("2026-07-25T16:00:01.000Z"),
    });

    expect(report.final_gates.synthetic_evidence_boundary).toBe("blocked");
    expect(report.final_gates.software_and_synthetic_predictions).toBe(
      "blocked",
    );
  });

  it("requires exact, complete authority, source, and fixture integrity rows", async () => {
    const config = CasimirDpPolarizationCongruenceStage4Config.parse(
      JSON.parse(await readFile(configPath, "utf8")),
    );
    const baseline = await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T16:00:00.000Z"),
    });
    const buildWith = (
      sourceIntegrity: typeof baseline.report.software_source_integrity,
    ) =>
      buildCasimirDpPolarizationCongruenceStage4Report({
        config,
        authorityIntegrity: baseline.report.authority_integrity,
        sourceIntegrity,
        fixtureIntegrity: baseline.report.fixture_integrity,
        runtimes: baseline.report.runtimes,
        bridgeNumericallyAdmitted: false,
        now: new Date("2026-07-25T16:00:01.000Z"),
      });

    expect(
      buildWith(baseline.report.software_source_integrity.slice(1))
        .final_gates.software_and_synthetic_predictions,
    ).toBe("blocked");

    const forgedPass = structuredClone(
      baseline.report.software_source_integrity,
    );
    forgedPass[0].actual_sha256 = "f".repeat(64);
    forgedPass[0].gate = "pass";
    expect(
      buildWith(forgedPass).final_gates
        .software_and_synthetic_predictions,
    ).toBe("blocked");
  });

  it("rejects a hash-updated fixture relabeled as measured", async () => {
    const root = await temporaryRoot();
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      runtime_fixtures: {
        thermal_radiative: {
          path: string;
          sha256: string;
        };
      };
    };
    const original = JSON.parse(
      await readFile(
        path.resolve(
          process.cwd(),
          config.runtime_fixtures.thermal_radiative.path,
        ),
        "utf8",
      ),
    ) as { evidence_class: string };
    original.evidence_class = "measured";
    const fixtureText = `${JSON.stringify(original, null, 2)}\n`;
    const relabeledFixturePath = path.join(root, "relabeled-thermal.json");
    await writeFile(relabeledFixturePath, fixtureText, "utf8");
    config.runtime_fixtures.thermal_radiative.path = relabeledFixturePath;
    config.runtime_fixtures.thermal_radiative.sha256 = sha256(fixtureText);
    const relabeledConfigPath = path.join(root, "relabeled-config.json");
    await writeFile(
      relabeledConfigPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );

    await expect(
      runCasimirDpPolarizationCongruenceStage4({
        configPath: relabeledConfigPath,
        outRoot: path.join(root, "out"),
        reportDoc: null,
      }),
    ).rejects.toThrow(
      "stage4_fixture_contract_failure:thermal_radiative:evidence_class",
    );
  });

  it("rejects source authority identity or tracking drift at schema admission", async () => {
    const baseline = JSON.parse(await readFile(configPath, "utf8")) as {
      software: {
        source_authorities: Array<{
          role: string;
          path: string;
          sha256: string;
          tracked: boolean;
          required_at_runtime: boolean;
        }>;
      };
    };
    const mutations: Array<(config: typeof baseline) => void> = [
      (config) => {
        config.software.source_authorities[0].tracked =
          !config.software.source_authorities[0].tracked;
      },
      (config) => {
        config.software.source_authorities[0].role =
          "substituted_runtime";
      },
      (config) => {
        config.software.source_authorities[0].path =
          "shared/substituted-runtime.ts";
      },
      (config) => {
        config.software.source_authorities[0].required_at_runtime = false;
      },
    ];

    for (const mutate of mutations) {
      const config = structuredClone(baseline);
      mutate(config);
      expect(() =>
        CasimirDpPolarizationCongruenceStage4Config.parse(config)
      ).toThrow();
    }
  });

  it("rejects sealed, sentinel-hash, and measured-promotion blinding states at schema admission", async () => {
    const baseline = JSON.parse(await readFile(configPath, "utf8")) as {
      blinding: Record<string, unknown>;
    };
    const mutations: Array<
      (blinding: Record<string, unknown>) => void
    > = [
      (blinding) => {
        blinding.custodian_receipt_status = "sealed";
      },
      (blinding) => {
        blinding.custodian_mapping_sha256 = "e".repeat(64);
      },
      (blinding) => {
        blinding.lane_status = "measured_comparison";
        blinding.custodian_receipt_status = "sealed";
        blinding.custodian_receipt_path =
          "external/custodian/stage4-receipt.json";
        blinding.custodian_mapping_sha256 = "a".repeat(64);
        blinding.measured_comparison_allowed = true;
        blinding.unblinding_timestamp = "2026-07-26T00:00:00.000Z";
      },
    ];

    for (const mutate of mutations) {
      const candidate = structuredClone(baseline);
      mutate(candidate.blinding);
      expect(() =>
        CasimirDpPolarizationCongruenceStage4Config.parse(candidate)
      ).toThrow();
    }
  });

  it("blocks aggregate software PASS when an admitted config is mutated into a false blinding state", async () => {
    const config = CasimirDpPolarizationCongruenceStage4Config.parse(
      JSON.parse(await readFile(configPath, "utf8")),
    );
    const baseline = await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T16:00:00.000Z"),
    });
    const mutations: Array<
      (blinding: Record<string, unknown>) => void
    > = [
      (blinding) => {
        blinding.custodian_receipt_status = "sealed";
      },
      (blinding) => {
        blinding.custodian_mapping_sha256 = "e".repeat(64);
      },
      (blinding) => {
        blinding.lane_status = "measured_comparison";
        blinding.measured_comparison_allowed = true;
      },
    ];

    for (const mutate of mutations) {
      const candidate = structuredClone(config) as unknown as {
        blinding: Record<string, unknown>;
      };
      mutate(candidate.blinding);
      const report = buildCasimirDpPolarizationCongruenceStage4Report({
        config: candidate as unknown as typeof config,
        authorityIntegrity: baseline.report.authority_integrity,
        sourceIntegrity: baseline.report.software_source_integrity,
        fixtureIntegrity: baseline.report.fixture_integrity,
        runtimes: baseline.report.runtimes,
        bridgeNumericallyAdmitted: false,
        now: new Date("2026-07-25T16:00:01.000Z"),
      });

      expect(report.final_gates.synthetic_blinding_contract).toBe(
        "blocked",
      );
      expect(
        report.final_gates.software_and_synthetic_predictions,
      ).toBe("blocked");
      expect(report.blinding.gate).toBe("blocked");
    }
  });

  it("uses exclusive immutable output creation", async () => {
    const root = await temporaryRoot();
    const outRoot = path.join(root, "immutable-run");
    const now = new Date("2026-07-25T16:00:00.123Z");
    await runCasimirDpPolarizationCongruenceStage4({
      configPath,
      outRoot,
      reportDoc: null,
      now,
    });

    await expect(
      runCasimirDpPolarizationCongruenceStage4({
        configPath,
        outRoot,
        reportDoc: null,
        now,
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("leaves a pre-existing partial immutable run directory untouched", async () => {
    const root = await temporaryRoot();
    const outRoot = path.join(root, "partial-run");
    const sentinelPath = path.join(outRoot, "partial-write.txt");
    await mkdir(outRoot);
    await writeFile(sentinelPath, "prior partial state\n", "utf8");

    await expect(
      runCasimirDpPolarizationCongruenceStage4({
        configPath,
        outRoot,
        reportDoc: null,
        now: new Date("2026-07-25T16:00:00.123Z"),
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe(
      "prior partial state\n",
    );
    await expect(
      readFile(
        path.join(
          outRoot,
          "polarization-congruence-stage4-report.json",
        ),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
