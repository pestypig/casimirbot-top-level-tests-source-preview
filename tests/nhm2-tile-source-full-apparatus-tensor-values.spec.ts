import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildFullApparatusTensorEvidenceFromTensorValues,
  buildNhm2TileSourceFullApparatusTensorValues,
  isNhm2TileSourceFullApparatusTensorValues,
  NHM2_FULL_APPARATUS_REQUIRED_TERM_IDS,
  NHM2_FULL_APPARATUS_SYMMETRIC_TENSOR_COMPONENTS,
  type Nhm2FullApparatusComponentAuthority,
  type Nhm2FullApparatusTensorValueRegionV1,
} from "../shared/contracts/nhm2-tile-source-full-apparatus-tensor-values.v1";
import { buildNhm2TileSourceFullApparatusTensorOperatingBudget } from "../shared/contracts/nhm2-tile-source-full-apparatus-tensor-operating-budget.v1";
import { buildNhm2TileSourceMaterialEvidenceReceipts } from "../shared/contracts/nhm2-tile-source-material-evidence-receipts.v1";
import { publishNhm2TileSourceMaterialEvidenceReceipts } from "../tools/nhm2/publish-tile-source-material-evidence-receipts";
import type {
  Nhm2RegionalSourceClosureRegionId,
  Nhm2RegionalTensor,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";

const generatedAt = "2026-06-22T00:00:00.000Z";
const selectedProfileId =
  "stage1_centerline_alpha_0p7000_observer_compatible_source_campaign_screen_v1";

const subsystemReceiptRefs = {
  materialCoupon: "receipt://material-coupon/tin/v1",
  forceGapPullIn: "receipt://force-gap/8nm/v1",
  roughnessPatch: "receipt://roughness-patch/tin/v1",
  activeControl: "receipt://active-control/gap-lock-v1",
  fatigueLayerScaling: "receipt://fatigue-layer-scaling/v1",
};

const tensor = (scale: number): Nhm2RegionalTensor => ({
  T00: -scale,
  T01: scale * 0.001,
  T02: scale * 0.002,
  T03: scale * 0.003,
  T11: scale * 0.02,
  T12: scale * 0.0004,
  T13: scale * 0.0005,
  T22: scale * 0.021,
  T23: scale * 0.0006,
  T33: scale * 0.022,
});

const completeStatus = Object.fromEntries(
  NHM2_FULL_APPARATUS_SYMMETRIC_TENSOR_COMPONENTS.map((componentId) => [
    componentId,
    "validated_simulation",
  ]),
) as Nhm2FullApparatusTensorValueRegionV1["componentStatus"];

const completeAuthority = Object.fromEntries(
  NHM2_FULL_APPARATUS_SYMMETRIC_TENSOR_COMPONENTS.map((componentId) => [
    componentId,
    "constitutive_model",
  ]),
) as Partial<Record<(typeof NHM2_FULL_APPARATUS_SYMMETRIC_TENSOR_COMPONENTS)[number], Nhm2FullApparatusComponentAuthority>>;

const termContributions = (scale: number): Nhm2FullApparatusTensorValueRegionV1["termContributions"] =>
  Object.fromEntries(
    NHM2_FULL_APPARATUS_REQUIRED_TERM_IDS.map((termId, index) => [
      termId,
      tensor(scale * (index === 0 ? 0.2 : 0.1)),
    ]),
  );

const termReceiptRefs = (
  regionId: Nhm2RegionalSourceClosureRegionId,
): Nhm2FullApparatusTensorValueRegionV1["termReceiptRefs"] =>
  Object.fromEntries(
    NHM2_FULL_APPARATUS_REQUIRED_TERM_IDS.map((termId) => [
      termId,
      `receipt://full-apparatus-tmunu/terms/${regionId}/${termId}`,
    ]),
  );

const region = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  scale: number,
  overrides: Partial<Nhm2FullApparatusTensorValueRegionV1> = {},
): Nhm2FullApparatusTensorValueRegionV1 => ({
  regionId,
  status: "computed",
  tensor: tensor(scale),
  componentStatus: completeStatus,
  componentAuthority: completeAuthority,
  termContributions: termContributions(scale),
  termReceiptRefs: termReceiptRefs(regionId),
  chartRef: "comoving_cartesian",
  basisRef: "same_basis",
  unitsRef: "J/m^3",
  regionSupportRef: `receipt://atlas/support/${regionId}`,
  aggregationMode: "support_weighted",
  normalizationBasis: "volume",
  sampleCount: 512,
  valueReceiptRef: `receipt://full-apparatus-tmunu/values/${regionId}`,
  blockers: [],
  warnings: [],
  ...overrides,
});

