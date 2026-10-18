import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { buildNhm2MetricRequiredRegionalFullTensorSourceArtifact } from "../shared/contracts/nhm2-metric-required-regional-full-tensor-source.v1";
import { buildNhm2CandidateCampaignGrid } from "../shared/contracts/nhm2-candidate-campaign-grid.v1";
import {
  NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS,
  type Nhm2RegionalSourceClosureRegionId,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2SameChartFullTensorArtifact } from "../shared/contracts/nhm2-same-chart-full-tensor.v1";
import {
  buildNhm2SourceTileCounterpartCompatibility,
} from "../shared/contracts/nhm2-source-tile-counterpart-compatibility.v1";
import {
  buildNhm2TileEffectiveFullTensorSourceArtifact,
  isNhm2TileEffectiveFullTensorSourceArtifact,
} from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import { publishNhm2CandidateTileEffectiveFullTensorSource } from "../tools/nhm2/build-candidate-tile-effective-full-tensor-source";
import { buildCandidateRegionalSourceClosureEvidence } from "../tools/nhm2/build-candidate-regional-source-closure-evidence";
import { runNhm2FrequencyConvergenceEvidence } from "../tools/nhm2/build-frequency-convergence-evidence";
import type { Nhm2CandidateMetricProfileSpecV1 } from "../shared/contracts/nhm2-candidate-metric-profile-spec.v1";

const candidateProfileId =
  "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";

const spec = (
  overrides: Partial<Nhm2CandidateMetricProfileSpecV1> = {},
): Nhm2CandidateMetricProfileSpecV1 => ({
  contractVersion: "nhm2_candidate_metric_profile_spec/v1",
  generatedAt: "2026-06-19T00:00:00.000Z",
  laneId: "nhm2_shift_lapse",
  candidateProfileId: overrides.candidateProfileId ?? candidateProfileId,
  parentProfileId: "stage1_centerline_alpha_0p995_v1",
  alphaCenterline: overrides.alphaCenterline ?? 0.9,
  subjectiveEfficiencyProxy: overrides.subjectiveEfficiencyProxy ?? 1 / 0.9,
  proposalKind: overrides.proposalKind ?? "combined_metric_redesign",
  sourceProfileSearchRef: "profile-search.json",
  profileDefinition: {
    lapseDepthScale: 1,
    shiftAmplitudeScale: 1e-10,
    wallThicknessScale: 10,
    smoothingWidthScale: 20,
    transitionKernel: "compact_bump",
    projectedT0iSuppressionFactor: 5e16,
    sourceTensorCopiedFromMetric: false,
    silentlyZeroesT0i: false,
    silentlyZeroesOffDiagonalTij: false,
    usesScalarT00Only: false,
  },
  tripClockingDiagnostic: {
    properTimeRatio: 0.9,
    subjectiveEfficiencyProxy: 1 / 0.9,
    formula: "tau = alpha_centerline * T_coordinate",
    coordinateTimeSeconds: null,
    shipProperTimeSeconds: null,
    clockSavingSeconds: null,
    routeEtaCertified: false,
  },
  executableGeometry: {
    runtimeProfileId: "stage1_centerline_alpha_0p9000_v1",
    runtimeProfileRef: "runtime-profile.json",
    runtimeProfileRegistered: true,
    runtimeProfileMatchesCandidateLevers: true,
    supportedCandidateLevers: ["lapse_depth_scale"],
    unsupportedCandidateLevers: [],
    candidateGeometryAdapterStatus: "available",
    transitionKernelAdapterRef: "atlas-builder#compact_bump",
    shiftFieldEvaluatorStatus: "available",
    shiftFieldEvaluatorRef: "natario-warp.ts#calculateNatarioWarpBubble",
    regionalSupportAtlasRef: "candidate-atlas.json",
    gridRef: "candidate-grid.json",
    admRouteReady: true,
    blockers: [],
  },
  campaignReadiness: {
    canEnterFullAdmMetricTensorRoute: true,
    needsFrozenCampaignRun: true,
    firstBlocker: "full_frozen_campaign_run_required",
    blockers: ["full_frozen_campaign_run_required"],
  },
  claimBoundary: {
    diagnosticOnly: true,
    profileSpecDoesNotValidateProfile: true,
    tripClockingDoesNotCertifyRouteEta: true,
    physicalViabilityClaimAllowed: false,
    transportClaimAllowed: false,
    routeEtaClaimAllowed: false,
    propulsionClaimAllowed: false,
  },
});

