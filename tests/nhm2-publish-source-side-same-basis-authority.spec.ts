import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import {
  buildNhm2TileSourceFullApparatusTensorValues,
  NHM2_FULL_APPARATUS_REQUIRED_TERM_IDS,
  NHM2_FULL_APPARATUS_SYMMETRIC_TENSOR_COMPONENTS,
  type Nhm2FullApparatusTensorValueRegionV1,
} from "../shared/contracts/nhm2-tile-source-full-apparatus-tensor-values.v1";
import {
  buildNhm2TileEffectiveCounterpartArtifact,
  type Nhm2TileEffectiveCounterpartComparisonRole,
  type Nhm2TileEffectiveCounterpartRegion,
  type Nhm2TileEffectiveCounterpartTensorAuthorityMode,
} from "../shared/contracts/nhm2-tile-effective-counterpart.v1";
import type { Nhm2TileSourceAuthorityHandoffV1 } from "../shared/contracts/nhm2-tile-source-authority-handoff.v1";
import { publishSourceSideSameBasisTensorAuthority } from "../tools/nhm2/publish-source-side-same-basis-authority";

const profile = "stage1_centerline_alpha_0p995_v1";
const regionIds = ["global", "hull", "wall", "exterior_shell"] as const;

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "source-authority-run",
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

const tensor = (value: number, mode: Nhm2TileEffectiveCounterpartTensorAuthorityMode) => ({
  T00: -value,
  T11: value,
  T22: value,
  T33: value,
  ...(mode === "diagonal_reduced_order"
    ? {}
    : {
        T01: 0,
        T02: 0,
        T03: 0,
        T10: 0,
        T12: 0,
        T13: 0,
        T20: 0,
        T21: 0,
        T23: 0,
        T30: 0,
        T31: 0,
        T32: 0,
      }),
});

const region = (
  regionId: (typeof regionIds)[number],
  role: Nhm2TileEffectiveCounterpartComparisonRole,
  mode: Nhm2TileEffectiveCounterpartTensorAuthorityMode,
): Nhm2TileEffectiveCounterpartRegion => ({
  regionId,
  status: "pass",
  comparisonRole: role,
  tensorAuthorityMode: mode,
  tensor: tensor(10, mode),
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `mask.${regionId}`,
  aggregationMode: "mean",
  normalizationBasis: "sample_count",
  sampleCount: 10,
  provenance: {
    producerModule: "tile-model.ts",
    producerFunction: "emit",
    inputRefs: [`tile.${regionId}`],
    sourceModelId: "fixture_source_model",
    sourceModelVersion: "v1",
    derivationMode:
      role === "metric_echo_diagnostic_only"
        ? "metric_echo"
        : mode === "diagonal_reduced_order"
          ? "diagonal_proxy"
          : "tile_model_direct_full_tensor",
    notDerivedFromMetricRequiredTensor: role !== "metric_echo_diagnostic_only",
  },
  blockers: [],
});

const counterpart = (
  role: Nhm2TileEffectiveCounterpartComparisonRole,
  mode: Nhm2TileEffectiveCounterpartTensorAuthorityMode,
) =>
  buildNhm2TileEffectiveCounterpartArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "source-authority-run",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceAuthorityMode: "unknown",
    sourceTensorArtifactRef: "source-tensor.json",
    sourceTensorAuthorityMode: mode,
    conservationRef: null,
    conservationStatus: "unknown",
    qeiDossierRef: "qei.json",
    qeiApplicabilityStatus: "PASS",
    quantumStateAssumptions: ["declared"],
    renormalizationConvention: "declared",
    cavityBoundaryModel: "declared",
    cycleAverageClosureStatus: "pass",
    dutyCycleStatus: "pass",
    lightCrossingConsistencyStatus: "pass",
    conservationDiagnostics: {
      divTStatus: "pass",
      divTResidualLInf: 0,
      continuityResidualLInf: 0,
      momentumResidualLInf: 0,
    },
    regions: regionIds.map((regionId) => region(regionId, role, mode)),
    literatureRefs: ["fixture"],
  });

const symmetricValueTensor = (value: number) => ({
  T00: -value,
  T01: value * 0.001,
  T02: value * 0.002,
  T03: value * 0.003,
  T11: value * 0.02,
  T12: value * 0.0004,
  T13: value * 0.0005,
  T22: value * 0.021,
  T23: value * 0.0006,
  T33: value * 0.022,
});

