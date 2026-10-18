import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { Nhm2CandidateMetricProfileSpecV1 } from "../shared/contracts/nhm2-candidate-metric-profile-spec.v1";
import {
  buildNhm2RegionalSupportFunctionAtlas,
  type Nhm2RegionalSupportFunctionAtlasV1,
} from "../shared/contracts/nhm2-regional-support-function-atlas.v1";
import {
  isNhm2CampaignStabilityEvidence,
  type Nhm2DynamicEffectiveGeometryEvidenceV1,
  type Nhm2SwitchingConservationEvidenceV1,
} from "../shared/contracts/nhm2-time-dependent-source-campaign.v1";
import { publishNhm2CampaignStabilityEvidence } from "../tools/nhm2/build-campaign-stability-evidence";

const writeJson = (path: string, value: unknown): void => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const spec = (): Nhm2CandidateMetricProfileSpecV1 =>
  ({
    contractVersion: "nhm2_candidate_metric_profile_spec/v1",
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    candidateProfileId: "candidate-alpha-0p9000",
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
      coordinateTimeSeconds: 10,
      shipProperTimeSeconds: 9,
      clockSavingSeconds: 1,
      routeEtaCertified: false,
    },
    executableGeometry: {
      runtimeProfileId: "stage1_centerline_alpha_0p9000_v1",
      runtimeProfileRef: "runtime.json",
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
      transitionKernelAdapterRef: "atlas.ts#compact_bump",
      shiftFieldEvaluatorStatus: "available",
      shiftFieldEvaluatorRef: "natario.ts#evaluateShiftVector",
      regionalSupportAtlasRef: "atlas.json",
      gridRef: "grid.json",
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
  }) as Nhm2CandidateMetricProfileSpecV1;

const dynamicEvidence = (
  bounded = true,
): Nhm2DynamicEffectiveGeometryEvidenceV1 => ({
  contractVersion: "nhm2_dynamic_effective_geometry_evidence/v1",
  generatedAt: "2026-06-19T00:00:00.000Z",
  dynamicGeometryRef: "dynamic.json",
  effectiveGeometryRef: "effective.json",
  averagingWindowSeconds: 1,
  cycleAverageSourceFixed: true,
  averagedSourceTensorRef: "averaged.json",
  backreactionResidualRef: "backreaction.json",
  residualLInf: bounded ? 0.01 : 0.5,
  residualL2: bounded ? 0.005 : 0.25,
  bounded,
  agreementStatus: bounded ? "pass" : "fail",
  blockers: bounded ? [] : ["backreaction_residual_not_bounded"],
});

const switchingEvidence = (): Nhm2SwitchingConservationEvidenceV1 => ({
  contractVersion: "nhm2_switching_covariant_conservation_evidence/v1",
  generatedAt: "2026-06-19T00:00:00.000Z",
  staticCovariantConservationRef: "static.json",
  scheduleRef: "schedule.json",
  sectorBoundaryRef: "sector.json",
  switchingFunctionRef: "switching.json",
  includesRegionalSupportDerivatives: true,
  includesSectorBoundaryTerms: true,
  includesTimeDerivativeTerms: true,
  includesTransitionKernelTerms: true,
  toleranceLInf: 0.1,
  overallResidualLInf: 0.05,
  terms: [
    "regional_support_derivative",
    "sector_boundary",
    "time_derivative",
    "transition_kernel",
  ].map((termId) => ({
    termId: termId as Nhm2SwitchingConservationEvidenceV1["terms"][number]["termId"],
    included: true,
    residualLInf: 0.05,
    toleranceLInf: 0.1,
    pass: true,
    blockers: [],
  })),
  conservationStatus: "pass",
  blockers: [],
});