const metricTensor = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  tensor = {
    T00: 1,
    T01: 0.1,
    T02: 0.2,
    T03: 0.3,
    T11: -1,
    T12: 0.01,
    T13: 0.02,
    T22: -1,
    T23: 0.03,
    T33: -1,
  },
) =>
  buildNhm2SameChartFullTensorArtifact({
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: candidateProfileId,
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    routeId: "candidate_adm_shift_field_region_mean_v1",
    source: "adm_projection",
    tensor,
    defaultAssumptions: [`regionId=${regionId}`],
    adm: {
      alphaStatus: "computed",
      betaStatus: "computed",
      gammaStatus: "derived_same_chart",
      extrinsicCurvatureStatus: "derived_same_chart",
    },
  });

const metricArtifact = (
  tensorsByRegion: Partial<
    Record<Nhm2RegionalSourceClosureRegionId, Parameters<typeof metricTensor>[1]>
  > = {},
) =>
  buildNhm2MetricRequiredRegionalFullTensorSourceArtifact({
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: candidateProfileId,
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    sourceRoute: "adm_projection",
    sourceArtifactRefs: ["candidate-metric.json"],
    regions: NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId) => ({
      regionId,
      status: "computed",
      artifactRef: `candidate-metric.json#${regionId}`,
      tensorRef: `candidate-metric.json#${regionId}/tensor`,
      regionMaskRef: `mask:${regionId}`,
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
      sampleCount: 8,
      sameChartFullTensor: metricTensor(regionId, tensorsByRegion[regionId]),
      blockers: [],
      warnings: [],
    })),
  });

