import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CASIMIR_DP_STAGE4_2A_CROSS_SCALE_CALIBRATION_LADDER,
  CASIMIR_DP_STAGE4_2A_EVIDENCE_LEVELS,
  CASIMIR_DP_STAGE4_2A_OUTCOME_TO_CLAIM_MAP,
  renderCasimirDpElectronMassHiggsAnchorStage4_2AMarkdown,
  runCasimirDpElectronMassHiggsAnchorStage4_2A,
} from "../scripts/research/run-casimir-dp-electron-mass-higgs-anchor-stage4-2a";
import {
  CASIMIR_DP_ELECTRON_MASS_HIGGS_ANCHOR_STAGE4_2A_RUN_ORDER,
  CasimirDpElectronMassHiggsAnchorStage4_2AConfig,
} from "../shared/contracts/casimir-dp-electron-mass-higgs-anchor-stage4-2a.v1";
import { buildCasimirDpStudyTheoryBadgesV1 } from "../shared/theory/casimir-dp-study-theory-badges";

const configPath = path.resolve(
  process.cwd(),
  "configs/research/casimir-dp-electron-mass-higgs-anchor-stage4-2a.v1.json",
);
const temporaryRoots: string[] = [];

const immutableStage4_1Hashes = {
  stage4_1_config:
    "e2625c86a5366258677c58cbe78e73b8fcc1893ecd417b48765d74488f953478",
  stage4_1_authority_manifest:
    "cd681b977d47de6715322249c1026ecf5e963ac81735d6c29aa5100942824f4f",
  stage4_1_immutable_report_json:
    "8f06bf394e64d40d24530e9e93b5d61edece3752318ece2095f27d61f55042c5",
  stage4_1_immutable_report_markdown:
    "6ae9530701fc35aa544b438709e789929b45eaf53ae950ec93ed976bb9703ba6",
  stage4_1_immutable_campaign_receipt:
    "d835b56a87ed6f6d78edfb8e627bceecb931575348232ca0fd77795f5ffe24af",
  stage4_1_downstream_verification_receipt:
    "a7f60aa9b12b7c1c143a7a1681048a61275495aaed33e1dfa6caa11e9e44b8db",
} as const;

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "casimir-dp-stage4-2a-"),
  );
  temporaryRoots.push(root);
  return root;
}

async function loadRawConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(configPath, "utf8"),
  ) as Record<string, unknown>;
}

async function loadLiveSoftwareConfig(): Promise<Record<string, unknown>> {
  const rawConfig = await loadRawConfig();
  const software = rawConfig.software as {
    source_authorities: Array<{
      role: string;
      path: string;
      sha256: string;
    }>;
  };
  const graphAuthority = software.source_authorities.find(
    (authority) => authority.role === "stage4_2a_theory_badge_graph",
  );
  if (graphAuthority === undefined) {
    throw new Error("stage4_2a_theory_badge_graph_authority_missing");
  }
  const graphBytes = await readFile(
    path.resolve(process.cwd(), graphAuthority.path),
  );
  graphAuthority.sha256 = createHash("sha256").update(graphBytes).digest("hex");
  return rawConfig;
}

