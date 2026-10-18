import { describe, expect, it } from "vitest";

import { buildNhm2CandidateCampaignGrid } from "../shared/contracts/nhm2-candidate-campaign-grid.v1";
import type { Nhm2CandidateMetricProfileSpecV1 } from "../shared/contracts/nhm2-candidate-metric-profile-spec.v1";
import { buildCandidateMetricRequiredFullRegionalTensor } from "../tools/nhm2/build-candidate-metric-required-full-regional-tensor";

const candidateProfileId =
  "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";

const candidateProfileSpec = (
  ready = true,
): Nhm2CandidateMetricProfileSpecV1 => ({
  contractVersion: "nhm2_candidate_metric_profile_spec/v1",
  generatedAt: "2026-06-19T00:00:00.000Z",
  laneId: "nhm2_shift_lapse",
  candidateProfileId,
  parentProfileId: "stage1_centerline_alpha_0p995_v1",
  alphaCenterline: 0.9,
  subjectiveEfficiencyProxy: 1 / 0.9,
  proposalKind: "combined_metric_redesign",
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
    coordinateTimeSeconds: 100,
    shipProperTimeSeconds: 90,
    clockSavingSeconds: 10,
    routeEtaCertified: false,
  },
  executableGeometry: {
    runtimeProfileId: "stage1_centerline_alpha_0p9000_v1",
    runtimeProfileRef: "runtime-profile.json",
    runtimeProfileRegistered: true,
    runtimeProfileMatchesCandidateLevers: true,
    supportedCandidateLevers: [
      "lapse_depth_scale",
      "shift_amplitude_scale",
      "wall_thickness_scale",
      "smoothing_width_scale",
      "transition_kernel",
    ],
    unsupportedCandidateLevers: [],
    candidateGeometryAdapterStatus: "available",
    transitionKernelAdapterRef: "atlas-builder#compact_bump",
    shiftFieldEvaluatorStatus: "available",
    shiftFieldEvaluatorRef: "natario-warp.ts#calculateNatarioWarpBubble",
    regionalSupportAtlasRef: "candidate-atlas.json",
    gridRef: "candidate-grid.json",
    admRouteReady: ready,
    blockers: ready ? [] : ["candidate_regional_support_atlas_ref_missing"],
  },
  campaignReadiness: {
    canEnterFullAdmMetricTensorRoute: ready,
    needsFrozenCampaignRun: true,
    firstBlocker: ready
      ? "full_frozen_campaign_run_required"
      : "candidate_regional_support_atlas_ref_missing",
    blockers: ready
      ? ["full_frozen_campaign_run_required"]
      : ["candidate_regional_support_atlas_ref_missing"],
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

describe("candidate metric-required full regional tensor builder", () => {
  it("emits a complete same-chart regional tensor from the candidate ADM shift-field route", () => {
    const spec = candidateProfileSpec();
    const grid = buildNhm2CandidateCampaignGrid({
      candidateProfileSpec: spec,
      candidateProfileSpecRef: "candidate-spec.json",
      closureRegionSampleCount: 24,
    });

    const artifact = buildCandidateMetricRequiredFullRegionalTensor({
      generatedAt: "2026-06-19T00:00:00.000Z",
      candidateProfileSpec: spec,
      candidateCampaignGrid: grid,
      candidateProfileSpecRef: "candidate-spec.json",
      candidateCampaignGridRef: "candidate-grid.json",
      outArtifactRef: "candidate-full-regional-tensor.json",
      gridDims: [8, 8, 8],
    });

    expect(artifact.contractVersion).toBe(
      "nhm2_metric_required_regional_full_tensor_source/v1",
    );
    expect(artifact.selectedProfileId).toBe(candidateProfileId);
    expect(artifact.sourceRoute).toBe("adm_projection");
    expect(artifact.summary.firstBlocker).toBeNull();
    expect(artifact.summary.allRequiredRegionsFullTensor).toBe(true);
    expect(artifact.claimBoundary.validatesPhysicalSource).toBe(false);

    const hull = artifact.regions.find((region) => region.regionId === "hull");
    const t0y = hull?.sameChartFullTensor.components.find(
      (component) => component.componentId === "T0y",
    );
    const txy = hull?.sameChartFullTensor.components.find(
      (component) => component.componentId === "Txy",
    );
    expect(hull?.status).toBe("computed");
    expect(hull?.sampleCount).toBeGreaterThan(0);
    expect(t0y?.status).toBe("derived_same_chart");
    expect(t0y?.provenance.routeId).toBe(
      "candidate_adm_shift_field_region_mean_v1",
    );
    expect(Number.isFinite(t0y?.valueSI)).toBe(true);
    expect(txy?.status).toBe("derived_same_chart");
    expect(txy?.assumptions).toContain(
      "candidate metric-required full regional tensor was evaluated from the registered runtime shift field",
    );
  });

  it("refuses to run when the candidate profile is not ADM-route ready", () => {
    const spec = candidateProfileSpec(false);
    const grid = buildNhm2CandidateCampaignGrid({ candidateProfileSpec: spec });

    expect(() =>
      buildCandidateMetricRequiredFullRegionalTensor({
        candidateProfileSpec: spec,
        candidateCampaignGrid: grid,
        candidateProfileSpecRef: "candidate-spec.json",
        candidateCampaignGridRef: "candidate-grid.json",
        outArtifactRef: "candidate-full-regional-tensor.json",
      }),
    ).toThrow(/candidate profile is not ready for full ADM route/);
  });
});
