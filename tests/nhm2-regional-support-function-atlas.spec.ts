import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import { buildNhm2RegionalSupportDerivativeReceipt } from "../shared/contracts/nhm2-regional-support-derivative-receipt.v1";
import {
  isNhm2RegionalSupportFunctionAtlas,
} from "../shared/contracts/nhm2-regional-support-function-atlas.v1";
import type { Nhm2RegionalTensor } from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2TileEffectiveFullTensorSourceArtifact } from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import { buildNhm2CandidateCampaignGrid } from "../shared/contracts/nhm2-candidate-campaign-grid.v1";
import type { Nhm2CandidateMetricProfileSpecV1 } from "../shared/contracts/nhm2-candidate-metric-profile-spec.v1";
import { buildRegionalSupportFunctionAtlas } from "../tools/nhm2/build-regional-support-function-atlas";

const profile = "stage1_centerline_alpha_0p995_v1";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "atlas-run",
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

const tensor = (value: number): Nhm2RegionalTensor => ({
  T00: -value,
  T01: 0,
  T02: 0,
  T03: 0,
  T10: 0,
  T11: value,
  T12: 0,
  T13: 0,
  T20: 0,
  T21: 0,
  T22: value,
  T23: 0,
  T30: 0,
  T31: 0,
  T32: 0,
  T33: value,
});

const sourceRegion = (
  regionId: "global" | "hull" | "wall" | "exterior_shell",
  value: number,
) => ({
  regionId,
  status: "pass" as const,
  tensorAuthorityMode: "full_tensor" as const,
  tensor: tensor(value),
  symmetry: {
    declared: true,
    kind: "symmetric" as const,
    lowerComponentsDerivedBySymmetry: false,
  },
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `mask.${regionId}`,
  aggregationMode: "mean" as const,
  normalizationBasis: "sample_count" as const,
  sampleCount: 24,
  sourceSupport: {
    supportKernelId: `support.${regionId}`,
    cycleAverageStatus: "pass" as const,
    dutyCycleStatus: "pass" as const,
    lightCrossingConsistencyStatus: "pass" as const,
  },
  provenance: {
    producerModule: "tests",
    producerFunction: "sourceRegion",
    derivationMode: "source_model_reconstituted_full_tensor" as const,
    inputRefs: [`source.${regionId}`],
    preAggregationValueRefs: [`source.pre.${regionId}`],
    notDerivedFromMetricRequiredTensor: true,
  },
  blockers: [],
});

const sourceArtifact = () =>
  buildNhm2TileEffectiveFullTensorSourceArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "atlas-run",
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
      sourceRegion("global", 10),
      sourceRegion("hull", 10),
      sourceRegion("wall", 10),
      sourceRegion("exterior_shell", 10),
    ],
    literatureRefs: ["fewster_thompson_2023_stationary_worldline_qei"],
  });

const supportDerivativeReceipt = (
  overrides: { runId?: string; selectedProfileId?: string; chartId?: string } = {},
) =>
  buildNhm2RegionalSupportDerivativeReceipt({
    generatedAt: "2026-06-14T00:00:00.000Z",
    runId: overrides.runId ?? "atlas-run",
    selectedProfileId: overrides.selectedProfileId ?? profile,
    chartId: overrides.chartId ?? "comoving_cartesian",
    derivativeBasis: "chart",
    derivativeRef: "derivative.supports.json",
    partialMuWAvailable: true,
    covariantDerivativeSupportAvailable: true,
    transitionKernels: [
      {
        kernelId: "kernel:hull_wall:smootherstep_c2",
        supportRegion: "hull_wall_transition",
        derivativeTermsAvailable: true,
        derivativeRef: "derivative.hull_wall.json",
        partialDerivativeComponents: {
          dt: true,
          dx: true,
          dy: true,
          dz: true,
        },
        maxAbsPartialMuW: 1,
        widthMeters: 1,
        blockers: [],
      },
      {
        kernelId: "kernel:wall_exterior:smootherstep_c2",
        supportRegion: "wall_exterior_transition",
        derivativeTermsAvailable: true,
        derivativeRef: "derivative.wall_exterior.json",
        partialDerivativeComponents: {
          dt: true,
          dx: true,
          dy: true,
          dz: true,
        },
        maxAbsPartialMuW: 1,
        widthMeters: 1,
        blockers: [],
      },
    ],
  });