async function liveSoftwareConfigPath(): Promise<string> {
  const root = await temporaryRoot();
  const rawConfig = await loadLiveSoftwareConfig();
  const copiedConfig = path.join(root, "live-software-config.json");
  await writeFile(
    copiedConfig,
    `${JSON.stringify(rawConfig, null, 2)}\n`,
    "utf8",
  );
  return copiedConfig;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

describe("Casimir-DP Stage-4.2A campaign", () => {
  it("freezes the exact authority tuple, order, policies, and zero-bridge ceiling", async () => {
    const config =
      CasimirDpElectronMassHiggsAnchorStage4_2AConfig.parse(
        await loadRawConfig(),
      );

    expect(config.run_order).toEqual([
      ...CASIMIR_DP_ELECTRON_MASS_HIGGS_ANCHOR_STAGE4_2A_RUN_ORDER,
    ]);
    expect(
      Object.fromEntries(
        config.upstream_authorities.map((authority) => [
          authority.role,
          authority.sha256,
        ]),
      ),
    ).toEqual(immutableStage4_1Hashes);
    expect(config.source_registry).toHaveLength(8);
    expect(new Set(
      config.source_registry.map((source) => source.source_id),
    ).size).toBe(8);
    expect(config.runtime_fixtures).toHaveLength(2);
    expect(config.software.source_authorities).toHaveLength(5);
    expect(
      config.software.source_authorities.map((authority) =>
        authority.role
      ),
    ).toContain("stage4_2a_theory_badge_graph");
    expect(config.observable_bridge_edges_allowed).toBe(false);
    expect(config.promotion_allowed).toBe(false);
    expect(config.evidence_policy).toMatchObject({
      penning_replay_is_static_weighing: false,
      codata_conversions_are_independent_confirmations: false,
      inferred_tree_yukawa_is_direct_higgs_measurement: false,
      collider_upper_limit_is_electron_yukawa_observation: false,
      planck_integral_and_sigma_are_independent_theories: false,
      solar_color_temperature_equals_bolometric_effective_temperature:
        false,
      common_h_or_dimensions_imply_dp_connection: false,
      cross_covariance_required_for_independence_significance: true,
      measured_casimir_or_coherence_gate_can_be_satisfied: false,
      observable_bridge_edges_allowed: false,
    });
    expect(config.final_status_policy).toMatchObject({
      source_authority_integrity: "pass",
      penning_observational_replay: "pass",
      conditional_sm_tree_mapping: "pass",
      planck_spectral_density_closure: "pass",
      stefan_boltzmann_closure: "pass",
      solar_color_temperature_recovery: "pass",
      solar_bolometric_temperature_recovery: "pass",
      temperature_semantics: "pass",
      independent_electron_mass_validation: "not_ready",
      direct_electron_yukawa_observation: "not_ready",
      electron_mass_from_higgs_identification: "blocked",
      higgs_origin_identification: "blocked",
      measured_spectral_fit_significance: "not_ready",
      measured_casimir_coherence_evidence: "not_ready",
      casimir_higgs_dp_transfer: "blocked",
      compton_to_collapse_clock: "blocked",
      thermal_to_dp_transfer: "blocked",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      cosmological_lift: "blocked",
      physical_viability: "not_evaluated",
      publication_claim:
        "diagnostic_cross_scale_calibration_only",
    });
  });

  it("runs both source-backed lanes and writes exclusive hash-backed artifacts", async () => {
    const outRoot = path.join(await temporaryRoot(), "immutable-run");
    const regressionConfigPath = await liveSoftwareConfigPath();
    const result =
      await runCasimirDpElectronMassHiggsAnchorStage4_2A({
        configPath: regressionConfigPath,
        outRoot,
        reportDoc: null,
        now: new Date("2026-07-25T21:00:00.000Z"),
      });

    expect(result.outDir).toBe(path.resolve(outRoot));
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.integrity_gate).toBe("pass");
    expect(result.report.immutable_stage4_1_unchanged).toBe(true);
    expect(result.report.authority_integrity.every(
      (row) => row.gate === "pass",
    )).toBe(true);
    expect(result.report.software_source_integrity.every(
      (row) => row.gate === "pass",
    )).toBe(true);
    expect(result.report.fixture_integrity.every(
      (row) => row.gate === "pass",
    )).toBe(true);
    expect(result.report.fixture_integrity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "tsis_hsrs_frozen_snapshot",
          path:
            "configs/research/source-snapshots/tsis1-hsrs-20260725-480-800nm.csv",
          expected_sha256:
            "a9b28d4ec51a10e077fd6999f992fe8829c18328a77c50ad4c0849ef1bd23d79",
          actual_sha256:
            "a9b28d4ec51a10e077fd6999f992fe8829c18328a77c50ad4c0849ef1bd23d79",
          gate: "pass",
        }),
      ]),
    );
    expect(result.report.run_order).toHaveLength(
      CASIMIR_DP_ELECTRON_MASS_HIGGS_ANCHOR_STAGE4_2A_RUN_ORDER
        .length,
    );
    expect(result.report.run_order.every(
      (row, index) =>
        row.index === index &&
        row.stage ===
          CASIMIR_DP_ELECTRON_MASS_HIGGS_ANCHOR_STAGE4_2A_RUN_ORDER[
            index
          ] &&
        row.gate === "pass" &&
        row.evidence_refs.length > 0 &&
        !row.evidence_refs.includes("missing_step_receipt"),
    )).toBe(true);
    const liveGraph = buildCasimirDpStudyTheoryBadgesV1();
    expect(result.report.theory_badge_projection).toEqual({
      expected_badge_ids: [
        "study.casimir_dp.electron_mass_higgs_anchor_stage4_2a",
        "study.casimir_dp.planck_solar_calibration_stage4_2a",
      ],
      graph_badge_count: liveGraph.badges.length,
      graph_edge_count: liveGraph.edges.length,
      projected_badge_count: 2,
      calculator_payload_count: 0,
      observable_bridge_edge_count: 0,
      gate: "pass",
    });
    expect(
      result.report.calibrations.electron_mass_higgs_anchor.status,
    ).toBe("pass");
    expect(
      result.report.calibrations.planck_solar_radiometry.status,
    ).toBe("pass");
    expect(
      result.report.calibrations.planck_solar_radiometry
        .solar_spectral_color_temperature
        .color_temperature_planck_wien_K,
    ).toBeCloseTo(5795.54391, 5);
    expect(
      result.report.calibrations.planck_solar_radiometry
        .solar_bolometric_effective_temperature
        .effective_temperature_bolometric_K,
    ).toBeCloseTo(5772.003429, 5);
    expect(result.report.cross_scale_nonbridge).toMatchObject({
      observable_bridge_edges_added: 0,
      mass_frequency_identity_is_new_dynamics: false,
      solar_temperature_supports_dp: false,
      apparatus_thermal_transfer_modeled: false,
      cosmological_kernel_registered: false,
      gate: "pass",
    });
    expect(result.receipt).toMatchObject({
      status:
        "campaign_runtime_completed_pending_external_verification",
      immutable_stage4_1_unchanged: true,
      cross_scale_dp_nonbridge_preserved: true,
      observable_bridge_edges_added: 0,
      prior_stage4_1_certificate_artifact_reused: false,
      fresh_casimir_certificate: {
        status: "pending_external_verification",
        certificate_sha256: null,
        integrity: null,
      },
    });

    const reportJson = JSON.parse(
      await readFile(
        path.join(
          outRoot,
          "electron-mass-higgs-anchor-stage4-2a-report.json",
        ),
        "utf8",
      ),
    ) as { campaign_gate: string };
    const reportMarkdown = await readFile(
      path.join(
        outRoot,
        "electron-mass-higgs-anchor-stage4-2a-report.md",
      ),
      "utf8",
    );
    const receiptJson = JSON.parse(
      await readFile(
        path.join(
          outRoot,
          "electron-mass-higgs-anchor-stage4-2a-receipt.json",
        ),
        "utf8",
      ),
    ) as { outputs: unknown[] };
    expect(reportJson.campaign_gate).toBe("pass");
    expect(receiptJson.outputs).toHaveLength(2);
    expect(reportMarkdown).toContain(
      "This is a cross-scale calibration and dependency ladder.",
    );
    expect(reportMarkdown).toContain("Gamma_DP=E_G/hbar");
  });

  it("publishes a falsifiable ladder without promoting any DP evidence level", () => {
    expect(CASIMIR_DP_STAGE4_2A_CROSS_SCALE_CALIBRATION_LADDER)
      .toHaveLength(5);
    expect(CASIMIR_DP_STAGE4_2A_EVIDENCE_LEVELS).toEqual([
      expect.objectContaining({
        level: 1,
        status: "not_ready",
        established_by_stage4_2a: false,
      }),
      expect.objectContaining({
        level: 2,
        status: "blocked",
        established_by_stage4_2a: false,
      }),
      expect.objectContaining({
        level: 3,
        status: "blocked",
        established_by_stage4_2a: false,
      }),
    ]);
    expect(CASIMIR_DP_STAGE4_2A_OUTCOME_TO_CLAIM_MAP).toHaveLength(5);
    expect(
      CASIMIR_DP_STAGE4_2A_OUTCOME_TO_CLAIM_MAP.every(
        (row) =>
          row.does_not_establish.length > 0 &&
          row.maximum_claim.length > 0,
      ),
    ).toBe(true);
  });

  it("renders the maintained report with both temperature definitions and the nonclaim ledger", async () => {
    const outRoot = path.join(await temporaryRoot(), "render-run");
    const regressionConfigPath = await liveSoftwareConfigPath();
    const result =
      await runCasimirDpElectronMassHiggsAnchorStage4_2A({
        configPath: regressionConfigPath,
        outRoot,
        reportDoc: null,
        now: new Date("2026-07-25T21:01:00.000Z"),
      });
    const markdown =
      renderCasimirDpElectronMassHiggsAnchorStage4_2AMarkdown(
        result.report,
      );

    expect(markdown).toContain(
      "Coarse spectrum/peak-dependent Wien color temperature",
    );
    expect(markdown).toContain(
      "IAU luminosity-radius bolometric effective temperature",
    );
    expect(markdown).toContain(
      "operationally distinct. Their difference is not a contradiction",
    );
    expect(markdown).toContain(
      "not a response/covariance-aware",
    );
    expect(markdown).toContain(
      "measured-fit significance remain",
    );
    expect(markdown).toContain(
      "Only preregistered measured coherence residuals can advance the three DP evidence levels.",
    );
  });

  it("fails before output when a fixture authority hash is altered", async () => {
    const root = await temporaryRoot();
    const rawConfig = await loadLiveSoftwareConfig();
    const fixtures = rawConfig.runtime_fixtures as Array<{
      sha256: string;
    }>;
    fixtures[1].sha256 = "0".repeat(64);
    const copiedConfig = path.join(root, "tampered-config.json");
    await writeFile(
      copiedConfig,
      `${JSON.stringify(rawConfig, null, 2)}\n`,
      "utf8",
    );
    const outRoot = path.join(root, "must-not-exist");

    await expect(
      runCasimirDpElectronMassHiggsAnchorStage4_2A({
        configPath: copiedConfig,
        outRoot,
        reportDoc: null,
      }),
    ).rejects.toThrow(
      "stage4_2a_integrity_failure:planck_solar_fixture",
    );
    await expect(readFile(outRoot)).rejects.toThrow();
  });

  it("fails closed when the immutable Stage-4.1 tuple is rewritten", async () => {
    const root = await temporaryRoot();
    const rawConfig = await loadRawConfig();
    const upstream = rawConfig.upstream_authorities as Array<{
      role: string;
      sha256: string;
    }>;
    const report = upstream.find(
      (row) => row.role === "stage4_1_immutable_report_json",
    );
    if (report === undefined) {
      throw new Error("fixture config lacks the immutable report row");
    }
    report.sha256 = "0".repeat(64);
    const copiedConfig = path.join(root, "rewritten-upstream.json");
    await writeFile(
      copiedConfig,
      `${JSON.stringify(rawConfig, null, 2)}\n`,
      "utf8",
    );

    await expect(
      runCasimirDpElectronMassHiggsAnchorStage4_2A({
        configPath: copiedConfig,
        outRoot: path.join(root, "must-not-exist"),
        reportDoc: null,
      }),
    ).rejects.toThrow(
      "stage4_2a_authority_manifest_upstream_tuple_mismatch",
    );
  });

  it("refuses to overwrite a pre-existing output directory", async () => {
    const outRoot = path.join(await temporaryRoot(), "existing-output");
    await mkdir(outRoot);

    await expect(
      runCasimirDpElectronMassHiggsAnchorStage4_2A({
        configPath,
        outRoot,
        reportDoc: null,
      }),
    ).rejects.toThrow();
  });
});
