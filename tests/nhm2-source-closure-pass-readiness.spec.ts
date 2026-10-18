import { describe, expect, it } from "vitest";

import {
  buildNhm2RegionalSourceClosureEvidenceArtifact,
  type Nhm2RegionalSourceClosureEvidenceRegion,
  type Nhm2RegionalSourceClosureRegionId,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2SourceSideSameBasisTensorAuthorityArtifact } from "../shared/contracts/nhm2-source-side-same-basis-tensor-authority.v1";
import { buildNhm2TileEffectiveCounterpartArtifact } from "../shared/contracts/nhm2-tile-effective-counterpart.v1";
import { assessNhm2SourceClosurePassReadiness } from "../tools/nhm2/source-closure-pass-readiness";

const profile = "stage1_centerline_alpha_0p995_v1";
const regions: Nhm2RegionalSourceClosureRegionId[] = [
  "global",
  "hull",
  "wall",
  "exterior_shell",
];

const fullTensor = (scale: number) => ({
  T00: -scale,
  T01: 0,
  T02: 0,
  T03: 0,
  T10: 0,
  T11: scale,
  T12: 0,
  T13: 0,
  T20: 0,
  T21: 0,
  T22: scale,
  T23: 0,
  T30: 0,
  T31: 0,
  T32: 0,
  T33: scale,
});

const residuals = (metric: number, tile: number, pass: boolean) => {
  const absResidual = Math.abs(metric - tile);
  const relResidual = metric === 0 ? null : absResidual / Math.abs(metric);
  return {
    componentResiduals: {
      T00: {
        metricRequired: -metric,
        tileEffectiveCounterpart: -tile,
        absResidual,
        relResidual,
      },
    },
    relLInf: relResidual,
    absLInf: absResidual,
    toleranceRelLInf: 0.1,
    pass,
  };
};

const evidenceRegion = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  options: {
    metric?: number;
    tile?: number;
    comparisonRole?: Nhm2RegionalSourceClosureEvidenceRegion["tileEffectiveCounterpart"]["comparisonRole"];
    basis?: Nhm2RegionalSourceClosureEvidenceRegion["comparisonBasisStatus"];
    tensorAuthority?: Nhm2RegionalSourceClosureEvidenceRegion["metricRequired"]["tensorAuthorityMode"];
    pass?: boolean;
  } = {},
): Nhm2RegionalSourceClosureEvidenceRegion => {
  const metric = options.metric ?? 10;
  const tile = options.tile ?? metric;
  const pass = options.pass ?? tile === metric;
  const tensorAuthority = options.tensorAuthority ?? "full_tensor";
  return {
    regionId,
    status: pass ? "pass" : "fail",
    comparisonBasisStatus: options.basis ?? "same_basis",
    metricRequired: {
      tensorRef: `metric.${regionId}`,
      tensorAuthorityMode: tensorAuthority,
      tensor: fullTensor(metric),
      chartRef: "comoving_cartesian",
      unitsRef: "J/m^3",
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
      sampleCount: 10,
    },
    tileEffectiveCounterpart: {
      tensorRef: `tile.${regionId}`,
      tensorAuthorityMode: tensorAuthority,
      tensor: fullTensor(tile),
      chartRef: "comoving_cartesian",
      unitsRef: "J/m^3",
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
      sampleCount: 10,
      comparisonRole: options.comparisonRole ?? "tile_effective_counterpart",
    },
    residuals: residuals(metric, tile, pass),
    blockers: [],
  };
};

const regionalEvidence = (
  regionOptions: Partial<Record<Nhm2RegionalSourceClosureRegionId, Parameters<typeof evidenceRegion>[1]>> = {},
) =>
  buildNhm2RegionalSourceClosureEvidenceArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "readiness-run",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    regions: regions.map((regionId) => evidenceRegion(regionId, regionOptions[regionId])),
    literatureRefs: ["fixture"],
  });

