import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildNhm2DynamicGeometrySamples,
  isNhm2DynamicGeometrySamplesArtifact,
} from "../shared/contracts/nhm2-dynamic-geometry-samples.v1";
import {
  NHM2_REQUIRED_OBSERVER_FAMILY_IDS,
  type Nhm2ObserverRobustEnergyConditionArtifactV1,
} from "../shared/contracts/nhm2-observer-robust-energy-conditions.v1";
import type { Nhm2QeiWorldlineDossierV1 } from "../shared/contracts/nhm2-qei-worldline-dossier.v1";
import { buildNhm2RegionalSupportFunctionAtlas } from "../shared/contracts/nhm2-regional-support-function-atlas.v1";
import {
  buildNhm2EffectiveGeometryReference,
  isNhm2EffectiveGeometryReference,
} from "../shared/contracts/nhm2-effective-geometry-reference.v1";
import {
  buildNhm2AveragedSourceTensorReceipt,
  isNhm2AveragedSourceTensorReceipt,
} from "../shared/contracts/nhm2-averaged-source-tensor-receipt.v1";
import {
  buildNhm2BackreactionResidualReceipt,
  isNhm2BackreactionResidualReceipt,
} from "../shared/contracts/nhm2-backreaction-residual-receipt.v1";
import type { Nhm2CoupledClosurePassCandidateArtifactV1 } from "../shared/contracts/nhm2-coupled-closure-pass-candidate.v1";
import { buildNhm2TileEffectiveFullTensorSourceArtifact } from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import type { Nhm2RegionalFullTensorResidualArtifactV1 } from "../shared/contracts/nhm2-regional-full-tensor-residual.v1";
import type { Nhm2SourceComponentAuthorityLedgerArtifactV1 } from "../shared/contracts/nhm2-source-component-authority-ledger.v1";
import type { Nhm2SourceSideSameBasisTensorAuthorityArtifactV1 } from "../shared/contracts/nhm2-source-side-same-basis-tensor-authority.v1";
import type { Nhm2MetricRequiredMomentumDemandAuditV1 } from "../shared/contracts/nhm2-metric-required-momentum-demand-audit.v1";
import type { Nhm2MomentumFrameProjectionReceiptV1 } from "../shared/contracts/nhm2-momentum-frame-projection-receipt.v1";
import type { Nhm2SourceMomentumDensityAuditArtifactV1 } from "../shared/contracts/nhm2-source-momentum-density-audit.v1";
import type { Nhm2SourceOffDiagonalShearAuditArtifactV1 } from "../shared/contracts/nhm2-source-off-diagonal-shear-audit.v1";
import type { Nhm2CampaignFrontierDispositionV1 } from "../shared/contracts/nhm2-campaign-frontier-disposition.v1";
import {
  buildNhm2DynamicEffectiveGeometryEvidence,
  buildNhm2FrequencyConvergenceEvidence,
  buildNhm2SwitchingConservationEvidence,
  buildNhm2TimeDependentSourceCampaign,
  isNhm2DynamicEffectiveGeometryEvidence,
  isNhm2FrequencyConvergenceEvidence,
  isNhm2SwitchingConservationEvidence,
  isNhm2TimeDependentSourceCampaignArtifact,
  type Nhm2CampaignStabilityEvidenceV1,
  type Nhm2DynamicEffectiveGeometryEvidenceV1,
  type Nhm2FrequencyConvergenceEvidenceV1,
  type Nhm2SwitchingConservationEvidenceV1,
} from "../shared/contracts/nhm2-time-dependent-source-campaign.v1";
import { runNhm2DynamicGeometrySamples } from "../tools/nhm2/build-dynamic-geometry-samples";
import { runNhm2DynamicEffectiveGeometryEvidence } from "../tools/nhm2/build-dynamic-effective-geometry-evidence";
import { runNhm2BackreactionResidualReceipt } from "../tools/nhm2/build-backreaction-residual-receipt";
import { runNhm2CandidateDynamicEffectiveGeometryAgreement } from "../tools/nhm2/build-candidate-dynamic-effective-geometry-agreement";

const encodedR32 = (values: number[]): string => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes.toString("base64");
};

const writeBrick = (
  repoRoot: string,
  path: string,
  channelValues: Record<string, number[]>,
) => {
  const firstChannel = Object.values(channelValues)[0] ?? [0];
  writeFileSync(
    join(repoRoot, path),
    `${JSON.stringify({
      kind: "gr-evolve-brick",
      dims: [firstChannel.length, 1, 1],
      format: "r32f",
      channelOrder: Object.keys(channelValues),
      channels: Object.fromEntries(
        Object.entries(channelValues).map(([channelId, values]) => [
          channelId,
          { data: encodedR32(values), min: Math.min(...values), max: Math.max(...values) },
        ]),
      ),
    })}\n`,
    "utf8",
  );
};

