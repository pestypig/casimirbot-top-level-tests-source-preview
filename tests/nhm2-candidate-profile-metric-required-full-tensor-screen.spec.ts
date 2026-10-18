import { describe, expect, it } from "vitest";

import { buildNhm2MetricRequiredRegionalFullTensorSourceArtifact } from "../shared/contracts/nhm2-metric-required-regional-full-tensor-source.v1";
import type { Nhm2MetricRequiredMomentumDemandAuditV1 } from "../shared/contracts/nhm2-metric-required-momentum-demand-audit.v1";
import {
  NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS,
  type Nhm2RegionalSourceClosureRegionId,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2SameChartFullTensorArtifact } from "../shared/contracts/nhm2-same-chart-full-tensor.v1";
import { buildCandidateProfileMetricRequiredFullTensorScreen } from "../tools/nhm2/build-candidate-profile-metric-required-full-tensor-screen";

const candidateProfileId =
  "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";

const parentTensorFor = (regionId: Nhm2RegionalSourceClosureRegionId) =>
  buildNhm2SameChartFullTensorArtifact({
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    routeId: "adm_quasi_stationary_recovery_v1",
    source: "adm_projection",
    tensor: {
      T00: regionId === "hull" ? -100 : -50,
      T01: -10,
      T02: 20,
      T03: -30,
      T11: 1,
      T12: 2,
      T13: 3,
      T22: 4,
      T23: 5,
      T33: 6,
    },
    adm: {
      alphaStatus: "computed",
      betaStatus: "computed",
      gammaStatus: "derived_same_chart",
      extrinsicCurvatureStatus: "derived_same_chart",
    },
  });

const parentSource = () =>
  buildNhm2MetricRequiredRegionalFullTensorSourceArtifact({
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    sourceRoute: "adm_projection",
    sourceArtifactRefs: ["parent-runtime.json"],
    regions: NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId, index) => ({
      regionId,
      status: "computed",
      artifactRef: `parent-runtime.json#${regionId}`,
      tensorRef: `parent-runtime.json#${regionId}/tensor`,
      regionMaskRef: `mask:${regionId}`,
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
      sampleCount: 100 + index,
      sameChartFullTensor: parentTensorFor(regionId),
      blockers: [],
      warnings: [],
    })),
  });

const demandAudit = (): Nhm2MetricRequiredMomentumDemandAuditV1 =>
  ({
    contractVersion: "nhm2_metric_required_momentum_demand_audit/v1",
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: candidateProfileId,
    runId: "candidate-full-tensor-screen-test",
    momentumFrameProjectionReceiptRef: "projection-receipt.json",
    projectionEvidenceRef: "profile-search.json",
    projectionApplicabilityStatus: "applicable",
    ratioPolicy: "candidate_profile_screen_scaled_from_current_metric_momentum_audit",
    components: NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.flatMap((regionId) => [
      {
        regionId,
        componentId: "T01",
        projectedMetricRequiredMomentumToEnergyRatio: 0.01,
        causalMomentumToEnergyRatioLimit: 1,
        exceedanceFactor: 0.01,
        status: "pass",
        blockers: [],
      },
      {
        regionId,
        componentId: "T02",
        projectedMetricRequiredMomentumToEnergyRatio: 0.25,
        causalMomentumToEnergyRatioLimit: 1,
        exceedanceFactor: 0.25,
        status: "pass",
        blockers: [],
      },
      {
        regionId,
        componentId: "T03",
        projectedMetricRequiredMomentumToEnergyRatio: 0.03,
        causalMomentumToEnergyRatioLimit: 1,
        exceedanceFactor: 0.03,
        status: "pass",
        blockers: [],
      },
    ]),
    summary: {
      allProjectedRatiosAvailable: true,
      anyProjectedMetricRequiredCausalMomentumBoundViolation: false,
      worstRegionId: "hull",
      worstComponentId: "T02",
      worstProjectedMetricRequiredMomentumToEnergyRatio: 0.25,
      worstExceedanceFactor: 0.25,
      currentMetricProfileFalsified: false,
      falsifierScope: "not_applicable",
      firstBlocker: null,
      blockerCount: 0,
    },
    claimBoundary: {
      diagnosticOnly: true,
      metricDemandAuditDoesNotValidatePhysicalSource: true,
      reducedOrderProjectionDoesNotReplaceFullAdmTetrad: true,
      currentProfileFalsifierDoesNotProveUniversalMetricImpossibility: true,
      transportClaimAllowed: false,
    },
  }) as Nhm2MetricRequiredMomentumDemandAuditV1;

describe("candidate profile metric-required full tensor screen", () => {
  it("projects T0i for a candidate while keeping the evidence blocked until a full ADM route exists", () => {
    const artifact = buildCandidateProfileMetricRequiredFullTensorScreen({
      sourceMetricRequiredFullTensorSource: parentSource(),
      candidateMomentumDemandAudit: demandAudit(),
      sourceMetricRequiredFullTensorSourceRef: "parent-full-tensor-source.json",
      candidateMomentumDemandAuditRef: "candidate-momentum-audit.json",
    });
    const hull = artifact.regions.find((region) => region.regionId === "hull");
    const t0y = hull?.sameChartFullTensor.components.find(
      (component) => component.componentId === "T0y",
    );
    const txx = hull?.sameChartFullTensor.components.find(
      (component) => component.componentId === "Txx",
    );

    expect(artifact.selectedProfileId).toBe(candidateProfileId);
    expect(artifact.sourceRoute).toBe("runtime_artifact");
    expect(artifact.summary.firstBlocker).toBe(
      "candidate_metric_required_full_tensor_screen_not_full_adm_route",
    );
    expect(artifact.summary.blockedRegionIds).toEqual([
      "global",
      "hull",
      "wall",
      "exterior_shell",
    ]);
    expect(hull?.status).toBe("blocked");
    expect(hull?.blockers).toContain(
      "candidate_metric_required_full_tensor_screen_not_full_adm_route",
    );
    expect(t0y?.valueSI).toBe(25);
    expect(t0y?.provenance.routeId).toBe("candidate_profile_momentum_screen_v1");
    expect(txx?.valueSI).toBe(1);
    expect(txx?.assumptions).toContain(
      "candidate metric-required full tensor screen row inherited non-momentum components from the parent profile",
    );
    expect(artifact.claimBoundary.validatesPhysicalSource).toBe(false);
    expect(artifact.claimBoundary.promotesViability).toBe(false);
  });
});
