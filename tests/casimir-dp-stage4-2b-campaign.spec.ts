import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CASIMIR_DP_STAGE4_2B_OUTCOME_TO_CLAIM_MAP,
  renderCasimirDpApparatusCoherenceResidualStage4_2BMarkdown,
  runCasimirDpApparatusCoherenceResidualStage4_2B,
} from "../scripts/research/run-casimir-dp-apparatus-coherence-residual-stage4-2b";
import {
  CASIMIR_DP_APPARATUS_COHERENCE_RESIDUAL_STAGE4_2B_RUN_ORDER,
  CASIMIR_DP_STAGE4_2B_REQUIRED_AUTHORITY_ROLES,
  CASIMIR_DP_STAGE4_2B_REQUIRED_FIXTURE_CASE_IDS,
  CasimirDpApparatusCoherenceResidualStage4_2BConfig,
} from "../shared/contracts/casimir-dp-apparatus-coherence-residual-stage4-2b.v1";

const configPath = path.resolve(
  process.cwd(),
  "configs/research/casimir-dp-apparatus-coherence-residual-stage4-2b.v1.json",
);
const temporaryRoots: string[] = [];
const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const stableJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;
const solveLower = (lower: number[][], vector: number[]): number[] => {
  const output = Array(vector.length).fill(0);
  for (let row = 0; row < vector.length; row += 1) {
    let value = vector[row];
    for (let column = 0; column < row; column += 1) {
      value -= lower[row][column] * output[column];
    }
    output[row] = value / lower[row][row];
  }
  return output;
};

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "casimir-dp-stage4-2b-"),
  );
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

