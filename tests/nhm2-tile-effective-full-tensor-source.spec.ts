import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCasimirMaterialReceipt } from "../shared/contracts/casimir-material-receipt.v1";
import { buildNhm2MetricRequiredRegionalTensorReceiptArtifact } from "../shared/contracts/nhm2-metric-required-regional-tensor-receipt.v1";
import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import type { Nhm2RegionalTensor } from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import {
  buildNhm2TileEffectiveFullTensorSourceArtifact,
  isNhm2TileEffectiveFullTensorSourceArtifact,
} from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import { buildRegionalMaterialSourceTensorModel } from "../tools/nhm2/build-regional-material-source-tensor-model";
import { publishSourceSideSameBasisTensorAuthority } from "../tools/nhm2/publish-source-side-same-basis-authority";
import { publishTileEffectiveCounterpart } from "../tools/nhm2/publish-tile-effective-counterpart";
import { publishTileEffectiveFullTensorSource } from "../tools/nhm2/publish-tile-effective-full-tensor-source";

const profile = "stage1_centerline_alpha_0p995_v1";
const generatedAt = "2026-06-12T00:00:00.000Z";
const tensor = {
  T00: -1,
  T01: 0,
  T02: 0,
  T03: 0,
  T11: 1,
  T12: 0,
  T13: 0,
  T22: 1,
  T23: 0,
  T33: 1,
};

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt,
    runId: "run-1",
    repo: {
      repositoryFullName: "local/casimirbot",
      branch: "main",
      commitSha: "abc",
      dirtyTreeStatus: "dirty",
    },
    selectedFamily: {
      laneId: "nhm2_shift_lapse",
      selectedProfileId: profile,
      expectedProfileId: profile,
      profileMatch: true,
    },
    claimLock: {
      currentClaimTier: "diagnostic",
      maximumClaimTier: "reduced-order",
      validationMode: "red_team_hardening",
      validationClaimAllowed: false,
      latestAliasForbidden: true,
    },
    commands: [],
    artifactSet: [],
    hashLock: {
      inputManifestSha256: null,
      toleranceManifestSha256: null,
      artifactSetSha256: null,
      literatureClaimMapSha256: null,
    },
    blockerSummary: {
      overallState: "review",
      blockingReasons: [],
      observerConsistencyStatus: "unknown",
      sourceClosureRegionalStatus: "unknown",
      qeiDossierStatus: "missing",
      reproducibilityStatus: "missing",
    },
  });

const materialReceipt = () =>
  buildCasimirMaterialReceipt({
    generatedAt,
    tileBatchId: "nhm2_regional_material_source_fixture",
    geometry: {
      gapMeters: 8e-9,
      gapMetrologyStatus: "measured",
      roughnessRmsMeters: 1e-12,
      beyondPfaValidity: "pass",
    },
    material: {
      modelKind: "lifshitz",
      dielectricResponseRef: "fixture:lifshitz-response",
      finiteConductivityIncluded: true,
      finiteTemperatureIncluded: true,
      roughnessCorrectionIncluded: true,
    },
    environment: {
      vacuumSealEvidence: "present",
      temperatureK: 4,
    },
    correctionFactors: {
      conductivity: 1,
      temperature: 1,
      roughness: 1,
      geometry: 1,
    },
  });

const symmetricTensor = (value: number): Nhm2RegionalTensor => ({
  T00: -value,
  T01: 0,
  T02: 0,
  T03: 0,
  T11: value * 0.02,
  T12: 0,
  T13: 0,
  T22: value * 0.02,
  T23: 0,
  T33: value * 0.02,
});

const materialRegion = (value: number) => ({
  status: "material_receipted",
  tensor: symmetricTensor(value),
  aggregationMode: "representative_sector_bin",
  normalizationBasis: "sample_count",
  sampleCount: 16,
  basisRef: "same_basis",
});