const fullApparatusTensorValueRegion = (
  regionId: (typeof regionIds)[number],
): Nhm2FullApparatusTensorValueRegionV1 => ({
  regionId,
  status: "computed",
  tensor: symmetricValueTensor(10),
  componentStatus: Object.fromEntries(
    NHM2_FULL_APPARATUS_SYMMETRIC_TENSOR_COMPONENTS.map((componentId) => [
      componentId,
      "validated_simulation",
    ]),
  ),
  componentAuthority: Object.fromEntries(
    NHM2_FULL_APPARATUS_SYMMETRIC_TENSOR_COMPONENTS.map((componentId) => [
      componentId,
      "constitutive_model",
    ]),
  ),
  termContributions: Object.fromEntries(
    NHM2_FULL_APPARATUS_REQUIRED_TERM_IDS.map((termId) => [
      termId,
      symmetricValueTensor(0.1),
    ]),
  ),
  termReceiptRefs: Object.fromEntries(
    NHM2_FULL_APPARATUS_REQUIRED_TERM_IDS.map((termId) => [
      termId,
      `receipt://full-apparatus-tmunu/terms/${regionId}/${termId}`,
    ]),
  ),
  chartRef: "comoving_cartesian",
  basisRef: "same_basis",
  unitsRef: "J/m^3",
  regionSupportRef: `support.${regionId}`,
  aggregationMode: "support_weighted",
  normalizationBasis: "volume",
  sampleCount: 16,
  valueReceiptRef: `value.${regionId}`,
  blockers: [],
  warnings: [],
});

const fullApparatusTensorValues = () =>
  buildNhm2TileSourceFullApparatusTensorValues({
    generatedAt: "2026-06-12T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    frozenCandidateId: "nhm2_447_layer_topology_optimized_lattice_tin_v1",
    artifactRef: "full-apparatus-values.json",
    sourceRefs: {
      materialEvidenceReceiptsRef: "material-evidence.json",
      fullApparatusTensorEvidenceRef: "full-apparatus-evidence.json",
      apparatusModelRef: "apparatus-model.json",
      atlasRef: "atlas.json",
    },
    sourceSideOnly: true,
    notDerivedFromMetricRequiredTensor: true,
    targetEchoForbidden: true,
    targetDerivedFieldsUsed: false,
    chartId: "comoving_cartesian",
    basisRef: "same_basis",
    unitsRef: "J/m^3",
    regions: regionIds.map((regionId) => fullApparatusTensorValueRegion(regionId)),
  });