const atlasFixture = () => {
  const region = (
    regionId:
      | "global"
      | "hull"
      | "wall"
      | "exterior_shell"
      | "hull_wall_transition"
      | "wall_exterior_transition",
    semanticRole: "closure_region" | "transition_region" | "global_region",
  ) => ({
    regionId,
    semanticRole,
    maskRef: `mask:${regionId}`,
    supportFunctionRef: `support:${regionId}`,
    sampleCount: 1,
    supportStats: {
      minWeight: 0,
      maxWeight: 1,
      meanWeight: regionId === "global" ? 1 : 0.5,
      nonzeroFraction: 1,
    },
    aggregationPolicy: {
      weighting: regionId === "global" ? "global_weighted" as const : "support_weighted" as const,
      normalization: "sum_weights" as const,
      includeTransitionSamples: semanticRole === "transition_region",
    },
  });
  return buildNhm2RegionalSupportFunctionAtlas({
    runIdentity: {
      runId: "campaign-test",
      profileId: "stage1_centerline_alpha_0p995_v1",
      chartId: "comoving_cartesian",
      metricRef: "metric.json",
      gridRef: "grid.json",
      samplePlanRef: "grid.json",
      createdAt: "2026-06-18T00:00:00.000Z",
    },
    basisAndUnits: {
      tensorBasis: "chart",
      coordinateSystem: "comoving_cartesian",
      lengthUnit: "m",
      energyDensityUnit: "J/m^3",
      stressEnergyConvention: "Tmunu",
      signatureConvention: "-+++",
    },
    regions: {
      global: region("global", "global_region"),
      hull: region("hull", "closure_region"),
      wall: region("wall", "closure_region"),
      exterior_shell: region("exterior_shell", "closure_region"),
      hull_wall_transition: region("hull_wall_transition", "transition_region"),
      wall_exterior_transition: region("wall_exterior_transition", "transition_region"),
    },
    transitionKernels: [
      {
        kernelId: "kernel:hull_wall",
        fromRegion: "hull",
        toRegion: "wall",
        supportRegion: "hull_wall_transition",
        kernelKind: "smootherstep_c2",
        smoothnessClass: "C2",
        widthMeters: 1,
        derivativeTermsAvailable: true,
        derivativeRef: "derivatives:hull_wall",
      },
      {
        kernelId: "kernel:wall_exterior",
        fromRegion: "wall",
        toRegion: "exterior_shell",
        supportRegion: "wall_exterior_transition",
        kernelKind: "smootherstep_c2",
        smoothnessClass: "C2",
        widthMeters: 1,
        derivativeTermsAvailable: true,
        derivativeRef: "derivatives:wall_exterior",
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
      partialMuWAvailable: true,
      covariantDerivativeSupportAvailable: true,
      derivativeBasis: "chart",
      derivativeRef: "derivatives:atlas",
      transitionDerivativeTermsRequired: true,
    },
    provenance: {
      generatedFrom: ["test-fixture"],
      inputHashes: { grid: "grid-hash" },
      atlasHash: "atlas-hash",
      targetEchoForbidden: true,
      targetDerivedFieldsUsed: false,
    },
  });
};

const fullSourceTensor = {
  T00: -1,
  T01: 0,
  T02: 0,
  T03: 0,
  T10: 0,
  T11: 1,
  T12: 0,
  T13: 0,
  T20: 0,
  T21: 0,
  T22: 1,
  T23: 0,
  T30: 0,
  T31: 0,
  T32: 0,
  T33: 1,
};

const sourceRegion = (regionId: "global" | "hull" | "wall" | "exterior_shell") => ({
  regionId,
  status: "review" as const,
  tensorAuthorityMode: "full_tensor" as const,
  tensor: fullSourceTensor,
  symmetry: { declared: false, kind: "none" as const, lowerComponentsDerivedBySymmetry: false },
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `mask:${regionId}`,
  aggregationMode: "mean" as const,
  normalizationBasis: "sample_count" as const,
  sampleCount: 1,
  sourceSupport: {
    supportKernelId: `support:${regionId}`,
    cycleAverageStatus: "pass" as const,
    dutyCycleStatus: "pass" as const,
    lightCrossingConsistencyStatus: "review" as const,
  },
  provenance: {
    producerModule: "source-test",
    producerFunction: "emit",
    derivationMode: "source_model_direct_full_tensor" as const,
    inputRefs: [`source:${regionId}`],
    preAggregationValueRefs: [`pre:${regionId}`],
    notDerivedFromMetricRequiredTensor: true,
  },
  blockers: ["qei_dossier_not_pass", "conservation_unknown"],
});

const averagedSourceTensor = () =>
  buildNhm2TileEffectiveFullTensorSourceArtifact({
    generatedAt: "2026-06-18T00:00:00.000Z",
    runId: "campaign-test",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    expectedProfileId: "stage1_centerline_alpha_0p995_v1",
    laneId: "nhm2_shift_lapse",
    sourceModel: {
      sourceModelId: "source-test",
      sourceModelVersion: "v1",
      sourceModelClass: "cycle_averaged_tile_model",
      sourceSideOnly: true,
      notDerivedFromMetricRequiredTensor: true,
      metricRequiredInputRefs: [],
      sourceInputRefs: ["source-input.json"],
      qeiDossierRef: null,
      conservationRef: null,
    },
    regions: [
      sourceRegion("global"),
      sourceRegion("hull"),
      sourceRegion("wall"),
      sourceRegion("exterior_shell"),
    ],
    literatureRefs: ["fewster_thompson_2023_stationary_worldline_qei"],
  });

const completeLedger = (
  summary?: Partial<Nhm2SourceComponentAuthorityLedgerArtifactV1["summary"]>,
): Nhm2SourceComponentAuthorityLedgerArtifactV1 =>
  ({
    contractVersion: "nhm2_source_component_authority_ledger/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    counterpartArtifactRef: "counterpart.json",
    sourceTensorArtifactRef: "source.json",
    regions: [],
    summary: {
      allRequiredRegionsPresent: true,
      allRequiredComponentsPresent: true,
      allRequiredComponentsAuthoritative: true,
      allRequiredComponentsAdmissible: true,
      sourceSideComponentAuthorityComplete: true,
      hasWallFullTensorAuthority: true,
      anyMetricEcho: false,
      anyScalarProxy: false,
      anyMissing: false,
      anyReducedOrder: false,
      missingComponentRefs: [],
      proxyComponentRefs: [],
      metricEchoComponentRefs: [],
      reducedOrderComponentRefs: [],
      firstBlocker: null,
      blockerCount: 0,
      ...summary,
    },
    claimBoundary: {
      diagnosticOnly: true,
      componentAuthorityDoesNotValidateMaterialSource: true,
      metricEchoForbidden: true,
      scalarProxyCannotProvideFullTensorAuthority: true,
      missingComponentsCannotBeZeroFilled: true,
    },
  }) as Nhm2SourceComponentAuthorityLedgerArtifactV1;

const sourceAuthorityRegion = (
  regionId: string,
  blockers: string[] = [],
): Nhm2SourceSideSameBasisTensorAuthorityArtifactV1["regions"][number] => ({
  regionId,
  status: blockers.length === 0 ? "authoritative_same_basis" : "blocked",
  sourceTensorRef: `full-apparatus-tensor-values.json#regions/${regionId}`,
  expectedMetricCounterpartRole: "tile_effective_counterpart",
  comparisonRole: "full_apparatus_material_source_tensor",
  chartId: "comoving_cartesian",
  basisRef: "atlas.json#basisAndUnits",
  units: "J/m^3",
  regionMaskRef: `atlas.json#regions/${regionId}`,
  aggregationMode: "support_weighted",
  normalizationBasis: "sum_weights",
  tensorAuthorityMode: "source_side_full_apparatus_tensor",
  derivationMode: "full_apparatus_tensor_values",
  notDerivedFromMetricRequiredTensor: true,
  hasFullTensorComponents: blockers.length === 0,
  missingComponentIds: [],
  materialReceiptRef: "material-receipts.json",
  materialReceiptStatus: "material_receipted",
  blockers,
  warnings: [],
});

const sourceAuthority = (
  summary?: Partial<Nhm2SourceSideSameBasisTensorAuthorityArtifactV1["summary"]>,
  regionBlockers: Record<string, string[]> = {},
): Nhm2SourceSideSameBasisTensorAuthorityArtifactV1 => {
  const regions = ["global", "hull", "wall", "exterior_shell"].map((regionId) =>
    sourceAuthorityRegion(regionId, regionBlockers[regionId] ?? []),
  );
  const anyBlocked = regions.some((region) => region.blockers.length > 0);
  return {
    contractVersion: "nhm2_source_side_same_basis_tensor_authority/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    chartId: "comoving_cartesian",
    sourceModelId: "full_apparatus_material_source_tensor",
    sourceTensorArtifactRef: "full-apparatus-tensor-values.json",
    counterpartArtifactRef: "counterpart.json",
    tileSourceAuthorityHandoffRef: "tile-source-handoff.json",
    tileSourceAuthorityHandoffStatus: "ready",
    regions,
    summary: {
      hasWallAuthority: !anyBlocked,
      allRequiredRegionsAuthoritative: !anyBlocked,
      tileSourceHandoffReady: true,
      anyMetricEcho: false,
      anyProxy: false,
      anyMissingCounterpart: false,
      missingRegionIds: [],
      tileSourceHandoffRequiredCorrections: {},
      blockerCount: regions.reduce((sum, region) => sum + region.blockers.length, 0),
      ...summary,
    },
    claimBoundary: {
      diagnosticOnly: true,
      doesNotValidatePhysicalSource: true,
      metricEchoForbidden: true,
      wallT00ClosureRequiresWallAuthority: true,
    },
  };
};

const coupledClosureWithTileSourceCorrections = (): Nhm2CoupledClosurePassCandidateArtifactV1 =>
  ({
    contractVersion: "nhm2_coupled_closure_pass_candidate/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    artifactRefs: {
      regionalSupportFunctionAtlas: null,
      regionalMaterialSourceTensorModel: null,
      tileLocalSourceElements: null,
      tileEffectiveCounterpart: null,
      tileSourceAuthorityHandoff: "tile-source-handoff.json",
      sourceComponentAuthorityLedger: null,
      sourceSideSameBasisTensorAuthority: null,
      regionalSourceClosureEvidence: null,
      sourceClosurePassReadiness: null,
      conservation: null,
      qeiWorldlineDossier: null,
      observerRobustEnergyConditions: null,
      casimirMaterialReceipt: null,
    },
    gates: [
      {
        gateId: "tile_source_authority_handoff",
        status: "blocked",
        pass: false,
        blockers: ["tile_source_authority_handoff_status_blocked"],
        warnings: ["tile_source_handoff_does_not_run_downstream_gates"],
        primaryMetric: "handoffStatus=blocked",
        requiredCorrections: {
          effectiveSourceTensorLayerCountShortfall: 88.506,
          activeAreaRetentionShortfall: 0.1,
          missingFatigueProvenanceRefCount: 4,
        },
      },
    ],
    summary: {
      passCandidate: false,
      sourceClosurePassSignalAllowed: false,
      tileSourceHandoffReady: false,
      tileSourceHandoffStatus: "blocked",
      allRequiredRegionsAuthoritative: true,
      sourceComponentAuthorityComplete: true,
      wallAuthorityPresent: true,
      wallClosureReady: true,
      regionalResidualsPass: true,
      conservationPass: true,
      qeiDossierPass: true,
      observerRobustPass: true,
      materialReceipted: true,
      atlasConsumerCongruencePass: true,
      firstBlocker: "tile_source_authority_handoff_status_blocked",
      firstRequiredCorrections: {
        effectiveSourceTensorLayerCountShortfall: 88.506,
        activeAreaRetentionShortfall: 0.1,
        missingFatigueProvenanceRefCount: 4,
      },
      blockerCount: 1,
    },
    claimBoundary: {
      diagnosticOnly: true,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      doesNotRecomputePhysics: true,
      requiresSameRunSameChartEvidence: true,
    },
  }) as Nhm2CoupledClosurePassCandidateArtifactV1;

const momentumAudit = (): Nhm2SourceMomentumDensityAuditArtifactV1 =>
  ({
    contractVersion: "nhm2_source_momentum_density_audit/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    sourceComponentAuthorityLedgerRef: "ledger.json",
    regionalFullTensorResidualRef: "residual.json",
    regionalSupportFunctionAtlasRef: "atlas.json",
    regions: [],
    summary: {
      allMomentumComponentsPresent: true,
      allMomentumWithinTolerance: false,
      anyMomentumMechanismMissing: true,
      worstRegionId: "hull",
      worstComponentId: "T02",
      worstRequiredAmplificationToPass: 2.2e21,
      worstMetricRequiredMomentumToEnergyRatio: 2e15,
      worstSourceMomentumToEnergyRatio: 0.000001,
      causalMomentumBoundApplicabilityStatus: "blocked",
      causalMomentumBoundFrameRef: "grid:chart",
      causalMomentumBoundRequiresLocalOrthonormalFrame: true,
      causalMomentumBoundApplicabilityBlockers: [
        "causal_momentum_bound_requires_local_orthonormal_frame:atlas_tensor_basis=chart",
      ],
      anyMetricRequiredCausalMomentumBoundViolation: true,
      anySourceCausalMomentumBoundViolation: false,
      uniformFractionalMomentumAnsatzDetected: true,
      sourceFractionByComponent: {
        T01: 0.000001,
        T02: 0.0000005,
        T03: 0.0000002,
      },
      worstFractionalAmplificationToRequirement: 2e21,
      firstBlocker: "hull:T01:momentum_component_residual_exceeded",
      falsifierCandidate: true,
      currentDeclaredSourceModelFalsified: true,
      causalMaterialMomentumBoundFalsifier: false,
      falsifierScope: "current_declared_source_model",
      falsifierReason:
        "declared_uniform_fractional_momentum_density_without_mechanism_exceeds_required_amplification",
      blockerCount: 12,
    },
    claimBoundary: {
      diagnosticOnly: true,
      momentumAuditDoesNotValidatePhysicalSource: true,
      passWindowCannotBeUsedAsSourceModelInput: true,
      missingMomentumMechanismBlocksClosure: true,
      currentModelFalsifierDoesNotProveUniversalSourceImpossibility: true,
    },
  }) as Nhm2SourceMomentumDensityAuditArtifactV1;