const artifact = (
  overrides: Partial<Parameters<typeof buildNhm2TileSourceFullApparatusTensorValues>[0]> = {},
) =>
  buildNhm2TileSourceFullApparatusTensorValues({
    generatedAt,
    laneId: "nhm2_shift_lapse",
    selectedProfileId,
    frozenCandidateId: "nhm2_447_layer_topology_optimized_lattice_tin_v1",
    artifactRef: "artifact://full-apparatus-tmunu/values/v1",
    sourceRefs: {
      materialEvidenceReceiptsRef: "artifact://tile-source/material-evidence",
      fullApparatusTensorEvidenceRef: "receipt://full-apparatus-tmunu/v1",
      apparatusModelRef: "model://full-apparatus-tensor/constitutive-v1",
      atlasRef: "artifact://regional-support-atlas/v1",
    },
    sourceSideOnly: true,
    notDerivedFromMetricRequiredTensor: true,
    targetEchoForbidden: true,
    targetDerivedFieldsUsed: false,
    chartId: "comoving_cartesian",
    basisRef: "same_basis",
    unitsRef: "J/m^3",
    regions: [
      region("global", 1.0e9),
      region("hull", 1.1e9),
      region("wall", 1.6995e9),
      region("exterior_shell", 9.5e8),
    ],
    ...overrides,
  });