describe("Casimir-DP Stage-4.2B campaign", () => {
  it("freezes the exact authority, fixture, run-order, and claim policy", async () => {
    const config =
      CasimirDpApparatusCoherenceResidualStage4_2BConfig.parse(
        JSON.parse(await readFile(configPath, "utf8")),
      );

    expect(config.run_order).toEqual([
      ...CASIMIR_DP_APPARATUS_COHERENCE_RESIDUAL_STAGE4_2B_RUN_ORDER,
    ]);
    expect(config.upstream_authorities.map((row) => row.role)).toEqual([
      ...CASIMIR_DP_STAGE4_2B_REQUIRED_AUTHORITY_ROLES,
    ]);
    expect(config.runtime_fixture.required_case_ids).toEqual([
      ...CASIMIR_DP_STAGE4_2B_REQUIRED_FIXTURE_CASE_IDS,
    ]);
    expect(config.runtime_fixture.required_case_ids).toHaveLength(19);
    expect(config.software.module_ids).toHaveLength(7);
    expect(config.software.reused_module_ids.length).toBeGreaterThanOrEqual(
      10,
    );
    expect(config.dp_applicability_manifest).toMatchObject({
      generator: "nonrelativistic_markovian_mass_density_dp",
      r0_frozen_before_held_out: true,
      fitted_amplitude_allowed: false,
      boundary_variable_in_unmodified_generator: false,
      complete_joint_system_equivalence_required_for_boundary_identity:
        true,
      xenon_r0_parameter_map_status: "contextual_not_admitted",
      xenon_bound_used_to_truncate_parameter_space: false,
    });
    expect(config.apparatus.state_preparation_evidence_class).toBe(
      "design_assumption",
    );
    expect(config.evidence_policy).toMatchObject({
      synthetic_can_validate_software_only: true,
      synthetic_can_satisfy_measured_gate: false,
      unexplained_residual_is_collapse: false,
      boundary_residual_confirms_unmodified_dp: false,
      shared_constants_open_observable_bridge: false,
      automatic_unblinding_allowed: false,
      null_excludes_only_powered_preregistered_region: true,
    });
    expect(config.promotion_allowed).toBe(false);
    expect(config.observable_bridge_edges_allowed).toBe(false);
    expect(config.source_registry.find(
      (row) =>
        row.source_id ===
          "pedalino-2026-nanoparticle-interference",
    )?.numeric_values_admitted).toBe(false);
    const runnerSource = await readFile(
      path.resolve(
        process.cwd(),
        "scripts/research/run-casimir-dp-apparatus-coherence-residual-stage4-2b.ts",
      ),
      "utf8",
    );
    expect(runnerSource).not.toContain("function buildRuntimeFInput(");
    expect(runnerSource).not.toMatch(/\bconst hadamard\b/i);
    expect(runnerSource).toContain(
      "buildFixtureOnlyUnderpoweredIdentifiableFInput",
    );
    expect(config.final_status_policy).toEqual({
      software_and_synthetic_diagnostics: "pass",
      measured_evidence: "not_ready",
      ordinary_decoherence_closure: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
      publication_claim:
        "apparatus_power_and_identifiability_forecast_only",
    });
  });

  it("executes A-G, all 19 mutations, and writes immutable hash-backed outputs", async () => {
    const outRoot = path.join(await temporaryRoot(), "immutable-run");
    const result =
      await runCasimirDpApparatusCoherenceResidualStage4_2B({
        configPath,
        outRoot,
        reportDoc: null,
        now: new Date("2026-07-26T12:34:56.000Z"),
      });

    expect(result.outDir).toBe(path.resolve(outRoot));
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.integrity_gate).toBe("pass");
    expect(result.report.immutable_upstream_authorities_unchanged).toBe(
      true,
    );
    expect(result.report.authority_integrity).toHaveLength(29);
    expect(result.report.authority_integrity.every(
      (row) =>
        row.gate === "pass" &&
        row.actual_sha256 === row.expected_sha256,
    )).toBe(true);
    expect(result.report.software_source_integrity.every(
      (row) =>
        row.gate === "pass" &&
        /^[a-f0-9]{64}$/.test(row.actual_sha256 ?? ""),
    )).toBe(true);
    expect(result.report.fixture_integrity.every(
      (row) => row.gate === "pass",
    )).toBe(true);

    expect(result.report.runtime_output_receipts.map(
      (row) => [row.runtime, row.gate],
    )).toEqual([
      ["A", "pass"],
      ["B", "pass"],
      ["C", "pass"],
      ["D", "pass"],
      ["E", "pass"],
      ["F", "blocked"],
    ]);
    const coupled = result.report as any;
    const adapters = coupled.coupling_adapters;
    const registry = adapters.design_registry;
    const runtimeInputs = coupled.runtime_inputs;
    expect(registry.cells).toHaveLength(216);
    expect(registry.control_cells).toHaveLength(30);
    expect(registry.cells.map((cell: any) => cell.row_index)).toEqual(
      Array.from({ length: 216 }, (_, index) => index),
    );
    expect(registry.cell_order_sha256).toBe(sha256(stableJson(
      registry.cells.map((cell: any) => cell.cell_id),
    )));
    const {
      registry_sha256: registrySha,
      ...registryCore
    } = registry;
    expect(registrySha).toBe(sha256(stableJson(registryCore)));

    const pilotTemplates =
      registry.partition_cell_templates.pilot;
    const replicationTemplates =
      registry.partition_cell_templates.independent_replication;
    expect(pilotTemplates.cells).toHaveLength(216);
    expect(replicationTemplates.cells).toHaveLength(216);
    expect(pilotTemplates.cell_count).toBe(216);
    expect(replicationTemplates.cell_count).toBe(216);
    expect(pilotTemplates.cell_order_sha256).toBe(sha256(stableJson(
      pilotTemplates.cells.map((cell: any) => cell.template_cell_id),
    )));
    expect(replicationTemplates.cell_order_sha256).toBe(
      sha256(stableJson(
        replicationTemplates.cells.map(
          (cell: any) => cell.template_cell_id,
        ),
      )),
    );
    const primaryIds = new Set(
      registry.cells.map((cell: any) => cell.cell_id),
    );
    const pilotIds = new Set(
      pilotTemplates.cells.map((cell: any) => cell.template_cell_id),
    );
    const replicationIds = new Set(
      replicationTemplates.cells.map(
        (cell: any) => cell.template_cell_id,
      ),
    );
    expect(primaryIds.size).toBe(216);
    expect(pilotIds.size).toBe(216);
    expect(replicationIds.size).toBe(216);
    expect([...pilotIds].every((id) => !primaryIds.has(id))).toBe(true);
    expect([...replicationIds].every(
      (id) => !primaryIds.has(id) && !pilotIds.has(id),
    )).toBe(true);
    expect(pilotTemplates.artifact_namespace).not.toBe(
      replicationTemplates.artifact_namespace,
    );
    expect([
      ...pilotTemplates.cells,
      ...replicationTemplates.cells,
    ].every(
      (cell: any) =>
        cell.measured_evidence === "not_ready" &&
        cell.instantiated === false &&
        cell.scored_with_primary_confirmatory === false,
    )).toBe(true);
    expect(replicationTemplates.cells.every(
      (cell: any) => cell.nuisance_refit_allowed === false,
    )).toBe(true);

    const runtimeA = coupled.runtime_outputs.A;
    const aToD = adapters.runtime_a_to_d;
    expect(aToD.source_runtime_a_output_sha256).toBe(
      sha256(stableJson(runtimeA)),
    );
    expect(aToD.nominal_tuple).toEqual({
      mass_kg: runtimeA.object_ledger.total_mass_kg,
      radius_m: runtimeA.object_ledger.characteristic_radius_m,
      branch_separation_m:
        runtimeA.dimensionless_scale_vector.branch_separation_over_radius *
        runtimeA.object_ledger.characteristic_radius_m,
      R0_m:
        runtimeA.dimensionless_scale_vector.smearing_length_over_radius *
        runtimeA.object_ledger.characteristic_radius_m,
      hold_time_s:
        runtimeA.dimensionless_scale_vector.c_hold_time_over_radius *
        runtimeA.object_ledger.characteristic_radius_m / 299_792_458,
    });

    const runtimeB = coupled.runtime_outputs.B;
    const bToC = adapters.runtime_b_to_c;
    expect(bToC.source_runtime_b_output_sha256).toBe(
      sha256(stableJson(runtimeB)),
    );
    expect(bToC.target_cell_registry_sha256).toBe(registrySha);
    const cCells = runtimeInputs.CInput.gaussian_cells;
    for (const [process, prefix] of [
      ["emission", "thermal-emission"],
      ["absorption", "thermal-absorption"],
      ["scattering", "thermal-scattering"],
    ] as const) {
      expect(bToC.chi_vectors[process]).toHaveLength(216);
      cCells.forEach((cell: any, index: number) => {
        const designCell = registry.cells[index];
        const nominalRadius = registry.object_configurations.find(
          (object: any) => object.scale_from_runtime_a === 1,
        ).radius_m;
        const areaScale = (designCell.radius_m / nominalRadius) ** 2;
        const eventField = `${process}_rate_s`;
        const expectedChi = areaScale *
          runtimeB.thermal_jump_localization.spectral_rows.reduce(
            (sum: number, spectral: any) => {
              const argument = 2 * Math.PI *
                designCell.branch_separation_m /
                spectral.wavelength_m;
              const sinc = Math.abs(argument) < 1e-4
                ? 1 - argument ** 2 / 6 + argument ** 4 / 120
                : Math.sin(argument) / argument;
              return sum +
                spectral[eventField] * (1 - sinc);
            },
            0,
          ) * designCell.hold_time_s;
        expect(bToC.chi_vectors[process][index]).toBe(expectedChi);
        const contribution = cell.non_gaussian_contributions.find(
          (row: any) =>
            row.contribution_id ===
              `${prefix}:${registry.cells[index].cell_id}`,
        );
        expect(contribution.chi).toBe(bToC.chi_vectors[process][index]);
      });
    }

    const cRows = coupled.runtime_outputs.C.cell_predictions;
    const dRows = coupled.runtime_outputs.D.named_dp_prediction.rows;
    const heldOutE = runtimeInputs.EInput.observations.filter(
      (row: any) => row.analysis_role === "held_out",
    );
    expect(cRows).toHaveLength(216);
    expect(dRows).toHaveLength(216);
    expect(heldOutE).toHaveLength(216);
    registry.cells.forEach((cell: any, index: number) => {
      expect(cRows[index].cell_id).toBe(cell.cell_id);
      expect(dRows[index]).toMatchObject({
        cell_id: cell.cell_id,
        cell_registry_sha256: registrySha,
        mass_kg: cell.mass_kg,
        branch_separation_m: cell.branch_separation_m,
        hold_time_s: cell.hold_time_s,
      });
      expect(dRows[index].chi_DP).toBe(
        dRows[index].Gamma_DP_s * cell.hold_time_s,
      );
      expect(heldOutE[index]).toMatchObject({
        cell_id: cell.cell_id,
        ordinary_chi: cRows[index].total_ordinary_chi,
        ordinary_phase_rad: cRows[index].ordinary_coherent_phase_rad,
        dp_chi: dRows[index].chi_DP,
      });
    });
    expect(runtimeInputs.EInput.freeze.prediction_vector_sha256).toBe(
      adapters.c_d_to_e_prediction_vector_sha256,
    );

    const complexAdapter =
      adapters.c_and_quadrature_to_e_complex_covariance;
    expect(complexAdapter.runtime_c_output_sha256).toBe(
      sha256(stableJson(coupled.runtime_outputs.C)),
    );
    expect(complexAdapter.matrix_sha256).toBe(
      sha256(stableJson(runtimeInputs.EInput.complex_covariance)),
    );
    expect(
      runtimeInputs.EInput.covariance_receipt.jacobian_receipt_sha256,
    ).toBe(complexAdapter.receipt_sha256);
    expect(adapters.stage3_complex_to_e.recovered_complex_rows)
      .toHaveLength(216);
    adapters.stage3_complex_to_e.recovered_complex_rows.forEach(
      (row: any, index: number) => {
        expect(row).toMatchObject({
          cell_id: heldOutE[index].cell_id,
          real: heldOutE[index].real_coherence,
          imaginary: heldOutE[index].imaginary_coherence,
          visibility: heldOutE[index].visibility,
          phase_rad: heldOutE[index].phase_rad,
        });
      },
    );

    const eToF = adapters.e_c_d_to_f_whitening;
    const lower = coupled.runtime_outputs.E.cholesky_lower;
    expect(lower).not.toBeNull();
    expect(eToF.cholesky_lower_sha256).toBe(
      sha256(stableJson(lower)),
    );
    for (const lane of [
      "intercept",
      "thermal",
      "electromagnetic",
      "vibration",
      "gas",
      "readout",
      "dp",
    ]) {
      const raw = eToF.raw_signature_vectors[lane];
      const expectedWhitened = solveLower(lower, raw);
      const actualWhitened =
        eToF.whitened_signature_vectors[lane];
      expect(actualWhitened).toEqual(expectedWhitened);
      expect(eToF.raw_signature_sha256[lane]).toBe(
        sha256(stableJson(raw)),
      );
      expect(eToF.whitened_signature_sha256[lane]).toBe(
        sha256(stableJson(actualWhitened)),
      );
      expect(runtimeInputs.FInput.whitened_signatures_per_sqrt_window.find(
        (row: any) => row.lane === lane,
      )?.values).toEqual(actualWhitened);
    }
    const expectedRawDp = registry.cells.flatMap(
      (_cell: any, index: number) => {
        const ordinaryChi = cRows[index].total_ordinary_chi;
        const phase = cRows[index].ordinary_coherent_phase_rad;
        const baseVisibility = 0.92 * Math.exp(-ordinaryChi);
        const dpVisibility = 0.92 *
          Math.exp(-(ordinaryChi + dRows[index].chi_DP));
        return [
          baseVisibility * Math.cos(phase) -
            dpVisibility * Math.cos(phase),
          baseVisibility * Math.sin(phase) -
            dpVisibility * Math.sin(phase),
        ];
      },
    );
    expect(eToF.raw_signature_vectors.dp).toEqual(expectedRawDp);
    expect(result.report.runtime_outputs.E.pilot_partition_gate).toBe(
      "pass",
    );
    expect(result.report.runtime_outputs.F.power_coverage_gate).toBe(
      "pass",
    );
    expect(
      result.report.runtime_outputs.D.external_bound_mapping
        .parameter_region_status,
    ).toBe("contextual_only");
    expect(
      result.report.runtime_outputs.D.conditional_boundary_null
        .experimental_branch_equivalence.gate,
    ).toBe("not_ready");
    expect(
      result.report.runtime_outputs.D.conditional_boundary_null
        .boundary_null_claim_allowed,
    ).toBe(false);
    expect(
      result.report.predecessor_reconciliation
        .stage3_complex_coherence.evidence_class,
    ).toBe("synthetic_fixture");
    expect(
      result.report.predecessor_reconciliation
        .stage3_complex_coherence.measured_evidence_gate,
    ).toBe("not_ready");
    expect(
      result.report.predecessor_reconciliation.reuse_ledger.find(
        (row) =>
          row.module_id === "shared/casimir-dp-complex-coherence.ts",
      )?.reconciliation,
    ).toBe("executed_by_runtime_g_against_immutable_stage3_fixture");
    expect(
      result.report.predecessor_reconciliation
        .optical_and_casimir_diagnostics.optical_response
        .maximum_kramers_kronig_relative_error,
    ).toBeLessThan(0.03);
    const coverage = result.report.power_coverage_diagnostic;
    expect(coverage.input).toMatchObject({
      method:
        "deterministic_stratified_standard_normal_quantile_grid",
      two_sided_alpha: 0.05,
      strata: 200_000,
      confirmatory_data_used: false,
    });
    expect(coverage.result).toMatchObject({
      gate: "pass",
      evidence_class: "synthetic_fixture",
      measured_evidence: "not_ready",
    });
    expect(coverage.result.empirical_coverage_probability)
      .toBeGreaterThanOrEqual(0.95);
    expect(coverage.result.absolute_coverage_error).toBeLessThanOrEqual(
      coverage.input.maximum_absolute_coverage_error,
    );
    expect(coverage.receipt.input_sha256).toBe(
      sha256(stableJson(coverage.input)),
    );
    expect(coverage.receipt.result_sha256).toBe(
      sha256(stableJson(coverage.result)),
    );
    const {
      receipt_sha256: coverageReceiptSha256,
      ...coverageReceiptContent
    } = coverage.receipt;
    expect(coverageReceiptSha256).toBe(
      sha256(stableJson(coverageReceiptContent)),
    );

    expect(result.report.fixture_summary).toEqual({
      required: 19,
      executed: 19,
      matched_expected_gate_and_status: 19,
      all_pass: true,
    });
    expect(result.report.fixture_results.map((row) => row.case_id))
      .toEqual([
        ...CASIMIR_DP_STAGE4_2B_REQUIRED_FIXTURE_CASE_IDS,
      ]);
    expect(result.report.fixture_results.every(
      (row) =>
        row.gate === "pass" &&
        row.observed_gate === row.expected_gate &&
        row.observed_status === row.expected_status &&
        /^[a-f0-9]{64}$/.test(row.mutation_fingerprint_sha256) &&
        /^[a-f0-9]{64}$/.test(row.runtime_output_sha256) &&
        row.evidence_class === "synthetic_fixture" &&
        row.measured_evidence === "not_ready" &&
        row.collapse_identification === "blocked" &&
        row.manifold_dynamics === "blocked" &&
        row.physical_viability === "not_evaluated",
    )).toBe(true);
    expect(new Set(
      result.report.fixture_results.map(
        (row) => row.mutation_fingerprint_sha256,
      ),
    ).size).toBe(19);
    expect(
      result.report.fixture_results.find(
        (row) => row.case_id === "correlated_covariance_false_residual",
      ),
    ).toMatchObject({
      observed_gate: "blocked",
      observed_status: "false_residual_prevented",
      first_failure_code:
        "schema_rejected_omitted_full_cross_covariance",
    });
    expect(
      result.report.fixture_results.find(
        (row) => row.case_id === "boundary_only_residual",
      ),
    ).toMatchObject({
      observed_gate: "pass",
      observed_status: "boundary_correlated_anomaly_only",
      evidence: {
        registered_dp_contrast_zero: true,
        observed_boundary_residual_present: true,
        bridge_admitted: false,
      },
    });

    expect(result.report.run_order).toHaveLength(22);
    expect(result.report.run_order.every(
      (row, index) =>
        row.index === index &&
        row.stage ===
          CASIMIR_DP_APPARATUS_COHERENCE_RESIDUAL_STAGE4_2B_RUN_ORDER[
            index
          ] &&
        row.evidence_refs.length > 0 &&
        row.gate === "pass",
    )).toBe(true);
    expect(result.report.apparatus_go_no_go).toMatchObject({
      verdict: "signature_not_identifiable",
      planned_paired_windows: 1600,
      required_paired_windows: null,
      achieved_dp_power: null,
      powered_preregistered_region_ids: [],
      null_exclusion_region_ids_if_measured_null: [],
      interpretation:
        "current_apparatus_signature_identifiability_no_go_is_not_a_dp_exclusion",
    });
    expect(result.report.apparatus_go_no_go.signature_rank).toBe(7);
    expect(
      result.report.apparatus_go_no_go.maximum_abs_whitened_cosine,
    ).toBe(
      result.report.runtime_outputs.F.maximum_abs_whitened_cosine,
    );
    expect(
      result.report.apparatus_go_no_go
        .normalized_gram_condition_number,
    ).toBe(
      result.report.runtime_outputs.F.normalized_gram_condition_number,
    );
    expect(
      result.report.apparatus_go_no_go.missing_numeric_control_forecast,
    ).toContain("30 frozen OAT/sham/detuned control rows");
    expect(result.report.final_gates).toEqual({
      software_and_synthetic_diagnostics: "pass",
      measured_evidence: "not_ready",
      ordinary_decoherence_closure: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
      publication_claim:
        "apparatus_power_and_identifiability_forecast_only",
    });

    const reportJsonText = await readFile(
      path.join(
        outRoot,
        "apparatus-coherence-residual-stage4-2b-report.json",
      ),
      "utf8",
    );
    const reportMarkdownText = await readFile(
      path.join(
        outRoot,
        "apparatus-coherence-residual-stage4-2b-report.md",
      ),
      "utf8",
    );
    const traceText = await readFile(
      path.join(
        outRoot,
        "apparatus-coherence-residual-stage4-2b-trace.jsonl",
      ),
      "utf8",
    );
    const receiptText = await readFile(
      path.join(
        outRoot,
        "apparatus-coherence-residual-stage4-2b-receipt.json",
      ),
      "utf8",
    );
    const receipt = JSON.parse(receiptText) as {
      outputs: Array<{
        path: string;
        sha256: string;
        records?: number;
      }>;
      prior_stage_certificate_artifact_reused: boolean;
      fresh_casimir_certificate: {
        status: string;
        certificate_sha256: null;
        integrity: null;
      };
      power_coverage_receipt: {
        receipt_sha256: string;
      };
    };
    const outputText = new Map([
      [
        "apparatus-coherence-residual-stage4-2b-report.json",
        reportJsonText,
      ],
      [
        "apparatus-coherence-residual-stage4-2b-report.md",
        reportMarkdownText,
      ],
      [
        "apparatus-coherence-residual-stage4-2b-trace.jsonl",
        traceText,
      ],
    ]);
    expect(receipt.outputs).toHaveLength(3);
    expect(receipt.outputs.every(
      (output) =>
        sha256(outputText.get(output.path) ?? "") === output.sha256,
    )).toBe(true);
    expect(receipt.outputs.find(
      (output) => output.path.endsWith("trace.jsonl"),
    )?.records).toBe(42);
    expect(traceText.trim().split(/\r?\n/)).toHaveLength(42);
    expect(traceText).toContain('"record_type":"power_coverage_diagnostic"');
    expect(receipt.power_coverage_receipt.receipt_sha256).toBe(
      coverage.receipt.receipt_sha256,
    );
    expect(result.receipt_sha256).toBe(sha256(receiptText));
    expect(receipt.prior_stage_certificate_artifact_reused).toBe(
      false,
    );
    expect(receipt.fresh_casimir_certificate).toEqual({
      status: "pending_external_verification",
      certificate_sha256: null,
      integrity: null,
    });
    expect(reportMarkdownText).toContain(
      "current-apparatus signature-identifiability no-go",
    );
    expect(reportMarkdownText).toContain(
      "The XENONnT bound is contextual",
    );
  }, 30_000);

  it("renders the claim ceiling and no-go without promoting a synthetic result", async () => {
    const outRoot = path.join(await temporaryRoot(), "render-run");
    const result =
      await runCasimirDpApparatusCoherenceResidualStage4_2B({
        configPath,
        outRoot,
        reportDoc: null,
        now: new Date("2026-07-26T12:35:00.000Z"),
      });
    const markdown =
      renderCasimirDpApparatusCoherenceResidualStage4_2BMarkdown(
        result.report,
      );

    expect(CASIMIR_DP_STAGE4_2B_OUTCOME_TO_CLAIM_MAP).toHaveLength(9);
    expect(CASIMIR_DP_STAGE4_2B_OUTCOME_TO_CLAIM_MAP.every(
      (row) =>
        row.allowed_claim.length > 0 &&
        row.explicit_nonclaim.length > 0,
    )).toBe(true);
    expect(markdown).toContain(
      "measurement of ordinary decoherence, objective collapse",
    );
    expect(markdown).toContain(
      "not an exclusion of DP",
    );
    expect(markdown).toContain(
      "conditional boundary null is enforced only",
    );
    expect(markdown).toContain(
      "Measured ordinary-decoherence closure",
    );
  }, 30_000);
});