const blockedMomentumFrameProjectionReceipt = (): Nhm2MomentumFrameProjectionReceiptV1 =>
  ({
    contractVersion: "nhm2_momentum_frame_projection_receipt/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    sourceMomentumDensityAuditRef: "momentum-audit.json",
    regionalSupportFunctionAtlasRef: "atlas.json",
    atlasHash: "atlas-hash",
    momentumFrameProjectionEvidenceRef: null,
    frame: {
      requestedFrame: "local_orthonormal",
      sourceTensorBasis: "chart",
      tetradRef: null,
      projectionMethod: "missing_tetrad",
      ratioPolicy: null,
      projectionStatus: "blocked",
      assumptions: [],
      blockers: ["local_orthonormal_tetrad_or_projection_receipt_missing"],
    },
    regions: [],
    summary: {
      projectionAvailable: false,
      causalBoundApplicabilityStatus: "blocked",
      worstProjectedMetricRequiredMomentumToEnergyRatio: null,
      worstProjectedSourceMomentumToEnergyRatio: null,
      anyProjectedMetricRequiredCausalMomentumBoundViolation: null,
      anyProjectedSourceCausalMomentumBoundViolation: null,
      firstBlocker: "local_orthonormal_tetrad_or_projection_receipt_missing",
      blockerCount: 1,
    },
    claimBoundary: {
      diagnosticOnly: true,
      frameProjectionDoesNotValidatePhysicalSource: true,
      chartBasisRatioCannotProveCausalBound: true,
      localFrameReceiptRequiredForCausalMaterialBound: true,
    },
  }) as Nhm2MomentumFrameProjectionReceiptV1;

const metricMomentumDemandAudit = (): Nhm2MetricRequiredMomentumDemandAuditV1 =>
  ({
    contractVersion: "nhm2_metric_required_momentum_demand_audit/v1",
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    momentumFrameProjectionReceiptRef: "projection-receipt.json",
    projectionEvidenceRef: "projection-evidence.json",
    projectionApplicabilityStatus: "applicable",
    ratioPolicy: "use_audit_same_chart_ratios_as_local_frame_reduced_order",
    components: [],
    summary: {
      allProjectedRatiosAvailable: true,
      anyProjectedMetricRequiredCausalMomentumBoundViolation: true,
      worstRegionId: "hull",
      worstComponentId: "T02",
      worstProjectedMetricRequiredMomentumToEnergyRatio: 2,
      worstExceedanceFactor: 2,
      currentMetricProfileFalsified: true,
      falsifierScope: "current_metric_profile_under_declared_projection",
      firstBlocker: "hull:T02:metric_required_momentum_density_causal_bound_exceeded",
      blockerCount: 1,
    },
    claimBoundary: {
      diagnosticOnly: true,
      metricDemandAuditDoesNotValidatePhysicalSource: true,
      reducedOrderProjectionDoesNotReplaceFullAdmTetrad: true,
      currentProfileFalsifierDoesNotProveUniversalMetricImpossibility: true,
      transportClaimAllowed: false,
    },
  }) as Nhm2MetricRequiredMomentumDemandAuditV1;

const campaignFrontierDisposition = (): Nhm2CampaignFrontierDispositionV1 =>
  ({
    contractVersion: "nhm2_campaign_frontier_disposition/v1",
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    chartId: "comoving_cartesian",
    campaignRef: "campaign.json",
    metricMomentumRemediationTargetsRef: "remediation-targets.json",
    frontier: {
      gateId: "full_regional_tensor_closure",
      campaignFirstBlocker: "global:T02:metric_momentum_suppression_required",
      blockerClass: "metric_required_momentum_density",
      currentProfileNonResolvable: true,
    },
    disposition: {
      status: "current_profile_rejected",
      reason:
        "current_profile_rejected_under_declared_reduced_order_projected_momentum_demand",
      allowedNextActions: [
        "reduce_metric_required_projected_t0i",
        "change_metric_profile_geometry",
        "provide_full_adm_tetrad_projection_that_changes_ratio",
        "reject_current_profile_for_campaign",
      ],
      forbiddenNextActions: [
        "copy_metric_required_tensor_into_source",
        "hide_momentum_density_in_global_average",
        "silently_zero_t0i",
        "treat_reduced_order_projection_as_physical_viability",
      ],
    },
    quantitativeSummary: {
      worstRegionId: "hull",
      worstComponentId: "T02",
      worstRequiredSuppressionFactor: 10,
      worstRequiredFractionalReduction: 0.9,
      blockerCount: 1,
    },
    claimBoundary: {
      diagnosticOnly: true,
      frontierDispositionDoesNotValidateNewMetric: true,
      currentProfileRejectionDoesNotProveUniversalNoGo: true,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
    },
  }) as Nhm2CampaignFrontierDispositionV1;

const fullTensorResidual = (
  summary?: Partial<Nhm2RegionalFullTensorResidualArtifactV1["summary"]>,
  missingTileComponentIds: string[] = [],
): Nhm2RegionalFullTensorResidualArtifactV1 =>
  ({
    contractVersion: "nhm2_regional_full_tensor_residual/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    regionalSourceClosureEvidenceRef: "closure.json",
    requiredComponents: ["T00", "T01", "T02", "T03", "T11", "T12", "T13", "T22", "T23", "T33"],
    requiredRegions: ["global", "hull", "wall", "exterior_shell"],
    regions: [
      {
        regionId: "wall",
        status: missingTileComponentIds.length > 0 ? "missing" : "pass",
        metricTensorRef: "metric#wall",
        tileTensorRef: "source#wall",
        metricTensorAuthorityMode: "full_tensor",
        tileTensorAuthorityMode: "full_tensor",
        missingMetricComponentIds: [],
        missingTileComponentIds,
        componentResiduals: [],
        familyResiduals: [
          {
            family: "t00",
            status: missingTileComponentIds.length > 0 ? "missing" : "pass",
            worstComponentId: "T00",
            worstRelResidual: 0.05,
            maxCurrentToAllowedMagnitudeRatio: 1,
            failingComponentIds: [],
            missingComponentIds: [],
          },
          {
            family: "momentum_t0i",
            status: "pass",
            worstComponentId: null,
            worstRelResidual: null,
            maxCurrentToAllowedMagnitudeRatio: null,
            failingComponentIds: [],
            missingComponentIds: [],
          },
          {
            family: "diagonal_tij",
            status: "pass",
            worstComponentId: null,
            worstRelResidual: null,
            maxCurrentToAllowedMagnitudeRatio: null,
            failingComponentIds: [],
            missingComponentIds: [],
          },
          {
            family: "off_diagonal_tij",
            status: missingTileComponentIds.length > 0 ? "missing" : "pass",
            worstComponentId: missingTileComponentIds.includes("T12") ? "T12" : null,
            worstRelResidual: missingTileComponentIds.includes("T12") ? null : 0,
            maxCurrentToAllowedMagnitudeRatio: missingTileComponentIds.includes("T12") ? 5 : null,
            failingComponentIds: [],
            missingComponentIds: missingTileComponentIds.filter((component) =>
              ["T12", "T13", "T23"].includes(component),
            ) as Array<"T12" | "T13" | "T23">,
          },
        ],
        t00RelResidual: 0.05,
        fullRelLInf: missingTileComponentIds.length > 0 ? null : 0.05,
        fullAbsLInf: missingTileComponentIds.length > 0 ? null : 0.05,
        toleranceRelLInf: 0.1,
        worstComponentId: "T00",
        worstComponentRelResidual: 0.05,
        blockers: missingTileComponentIds.map((component) => `${component}:tile_component_missing`),
      },
    ],
    summary: {
      allRequiredRegionsPresent: true,
      allRequiredComponentsPresent: missingTileComponentIds.length === 0,
      t00ResidualsPass: true,
      fullTensorResidualsPass: missingTileComponentIds.length === 0,
      anyAtlasMismatch: false,
      worstRegionId: "wall",
      worstComponentId: "T00",
      worstResidualFamily: "t00",
      worstRelResidual: 0.05,
      firstBlocker:
        missingTileComponentIds.length === 0
          ? null
          : `${missingTileComponentIds[0]}:tile_component_missing`,
      firstBlockerFamily: null,
      blockerCount: missingTileComponentIds.length,
      ...summary,
    },
    claimBoundary: {
      diagnosticOnly: true,
      fullTensorResidualDoesNotValidatePhysicalSource: true,
      missingComponentsCannotBeZeroFilled: true,
      globalResidualCannotMaskRegionalFailure: true,
    },
  }) as Nhm2RegionalFullTensorResidualArtifactV1;

const qeiDossier = (): Nhm2QeiWorldlineDossierV1 =>
  ({
    contractVersion: "nhm2_qei_worldline_dossier/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    worldlines: [{ worldlineId: "wall-1", blockers: [] }],
    summary: {
      hasWallWorldline: true,
      allMarginsPass: true,
      anyProxy: false,
      dossierComplete: true,
    },
    literatureRefs: ["ford_roman_1996_quantum_inequality"],
    claimBoundary: {
      diagnosticOnly: true,
      scalarMarginCannotSubstituteForDossier: true,
    },
  }) as Nhm2QeiWorldlineDossierV1;