describe("candidate tile-effective full tensor source", () => {
  it("emits a source-side full tensor candidate without metric-required input refs", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    writeFileSync(join(repoRoot, "candidate-spec.json"), JSON.stringify(spec()), "utf8");
    const artifact = publishNhm2CandidateTileEffectiveFullTensorSource({
      repoRoot,
      candidateProfileSpecPath: "candidate-spec.json",
      outPath: "candidate-source.json",
      runId: "candidate-source-test",
    });
    const persisted = JSON.parse(readFileSync(join(repoRoot, "candidate-source.json"), "utf8"));

    expect(artifact.overallState).toBe("pass");
    expect(artifact.sourceModel.metricRequiredInputRefs).toEqual([]);
    expect(artifact.sourceModel.notDerivedFromMetricRequiredTensor).toBe(true);
    expect(artifact.physicalMechanismClaimAllowed).toBe(false);
    expect(
      artifact.regions.every(
        (region) =>
          region.tensorAuthorityMode === "symmetric_full_tensor" &&
          region.provenance.derivationMode === "source_model_direct_full_tensor" &&
          region.tensor.T02 != null &&
          region.tensor.T12 != null,
      ),
    ).toBe(true);
    expect(isNhm2TileEffectiveFullTensorSourceArtifact(persisted)).toBe(true);
  });

  it("emits observer-compatible source-family tensors as source-side trials, not metric echoes", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    const observerSpec = spec({
      candidateProfileId:
        "stage1_centerline_alpha_0p7000_observer_compatible_source_campaign_screen_v1",
      alphaCenterline: 0.7,
      subjectiveEfficiencyProxy: 1 / 0.7,
      proposalKind: "observer_compatible_source",
    });
    writeFileSync(
      join(repoRoot, "candidate-spec.json"),
      JSON.stringify(observerSpec),
      "utf8",
    );

    const artifact = publishNhm2CandidateTileEffectiveFullTensorSource({
      repoRoot,
      candidateProfileSpecPath: "candidate-spec.json",
      outPath: "candidate-source.json",
      runId: "observer-compatible-source-test",
    });
    const wall = artifact.regions.find((region) => region.regionId === "wall");

    expect(artifact.sourceModel.metricRequiredInputRefs).toEqual([]);
    expect(artifact.sourceModel.notDerivedFromMetricRequiredTensor).toBe(true);
    expect(wall?.tensor.T00).toBeGreaterThan(0);
    expect(wall?.tensor.T11).toBeGreaterThan(0);
    expect(wall?.provenance.preAggregationValueRefs).toContain(
      "candidate_levers:observerCompatibleSource=true",
    );
    expect(artifact.physicalMechanismClaimAllowed).toBe(false);
  });

  it("can align source-side sampling metadata to the campaign grid without metric target inputs", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    const candidateSpec = spec();
    const campaignGrid = buildNhm2CandidateCampaignGrid({
      generatedAt: "2026-06-19T00:00:00.000Z",
      candidateProfileSpec: candidateSpec,
      candidateProfileSpecRef: "candidate-spec.json",
    });
    writeFileSync(join(repoRoot, "candidate-spec.json"), JSON.stringify(candidateSpec), "utf8");
    writeFileSync(join(repoRoot, "candidate-grid.json"), JSON.stringify(campaignGrid), "utf8");

    const artifact = publishNhm2CandidateTileEffectiveFullTensorSource({
      repoRoot,
      candidateProfileSpecPath: "candidate-spec.json",
      candidateCampaignGridPath: "candidate-grid.json",
      outPath: "candidate-source.json",
      auditOnly: true,
    });
    const byRegion = new Map(artifact.regions.map((region) => [region.regionId, region]));

    expect(artifact.overallState).toBe("pass");
    expect(artifact.sourceModel.metricRequiredInputRefs).toEqual([]);
    expect(artifact.sourceModel.sourceInputRefs).toEqual([
      "candidate-spec.json",
      "candidate-grid.json",
    ]);
    expect(byRegion.get("global")?.sampleCount).toBe(1728);
    expect(byRegion.get("hull")?.sampleCount).toBe(8);
    expect(byRegion.get("wall")?.sampleCount).toBe(128);
    expect(byRegion.get("exterior_shell")?.sampleCount).toBe(344);
    expect(byRegion.get("wall")?.regionMaskRef).toBe(campaignGrid.regionSamples.wall.maskRef);
    expect(byRegion.get("wall")?.provenance.notDerivedFromMetricRequiredTensor).toBe(true);
    expect(
      artifact.regions.every(
        (region) => region.sourceSupport.cycleAverageStatus === "pass",
      ),
    ).toBe(true);
  });

  it("derives fixed-cycle-average frequency convergence from source-side tensor provenance", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    const candidateSpec = spec();
    const campaignGrid = buildNhm2CandidateCampaignGrid({
      generatedAt: "2026-06-19T00:00:00.000Z",
      candidateProfileSpec: candidateSpec,
      candidateProfileSpecRef: "candidate-spec.json",
    });
    writeFileSync(join(repoRoot, "candidate-spec.json"), JSON.stringify(candidateSpec), "utf8");
    writeFileSync(join(repoRoot, "candidate-grid.json"), JSON.stringify(campaignGrid), "utf8");
    publishNhm2CandidateTileEffectiveFullTensorSource({
      repoRoot,
      candidateProfileSpecPath: "candidate-spec.json",
      candidateCampaignGridPath: "candidate-grid.json",
      outPath: "candidate-source.json",
      auditOnly: true,
    });

    const frequency = runNhm2FrequencyConvergenceEvidence({
      repoRoot,
      sourceFullTensorPath: "candidate-source.json",
      outPath: "frequency.json",
      auditOnly: true,
    });

    expect(frequency.convergenceStatus).toBe("pass");
    expect(frequency.fixedCycleAverageSource).toBe(true);
    expect(frequency.baseFrequencyHz).toBe(15e9);
    expect(frequency.multipliers).toEqual([1, 2, 4]);
    expect(frequency.entries.every((entry) => entry.residualLInf === 0)).toBe(true);
    expect(frequency.blockers).toEqual([]);
  });

  it("keeps frequency convergence blocked if source provenance uses metric target inputs", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    const candidateSpec = spec();
    const campaignGrid = buildNhm2CandidateCampaignGrid({
      generatedAt: "2026-06-19T00:00:00.000Z",
      candidateProfileSpec: candidateSpec,
      candidateProfileSpecRef: "candidate-spec.json",
    });
    writeFileSync(join(repoRoot, "candidate-spec.json"), JSON.stringify(candidateSpec), "utf8");
    writeFileSync(join(repoRoot, "candidate-grid.json"), JSON.stringify(campaignGrid), "utf8");
    const source = publishNhm2CandidateTileEffectiveFullTensorSource({
      repoRoot,
      candidateProfileSpecPath: "candidate-spec.json",
      candidateCampaignGridPath: "candidate-grid.json",
      outPath: "candidate-source.json",
      auditOnly: true,
    });
    const metricEchoSource = buildNhm2TileEffectiveFullTensorSourceArtifact({
      generatedAt: source.generatedAt,
      runId: source.runId,
      selectedProfileId: source.selectedProfileId,
      expectedProfileId: source.expectedProfileId,
      laneId: source.laneId,
      sourceModel: {
        ...source.sourceModel,
        metricRequiredInputRefs: ["metric-required.json"],
      },
      regions: source.regions,
      literatureRefs: source.literatureRefs,
    });
    writeFileSync(
      join(repoRoot, "candidate-source-metric-echo.json"),
      JSON.stringify(metricEchoSource, null, 2),
      "utf8",
    );

    const frequency = runNhm2FrequencyConvergenceEvidence({
      repoRoot,
      sourceFullTensorPath: "candidate-source-metric-echo.json",
      outPath: "frequency.json",
      auditOnly: true,
    });

    expect(frequency.convergenceStatus).toBe("fail");
    expect(frequency.blockers).toContain("source_model_metric_required_input_refs_present");
    expect(frequency.blockers).toContain("cycle_average_source_not_fixed");
  });

  it("allows source/tile compatibility to move past source missing without validating physics", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    writeFileSync(join(repoRoot, "candidate-spec.json"), JSON.stringify(spec()), "utf8");
    const source = publishNhm2CandidateTileEffectiveFullTensorSource({
      repoRoot,
      candidateProfileSpecPath: "candidate-spec.json",
      outPath: "candidate-source.json",
      auditOnly: true,
    });

    const compatibility = buildNhm2SourceTileCounterpartCompatibility({
      candidateProfileSpec: spec(),
      metricRequiredFullRegionalTensor: metricArtifact(),
      metricRequiredFullRegionalTensorRef: "candidate-metric.json",
      sourceFullTensorRef: "candidate-source.json",
      sourceFullTensor: source,
    });

    expect(compatibility.summary).toMatchObject({
      sourceCounterpartAvailable: true,
      sameProfileCounterpart: true,
      allRegionsCompatible: true,
      firstBlocker: null,
    });
    expect(compatibility.claimBoundary.compatibilityDoesNotValidateSourcePhysics).toBe(true);
  });

  it("builds candidate source-closure evidence without hiding support metadata mismatch", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    writeFileSync(join(repoRoot, "candidate-spec.json"), JSON.stringify(spec()), "utf8");
    const source = publishNhm2CandidateTileEffectiveFullTensorSource({
      repoRoot,
      candidateProfileSpecPath: "candidate-spec.json",
      outPath: "candidate-source.json",
      auditOnly: true,
    });
    const matchingMetricTensors = Object.fromEntries(
      source.regions.map((region) => [region.regionId, region.tensor]),
    ) as Partial<
      Record<Nhm2RegionalSourceClosureRegionId, Parameters<typeof metricTensor>[1]>
    >;

    const evidence = buildCandidateRegionalSourceClosureEvidence({
      candidateProfileSpec: spec(),
      metricRequiredFullRegionalTensor: metricArtifact(matchingMetricTensors),
      sourceFullTensor: source,
      metricRequiredFullRegionalTensorRef: "candidate-metric.json",
      sourceFullTensorRef: "candidate-source.json",
      toleranceRelLInf: 0.1,
    });

    expect(evidence.overallState).toBe("review");
    expect(evidence.reasonCodes).toContain("global:sample_count_mismatch");
    expect(evidence.regions.every((region) => region.residuals.pass === true)).toBe(true);
    expect(evidence.regions.every((region) => region.tileEffectiveCounterpart.comparisonRole === "tile_effective_counterpart")).toBe(true);
  });

  it("rejects latest aliases outside audit mode", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-source-"));
    writeFileSync(join(repoRoot, "candidate-spec-latest.json"), JSON.stringify(spec()), "utf8");

    expect(() =>
      publishNhm2CandidateTileEffectiveFullTensorSource({
        repoRoot,
        candidateProfileSpecPath: "candidate-spec-latest.json",
        outPath: "candidate-source.json",
      }),
    ).toThrow(/latest aliases are forbidden/);
  });
});