const samplePlan = () =>
  buildNhm2MetricRequiredRegionalTensorReceiptArtifact({
    generatedAt,
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    sourceArtifactRefs: ["sample-plan-only"],
    regions: [
      ["global", 64],
      ["hull", 40],
      ["wall", 12],
      ["exterior_shell", 12],
    ].map(([regionId, sampleCount]) => ({
      regionId: regionId as "global" | "hull" | "wall" | "exterior_shell",
      status: "computed" as const,
      tensor: symmetricTensor(1),
      tensorAuthorityMode: "symmetric_full_tensor" as const,
      componentStatus: {
        T00: "computed" as const,
        T01: "computed" as const,
        T02: "computed" as const,
        T03: "computed" as const,
        T11: "computed" as const,
        T12: "computed" as const,
        T13: "computed" as const,
        T22: "computed" as const,
        T23: "computed" as const,
        T33: "computed" as const,
      },
      missingComponentIds: [],
      chartRef: "comoving_cartesian",
      basisRef: "same_basis",
      unitsRef: "J/m^3",
      regionMaskRef: `sample-plan.mask.${regionId}`,
      aggregationMode: "mean" as const,
      normalizationBasis: "sample_count" as const,
      sampleCount: sampleCount as number,
      tensorRef: `sample-plan.metric.${regionId}`,
      derivationMode: "einstein_tensor_geometry_fd4_v1" as const,
      blockers: [],
      warnings: ["sample plan fixture: tensor values must not be consumed by source publisher"],
    })),
  });

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-tile-full-tensor-source-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const region = (regionId: "global" | "hull" | "wall" | "exterior_shell", overrides = {}) => ({
  regionId,
  status: "pass" as const,
  tensorAuthorityMode: "symmetric_full_tensor" as const,
  tensor,
  symmetry: { declared: true, kind: "symmetric" as const, lowerComponentsDerivedBySymmetry: true },
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `mask.${regionId}`,
  aggregationMode: "mean" as const,
  normalizationBasis: "sample_count" as const,
  sampleCount: 12,
  sourceSupport: {
    supportKernelId: "support.v1",
    cycleAverageStatus: "pass" as const,
    dutyCycleStatus: "pass" as const,
    lightCrossingConsistencyStatus: "pass" as const,
  },
  provenance: {
    producerModule: "tile-source",
    producerFunction: "emit",
    derivationMode: "source_model_reconstituted_full_tensor" as const,
    inputRefs: [`source.${regionId}`],
    preAggregationValueRefs: [`source.pre.${regionId}`],
    notDerivedFromMetricRequiredTensor: true,
  },
  blockers: [],
  ...overrides,
});

const artifact = (overrides = {}) =>
  buildNhm2TileEffectiveFullTensorSourceArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    runId: "run-1",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceModel: {
      sourceModelId: "tile-source.v1",
      sourceModelVersion: "v1",
      sourceModelClass: "reconstituted_from_source_channels",
      sourceSideOnly: true,
      notDerivedFromMetricRequiredTensor: true,
      metricRequiredInputRefs: [],
      sourceInputRefs: ["source-input.json"],
      qeiDossierRef: null,
      conservationRef: null,
    },
    regions: [
      region("global"),
      region("hull"),
      region("wall"),
      region("exterior_shell"),
    ],
    literatureRefs: ["fewster_thompson_2023_stationary_worldline_qei"],
    ...overrides,
  });