const shearAudit = (): Nhm2SourceOffDiagonalShearAuditArtifactV1 =>
  ({
    contractVersion: "nhm2_source_off_diagonal_shear_audit/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "campaign-test",
    sourceComponentAuthorityLedgerRef: "authority.json",
    regionalFullTensorResidualRef: "residual.json",
    regions: [],
    summary: {
      allOffDiagonalComponentsPresent: true,
      allOffDiagonalWithinTolerance: false,
      anyShearMechanismMissing: true,
      worstRegionId: "hull",
      worstComponentId: "T13",
      worstCurrentToAllowedMagnitudeRatio: 1.49e15,
      uniformFractionalShearAnsatzDetected: true,
      sourceFractionByComponent: {
        T12: 0.001,
        T13: 0.0005,
        T23: 0.0003,
      },
      worstFractionalSuppressionToRequirement: 5.83e15,
      firstBlocker: "hull:T13:off_diagonal_component_residual_exceeded",
      falsifierCandidate: true,
      currentDeclaredSourceModelFalsified: true,
      falsifierScope: "current_declared_source_model",
      falsifierReason:
        "declared_uniform_fractional_off_diagonal_shear_without_mechanism_exceeds_required_suppression",
      blockerCount: 24,
    },
    claimBoundary: {
      diagnosticOnly: true,
      shearAuditDoesNotValidatePhysicalSource: true,
      passWindowCannotBeUsedAsSourceModelInput: true,
      missingShearMechanismBlocksClosure: true,
      currentModelFalsifierDoesNotProveUniversalSourceImpossibility: true,
    },
  }) as Nhm2SourceOffDiagonalShearAuditArtifactV1;

const observerArtifact = (): Nhm2ObserverRobustEnergyConditionArtifactV1 =>
  ({
    contractVersion: "nhm2_observer_robust_energy_conditions/v1",
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    tensorRef: "source.json",
    observerFamilies: [
      { familyId: "eulerian", status: "pass", blockers: [] },
      { familyId: "boosted_timelike_grid", status: "pass", blockers: [] },
      { familyId: "null_direction_grid", status: "pass", blockers: [] },
      { familyId: "algebraic_type_i", status: "pass", blockers: [] },
      {
        familyId: "continuous_optimizer",
        status: "not_run",
        optimizerUsed: false,
        blockers: ["continuous_optimizer_not_implemented"],
      },
    ],
    summary: {
      eulerianOnly: false,
      robustCheckComplete: true,
      anyViolation: false,
      missedViolationRisk: "medium",
    },
    literatureRefs: [
      "le_2026_observer_robust_warp_energy_conditions",
      "santiago_schuster_visser_2021_generic_warp_nec",
    ],
    claimBoundary: {
      diagnosticOnly: true,
      friendlyObserverCannotProveWec: true,
    },
  }) as Nhm2ObserverRobustEnergyConditionArtifactV1;

const frequencyEvidence = (): Nhm2FrequencyConvergenceEvidenceV1 => ({
  contractVersion: "nhm2_frequency_convergence_evidence/v1",
  generatedAt: "2026-06-18T00:00:00.000Z",
  baseFrequencyHz: 1,
  toleranceLInf: 0.1,
  fixedCycleAverageSource: true,
  multipliers: [1, 2, 4, 8],
  entries: [1, 2, 4, 8].map((multiplier) => ({
    multiplier,
    frequencyHz: multiplier,
    residualLInf: 0.01 / multiplier,
    residualL2: 0.005 / multiplier,
    pass: true,
    blockers: [],
  })),
  convergenceStatus: "pass",
  blockers: [],
});

const switchingEvidence = (): Nhm2SwitchingConservationEvidenceV1 => ({
  contractVersion: "nhm2_switching_covariant_conservation_evidence/v1",
  generatedAt: "2026-06-18T00:00:00.000Z",
  staticCovariantConservationRef: "static-conservation.json",
  scheduleRef: "schedule.json",
  sectorBoundaryRef: "sector-boundary.json",
  switchingFunctionRef: "switching.json",
  includesRegionalSupportDerivatives: true,
  includesSectorBoundaryTerms: true,
  includesTimeDerivativeTerms: true,
  includesTransitionKernelTerms: true,
  toleranceLInf: 0.1,
  overallResidualLInf: 0.04,
  terms: [
    {
      termId: "regional_support_derivative",
      included: true,
      residualLInf: 0.01,
      toleranceLInf: 0.1,
      pass: true,
      blockers: [],
    },
    {
      termId: "sector_boundary",
      included: true,
      residualLInf: 0.02,
      toleranceLInf: 0.1,
      pass: true,
      blockers: [],
    },
    {
      termId: "time_derivative",
      included: true,
      residualLInf: 0.03,
      toleranceLInf: 0.1,
      pass: true,
      blockers: [],
    },
    {
      termId: "transition_kernel",
      included: true,
      residualLInf: 0.04,
      toleranceLInf: 0.1,
      pass: true,
      blockers: [],
    },
  ],
  conservationStatus: "pass",
  blockers: [],
});

const dynamicGeometryEvidence = (): Nhm2DynamicEffectiveGeometryEvidenceV1 => ({
  contractVersion: "nhm2_dynamic_effective_geometry_evidence/v1",
  generatedAt: "2026-06-18T00:00:00.000Z",
  dynamicGeometryRef: "dynamic-geometry.json",
  effectiveGeometryRef: "effective-geometry.json",
  averagingWindowSeconds: 1,
  cycleAverageSourceFixed: true,
  averagedSourceTensorRef: "averaged-source.json",
  residualLInf: 0.01,
  residualL2: 0.005,
  bounded: true,
  agreementStatus: "pass",
  blockers: [],
});

const stabilityEvidence = (): Nhm2CampaignStabilityEvidenceV1 => ({
  contractVersion: "nhm2_campaign_stability_evidence/v1",
  generatedAt: "2026-06-18T00:00:00.000Z",
  horizonStatus: "pass",
  blueshiftStatus: "pass",
  particleAccumulationStatus: "pass",
  perturbativeStabilityStatus: "pass",
  blockers: [],
});

