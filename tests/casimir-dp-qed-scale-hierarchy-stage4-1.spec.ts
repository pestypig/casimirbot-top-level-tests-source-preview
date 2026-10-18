import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CASIMIR_DP_QED_SCALE_HIERARCHY_OUTCOME_TO_CLAIM_MAP,
  buildCasimirDpQedScaleHierarchyStage4_1Report,
  renderCasimirDpQedScaleHierarchyStage4_1Markdown,
  runCasimirDpQedScaleHierarchyStage4_1,
} from "../scripts/research/run-casimir-dp-qed-scale-hierarchy-stage4-1";
import {
  CASIMIR_DP_QED_SCALE_HIERARCHY_STAGE4_1_RUN_ORDER,
  CasimirDpQedScaleHierarchyStage4_1Config,
} from "../shared/contracts/casimir-dp-qed-scale-hierarchy-stage4-1.v1";

const configPath = path.resolve(
  process.cwd(),
  "configs/research/casimir-dp-qed-scale-hierarchy-stage4-1.v1.json",
);
const temporaryRoots: string[] = [];
const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const immutableStage4Hashes = {
  stage4_config:
    "ade06cd7b95e27fe414614ad36512d5764d439c4fa6623f8499ad218ba07c3d7",
  stage4_input_authority_manifest:
    "3f26ef115533ef78756fad70f3880f8ea1d1ace43cbc9a0e66d6d0b5e9c2918d",
  stage4_immutable_report_json:
    "2c56cd9b61928ee750cf0714435674cc923b4c81f02e325b8ee9e9e5a9816d0b",
  stage4_immutable_report_markdown:
    "1221cf1e6b6c247c3253240c44ed78446318b2cdb2966610a63d08c7ec4f00a8",
  stage4_immutable_campaign_receipt:
    "185a09ceb61b4f158afe16022783c8b184c1035f456cb341b5c90920b69b774a",
  stage4_downstream_verification_receipt:
    "721b9f6aeab4b181ccc5ac21b4bc81c984d3b1fb72cdf76e55abedba11e38440",
} as const;

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "casimir-dp-stage4-1-"),
  );
  temporaryRoots.push(root);
  return root;
}

async function temporaryOutputPath(): Promise<string> {
  return path.join(await temporaryRoot(), "immutable-run");
}

async function loadRawConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(configPath, "utf8"),
  ) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