const authoritativeSourceAuthority = () => {
  const counterpart = buildNhm2TileEffectiveCounterpartArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "readiness-run",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceAuthorityMode: "reconstituted_full_tensor_from_tile_model",
    sourceTensorArtifactRef: "source-full-tensor.json",
    sourceTensorAuthorityMode: "full_tensor",
    conservationRef: null,
    conservationStatus: "unknown",
    qeiDossierRef: null,
    qeiApplicabilityStatus: "UNKNOWN",
    quantumStateAssumptions: [],
    renormalizationConvention: null,
    cavityBoundaryModel: null,
    cycleAverageClosureStatus: "unknown",
    dutyCycleStatus: "unknown",
    lightCrossingConsistencyStatus: "unknown",
    conservationDiagnostics: {
      divTStatus: "unknown",
      divTResidualLInf: null,
      continuityResidualLInf: null,
      momentumResidualLInf: null,
    },
    regions: regions.map((regionId) => ({
      regionId,
      status: "pass",
      comparisonRole: "tile_effective_counterpart",
      tensorAuthorityMode: "full_tensor",
      tensor: fullTensor(10),
      chartRef: "comoving_cartesian",
      unitsRef: "J/m^3",
      regionMaskRef: `mask.${regionId}`,
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
      sampleCount: 10,
      provenance: {
        producerModule: "source-model.ts",
        producerFunction: "emitFullTensor",
        inputRefs: [`source.${regionId}`],
        sourceModelId: "fixture_source_model",
        sourceModelVersion: "v1",
        derivationMode: "tile_model_direct_full_tensor",
        notDerivedFromMetricRequiredTensor: true,
      },
      blockers: [],
    })),
    literatureRefs: ["fixture"],
  });
  return buildNhm2SourceSideSameBasisTensorAuthorityArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    chartId: "comoving_cartesian",
    sourceModelId: "fixture_source_model",
    counterpartArtifactRef: "counterpart.json",
    counterpartArtifact: counterpart,
  });
};

describe("NHM2 source-closure pass readiness preflight", () => {
  it("keeps current-style counterpart-missing evidence out of pass-ready state", () => {
    const artifact = assessNhm2SourceClosurePassReadiness({
      generatedAt: "2026-06-12T00:00:00.000Z",
      regionalEvidenceRef: "regional.json",
      regionalEvidence: regionalEvidence({
        wall: {
          tile: 159.50679233985802,
          comparisonRole: "gr_matter_channel_observation",
          basis: "aggregation_mismatch",
          tensorAuthority: "diagonal_reduced_order",
          pass: false,
        },
      }),
    });

    expect(artifact.sourceClosurePassSignalAllowed).toBe(false);
    expect(artifact.fullSolvePassSignalAllowed).toBe(false);
    expect(artifact.firstRetirableBlocker).toBe("source_side_authority_artifact_missing");
    expect(artifact.preflightBlockers).toContain("counterpart_missing");
    expect(artifact.preflightBlockers).toContain("source_side_authority_artifact_missing");
    expect(artifact.regions.find((region) => region.regionId === "wall")?.sourceClosurePassReady).toBe(false);
  });

  it("allows only a source-closure pass candidate when regional evidence and source authority are clean", () => {
    const artifact = assessNhm2SourceClosurePassReadiness({
      generatedAt: "2026-06-12T00:00:00.000Z",
      regionalEvidenceRef: "regional.json",
      regionalEvidence: regionalEvidence(),
      sourceAuthorityRef: "source-authority.json",
      sourceAuthority: authoritativeSourceAuthority(),
    });

    expect(artifact.sourceClosurePassSignalAllowed).toBe(true);
    expect(artifact.fullSolvePassSignalAllowed).toBe(false);
    expect(artifact.firstRetirableBlocker).toBe("none");
    expect(artifact.preflightBlockers).toEqual([]);
    expect(artifact.regions.every((region) => region.sourceClosurePassReady)).toBe(true);
    expect(artifact.claimBoundary.doesNotPromoteViability).toBe(true);
  });
});