const candidateProfileSpec = (): Nhm2CandidateMetricProfileSpecV1 => ({
  contractVersion: "nhm2_candidate_metric_profile_spec/v1",
  generatedAt: "2026-06-19T00:00:00.000Z",
  laneId: "nhm2_shift_lapse",
  candidateProfileId:
    "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1",
  parentProfileId: profile,
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
    supportedCandidateLevers: ["lapse_depth_scale", "transition_kernel"],
    unsupportedCandidateLevers: [],
    candidateGeometryAdapterStatus: "available",
    transitionKernelAdapterRef: "atlas-builder#compact_bump",
    shiftFieldEvaluatorStatus: "available",
    shiftFieldEvaluatorRef: "shift-field.ts#evaluateShiftVector",
    regionalSupportAtlasRef: null,
    gridRef: null,
    admRouteReady: false,
    blockers: ["candidate_regional_support_atlas_ref_missing"],
  },
  campaignReadiness: {
    canEnterFullAdmMetricTensorRoute: false,
    needsFrozenCampaignRun: true,
    firstBlocker: "candidate_regional_support_atlas_ref_missing",
    blockers: ["candidate_regional_support_atlas_ref_missing"],
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

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-support-atlas-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    writeFileSync(join(root, "source.json"), JSON.stringify(sourceArtifact()), "utf8");
    writeFileSync(
      join(root, "support-derivatives.json"),
      JSON.stringify(supportDerivativeReceipt()),
      "utf8",
    );
    const candidate = candidateProfileSpec();
    writeFileSync(join(root, "candidate-spec.json"), JSON.stringify(candidate), "utf8");
    writeFileSync(
      join(root, "candidate-grid.json"),
      JSON.stringify(
        buildNhm2CandidateCampaignGrid({
          candidateProfileSpec: candidate,
          candidateProfileSpecRef: "candidate-spec.json",
        }),
      ),
      "utf8",
    );
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("nhm2 regional support-function atlas", () => {
  it("emits canonical regional supports without changing physics claims", () =>
    withTemp((root) => {
      const atlas = buildRegionalSupportFunctionAtlas({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileFullTensorSourcePath: "source.json",
        outPath: "atlas.json",
      });

      expect(isNhm2RegionalSupportFunctionAtlas(atlas)).toBe(true);
      expect(existsSync(join(root, "atlas.json"))).toBe(true);
      expect(atlas.artifactType).toBe("nhm2_regional_support_function_atlas/v1");
      expect(Object.keys(atlas.regions)).toEqual([
        "global",
        "hull",
        "wall",
        "exterior_shell",
        "hull_wall_transition",
        "wall_exterior_transition",
      ]);
      expect(atlas.regions.wall.sampleCount).toBe(24);
      expect(atlas.partitionOfUnity.status).toBe("pass");
      expect(atlas.derivativeSupport.partialMuWAvailable).toBe(false);
      expect(atlas.derivativeSupport.covariantDerivativeSupportAvailable).toBe(false);
      expect(atlas.transitionKernels.every((kernel) => !kernel.derivativeTermsAvailable)).toBe(true);
      expect(atlas.provenance.atlasHash).toMatch(/^[a-f0-9]{64}$/);
      expect(atlas.provenance.targetEchoForbidden).toBe(true);
      expect(atlas.eligibility.atlasEligibleForClosureHarness).toBe(true);
      expect(atlas.claimBoundary.atlasDoesNotFitPhysicsNumbers).toBe(true);
      expect(atlas.claimBoundary.physicalTransportClaimAllowed).toBe(false);
    }));

  it("admits same-run support derivative receipts into the atlas hash and transition kernels", () =>
    withTemp((root) => {
      const atlas = buildRegionalSupportFunctionAtlas({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileFullTensorSourcePath: "source.json",
        supportDerivativeReceiptPath: "support-derivatives.json",
        outPath: "atlas.json",
      });

      expect(isNhm2RegionalSupportFunctionAtlas(atlas)).toBe(true);
      expect(atlas.derivativeSupport.partialMuWAvailable).toBe(true);
      expect(atlas.derivativeSupport.covariantDerivativeSupportAvailable).toBe(true);
      expect(atlas.derivativeSupport.derivativeRef).toBe("derivative.supports.json");
      expect(atlas.transitionKernels.every((kernel) => kernel.derivativeTermsAvailable)).toBe(true);
      expect(atlas.transitionKernels.map((kernel) => kernel.derivativeRef)).toEqual([
        "derivative.hull_wall.json",
        "derivative.wall_exterior.json",
      ]);
      expect(atlas.provenance.generatedFrom).toContain("support-derivatives.json");
      expect(atlas.provenance.inputHashes["support-derivatives.json"]).toMatch(/^[a-f0-9]{64}$/);
    }));

  it("can emit compact-bump transition kernels without pretending derivative terms exist", () =>
    withTemp((root) => {
      const atlas = buildRegionalSupportFunctionAtlas({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileFullTensorSourcePath: "source.json",
        transitionKernelKind: "compact_bump",
        outPath: "atlas.json",
      });

      expect(isNhm2RegionalSupportFunctionAtlas(atlas)).toBe(true);
      expect(atlas.transitionKernels.map((kernel) => kernel.kernelId)).toEqual([
        "kernel:hull_wall:compact_bump",
        "kernel:wall_exterior:compact_bump",
      ]);
      expect(atlas.transitionKernels.every((kernel) => kernel.kernelKind === "compact_bump")).toBe(true);
      expect(atlas.transitionKernels.every((kernel) => kernel.smoothnessClass === "Cinf")).toBe(true);
      expect(atlas.transitionKernels.every((kernel) => !kernel.derivativeTermsAvailable)).toBe(true);
      expect(atlas.derivativeSupport.covariantDerivativeSupportAvailable).toBe(false);
      expect(atlas.claimBoundary.physicalTransportClaimAllowed).toBe(false);
    }));

  it("can build a candidate-specific compact-bump atlas from candidate profile/grid receipts", () =>
    withTemp((root) => {
      const atlas = buildRegionalSupportFunctionAtlas({
        repoRoot: root,
        candidateProfileSpecPath: "candidate-spec.json",
        candidateCampaignGridPath: "candidate-grid.json",
        transitionKernelKind: "compact_bump",
        outPath: "atlas.json",
      });

      expect(isNhm2RegionalSupportFunctionAtlas(atlas)).toBe(true);
      expect(atlas.runIdentity.profileId).toBe(
        "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1",
      );
      expect(atlas.runIdentity.gridRef).toBe("candidate-grid.json");
      expect(atlas.runIdentity.samplePlanRef).toBe("candidate-grid.json");
      expect(atlas.regions.wall.maskRef).toContain(".mask.wall");
      expect(atlas.regions.wall.sampleCount).toBe(24);
      expect(atlas.transitionKernels.map((kernel) => kernel.kernelKind)).toEqual([
        "compact_bump",
        "compact_bump",
      ]);
      expect(atlas.provenance.generatedFrom).toEqual([
        "candidate-spec.json",
        "candidate-grid.json",
      ]);
      expect(atlas.claimBoundary.physicalTransportClaimAllowed).toBe(false);
    }));

  it("rejects derivative receipts from another run identity", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "support-derivatives.mismatch.json"),
        JSON.stringify(supportDerivativeReceipt({ runId: "other-run" })),
        "utf8",
      );

      expect(() =>
        buildRegionalSupportFunctionAtlas({
          repoRoot: root,
          referenceRunPath: "reference.json",
          tileFullTensorSourcePath: "source.json",
          supportDerivativeReceiptPath: "support-derivatives.mismatch.json",
          outPath: "atlas.json",
        }),
      ).toThrow(/run\/profile\/chart identity/);
    }));
});