describe("nhm2 tile-effective full-tensor source contract", () => {
  it("accepts symmetric full tensor with explicit symmetry declaration", () => {
    const built = artifact();
    expect(built.overallState).toBe("pass");
    expect(isNhm2TileEffectiveFullTensorSourceArtifact(built)).toBe(true);
    expect(built.validationClaimAllowed).toBe(false);
    expect(built.physicalMechanismClaimAllowed).toBe(false);
    expect(built.promotionAllowed).toBe(false);
  });

  it("fails metric-required tensor refs as source inputs", () => {
    const built = artifact({
      sourceModel: {
        sourceModelId: "bad",
        sourceModelVersion: "v1",
        sourceModelClass: "metric_echo_forbidden",
        sourceSideOnly: false,
        notDerivedFromMetricRequiredTensor: false,
        metricRequiredInputRefs: ["metric.required.tensor"],
        sourceInputRefs: [],
        qeiDossierRef: null,
        conservationRef: null,
      },
    });
    expect(built.overallState).toBe("fail");
    expect(built.reasonCodes).toContain("metric_required_input_refs_present");
    expect(isNhm2TileEffectiveFullTensorSourceArtifact(built)).toBe(true);
  });

  it("rejects pass status for diagonal-only tensor authority", () => {
    const built = artifact({
      regions: [
        region("global"),
        region("hull", { tensorAuthorityMode: "diagonal_reduced_order", tensor: { T00: -1, T11: 1, T22: 1, T33: 1 } }),
        region("wall"),
        region("exterior_shell"),
      ],
    });
    expect(built.overallState).toBe("review");
    expect(built.reasonCodes).toContain("hull:full_tensor_authority_missing");
  });

  it("requires all four controlled regions", () => {
    const built = artifact({ regions: [region("global"), region("hull"), region("wall")] });
    expect(built.overallState).toBe("fail");
    expect(built.reasonCodes).toContain("missing_required_region:exterior_shell");
  });

  it("keeps unknown basis metadata as review evidence", () => {
    const built = artifact({
      regions: [
        region("global"),
        region("hull", { aggregationMode: "unknown", sampleCount: null }),
        region("wall"),
        region("exterior_shell"),
      ],
    });
    expect(built.overallState).toBe("review");
    expect(built.reasonCodes).toContain("hull:aggregation_mode_unknown");
    expect(built.reasonCodes).toContain("hull:sample_count_missing");
  });

  it("consumes regional material tensor models as source-side full-tensor evidence while leaving QEI and conservation downstream", () =>
    withTemp((root) => {
      const receipt = materialReceipt();
      const regionalModel = buildRegionalMaterialSourceTensorModel({
        generatedAt,
        materialReceipt: receipt,
        materialReceiptRef: "receipt.json",
        sourceModelRef: "regional-model.json",
        componentModel: {
          modelKind: "lifshitz_regional_tensor",
          selectedProfileId: profile,
          regions: {
            global: materialRegion(5.826745098955891e7),
            hull: materialRegion(7.335539026786809e8),
            wall: materialRegion(1.6995392012526472e9),
            exterior_shell: materialRegion(1.6991577991011546e9),
          },
        },
      });
      writeFileSync(join(root, "receipt.json"), JSON.stringify(receipt), "utf8");
      writeFileSync(join(root, "regional-model.json"), JSON.stringify(regionalModel), "utf8");
      writeFileSync(join(root, "sample-plan.json"), JSON.stringify(samplePlan()), "utf8");
      writeFileSync(join(root, "source-closure.json"), JSON.stringify({}), "utf8");

      const source = publishTileEffectiveFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceInputPath: "regional-model.json",
        regionalSamplePlanPath: "sample-plan.json",
        outPath: "tile-full-tensor-source.json",
      });
      const counterpart = publishTileEffectiveCounterpart({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source-closure.json",
        tileFullTensorSourcePath: "tile-full-tensor-source.json",
        outPath: "counterpart.json",
      });
      const authority = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "counterpart.json",
        casimirMaterialReceiptPath: "receipt.json",
        outPath: "authority.json",
      });
      const sourceWall = source.regions.find((region) => region.regionId === "wall");
      const counterpartWall = counterpart.regions.find((region) => region.regionId === "wall");
      const authorityWall = authority.regions.find((region) => region.regionId === "wall");

      expect(source.sourceModel.sourceModelId).toBe(
        "nhm2_regional_material_source_tensor_model",
      );
      expect(source.sourceModel.metricRequiredInputRefs).toEqual([]);
      expect(source.overallState).toBe("review");
      expect(source.regions.find((region) => region.regionId === "global")?.sampleCount).toBe(64);
      expect(source.regions.find((region) => region.regionId === "global")?.regionMaskRef).toBe(
        "sample-plan.mask.global",
      );
      expect(
        source.regions
          .find((region) => region.regionId === "global")
          ?.provenance.preAggregationValueRefs,
      ).toContain("sample-plan.json#sample-plan/global");
      expect(sourceWall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
      expect(sourceWall?.provenance.derivationMode).toBe("source_model_direct_full_tensor");
      expect(sourceWall?.blockers).not.toContain("full_tensor_components_missing");
      expect(sourceWall?.blockers).toContain("qei_dossier_not_pass");
      expect(sourceWall?.blockers).toContain("conservation_unknown");

      expect(counterpartWall?.comparisonRole).toBe("tile_effective_counterpart");
      expect(counterpartWall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
      expect(counterpartWall?.blockers).not.toContain("full_tensor_authority_missing");
      expect(counterpartWall?.blockers).toContain("qei_not_promotion_safe");
      expect(counterpartWall?.blockers).toContain("conservation_unknown");

      expect(authority.summary.anyMetricEcho).toBe(false);
      expect(authority.summary.anyProxy).toBe(false);
      expect(authorityWall?.comparisonRole).toBe("tile_effective_counterpart");
      expect(authorityWall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
      expect(authorityWall?.blockers).not.toContain(
        "source_side_full_tensor_authority_missing",
      );
      expect(authorityWall?.blockers).toContain("conservation_unknown");
      expect(authority.claimBoundary.doesNotValidatePhysicalSource).toBe(true);
    }));
});