describe("NHM2 tile-source full-apparatus tensor values", () => {
  it("admits a complete source-side regional full tensor value artifact", () => {
    const built = artifact();

    expect(isNhm2TileSourceFullApparatusTensorValues(built)).toBe(true);
    expect(built.contractVersion).toBe("nhm2_tile_source_full_apparatus_tensor_values/v1");
    expect(built.summary.valueArtifactReadyForReceipt).toBe(true);
    expect(built.summary.firstBlocker).toBe("none");
    expect(built.summary.sourceRefsComplete).toBe(true);
    expect(built.summary.missingSourceRefs).toEqual([]);
    expect(built.summary.allRequiredRegionsPresent).toBe(true);
    expect(built.summary.allRequiredRegionsFullTensor).toBe(true);
    expect(built.summary.allRequiredRegionsTermComplete).toBe(true);
    expect(built.summary.termBalanceMaxRelativeResidual).toBeLessThanOrEqual(
      built.summary.termBalanceToleranceRelative,
    );
    expect(built.claimBoundary.valueArtifactDoesNotValidateMaterialMechanism).toBe(true);
    expect(built.claimBoundary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("blocks tensor-value artifacts without stable artifact and source refs", () => {
    const built = artifact({
      artifactRef: null,
      sourceRefs: {
        materialEvidenceReceiptsRef: null,
        fullApparatusTensorEvidenceRef: null,
        apparatusModelRef: null,
        atlasRef: null,
      },
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
      subsystemReceiptRefs,
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.sourceRefsComplete).toBe(false);
    expect(built.summary.missingSourceRefs).toEqual([
      "artifact_ref_missing",
      "source_refs:material_evidence_receipts_ref_missing",
      "source_refs:full_apparatus_tensor_evidence_ref_missing",
      "source_refs:apparatus_model_ref_missing",
      "source_refs:atlas_ref_missing",
    ]);
    expect(built.summary.firstBlocker).toBe("artifact_ref_missing");
    expect(evidence.tensorValueArtifactRef).toBeNull();
    expect(evidence.components.T00).toBe(false);
    expect(evidence.termCoverage.casimirInteractionStressEnergy).toBe(false);
  });

  it("blocks missing momentum and off-diagonal tensor values instead of zero-filling", () => {
    const wallTensor = tensor(1.6995e9);
    delete wallTensor.T01;
    delete wallTensor.T12;
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          tensor: wallTensor,
          componentStatus: {
            ...completeStatus,
            T01: "missing",
            T12: "missing",
          },
        }),
        region("exterior_shell", 9.5e8),
      ],
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.anyMissingComponent).toBe(true);
    expect(built.summary.missingComponentRefs).toEqual(
      expect.arrayContaining(["wall:T01", "wall:T12"]),
    );
    expect(built.summary.firstBlocker).toBe("wall:T01:component_value_missing");
  });

  it("blocks computed tensor regions with nonpositive sample counts", () => {
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          sampleCount: 0,
        }),
        region("exterior_shell", 9.5e8),
      ],
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
      subsystemReceiptRefs,
    });
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: evidence,
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.allRequiredRegionsFullTensor).toBe(true);
    expect(built.summary.allRequiredRegionsTermComplete).toBe(true);
    expect(built.summary.firstBlocker).toBe("wall:sample_count_invalid");
    expect(evidence.regionalSampleCounts?.wall).toBe(0);
    expect(evidence.regionalSampleCounts?.hull).toBe(512);
    expect(evidence.regionalSampleCounts?.exteriorShell).toBe(512);
    expect(evidence.components.T00).toBe(false);
    expect(evidence.components.T0i).toBe(false);
    expect(evidence.components.diagonalTij).toBe(false);
    expect(evidence.components.offDiagonalTij).toBe(false);
    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.regionalSampleCountsComplete).toBe(false);
    expect(budget.derivedOperatingBudget.regionalSampleCountsMeetMinimum).toBe(false);
    expect(budget.requiredCorrections.missingOrInvalidRegionalSampleCountIds).toEqual(["wall"]);
    expect(budget.blockers).toContain(
      "full_apparatus_wall_region_sample_count_missing_or_invalid_for_operating_budget",
    );
  });

  it("blocks regional tensor values sampled below the 447-layer architecture minimum", () => {
    const built = artifact({
      regions: [
        region("global", 1.0e9, { sampleCount: 128 }),
        region("hull", 1.1e9, { sampleCount: 256 }),
        region("wall", 1.6995e9, { sampleCount: 128 }),
        region("exterior_shell", 9.5e8, { sampleCount: 300 }),
      ],
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
      subsystemReceiptRefs,
    });
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: evidence,
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.regionalSampleCountMin).toBe(447);
    expect(built.summary.undersampledRegionRefs).toEqual(
      expect.arrayContaining([
        "global:sample_count_below_447",
        "hull:sample_count_below_447",
        "wall:sample_count_below_447",
        "exterior_shell:sample_count_below_447",
      ]),
    );
    expect(built.summary.firstBlocker).toBe("global:sample_count_below_447");
    expect(evidence.components.T00).toBe(false);
    expect(evidence.regionalSampleCounts?.wall).toBe(128);
    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.regionalSampleCountsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.regionalSampleCountsMeetMinimum).toBe(false);
    expect(budget.requiredCorrections.regionalTensorSampleCountMin).toBe(447);
    expect(budget.requiredCorrections.regionalSampleCountBelowMinimumIds).toEqual([
      "wall",
      "hull",
      "exteriorShell",
    ]);
    expect(budget.requiredCorrections.wallRegionalSampleCountShortfall).toBe(319);
    expect(budget.requiredCorrections.hullRegionalSampleCountShortfall).toBe(191);
    expect(budget.requiredCorrections.exteriorShellRegionalSampleCountShortfall).toBe(147);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_wall_region_sample_count_below_447_for_operating_budget",
        "full_apparatus_hull_region_sample_count_below_447_for_operating_budget",
        "full_apparatus_exterior_shell_region_sample_count_below_447_for_operating_budget",
      ]),
    );
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("blocks metric-echo and scalar-proxy component authority", () => {
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          componentAuthority: {
            ...completeAuthority,
            T00: "metric_echo",
            T12: "scalar_proxy",
          },
        }),
        region("exterior_shell", 9.5e8),
      ],
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.anyMetricEchoComponent).toBe(true);
    expect(built.summary.anyScalarProxyComponent).toBe(true);
    expect(built.summary.firstBlocker).toBe("wall:T00:metric_echo_forbidden");
  });

  it("blocks finite tensor values that lack authoritative component provenance", () => {
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          componentAuthority: {
            ...completeAuthority,
            T01: "missing",
          },
        }),
        region("exterior_shell", 9.5e8),
      ],
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
      subsystemReceiptRefs,
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.anyInadmissibleAuthorityComponent).toBe(true);
    expect(built.summary.inadmissibleAuthorityRefs).toContain("wall:T01");
    expect(built.summary.firstBlocker).toBe(
      "wall:T01:component_authority_missing_or_inadmissible",
    );
    expect(evidence.components.T0i).toBe(false);
    expect(evidence.componentDetailRefs?.T01).toBeNull();
  });

  it("blocks proxy component statuses even when tensor values are finite", () => {
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          componentStatus: {
            ...completeStatus,
            T12: "proxy",
          },
        }),
        region("exterior_shell", 9.5e8),
      ],
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
      subsystemReceiptRefs,
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.anyProxyStatusComponent).toBe(true);
    expect(built.summary.proxyStatusComponentRefs).toContain("wall:T12");
    expect(built.summary.missingComponentRefs).toContain("wall:T12");
    expect(built.summary.firstBlocker).toBe("wall:T12:component_value_missing");
    expect(evidence.components.offDiagonalTij).toBe(false);
    expect(evidence.componentDetailRefs?.T12).toBeNull();
  });

  it("blocks aggregate tensor values that do not balance against apparatus term sums", () => {
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          termContributions: termContributions(1.0e9),
        }),
        region("exterior_shell", 9.5e8),
      ],
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.allRequiredRegionsFullTensor).toBe(true);
    expect(built.summary.allRequiredRegionsTermComplete).toBe(true);
    expect(built.summary.termBalanceMaxRelativeResidual).toBeGreaterThan(
      built.summary.termBalanceToleranceRelative,
    );
    expect(built.summary.firstBlocker).toBe(
      "wall:T00:term_sum_balance_residual_exceeds_tolerance",
    );
    expect(evidence.components.T00).toBe(false);
    expect(evidence.termCoverage.casimirInteractionStressEnergy).toBe(false);
    expect(evidence.componentDetailRefs?.T00).toBeNull();
  });

  it("blocks apparatus terms that do not provide full tensor component coverage", () => {
    const incompleteControlTerm = tensor(1.6995e9 * 0.003);
    delete incompleteControlTerm.T12;
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          termContributions: {
            ...termContributions(1.6995e9),
            activeControlFieldEnergy: incompleteControlTerm,
          },
        }),
        region("exterior_shell", 9.5e8),
      ],
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
    });
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: evidence,
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.allRequiredRegionsFullTensor).toBe(true);
    expect(built.summary.allRequiredRegionsTermComplete).toBe(false);
    expect(built.summary.missingTermRefs).toEqual([]);
    expect(built.summary.missingTermComponentRefs).toContain(
      "wall:activeControlFieldEnergy:T12",
    );
    expect(built.summary.firstBlocker).toBe(
      "wall:activeControlFieldEnergy:T12:term_component_value_missing",
    );
    expect(evidence.termCoverage.activeControlFieldEnergy).toBe(false);
    expect(evidence.termRefs?.activeControlFieldEnergy).toBeNull();
    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(false);
    expect(budget.blockers).toContain(
      "full_apparatus_active_control_field_energy_missing_for_operating_budget",
    );
    expect(budget.requiredCorrections.missingStressEnergyTermIds).toContain(
      "activeControlFieldEnergy",
    );
  });

  it("blocks apparatus term contributions without term receipt provenance", () => {
    const built = artifact({
      regions: [
        region("global", 1.0e9),
        region("hull", 1.1e9),
        region("wall", 1.6995e9, {
          termReceiptRefs: {
            ...termReceiptRefs("wall"),
            activeControlFieldEnergy: null,
          },
        }),
        region("exterior_shell", 9.5e8),
      ],
    });
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: built,
      evidenceTier: "validated_simulation",
    });

    expect(built.summary.valueArtifactReadyForReceipt).toBe(false);
    expect(built.summary.allRequiredRegionsFullTensor).toBe(true);
    expect(built.summary.allRequiredRegionsTermComplete).toBe(false);
    expect(built.summary.missingTermRefs).toEqual([]);
    expect(built.summary.missingTermComponentRefs).toEqual([]);
    expect(built.summary.missingTermReceiptRefs).toContain(
      "wall:activeControlFieldEnergy",
    );
    expect(built.summary.firstBlocker).toBe(
      "wall:activeControlFieldEnergy:term_receipt_ref_missing",
    );
    expect(evidence.termCoverage.activeControlFieldEnergy).toBe(false);
    expect(evidence.termRefs?.activeControlFieldEnergy).toBeNull();
    expect(evidence.components.T00).toBe(false);
  });

  it("keeps tensor-values evidence out of material receipts until subsystem receipts are backed", () => {
    const values = artifact();
    const evidence = buildFullApparatusTensorEvidenceFromTensorValues({
      artifact: values,
      evidenceTier: "validated_simulation",
      subsystemReceiptRefs,
    });
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      fullApparatusTensor: evidence,
    });
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: evidence,
    });
    const tensorSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "full_apparatus_tensor",
    );

    expect(evidence.tensorValueArtifactContract).toBe(
      "nhm2_tile_source_full_apparatus_tensor_values/v1",
    );
    expect(tensorSurface?.status).toBe("fail");
    expect(tensorSurface?.numericalMargins.tensorValueArtifactAvailable).toBe(1);
    expect(tensorSurface?.numericalMargins.subsystemReceiptRefsBacked).toBe(0);
    expect(tensorSurface?.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_material_coupon_receipt_ref_not_backed_by_passed_surface",
        "full_apparatus_force_gap_receipt_ref_not_backed_by_passed_surface",
        "full_apparatus_roughness_patch_receipt_ref_not_backed_by_passed_surface",
        "full_apparatus_active_control_receipt_ref_not_backed_by_passed_surface",
        "full_apparatus_fatigue_layer_scaling_receipt_ref_not_backed_by_passed_surface",
      ]),
    );
    expect(receipts.summary.fullApparatusTensorReady).toBe(false);
    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(true);
    expect(evidence.regionalSampleCounts).toEqual({
      wall: 512,
      hull: 512,
      exteriorShell: 512,
    });
    expect(budget.derivedOperatingBudget.regionalSampleCountsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.regionalSampleCountsMeetMinimum).toBe(true);
    expect(budget.derivedOperatingBudget.tensorValueArtifactAvailable).toBe(true);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("lets the publisher persist tensor-values while keeping material receipts blocked without subsystem receipt surfaces", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nhm2-tensor-values-publisher-"));
    try {
      const evidencePath = join(tempRoot, "evidence.json");
      const outDir = join(tempRoot, "out");
      const values = artifact({
        artifactRef: "artifact://full-apparatus-tmunu/values/publisher-test",
      });
      writeFileSync(
        evidencePath,
        `${JSON.stringify(
          {
            generatedAt,
            selectedProfileId,
            candidateId: "nhm2_447_layer_topology_optimized_lattice_tin_v1",
            fullApparatusTensorValues: values,
            fullApparatusTensor: {
              subsystemReceiptRefs,
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = publishNhm2TileSourceMaterialEvidenceReceipts({
        repoRoot: tempRoot,
        evidencePath,
        outDir,
        generatedAt,
        selectedProfileId,
      });
      const tensorValuesPath = result.outputRefs.fullApparatusTensorValues;
      const fullTensorSurface = result.materialEvidenceReceipts.receiptSurfaces.find(
        (surface) => surface.surfaceId === "full_apparatus_tensor",
      );

      expect(tensorValuesPath).not.toBeNull();
      expect(tensorValuesPath == null ? null : JSON.parse(readFileSync(tensorValuesPath, "utf8")).contractVersion).toBe(
        "nhm2_tile_source_full_apparatus_tensor_values/v1",
      );
      expect(result.fullApparatusTensorValues?.summary.valueArtifactReadyForReceipt).toBe(true);
      expect(fullTensorSurface?.status).toBe("fail");
      expect(fullTensorSurface?.numericalMargins.subsystemReceiptRefsBacked).toBe(0);
      expect(result.materialEvidenceReceipts.summary.fullApparatusTensorReady).toBe(false);
      expect(result.fullApparatusTensorOperatingBudget.summary.firstBlocker).toBe("none");
      expect(result.operatingBudgetReadiness.summary.physicalViabilityClaimAllowed).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects tensor-values artifacts from a different selected profile", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nhm2-tensor-values-profile-mismatch-"));
    try {
      const evidencePath = join(tempRoot, "evidence.json");
      const outDir = join(tempRoot, "out");
      const values = artifact({
        selectedProfileId: "stage1_centerline_alpha_0p7000_observer_compatible_source_campaign_screen_v1",
        artifactRef: "artifact://full-apparatus-tmunu/values/profile-mismatch",
      });
      writeFileSync(
        evidencePath,
        `${JSON.stringify(
          {
            generatedAt,
            selectedProfileId: "stage1_centerline_alpha_0p995_v1",
            candidateId: "nhm2_447_layer_topology_optimized_lattice_tin_v1",
            fullApparatusTensorValues: values,
            fullApparatusTensor: {
              subsystemReceiptRefs,
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      expect(() =>
        publishNhm2TileSourceMaterialEvidenceReceipts({
          repoRoot: tempRoot,
          evidencePath,
          outDir,
          generatedAt,
          selectedProfileId: "stage1_centerline_alpha_0p995_v1",
        }),
      ).toThrow(/full apparatus tensor values profile mismatch/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