describe("Casimir-DP QED scale-hierarchy Stage-4.1 campaign", () => {
  it("freezes the exact order, authority tuple, source boundary, and final-status policy", async () => {
    const config = CasimirDpQedScaleHierarchyStage4_1Config.parse(
      await loadRawConfig(),
    );

    expect(config.run_order).toEqual([
      ...CASIMIR_DP_QED_SCALE_HIERARCHY_STAGE4_1_RUN_ORDER,
    ]);
    expect(config.run_order.indexOf(
      "validate_source_provenance_uncertainty_covariance_and_rounding",
    )).toBeLessThan(config.run_order.indexOf(
      "compute_compton_energy_frequency_and_wavelength_closure",
    ));
    expect(config.run_order.indexOf(
      "compute_leading_hydrogenic_reduced_mass_closure",
    )).toBeLessThan(config.run_order.indexOf(
      "freeze_precision_correction_ledger_and_semantic_nonbridge",
    ));
    expect(
      Object.fromEntries(
        config.upstream_authorities
          .filter((authority) =>
            authority.role.startsWith("stage4_")
          )
          .map((authority) => [
            authority.role,
            authority.sha256,
          ]),
      ),
    ).toEqual(immutableStage4Hashes);
    expect(
      config.upstream_authorities.slice(0, 6).every(
        (authority) =>
          authority.required_at_runtime &&
          authority.tracked === false,
      ),
    ).toBe(true);
    expect(
      config.upstream_authorities.find(
        (authority) =>
          authority.role === "codata_2022_constants_registry",
      ),
    ).toMatchObject({
      path: "configs/constants/codata-2022.v1.json",
      tracked: true,
      required_at_runtime: true,
    });
    expect(config.source_registry.length).toBeGreaterThanOrEqual(4);
    expect(
      new Set(config.source_registry.map((source) => source.source_id))
        .size,
    ).toBe(config.source_registry.length);
    expect(config.evidence_policy).toEqual({
      constants_calibration_is_independent_measurement: false,
      codata_tabulations_are_correlated: true,
      cross_covariance_required_for_significance: true,
      leading_hydrogenic_scale_is_precision_spectroscopy: false,
      same_identity_family_implies_casimir_dp_connection: false,
      alpha_fs_is_universal_emission_probability: false,
      calibration_can_modify_immutable_stage4: false,
      calibration_can_satisfy_measured_gate: false,
      observable_bridge_edges_allowed: false,
    });
    expect(config.final_status_policy).toMatchObject({
      software_identity_calibration: "pass",
      source_authority_integrity: "pass",
      algebraic_identity_closure: "pass",
      codata_tabulation_consistency: "pass",
      covariance_semantics: "pass",
      leading_reduced_mass_closure: "pass",
      measured_evidence: "not_ready",
      precision_spectroscopy: "not_ready",
      casimir_to_atomic_transfer: "blocked",
      atomic_to_dp_transfer: "blocked",
      compton_to_collapse_clock: "blocked",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
      publication_claim:
        "diagnostic_constants_calibration_only",
    });
  });

  it("runs the immutable calibration and writes hash-backed diagnostic outputs", async () => {
    const outRoot = await temporaryOutputPath();
    const result =
      await runCasimirDpQedScaleHierarchyStage4_1({
        configPath,
        outRoot,
        reportDoc: null,
        now: new Date("2026-07-25T19:00:00.000Z"),
      });

    expect(result.outDir).toBe(path.resolve(outRoot));
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.integrity_gate).toBe("pass");
    expect(result.report.immutable_stage4_unchanged).toBe(true);
    expect(result.report.authority_integrity.every(
      (row) =>
        row.gate === "pass" &&
        row.actual_sha256 === row.expected_sha256,
    )).toBe(true);
    expect(result.report.software_source_integrity.every(
      (row) =>
        row.gate === "pass" &&
        row.actual_sha256 === row.expected_sha256,
    )).toBe(true);
    expect(result.report.fixture_integrity).toMatchObject({
      gate: "pass",
      actual_sha256:
        result.report.fixture_integrity.expected_sha256,
    });
    expect(result.report.run_order).toEqual(
      CASIMIR_DP_QED_SCALE_HIERARCHY_STAGE4_1_RUN_ORDER.map(
        (stage, index) => ({
          index,
          stage,
          gate: "pass",
        }),
      ),
    );
    expect(result.report.stage4_nonbridge_preservation).toEqual({
      upstream_status: "same_dimension_not_connected",
      downstream_status: "same_dimension_not_connected",
      modifies_upstream: false,
      observable_bridge_edges_added: 0,
      gate: "pass",
    });
    expect(result.report.outcome_to_claim_map).toEqual(
      CASIMIR_DP_QED_SCALE_HIERARCHY_OUTCOME_TO_CLAIM_MAP,
    );
    expect(result.report.final_gates).toMatchObject({
      measured_evidence: "not_ready",
      apparatus_material_response: "not_ready",
      precision_spectroscopy: "not_ready",
      casimir_to_atomic_transfer: "blocked",
      atomic_to_dp_transfer: "blocked",
      compton_to_collapse_clock: "blocked",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
    });

    expect(result.receipt).toMatchObject({
      status: "completed",
      evidence_class: "source_backed_calculation",
      claim_ceiling: "qed_scale_identity_calibration",
      promotion_allowed: false,
      immutable_stage4_unchanged: true,
      codata_reference_comparison:
        "correlated_tabulation_and_rounding_consistency_not_independent_test",
      stage4_frequency_nonbridge:
        "same_dimension_not_connected",
      observable_bridge_edges_added: 0,
      prior_stage4_certificate_artifact_reused: false,
      fresh_casimir_certificate: {
        status: "pending_external_verification",
        certificate_sha256: null,
        integrity: null,
      },
    });
    expect(result.receipt.outputs).toHaveLength(2);
    for (const output of result.receipt.outputs) {
      const bytes = await readFile(path.join(outRoot, output.path));
      expect(sha256(bytes)).toBe(output.sha256);
    }
    const receiptText = await readFile(
      path.join(
        outRoot,
        "qed-scale-hierarchy-stage4-1-receipt.json",
      ),
      "utf8",
    );
    expect(sha256(receiptText)).toBe(result.receipt_sha256);
    expect(JSON.parse(receiptText)).toEqual(result.receipt);
  });

  it("renders every outcome, identity convention, and nonclaim", async () => {
    const result =
      await runCasimirDpQedScaleHierarchyStage4_1({
        configPath,
        outRoot: await temporaryOutputPath(),
        reportDoc: null,
        now: new Date("2026-07-25T19:00:00.000Z"),
      });
    const markdown =
      renderCasimirDpQedScaleHierarchyStage4_1Markdown(
        result.report,
      );

    for (
      const outcome of
      CASIMIR_DP_QED_SCALE_HIERARCHY_OUTCOME_TO_CLAIM_MAP
    ) {
      expect(markdown).toContain(`\`${outcome.outcome_id}\``);
      expect(markdown).toContain(outcome.does_not_establish);
    }
    expect(markdown).toContain(
      "cyclic and angular Compton frequencies",
    );
    expect(markdown).toContain(
      "ordinary and reduced Compton\nwavelengths",
    );
    expect(markdown).toContain("\\lambda_C=2\\pi\\bar\\lambda_C");
    expect(markdown).toContain(
      "not an independent measurement, precision spectroscopy result",
    );
    expect(markdown).toContain(
      "Observable bridge edges added:\n  `0`",
    );
    expect(markdown).toContain(
      "`same_dimension_not_connected`",
    );
  });

  it("fails closed on fixture or immutable Stage-4 hash tampering", async () => {
    const mutations: Array<{
      label: string;
      mutate: (config: Record<string, unknown>) => void;
      expected: string;
    }> = [
      {
        label: "fixture",
        mutate: (config) => {
          const runtimeFixture = config.runtime_fixture as Record<
            string,
            unknown
          >;
          runtimeFixture.sha256 = "f".repeat(64);
        },
        expected:
          "stage4_1_integrity_failure:qed_scale_hierarchy_fixture",
      },
      {
        label: "Stage-4 report",
        mutate: (config) => {
          const authorities = config.upstream_authorities as Array<
            Record<string, unknown>
          >;
          const authority = authorities.find(
            (candidate) =>
              candidate.role === "stage4_immutable_report_json",
          )!;
          authority.sha256 = "f".repeat(64);
        },
        expected:
          "stage4_1_integrity_failure:stage4_immutable_report_json",
      },
    ];

    for (const mutation of mutations) {
      const root = await temporaryRoot();
      const config = await loadRawConfig();
      mutation.mutate(config);
      const candidatePath = path.join(
        root,
        `${mutation.label.replace(/\W+/g, "-")}.json`,
      );
      await writeFile(
        candidatePath,
        `${JSON.stringify(config, null, 2)}\n`,
        "utf8",
      );

      await expect(
        runCasimirDpQedScaleHierarchyStage4_1({
          configPath: candidatePath,
          outRoot: path.join(root, "out"),
          reportDoc: null,
        }),
      ).rejects.toThrow(mutation.expected);
      await expect(
        readFile(path.join(root, "out")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("rejects altered run order, source identity, tracking, and evidence promotion", async () => {
    const baseline = await loadRawConfig();
    const mutations: Array<
      (config: Record<string, unknown>) => void
    > = [
      (config) => {
        const sources = (
          config.software as {
            source_authorities: Array<Record<string, unknown>>;
          }
        ).source_authorities;
        sources[0].tracked = true;
      },
      (config) => {
        const sources = (
          config.software as {
            source_authorities: Array<Record<string, unknown>>;
          }
        ).source_authorities;
        sources[0].role = "substituted_runtime";
      },
      (config) => {
        const sources = (
          config.software as {
            source_authorities: Array<Record<string, unknown>>;
          }
        ).source_authorities;
        sources[0].path = "shared/substituted-runtime.ts";
      },
      (config) => {
        const source = config.stage4_1_authority_manifest as Record<
          string,
          unknown
        >;
        source.required_at_runtime = false;
      },
      (config) => {
        (
          config.runtime_fixture as Record<string, unknown>
        ).evidence_class = "measured";
      },
      (config) => {
        config.promotion_allowed = true;
      },
    ];

    for (const mutate of mutations) {
      const candidate = structuredClone(baseline);
      mutate(candidate);
      expect(() =>
        CasimirDpQedScaleHierarchyStage4_1Config.parse(candidate)
      ).toThrow();
    }

    const reordered = structuredClone(baseline);
    const runOrder = reordered.run_order as string[];
    [runOrder[2], runOrder[3]] = [runOrder[3], runOrder[2]];
    expect(() =>
      CasimirDpQedScaleHierarchyStage4_1Config.parse(reordered)
    ).not.toThrow();
    const root = await temporaryRoot();
    const reorderedPath = path.join(root, "reordered.json");
    await writeFile(
      reorderedPath,
      `${JSON.stringify(reordered, null, 2)}\n`,
      "utf8",
    );
    await expect(
      runCasimirDpQedScaleHierarchyStage4_1({
        configPath: reorderedPath,
        outRoot: path.join(root, "out"),
        reportDoc: null,
      }),
    ).rejects.toThrow("stage4_1_run_order[2]_must_be_");
  });

  it("blocks aggregate campaign PASS for forged or incomplete integrity evidence", async () => {
    const config = CasimirDpQedScaleHierarchyStage4_1Config.parse(
      await loadRawConfig(),
    );
    const baseline =
      await runCasimirDpQedScaleHierarchyStage4_1({
        configPath,
        outRoot: await temporaryOutputPath(),
        reportDoc: null,
        now: new Date("2026-07-25T19:00:00.000Z"),
      });
    const buildWith = (args: {
      authorityIntegrity?: typeof baseline.report.authority_integrity;
      sourceIntegrity?: typeof baseline.report.software_source_integrity;
    }) =>
      buildCasimirDpQedScaleHierarchyStage4_1Report({
        config,
        authorityIntegrity:
          args.authorityIntegrity ??
          baseline.report.authority_integrity,
        sourceIntegrity:
          args.sourceIntegrity ??
          baseline.report.software_source_integrity,
        fixtureIntegrity: baseline.report.fixture_integrity,
        calibration: baseline.report.calibration,
        now: new Date("2026-07-25T19:00:01.000Z"),
      });

    const forged = structuredClone(
      baseline.report.software_source_integrity,
    );
    forged[0].actual_sha256 = "f".repeat(64);
    forged[0].gate = "pass";
    expect(buildWith({ sourceIntegrity: forged })).toMatchObject({
      integrity_gate: "not_ready",
      campaign_gate: "blocked",
    });

    const missing = structuredClone(
      baseline.report.authority_integrity,
    );
    missing[0].gate = "not_ready";
    expect(buildWith({ authorityIntegrity: missing })).toMatchObject({
      integrity_gate: "not_ready",
      campaign_gate: "blocked",
    });
  });

  it("does not mutate any authoritative Stage-4 artifact", async () => {
    const config = CasimirDpQedScaleHierarchyStage4_1Config.parse(
      await loadRawConfig(),
    );
    const stage4Authorities = config.upstream_authorities.filter(
      (authority) => authority.role.startsWith("stage4_"),
    );
    const before = Object.fromEntries(
      await Promise.all(
        stage4Authorities.map(async (authority) => [
          authority.role,
          sha256(await readFile(path.resolve(authority.path))),
        ]),
      ),
    );
    expect(before).toEqual(immutableStage4Hashes);

    await runCasimirDpQedScaleHierarchyStage4_1({
      configPath,
      outRoot: await temporaryOutputPath(),
      reportDoc: null,
      now: new Date("2026-07-25T19:00:00.000Z"),
    });

    const after = Object.fromEntries(
      await Promise.all(
        stage4Authorities.map(async (authority) => [
          authority.role,
          sha256(await readFile(path.resolve(authority.path))),
        ]),
      ),
    );
    expect(after).toEqual(before);
  });

  it("uses exclusive immutable output creation", async () => {
    const outRoot = await temporaryOutputPath();
    const now = new Date("2026-07-25T19:00:00.123Z");
    await runCasimirDpQedScaleHierarchyStage4_1({
      configPath,
      outRoot,
      reportDoc: null,
      now,
    });

    await expect(
      runCasimirDpQedScaleHierarchyStage4_1({
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
      runCasimirDpQedScaleHierarchyStage4_1({
        configPath,
        outRoot,
        reportDoc: null,
        now: new Date("2026-07-25T19:00:00.123Z"),
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe(
      "prior partial state\n",
    );
    await expect(
      readFile(
        path.join(
          outRoot,
          "qed-scale-hierarchy-stage4-1-report.json",
        ),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