describe("NHM2 time-dependent source campaign", () => {
  it("carries tile-source material evidence refs without making a campaign pass", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      artifactRefs: {
        tileSourceMaterialEvidenceReceipts:
          "runs/candidate/nhm2-tile-source-material-evidence-receipts.json",
        tileSourcePhysicalValidationPlan:
          "runs/candidate/nhm2-tile-source-physical-validation-plan.json",
        tileSourceEvidenceGapRoadmap:
          "runs/candidate/nhm2-tile-source-evidence-gap-roadmap.json",
        tileSourceFalsificationReport:
          "runs/candidate/nhm2-tile-source-falsification-report.json",
        tileSourceAuthorityHandoff:
          "runs/candidate/nhm2-tile-source-authority-handoff.json",
        tileSourceOperatingBudgetReadiness:
          "runs/candidate/nhm2-tile-source-operating-budget-readiness.json",
        layerStackMechanicalReceipt:
          "runs/candidate/nhm2-layer-stack-mechanical-receipt.json",
        layerStackSupportFractionSweep:
          "runs/candidate/nhm2-layer-stack-support-fraction-sweep.json",
        layerStackEngineeringArchitectureLoop:
          "runs/candidate/nhm2-layer-stack-engineering-architecture-loop.json",
        layerStackFullApparatusReceiptLoop:
          "runs/candidate/nhm2-layer-stack-full-apparatus-receipt-loop.json",
      },
    });

    expect(artifact.artifactRefs.tileSourceMaterialEvidenceReceipts).toBe(
      "runs/candidate/nhm2-tile-source-material-evidence-receipts.json",
    );
    expect(artifact.artifactRefs.tileSourceAuthorityHandoff).toBe(
      "runs/candidate/nhm2-tile-source-authority-handoff.json",
    );
    expect(artifact.artifactRefs.layerStackMechanicalReceipt).toBe(
      "runs/candidate/nhm2-layer-stack-mechanical-receipt.json",
    );
    expect(artifact.artifactRefs.layerStackSupportFractionSweep).toBe(
      "runs/candidate/nhm2-layer-stack-support-fraction-sweep.json",
    );
    expect(artifact.artifactRefs.layerStackEngineeringArchitectureLoop).toBe(
      "runs/candidate/nhm2-layer-stack-engineering-architecture-loop.json",
    );
    expect(artifact.artifactRefs.layerStackFullApparatusReceiptLoop).toBe(
      "runs/candidate/nhm2-layer-stack-full-apparatus-receipt-loop.json",
    );
    expect(artifact.summary.campaignPass).toBe(false);
    expect(artifact.claimBoundary.physicalViabilityClaimAllowed).toBe(false);
    expect(artifact.claimBoundary.transportClaimAllowed).toBe(false);
    expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
  });

  it("builds switching conservation evidence that fails closed without dynamic terms", () => {
    const evidence = buildNhm2SwitchingConservationEvidence({
      staticCovariantConservationRef: "static-conservation.json",
      scheduleRef: "schedule.json",
      sectorBoundaryRef: "sector-boundary.json",
      switchingFunctionRef: "switching.json",
      terms: {
        regional_support_derivative: 0.01,
      },
    });

    expect(isNhm2SwitchingConservationEvidence(evidence)).toBe(true);
    expect(evidence.conservationStatus).toBe("fail");
    expect(evidence.blockers).toEqual(
      expect.arrayContaining([
        "sector_boundary:sector_boundary_term_missing",
        "time_derivative:time_derivative_term_missing",
        "transition_kernel:transition_kernel_term_missing",
      ]),
    );
  });

  it("builds frequency convergence evidence that fails closed for a single frequency", () => {
    const evidence = buildNhm2FrequencyConvergenceEvidence({
      baseFrequencyHz: 1,
      fixedCycleAverageSource: true,
      entries: [{ multiplier: 1, frequencyHz: 1, residualLInf: 0.01, residualL2: 0.005 }],
    });

    expect(isNhm2FrequencyConvergenceEvidence(evidence)).toBe(true);
    expect(evidence.convergenceStatus).toBe("fail");
    expect(evidence.blockers).toEqual(
      expect.arrayContaining([
        "frequency_multiplier_missing:2",
        "frequency_multiplier_missing:4",
        "frequency_ladder_too_short",
      ]),
    );
  });

  it("builds frequency convergence evidence that fails when cycle-average source is not fixed", () => {
    const evidence = buildNhm2FrequencyConvergenceEvidence({
      baseFrequencyHz: 1,
      fixedCycleAverageSource: false,
      entries: [1, 2, 4].map((multiplier) => ({
        multiplier,
        frequencyHz: multiplier,
        residualLInf: 0.01,
        residualL2: 0.005,
      })),
    });

    expect(evidence.convergenceStatus).toBe("fail");
    expect(evidence.blockers).toContain("cycle_average_source_not_fixed");
  });

  it("builds dynamic/effective geometry evidence that fails closed without dynamic refs", () => {
    const evidence = buildNhm2DynamicEffectiveGeometryEvidence({
      cycleAverageSourceFixed: true,
      residualLInf: 0.01,
      bounded: true,
    });

    expect(isNhm2DynamicEffectiveGeometryEvidence(evidence)).toBe(true);
    expect(evidence.agreementStatus).toBe("fail");
    expect(evidence.blockers).toEqual(
      expect.arrayContaining([
        "dynamic_geometry_ref_missing",
        "effective_geometry_ref_missing",
        "averaging_window_seconds_missing",
        "averaged_source_tensor_ref_missing",
      ]),
    );
  });

  it("builds dynamic/effective geometry evidence that names residual and backreaction blockers", () => {
    const evidence = buildNhm2DynamicEffectiveGeometryEvidence({
      dynamicGeometryRef: "dynamic-geometry.json",
      effectiveGeometryRef: "effective-geometry.json",
      averagingWindowSeconds: 1,
      cycleAverageSourceFixed: true,
      averagedSourceTensorRef: "averaged-source.json",
      residualLInf: 0.12,
      residualL2: 0.04,
      toleranceLInf: 0.1,
      bounded: false,
    });

    expect(evidence.agreementStatus).toBe("fail");
    expect(evidence.blockers).toEqual(
      expect.arrayContaining([
        "dynamic_effective_residual_linf_exceeds_tolerance",
        "backreaction_residual_not_bounded",
      ]),
    );
  });

  it("builds dynamic geometry sample receipts that distinguish missing samples from a missing ref", () => {
    const samples = buildNhm2DynamicGeometrySamples({
      fixedCycleAverageSource: true,
      averagingWindowSeconds: 1,
    });

    expect(isNhm2DynamicGeometrySamplesArtifact(samples)).toBe(true);
    expect(samples.summary.dynamicGeometrySamplesAvailable).toBe(false);
    expect(samples.summary.firstBlocker).toBe("dynamic_geometry_samples_missing");
  });

  it("rejects computed dynamic geometry samples without ADM geometry channels", () => {
    const samples = buildNhm2DynamicGeometrySamples({
      fixedCycleAverageSource: true,
      averagingWindowSeconds: 1,
      samples: [
        {
          sampleId: "bad-sample",
          geometryRef: "gr-evolve-brick.json",
          sourceKind: "gr_evolve_brick",
          requiredChannels: ["alpha", "K_xx"],
          availableChannels: ["alpha"],
          status: "computed",
        },
      ],
    });

    expect(samples.summary.dynamicGeometrySamplesAvailable).toBe(false);
    expect(samples.samples[0]?.missingChannels).toContain("K_xx");
    expect(samples.samples[0]?.blockers).toContain(
      "dynamic_geometry_required_channels_missing",
    );
  });

  it("validates gr-evolve-brick refs before marking dynamic geometry samples computed", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-gr-evolve-sample-"));
    const brickPath = "brick.json";
    const requiredChannels = [
      "alpha",
      "beta_x",
      "beta_y",
      "beta_z",
      "gamma_xx",
      "gamma_yy",
      "gamma_zz",
      "gamma_xy",
      "gamma_xz",
      "gamma_yz",
      "K_xx",
      "K_yy",
      "K_zz",
      "K_xy",
      "K_xz",
      "K_yz",
      "H_constraint",
      "M_constraint_x",
      "M_constraint_y",
      "M_constraint_z",
    ];
    writeFileSync(
      join(repoRoot, brickPath),
      `${JSON.stringify({
        kind: "gr-evolve-brick",
        time_s: 0,
        channels: Object.fromEntries(requiredChannels.map((channel) => [channel, {}])),
      })}\n`,
      "utf8",
    );

    const artifact = runNhm2DynamicGeometrySamples({
      repoRoot,
      outPath: "samples.json",
      fixedCycleAverageSource: true,
      averagingWindowSeconds: 1,
      grEvolveBrickRefs: [brickPath],
    });

    expect(artifact.summary.dynamicGeometrySamplesAvailable).toBe(true);
    expect(artifact.samples[0]?.sourceKind).toBe("gr_evolve_brick");
    expect(artifact.samples[0]?.missingChannels).toEqual([]);
    expect(readFileSync(join(repoRoot, "samples.json"), "utf8")).toContain(
      "nhm2_dynamic_geometry_samples/v1",
    );
  });

  it("requires effective geometry references to expose ADM geometry channels", () => {
    const artifact = buildNhm2EffectiveGeometryReference({
      effectiveGeometryRef: "effective-brick.json",
      sourceKind: "gr_evolve_brick_static_reference",
      requiredChannels: ["alpha", "K_xx"],
      availableChannels: ["alpha"],
      status: "computed",
    });

    expect(isNhm2EffectiveGeometryReference(artifact)).toBe(true);
    expect(artifact.summary.effectiveGeometryAvailable).toBe(false);
    expect(artifact.missingChannels).toContain("K_xx");
    expect(artifact.blockers).toContain("effective_geometry_required_channels_missing");
  });

  it("moves dynamic/effective evidence past missing effective geometry when a valid reference is present", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-effective-geometry-"));
    const dynamicSamples = buildNhm2DynamicGeometrySamples({
      fixedCycleAverageSource: true,
      averagingWindowSeconds: 1,
      samples: [
        {
          sampleId: "dynamic",
          geometryRef: "dynamic-brick.json",
          sourceKind: "gr_evolve_brick",
          requiredChannels: ["alpha"],
          availableChannels: ["alpha"],
          status: "computed",
        },
      ],
    });
    const effectiveReference = buildNhm2EffectiveGeometryReference({
      effectiveGeometryRef: "effective-brick.json",
      sourceKind: "gr_evolve_brick_static_reference",
      requiredChannels: ["alpha"],
      availableChannels: ["alpha"],
      status: "computed",
    });
    writeFileSync(
      join(repoRoot, "dynamic-samples.json"),
      `${JSON.stringify(dynamicSamples, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, "effective-reference.json"),
      `${JSON.stringify(effectiveReference, null, 2)}\n`,
      "utf8",
    );

    const evidence = runNhm2DynamicEffectiveGeometryEvidence({
      repoRoot,
      outPath: "dynamic-effective.json",
      dynamicGeometrySamplesPath: "dynamic-samples.json",
      effectiveGeometryReferencePath: "effective-reference.json",
      averagingWindowSeconds: 1,
      cycleAverageSourceFixed: true,
      residualLInf: 0.01,
      bounded: false,
    });

    expect(evidence.blockers).not.toContain("effective_geometry_ref_missing");
    expect(evidence.blockers).toEqual(
      expect.arrayContaining([
        "averaged_source_tensor_ref_missing",
        "backreaction_residual_not_bounded",
      ]),
    );
    expect(evidence.effectiveGeometryRef).toBe("effective-reference.json");
  });

  it("admits a source-side full tensor as averaged source evidence without proving backreaction", () => {
    const receipt = buildNhm2AveragedSourceTensorReceipt({
      sourceTensorRef: "source.json",
      sourceTensor: averagedSourceTensor(),
      frequencyConvergenceRef: "frequency.json",
      frequencyConvergence: frequencyEvidence(),
      switchingConservationRef: "switching.json",
      switchingConservation: switchingEvidence(),
      averagingWindowSeconds: 1,
      cycleAverageSourceFixed: true,
    });

    expect(isNhm2AveragedSourceTensorReceipt(receipt)).toBe(true);
    expect(receipt.summary.averagedSourceTensorAvailable).toBe(true);
    expect(receipt.status).toBe("pass");
    expect(receipt.claimBoundary.averagedSourceDoesNotBoundBackreaction).toBe(true);
  });

  it("moves dynamic/effective evidence past averaged source missing when receipt is valid", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-averaged-source-"));
    const dynamicSamples = buildNhm2DynamicGeometrySamples({
      fixedCycleAverageSource: true,
      averagingWindowSeconds: 1,
      samples: [
        {
          sampleId: "dynamic",
          geometryRef: "dynamic-brick.json",
          sourceKind: "gr_evolve_brick",
          requiredChannels: ["alpha"],
          availableChannels: ["alpha"],
          status: "computed",
        },
      ],
    });
    const effectiveReference = buildNhm2EffectiveGeometryReference({
      effectiveGeometryRef: "effective-brick.json",
      sourceKind: "gr_evolve_brick_static_reference",
      requiredChannels: ["alpha"],
      availableChannels: ["alpha"],
      status: "computed",
    });
    const averagedSource = buildNhm2AveragedSourceTensorReceipt({
      sourceTensorRef: "source.json",
      sourceTensor: averagedSourceTensor(),
      frequencyConvergenceRef: "frequency.json",
      frequencyConvergence: frequencyEvidence(),
      switchingConservationRef: "switching.json",
      switchingConservation: switchingEvidence(),
      averagingWindowSeconds: 1,
      cycleAverageSourceFixed: true,
    });
    writeFileSync(
      join(repoRoot, "dynamic-samples.json"),
      `${JSON.stringify(dynamicSamples, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, "effective-reference.json"),
      `${JSON.stringify(effectiveReference, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, "averaged-source.json"),
      `${JSON.stringify(averagedSource, null, 2)}\n`,
      "utf8",
    );

    const evidence = runNhm2DynamicEffectiveGeometryEvidence({
      repoRoot,
      outPath: "dynamic-effective.json",
      dynamicGeometrySamplesPath: "dynamic-samples.json",
      effectiveGeometryReferencePath: "effective-reference.json",
      averagedSourceTensorReceiptPath: "averaged-source.json",
      averagingWindowSeconds: 1,
      cycleAverageSourceFixed: true,
      residualLInf: 0.01,
      bounded: false,
    });

    expect(evidence.blockers).not.toContain("averaged_source_tensor_ref_missing");
    expect(evidence.blockers).toEqual(["backreaction_residual_not_bounded"]);
    expect(evidence.averagedSourceTensorRef).toBe("averaged-source.json");
  });

  it("bounds backreaction residuals from dynamic and effective gr-evolve channel data", () => {
    const receipt = buildNhm2BackreactionResidualReceipt({
      dynamicGeometrySamplesRef: "dynamic-samples.json",
      effectiveGeometryReferenceRef: "effective-reference.json",
      averagedSourceTensorRef: "averaged-source.json",
      toleranceLInf: 0.1,
      channels: [
        {
          channelId: "alpha",
          sampleCount: 1,
          dynamicLInf: 1,
          effectiveLInf: 1,
          absoluteLInf: 0.01,
          relativeLInf: 0.01,
          relativeL2: 0.01,
        },
      ],
    });

    expect(isNhm2BackreactionResidualReceipt(receipt)).toBe(true);
    expect(receipt.summary.bounded).toBe(true);
    expect(receipt.claimBoundary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("feeds a bounded backreaction receipt into dynamic/effective evidence", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-backreaction-"));
    const dynamicSamples = buildNhm2DynamicGeometrySamples({
      fixedCycleAverageSource: true,
      averagingWindowSeconds: 1,
      samples: [
        {
          sampleId: "dynamic",
          geometryRef: "dynamic-brick.json",
          sourceKind: "gr_evolve_brick",
          requiredChannels: ["alpha"],
          availableChannels: ["alpha"],
          status: "computed",
        },
      ],
    });
    const effectiveReference = buildNhm2EffectiveGeometryReference({
      effectiveGeometryRef: "effective-brick.json",
      sourceKind: "gr_evolve_brick_static_reference",
      requiredChannels: ["alpha"],
      availableChannels: ["alpha"],
      status: "computed",
    });
    const averagedSource = buildNhm2AveragedSourceTensorReceipt({
      sourceTensorRef: "source.json",
      sourceTensor: averagedSourceTensor(),
      frequencyConvergenceRef: "frequency.json",
      frequencyConvergence: frequencyEvidence(),
      switchingConservationRef: "switching.json",
      switchingConservation: switchingEvidence(),
      averagingWindowSeconds: 1,
      cycleAverageSourceFixed: true,
    });
    writeFileSync(
      join(repoRoot, "dynamic-samples.json"),
      `${JSON.stringify(dynamicSamples, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, "effective-reference.json"),
      `${JSON.stringify(effectiveReference, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, "averaged-source.json"),
      `${JSON.stringify(averagedSource, null, 2)}\n`,
      "utf8",
    );
    writeBrick(repoRoot, "dynamic-brick.json", { alpha: [1, 1.01] });
    writeBrick(repoRoot, "effective-brick.json", { alpha: [1, 1] });

    const backreaction = runNhm2BackreactionResidualReceipt({
      repoRoot,
      outPath: "backreaction.json",
      dynamicGeometrySamplesPath: "dynamic-samples.json",
      effectiveGeometryReferencePath: "effective-reference.json",
      averagedSourceTensorReceiptPath: "averaged-source.json",
      channels: ["alpha"],
      toleranceLInf: 0.1,
    });
    const evidence = runNhm2DynamicEffectiveGeometryEvidence({
      repoRoot,
      outPath: "dynamic-effective.json",
      dynamicGeometrySamplesPath: "dynamic-samples.json",
      effectiveGeometryReferencePath: "effective-reference.json",
      averagedSourceTensorReceiptPath: "averaged-source.json",
      backreactionResidualReceiptPath: "backreaction.json",
      averagingWindowSeconds: 1,
      cycleAverageSourceFixed: true,
    });

    expect(backreaction.summary.bounded).toBe(true);
    expect(evidence.blockers).toEqual([]);
    expect(evidence.agreementStatus).toBe("pass");
    expect(evidence.backreactionResidualRef).toBe("backreaction.json");
  });

  it("publishes candidate dynamic/effective geometry agreement from source campaign inputs", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-candidate-dynamic-"));
    const runRoot = "candidate-run";
    mkdirSync(join(repoRoot, runRoot), { recursive: true });
    writeFileSync(
      join(repoRoot, runRoot, "nhm2-candidate-tile-effective-full-tensor-source.json"),
      `${JSON.stringify(averagedSourceTensor(), null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, runRoot, "nhm2-frequency-convergence-evidence.json"),
      `${JSON.stringify(frequencyEvidence(), null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, runRoot, "nhm2-switching-covariant-conservation-evidence.json"),
      `${JSON.stringify(switchingEvidence(), null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(repoRoot, runRoot, "nhm2-regional-support-function-atlas.json"),
      `${JSON.stringify(atlasFixture(), null, 2)}\n`,
      "utf8",
    );

    const evidence = runNhm2CandidateDynamicEffectiveGeometryAgreement({
      repoRoot,
      runRoot,
      dims: [2, 2, 2],
      steps: 0,
      dtSeconds: 0,
      averagingWindowSeconds: 1,
      toleranceLInf: 0.1,
      auditOnly: true,
    });

    expect(evidence.agreementStatus).toBe("pass");
    expect(evidence.blockers).toEqual([]);
    expect(evidence.dynamicGeometryRef).toBe(
      "candidate-run/nhm2-dynamic-geometry-samples.json",
    );
    expect(evidence.effectiveGeometryRef).toBe(
      "candidate-run/nhm2-effective-geometry-reference.json",
    );
    expect(evidence.averagedSourceTensorRef).toBe(
      "candidate-run/nhm2-averaged-source-tensor-receipt.json",
    );
    expect(evidence.backreactionResidualRef).toBe(
      "candidate-run/nhm2-backreaction-residual-receipt.json",
    );
    expect(evidence.bounded).toBe(true);
  });

  it("emits a valid fail-closed artifact when evidence is missing", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      generatedAt: "2026-06-18T00:00:00.000Z",
    });

    expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
    expect(artifact.summary.campaignPass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe("source_component_authority_ledger_missing");
    expect(artifact.claimBoundary.physicalViabilityClaimAllowed).toBe(false);
    expect(artifact.claimBoundary.transportClaimAllowed).toBe(false);
  });

  it("keeps source independence missing when the same-basis source authority artifact is absent", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
    });

    expect(artifact.summary.sourceIndependencePass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe(
      "source_side_same_basis_tensor_authority_missing",
    );
    expect(artifact.sourceIndependence.sameBasisAuthorityReady).toBeNull();
    expect(artifact.sourceIndependence.blockers).toContain(
      "source_side_same_basis_tensor_authority_missing",
    );
  });

  it("blocks source independence when same-basis source authority is not authoritative", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      artifactRefs: {
        sourceSideSameBasisTensorAuthority: "source-authority.json",
        tileSourceAuthorityHandoff: "tile-source-handoff.json",
      },
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(
        {
          allRequiredRegionsAuthoritative: false,
          tileSourceHandoffReady: true,
          blockerCount: 1,
        },
        {
          wall: ["T12:full_apparatus_term_missing"],
        },
      ),
    });

    expect(artifact.summary.sourceIndependencePass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe(
      "source_side_same_basis_tensor_authority_not_authoritative",
    );
    expect(artifact.sourceIndependence.sameBasisAuthorityReady).toBe(false);
    expect(artifact.sourceIndependence.sameBasisAuthorityRef).toBe(
      "source-authority.json",
    );
    expect(artifact.sourceIndependence.sourceAuthorityBlockers).toContain(
      "wall:T12:full_apparatus_term_missing",
    );
  });

  it("does not let static source, tensor, QEI, and observer evidence pass the dynamic campaign", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
    });

    expect(artifact.summary.sourceIndependencePass).toBe(true);
    expect(artifact.summary.fullRegionalTensorClosurePass).toBe(true);
    expect(artifact.summary.qeiReceiptsPass).toBe(true);
    expect(artifact.summary.observerFamilyPass).toBe(true);
    expect(artifact.summary.campaignPass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe("switching_conservation_evidence_missing");
    expect(artifact.frequencyLadder.blockers).toContain("frequency_convergence_evidence_missing");
  });

  it("carries coupled-closure material/source required corrections into the campaign ledger", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
      coupledClosurePassCandidate: coupledClosureWithTileSourceCorrections(),
    });

    expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
    expect(artifact.summary.campaignPass).toBe(false);
    expect(artifact.summary.sourceIndependencePass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe(
      "tile_source_authority_handoff:tile_source_authority_handoff_status_blocked",
    );
    expect(artifact.summary.firstRequiredCorrections).toMatchObject({
      "tile_source_authority_handoff.effectiveSourceTensorLayerCountShortfall": 88.506,
      "tile_source_authority_handoff.activeAreaRetentionShortfall": 0.1,
    });
    expect(artifact.summary.coupledClosureRequiredCorrections).toMatchObject({
      "tile_source_authority_handoff.effectiveSourceTensorLayerCountShortfall": 88.506,
      "tile_source_authority_handoff.activeAreaRetentionShortfall": 0.1,
      "tile_source_authority_handoff.missingFatigueProvenanceRefCount": 4,
    });
    expect(artifact.claimBoundary.physicalViabilityClaimAllowed).toBe(false);
    expect(artifact.claimBoundary.transportClaimAllowed).toBe(false);
  });

  it("moves the first blocker past switching when valid switching evidence is supplied", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      switchingConservation: switchingEvidence(),
    });

    expect(artifact.summary.switchingConservationPass).toBe(true);
    expect(artifact.summary.campaignPass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe("frequency_convergence_evidence_missing");
  });

  it("moves the first blocker from missing dynamic evidence to typed dynamic blockers", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: buildNhm2DynamicEffectiveGeometryEvidence({
        cycleAverageSourceFixed: true,
        residualLInf: 0.01,
        bounded: true,
      }),
    });

    expect(artifact.summary.dynamicGeometryAgreementPass).toBe(false);
    expect(artifact.summary.campaignPass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe("dynamic_geometry_ref_missing");
    expect(artifact.claimBoundary).toMatchObject({
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      routeEtaClaimAllowed: false,
      propulsionClaimAllowed: false,
    });
  });

  it("moves the first blocker from a missing dynamic ref to missing dynamic samples", () => {
    const dynamicSamples = buildNhm2DynamicGeometrySamples({
      fixedCycleAverageSource: true,
      averagingWindowSeconds: 1,
    });
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: buildNhm2DynamicEffectiveGeometryEvidence({
        dynamicGeometryRef: "dynamic-geometry-samples.json",
        dynamicGeometryStatus: dynamicSamples.summary.dynamicGeometrySamplesAvailable
          ? "pass"
          : "missing",
        dynamicGeometryBlockers:
          dynamicSamples.summary.firstBlocker == null
            ? []
            : [dynamicSamples.summary.firstBlocker],
        cycleAverageSourceFixed: true,
        residualLInf: 0.01,
        bounded: true,
      }),
    });

    expect(artifact.summary.dynamicGeometryAgreementPass).toBe(false);
    expect(artifact.summary.campaignPass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe("dynamic_geometry_samples_missing");
  });

  it("rejects source target echo as source independence failure", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger({
        anyMetricEcho: true,
        metricEchoComponentRefs: ["wall:T00"],
        sourceSideComponentAuthorityComplete: false,
        firstBlocker: "wall:T00:metric_echo",
        blockerCount: 1,
      }),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
    });

    expect(artifact.sourceIndependence.copiedFromMetricRequiredTensor).toBe(true);
    expect(artifact.sourceIndependence.targetEchoDetected).toBe(true);
    expect(artifact.summary.sourceIndependencePass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe("source_target_echo_detected");
  });

  it("blocks full regional tensor closure when T0i or off-diagonal Tij are missing", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(
        {
          allRequiredComponentsPresent: false,
          fullTensorResidualsPass: false,
          worstResidualFamily: "off_diagonal_tij",
          firstBlocker: "T01:tile_component_missing",
          blockerCount: 2,
        },
        ["T01", "T12"],
      ),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });

    expect(artifact.summary.fullRegionalTensorClosurePass).toBe(false);
    expect(
      artifact.gates.find((gate) => gate.gateId === "full_regional_tensor_closure")
        ?.blockers,
    ).toEqual(
      expect.arrayContaining([
        "regional_full_tensor_components_missing",
        "wall:T01:tile_component_missing",
        "wall:T12:tile_component_missing",
      ]),
    );
    expect(
      artifact.gates.find((gate) => gate.gateId === "full_regional_tensor_closure")
        ?.primaryMetric,
    ).toContain("family=off_diagonal_tij");
    expect(artifact.summary.campaignPass).toBe(false);
  });

  it("surfaces off-diagonal fractional shear ansatz evidence in the full tensor campaign gate", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual({
        fullTensorResidualsPass: false,
        worstRegionId: "hull",
        worstComponentId: "T13",
        worstResidualFamily: "off_diagonal_tij",
        worstRelResidual: 1.64e15,
        firstBlocker: "hull:T13:full_tensor_residual_exceeded",
        blockerCount: 1,
      }),
      sourceOffDiagonalShearAudit: shearAudit(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });
    const gate = artifact.gates.find(
      (entry) => entry.gateId === "full_regional_tensor_closure",
    );

    expect(gate?.status).toBe("fail");
    expect(gate?.blockers).toEqual(
      expect.arrayContaining([
        "source_off_diagonal_current_declared_model_falsified",
        "source_off_diagonal_shear_mechanism_missing",
        "hull:T13:full_tensor_residual_exceeded",
      ]),
    );
    expect(gate?.warnings).toEqual(
      expect.arrayContaining([
        "source_off_diagonal_uniform_fractional_shear_ansatz",
      ]),
    );
    expect(gate?.primaryMetric).toContain("shearAuditWorstSuppression=5830000000000000");
    expect(artifact.summary.firstBlocker).toBe(
      "source_off_diagonal_current_declared_model_falsified",
    );
  });

  it("surfaces momentum-density ansatz evidence in the full tensor campaign gate", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual({
        fullTensorResidualsPass: false,
        worstRegionId: "hull",
        worstComponentId: "T01",
        worstResidualFamily: "momentum_t0i",
        worstRelResidual: 1.001,
        firstBlocker: "hull:T01:full_tensor_residual_exceeded",
        blockerCount: 1,
      }),
      sourceMomentumDensityAudit: momentumAudit(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });
    const gate = artifact.gates.find(
      (entry) => entry.gateId === "full_regional_tensor_closure",
    );

    expect(gate?.status).toBe("fail");
    expect(gate?.blockers).toEqual(
      expect.arrayContaining([
        "momentum_density_causal_bound_frame_projection_missing",
        "source_momentum_density_current_declared_model_falsified",
        "source_momentum_density_mechanism_missing",
        "hull:T01:full_tensor_residual_exceeded",
      ]),
    );
    expect(gate?.warnings).toEqual(
      expect.arrayContaining(["source_momentum_density_uniform_fractional_ansatz"]),
    );
    expect(gate?.primaryMetric).toContain("momentumAuditWorstAmplification=2.2e+21");
    expect(gate?.primaryMetric).toContain("momentumAuditWorstMetricRequiredRatio=2000000000000000");
    expect(gate?.primaryMetric).toContain("momentumAuditCausalBoundApplicability=blocked");
    expect(artifact.summary.firstBlocker).toBe(
      "momentum_density_causal_bound_frame_projection_missing",
    );
  });

  it("uses a momentum frame projection receipt to distinguish blocked local-frame evidence", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual({
        fullTensorResidualsPass: false,
        worstRegionId: "hull",
        worstComponentId: "T01",
        worstResidualFamily: "momentum_t0i",
        worstRelResidual: 1.001,
        firstBlocker: "hull:T01:full_tensor_residual_exceeded",
        blockerCount: 1,
      }),
      sourceMomentumDensityAudit: momentumAudit(),
      momentumFrameProjectionReceipt: blockedMomentumFrameProjectionReceipt(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });
    const gate = artifact.gates.find(
      (entry) => entry.gateId === "full_regional_tensor_closure",
    );

    expect(gate?.blockers).toEqual(
      expect.arrayContaining([
        "momentum_density_causal_bound_frame_projection_blocked",
        "source_momentum_density_current_declared_model_falsified",
        "source_momentum_density_mechanism_missing",
      ]),
    );
    expect(gate?.blockers).not.toContain(
      "momentum_density_causal_bound_frame_projection_missing",
    );
    expect(gate?.warnings).not.toContain("momentum_frame_projection_receipt_missing");
    expect(gate?.primaryMetric).toContain("momentumFrameProjection=blocked");
    expect(artifact.summary.firstBlocker).toBe(
      "momentum_density_causal_bound_frame_projection_blocked",
    );
  });

  it("promotes applicable metric momentum demand audit failures to current-profile falsifiers", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual({
        fullTensorResidualsPass: false,
        worstRegionId: "hull",
        worstComponentId: "T01",
        worstResidualFamily: "momentum_t0i",
        worstRelResidual: 1.001,
        firstBlocker: "hull:T01:full_tensor_residual_exceeded",
        blockerCount: 1,
      }),
      sourceMomentumDensityAudit: momentumAudit(),
      momentumFrameProjectionReceipt: {
        ...blockedMomentumFrameProjectionReceipt(),
        summary: {
          ...blockedMomentumFrameProjectionReceipt().summary,
          projectionAvailable: true,
          causalBoundApplicabilityStatus: "applicable",
          anyProjectedMetricRequiredCausalMomentumBoundViolation: true,
        },
      },
      metricRequiredMomentumDemandAudit: metricMomentumDemandAudit(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });
    const gate = artifact.gates.find(
      (entry) => entry.gateId === "full_regional_tensor_closure",
    );

    expect(gate?.blockers[0]).toBe(
      "metric_required_momentum_density_current_profile_falsified",
    );
    expect(gate?.primaryMetric).toContain("metricMomentumDemandFalsified=true");
    expect(artifact.summary.firstBlocker).toBe(
      "metric_required_momentum_density_current_profile_falsified",
    );
  });

  it("promotes campaign frontier disposition above the raw metric momentum falsifier", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      artifactRefs: {
        campaignFrontierDisposition: "frontier-disposition.json",
      },
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual({
        fullTensorResidualsPass: false,
        worstRegionId: "hull",
        worstComponentId: "T02",
        worstResidualFamily: "momentum_t0i",
        worstRelResidual: 1.001,
        firstBlocker: "hull:T02:full_tensor_residual_exceeded",
        blockerCount: 1,
      }),
      sourceMomentumDensityAudit: momentumAudit(),
      momentumFrameProjectionReceipt: {
        ...blockedMomentumFrameProjectionReceipt(),
        summary: {
          ...blockedMomentumFrameProjectionReceipt().summary,
          projectionAvailable: true,
          causalBoundApplicabilityStatus: "applicable",
          anyProjectedMetricRequiredCausalMomentumBoundViolation: true,
        },
      },
      metricRequiredMomentumDemandAudit: metricMomentumDemandAudit(),
      campaignFrontierDisposition: campaignFrontierDisposition(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });
    const gate = artifact.gates.find(
      (entry) => entry.gateId === "full_regional_tensor_closure",
    );

    expect(gate?.blockers[0]).toBe(
      "metric_momentum_current_profile_rejected_for_campaign",
    );
    expect(gate?.blockers).toContain(
      "metric_required_momentum_density_current_profile_falsified",
    );
    expect(gate?.primaryMetric).toContain(
      "campaignFrontierDisposition=current_profile_rejected",
    );
    expect(artifact.artifactRefs.campaignFrontierDisposition).toBe(
      "frontier-disposition.json",
    );
    expect(artifact.summary.firstBlocker).toBe(
      "metric_momentum_current_profile_rejected_for_campaign",
    );
  });

  it("can pass only when explicit dynamic, tensor, observer, QEI, and stability evidence pass together", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });

    expect(artifact.summary).toMatchObject({
      campaignPass: true,
      sourceIndependencePass: true,
      switchingConservationPass: true,
      frequencyConvergencePass: true,
      dynamicGeometryAgreementPass: true,
      fullRegionalTensorClosurePass: true,
      observerFamilyPass: true,
      qeiReceiptsPass: true,
      stabilityPass: true,
      firstBlocker: "none",
      blockerCount: 0,
    });
    const observerGate = artifact.gates.find(
      (entry) => entry.gateId === "observer_family_energy_conditions",
    );
    expect(observerGate).toMatchObject({
      status: "pass",
      pass: true,
      blockers: [],
      warnings: [
        "continuous_optimizer:continuous_optimizer_not_implemented",
      ],
    });
    expect(observerGate?.primaryMetric).toContain("observerScope=finite_family");
    expect(observerGate?.primaryMetric).toContain(
      "continuousOptimizerStatus=not_run",
    );
    expect(observerGate?.primaryMetric).toContain(
      "continuousOptimizerUsed=false",
    );
    expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
    expect(artifact.claimBoundary).toMatchObject({
      diagnosticOnly: true,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      routeEtaClaimAllowed: false,
      propulsionClaimAllowed: false,
    });
  });

  it("keeps non-continuous observer-family limitations as blockers", () => {
    const observer = observerArtifact();
    const algebraic = observer.observerFamilies.find(
      (family) => family.familyId === "algebraic_type_i",
    );
    if (algebraic == null) throw new Error("algebraic observer fixture missing");
    algebraic.status = "not_run";
    algebraic.blockers = ["algebraic_type_i_not_implemented"];

    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observer,
      campaignStability: stabilityEvidence(),
    });
    const observerGate = artifact.gates.find(
      (entry) => entry.gateId === "observer_family_energy_conditions",
    );

    expect(observerGate).toMatchObject({
      status: "review",
      pass: false,
      blockers: [
        "algebraic_type_i:algebraic_type_i_not_implemented",
      ],
      warnings: [
        "continuous_optimizer:continuous_optimizer_not_implemented",
      ],
    });
    expect(artifact.summary).toMatchObject({
      campaignPass: false,
      observerFamilyPass: false,
      firstBlocker: "algebraic_type_i:algebraic_type_i_not_implemented",
      blockerCount: 1,
    });
    expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
  });

  it.each(
    NHM2_REQUIRED_OBSERVER_FAMILY_IDS.filter(
      (familyId) => familyId !== "continuous_optimizer",
    ),
  )("does not pass when required finite observer family %s is absent", (familyId) => {
    const observer = observerArtifact();
    observer.observerFamilies = observer.observerFamilies.filter(
      (family) => family.familyId !== familyId,
    );
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observer,
      campaignStability: stabilityEvidence(),
    });
    const observerGate = artifact.gates.find(
      (entry) => entry.gateId === "observer_family_energy_conditions",
    );

    expect(observerGate?.status).toBe("review");
    expect(observerGate?.blockers).toContain(
      `${familyId}:observer_family_missing`,
    );
    expect(artifact.summary.campaignPass).toBe(false);
    expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
  });

  it("imports blockers and corrections even from an inconsistent passing coupled gate", () => {
    const coupled = coupledClosureWithTileSourceCorrections();
    coupled.gates[0].status = "pass";
    coupled.gates[0].pass = true;
    coupled.gates[0].blockers = ["hidden_nested_coupled_blocker"];
    coupled.summary.passCandidate = true;
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
      coupledClosurePassCandidate: coupled,
    });
    const sourceGate = artifact.gates.find(
      (entry) => entry.gateId === "source_independence",
    );

    expect(sourceGate).toMatchObject({
      status: "review",
      pass: false,
      blockers: [
        "tile_source_authority_handoff:hidden_nested_coupled_blocker",
      ],
    });
    expect(sourceGate?.requiredCorrections).toMatchObject({
      "tile_source_authority_handoff.effectiveSourceTensorLayerCountShortfall":
        88.506,
    });
    expect(artifact.summary).toMatchObject({
      campaignPass: false,
      firstBlocker:
        "tile_source_authority_handoff:hidden_nested_coupled_blocker",
    });
    expect(artifact.summary.firstRequiredCorrections).toMatchObject({
      "tile_source_authority_handoff.effectiveSourceTensorLayerCountShortfall":
        88.506,
    });
    expect(artifact.summary.coupledClosureRequiredCorrections).toMatchObject({
      "tile_source_authority_handoff.effectiveSourceTensorLayerCountShortfall":
        88.506,
    });
    expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
  });

  it.each([
    [
      "regional_support_function_atlas",
      "regional_support_function_atlas_not_eligible",
    ],
    [
      "source_closure_readiness",
      "source_closure_pass_readiness_incomplete",
    ],
  ] as const)(
    "propagates coupled %s review into full regional tensor closure",
    (coupledGateId, nestedBlocker) => {
      const coupled = coupledClosureWithTileSourceCorrections();
      coupled.gates = [
        {
          ...coupled.gates[0],
          gateId: coupledGateId,
          status: "review",
          pass: false,
          blockers: [nestedBlocker],
          warnings: [],
          requiredCorrections: {},
        },
      ];
      const artifact = buildNhm2TimeDependentSourceCampaign({
        sourceComponentAuthorityLedger: completeLedger(),
        sourceSideSameBasisTensorAuthority: sourceAuthority(),
        regionalFullTensorResidual: fullTensorResidual(),
        frequencyConvergence: frequencyEvidence(),
        switchingConservation: switchingEvidence(),
        dynamicEffectiveGeometry: dynamicGeometryEvidence(),
        qeiWorldlineDossier: qeiDossier(),
        observerRobustEnergyConditions: observerArtifact(),
        campaignStability: stabilityEvidence(),
        coupledClosurePassCandidate: coupled,
      });
      const closureGate = artifact.gates.find(
        (entry) => entry.gateId === "full_regional_tensor_closure",
      );

      expect(closureGate).toMatchObject({
        status: "review",
        pass: false,
      });
      expect(closureGate?.blockers).toContain(
        `${coupledGateId}:${nestedBlocker}`,
      );
      expect(artifact.summary.campaignPass).toBe(false);
      expect(artifact.summary.firstBlocker).toBe(
        `${coupledGateId}:${nestedBlocker}`,
      );
      expect(isNhm2TimeDependentSourceCampaignArtifact(artifact)).toBe(true);
    },
  );

  it("rejects pass gates with blockers and summaries inconsistent with their gates", () => {
    const artifact = buildNhm2TimeDependentSourceCampaign({
      sourceComponentAuthorityLedger: completeLedger(),
      sourceSideSameBasisTensorAuthority: sourceAuthority(),
      regionalFullTensorResidual: fullTensorResidual(),
      frequencyConvergence: frequencyEvidence(),
      switchingConservation: switchingEvidence(),
      dynamicEffectiveGeometry: dynamicGeometryEvidence(),
      qeiWorldlineDossier: qeiDossier(),
      observerRobustEnergyConditions: observerArtifact(),
      campaignStability: stabilityEvidence(),
    });
    const passGateTamper = structuredClone(artifact);
    passGateTamper.gates[0].blockers.push("tampered_pass_gate_blocker");
    expect(isNhm2TimeDependentSourceCampaignArtifact(passGateTamper)).toBe(false);

    const summaryTamper = structuredClone(artifact);
    summaryTamper.summary.blockerCount = 1;
    expect(isNhm2TimeDependentSourceCampaignArtifact(summaryTamper)).toBe(false);

    const passCorrectionTamper = structuredClone(artifact);
    passCorrectionTamper.gates[0].requiredCorrections = {
      hiddenCorrection: 1,
    };
    expect(isNhm2TimeDependentSourceCampaignArtifact(passCorrectionTamper)).toBe(
      false,
    );

    const firstCorrectionTamper = structuredClone(artifact);
    firstCorrectionTamper.summary.firstRequiredCorrections = {
      hiddenCorrection: 1,
    };
    expect(
      isNhm2TimeDependentSourceCampaignArtifact(firstCorrectionTamper),
    ).toBe(false);
  });
});