const handoffReady = (): Nhm2TileSourceAuthorityHandoffV1 => ({
  contractVersion: "nhm2_tile_source_authority_handoff/v1",
  generatedAt: "2026-06-12T00:00:00.000Z",
  laneId: "nhm2_shift_lapse",
  selectedProfileId: profile,
  frozenCandidateId: "nhm2_447_layer_topology_optimized_lattice_tin_v1",
  sourceRefs: {
    materialEvidenceReceiptsRef: "material-evidence.json",
    physicalValidationPlanRef: "validation-plan.json",
    falsificationReportRef: "falsification-report.json",
    operatingBudgetReadinessRef: "operating-budget-readiness.json",
    fullApparatusTensorOperatingBudgetRef: "full-apparatus-tensor-operating-budget.json",
    targetAuthorityContractRef: "nhm2_source_side_same_basis_tensor_authority/v1",
  },
  handoffTarget: {
    targetContractVersion: "nhm2_source_side_same_basis_tensor_authority/v1",
    requiresSameChart: true,
    requiresSameBasis: true,
    requiresSameUnits: true,
    requiresFullComponents: ["T00", "T0i", "diagonalTij", "offDiagonalTij"],
    requiresTensorComponents: [
      "T00",
      "T01",
      "T02",
      "T03",
      "T11",
      "T12",
      "T13",
      "T22",
      "T23",
      "T33",
    ],
    requiresRegions: ["wall", "hull", "exterior_shell"],
    metricTargetEchoForbidden: true,
  },
  gates: [
    "material_receipts",
    "full_apparatus_tensor",
    "source_authority_metadata",
    "component_coverage",
    "component_detail_refs",
    "regional_coverage",
    "no_metric_target_echo",
    "operating_budget_readiness",
    "falsification_report",
  ].map((gateId) => ({
    gateId: gateId as Nhm2TileSourceAuthorityHandoffV1["gates"][number]["gateId"],
    status: "pass",
    blockers: [],
    requiredChange: "No change required for fixture handoff.",
    requiredCorrections: {},
  })),
  frontierResolutionQueue: [],
  summary: {
    handoffStatus: "handoff_ready",
    handoffReadyForSameBasisAuthority: true,
    materialEvidenceReady: true,
    fullApparatusTensorReady: true,
    fullApparatusComponentDetailRefsReady: true,
    sourceAuthorityEvidenceReady: true,
    allReceiptsPresent: true,
    operatingBudgetsReady: true,
    operatingBudgetsFalsifyCurrentCandidate: false,
    physicalValidationStillRequired: true,
    firstBlocker: "none",
    firstRequiredCorrections: {},
    firstFrontierResolutionMode: "none",
    firstFrontierCampaignDomain: "none",
    frontierResolutionItemCount: 0,
    physicalViabilityClaimAllowed: false,
    transportClaimAllowed: false,
    propulsionClaimAllowed: false,
  },
  claimBoundary: {
    diagnosticOnly: true,
    handoffOnly: true,
    handoffDoesNotRunSameBasisAuthority: true,
    handoffDoesNotRunDownstreamGates: true,
    operatingBudgetReadinessDoesNotValidateMaterialSource: true,
    handoffReadyIsNotPhysicalCredibility: true,
    handoffCarriesFrontierQueueOnly: true,
    idealScalarCasimirIsNotMaterialEvidence: true,
    physicalViabilityClaimAllowed: false,
    transportClaimAllowed: false,
    propulsionClaimAllowed: false,
  },
});

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-source-authority-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("publish source-side same-basis tensor authority", () => {
  it("marks current observation-channel counterparts as counterpart_missing", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "tile.json"),
        JSON.stringify(counterpart("gr_matter_channel_observation", "full_tensor")),
        "utf8",
      );
      const artifact = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "tile.json",
        outPath: "authority.json",
      });

      expect(artifact.summary.hasWallAuthority).toBe(false);
      expect(artifact.regions.find((entry) => entry.regionId === "wall")?.status).toBe(
        "counterpart_missing",
      );
    }));

  it("keeps diagonal source-side tensors proxy-limited, not authoritative", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "tile.json"),
        JSON.stringify(counterpart("tile_effective_counterpart", "diagonal_reduced_order")),
        "utf8",
      );
      const artifact = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "tile.json",
        outPath: "authority.json",
      });

      expect(artifact.summary.anyProxy).toBe(true);
      expect(artifact.regions.find((entry) => entry.regionId === "wall")?.status).toBe(
        "proxy_limited",
      );
    }));

  it("uses full-apparatus tensor values as same-basis source authority", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "tile.json"),
        JSON.stringify(counterpart("tile_effective_counterpart", "diagonal_reduced_order")),
        "utf8",
      );
      writeFileSync(join(root, "handoff.json"), JSON.stringify(handoffReady()), "utf8");
      writeFileSync(
        join(root, "full-apparatus-values.json"),
        JSON.stringify(fullApparatusTensorValues()),
        "utf8",
      );

      const artifact = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "tile.json",
        tileSourceAuthorityHandoffPath: "handoff.json",
        fullApparatusTensorValuesPath: "full-apparatus-values.json",
        outPath: "authority.json",
      });
      const wall = artifact.regions.find((entry) => entry.regionId === "wall");

      expect(artifact.summary.hasWallAuthority).toBe(true);
      expect(artifact.summary.allRequiredRegionsAuthoritative).toBe(true);
      expect(artifact.summary.tileSourceHandoffReady).toBe(true);
      expect(artifact.tileSourceAuthorityHandoffFrontierResolutionQueue).toEqual([]);
      expect(artifact.summary.tileSourceHandoffFirstFrontierResolutionMode).toBe("none");
      expect(artifact.summary.tileSourceHandoffFirstFrontierCampaignDomain).toBe("none");
      expect(artifact.summary.tileSourceHandoffFrontierResolutionItemCount).toBe(0);
      expect(wall?.status).toBe("authoritative_same_basis");
      expect(wall?.comparisonRole).toBe("tile_source_full_apparatus_tensor_values");
      expect(wall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
      expect(wall?.sourceTensorRef).toBe("value.wall");
      expect(wall?.blockers).toEqual([]);
      expect(wall?.warnings).not.toContain(
        "tile_source_handoff_is_evidence_intake_not_tensor_authority",
      );
    }));

  it("blocks full-apparatus tensor values with unreceipted term contributions", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "tile.json"),
        JSON.stringify(counterpart("tile_effective_counterpart", "diagonal_reduced_order")),
        "utf8",
      );
      writeFileSync(join(root, "handoff.json"), JSON.stringify(handoffReady()), "utf8");
      const values = fullApparatusTensorValues();
      values.regions = values.regions.map((entry) =>
        entry.regionId === "wall"
          ? {
              ...entry,
              termReceiptRefs: {
                ...entry.termReceiptRefs,
                activeControlFieldEnergy: null,
              },
            }
          : entry,
      );
      writeFileSync(
        join(root, "full-apparatus-values.json"),
        JSON.stringify(values),
        "utf8",
      );

      const artifact = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "tile.json",
        tileSourceAuthorityHandoffPath: "handoff.json",
        fullApparatusTensorValuesPath: "full-apparatus-values.json",
        outPath: "authority.json",
      });
      const wall = artifact.regions.find((entry) => entry.regionId === "wall");

      expect(artifact.summary.hasWallAuthority).toBe(false);
      expect(artifact.summary.allRequiredRegionsAuthoritative).toBe(false);
      expect(wall?.status).toBe("blocked");
      expect(wall?.blockers).toContain(
        "full_apparatus_activeControlFieldEnergy_term_receipt_ref_missing",
      );
    }));

  it("forbids metric echoes as source-side authority", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "tile.json"),
        JSON.stringify(counterpart("metric_echo_diagnostic_only", "full_tensor")),
        "utf8",
      );
      const artifact = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "tile.json",
        outPath: "authority.json",
      });

      expect(artifact.summary.anyMetricEcho).toBe(true);
      expect(artifact.regions.find((entry) => entry.regionId === "wall")?.status).toBe(
        "metric_echo_forbidden",
      );
    }));

  it("marks all required regions authoritative only for non-metric full tensor counterparts", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "tile.json"),
        JSON.stringify(counterpart("tile_effective_counterpart", "full_tensor")),
        "utf8",
      );
      const artifact = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "tile.json",
        outPath: "authority.json",
      });

      expect(artifact.summary.hasWallAuthority).toBe(true);
      expect(artifact.summary.allRequiredRegionsAuthoritative).toBe(true);
      expect(artifact.claimBoundary.doesNotValidatePhysicalSource).toBe(true);
    }));

  it("passes tile-source handoff metadata through without making it tensor authority", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "tile.json"),
        JSON.stringify(counterpart("tile_effective_counterpart", "diagonal_reduced_order")),
        "utf8",
      );
      writeFileSync(join(root, "handoff.json"), JSON.stringify(handoffReady()), "utf8");

      const artifact = publishSourceSideSameBasisTensorAuthority({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileEffectiveCounterpartPath: "tile.json",
        tileSourceAuthorityHandoffPath: "handoff.json",
        outPath: "authority.json",
      });

      expect(artifact.tileSourceAuthorityHandoffRef).toBe("handoff.json");
      expect(artifact.tileSourceAuthorityHandoffStatus).toBe("handoff_ready");
      expect(artifact.tileSourceAuthorityHandoffFrontierResolutionQueue).toEqual([]);
      expect(artifact.summary.tileSourceHandoffReady).toBe(true);
      expect(artifact.summary.tileSourceHandoffFirstFrontierResolutionMode).toBe("none");
      expect(artifact.summary.tileSourceHandoffFirstFrontierCampaignDomain).toBe("none");
      expect(artifact.summary.tileSourceHandoffFrontierResolutionItemCount).toBe(0);
      expect(artifact.summary.hasWallAuthority).toBe(false);
      expect(artifact.summary.anyProxy).toBe(true);
      expect(artifact.regions.find((entry) => entry.regionId === "wall")?.status).toBe(
        "proxy_limited",
      );
    }));
});
