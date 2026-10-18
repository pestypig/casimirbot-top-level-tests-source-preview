import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { isNhm2MomentumFrameProjectionEvidence } from "../shared/contracts/nhm2-momentum-frame-projection-receipt.v1";
import type { Nhm2MetricMomentumRemediationTargetsV1 } from "../shared/contracts/nhm2-metric-momentum-remediation-targets.v1";
import {
  buildNhm2RegionalSupportFunctionAtlas,
  type Nhm2RegionalSupportFunctionAtlasV1,
} from "../shared/contracts/nhm2-regional-support-function-atlas.v1";
import type { Nhm2SourceMomentumDensityAuditArtifactV1 } from "../shared/contracts/nhm2-source-momentum-density-audit.v1";
import { publishCandidateMomentumFrameProjectionEvidence } from "../tools/nhm2/build-candidate-momentum-frame-projection-evidence";

const regions = ["global", "hull", "wall", "exterior_shell"] as const;
const components = ["T01", "T02", "T03"] as const;

const writeJson = (path: string, value: unknown): void => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const makeRemediationTargets = (
  ratioFor: (
    regionId: (typeof regions)[number],
    componentId: (typeof components)[number],
  ) => number | null,
): Nhm2MetricMomentumRemediationTargetsV1 =>
  ({
    contractVersion: "nhm2_metric_momentum_remediation_targets/v1",
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "candidate-alpha-0p9000",
    runId: "candidate-alpha-0p9000:momentum-screen",
    metricRequiredMomentumDemandAuditRef: "demand.json",
    projectionEvidenceRef: "search.json",
    ratioPolicy: "candidate_profile_screen_scaled_from_current_metric_momentum_audit",
    components: regions.flatMap((regionId) =>
      components.map((componentId) => {
        const ratio = ratioFor(regionId, componentId);
        const remediationRequired = ratio != null && ratio > 1;
        return {
          regionId,
          componentId,
          projectedMetricRequiredMomentumToEnergyRatio: ratio,
          admissibleMomentumToEnergyRatio: 1,
          requiredSuppressionFactor: ratio == null ? null : remediationRequired ? ratio : 1,
          requiredFractionalReduction:
            ratio == null ? null : remediationRequired ? 1 - 1 / ratio : 0,
          status: ratio == null ? "missing" : remediationRequired ? "remediation_required" : "within_bound",
        };
      }),
    ),
    summary: {
      remediationRequired: regions.some((regionId) =>
        components.some((componentId) => (ratioFor(regionId, componentId) ?? 0) > 1),
      ),
      currentMetricProfileFalsified: regions.some((regionId) =>
        components.some((componentId) => (ratioFor(regionId, componentId) ?? 0) > 1),
      ),
      worstRegionId: null,
      worstComponentId: null,
      worstRequiredSuppressionFactor: null,
      worstRequiredFractionalReduction: null,
      nonResolvableForCurrentProfile: false,
      firstBlocker: null,
      blockerCount: 0,
    },
    allowedRemediationLevers: [
      "reduce_metric_required_projected_t0i",
      "change_metric_profile_geometry",
      "provide_full_adm_tetrad_projection_that_changes_ratio",
      "reject_current_profile_for_campaign",
    ],
    forbiddenRemediationLevers: [
      "copy_metric_required_tensor_into_source",
      "hide_momentum_density_in_global_average",
      "silently_zero_t0i",
      "treat_reduced_order_projection_as_physical_viability",
    ],
    claimBoundary: {
      diagnosticOnly: true,
      remediationTargetsDoNotValidateNewMetric: true,
      currentProfileFailureDoesNotProveUniversalNoGo: true,
      transportClaimAllowed: false,
    },
  }) as Nhm2MetricMomentumRemediationTargetsV1;