const atlas = (): Nhm2RegionalSupportFunctionAtlasV1 =>
  buildNhm2RegionalSupportFunctionAtlas({
    runIdentity: {
      runId: "candidate-alpha-0p9000",
      profileId: "candidate-alpha-0p9000",
      chartId: "comoving_cartesian",
      metricRef: "metric.json",
      gridRef: "grid.json",
      samplePlanRef: "samples.json",
      createdAt: "2026-06-19T00:00:00.000Z",
    },
    basisAndUnits: {
      tensorBasis: "chart",
      coordinateSystem: "comoving_cartesian",
      lengthUnit: "m",
      energyDensityUnit: "J/m^3",
      stressEnergyConvention: "T_mu_nu_same_chart",
      signatureConvention: "(-,+,+,+)",
    },
    regions: Object.fromEntries(
      [
        "global",
        "hull",
        "wall",
        "exterior_shell",
        "hull_wall_transition",
        "wall_exterior_transition",
      ].map((regionId) => [
        regionId,
        {
          regionId,
          semanticRole:
            regionId === "global"
              ? "global_region"
              : regionId.includes("transition")
                ? "transition_region"
                : "closure_region",
          maskRef: `mask://${regionId}`,
          supportFunctionRef: `support://${regionId}`,
          sampleCount: 8,
          supportStats: {
            minWeight: 0,
            maxWeight: 1,
            meanWeight: 1,
            nonzeroFraction: 1,
          },
          aggregationPolicy: {
            weighting: regionId === "global" ? "global_weighted" : "support_weighted",
            normalization: "sum_weights",
            includeTransitionSamples: true,
          },
        },
      ]),
    ) as Nhm2RegionalSupportFunctionAtlasV1["regions"],
    transitionKernels: [
      {
        kernelId: "hull-wall",
        fromRegion: "hull",
        toRegion: "wall",
        supportRegion: "hull_wall_transition",
        kernelKind: "compact_bump",
        smoothnessClass: "Cinf",
        widthMeters: 1,
        derivativeTermsAvailable: false,
      },
      {
        kernelId: "wall-exterior",
        fromRegion: "wall",
        toRegion: "exterior_shell",
        supportRegion: "wall_exterior_transition",
        kernelKind: "compact_bump",
        smoothnessClass: "Cinf",
        widthMeters: 1,
        derivativeTermsAvailable: false,
      },
    ],
    partitionOfUnity: {
      appliesTo: ["global", "hull", "wall", "exterior_shell"],
      sumWeightsMean: 1,
      sumWeightsMaxAbsError: 0,
      negativeWeightMin: 0,
      overlapPolicy: "partition_of_unity",
      status: "pass",
    },
    derivativeSupport: {
      partialMuWAvailable: false,
      covariantDerivativeSupportAvailable: false,
      derivativeBasis: "chart",
      transitionDerivativeTermsRequired: true,
    },
    provenance: {
      generatedFrom: ["test"],
      inputHashes: { test: "hash" },
      atlasHash: "atlas-hash",
      targetEchoForbidden: true,
      targetDerivedFieldsUsed: false,
    },
  });

describe("campaign stability evidence publisher", () => {
  it("emits a reduced-order pass when executable geometry and dynamic evidence are bounded", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-stability-"));
    try {
      writeJson(join(dir, "spec.json"), spec());
      writeJson(join(dir, "dynamic.json"), dynamicEvidence());
      writeJson(join(dir, "switching.json"), switchingEvidence());
      writeJson(join(dir, "atlas.json"), atlas());

      const artifact = publishNhm2CampaignStabilityEvidence({
        repoRoot: dir,
        candidateProfileSpecPath: "spec.json",
        dynamicEffectiveGeometryPath: "dynamic.json",
        switchingConservationPath: "switching.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "stability.json",
      });
      const written = JSON.parse(readFileSync(join(dir, "stability.json"), "utf8"));

      expect(artifact.horizonStatus).toBe("pass");
      expect(artifact.blueshiftStatus).toBe("pass");
      expect(artifact.particleAccumulationStatus).toBe("pass");
      expect(artifact.perturbativeStabilityStatus).toBe("pass");
      expect(artifact.blockers).toEqual([]);
      expect(isNhm2CampaignStabilityEvidence(written)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed with typed blockers when dynamic backreaction is not bounded", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-stability-"));
    try {
      writeJson(join(dir, "spec.json"), spec());
      writeJson(join(dir, "dynamic.json"), dynamicEvidence(false));
      writeJson(join(dir, "switching.json"), switchingEvidence());
      writeJson(join(dir, "atlas.json"), atlas());

      const artifact = publishNhm2CampaignStabilityEvidence({
        repoRoot: dir,
        candidateProfileSpecPath: "spec.json",
        dynamicEffectiveGeometryPath: "dynamic.json",
        switchingConservationPath: "switching.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "stability.json",
      });

      expect(artifact.blueshiftStatus).toBe("review");
      expect(artifact.perturbativeStabilityStatus).toBe("review");
      expect(artifact.blockers).toEqual(
        expect.arrayContaining([
          "blueshift:dynamic_backreaction_not_bounded_for_blueshift_screen",
          "perturbative_stability:dynamic_backreaction_not_bounded_for_stability_screen",
        ]),
      );
      expect(isNhm2CampaignStabilityEvidence(artifact)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