const makeSourceAudit = (metricRatio: number | null = null): Nhm2SourceMomentumDensityAuditArtifactV1 =>
  ({
    contractVersion: "nhm2_source_momentum_density_audit/v1",
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "candidate-alpha-0p9000",
    runId: "candidate-alpha-0p9000:source-closure",
    sourceComponentAuthorityLedgerRef: "ledger.json",
    regionalFullTensorResidualRef: "residual.json",
    regionalSupportFunctionAtlasRef: "atlas.json",
    regions: regions.map((regionId) => ({
      regionId,
      status: "pass",
      components: components.map((componentId) => ({
        componentId,
        metricRequired: 0,
        tileEffectiveCounterpart: 1e-12,
        passWindow: null,
        relResidual: 1e-12,
        currentToAllowedMagnitudeRatio: null,
        requiredAmplificationToPass: null,
        sourceFractionOfAbsT00: 1e-10,
        metricRequiredFractionOfAbsT00: metricRatio,
        sourceCausalMomentumBoundStatus: "pass",
        metricRequiredCausalMomentumBoundStatus: metricRatio == null ? "missing" : "pass",
        fractionalAmplificationToRequirement: null,
        correctionStatus: "already_within_tolerance",
        authority: "source_model",
        mechanismStatus: "not_required",
        mechanismEvidenceRef: null,
        provenanceRef: "source.json",
        blockers: [],
      })),
      worstComponentId: null,
      worstRequiredAmplificationToPass: null,
      blockers: [],
    })),
    summary: {
      allMomentumComponentsPresent: true,
      allMomentumWithinTolerance: true,
      anyMomentumMechanismMissing: false,
      worstRegionId: null,
      worstComponentId: null,
      worstRequiredAmplificationToPass: null,
      worstMetricRequiredMomentumToEnergyRatio: metricRatio,
      worstSourceMomentumToEnergyRatio: 1e-10,
      causalMomentumBoundApplicabilityStatus: "blocked",
      causalMomentumBoundFrameRef: "grid",
      causalMomentumBoundRequiresLocalOrthonormalFrame: true,
      causalMomentumBoundApplicabilityBlockers: ["blocked"],
      anyMetricRequiredCausalMomentumBoundViolation: false,
      anySourceCausalMomentumBoundViolation: false,
      uniformFractionalMomentumAnsatzDetected: true,
      sourceFractionByComponent: { T01: 1e-10, T02: 1e-10, T03: 1e-10 },
      worstFractionalAmplificationToRequirement: null,
      firstBlocker: null,
      falsifierCandidate: false,
      currentDeclaredSourceModelFalsified: false,
      causalMaterialMomentumBoundFalsifier: false,
      falsifierScope: "none",
      falsifierReason: null,
      blockerCount: 0,
    },
    claimBoundary: {
      diagnosticOnly: true,
      momentumAuditDoesNotValidatePhysicalSource: true,
      passWindowCannotBeUsedAsSourceModelInput: true,
      missingMomentumMechanismBlocksClosure: true,
      currentModelFalsifierDoesNotProveUniversalSourceImpossibility: true,
    },
  }) as Nhm2SourceMomentumDensityAuditArtifactV1;

const makeAtlas = (): Nhm2RegionalSupportFunctionAtlasV1 =>
  buildNhm2RegionalSupportFunctionAtlas({
    runIdentity: {
      runId: "candidate-alpha-0p9000",
      profileId: "candidate-alpha-0p9000",
      chartId: "comoving_cartesian",
      metricRef: "metric.json",
      sourceModelRef: "source.json",
      gridRef: "grid:chart",
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
    regions: {
      global: {
        regionId: "global",
        semanticRole: "global_region",
        maskRef: "mask://global",
        supportFunctionRef: "support://global",
        sampleCount: 100,
        supportStats: {
          minWeight: 1,
          maxWeight: 1,
          meanWeight: 1,
          nonzeroFraction: 1,
        },
        aggregationPolicy: {
          weighting: "global_weighted",
          normalization: "sum_weights",
          includeTransitionSamples: true,
        },
      },
      hull: {
        regionId: "hull",
        semanticRole: "closure_region",
        maskRef: "mask://hull",
        supportFunctionRef: "support://hull",
        sampleCount: 40,
        supportStats: {
          minWeight: 0,
          maxWeight: 1,
          meanWeight: 0.4,
          nonzeroFraction: 0.4,
        },
        aggregationPolicy: {
          weighting: "support_weighted",
          normalization: "sum_weights",
          includeTransitionSamples: false,
        },
      },
      wall: {
        regionId: "wall",
        semanticRole: "closure_region",
        maskRef: "mask://wall",
        supportFunctionRef: "support://wall",
        sampleCount: 30,
        supportStats: {
          minWeight: 0,
          maxWeight: 1,
          meanWeight: 0.3,
          nonzeroFraction: 0.3,
        },
        aggregationPolicy: {
          weighting: "support_weighted",
          normalization: "sum_weights",
          includeTransitionSamples: false,
        },
      },
      exterior_shell: {
        regionId: "exterior_shell",
        semanticRole: "closure_region",
        maskRef: "mask://exterior",
        supportFunctionRef: "support://exterior",
        sampleCount: 30,
        supportStats: {
          minWeight: 0,
          maxWeight: 1,
          meanWeight: 0.3,
          nonzeroFraction: 0.3,
        },
        aggregationPolicy: {
          weighting: "support_weighted",
          normalization: "sum_weights",
          includeTransitionSamples: false,
        },
      },
      hull_wall_transition: {
        regionId: "hull_wall_transition",
        semanticRole: "transition_region",
        maskRef: "mask://hull-wall-transition",
        supportFunctionRef: "support://hull-wall-transition",
        sampleCount: 10,
        supportStats: {
          minWeight: 0,
          maxWeight: 1,
          meanWeight: 0.1,
          nonzeroFraction: 0.1,
        },
        aggregationPolicy: {
          weighting: "support_weighted",
          normalization: "sum_weights",
          includeTransitionSamples: true,
        },
      },
      wall_exterior_transition: {
        regionId: "wall_exterior_transition",
        semanticRole: "transition_region",
        maskRef: "mask://wall-exterior-transition",
        supportFunctionRef: "support://wall-exterior-transition",
        sampleCount: 10,
        supportStats: {
          minWeight: 0,
          maxWeight: 1,
          meanWeight: 0.1,
          nonzeroFraction: 0.1,
        },
        aggregationPolicy: {
          weighting: "support_weighted",
          normalization: "sum_weights",
          includeTransitionSamples: true,
        },
      },
    },
    transitionKernels: [
      {
        kernelId: "hull-wall",
        fromRegion: "hull",
        toRegion: "wall",
        supportRegion: "hull_wall_transition",
        kernelKind: "declared_reduced_order",
        smoothnessClass: "C1",
        widthMeters: 1,
        derivativeTermsAvailable: false,
      },
      {
        kernelId: "wall-exterior",
        fromRegion: "wall",
        toRegion: "exterior_shell",
        supportRegion: "wall_exterior_transition",
        kernelKind: "declared_reduced_order",
        smoothnessClass: "C1",
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

describe("candidate momentum frame projection evidence publisher", () => {
  it("emits explicit projected ratios for a bounded candidate", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-projection-evidence-"));
    try {
      writeJson(join(dir, "targets.json"), makeRemediationTargets(() => 0.05));
      writeJson(join(dir, "audit.json"), makeSourceAudit());
      writeJson(join(dir, "atlas.json"), makeAtlas());

      const artifact = publishCandidateMomentumFrameProjectionEvidence({
        repoRoot: dir,
        metricMomentumRemediationTargetsPath: "targets.json",
        sourceMomentumDensityAuditPath: "audit.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "projection-evidence.json",
      });
      const written = JSON.parse(readFileSync(join(dir, "projection-evidence.json"), "utf8"));

      expect(artifact.frame.projectionStatus).toBe("pass");
      expect(artifact.frame.ratioPolicy).toBe("explicit_projected_ratios");
      expect(artifact.components).toHaveLength(12);
      expect(artifact.components[0]?.projectedMetricRequiredMomentumToEnergyRatio).toBe(0.05);
      expect(artifact.components[0]?.projectedSourceMomentumToEnergyRatio).toBe(1e-10);
      expect(artifact.claimBoundary.reducedOrderFrameDoesNotReplaceFullAdmTetrad).toBe(true);
      expect(isNhm2MomentumFrameProjectionEvidence(written)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks when the candidate remediation targets still exceed the causal ratio bound", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-projection-evidence-"));
    try {
      writeJson(
        join(dir, "targets.json"),
        makeRemediationTargets((regionId, componentId) =>
          regionId === "hull" && componentId === "T02" ? 1.5 : 0.05,
        ),
      );
      writeJson(join(dir, "audit.json"), makeSourceAudit());
      writeJson(join(dir, "atlas.json"), makeAtlas());

      const artifact = publishCandidateMomentumFrameProjectionEvidence({
        repoRoot: dir,
        metricMomentumRemediationTargetsPath: "targets.json",
        sourceMomentumDensityAuditPath: "audit.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "projection-evidence.json",
      });

      expect(artifact.frame.projectionStatus).toBe("blocked");
      expect(artifact.frame.blockers).toContain("metric_momentum_remediation_still_required");
      expect(artifact.frame.blockers).toContain(
        "hull:T02:projected_metric_momentum_ratio_exceeds_bound",
      );
      expect(isNhm2MomentumFrameProjectionEvidence(artifact)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses same-chart audit ratios as a reduced-order fallback when remediation ratios are missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-projection-evidence-"));
    try {
      writeJson(join(dir, "targets.json"), makeRemediationTargets(() => null));
      writeJson(join(dir, "audit.json"), makeSourceAudit(0));
      writeJson(join(dir, "atlas.json"), makeAtlas());

      const artifact = publishCandidateMomentumFrameProjectionEvidence({
        repoRoot: dir,
        metricMomentumRemediationTargetsPath: "targets.json",
        sourceMomentumDensityAuditPath: "audit.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "projection-evidence.json",
      });

      expect(artifact.frame.projectionStatus).toBe("pass");
      expect(artifact.frame.ratioPolicy).toBe(
        "use_audit_same_chart_ratios_as_local_frame_reduced_order",
      );
      expect(artifact.components[0]?.projectedMetricRequiredMomentumToEnergyRatio).toBe(0);
      expect(artifact.frame.assumptions.join(" ")).toContain("same-chart metric ratio");
      expect(isNhm2MomentumFrameProjectionEvidence(artifact)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
