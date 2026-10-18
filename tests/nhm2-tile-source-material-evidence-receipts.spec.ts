import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildNhm2TileSourceMaterialEvidenceReceipts,
  isNhm2TileSourceMaterialEvidenceReceipts,
  type BuildNhm2TileSourceMaterialEvidenceReceiptsInput,
} from "../shared/contracts/nhm2-tile-source-material-evidence-receipts.v1";
import {
  buildNhm2TileSourceEvidenceGapRoadmap,
  isNhm2TileSourceEvidenceGapRoadmap,
} from "../shared/contracts/nhm2-tile-source-evidence-gap-roadmap.v1";
import {
  buildNhm2TileSourceFalsificationReport,
  isNhm2TileSourceFalsificationReport,
} from "../shared/contracts/nhm2-tile-source-falsification-report.v1";
import {
  buildNhm2TileSourceAuthorityHandoff,
  isNhm2TileSourceAuthorityHandoff,
} from "../shared/contracts/nhm2-tile-source-authority-handoff.v1";
import {
  buildNhm2TileSourceExperimentalCampaignPackage,
  isNhm2TileSourceExperimentalCampaignPackage,
} from "../shared/contracts/nhm2-tile-source-experimental-campaign-package.v1";
import {
  buildNhm2TileSourceMaterialCouponTestPlan,
  isNhm2TileSourceMaterialCouponTestPlan,
} from "../shared/contracts/nhm2-tile-source-material-coupon-test-plan.v1";
import {
  buildNhm2TileSourceMaterialCouponOperatingBudget,
  isNhm2TileSourceMaterialCouponOperatingBudget,
} from "../shared/contracts/nhm2-tile-source-material-coupon-operating-budget.v1";
import {
  buildNhm2TileSourceForceGapPullInTestPlan,
  isNhm2TileSourceForceGapPullInTestPlan,
} from "../shared/contracts/nhm2-tile-source-force-gap-pull-in-test-plan.v1";
import {
  buildNhm2TileSourceForceGapLoadBudget,
  isNhm2TileSourceForceGapLoadBudget,
} from "../shared/contracts/nhm2-tile-source-force-gap-load-budget.v1";
import {
  buildNhm2TileSourceRoughnessPatchTestPlan,
  isNhm2TileSourceRoughnessPatchTestPlan,
} from "../shared/contracts/nhm2-tile-source-roughness-patch-test-plan.v1";
import {
  buildNhm2TileSourceRoughnessPatchOperatingBudget,
  isNhm2TileSourceRoughnessPatchOperatingBudget,
} from "../shared/contracts/nhm2-tile-source-roughness-patch-operating-budget.v1";
import {
  buildNhm2TileSourceActiveControlTestPlan,
  isNhm2TileSourceActiveControlTestPlan,
} from "../shared/contracts/nhm2-tile-source-active-control-test-plan.v1";
import {
  buildNhm2TileSourceActiveControlOperatingBudget,
  isNhm2TileSourceActiveControlOperatingBudget,
} from "../shared/contracts/nhm2-tile-source-active-control-operating-budget.v1";
import {
  buildNhm2TileSourceFatigueLayerScalingTestPlan,
  isNhm2TileSourceFatigueLayerScalingTestPlan,
} from "../shared/contracts/nhm2-tile-source-fatigue-layer-scaling-test-plan.v1";
import {
  buildNhm2TileSourceFatigueLayerScalingOperatingBudget,
  isNhm2TileSourceFatigueLayerScalingOperatingBudget,
} from "../shared/contracts/nhm2-tile-source-fatigue-layer-scaling-operating-budget.v1";
import {
  buildNhm2TileSourceFullApparatusTensorTestPlan,
  isNhm2TileSourceFullApparatusTensorTestPlan,
} from "../shared/contracts/nhm2-tile-source-full-apparatus-tensor-test-plan.v1";
import {
  buildNhm2TileSourceFullApparatusTensorOperatingBudget,
  isNhm2TileSourceFullApparatusTensorOperatingBudget,
} from "../shared/contracts/nhm2-tile-source-full-apparatus-tensor-operating-budget.v1";
import {
  buildNhm2TileSourceOperatingBudgetReadiness,
  isNhm2TileSourceOperatingBudgetReadiness,
} from "../shared/contracts/nhm2-tile-source-operating-budget-readiness.v1";
import { buildNhm2TileSourcePhysicalValidationPlan } from "../shared/contracts/nhm2-tile-source-physical-validation-plan.v1";
import { buildNhm2LayerStackMechanicalReceipt } from "../shared/contracts/nhm2-layer-stack-mechanical-receipt.v1";
import { buildNhm2LayerStackSupportFractionSweep } from "../shared/contracts/nhm2-layer-stack-support-fraction-sweep.v1";
import { buildNhm2LayerStackFullApparatusReceiptLoop } from "../shared/contracts/nhm2-layer-stack-full-apparatus-receipt-loop.v1";
import {
  buildNhm2TileSourceMaterialEvidenceTemplate,
  publishNhm2TileSourceMaterialEvidenceReceipts,
} from "../tools/nhm2/publish-tile-source-material-evidence-receipts";
import type { Nhm2SourceSideSameBasisTensorAuthorityArtifactV1 } from "../shared/contracts/nhm2-source-side-same-basis-tensor-authority.v1";

const generatedAt = "2026-06-22T00:00:00.000Z";

const forceGapProtocolRefs = {
  gapMetrologyRef: "receipt://force-gap/gap-metrology-8nm-v1",
  pullInSweepRef: "receipt://force-gap/pull-in-sweep-8nm-v1",
  stictionProtocolRef: "receipt://force-gap/stiction-protocol-8nm-v1",
  activeControlAuthorityRef: "receipt://force-gap/active-authority-8nm-v1",
  curveMinGapMeters: 6e-9,
  curveMaxGapMeters: 10e-9,
  localSampleWindowMeters: 1e-9,
  forceGapCurveSampleCountNearOperatingGap: 17,
  forceGradientCurveSampleCountNearOperatingGap: 17,
};

const roughnessPatchProtocolRefs = {
  gapMetrologyRef: "receipt://roughness-patch/gap-metrology-8nm-v1",
  surfacePairingRef: "receipt://roughness-patch/surface-pair-registration-v1",
  asperityTailFitRef: "receipt://roughness-patch/asperity-tail-fit-v1",
  patchVoltageCalibrationRef: "receipt://roughness-patch/patch-voltage-calibration-v1",
  residualElectrostaticModelRef: "receipt://roughness-patch/residual-electrostatic-model-v1",
  mapLateralResolutionMeters: 2e-10,
  roughnessMapSampleCount: 20000,
  asperityTailSampleCount: 2500,
  patchVoltageMapSampleCount: 20000,
  scanAreaFraction: 0.99,
  asperityP999Meters: 1.5e-9,
  patchVoltageCorrelationLengthMeters: 2e-8,
};

const passingEvidence: BuildNhm2TileSourceMaterialEvidenceReceiptsInput = {
  generatedAt,
  materialCoupon: {
    evidenceTier: "measured",
    evidenceRef: "receipt://coupon/tin/cryogenic-4k-v1",
    architectureId: "topology_optimized_lattice_tin",
    loadCaseRef: "receipt://coupon/tin/447-layer-load-case-8nm-4k-15ghz-v1",
    layerStackCompatibilityRef: "receipt://coupon/tin/447-layer-stack-compatibility-v1",
    topologyOptimizationRef: "receipt://coupon/tin/topology-optimized-lattice-v1",
    depositionProcessRef: "receipt://coupon/tin/deposition-process-v1",
    residualStressUniformityMapRef:
      "receipt://coupon/tin/residual-stress-uniformity-map-v1",
    interlayerAdhesionProtocolRef:
      "receipt://coupon/tin/interlayer-adhesion-protocol-v1",
    tensileStressCurveRef: "receipt://coupon/tin/tensile-stress-curve-4k-v1",
    fractureYieldCurveRef: "receipt://coupon/tin/fracture-yield-curve-4k-v1",
    cryogenicStateRef: "receipt://coupon/tin/cryogenic-state-4k-v1",
    cryogenicCycleRef: "receipt://coupon/tin/cryogenic-cycle-4k-v1",
    couponFatigueCurveRef: "receipt://coupon/tin/fatigue-cycle-curve-4k-v1",
    roughnessMapRef: "receipt://coupon/tin/roughness-map-v1",
    fabricationToleranceMapRef: "receipt://coupon/tin/fabrication-tolerance-map-v1",
    tensileStressCouponSampleCount: 8,
    fractureYieldCouponSampleCount: 8,
    cryogenicCycleSampleCount: 16,
    couponFatigueCurveSampleCount: 8,
    dielectricResponseFrequencySampleCount: 32,
    conductivityTemperatureSampleCount: 32,
    roughnessMapSampleCount: 20000,
    fabricationToleranceMapSampleCount: 20000,
    stackCompatibilityCouponSampleCount: 8,
    stackCompatibilityLayerCount: 447,
    stackCompatibilitySupportFraction: 0.26,
    stackCompatibilityActiveAreaLostFraction: 0.08,
    material: "ultra_high_stress_tin",
    measuredTensileStressPa: 2.3e9,
    fractureOrYieldStressPa: 2.1e9,
    supportStressPa: 5.45707087858e8,
    couponCycleCountToFailure: 2e9,
    couponRequiredCycleCount: 1e9,
    cryogenicTemperatureK: 4,
    dielectricResponseRef: "receipt://dielectric/tin/v1",
    conductivityRef: "receipt://conductivity/tin/v1",
    materialResponseFrequencyHz: 15e9,
    dielectricResponseTemperatureK: 4,
    conductivityTemperatureK: 4,
    dielectricLossTangent: 0.002,
    conductivitySiemensPerMeter: 1.2e6,
    roughnessRmsMeters: 5e-11,
    fabricationToleranceMeters: 5e-10,
  },
  forceGapPullIn: {
    evidenceTier: "validated_simulation",
    evidenceRef: "receipt://force-gap/8nm/v1",
    ...forceGapProtocolRefs,
    forceGapCurveRef: "receipt://force-gap/Fg-curve-8nm-v1",
    forceGradientCurveRef: "receipt://force-gap/dFdg-curve-8nm-v1",
    stiffnessModelRef: "receipt://force-gap/stiffness-model-447-layer-v1",
    gapMeters: 8e-9,
    casimirForceN: 1.42e4,
    forceGradientNPerM: 7.1e12,
    effectiveSpringConstantNPerM: 8.6e12,
    stictionMargin: 1.5,
    activeGapControlAuthorityN: 2e4,
  },
  roughnessPatch: {
    evidenceTier: "measured",
    evidenceRef: "receipt://roughness-patch/tin/v1",
    ...roughnessPatchProtocolRefs,
    roughnessMapRef: "receipt://roughness-patch/maps/roughness-height-v1",
    asperityDistributionRef: "receipt://roughness-patch/maps/asperity-tail-v1",
    patchVoltageMapRef: "receipt://roughness-patch/maps/patch-voltage-v1",
    roughnessRmsMeters: 5e-11,
    asperityP99Meters: 1e-9,
    asperityMaxMeters: 2e-9,
    patchVoltageRmsVolts: 5e-3,
    residualElectrostaticForceFraction: 0.02,
    correctionRef: "receipt://roughness-patch/correction/v1",
  },
  activeControl: {
    evidenceTier: "validated_simulation",
    evidenceRef: "receipt://active-control/gap-lock-v1",
    energyWaveformRef: "receipt://active-control/energy-waveform-v1",
    actuatorAuthorityTraceRef: "receipt://active-control/actuator-authority-trace-v1",
    gapSensorCalibrationRef: "receipt://active-control/gap-sensor-calibration-v1",
    controlTransferFunctionRef: "receipt://active-control/transfer-function-v1",
    controllerStabilityRef: "receipt://active-control/controller-stability-v1",
    gapNoiseTraceRef: "receipt://active-control/gap-noise-trace-v1",
    thermalModelRef: "receipt://active-control/thermal-model-v1",
    heatSinkCapacityTraceRef: "receipt://active-control/heat-sink-capacity-trace-v1",
    heatLoadTraceRef: "receipt://active-control/heat-load-trace-v1",
    sourceTensorContaminationRef:
      "receipt://active-control/source-tensor-contamination-v1",
    timingSyncTraceRef: "receipt://active-control/timing-sync-trace-v1",
    sectorLightCrossingSyncRef: "receipt://active-control/sector-light-crossing-sync-v1",
    sectorBoundaryTimingMapRef: "receipt://active-control/sector-boundary-timing-map-v1",
    phaseNoiseSpectrumRef: "receipt://active-control/phase-noise-spectrum-v1",
    lockAcquisitionTraceRef: "receipt://active-control/lock-acquisition-trace-v1",
    energyWaveformSampleCount: 8192,
    actuatorAuthorityTraceSampleCount: 8192,
    gapNoiseTraceSampleCount: 8192,
    heatLoadTraceSampleCount: 8192,
    timingSyncTraceSampleCount: 8192,
    phaseNoiseSpectrumBinCount: 1024,
    lockAcquisitionTrialCount: 250,
    energyPerCycleJ: 1e-9,
    actuatorAuthorityN: 2e4,
    bandwidthHz: 45e9,
    switchingRateHz: 15e9,
    gapNoiseRmsMeters: 5e-11,
    noiseSpectrumRef: "receipt://active-control/gap-noise-spectrum-v1",
    heatLoadW: 20,
    heatSinkCapacityW: 30,
    sourceTensorContaminationFraction: 0.01,
    timingJitterSeconds: 1e-12,
    sectorBoundarySkewSeconds: 1e-12,
    lightCrossingSyncMargin: 1.25,
    phaseNoiseRmsSeconds: 1e-12,
    controllerPhaseMarginDegrees: 60,
    controllerGainMarginDb: 10,
    lockAcquisitionTimeSeconds: 1e-9,
    failureModeRef: "receipt://active-control/failure-modes-v1",
    failureModeCoverage: {
      lossOfLock: true,
      thermalRunaway: true,
      noiseRunaway: true,
      timingDesynchronization: true,
      failSafeShutdown: true,
    },
  },
  fatigueLayerScaling: {
    evidenceTier: "validated_simulation",
    evidenceRef: "receipt://fatigue-layer-scaling/v1",
    loadSpectrumRef: "receipt://fatigue-layer-scaling/load-spectrum-v1",
    cycleProtocolRef: "receipt://fatigue-layer-scaling/cycle-protocol-v1",
    cryogenicFatigueRef: "receipt://fatigue-layer-scaling/cryogenic-fatigue-v1",
    fatigueCurveRef: "receipt://fatigue-layer-scaling/fatigue-curve-v1",
    thermalCycleRef: "receipt://fatigue-layer-scaling/thermal-cycle-v1",
    creepDriftRef: "receipt://fatigue-layer-scaling/creep-drift-v1",
    delaminationProtocolRef: "receipt://fatigue-layer-scaling/delamination-protocol-v1",
    interlayerAdhesionRef: "receipt://fatigue-layer-scaling/interlayer-adhesion-v1",
    layerScalingMapRef: "receipt://fatigue-layer-scaling/layer-scaling-map-v1",
    perLayerVariationMapRef: "receipt://fatigue-layer-scaling/per-layer-variation-map-v1",
    nonadditivityModelRef: "receipt://fatigue-layer-scaling/nonadditivity-model-v1",
    activeAreaMapRef: "receipt://fatigue-layer-scaling/active-area-map-v1",
    supportCouplingMapRef: "receipt://fatigue-layer-scaling/support-coupling-map-v1",
    electromagneticCouplingMapRef: "receipt://fatigue-layer-scaling/electromagnetic-coupling-map-v1",
    mechanicalCouplingMapRef: "receipt://fatigue-layer-scaling/mechanical-coupling-map-v1",
    multiphysicsCouplingRef: "receipt://fatigue-layer-scaling/multiphysics-coupling-v1",
    sourceTensorRetentionMapRef: "receipt://fatigue-layer-scaling/source-tensor-retention-map-v1",
    layerScalingSampledLayerCount: 447,
    perLayerVariationSampledLayerCount: 447,
    activeAreaMapSampledLayerCount: 447,
    sourceTensorRetentionSampledLayerCount: 447,
    supportCouplingSampledInterfaceCount: 446,
    electromagneticCouplingSampledInterfaceCount: 446,
    mechanicalCouplingSampledInterfaceCount: 446,
    cycleCountToFailure: 2e9,
    requiredCycleCount: 1e9,
    thermalCycleDriftFraction: 0.005,
    creepDriftFraction: 0.005,
    delaminationMargin: 1.4,
    interlayerAdhesionMargin: 1.3,
    layerScalingEfficiency: 0.98,
    perLayerVariationFraction: 0.02,
    nonadditivityFraction: 0.03,
    activeAreaRetention: 1,
    supportCouplingFraction: 0.04,
    electromagneticCouplingFraction: 0.03,
    mechanicalCouplingFraction: 0.04,
    sourceTensorRetentionFraction: 0.94,
    supportCouplingStatus: "pass",
  },
  fullApparatusTensor: {
    evidenceTier: "validated_simulation",
    evidenceRef: "receipt://full-apparatus-tmunu/v1",
    tensorValueArtifactRef: "artifact://full-apparatus-tmunu/values/v1",
    tensorValueArtifactContract: "nhm2_tile_source_full_apparatus_tensor_values/v1",
    sameChart: true,
    sameBasis: true,
    sameUnits: true,
    noMetricTargetEcho: true,
    components: {
      T00: true,
      T0i: true,
      diagonalTij: true,
      offDiagonalTij: true,
    },
    componentRefs: {
      T00: "receipt://full-apparatus-tmunu/components/T00-v1",
      T0i: "receipt://full-apparatus-tmunu/components/T0i-v1",
      diagonalTij: "receipt://full-apparatus-tmunu/components/diagonal-Tij-v1",
      offDiagonalTij: "receipt://full-apparatus-tmunu/components/off-diagonal-Tij-v1",
    },
    componentDetailRefs: {
      T00: "receipt://full-apparatus-tmunu/components/T00-v1",
      T01: "receipt://full-apparatus-tmunu/components/T01-v1",
      T02: "receipt://full-apparatus-tmunu/components/T02-v1",
      T03: "receipt://full-apparatus-tmunu/components/T03-v1",
      T11: "receipt://full-apparatus-tmunu/components/T11-v1",
      T12: "receipt://full-apparatus-tmunu/components/T12-v1",
      T13: "receipt://full-apparatus-tmunu/components/T13-v1",
      T22: "receipt://full-apparatus-tmunu/components/T22-v1",
      T23: "receipt://full-apparatus-tmunu/components/T23-v1",
      T33: "receipt://full-apparatus-tmunu/components/T33-v1",
    },
    termCoverage: {
      supportStructureStressEnergy: true,
      spacerContactStressEnergy: true,
      activeControlFieldEnergy: true,
      thermalLoadStressEnergy: true,
      patchPotentialElectrostaticStress: true,
      fatigueDamageEvolution: true,
      layerScalingCrossTerms: true,
      casimirInteractionStressEnergy: true,
      materialStrainEnergy: true,
    },
    termRefs: {
      supportStructureStressEnergy: "receipt://full-apparatus-tmunu/terms/support-stress-v1",
      spacerContactStressEnergy: "receipt://full-apparatus-tmunu/terms/spacer-contact-v1",
      activeControlFieldEnergy: "receipt://full-apparatus-tmunu/terms/active-control-v1",
      thermalLoadStressEnergy: "receipt://full-apparatus-tmunu/terms/thermal-load-v1",
      patchPotentialElectrostaticStress:
        "receipt://full-apparatus-tmunu/terms/patch-electrostatic-v1",
      fatigueDamageEvolution: "receipt://full-apparatus-tmunu/terms/fatigue-damage-v1",
      layerScalingCrossTerms: "receipt://full-apparatus-tmunu/terms/layer-cross-terms-v1",
      casimirInteractionStressEnergy: "receipt://full-apparatus-tmunu/terms/casimir-v1",
      materialStrainEnergy: "receipt://full-apparatus-tmunu/terms/material-strain-v1",
    },
    subsystemReceiptRefs: {
      materialCoupon: "receipt://coupon/tin/cryogenic-4k-v1",
      forceGapPullIn: "receipt://force-gap/8nm/v1",
      roughnessPatch: "receipt://roughness-patch/tin/v1",
      activeControl: "receipt://active-control/gap-lock-v1",
      fatigueLayerScaling: "receipt://fatigue-layer-scaling/v1",
    },
    regionalCoverage: {
      wall: true,
      hull: true,
      exteriorShell: true,
    },
    regionalSupportRefs: {
      wall: "receipt://full-apparatus-tmunu/regions/wall-support-v1",
      hull: "receipt://full-apparatus-tmunu/regions/hull-support-v1",
      exteriorShell: "receipt://full-apparatus-tmunu/regions/exterior-shell-support-v1",
    },
    regionalSampleCounts: {
      wall: 512,
      hull: 512,
      exteriorShell: 512,
    },
  },
};

const allDownstreamPass = {
  regional_residual_closure: "pass",
  wall_t00_closure: "pass",
  covariant_conservation: "pass",
  qei_worldline_dossier: "pass",
  observer_family_energy_conditions: "pass",
  material_credibility: "pass",
  coupled_closure: "pass",
} as const;

const allDownstreamArtifactRefs = {
  regional_residual_closure: "artifact://downstream/regional-residual-closure-v1",
  wall_t00_closure: "artifact://downstream/wall-t00-closure-v1",
  covariant_conservation: "artifact://downstream/covariant-conservation-v1",
  qei_worldline_dossier: "artifact://downstream/qei-worldline-dossier-v1",
  observer_family_energy_conditions: "artifact://downstream/observer-family-energy-conditions-v1",
  material_credibility: "artifact://downstream/material-credibility-v1",
  coupled_closure: "artifact://downstream/coupled-closure-v1",
} as const;

const forbiddenPhrase = (...parts: string[]): RegExp => new RegExp(parts.join(""), "i");

const buildPassingOperatingBudgetReadiness = (
  receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence),
  overrides: Partial<Parameters<typeof buildNhm2TileSourceOperatingBudgetReadiness>[0]> = {},
) => {
  const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
    generatedAt,
    materialEvidenceReceipts: receipts,
    forceGapPullInEvidence: passingEvidence.forceGapPullIn,
  });
  const input: Parameters<typeof buildNhm2TileSourceOperatingBudgetReadiness>[0] = {
    generatedAt,
    materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
      generatedAt,
      materialCouponEvidence: passingEvidence.materialCoupon,
    }),
    materialCouponOperatingBudgetRef: "artifact://material-coupon-budget",
    forceGapLoadBudget,
    forceGapLoadBudgetRef: "artifact://force-gap-load-budget",
    roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
      forceGapLoadBudget,
      roughnessPatchEvidence: passingEvidence.roughnessPatch,
    }),
    roughnessPatchOperatingBudgetRef: "artifact://roughness-patch-budget",
    activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
      forceGapLoadBudget,
      activeControlEvidence: passingEvidence.activeControl,
    }),
    activeControlOperatingBudgetRef: "artifact://active-control-budget",
    fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
      generatedAt,
      fatigueLayerScalingEvidence: passingEvidence.fatigueLayerScaling,
    }),
    fatigueLayerScalingOperatingBudgetRef: "artifact://fatigue-layer-scaling-budget",
    fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: passingEvidence.fullApparatusTensor,
    }),
    fullApparatusTensorOperatingBudgetRef: "artifact://full-apparatus-tensor-budget",
    ...overrides,
  };
  return buildNhm2TileSourceOperatingBudgetReadiness(input);
};

const blockedSourceAuthority = (): Nhm2SourceSideSameBasisTensorAuthorityArtifactV1 => ({
  contractVersion: "nhm2_source_side_same_basis_tensor_authority/v1",
  generatedAt,
  laneId: "nhm2_shift_lapse",
  selectedProfileId: "stage1_centerline_alpha_0p7000_v1",
  chartId: "comoving_cartesian",
  sourceModelId: "full_apparatus_material_source_tensor",
  sourceTensorArtifactRef: "artifact://full-apparatus-tensor-values",
  counterpartArtifactRef: "artifact://tile-effective-counterpart",
  tileSourceAuthorityHandoffRef: "artifact://tile-source-authority-handoff",
  tileSourceAuthorityHandoffStatus: "ready",
  regions: [
    {
      regionId: "wall",
      status: "blocked",
      sourceTensorRef: "artifact://full-apparatus-tensor-values#wall",
      expectedMetricCounterpartRole: "tile_effective_counterpart",
      comparisonRole: "full_apparatus_material_source_tensor",
      chartId: "comoving_cartesian",
      basisRef: "artifact://regional-atlas#basis",
      units: "J/m^3",
      regionMaskRef: "artifact://regional-atlas#wall",
      aggregationMode: "support_weighted",
      normalizationBasis: "sum_weights",
      tensorAuthorityMode: "source_side_full_apparatus_tensor",
      derivationMode: "full_apparatus_tensor_values",
      notDerivedFromMetricRequiredTensor: true,
      hasFullTensorComponents: false,
      missingComponentIds: ["T12"],
      materialReceiptRef: "artifact://material-receipts",
      materialReceiptStatus: "material_receipted",
      handoffRequiredCorrections: {
        missingFullApparatusTensorComponentRefs: ["wall:T12"],
      },
      blockers: ["T12:full_apparatus_term_missing"],
      warnings: [],
    },
  ],
  summary: {
    hasWallAuthority: false,
    allRequiredRegionsAuthoritative: false,
    tileSourceHandoffReady: true,
    anyMetricEcho: false,
    anyProxy: false,
    anyMissingCounterpart: false,
    missingRegionIds: [],
    tileSourceHandoffRequiredCorrections: {
      missingFullApparatusTensorComponentRefs: ["wall:T12"],
    },
    blockerCount: 1,
  },
  claimBoundary: {
    diagnosticOnly: true,
    doesNotValidatePhysicalSource: true,
    metricEchoForbidden: true,
    wallT00ClosureRequiresWallAuthority: true,
  },
});

describe("NHM2 tile source material evidence receipts", () => {
  it("emits missing receipt blockers by default", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });

    expect(isNhm2TileSourceMaterialEvidenceReceipts(receipts)).toBe(true);
    expect(receipts.contractVersion).toBe("nhm2_tile_source_material_evidence_receipts/v1");
    expect(receipts.frozenCandidateId).toBe("nhm2_447_layer_topology_optimized_lattice_tin_v1");
    expect(receipts.summary.candidateDisposition).toBe("review");
    expect(receipts.summary.firstBlocker).toBe("material_coupon_receipt_missing");
    expect(receipts.derivedReceiptInputs.suppliedReceiptSurfaces.material_coupon).toBe(false);
    expect(receipts.derivedReceiptInputs.tensorAuthorityEvidenceSupplied).toBe(false);
  });

  it("keeps declared-model evidence in review instead of material pass", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      materialCoupon: {
        ...passingEvidence.materialCoupon!,
        evidenceTier: "declared_model",
      },
    });
    const material = receipts.receiptSurfaces.find((surface) => surface.surfaceId === "material_coupon");

    expect(material?.status).toBe("review");
    expect(material?.blockers).toContain("material_coupon_tier_not_measured_or_validated");
    expect(receipts.derivedReceiptInputs.suppliedReceiptSurfaces.material_coupon).toBe(false);
    expect(receipts.summary.candidateDisposition).toBe("review");
  });

  it("falsifies the current candidate when 8 nm pull-in margin fails", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      forceGapPullIn: {
        evidenceTier: "measured",
        evidenceRef: "receipt://force-gap/failing-8nm-v1",
        ...forceGapProtocolRefs,
        forceGapCurveRef: "receipt://force-gap/failing-Fg-curve-v1",
        forceGradientCurveRef: "receipt://force-gap/failing-dFdg-curve-v1",
        stiffnessModelRef: "receipt://force-gap/failing-stiffness-model-v1",
        gapMeters: 8e-9,
        casimirForceN: 1.42e4,
        forceGradientNPerM: 3e6,
        effectiveSpringConstantNPerM: 1e6,
        stictionMargin: 0.8,
        activeGapControlAuthorityN: 1e4,
      },
    });

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.falsificationMap.map((entry) => entry.blocker)).toEqual(
      expect.arrayContaining([
        "force_gradient_inconsistent_with_force_curve_at_8nm",
        "pull_in_margin_below_one",
        "stiction_margin_below_one",
        "active_gap_control_authority_below_1p2x_force",
      ]),
    );
    expect(
      receipts.falsificationMap.some((entry) => entry.falsifiesCurrentCandidate),
    ).toBe(true);
  });

  it("opens a receipt-ready source candidate only with all material evidence and full tensor terms", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);

    expect(receipts.summary.candidateDisposition).toBe("receipt_ready");
    expect(receipts.summary.materialEvidenceReady).toBe(true);
    expect(receipts.summary.fullApparatusTensorReady).toBe(true);
    expect(receipts.summary.sourceAuthorityEvidenceReady).toBe(true);
    expect(receipts.summary.firstBlocker).toBe("none");
    expect(
      Object.values(receipts.derivedReceiptInputs.suppliedReceiptSurfaces).every(Boolean),
    ).toBe(true);
  });

  it("falsifies material-coupon receipts when fabrication tolerance exceeds the 0.5 nm target", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      materialCoupon: {
        ...passingEvidence.materialCoupon!,
        fabricationToleranceMeters: 1e-9,
      },
    });
    const materialSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "material_coupon",
    );

    expect(receipts.thresholds.fabricationToleranceMaxMeters).toBe(5e-10);
    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(materialSurface?.status).toBe("fail");
    expect(materialSurface?.blockers).toContain("fabrication_tolerance_above_0p5nm");
    expect(materialSurface?.numericalMargins.fabricationToleranceMargin).toBe(0.5);
    expect(materialSurface?.numericalMargins.fabricationToleranceMeters).toBe(1e-9);
  });

  it("falsifies material-coupon receipts when measured tensile stress is below support stress", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      materialCoupon: {
        ...passingEvidence.materialCoupon!,
        measuredTensileStressPa: 4e8,
      },
    });
    const materialSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "material_coupon",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(materialSurface?.status).toBe("fail");
    expect(materialSurface?.blockers).toContain(
      "measured_tensile_stress_below_support_stress",
    );
    expect(materialSurface?.numericalMargins.tensileStressMargin).toBeCloseTo(
      4e8 / 5.45707087858e8,
      12,
    );
    expect(materialSurface?.numericalMargins.supportStressPa).toBe(5.45707087858e8);
    expect(materialSurface?.numericalMargins.measuredTensileStressPa).toBe(4e8);
  });

  it("falsifies material-coupon receipts with malformed measured coupon values", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      materialCoupon: {
        ...passingEvidence.materialCoupon!,
        measuredTensileStressPa: Number.NaN,
        fractureOrYieldStressPa: -2.1e9,
        supportStressPa: Number.NaN,
        cryogenicTemperatureK: -4,
        roughnessRmsMeters: -5e-11,
      },
    });
    const materialSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "material_coupon",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(materialSurface?.status).toBe("fail");
    expect(materialSurface?.blockers).toEqual(
      expect.arrayContaining([
        "support_stress_invalid",
        "fracture_or_yield_stress_invalid",
        "measured_tensile_stress_invalid",
        "cryogenic_temperature_invalid",
        "coupon_roughness_rms_invalid",
      ]),
    );
    expect(materialSurface?.numericalMargins.stressMargin).toBeNull();
    expect(materialSurface?.numericalMargins.tensileStressMargin).toBeNull();
    expect(materialSurface?.numericalMargins.supportStressPa).toBeNaN();
    expect(materialSurface?.numericalMargins.measuredTensileStressPa).toBeNaN();
    expect(materialSurface?.numericalMargins.roughnessRmsMeters).toBe(-5e-11);
  });

  it("does not admit full apparatus tensor receipts whose subsystem refs are not backed by the same receipt bundle", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      fullApparatusTensor: {
        ...passingEvidence.fullApparatusTensor!,
        subsystemReceiptRefs: {
          ...passingEvidence.fullApparatusTensor!.subsystemReceiptRefs!,
          materialCoupon: "receipt://coupon/tin/different-coupon-v1",
        },
      },
    });
    const tensorSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "full_apparatus_tensor",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(true);
    expect(receipts.summary.fullApparatusTensorReady).toBe(false);
    expect(receipts.summary.sourceAuthorityEvidenceReady).toBe(false);
    expect(tensorSurface?.status).toBe("fail");
    expect(tensorSurface?.blockers).toContain(
      "full_apparatus_material_coupon_receipt_ref_mismatch",
    );
    expect(tensorSurface?.numericalMargins.subsystemReceiptRefsBacked).toBe(0);
  });

  it("blocks measured or validated receipt surfaces that lack a top-level evidence ref", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      materialCoupon: {
        ...passingEvidence.materialCoupon!,
        evidenceRef: undefined,
      },
      forceGapPullIn: {
        ...passingEvidence.forceGapPullIn!,
        evidenceRef: undefined,
      },
      roughnessPatch: {
        ...passingEvidence.roughnessPatch!,
        evidenceRef: undefined,
      },
      activeControl: {
        ...passingEvidence.activeControl!,
        evidenceRef: undefined,
      },
      fatigueLayerScaling: {
        ...passingEvidence.fatigueLayerScaling!,
        evidenceRef: undefined,
      },
      fullApparatusTensor: {
        ...passingEvidence.fullApparatusTensor!,
        evidenceRef: undefined,
      },
    });

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(receipts.summary.fullApparatusTensorReady).toBe(false);
    expect(receipts.falsificationMap.map((entry) => entry.blocker)).toEqual(
      expect.arrayContaining([
        "material_coupon_evidence_ref_missing",
        "force_gap_evidence_ref_missing",
        "roughness_patch_evidence_ref_missing",
        "active_control_evidence_ref_missing",
        "fatigue_layer_scaling_evidence_ref_missing",
        "full_apparatus_tensor_evidence_ref_missing",
      ]),
    );
    expect(
      receipts.receiptSurfaces
        .filter((surface) => surface.evidenceTier === "measured" || surface.evidenceTier === "validated_simulation")
        .every((surface) => surface.evidenceRef === null && surface.status === "fail"),
    ).toBe(true);
    expect(receipts.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("feeds the physical validation plan without opening physical or transport claims", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness: buildPassingOperatingBudgetReadiness(receipts),
      downstreamGateStatuses: allDownstreamPass,
      downstreamGateArtifactRefs: allDownstreamArtifactRefs,
    });

    expect(plan.summary.allReceiptsPresent).toBe(true);
    expect(plan.tensorAuthorityGate.sourceTensorAuthorityCandidateAllowed).toBe(true);
    expect(plan.summary.physicallyCredibleSourceCandidate).toBe(true);
    expect(plan.summary.sourceCandidateStatus).toBe("physically_credible_source_candidate");
    expect(plan.summary.physicalViabilityClaimAllowed).toBe(false);
    expect(plan.summary.transportClaimAllowed).toBe(false);
    expect(plan.claimBoundary.physicallyCredibleSourceCandidateIsNotPhysicalViability).toBe(true);
  });

  it("keeps claim-boundary language closed", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const text = JSON.stringify(receipts);

    expect(receipts.claimBoundary.idealScalarCasimirIsNotMaterialEvidence).toBe(true);
    expect(receipts.claimBoundary.fullApparatusTensorRequired).toBe(true);
    expect(receipts.summary.physicalViabilityClaimAllowed).toBe(false);
    expect(text).not.toMatch(forbiddenPhrase("certified", " speed"));
    expect(text).not.toMatch(forbiddenPhrase("transport", " certified"));
    expect(text).not.toMatch(forbiddenPhrase("propulsion", " proof"));
    expect(text).not.toMatch(forbiddenPhrase("wall", " closure", " passed"));
  });

  it("publishes material evidence and validation plan artifacts from one evidence input", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nhm2-tile-source-material-evidence-"));
    try {
      const evidencePath = join(tempRoot, "evidence.json");
      const outDir = join(tempRoot, "out");
      writeFileSync(
        evidencePath,
        `${JSON.stringify(
          {
            ...passingEvidence,
            downstreamGateStatuses: allDownstreamPass,
            downstreamGateArtifactRefs: allDownstreamArtifactRefs,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = publishNhm2TileSourceMaterialEvidenceReceipts({
        repoRoot: process.cwd(),
        evidencePath,
        outDir,
        generatedAt,
      });
      const materialJson = JSON.parse(
        readFileSync(result.outputRefs.materialEvidenceReceipts, "utf8"),
      ) as { contractVersion?: string; summary?: { firstBlocker?: string } };
      const planJson = JSON.parse(
        readFileSync(result.outputRefs.physicalValidationPlan, "utf8"),
      ) as { contractVersion?: string; summary?: { sourceCandidateStatus?: string } };
      const roadmapJson = JSON.parse(
        readFileSync(result.outputRefs.evidenceGapRoadmap, "utf8"),
      ) as {
        contractVersion?: string;
        sourceRefs?: { operatingBudgetReadinessRef?: string | null };
        summary?: { nextBestItemId?: string; operatingBudgetsReady?: boolean | null };
      };
      const falsificationReportJson = JSON.parse(
        readFileSync(result.outputRefs.falsificationReport, "utf8"),
      ) as { contractVersion?: string; disposition?: { reportStatus?: string } };
      const authorityHandoffJson = JSON.parse(
        readFileSync(result.outputRefs.authorityHandoff, "utf8"),
      ) as { contractVersion?: string; summary?: { handoffStatus?: string } };
      const experimentalCampaignPackageJson = JSON.parse(
        readFileSync(result.outputRefs.experimentalCampaignPackage, "utf8"),
      ) as {
        contractVersion?: string;
        summary?: {
          packageStatus?: string;
          measurementCount?: number;
          allEvidenceObjectivesSatisfied?: boolean;
          objectiveCoverageCount?: number;
        };
        campaignItems?: unknown[];
        objectiveCoverage?: Array<{ objectiveId?: string; status?: string }>;
      };
      const couponPlanJson = JSON.parse(
        readFileSync(result.outputRefs.materialCouponTestPlan, "utf8"),
      ) as { contractVersion?: string; summary?: { nextRequiredTestId?: string } };
      const couponOperatingBudgetJson = JSON.parse(
        readFileSync(result.outputRefs.materialCouponOperatingBudget, "utf8"),
      ) as { contractVersion?: string; summary?: { firstBlocker?: string } };
      const forceGapPlanJson = JSON.parse(
        readFileSync(result.outputRefs.forceGapPullInTestPlan, "utf8"),
      ) as { contractVersion?: string; summary?: { nextRequiredTestId?: string } };
      const forceGapLoadBudgetJson = JSON.parse(
        readFileSync(result.outputRefs.forceGapLoadBudget, "utf8"),
      ) as { contractVersion?: string; summary?: { firstBlocker?: string } };
      const roughnessPatchPlanJson = JSON.parse(
        readFileSync(result.outputRefs.roughnessPatchTestPlan, "utf8"),
      ) as { contractVersion?: string; summary?: { nextRequiredTestId?: string } };
      const roughnessPatchOperatingBudgetJson = JSON.parse(
        readFileSync(result.outputRefs.roughnessPatchOperatingBudget, "utf8"),
      ) as { contractVersion?: string; summary?: { firstBlocker?: string } };
      const activeControlPlanJson = JSON.parse(
        readFileSync(result.outputRefs.activeControlTestPlan, "utf8"),
      ) as { contractVersion?: string; summary?: { nextRequiredTestId?: string } };
      const activeControlOperatingBudgetJson = JSON.parse(
        readFileSync(result.outputRefs.activeControlOperatingBudget, "utf8"),
      ) as { contractVersion?: string; summary?: { firstBlocker?: string } };
      const fatigueLayerScalingPlanJson = JSON.parse(
        readFileSync(result.outputRefs.fatigueLayerScalingTestPlan, "utf8"),
      ) as { contractVersion?: string; summary?: { nextRequiredTestId?: string } };
      const fatigueLayerScalingOperatingBudgetJson = JSON.parse(
        readFileSync(result.outputRefs.fatigueLayerScalingOperatingBudget, "utf8"),
      ) as { contractVersion?: string; summary?: { firstBlocker?: string } };
      const fullApparatusTensorPlanJson = JSON.parse(
        readFileSync(result.outputRefs.fullApparatusTensorTestPlan, "utf8"),
      ) as { contractVersion?: string; summary?: { nextRequiredTestId?: string } };
      const fullApparatusTensorOperatingBudgetJson = JSON.parse(
        readFileSync(result.outputRefs.fullApparatusTensorOperatingBudget, "utf8"),
      ) as { contractVersion?: string; summary?: { firstBlocker?: string } };
      const operatingBudgetReadinessJson = JSON.parse(
        readFileSync(result.outputRefs.operatingBudgetReadiness, "utf8"),
      ) as {
        contractVersion?: string;
        summary?: { allOperatingBudgetsReady?: boolean; firstBlocker?: string };
      };

      expect(materialJson.contractVersion).toBe("nhm2_tile_source_material_evidence_receipts/v1");
      expect(materialJson.summary?.firstBlocker).toBe("none");
      expect(planJson.contractVersion).toBe("nhm2_tile_source_physical_validation_plan/v1");
      expect(planJson.summary?.sourceCandidateStatus).toBe("physically_credible_source_candidate");
      expect(roadmapJson.contractVersion).toBe("nhm2_tile_source_evidence_gap_roadmap/v1");
      expect(roadmapJson.summary?.nextBestItemId).toBe("none");
      expect(roadmapJson.summary?.operatingBudgetsReady).toBe(true);
      expect(roadmapJson.sourceRefs?.operatingBudgetReadinessRef).toBe(
        result.outputRefs.operatingBudgetReadiness,
      );
      expect(falsificationReportJson.contractVersion).toBe("nhm2_tile_source_falsification_report/v1");
      expect(falsificationReportJson.disposition?.reportStatus).toBe("candidate_evidence_complete");
      expect(authorityHandoffJson.contractVersion).toBe("nhm2_tile_source_authority_handoff/v1");
      expect(authorityHandoffJson.summary?.handoffStatus).toBe("handoff_ready");
      expect(experimentalCampaignPackageJson.contractVersion).toBe(
        "nhm2_tile_source_experimental_campaign_package/v1",
      );
      expect(experimentalCampaignPackageJson.summary?.packageStatus).toBe(
        "no_open_campaign_items",
      );
      expect(experimentalCampaignPackageJson.summary?.measurementCount).toBe(0);
      expect(experimentalCampaignPackageJson.summary?.objectiveCoverageCount).toBe(9);
      expect(experimentalCampaignPackageJson.summary?.allEvidenceObjectivesSatisfied).toBe(true);
      expect(experimentalCampaignPackageJson.objectiveCoverage).toHaveLength(9);
      expect(
        experimentalCampaignPackageJson.objectiveCoverage?.map((coverage) => coverage.status),
      ).toEqual(Array(9).fill("satisfied"));
      expect(experimentalCampaignPackageJson.campaignItems).toHaveLength(0);
      expect(result.experimentalCampaignPackage.summary.missingMeasurementCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.failingMeasurementCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.passingMeasurementCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.openObjectiveCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.falsifyingObjectiveCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.satisfiedObjectiveCount).toBe(9);
      expect(result.experimentalCampaignPackage.objectiveCoverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            objectiveId: "source_side_same_basis_authority",
            status: "satisfied",
          }),
          expect.objectContaining({
            objectiveId: "downstream_gate_readiness",
            status: "satisfied",
          }),
          expect.objectContaining({
            objectiveId: "falsification_map",
            status: "satisfied",
          }),
        ]),
      );
      expect(isNhm2TileSourceExperimentalCampaignPackage(result.experimentalCampaignPackage)).toBe(
        true,
      );
      expect(couponPlanJson.contractVersion).toBe("nhm2_tile_source_material_coupon_test_plan/v1");
      expect(couponPlanJson.summary?.nextRequiredTestId).toBe("none");
      expect(couponOperatingBudgetJson.contractVersion).toBe(
        "nhm2_tile_source_material_coupon_operating_budget/v1",
      );
      expect(couponOperatingBudgetJson.summary?.firstBlocker).toBe("none");
      expect(forceGapPlanJson.contractVersion).toBe("nhm2_tile_source_force_gap_pull_in_test_plan/v1");
      expect(forceGapPlanJson.summary?.nextRequiredTestId).toBe("none");
      expect(forceGapLoadBudgetJson.contractVersion).toBe("nhm2_tile_source_force_gap_load_budget/v1");
      expect(forceGapLoadBudgetJson.summary?.firstBlocker).toBe("none");
      expect(roughnessPatchPlanJson.contractVersion).toBe("nhm2_tile_source_roughness_patch_test_plan/v1");
      expect(roughnessPatchPlanJson.summary?.nextRequiredTestId).toBe("none");
      expect(roughnessPatchOperatingBudgetJson.contractVersion).toBe(
        "nhm2_tile_source_roughness_patch_operating_budget/v1",
      );
      expect(roughnessPatchOperatingBudgetJson.summary?.firstBlocker).toBe("none");
      expect(activeControlPlanJson.contractVersion).toBe("nhm2_tile_source_active_control_test_plan/v1");
      expect(activeControlPlanJson.summary?.nextRequiredTestId).toBe("none");
      expect(activeControlOperatingBudgetJson.contractVersion).toBe(
        "nhm2_tile_source_active_control_operating_budget/v1",
      );
      expect(activeControlOperatingBudgetJson.summary?.firstBlocker).toBe("none");
      expect(fatigueLayerScalingPlanJson.contractVersion).toBe("nhm2_tile_source_fatigue_layer_scaling_test_plan/v1");
      expect(fatigueLayerScalingPlanJson.summary?.nextRequiredTestId).toBe("none");
      expect(fatigueLayerScalingOperatingBudgetJson.contractVersion).toBe(
        "nhm2_tile_source_fatigue_layer_scaling_operating_budget/v1",
      );
      expect(fatigueLayerScalingOperatingBudgetJson.summary?.firstBlocker).toBe("none");
      expect(fullApparatusTensorPlanJson.contractVersion).toBe("nhm2_tile_source_full_apparatus_tensor_test_plan/v1");
      expect(fullApparatusTensorPlanJson.summary?.nextRequiredTestId).toBe("none");
      expect(fullApparatusTensorOperatingBudgetJson.contractVersion).toBe(
        "nhm2_tile_source_full_apparatus_tensor_operating_budget/v1",
      );
      expect(fullApparatusTensorOperatingBudgetJson.summary?.firstBlocker).toBe("none");
      expect(operatingBudgetReadinessJson.contractVersion).toBe(
        "nhm2_tile_source_operating_budget_readiness/v1",
      );
      expect(operatingBudgetReadinessJson.summary?.allOperatingBudgetsReady).toBe(true);
      expect(operatingBudgetReadinessJson.summary?.firstBlocker).toBe("none");
      expect(result.operatingBudgetReadiness.summary.physicalViabilityClaimAllowed).toBe(false);
      expect(result.physicalValidationPlan.summary.physicalViabilityClaimAllowed).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("builds a fillable frozen-candidate evidence template without opening claims", () => {
    const template = buildNhm2TileSourceMaterialEvidenceTemplate({ generatedAt });
    const text = JSON.stringify(template);

    expect(template.templateVersion).toBe("nhm2_tile_source_material_evidence_template/v1");
    expect(template.candidateId).toBe("nhm2_447_layer_topology_optimized_lattice_tin_v1");
    expect(template.materialCoupon?.material).toBe("ultra_high_stress_tin");
    expect(template.materialCoupon?.supportStressPa).toBe(5.45707087858e8);
    expect(template.forceGapPullIn?.gapMeters).toBe(8e-9);
    expect(template.activeControl?.switchingRateHz).toBe(15e9);
    expect(template.fullApparatusTensor?.components.T0i).toBe(false);
    expect(template.fullApparatusTensor?.components.offDiagonalTij).toBe(false);
    expect(template.fullApparatusTensor?.termCoverage.supportStructureStressEnergy).toBe(false);
    expect(template.downstreamGateStatuses?.coupled_closure).toBe("not_run");
    expect(template.usage.nullValuesAreMissingEvidence).toBe(true);
    expect(text).not.toMatch(forbiddenPhrase("physical", " viability", " allowed"));
    expect(text).not.toMatch(forbiddenPhrase("transport", " claim", " allowed"));
  });

  it("keeps a filled-from-template publish result in review until evidence is supplied", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nhm2-tile-source-material-template-"));
    try {
      const evidencePath = join(tempRoot, "template.json");
      const outDir = join(tempRoot, "out");
      writeFileSync(
        evidencePath,
        `${JSON.stringify(buildNhm2TileSourceMaterialEvidenceTemplate({ generatedAt }), null, 2)}\n`,
        "utf8",
      );

      const result = publishNhm2TileSourceMaterialEvidenceReceipts({
        repoRoot: process.cwd(),
        evidencePath,
        outDir,
        generatedAt,
      });
      const materialSurface = result.materialEvidenceReceipts.receiptSurfaces.find(
        (surface) => surface.surfaceId === "material_coupon",
      );

      expect(result.materialEvidenceReceipts.summary.candidateDisposition).toBe("review");
      expect(result.materialEvidenceReceipts.summary.materialEvidenceReady).toBe(false);
      expect(result.materialEvidenceReceipts.summary.fullApparatusTensorReady).toBe(false);
      expect(result.materialEvidenceReceipts.summary.physicalViabilityClaimAllowed).toBe(false);
      expect(result.physicalValidationPlan.summary.sourceCandidateStatus).toBe("review");
      expect(result.evidenceGapRoadmap.summary.nextBestItemId).toBe("material_coupon");
      expect(result.evidenceGapRoadmap.summary.openItemCount).toBe(7);
      expect(result.falsificationReport.disposition.reportStatus).toBe("review");
      expect(result.falsificationReport.summary.nextRequiredSurfaceId).toBe("material_coupon");
      expect(result.falsificationReport.summary.missingReceiptCount).toBe(7);
      expect(result.authorityHandoff.summary.handoffStatus).toBe("blocked");
      expect(result.authorityHandoff.summary.firstBlocker).toBe("material_coupon_tier_not_measured_or_validated");
      expect(isNhm2TileSourceExperimentalCampaignPackage(result.experimentalCampaignPackage)).toBe(
        true,
      );
      expect(result.experimentalCampaignPackage.summary.packageStatus).toBe(
        "ready_for_evidence_collection",
      );
      expect(result.experimentalCampaignPackage.summary.firstCampaignDomain).toBe(
        "material_coupon_behavior",
      );
      expect(result.experimentalCampaignPackage.summary.measurementCount).toBeGreaterThanOrEqual(3);
      expect(result.experimentalCampaignPackage.summary.measurementDocketCount).toBe(
        result.experimentalCampaignPackage.measurementDocket.length,
      );
      expect(result.experimentalCampaignPackage.summary.measurementDocketCount).toBeGreaterThan(
        result.experimentalCampaignPackage.summary.measurementCount,
      );
      expect(result.experimentalCampaignPackage.summary.measurementCount).toBe(78);
      expect(result.experimentalCampaignPackage.summary.measurementDocketCount).toBe(79);
      expect(result.experimentalCampaignPackage.summary.requiredTargetAvailableCount).toBe(69);
      expect(result.experimentalCampaignPackage.summary.requiredTargetPendingCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.requiredTargetNotApplicableCount).toBe(10);
      expect(result.experimentalCampaignPackage.summary.requiredTargetNotDeclaredCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.missingMeasurementCount).toBeGreaterThan(0);
      expect(result.experimentalCampaignPackage.summary.failingMeasurementCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.passingMeasurementCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.objectiveCoverageCount).toBe(9);
      expect(result.experimentalCampaignPackage.summary.campaignDomainLedgerCount).toBe(8);
      expect(result.experimentalCampaignPackage.summary.receiptAcquisitionDomainCount).toBe(8);
      expect(result.experimentalCampaignPackage.summary.receiptArtifactRequirementCount).toBe(79);
      expect(result.experimentalCampaignPackage.summary.domainsWithPendingDerivedTargetsCount).toBe(
        0,
      );
      expect(result.experimentalCampaignPackage.summary.targetGapMeasurementCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.missingReceiptDomainCount).toBe(7);
      expect(result.experimentalCampaignPackage.summary.downstreamBlockedDomainCount).toBe(1);
      expect(result.experimentalCampaignPackage.summary.noGoDomainCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.reviewDomainCount).toBe(8);
      expect(result.experimentalCampaignPackage.summary.goDomainCount).toBe(0);
      expect(result.experimentalCampaignPackage.summary.allObjectiveCoveragePresent).toBe(true);
      expect(result.experimentalCampaignPackage.summary.allEvidenceObjectivesSatisfied).toBe(false);
      expect(result.experimentalCampaignPackage.sourceRefs.operatingBudgetReadinessRef).toBe(
        result.outputRefs.operatingBudgetReadiness,
      );
      expect(result.experimentalCampaignPackage.summary.openObjectiveCount).toBeGreaterThan(0);
      expect(result.experimentalCampaignPackage.summary.satisfiedObjectiveCount).toBeGreaterThan(0);
      expect(result.experimentalCampaignPackage.campaignDomainLedger).toHaveLength(8);
      expect(result.experimentalCampaignPackage.campaignDomainLedger.map((entry) => entry.campaignDomain)).toEqual([
        "material_coupon_behavior",
        "force_gap_pull_in",
        "roughness_patch_potential",
        "active_control_energy_noise_heat_timing",
        "fatigue_layer_scaling",
        "full_apparatus_tensor",
        "downstream_residual_conservation_qei_observer",
        "campaign_coordination",
      ]);
      expect(result.experimentalCampaignPackage.receiptAcquisitionLedger).toHaveLength(8);
      expect(result.experimentalCampaignPackage.receiptAcquisitionLedger).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            acquisitionStatus: "missing_receipt",
            decision: "review",
            nextEvidenceArtifact: "receipt://material_coupon/provenance_v1",
            requiredEvidenceArtifacts: expect.arrayContaining([
              "receipt://material_coupon/447_layer_load_case_compatibility_v1",
              "receipt://material_coupon/tensile_stress_4k_v1",
              "receipt://material_coupon/fracture_yield_margin_v1",
              "receipt://material_coupon/fatigue_cycle_margin_v1",
              "receipt://material_coupon/cryogenic_4k_state_v1",
              "receipt://material_coupon/dielectric_response_v1",
              "receipt://material_coupon/conductivity_v1",
              "receipt://material_coupon/roughness_rms_v1",
              "receipt://material_coupon/fabrication_tolerance_v1",
            ]),
            openMeasurementIds: expect.arrayContaining([
              "coupon_stack_compatibility",
              "coupon_tensile_stress_margin",
              "coupon_fracture_yield_margin",
              "coupon_fatigue_cycle_margin",
              "coupon_cryogenic_state",
              "coupon_dielectric_response",
              "coupon_conductivity_response",
              "coupon_roughness_rms",
              "coupon_fabrication_tolerance",
            ]),
            requiredTargetAvailableCount: 9,
            requiredTargetPendingCount: 0,
            blocksCampaignPass: true,
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            requiredEvidenceArtifacts: expect.arrayContaining([
              "receipt://force_gap_pull_in/gap_metrology_8nm_v1",
              "receipt://force_gap_pull_in/force_gap_curve_8nm_v1",
              "receipt://force_gap_pull_in/force_gradient_8nm_v1",
              "receipt://force_gap_pull_in/stiffness_model_8nm_v1",
              "receipt://force_gap_pull_in/pull_in_margin_8nm_v1",
              "receipt://force_gap_pull_in/stiction_margin_8nm_v1",
              "receipt://force_gap_pull_in/active_authority_447_layer_v1",
            ]),
            openMeasurementIds: expect.arrayContaining([
              "gap_metrology_8nm",
              "force_curve_brackets_8nm",
              "force_gradient_curve_8nm",
              "stiffness_model_8nm",
              "pull_in_margin",
              "stiction_margin",
              "active_gap_authority",
            ]),
            requiredTargetAvailableCount: 6,
            requiredTargetPendingCount: 0,
            pendingTargetGaps: [],
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            requiredEvidenceArtifacts: expect.arrayContaining([
              "receipt://roughness_patch_metrology/gap_metrology_8nm_v1",
              "receipt://roughness_patch_metrology/roughness_map_resolution_v1",
              "receipt://roughness_patch_metrology/scan_area_coverage_v1",
              "receipt://roughness_patch_metrology/roughness_rms_map_v1",
              "receipt://roughness_patch_metrology/asperity_p99_tail_v1",
              "receipt://roughness_patch_metrology/asperity_p999_tail_v1",
              "receipt://roughness_patch_metrology/asperity_tail_map_v1",
              "receipt://roughness_patch_metrology/patch_voltage_rms_v1",
              "receipt://roughness_patch_metrology/patch_voltage_correlation_length_v1",
              "receipt://roughness_patch_metrology/patch_derived_electrostatic_fraction_v1",
              "receipt://roughness_patch_metrology/patch_potential_force_v1",
            ]),
            openMeasurementIds: expect.arrayContaining([
              "roughness_gap_metrology_8nm",
              "roughness_map_resolution",
              "roughness_scan_area",
              "roughness_rms_margin",
              "asperity_p99_tail",
              "asperity_p999_tail",
              "asperity_tail_clearance",
              "patch_voltage_rms",
              "patch_voltage_correlation_length",
              "patch_derived_electrostatic_fraction",
              "patch_potential_force_fraction",
            ]),
            requiredTargetAvailableCount: 10,
            requiredTargetPendingCount: 0,
            pendingTargetGaps: [],
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            requiredEvidenceArtifacts: expect.arrayContaining([
              "receipt://active_control/trace_refs_v1",
              "receipt://active_control/switching_rate_sync_v1",
              "receipt://active_control/bandwidth_15ghz_switching_v1",
              "receipt://active_control/gap_control_authority_v1",
              "receipt://active_control/gap_noise_spectrum_v1",
              "receipt://active_control/timing_jitter_v1",
              "receipt://active_control/sector_light_crossing_sync_v1",
              "receipt://active_control/phase_noise_v1",
              "receipt://active_control/controller_phase_margin_v1",
              "receipt://active_control/controller_gain_margin_v1",
              "receipt://active_control/heat_load_v1",
              "receipt://active_control/source_tensor_contamination_v1",
              "receipt://active_control/heat_load_sink_capacity_v1",
              "receipt://active_control/energy_per_cycle_heat_limit_v1",
              "receipt://active_control/failure_mode_coverage_v1",
            ]),
            openMeasurementIds: expect.arrayContaining([
              "active_control_trace_refs",
              "switching_rate_sync",
              "active_control_bandwidth",
              "gap_control_authority",
              "gap_noise_margin",
              "timing_jitter_margin",
              "sector_light_crossing_sync",
              "phase_noise_margin",
              "controller_phase_margin",
              "controller_gain_margin",
              "active_control_heat_load",
              "active_control_source_tensor_contamination",
              "thermal_sink_capacity",
              "energy_per_cycle_heat_limit",
              "failure_mode_coverage",
            ]),
            requiredTargetAvailableCount: 15,
            requiredTargetPendingCount: 0,
            pendingTargetGaps: [],
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            requiredEvidenceArtifacts: expect.arrayContaining([
              "receipt://fatigue_lifetime/provenance_refs_v1",
              "receipt://fatigue_lifetime/cycle_count_margin_v1",
              "receipt://fatigue_lifetime/thermal_cycle_drift_v1",
              "receipt://fatigue_lifetime/creep_drift_v1",
              "receipt://fatigue_lifetime/delamination_margin_v1",
              "receipt://fatigue_lifetime/interlayer_adhesion_margin_v1",
              "receipt://layer_scaling/provenance_refs_v1",
              "receipt://layer_scaling/scaling_efficiency_v1",
              "receipt://layer_scaling/per_layer_variation_v1",
              "receipt://layer_scaling/nonadditivity_v1",
              "receipt://layer_scaling/active_area_retention_v1",
              "receipt://layer_scaling/support_coupling_status_v1",
              "receipt://layer_scaling/support_coupling_fraction_v1",
              "receipt://layer_scaling/electromagnetic_coupling_fraction_v1",
              "receipt://layer_scaling/mechanical_coupling_fraction_v1",
              "receipt://layer_scaling/effective_active_layer_count_v1",
              "receipt://layer_scaling/source_tensor_retention_v1",
              "receipt://layer_scaling/effective_source_tensor_layer_count_v1",
            ]),
            openMeasurementIds: expect.arrayContaining([
              "fatigue_provenance_refs",
              "fatigue_cycle_margin",
              "thermal_cycle_drift",
              "creep_drift",
              "delamination_margin",
              "interlayer_adhesion_margin",
              "layer_scaling_provenance_refs",
              "layer_scaling_efficiency",
              "per_layer_variation",
              "layer_nonadditivity",
              "active_area_retention",
              "support_coupling_status",
              "support_coupling_fraction",
              "electromagnetic_coupling_fraction",
              "mechanical_coupling_fraction",
              "effective_active_layer_count",
              "source_tensor_retention",
              "effective_source_tensor_layer_count",
            ]),
            requiredTargetAvailableCount: 18,
            requiredTargetPendingCount: 0,
            pendingTargetGaps: [],
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            requiredEvidenceArtifacts: expect.arrayContaining([
              "receipt://full_apparatus_tensor/tensor_value_artifact_v1",
              "receipt://full_apparatus_tensor/authority_metadata_v1",
              "receipt://full_apparatus_tensor/component_groups_v1",
              "receipt://full_apparatus_tensor/component_group_refs_v1",
              "receipt://full_apparatus_tensor/component_detail_refs_v1",
              "receipt://full_apparatus_tensor/stress_energy_term_coverage_v1",
              "receipt://full_apparatus_tensor/stress_energy_terms_v1",
              "receipt://full_apparatus_tensor/subsystem_receipt_traceability_v1",
              "receipt://full_apparatus_tensor/regional_coverage_v1",
              "receipt://full_apparatus_tensor/regional_supports_v1",
              "receipt://full_apparatus_tensor/regional_sample_counts_v1",
            ]),
            openMeasurementIds: expect.arrayContaining([
              "tensor_value_artifact",
              "tensor_authority_metadata",
              "component_group_coverage",
              "component_group_refs",
              "tensor_component_detail_refs",
              "apparatus_stress_energy_term_coverage",
              "apparatus_stress_energy_term_refs",
              "subsystem_receipt_traceability",
              "regional_tensor_coverage",
              "regional_support_refs",
              "regional_tensor_sample_counts",
            ]),
            requiredTargetAvailableCount: 11,
            requiredTargetPendingCount: 0,
            pendingTargetGaps: [],
          }),
          expect.objectContaining({
            campaignDomain: "downstream_residual_conservation_qei_observer",
            requiredEvidenceArtifacts: expect.arrayContaining([
              "artifact://nhm2/downstream-gates/regional-residual-closure-v1",
              "artifact://nhm2/downstream-gates/wall-t00-closure-v1",
              "artifact://nhm2/downstream-gates/covariant-conservation-v1",
              "artifact://nhm2/downstream-gates/qei-worldline-dossier-v1",
              "artifact://nhm2/downstream-gates/observer-family-energy-conditions-v1",
              "artifact://nhm2/downstream-gates/material-credibility-v1",
              "artifact://nhm2/downstream-gates/coupled-closure-v1",
            ]),
            openMeasurementIds: expect.arrayContaining([
              "regional_residual_closure_artifact",
              "wall_t00_closure_artifact",
              "covariant_conservation_artifact",
              "qei_worldline_dossier_artifact",
              "observer_family_energy_conditions_artifact",
              "material_credibility_artifact",
              "coupled_closure_artifact",
            ]),
            requiredTargetAvailableCount: 0,
            requiredTargetNotApplicableCount: 7,
            requiredTargetPendingCount: 0,
            pendingTargetGaps: [],
          }),
        ]),
      );
      expect(result.experimentalCampaignPackage.campaignItems).toHaveLength(7);
      expect(result.experimentalCampaignPackage.measurementDocket).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            measurementId: "coupon_stack_compatibility",
            target:
              "7 compatibility items: architecture id, load case, layer stack, topology optimization, deposition process, residual stress uniformity, and interlayer adhesion protocol",
            requiredCorrectionKey: "missingCampaignCompatibilityRefCount",
            requiredTargetKey: "requiredCampaignCompatibilityRefCount",
            requiredTargetValue: 7,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            measurementId: "coupon_tensile_stress_margin",
            target: "measured tensile stress >= 5.45707087858e8 Pa",
            requiredCorrectionKey: "tensileStressShortfallPa",
            requiredTargetKey: "tensileStressMinPa",
            requiredTargetValue: 545707087.858,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            measurementId: "coupon_fracture_yield_margin",
            target: "fracture/yield stress >= 1.09141417572e9 Pa",
            requiredCorrectionKey: "fractureOrYieldStressShortfallPa",
            requiredTargetKey: "requiredFractureOrYieldStressPa",
            requiredTargetValue: 1091414175.72,
            requiredTargetStatus: "available",
            requiredTargetGapReason: null,
            status: "missing",
            firstBlocker: "material_coupon_tier_not_measured_or_validated",
            blocksCampaignPass: true,
          }),
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            measurementId: "coupon_fatigue_cycle_margin",
            requiredCorrectionKey: "couponCycleCountShortfall",
            requiredTargetKey: "couponRequiredCycleCount",
            requiredTargetValue: 1e9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            measurementId: "coupon_cryogenic_state",
            requiredCorrectionKey: "cryogenicTemperatureReductionK",
            requiredTargetKey: "operatingTemperatureK",
            requiredTargetValue: 4,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            measurementId: "coupon_roughness_rms",
            requiredCorrectionKey: "roughnessRmsReductionMeters",
            requiredTargetKey: "roughnessRmsMaxMeters",
            requiredTargetValue: 1e-10,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "material_coupon_behavior",
            measurementId: "coupon_fabrication_tolerance",
            requiredCorrectionKey: "fabricationToleranceReductionMeters",
            requiredTargetKey: "fabricationToleranceMaxMeters",
            requiredTargetValue: 5e-10,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            measurementId: "gap_metrology_8nm",
            requiredCorrectionKey: null,
            requiredTargetKey: null,
            requiredTargetValue: null,
            requiredTargetStatus: "not_applicable",
            requiredTargetGapReason: null,
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            measurementId: "force_curve_brackets_8nm",
            requiredCorrectionKey: "suppliedForceDeltaFromIdealStackForceN",
            requiredTargetKey: "suppliedForceAbsTargetN",
            requiredTargetValue: 14188.3842843,
            requiredTargetStatus: "available",
            requiredTargetGapReason: null,
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            measurementId: "force_gradient_curve_8nm",
            requiredCorrectionKey: "forceGradientConsistencyShortfall",
            requiredTargetKey: "forceGradientConsistencyMin",
            requiredTargetValue: 0.75,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            measurementId: "stiffness_model_8nm",
            requiredCorrectionKey: "springConstantShortfallNPerM",
            requiredTargetKey: "springConstantMinNPerM",
            requiredTargetValue: 7094192142150,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            measurementId: "pull_in_margin",
            requiredCorrectionKey: "springConstantShortfallNPerM",
            requiredCorrectionValue: null,
            requiredTargetKey: "springConstantMinNPerM",
            requiredTargetValue: 7094192142150,
            requiredTargetStatus: "available",
            status: "missing",
            firstBlocker: "force_gap_tier_not_measured_or_validated",
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            measurementId: "stiction_margin",
            requiredCorrectionKey: "stictionMarginShortfall",
            requiredTargetKey: "stictionMarginMin",
            requiredTargetValue: 1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "force_gap_pull_in",
            measurementId: "active_gap_authority",
            requiredCorrectionKey: "activeGapControlAuthorityShortfallN",
            requiredCorrectionValue: null,
            requiredTargetKey: "activeGapControlAuthorityMinN",
            requiredTargetValue: 17026.0611412,
            requiredTargetStatus: "available",
            noGoCriterion: "authority margin < 1.2 or actuator authority missing",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "roughness_gap_metrology_8nm",
            requiredCorrectionKey: null,
            requiredTargetKey: null,
            requiredTargetValue: null,
            requiredTargetStatus: "not_applicable",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "roughness_map_resolution",
            requiredCorrectionKey: "roughnessMapResolutionReductionMeters",
            requiredTargetKey: "roughnessMapLateralResolutionMaxMeters",
            requiredTargetValue: 5e-10,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "roughness_scan_area",
            requiredCorrectionKey: "roughnessScanAreaFractionShortfall",
            requiredTargetKey: "roughnessScanAreaFractionMin",
            requiredTargetValue: 0.95,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "roughness_rms_margin",
            requiredCorrectionKey: "roughnessRmsReductionMeters",
            requiredTargetKey: "roughnessRmsMaxMeters",
            requiredTargetValue: 1e-10,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "asperity_p99_tail",
            requiredCorrectionKey: "asperityP99ReductionMeters",
            requiredTargetKey: "asperityP99MaxMeters",
            requiredTargetValue: 2e-9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "asperity_p999_tail",
            requiredCorrectionKey: "asperityP999ReductionMeters",
            requiredTargetKey: "asperityP999MaxMeters",
            requiredTargetValue: 3e-9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "asperity_tail_clearance",
            requiredCorrectionKey: "gapClearanceShortfallMeters",
            requiredTargetKey: "minimumGapClearanceRequiredMeters",
            requiredTargetValue: 4e-9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "patch_voltage_rms",
            requiredCorrectionKey: "patchVoltageReductionVolts",
            requiredTargetKey: "patchVoltageRmsMaxVolts",
            requiredTargetValue: 0.01,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "patch_voltage_correlation_length",
            evidenceArtifact: "receipt://roughness_patch_metrology/patch_voltage_correlation_length_v1",
            requiredCorrectionKey: "patchVoltageCorrelationLengthAvailable",
            requiredCorrectionValue: false,
            requiredTargetKey: "patchVoltageCorrelationLengthRequired",
            requiredTargetValue: true,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "patch_derived_electrostatic_fraction",
            requiredCorrectionKey: "patchVoltageDerivedElectrostaticFractionReduction",
            requiredTargetKey: "patchVoltageDerivedElectrostaticFractionMax",
            requiredTargetValue: 0.05,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "roughness_patch_potential",
            measurementId: "patch_potential_force_fraction",
            requiredCorrectionKey: "residualElectrostaticForceFractionReduction",
            requiredTargetKey: "residualElectrostaticForceFractionMax",
            requiredTargetValue: 0.05,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "active_control_trace_refs",
            requiredCorrectionKey: "missingTraceRefCount",
            requiredTargetKey: "requiredTraceRefCount",
            requiredTargetValue: 17,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "switching_rate_sync",
            requiredCorrectionKey: "switchingRateAbsDeltaHz",
            requiredTargetKey: "switchingRateTargetHz",
            requiredTargetValue: 15e9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "active_control_bandwidth",
            requiredCorrectionKey: "bandwidthShortfallHz",
            requiredTargetKey: "bandwidthMinHz",
            requiredTargetValue: 30e9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "gap_control_authority",
            requiredCorrectionKey: "gapControlAuthorityShortfallN",
            requiredTargetKey: "gapControlAuthorityMinN",
            requiredTargetValue: 17026.0611412,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "gap_noise_margin",
            requiredCorrectionKey: "gapNoiseRmsReductionMeters",
            requiredTargetKey: "gapNoiseRmsMaxMeters",
            requiredTargetValue: 8e-11,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "timing_jitter_margin",
            requiredCorrectionKey: "timingJitterReductionSeconds",
            requiredTargetKey: "timingJitterMaxSeconds",
            requiredTargetValue: 6.666666666666667e-12,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "sector_light_crossing_sync",
            requiredCorrectionKey: "lightCrossingSyncMarginShortfall",
            requiredTargetKey: "lightCrossingSyncMarginMin",
            requiredTargetValue: 1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "phase_noise_margin",
            requiredCorrectionKey: "phaseNoiseReductionSeconds",
            requiredTargetKey: "phaseNoiseMaxSeconds",
            requiredTargetValue: 3.3333333333333335e-12,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "controller_phase_margin",
            requiredCorrectionKey: "controllerPhaseMarginShortfallDegrees",
            requiredTargetKey: "controllerPhaseMarginMinDegrees",
            requiredTargetValue: 45,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "controller_gain_margin",
            requiredCorrectionKey: "controllerGainMarginShortfallDb",
            requiredTargetKey: "controllerGainMarginMinDb",
            requiredTargetValue: 6,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "active_control_heat_load",
            requiredCorrectionKey: "heatLoadShortfallW",
            requiredTargetKey: "heatSinkCapacityCriterion",
            requiredTargetValue:
              "heatSinkCapacityW >= 1.2 * max(heatLoadW, energyPerCycleJ * switchingRateHz)",
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "thermal_sink_capacity",
            requiredCorrectionKey: "heatSinkCapacityShortfallW",
            requiredTargetKey: "heatSinkCapacityCriterion",
            requiredTargetValue:
              "heatSinkCapacityW >= 1.2 * max(heatLoadW, energyPerCycleJ * switchingRateHz)",
            requiredTargetStatus: "available",
            requiredTargetGapReason: null,
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "active_control_source_tensor_contamination",
            requiredCorrectionKey: "sourceTensorContaminationFractionReduction",
            requiredTargetKey: "sourceTensorContaminationFractionMax",
            requiredTargetValue: 0.05,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "energy_per_cycle_heat_limit",
            requiredCorrectionKey: "energyPerCycleReductionJ",
            requiredTargetKey: "heatSinkCapacityCriterion",
            requiredTargetValue:
              "heatSinkCapacityW >= 1.2 * max(heatLoadW, energyPerCycleJ * switchingRateHz)",
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "active_control_energy_noise_heat_timing",
            measurementId: "failure_mode_coverage",
            requiredCorrectionKey: "missingFailureModeCount",
            requiredTargetKey: "requiredFailureModeCount",
            requiredTargetValue: 5,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "fatigue_provenance_refs",
            requiredCorrectionKey: "missingFatigueProvenanceRefCount",
            requiredTargetKey: "requiredFatigueProvenanceRefCount",
            requiredTargetValue: 8,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "fatigue_cycle_margin",
            requiredCorrectionKey: "cycleCountShortfall",
            requiredTargetKey: "cycleCountRequired",
            requiredTargetValue: 1e9,
            requiredTargetStatus: "available",
            requiredTargetGapReason: null,
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "thermal_cycle_drift",
            requiredCorrectionKey: "thermalCycleDriftReduction",
            requiredTargetKey: "thermalCycleDriftFractionMax",
            requiredTargetValue: 0.01,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "creep_drift",
            requiredCorrectionKey: "creepDriftReduction",
            requiredTargetKey: "creepDriftFractionMax",
            requiredTargetValue: 0.01,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "delamination_margin",
            requiredCorrectionKey: "delaminationMarginShortfall",
            requiredTargetKey: "delaminationMarginMin",
            requiredTargetValue: 1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "interlayer_adhesion_margin",
            requiredCorrectionKey: "interlayerAdhesionMarginShortfall",
            requiredTargetKey: "interlayerAdhesionMarginMin",
            requiredTargetValue: 1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "layer_scaling_provenance_refs",
            requiredCorrectionKey: "missingLayerScalingProvenanceRefCount",
            requiredTargetKey: "requiredLayerScalingProvenanceRefCount",
            requiredTargetValue: 9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "layer_scaling_efficiency",
            requiredCorrectionKey: "layerScalingEfficiencyShortfall",
            requiredTargetKey: "layerScalingEfficiencyMin",
            requiredTargetValue: 0.9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "per_layer_variation",
            requiredCorrectionKey: "perLayerVariationReduction",
            requiredTargetKey: "perLayerVariationFractionMax",
            requiredTargetValue: 0.05,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "layer_nonadditivity",
            requiredCorrectionKey: "layerNonadditivityReduction",
            requiredTargetKey: "layerNonadditivityFractionMax",
            requiredTargetValue: 0.1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "active_area_retention",
            requiredCorrectionKey: "activeAreaRetentionShortfall",
            requiredTargetKey: "activeAreaRetentionMin",
            requiredTargetValue: 0.6,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "support_coupling_status",
            requiredCorrectionKey: "supportCouplingStatusSatisfied",
            requiredCorrectionValue: false,
            requiredTargetKey: "supportCouplingStatusRequired",
            requiredTargetValue: "pass",
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "support_coupling_fraction",
            requiredCorrectionKey: "supportCouplingFractionReduction",
            requiredTargetKey: "supportCouplingFractionMax",
            requiredTargetValue: 0.1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "electromagnetic_coupling_fraction",
            requiredCorrectionKey: "electromagneticCouplingFractionReduction",
            requiredTargetKey: "electromagneticCouplingFractionMax",
            requiredTargetValue: 0.1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "mechanical_coupling_fraction",
            requiredCorrectionKey: "mechanicalCouplingFractionReduction",
            requiredTargetKey: "mechanicalCouplingFractionMax",
            requiredTargetValue: 0.1,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "effective_active_layer_count",
            requiredCorrectionKey: "effectiveActiveLayerCountShortfall",
            requiredTargetKey: "effectiveActiveLayerCountMin",
            requiredTargetValue: 217.242,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "fatigue_layer_scaling",
            measurementId: "effective_source_tensor_layer_count",
            requiredCorrectionKey: "effectiveSourceTensorLayerCountShortfall",
            requiredTargetKey: "effectiveSourceTensorLayerCountMin",
            requiredTargetValue: 402.3,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "tensor_value_artifact",
            requiredCorrectionKey: "tensorValueArtifactAvailable",
            requiredCorrectionValue: false,
            requiredTargetKey: "tensorValueArtifactRequired",
            requiredTargetValue: true,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "tensor_authority_metadata",
            requiredCorrectionKey: "authorityMetadataMissingCount",
            requiredCorrectionValue: 4,
            requiredTargetKey: "requiredAuthorityMetadataCount",
            requiredTargetValue: 4,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "component_group_coverage",
            requiredCorrectionKey: "componentGroupMissingCount",
            requiredCorrectionValue: 4,
            requiredTargetKey: "requiredComponentGroupCount",
            requiredTargetValue: 4,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "component_group_refs",
            requiredCorrectionKey: "componentGroupRefMissingCount",
            requiredCorrectionValue: 4,
            requiredTargetKey: "requiredComponentGroupCount",
            requiredTargetValue: 4,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "tensor_component_detail_refs",
            requiredCorrectionKey: "tensorComponentRefMissingCount",
            requiredCorrectionValue: 10,
            requiredTargetKey: "requiredTensorComponentCount",
            requiredTargetValue: 10,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "apparatus_stress_energy_term_coverage",
            requiredCorrectionKey: "stressEnergyTermMissingCount",
            requiredCorrectionValue: 9,
            requiredTargetKey: "requiredStressEnergyTermCount",
            requiredTargetValue: 9,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "apparatus_stress_energy_term_refs",
            requiredCorrectionKey: "stressEnergyTermRefMissingCount",
            requiredCorrectionValue: 9,
            requiredTargetKey: "requiredStressEnergyTermCount",
            requiredTargetValue: 9,
            requiredTargetStatus: "available",
            noGoCriterion: expect.stringContaining("support/control/electrostatic/thermal"),
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "subsystem_receipt_traceability",
            requiredCorrectionKey: "subsystemReceiptRefMissingCount",
            requiredCorrectionValue: 5,
            requiredTargetKey: "requiredSubsystemReceiptCount",
            requiredTargetValue: 5,
            requiredTargetStatus: "available",
            noGoCriterion: expect.stringContaining("upstream experimental receipt refs"),
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "regional_tensor_coverage",
            requiredCorrectionKey: "regionCoverageMissingCount",
            requiredCorrectionValue: 3,
            requiredTargetKey: "requiredRegionCount",
            requiredTargetValue: 3,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "full_apparatus_tensor",
            measurementId: "regional_support_refs",
            requiredCorrectionKey: "regionalSupportRefMissingCount",
            requiredCorrectionValue: 3,
            requiredTargetKey: "requiredRegionCount",
            requiredTargetValue: 3,
            requiredTargetStatus: "available",
          }),
          expect.objectContaining({
            campaignDomain: "downstream_residual_conservation_qei_observer",
            measurementId: "regional_residual_closure_artifact",
            evidenceArtifact: "artifact://nhm2/downstream-gates/regional-residual-closure-v1",
            requiredCorrectionKey: null,
            requiredCorrectionValue: null,
            requiredTargetKey: null,
            requiredTargetValue: null,
            requiredTargetStatus: "not_applicable",
            noGoCriterion: "regional residual closure is missing, stale, or failing",
          }),
          expect.objectContaining({
            campaignDomain: "downstream_residual_conservation_qei_observer",
            measurementId: "qei_worldline_dossier_artifact",
            evidenceArtifact: "artifact://nhm2/downstream-gates/qei-worldline-dossier-v1",
            requiredCorrectionKey: null,
            requiredCorrectionValue: null,
            requiredTargetStatus: "not_applicable",
            noGoCriterion: "QEI is scalar-only, missing, stale, failing, or lacks bound provenance",
          }),
          expect.objectContaining({
            campaignDomain: "downstream_residual_conservation_qei_observer",
            measurementId: "coupled_closure_artifact",
            evidenceArtifact: "artifact://nhm2/downstream-gates/coupled-closure-v1",
            requiredCorrectionKey: null,
            requiredCorrectionValue: null,
            requiredTargetStatus: "not_applicable",
            noGoCriterion: "coupled closure is missing, stale, false, or mixes incompatible artifacts",
          }),
        ]),
      );
      expect(
        result.experimentalCampaignPackage.campaignDomainLedger.find(
          (entry) => entry.campaignDomain === "material_coupon_behavior",
        ),
      ).toMatchObject({
        decision: "review",
        evidenceState: "missing_receipt",
        firstBlocker: "material_coupon_tier_not_measured_or_validated",
        blockerIds: expect.arrayContaining([
          "material_coupon_tier_not_measured_or_validated",
          "material_coupon:material_coupon_receipt_missing_for_operating_budget",
        ]),
        decisiveMeasurementIds: expect.arrayContaining([
          "coupon_fracture_yield_margin",
          "coupon_dielectric_response",
          "coupon_conductivity_response",
        ]),
        decisiveMeasurementStatuses: expect.arrayContaining([
          expect.objectContaining({
            measurementId: "coupon_dielectric_response",
            status: "missing",
            currentMargin: null,
            requiredCorrectionValue: false,
          }),
          expect.objectContaining({
            measurementId: "coupon_conductivity_response",
            status: "missing",
            currentMargin: null,
            requiredCorrectionValue: false,
          }),
        ]),
      });
      expect(
        result.experimentalCampaignPackage.campaignDomainLedger.find(
          (entry) => entry.campaignDomain === "campaign_coordination",
        ),
      ).toMatchObject({
        decision: "review",
        blocksCampaignPass: true,
        firstBlocker: "material_coupon_receipt_missing",
      });
      expect(
        result.experimentalCampaignPackage.campaignDomainLedger.find(
          (entry) => entry.campaignDomain === "full_apparatus_tensor",
        ),
      ).toMatchObject({
        decision: "review",
        evidenceState: "missing_receipt",
        blocksCampaignPass: true,
        blockerIds: expect.arrayContaining([
          "full_apparatus_tensor_tier_not_measured_or_validated",
          "full_apparatus_tensor:full_apparatus_T12_ref_missing_for_operating_budget",
        ]),
        decisiveMeasurementStatuses: expect.arrayContaining([
          expect.objectContaining({
            measurementId: "tensor_value_artifact",
            requiredCorrectionValue: false,
            status: "missing",
          }),
          expect.objectContaining({
            measurementId: "tensor_authority_metadata",
            requiredCorrectionValue: 4,
            status: "missing",
          }),
          expect.objectContaining({
            measurementId: "tensor_component_detail_refs",
            requiredCorrectionValue: 10,
            status: "missing",
          }),
          expect.objectContaining({
            measurementId: "apparatus_stress_energy_term_refs",
            requiredCorrectionValue: 9,
            status: "missing",
          }),
          expect.objectContaining({
            measurementId: "regional_support_refs",
            requiredCorrectionValue: 3,
            status: "missing",
          }),
        ]),
      });
      expect(result.experimentalCampaignPackage.objectiveCoverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            objectiveId: "material_coupon_receipts",
            status: "ready_for_evidence",
            openMeasurementIds: expect.arrayContaining([
              "coupon_fracture_yield_margin",
              "coupon_dielectric_response",
              "coupon_conductivity_response",
            ]),
          }),
          expect.objectContaining({
            objectiveId: "full_apparatus_tensor_receipts",
            status: "ready_for_evidence",
            blockerIds: expect.arrayContaining([
              "full_apparatus_tensor_tier_not_measured_or_validated",
            ]),
          }),
          expect.objectContaining({
            objectiveId: "source_side_same_basis_authority",
            status: "ready_for_evidence",
            openMeasurementIds: ["same_basis_authority_handoff"],
          }),
          expect.objectContaining({
            objectiveId: "downstream_gate_readiness",
            status: "blocked_by_downstream",
            openMeasurementIds: expect.arrayContaining([
              "regional_residual_closure",
              "observer_family_energy_conditions",
            ]),
          }),
          expect.objectContaining({
            objectiveId: "falsification_map",
            status: "satisfied",
          }),
        ]),
      );
      expect(result.experimentalCampaignPackage.currentBlocker.decisiveMeasurements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            measurementId: "coupon_fracture_yield_margin",
            evidenceArtifact: "receipt://material_coupon/fracture_yield_margin_v1",
          }),
        ]),
      );
      expect(result.experimentalCampaignPackage.campaignItems[0]).toMatchObject({
        campaignDomain: "material_coupon_behavior",
        firstBlocker: "material_coupon_tier_not_measured_or_validated",
        nextEvidenceArtifact: "receipt://material_coupon/provenance_v1",
        status: "ready_for_receipt",
        measurementStatuses: expect.arrayContaining([
          expect.objectContaining({
            measurementId: "coupon_fracture_yield_margin",
            evidenceArtifact: "receipt://material_coupon/fracture_yield_margin_v1",
            status: "missing",
            currentMargin: null,
          }),
          expect.objectContaining({
            measurementId: "coupon_dielectric_response",
            evidenceArtifact: "receipt://material_coupon/dielectric_response_v1",
            status: "missing",
            currentMargin: null,
            requiredCorrectionValue: false,
          }),
          expect.objectContaining({
            measurementId: "coupon_conductivity_response",
            evidenceArtifact: "receipt://material_coupon/conductivity_v1",
            status: "missing",
            currentMargin: null,
            requiredCorrectionValue: false,
          }),
        ]),
        decisiveMeasurements: expect.arrayContaining([
          expect.objectContaining({
            measurementId: "coupon_dielectric_response",
            evidenceArtifact: "receipt://material_coupon/dielectric_response_v1",
          }),
          expect.objectContaining({
            measurementId: "coupon_conductivity_response",
            evidenceArtifact: "receipt://material_coupon/conductivity_v1",
          }),
        ]),
      });
      expect(result.experimentalCampaignPackage.claimBoundary.packageDoesNotSupplyEvidence).toBe(
        true,
      );
      expect(result.experimentalCampaignPackage.summary.physicalViabilityClaimAllowed).toBe(false);
      expect(result.materialCouponTestPlan.summary.nextRequiredTestId).toBe("coupon_provenance");
      expect(result.materialCouponTestPlan.summary.openTestCount).toBeGreaterThan(0);
      expect(result.materialCouponOperatingBudget.summary.firstBlocker).toBe(
        "material_coupon_receipt_missing_for_operating_budget",
      );
      expect(result.materialCouponOperatingBudget.operatingTargets.requiredFractureOrYieldStressPa).toBeCloseTo(
        1.091414175716e9,
      );
      expect(result.forceGapPullInTestPlan.summary.nextRequiredTestId).toBe("force_gap_provenance");
      expect(result.forceGapPullInTestPlan.summary.openTestCount).toBeGreaterThan(0);
      expect(result.forceGapLoadBudget.summary.firstBlocker).toBe(
        "force_gap_receipt_missing_for_load_budget",
      );
      expect(result.forceGapLoadBudget.idealLoadBudget.forceScaleKilonewtons).toBeCloseTo(14.17, 1);
      expect(result.roughnessPatchTestPlan.summary.nextRequiredTestId).toBe("roughness_patch_provenance");
      expect(result.roughnessPatchTestPlan.summary.openTestCount).toBeGreaterThan(0);
      expect(result.roughnessPatchOperatingBudget.summary.firstBlocker).toBe(
        "roughness_patch_receipt_missing_for_operating_budget",
      );
      expect(
        result.roughnessPatchOperatingBudget.operatingTargets.residualElectrostaticForceMaxN,
      ).toBeCloseTo(709.419, 2);
      expect(result.activeControlTestPlan.summary.nextRequiredTestId).toBe("active_control_provenance");
      expect(result.activeControlTestPlan.summary.openTestCount).toBeGreaterThan(0);
      expect(result.activeControlOperatingBudget.summary.firstBlocker).toBe(
        "active_control_receipt_missing_for_operating_budget",
      );
      expect(result.activeControlOperatingBudget.operatingTargets.bandwidthMinHz).toBe(30e9);
      expect(result.fatigueLayerScalingTestPlan.summary.nextRequiredTestId).toBe("fatigue_scaling_provenance");
      expect(result.fatigueLayerScalingTestPlan.summary.openTestCount).toBeGreaterThan(0);
      expect(result.fatigueLayerScalingOperatingBudget.summary.firstBlocker).toBe(
        "fatigue_layer_scaling_receipt_missing_for_operating_budget",
      );
      expect(
        result.fatigueLayerScalingOperatingBudget.operatingTargets.effectiveActiveLayerCountMin,
      ).toBeCloseTo(217.242, 3);
      expect(result.fullApparatusTensorTestPlan.summary.nextRequiredTestId).toBe("full_apparatus_tensor_provenance");
      expect(result.fullApparatusTensorTestPlan.summary.openTestCount).toBeGreaterThan(0);
      expect(result.fullApparatusTensorOperatingBudget.summary.firstBlocker).toBe(
        "full_apparatus_tensor_receipt_missing_for_operating_budget",
      );
      expect(result.fullApparatusTensorOperatingBudget.operatingTargets.requiredTermCount).toBe(9);
      expect(result.evidenceGapRoadmap.roadmapItems[0]?.decisionQuestion).toContain("ultra-high-stress TiN");
      expect(materialSurface?.status).toBe("missing");
      expect(materialSurface?.blockers).toContain("material_coupon_tier_not_measured_or_validated");
      expect(result.materialEvidenceReceipts.falsificationMap.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("lets the campaign package consume source-side authority blockers after handoff", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const operatingBudgetReadiness = buildPassingOperatingBudgetReadiness(receipts);
    const physicalValidationPlan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
      downstreamGateStatuses: allDownstreamPass,
      downstreamGateArtifactRefs: allDownstreamArtifactRefs,
    });
    const evidenceGapRoadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan,
      operatingBudgetReadiness,
      materialEvidenceReceiptsRef: "material-evidence.json",
      physicalValidationPlanRef: "physical-validation-plan.json",
      operatingBudgetReadinessRef: "operating-budget-readiness.json",
    });
    const baseFalsificationReport = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan,
      evidenceGapRoadmap,
      operatingBudgetReadiness,
      materialEvidenceReceiptsRef: "material-evidence.json",
      physicalValidationPlanRef: "physical-validation-plan.json",
      evidenceGapRoadmapRef: "evidence-gap-roadmap.json",
      operatingBudgetReadinessRef: "operating-budget-readiness.json",
    });
    const authorityHandoff = buildNhm2TileSourceAuthorityHandoff({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan,
      falsificationReport: baseFalsificationReport,
      operatingBudgetReadiness,
      materialEvidenceReceiptsRef: "material-evidence.json",
      physicalValidationPlanRef: "physical-validation-plan.json",
      falsificationReportRef: "falsification-report.json",
      operatingBudgetReadinessRef: "operating-budget-readiness.json",
    });
    const sourceAuthority = blockedSourceAuthority();
    const authorityAwareFalsificationReport = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan,
      evidenceGapRoadmap,
      operatingBudgetReadiness,
      sourceSideSameBasisTensorAuthority: sourceAuthority,
      materialEvidenceReceiptsRef: "material-evidence.json",
      physicalValidationPlanRef: "physical-validation-plan.json",
      evidenceGapRoadmapRef: "evidence-gap-roadmap.json",
      operatingBudgetReadinessRef: "operating-budget-readiness.json",
      sourceSideSameBasisTensorAuthorityRef: "source-authority.json",
    });
    const experimentalCampaignPackage = buildNhm2TileSourceExperimentalCampaignPackage({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan,
      evidenceGapRoadmap,
      falsificationReport: authorityAwareFalsificationReport,
      authorityHandoff,
      sourceSideSameBasisTensorAuthority: sourceAuthority,
      materialEvidenceReceiptsRef: "material-evidence.json",
      physicalValidationPlanRef: "physical-validation-plan.json",
      evidenceGapRoadmapRef: "evidence-gap-roadmap.json",
      falsificationReportRef: "falsification-report.json",
      authorityHandoffRef: "authority-handoff.json",
      sourceSideSameBasisTensorAuthorityRef: "source-authority.json",
    });
    const sourceObjective = experimentalCampaignPackage.objectiveCoverage.find(
      (coverage) => coverage.objectiveId === "source_side_same_basis_authority",
    );

    expect(isNhm2TileSourceExperimentalCampaignPackage(experimentalCampaignPackage)).toBe(true);
    expect(authorityHandoff.summary.handoffReadyForSameBasisAuthority).toBe(true);
    expect(experimentalCampaignPackage.summary.sourceSideAuthorityAvailable).toBe(true);
    expect(experimentalCampaignPackage.summary.sourceSideAuthorityReady).toBe(false);
    expect(experimentalCampaignPackage.summary.allEvidenceObjectivesSatisfied).toBe(false);
    expect(experimentalCampaignPackage.sourceRefs.sourceSideSameBasisTensorAuthorityRef).toBe(
      "source-authority.json",
    );
    expect(sourceObjective).toMatchObject({
      status: "ready_for_evidence",
      requiredArtifactRefs: expect.arrayContaining(["source-authority.json"]),
      blockerIds: expect.arrayContaining(["T12:full_apparatus_term_missing"]),
      openMeasurementIds: expect.arrayContaining(["wall:T12", "source_side_authority_blockers"]),
    });
  });

  it("builds an evidence-gap roadmap that prioritizes falsifying force-gap evidence", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      materialCoupon: passingEvidence.materialCoupon,
      forceGapPullIn: {
        evidenceTier: "measured",
        evidenceRef: "receipt://force-gap/failing-8nm-v1",
        ...forceGapProtocolRefs,
        forceGapCurveRef: "receipt://force-gap/failing-Fg-curve-v1",
        forceGradientCurveRef: "receipt://force-gap/failing-dFdg-curve-v1",
        stiffnessModelRef: "receipt://force-gap/failing-stiffness-model-v1",
        gapMeters: 8e-9,
        casimirForceN: 1.42e4,
        forceGradientNPerM: 3e6,
        effectiveSpringConstantNPerM: 1e6,
        stictionMargin: 0.8,
        activeGapControlAuthorityN: 1e4,
      },
    });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
      physicalValidationPlanRef: "artifact://validation-plan",
    });
    const forceGap = roadmap.roadmapItems.find((item) => item.itemId === "force_gap_pull_in");

    expect(isNhm2TileSourceEvidenceGapRoadmap(roadmap)).toBe(true);
    expect(roadmap.summary.currentDisposition).toBe("falsified");
    expect(roadmap.summary.nextBestItemId).toBe("force_gap_pull_in");
    expect(roadmap.summary.falsifyingItemCount).toBeGreaterThan(0);
    expect(forceGap?.status).toBe("falsifying");
    expect(forceGap?.noGoCriteria).toContain("pull-in margin below 1");
    expect(forceGap?.numericalMargins.pullInMargin).toBeLessThan(1);
    expect(roadmap.claimBoundary.roadmapDoesNotSupplyEvidence).toBe(true);
    expect(roadmap.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("builds a falsification report for missing evidence without calling it a physical pass", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
      physicalValidationPlanRef: "artifact://validation-plan",
    });
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: receipts,
    });
    const operatingBudgetReadiness = buildNhm2TileSourceOperatingBudgetReadiness({
      generatedAt,
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
      }),
      forceGapLoadBudget,
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        forceGapLoadBudget,
      }),
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        forceGapLoadBudget,
      }),
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
      }),
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
      }),
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
      physicalValidationPlanRef: "artifact://validation-plan",
      evidenceGapRoadmapRef: "artifact://roadmap",
      operatingBudgetReadinessRef: "artifact://operating-budget-readiness",
    });
    const operatingBudgetRow = report.blockerRows.find(
      (row) =>
        row.blockerId ===
        "material_coupon:material_coupon_receipt_missing_for_operating_budget",
    );
    const materialDomain = report.campaignDomainSummary.find(
      (entry) => entry.campaignDomain === "material_coupon_behavior",
    );
    const forceGapDomain = report.campaignDomainSummary.find(
      (entry) => entry.campaignDomain === "force_gap_pull_in",
    );
    const materialDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "material_coupon_behavior",
    );
    const tensorDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );
    const firstResolutionItem = report.frontierResolutionQueue[0];
    const tensorResolutionItem = report.frontierResolutionQueue.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );

    expect(isNhm2TileSourceFalsificationReport(report)).toBe(true);
    const staleReport = {
      ...report,
      currentBlocker: { ...report.currentBlocker },
    } as typeof report & { currentBlocker: Record<string, unknown> };
    delete staleReport.currentBlocker.decisiveMeasurements;
    expect(isNhm2TileSourceFalsificationReport(staleReport)).toBe(false);
    expect(report.disposition.reportStatus).toBe("review");
    expect(report.disposition.firstBlocker).toBe("material_coupon_receipt_missing");
    expect(report.currentBlocker).toMatchObject({
      blockerId: "material_coupon_receipt_missing",
      source: "material_evidence_receipts",
      surfaceId: "material_coupon",
      operatingBudgetSurfaceId: null,
      downstreamGateId: null,
      campaignDomain: "material_coupon_behavior",
      evidenceTarget: expect.stringContaining("ultra-high-stress TiN"),
      requiredChange: expect.stringContaining("Supply measured or validated coupon data"),
      falsifiesCurrentCandidate: false,
    });
    expect(report.currentBlocker.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "coupon_fracture_yield_margin",
          evidenceArtifact: "receipt://material_coupon/fracture_yield_margin_v1",
        }),
        expect.objectContaining({
          measurementId: "coupon_dielectric_response",
          evidenceArtifact: "receipt://material_coupon/dielectric_response_v1",
        }),
        expect.objectContaining({
          measurementId: "coupon_conductivity_response",
          evidenceArtifact: "receipt://material_coupon/conductivity_v1",
        }),
      ]),
    );
    expect(report.summary.missingReceiptCount).toBe(7);
    expect(report.summary.failingReceiptCount).toBe(0);
    expect(report.summary.operatingBudgetBlockerCount).toBeGreaterThan(0);
    expect(report.summary.nextRequiredSurfaceId).toBe("material_coupon");
    expect(report.summary.nextRequiredChange).toContain("ultra-high-stress TiN");
    expect(report.campaignDomainSummary.length).toBeGreaterThanOrEqual(8);
    expect(materialDomain).toMatchObject({
      blockerCount: expect.any(Number),
      firstBlocker: "material_coupon_receipt_missing",
      evidenceTarget: expect.stringContaining("candidate-stack coupon behavior"),
    });
    expect(materialDomain?.blockerCount).toBeGreaterThan(0);
    expect(materialDomain?.reviewBlockerCount).toBeGreaterThan(0);
    expect(forceGapDomain?.firstBlocker).toBe(
      "force_gap_curve_and_pull_in_margin_at_8nm_missing",
    );
    expect(forceGapDomain?.evidenceTarget).toContain("8 nm force-gap receipt");
    expect(materialDecision).toMatchObject({
      decision: "review",
      evidenceState: "missing_receipt",
      firstBlocker: "material_coupon_receipt_missing",
      blocksCampaignPass: true,
      prevents: expect.arrayContaining(["full_apparatus_tensor", "material_credibility_gate"]),
    });
    expect(materialDecision?.claimBoundary.decisionMatrixDoesNotSupplyEvidence).toBe(true);
    expect(tensorDecision).toMatchObject({
      decision: "review",
      evidenceState: "missing_receipt",
      blocksCampaignPass: true,
      prevents: expect.arrayContaining(["source_side_same_basis_authority"]),
    });
    expect(firstResolutionItem).toMatchObject({
      rank: 1,
      campaignDomain: "material_coupon_behavior",
      decision: "review",
      evidenceState: "missing_receipt",
      resolutionMode: "supply_experimental_receipt",
      firstBlocker: "material_coupon_receipt_missing",
      blocksCampaignPass: true,
    });
    expect(firstResolutionItem?.requiredChange).toContain("Supply measured or validated coupon data");
    expect(firstResolutionItem?.nextEvidenceArtifact).toBe(
      "receipt://material_coupon/provenance_v1",
    );
    expect(firstResolutionItem?.measurementTargetSummary).toContain(
      "fracture/yield target is at least 2x",
    );
    expect(firstResolutionItem?.falsificationRule).toContain("447-layer TiN stack");
    expect(firstResolutionItem?.claimBoundary.resolutionQueueDoesNotSupplyEvidence).toBe(true);
    expect(tensorResolutionItem).toMatchObject({
      campaignDomain: "full_apparatus_tensor",
      resolutionMode: "supply_experimental_receipt",
      prevents: expect.arrayContaining(["source_side_same_basis_authority"]),
    });
    expect(tensorResolutionItem?.nextEvidenceArtifact).toBe(
      "receipt://full_apparatus_tensor/provenance_v1",
    );
    expect(tensorResolutionItem?.measurementTargetSummary).toContain("10 component refs");
    expect(tensorResolutionItem?.falsificationRule).toContain("T0i/off-diagonal Tij");
    expect(report.readiness.materialEvidenceReady).toBe(false);
    expect(report.readiness.operatingBudgetsReady).toBe(false);
    expect(report.readiness.physicallyCredibleSourceCandidate).toBe(false);
    expect(report.blockerRows.some((row) => row.blockerId === "material_coupon_receipt_missing")).toBe(true);
    expect(operatingBudgetRow?.source).toBe("operating_budget_readiness");
    expect(operatingBudgetRow?.operatingBudgetSurfaceId).toBe("material_coupon");
    expect(operatingBudgetRow?.campaignDomain).toBe("material_coupon_behavior");
    expect(operatingBudgetRow?.evidenceTarget).toContain("candidate-stack coupon behavior");
    expect(operatingBudgetRow?.numericalMargins).toMatchObject({
      tensileStressMargin: null,
      fractureOrYieldStressMargin: null,
      roughnessRmsMargin: null,
    });
    expect(operatingBudgetRow?.requiredChange).toContain("material_coupon operating evidence");
    expect(report.claimBoundary.reportDoesNotSupplyEvidence).toBe(true);
    expect(report.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("points the falsification report current blocker at operating-budget evidence when receipts are present", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const operatingBudgetReadiness = buildNhm2TileSourceOperatingBudgetReadiness({
      generatedAt,
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
      }),
      forceGapLoadBudget: buildNhm2TileSourceForceGapLoadBudget({ generatedAt }),
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        generatedAt,
      }),
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        generatedAt,
      }),
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
      }),
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
      }),
    });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      operatingBudgetReadiness,
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
    });

    expect(isNhm2TileSourceFalsificationReport(report)).toBe(true);
    expect(report.summary.nextRequiredSurfaceId).toBe("material_coupon");
    expect(report.summary.nextRequiredChange).toContain("447-layer support stress");
    expect(roadmap.summary.operatingBudgetsReady).toBe(false);
    expect(roadmap.summary.nextBestItemId).toBe("material_coupon");
    expect(roadmap.roadmapItems[0]?.operatingBudgetSurfaceId).toBe("material_coupon");
    expect(roadmap.roadmapItems[0]?.operatingBudgetReady).toBe(false);
    expect(roadmap.roadmapItems[0]?.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "coupon_fracture_yield_margin",
          evidenceArtifact: "receipt://material_coupon/fracture_yield_margin_v1",
          marginKey: "fractureOrYieldStressMargin",
          requiredCorrectionKey: "fractureOrYieldStressShortfallPa",
          currentMargin: null,
          target: expect.stringContaining("1.09141417572e9 Pa"),
          falsificationConsequence: expect.stringContaining("mechanically inadmissible"),
        }),
        expect.objectContaining({
          measurementId: "coupon_dielectric_response",
          evidenceArtifact: "receipt://material_coupon/dielectric_response_v1",
          currentMargin: null,
          requiredCorrectionValue: false,
        }),
        expect.objectContaining({
          measurementId: "coupon_conductivity_response",
          evidenceArtifact: "receipt://material_coupon/conductivity_v1",
          currentMargin: null,
          requiredCorrectionValue: false,
        }),
      ]),
    );
    expect(roadmap.roadmapItems[0]?.requiredCorrections).toMatchObject({
      missingCurveAndMapRefCount: 7,
      missingMaterialResponseRefCount: 2,
    });
    expect(report.currentBlocker).toMatchObject({
      blockerId: "material_coupon:material_coupon_receipt_missing_for_operating_budget",
      source: "operating_budget_readiness",
      surfaceId: null,
      operatingBudgetSurfaceId: "material_coupon",
      downstreamGateId: null,
      requiredChange: expect.stringContaining("material_coupon operating evidence"),
      falsifiesCurrentCandidate: false,
    });
    expect(report.currentBlocker.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "coupon_fracture_yield_margin",
          evidenceArtifact: "receipt://material_coupon/fracture_yield_margin_v1",
          currentMargin: null,
        }),
        expect.objectContaining({
          measurementId: "coupon_dielectric_response",
          evidenceArtifact: "receipt://material_coupon/dielectric_response_v1",
          currentMargin: null,
          requiredCorrectionValue: false,
        }),
        expect.objectContaining({
          measurementId: "coupon_conductivity_response",
          evidenceArtifact: "receipt://material_coupon/conductivity_v1",
          currentMargin: null,
          requiredCorrectionValue: false,
        }),
      ]),
    );
    expect(report.currentBlocker.numericalMargins).toMatchObject({
      tensileStressMargin: null,
      fractureOrYieldStressMargin: null,
      roughnessRmsMargin: null,
    });
    expect(report.currentBlocker.requiredCorrections).toMatchObject({
      materialMismatch: true,
      tensileStressShortfallPa: null,
      requiredCurveAndMapRefCount: 7,
      missingCurveAndMapRefCount: 7,
      requiredMaterialResponseRefCount: 2,
      missingMaterialResponseRefCount: 2,
      dielectricResponseReceiptComplete: false,
      conductivityReceiptComplete: false,
      materialResponseNumericValuesAvailable: false,
    });
    expect(report.currentBlocker.requiredChange).toContain("corrections:");
    expect(report.currentBlocker.requiredChange).toContain("missingCurveAndMapRefCount=7");
    expect(report.correctionSummary).toMatchObject({
      "material_coupon.missingCurveAndMapRefCount": 7,
      "material_coupon.missingMaterialResponseRefCount": 2,
      "full_apparatus_tensor.tensorComponentRefMissingCount": 10,
    });
    expect(report.frontierResolutionQueue[0]).toMatchObject({
      campaignDomain: "material_coupon_behavior",
      evidenceState: "missing_receipt",
      resolutionMode: "supply_experimental_receipt",
      nextEvidenceArtifact: "receipt://material_coupon/provenance_v1",
      measurementTargetSummary: expect.stringContaining("TiN/candidate-stack coupon"),
      falsificationRule: expect.stringContaining("447-layer TiN stack"),
      requiredCorrections: expect.objectContaining({
        "material_coupon.missingCurveAndMapRefCount": 7,
        "material_coupon.missingMaterialResponseRefCount": 2,
        "material_coupon.dielectricResponseReceiptComplete": false,
        "material_coupon.conductivityReceiptComplete": false,
      }),
      decisiveMeasurements: expect.arrayContaining([
        expect.objectContaining({
          measurementId: "coupon_fracture_yield_margin",
          evidenceArtifact: "receipt://material_coupon/fracture_yield_margin_v1",
          target: expect.stringContaining("1.09141417572e9 Pa"),
        }),
        expect.objectContaining({
          measurementId: "coupon_dielectric_response",
          requiredCorrectionValue: false,
        }),
        expect.objectContaining({
          measurementId: "coupon_conductivity_response",
          requiredCorrectionValue: false,
        }),
      ]),
    });
    expect(report.readiness.materialEvidenceReady).toBe(true);
    expect(report.readiness.operatingBudgetsReady).toBe(false);
    expect(report.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("emits decisive go/no-go measurement rows for force-gap and full apparatus roadmap items", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts();
    const operatingBudgetReadiness = buildNhm2TileSourceOperatingBudgetReadiness({
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
      }),
      forceGapLoadBudget: buildNhm2TileSourceForceGapLoadBudget({
        generatedAt,
      }),
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        generatedAt,
      }),
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        generatedAt,
      }),
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
      }),
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
      }),
    });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      operatingBudgetReadiness,
    });

    const forceGap = roadmap.roadmapItems.find((item) => item.itemId === "force_gap_pull_in");
    const fullTensor = roadmap.roadmapItems.find(
      (item) => item.itemId === "full_apparatus_tensor",
    );

    expect(forceGap?.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "gap_metrology_8nm",
          evidenceArtifact: "receipt://force_gap_pull_in/gap_metrology_8nm_v1",
          target: "gap metrology ref tied to 8e-9 m operating point",
        }),
        expect.objectContaining({
          measurementId: "force_curve_brackets_8nm",
          evidenceArtifact: "receipt://force_gap_pull_in/force_gap_curve_8nm_v1",
          requiredCorrectionKey: "suppliedForceDeltaFromIdealStackForceN",
          target: expect.stringContaining("absolute force matches the 447-layer load budget"),
        }),
        expect.objectContaining({
          measurementId: "force_gradient_curve_8nm",
          evidenceArtifact: "receipt://force_gap_pull_in/force_gradient_8nm_v1",
          requiredCorrectionKey: "forceGradientConsistencyShortfall",
          target: "force-gradient consistency margin >= 0.75",
        }),
        expect.objectContaining({
          measurementId: "stiffness_model_8nm",
          evidenceArtifact: "receipt://force_gap_pull_in/stiffness_model_8nm_v1",
          requiredCorrectionKey: "springConstantShortfallNPerM",
          target: "effective stiffness >= ideal force-gradient requirement",
        }),
        expect.objectContaining({
          measurementId: "pull_in_margin",
          evidenceArtifact: "receipt://force_gap_pull_in/pull_in_margin_8nm_v1",
          target: "pull-in margin >= 1",
          noGoCriterion: "pull-in margin < 1",
          falsificationConsequence: expect.stringContaining("gap collapses"),
        }),
        expect.objectContaining({
          measurementId: "stiction_margin",
          evidenceArtifact: "receipt://force_gap_pull_in/stiction_margin_8nm_v1",
          requiredCorrectionKey: "stictionMarginShortfall",
          target: "stiction margin >= 1",
        }),
        expect.objectContaining({
          measurementId: "active_gap_authority",
          requiredCorrectionKey: "activeGapControlAuthorityShortfallN",
          target: "active authority >= 1.2x absolute stack load",
        }),
      ]),
    );
    expect(fullTensor?.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "tensor_value_artifact",
          currentMargin: false,
          requiredCorrectionValue: false,
          evidenceArtifact: "receipt://full_apparatus_tensor/tensor_value_artifact_v1",
          falsificationConsequence: expect.stringContaining("no tensor object to consume"),
        }),
        expect.objectContaining({
          measurementId: "tensor_component_detail_refs",
          currentMargin: false,
          requiredCorrectionValue: 10,
          evidenceArtifact: "receipt://full_apparatus_tensor/component_detail_refs_v1",
          falsificationConsequence: expect.stringContaining(
            "source-side same-basis tensor authority cannot pass",
          ),
        }),
        expect.objectContaining({
          measurementId: "apparatus_stress_energy_term_refs",
          requiredCorrectionKey: "stressEnergyTermRefMissingCount",
          target: expect.stringContaining("9 term refs"),
        }),
        expect.objectContaining({
          measurementId: "subsystem_receipt_traceability",
          requiredCorrectionKey: "subsystemReceiptRefMissingCount",
          target: expect.stringContaining("material coupon"),
        }),
      ]),
    );
    expect(roadmap.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("adds same-basis source authority blockers to the full-apparatus falsification map", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      downstreamGateStatuses: allDownstreamPass,
    });
    const operatingBudgetReadiness = buildPassingOperatingBudgetReadiness(receipts);
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      operatingBudgetReadiness,
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
      sourceSideSameBasisTensorAuthority: blockedSourceAuthority(),
      sourceSideSameBasisTensorAuthorityRef: "artifact://source-authority",
    });
    const sourceAuthorityRow = report.blockerRows.find(
      (row) => row.blockerId === "wall:T12:full_apparatus_term_missing",
    );
    const tensorDomain = report.campaignDomainSummary.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );
    const tensorDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );
    const tensorResolutionItem = report.frontierResolutionQueue.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );

    expect(isNhm2TileSourceFalsificationReport(report)).toBe(true);
    expect(report.disposition.reportStatus).toBe("receipt_ready_pending_downstream");
    expect(report.readiness.sourceAuthorityEvidenceReady).toBe(false);
    expect(sourceAuthorityRow).toMatchObject({
      source: "source_side_same_basis_authority",
      surfaceId: "full_apparatus_tensor",
      campaignDomain: "full_apparatus_tensor",
      status: "review",
      requiredChange: expect.stringContaining("wall"),
      evidenceRef: "artifact://full-apparatus-tensor-values#wall",
    });
    expect(sourceAuthorityRow?.numericalMargins).toMatchObject({
      hasFullTensorComponents: false,
      notDerivedFromMetricRequiredTensor: true,
      allRequiredRegionsAuthoritative: false,
      tileSourceHandoffReady: true,
    });
    expect(sourceAuthorityRow?.requiredCorrections).toMatchObject({
      missingFullApparatusTensorComponentRefs: ["wall:T12"],
    });
    expect(tensorDomain?.firstBlocker).toBe("wall:T12:full_apparatus_term_missing");
    expect(tensorDecision).toMatchObject({
      decision: "review",
      evidenceState: "source_authority_blocked",
      firstBlocker: "wall:T12:full_apparatus_term_missing",
      requiredCorrectionKeys: expect.arrayContaining([
        "full_apparatus_tensor.missingFullApparatusTensorComponentRefs",
      ]),
      prevents: expect.arrayContaining([
        "regional_residual_closure",
        "qei_worldline_dossier",
        "observer_robustness",
      ]),
      blocksCampaignPass: true,
    });
    expect(tensorResolutionItem).toMatchObject({
      campaignDomain: "full_apparatus_tensor",
      evidenceState: "source_authority_blocked",
      resolutionMode: "supply_same_basis_full_apparatus_tensor",
      firstBlocker: "wall:T12:full_apparatus_term_missing",
      blockerIds: expect.arrayContaining(["wall:T12:full_apparatus_term_missing"]),
      nextEvidenceArtifact: "receipt://full_apparatus_tensor/component_detail_refs_v1",
      measurementTargetSummary: expect.stringContaining(
        "nhm2_tile_source_full_apparatus_tensor_values/v1",
      ),
      falsificationRule: expect.stringContaining("source-side same-basis T_munu"),
      requiredCorrections: expect.objectContaining({
        "full_apparatus_tensor.missingFullApparatusTensorComponentRefs": ["wall:T12"],
      }),
      decisiveMeasurements: expect.arrayContaining([
        expect.objectContaining({
          measurementId: "tensor_component_detail_refs",
          evidenceArtifact: "receipt://full_apparatus_tensor/component_detail_refs_v1",
          falsificationConsequence: expect.stringContaining(
            "source-side same-basis tensor authority cannot pass",
          ),
        }),
        expect.objectContaining({
          measurementId: "regional_support_refs",
          target: expect.stringContaining("wall, hull, and exterior_shell"),
        }),
      ]),
      prevents: expect.arrayContaining(["regional_residual_closure"]),
    });
    expect(report.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("surfaces under-sampled full-apparatus tensor regions as campaign falsification blockers", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      downstreamGateStatuses: allDownstreamPass,
    });
    const sparseTensorBudget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: {
        ...passingEvidence.fullApparatusTensor!,
        regionalSampleCounts: {
          wall: 128,
          hull: 256,
          exteriorShell: 300,
        },
      },
    });
    const operatingBudgetReadiness = buildPassingOperatingBudgetReadiness(receipts, {
      fullApparatusTensorOperatingBudget: sparseTensorBudget,
      fullApparatusTensorOperatingBudgetRef:
        "artifact://full-apparatus-tensor-budget-sparse-regions",
    });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      operatingBudgetReadiness,
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
      operatingBudgetReadinessRef: "artifact://operating-budget-readiness",
    });
    const sparseSampleBlocker =
      "full_apparatus_tensor:full_apparatus_wall_region_sample_count_below_447_for_operating_budget";
    const tensorRow = report.blockerRows.find(
      (row) => row.blockerId === sparseSampleBlocker,
    );
    const tensorDomain = report.campaignDomainSummary.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );
    const tensorDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );
    const tensorResolutionItem = report.frontierResolutionQueue.find(
      (entry) => entry.campaignDomain === "full_apparatus_tensor",
    );
    const tensorRoadmapItem = roadmap.roadmapItems.find(
      (entry) => entry.itemId === "full_apparatus_tensor",
    );

    expect(isNhm2TileSourceOperatingBudgetReadiness(operatingBudgetReadiness)).toBe(
      true,
    );
    expect(operatingBudgetReadiness.summary.allOperatingBudgetsReady).toBe(false);
    expect(operatingBudgetReadiness.summary.firstBlocker).toBe(sparseSampleBlocker);
    expect(sparseTensorBudget.derivedOperatingBudget.regionalSampleCountsComplete).toBe(
      true,
    );
    expect(
      sparseTensorBudget.derivedOperatingBudget.regionalSampleCountsMeetMinimum,
    ).toBe(false);
    expect(sparseTensorBudget.requiredCorrections).toMatchObject({
      regionalTensorSampleCountMin: 447,
      regionalSampleCountBelowMinimumCount: 3,
      regionalSampleCountBelowMinimumIds: ["wall", "hull", "exteriorShell"],
      wallRegionalSampleCountShortfall: 319,
      hullRegionalSampleCountShortfall: 191,
      exteriorShellRegionalSampleCountShortfall: 147,
    });
    expect(tensorRow).toMatchObject({
      blockerId: sparseSampleBlocker,
      source: "operating_budget_readiness",
      operatingBudgetSurfaceId: "full_apparatus_tensor",
      campaignDomain: "full_apparatus_tensor",
      status: "falsifying",
      numericalMargins: expect.objectContaining({
        regionalSampleCountsComplete: true,
        regionalSampleCountsMeetMinimum: false,
      }),
      requiredCorrections: expect.objectContaining({
        regionalTensorSampleCountMin: 447,
        regionalSampleCountBelowMinimumCount: 3,
        regionalSampleCountBelowMinimumIds: ["wall", "hull", "exteriorShell"],
        wallRegionalSampleCountShortfall: 319,
        hullRegionalSampleCountShortfall: 191,
        exteriorShellRegionalSampleCountShortfall: 147,
      }),
      evidenceRef: "artifact://full-apparatus-tensor-budget-sparse-regions",
    });
    expect(tensorDomain).toMatchObject({
      firstBlocker: sparseSampleBlocker,
      falsifyingBlockerCount: 3,
      evidenceTarget: expect.stringContaining("Full apparatus source tensor receipt"),
    });
    expect(tensorDecision).toMatchObject({
      decision: "no_go",
      evidenceState: "failing_margin",
      firstBlocker: sparseSampleBlocker,
      requiredCorrectionKeys: expect.arrayContaining([
        "full_apparatus_tensor.regionalTensorSampleCountMin",
        "full_apparatus_tensor.wallRegionalSampleCountShortfall",
        "full_apparatus_tensor.hullRegionalSampleCountShortfall",
        "full_apparatus_tensor.exteriorShellRegionalSampleCountShortfall",
      ]),
      prevents: expect.arrayContaining([
        "regional_residual_closure",
        "qei_worldline_dossier",
        "observer_robustness",
      ]),
      blocksCampaignPass: true,
    });
    expect(tensorRoadmapItem?.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "regional_tensor_sample_counts",
          evidenceArtifact: "receipt://full_apparatus_tensor/regional_sample_counts_v1",
          marginKey: "regionalSampleCountsMeetMinimum",
          requiredCorrectionKey: "regionalSampleCountBelowMinimumCount",
          target: expect.stringContaining(">= 447 tensor samples"),
        }),
      ]),
    );
    expect(tensorResolutionItem).toMatchObject({
      campaignDomain: "full_apparatus_tensor",
      evidenceState: "failing_margin",
      resolutionMode: "revise_architecture_or_operating_margin",
      firstBlocker: sparseSampleBlocker,
      nextEvidenceArtifact: "receipt://full_apparatus_tensor/regional_sample_counts_v1",
      measurementTargetSummary: expect.stringContaining(
        "at least 447 regional samples",
      ),
      falsificationRule: expect.stringContaining(
        "at least 447 regional samples",
      ),
      requiredCorrections: expect.objectContaining({
        "full_apparatus_tensor.wallRegionalSampleCountShortfall": 319,
        "full_apparatus_tensor.hullRegionalSampleCountShortfall": 191,
        "full_apparatus_tensor.exteriorShellRegionalSampleCountShortfall": 147,
      }),
      prevents: expect.arrayContaining(["regional_residual_closure"]),
    });
    expect(tensorResolutionItem?.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "regional_tensor_sample_counts",
          evidenceArtifact: "receipt://full_apparatus_tensor/regional_sample_counts_v1",
          noGoCriterion: expect.stringContaining("fewer than 447"),
        }),
      ]),
    );
    expect(report.readiness.operatingBudgetsReady).toBe(false);
    expect(report.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("surfaces the layer-stack support/source-retention overlap as a falsifying campaign blocker", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const operatingBudgetReadiness = buildPassingOperatingBudgetReadiness(receipts);
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
      downstreamGateStatuses: allDownstreamPass,
      downstreamGateArtifactRefs: allDownstreamArtifactRefs,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      operatingBudgetReadiness,
    });
    const mechanicalReceipt = buildNhm2LayerStackMechanicalReceipt({ generatedAt });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      layerStackMechanicalReceipt: mechanicalReceipt,
      layerStackMechanicalReceiptRef: "artifact://mechanical-receipt",
      operatingBudgetReadiness,
    });
    const supportWindowRow = report.blockerRows.find(
      (row) => row.blockerId === "support_retention_overlap_window_missing",
    );
    const fatigueDomain = report.campaignDomainSummary.find(
      (entry) => entry.campaignDomain === "fatigue_layer_scaling",
    );
    const fatigueDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "fatigue_layer_scaling",
    );
    const fatigueResolution = report.frontierResolutionQueue.find(
      (entry) => entry.campaignDomain === "fatigue_layer_scaling",
    );

    expect(isNhm2TileSourceFalsificationReport(report)).toBe(true);
    expect(report.disposition.reportStatus).toBe("falsified");
    expect(report.sourceRefs.layerStackMechanicalReceiptRef).toBe("artifact://mechanical-receipt");
    expect(supportWindowRow).toMatchObject({
      source: "layer_stack_mechanical_receipt",
      surfaceId: "layer_scaling",
      status: "falsifying",
      campaignDomain: "fatigue_layer_scaling",
      numericalMargin: mechanicalReceipt.supportWindow.overlapMargin,
      falsifiesCurrentCandidate: true,
      evidenceRef: "artifact://mechanical-receipt",
    });
    expect(supportWindowRow?.numericalMargins).toMatchObject({
      supportRetentionOverlapMargin: 0.459119311228,
      feasibleSupportRetentionWindow: false,
      minimumSupportFractionForStress: 0.185065881969,
      maximumSupportFractionForSourceRetention: 0.0849673202614,
      requiredSupportFractionReductionForOverlap: 0.100098561707,
      requiredSourceRetentionIncreaseForStressSupport: 0.0765753997062,
      forceScaleKilonewtons: 14.1883842843,
    });
    expect(supportWindowRow?.requiredCorrections).toMatchObject({
      supportRetentionOverlapMargin: 0.459119311228,
      requiredSupportFractionReductionForOverlap: 0.100098561707,
      requiredSourceRetentionIncreaseForStressSupport: 0.0765753997062,
    });
    expect(supportWindowRow?.requiredChange).toContain(
      "support-retention overlap margin is >= 1",
    );
    expect(fatigueDomain).toMatchObject({
      firstBlocker: "support_retention_overlap_window_missing",
      minimumNumericalMargin: 0.459119311228,
      evidenceTarget: expect.stringContaining("Fatigue/layer-scaling receipt"),
    });
    expect(fatigueDecision).toMatchObject({
      decision: "no_go",
      evidenceState: "failing_margin",
      firstBlocker: "support_retention_overlap_window_missing",
      prevents: expect.arrayContaining(["full_apparatus_tensor", "material_credibility_gate"]),
    });
    expect(fatigueDecision?.requiredCorrectionKeys).toEqual(
      expect.arrayContaining([
        "layer_scaling.requiredSupportFractionReductionForOverlap",
        "layer_scaling.requiredSourceRetentionIncreaseForStressSupport",
      ]),
    );
    expect(fatigueResolution).toMatchObject({
      resolutionMode: "revise_architecture_or_operating_margin",
      numericalMargin: 0.459119311228,
      marginInterpretation: "below_one_fails",
      requiredCorrections: expect.objectContaining({
        "layer_scaling.requiredSupportFractionReductionForOverlap": 0.100098561707,
        "layer_scaling.requiredSourceRetentionIncreaseForStressSupport": 0.0765753997062,
      }),
    });
    expect(report.summary.physicalViabilityClaimAllowed).toBe(false);
    expect(report.claimBoundary.falsificationReportOnly).toBe(true);
  });

  it("surfaces the support-fraction sweep no-overlap map as a falsifying campaign blocker", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const operatingBudgetReadiness = buildPassingOperatingBudgetReadiness(receipts);
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
      downstreamGateStatuses: allDownstreamPass,
      downstreamGateArtifactRefs: allDownstreamArtifactRefs,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      operatingBudgetReadiness,
    });
    const supportFractionSweep = buildNhm2LayerStackSupportFractionSweep({ generatedAt });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      layerStackSupportFractionSweep: supportFractionSweep,
      layerStackSupportFractionSweepRef: "artifact://support-fraction-sweep",
      operatingBudgetReadiness,
    });
    const sweepRow = report.blockerRows.find(
      (row) => row.source === "layer_stack_support_fraction_sweep",
    );
    const fatigueDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "fatigue_layer_scaling",
    );

    expect(isNhm2TileSourceFalsificationReport(report)).toBe(true);
    expect(report.disposition.reportStatus).toBe("falsified");
    expect(report.sourceRefs.layerStackSupportFractionSweepRef).toBe(
      "artifact://support-fraction-sweep",
    );
    expect(sweepRow).toMatchObject({
      blockerId: "stress_retention_overlap_missing",
      source: "layer_stack_support_fraction_sweep",
      surfaceId: "layer_scaling",
      status: "falsifying",
      campaignDomain: "fatigue_layer_scaling",
      numericalMargin: 0.25,
      falsifiesCurrentCandidate: true,
      evidenceRef: "artifact://support-fraction-sweep",
    });
    expect(sweepRow?.numericalMargins).toMatchObject({
      feasibleWindowExists: false,
      minimumSupportFractionForStress: 0.2,
      maximumSupportFractionForSourceRetention: 0.05,
      requiredSupportFractionShift: 0.15000000000000002,
      bestCandidateRowCount: 0,
      sweepRowCount: 36,
    });
    expect(sweepRow?.requiredCorrections).toMatchObject({
      minimumSupportFractionForStress: 0.2,
      maximumSupportFractionForSourceRetention: 0.05,
      requiredSupportFractionShift: 0.15000000000000002,
      decoupleSupportLoadFromActiveSourceArea: true,
    });
    expect(sweepRow?.requiredChange).toContain("decouple load bearing");
    expect(fatigueDecision).toMatchObject({
      decision: "no_go",
      evidenceState: "failing_margin",
      firstBlocker: "stress_retention_overlap_missing",
      requiredCorrectionKeys: expect.arrayContaining([
        "layer_scaling.requiredSupportFractionShift",
        "layer_scaling.decoupleSupportLoadFromActiveSourceArea",
      ]),
    });
    expect(report.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("surfaces the topology architecture receipt loop as a review lead, not tensor authority", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const operatingBudgetReadiness = buildPassingOperatingBudgetReadiness(receipts);
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
      downstreamGateStatuses: allDownstreamPass,
      downstreamGateArtifactRefs: allDownstreamArtifactRefs,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      operatingBudgetReadiness,
    });
    const receiptLoop = buildNhm2LayerStackFullApparatusReceiptLoop({ generatedAt });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      layerStackFullApparatusReceiptLoop: receiptLoop,
      layerStackFullApparatusReceiptLoopRef: "artifact://full-apparatus-receipt-loop",
      operatingBudgetReadiness,
    });
    const architectureRow = report.blockerRows.find(
      (row) => row.source === "layer_stack_full_apparatus_receipt_loop",
    );

    expect(isNhm2TileSourceFalsificationReport(report)).toBe(true);
    expect(report.disposition.reportStatus).toBe("review");
    expect(report.sourceRefs.layerStackFullApparatusReceiptLoopRef).toBe(
      "artifact://full-apparatus-receipt-loop",
    );
    expect(architectureRow).toMatchObject({
      blockerId:
        "architecture:topology_optimized_lattice_tin:material_coupon_receipt_missing",
      source: "layer_stack_full_apparatus_receipt_loop",
      surfaceId: "material_coupon",
      status: "review",
      campaignDomain: "material_coupon_behavior",
      numericalMargin: 0,
      marginUnit: "readiness_ratio",
      falsifiesCurrentCandidate: false,
      evidenceRef: "artifact://full-apparatus-receipt-loop",
    });
    expect(architectureRow?.numericalMargins).toMatchObject({
      evidenceReadinessScore: 0,
      sourceRetention: 0.7038,
      supportStressMPa: 545.707087858,
      pullInMargin: 1.31563018682,
      receiptSurfaceCount: 7,
      missingReceiptSurfaceCount: 7,
      tensorTermCoverageCount: 0,
    });
    expect(architectureRow?.requiredCorrections).toMatchObject({
      evidenceReadinessScore: 0,
      sourceRetention: 0.7038,
      supportStressMPa: 545.707087858,
      pullInMargin: 1.31563018682,
      missingReceiptSurfaceCount: 7,
      tensorTermCoverageCount: 0,
    });
    expect(architectureRow?.requiredChange).toContain(
      "architecture=topology_optimized_lattice_tin",
    );
    expect(report.summary.physicalViabilityClaimAllowed).toBe(false);
    expect(report.claimBoundary.sourceCandidateRequiresFullApparatusTensor).toBe(true);
  });

  it("builds a falsification report with quantitative force-gap no-go margins", () => {
    const failingForceGapEvidence = {
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://force-gap/failing-8nm-v1",
      ...forceGapProtocolRefs,
      forceGapCurveRef: "receipt://force-gap/failing-Fg-curve-v1",
      forceGradientCurveRef: "receipt://force-gap/failing-dFdg-curve-v1",
      stiffnessModelRef: "receipt://force-gap/failing-stiffness-model-v1",
      gapMeters: 8e-9,
      casimirForceN: 1.42e4,
      forceGradientNPerM: 3e6,
      effectiveSpringConstantNPerM: 1e6,
      stictionMargin: 0.8,
      activeGapControlAuthorityN: 1e4,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      materialCoupon: passingEvidence.materialCoupon,
      forceGapPullIn: failingForceGapEvidence,
    });
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: receipts,
      forceGapPullInEvidence: failingForceGapEvidence,
    });
    const operatingBudgetReadiness = buildNhm2TileSourceOperatingBudgetReadiness({
      generatedAt,
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
        materialCouponEvidence: passingEvidence.materialCoupon,
      }),
      forceGapLoadBudget,
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        forceGapLoadBudget,
      }),
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        forceGapLoadBudget,
      }),
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
      }),
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
      }),
    });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
      downstreamGateStatuses: {
        regional_residual_closure: "fail",
      },
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
    });
    const handoff = buildNhm2TileSourceAuthorityHandoff({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      falsificationReport: report,
      operatingBudgetReadiness,
    });
    const pullIn = report.blockerRows.find((row) => row.blockerId === "pull_in_margin_below_one");
    const operatingPullIn = report.blockerRows.find(
      (row) => row.blockerId === "force_gap_load:ideal_load_pull_in_margin_below_one",
    );
    const downstream = report.blockerRows.find(
      (row) => row.blockerId === "regional_residual_closure_incomplete",
    );
    const forceGapDomain = report.campaignDomainSummary.find(
      (entry) => entry.campaignDomain === "force_gap_pull_in",
    );
    const downstreamDomain = report.campaignDomainSummary.find(
      (entry) => entry.campaignDomain === "downstream_residual_conservation_qei_observer",
    );
    const forceGapDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "force_gap_pull_in",
    );
    const downstreamDecision = report.goNoGoMatrix.find(
      (entry) => entry.campaignDomain === "downstream_residual_conservation_qei_observer",
    );
    const forceGapResolutionItem = report.frontierResolutionQueue.find(
      (entry) => entry.campaignDomain === "force_gap_pull_in",
    );
    const downstreamResolutionItem = report.frontierResolutionQueue.find(
      (entry) => entry.campaignDomain === "downstream_residual_conservation_qei_observer",
    );
    const falsificationGate = handoff.gates.find((gate) => gate.gateId === "falsification_report");

    expect(isNhm2TileSourceFalsificationReport(report)).toBe(true);
    expect(report.disposition.reportStatus).toBe("falsified");
    expect(report.currentBlocker).toMatchObject({
      blockerId: "force_gradient_inconsistent_with_force_curve_at_8nm",
      source: "material_evidence_receipts",
      surfaceId: "force_gap_pull_in",
      campaignDomain: "force_gap_pull_in",
      evidenceTarget: expect.stringContaining("8 nm force-gap receipt"),
      falsifiesCurrentCandidate: true,
    });
    expect(report.currentBlocker.decisiveMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: "pull_in_margin",
          evidenceArtifact: "receipt://force_gap_pull_in/pull_in_margin_8nm_v1",
        }),
        expect.objectContaining({
          measurementId: "active_gap_authority",
          evidenceArtifact: "receipt://force_gap_pull_in/active_authority_447_layer_v1",
        }),
      ]),
    );
    expect(report.currentBlocker.numericalMargin).toBeLessThan(1);
    expect(report.summary.failingReceiptCount).toBe(1);
    expect(report.summary.failingDownstreamGateCount).toBe(1);
    expect(report.summary.falsifyingBlockerCount).toBeGreaterThan(0);
    expect(report.summary.nextRequiredSurfaceId).toBe("force_gap_pull_in");
    expect(forceGapDomain).toMatchObject({
      firstBlocker: "force_gradient_inconsistent_with_force_curve_at_8nm",
      evidenceTarget: expect.stringContaining("8 nm force-gap receipt"),
      evidenceRefs: expect.arrayContaining(["receipt://force-gap/failing-8nm-v1"]),
    });
    expect(forceGapDomain?.falsifyingBlockerCount).toBeGreaterThan(0);
    expect(forceGapDomain?.minimumNumericalMargin).toBeLessThan(1);
    expect(forceGapDecision).toMatchObject({
      decision: "no_go",
      evidenceState: "failing_margin",
      firstBlocker: "force_gradient_inconsistent_with_force_curve_at_8nm",
      blocksCampaignPass: true,
      prevents: expect.arrayContaining(["covariant_conservation", "full_apparatus_tensor"]),
    });
    expect(forceGapDecision?.minimumNumericalMargin).toBeLessThan(1);
    expect(forceGapResolutionItem).toMatchObject({
      campaignDomain: "force_gap_pull_in",
      decision: "no_go",
      evidenceState: "failing_margin",
      resolutionMode: "revise_architecture_or_operating_margin",
      marginInterpretation: "below_one_fails",
      nextEvidenceArtifact: "receipt://force_gap_pull_in/force_gradient_8nm_v1",
      measurementTargetSummary: expect.stringContaining("pull-in margin > 1"),
      falsificationRule: expect.stringContaining("mechanically inadmissible"),
      requiredCorrections: expect.objectContaining({
        "force_gap_load.pullInMarginDefinition":
          "effectiveSpringConstantNPerM / idealForceGradientNPerM",
        "force_gap_load.stictionMarginShortfall": expect.any(Number),
        "force_gap_load.activeGapControlAuthorityShortfallN": expect.any(Number),
      }),
      blocksCampaignPass: true,
    });
    expect(forceGapResolutionItem?.numericalMargin).toBeLessThan(1);
    expect(downstreamDomain).toMatchObject({
      firstBlocker: "regional_residual_closure_incomplete",
      evidenceTarget: expect.stringContaining("Downstream gate receipt"),
    });
    expect(downstreamDecision).toMatchObject({
      decision: "no_go",
      evidenceState: "downstream_blocked",
      firstBlocker: "regional_residual_closure_incomplete",
      prevents: expect.arrayContaining(["coupled_closure", "claim_admission"]),
    });
    expect(downstreamResolutionItem).toMatchObject({
      campaignDomain: "downstream_residual_conservation_qei_observer",
      evidenceState: "downstream_blocked",
      resolutionMode: "rerun_downstream_gate",
      firstBlocker: "regional_residual_closure_incomplete",
      nextEvidenceArtifact: "artifact://nhm2/downstream-gates/regional-residual-closure-v1",
      measurementTargetSummary: expect.stringContaining("observer-family WEC/NEC/SEC/DEC"),
      falsificationRule: expect.stringContaining("do not pass together"),
      blocksCampaignPass: true,
    });
    expect(pullIn?.surfaceId).toBe("force_gap_pull_in");
    expect(pullIn?.campaignDomain).toBe("force_gap_pull_in");
    expect(pullIn?.numericalMargin).toBeLessThan(1);
    expect(pullIn?.falsifiesCurrentCandidate).toBe(true);
    expect(operatingPullIn?.source).toBe("operating_budget_readiness");
    expect(operatingPullIn?.operatingBudgetSurfaceId).toBe("force_gap_load");
    expect(operatingPullIn?.campaignDomain).toBe("force_gap_pull_in");
    expect(operatingPullIn?.numericalMargin).toBeLessThan(1);
    expect(operatingPullIn?.numericalMargins.pullInMarginToIdealGradient).toBeLessThan(1);
    expect(operatingPullIn?.numericalMargins.stictionMarginToMinimum).toBeLessThan(1);
    expect(operatingPullIn?.numericalMargins.activeAuthorityMarginToIdealLoad).toBeLessThan(1);
    expect(operatingPullIn?.requiredChange).toContain("pullInMarginToIdealGradient=");
    expect(operatingPullIn?.requiredCorrections).toMatchObject({
      pullInMarginDefinition: "effectiveSpringConstantNPerM / idealForceGradientNPerM",
      stictionMarginShortfall: expect.any(Number),
      activeGapControlAuthorityShortfallN: expect.any(Number),
      forceGradientConsistencyShortfall: expect.any(Number),
    });
    expect(report.correctionSummary).toMatchObject({
      "force_gap_load.pullInMarginDefinition":
        "effectiveSpringConstantNPerM / idealForceGradientNPerM",
      "force_gap_load.stictionMarginShortfall": expect.any(Number),
      "force_gap_load.activeGapControlAuthorityShortfallN": expect.any(Number),
      "force_gap_load.forceGradientConsistencyShortfall": expect.any(Number),
    });
    expect(falsificationGate?.status).toBe("fail");
    expect(falsificationGate?.requiredCorrections).toMatchObject({
      "force_gap_load.stictionMarginShortfall": expect.any(Number),
      "force_gap_load.activeGapControlAuthorityShortfallN": expect.any(Number),
    });
    expect(handoff.summary.firstFrontierResolutionMode).toBe(
      "revise_architecture_or_operating_margin",
    );
    expect(handoff.summary.firstFrontierCampaignDomain).toBe("force_gap_pull_in");
    expect(handoff.frontierResolutionQueue).toEqual(report.frontierResolutionQueue);
    expect(handoff.frontierResolutionQueue[0]).toMatchObject({
      campaignDomain: "force_gap_pull_in",
      evidenceState: "failing_margin",
      resolutionMode: "revise_architecture_or_operating_margin",
      requiredCorrections: expect.objectContaining({
        "force_gap_load.stictionMarginShortfall": expect.any(Number),
      }),
    });
    expect(operatingPullIn?.requiredChange).toContain("corrections:");
    expect(operatingPullIn?.requiredChange).toContain("stictionMarginShortfall=");
    expect(downstream?.downstreamGateId).toBe("regional_residual_closure");
    expect(downstream?.campaignDomain).toBe("downstream_residual_conservation_qei_observer");
    expect(downstream?.evidenceTarget).toContain("regional residual closure");
    expect(downstream?.falsifiesCurrentCandidate).toBe(true);
    expect(report.summary.transportClaimAllowed).toBe(false);
  });

  it("blocks source-authority handoff when material receipts or tensor evidence are missing", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
    });
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: receipts,
    });
    const operatingBudgetReadiness = buildNhm2TileSourceOperatingBudgetReadiness({
      generatedAt,
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
      }),
      forceGapLoadBudget,
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        forceGapLoadBudget,
      }),
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        forceGapLoadBudget,
      }),
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
      }),
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
      }),
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
    });
    const handoff = buildNhm2TileSourceAuthorityHandoff({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      falsificationReport: report,
      operatingBudgetReadiness,
    });
    const materialGate = handoff.gates.find((gate) => gate.gateId === "material_receipts");
    const tensorGate = handoff.gates.find((gate) => gate.gateId === "full_apparatus_tensor");
    const operatingBudgetGate = handoff.gates.find(
      (gate) => gate.gateId === "operating_budget_readiness",
    );
    const componentDetailGate = handoff.gates.find(
      (gate) => gate.gateId === "component_detail_refs",
    );

    expect(isNhm2TileSourceAuthorityHandoff(handoff)).toBe(true);
    expect(handoff.summary.handoffStatus).toBe("blocked");
    expect(handoff.summary.handoffReadyForSameBasisAuthority).toBe(false);
    expect(handoff.summary.firstBlocker).toBe("material_coupon_receipt_missing");
    expect(handoff.summary.firstFrontierResolutionMode).toBe("supply_experimental_receipt");
    expect(handoff.summary.firstFrontierCampaignDomain).toBe("material_coupon_behavior");
    expect(handoff.summary.frontierResolutionItemCount).toBe(report.frontierResolutionQueue.length);
    expect(handoff.frontierResolutionQueue[0]).toMatchObject({
      rank: 1,
      campaignDomain: "material_coupon_behavior",
      evidenceState: "missing_receipt",
      resolutionMode: "supply_experimental_receipt",
      firstBlocker: "material_coupon_receipt_missing",
      decisiveMeasurements: expect.arrayContaining([
        expect.objectContaining({
          measurementId: "coupon_fracture_yield_margin",
          evidenceArtifact: "receipt://material_coupon/fracture_yield_margin_v1",
        }),
      ]),
      blocksCampaignPass: true,
    });
    expect(materialGate?.status).toBe("missing");
    expect(materialGate?.blockers).toContain("material_coupon_receipt_missing");
    expect(tensorGate?.status).toBe("missing");
    expect(tensorGate?.blockers).toContain("support_drive_terms_in_full_apparatus_Tmunu_missing");
    expect(operatingBudgetGate?.status).toBe("review");
    expect(operatingBudgetGate?.blockers).toContain(
      "material_coupon:material_coupon_receipt_missing_for_operating_budget",
    );
    expect(operatingBudgetGate?.requiredCorrections).toMatchObject({
      "material_coupon.missingCurveAndMapRefCount": 7,
      "material_coupon.missingMaterialResponseRefCount": 2,
      "full_apparatus_tensor.tensorComponentRefMissingCount": 10,
    });
    expect(componentDetailGate?.status).toBe("review");
    expect(componentDetailGate?.blockers).toContain(
      "full_apparatus_T01_ref_missing_for_operating_budget",
    );
    expect(componentDetailGate?.requiredCorrections).toMatchObject({
      tensorComponentRefMissingCount: 10,
      missingTensorComponentIds: expect.arrayContaining(["T01", "T12", "T33"]),
    });
    expect(handoff.summary.operatingBudgetsReady).toBe(false);
    expect(handoff.summary.fullApparatusComponentDetailRefsReady).toBe(false);
    expect(handoff.summary.firstRequiredCorrections).toMatchObject({
      "material_coupon.missingCurveAndMapRefCount": 7,
    });
    expect(handoff.claimBoundary.handoffDoesNotRunSameBasisAuthority).toBe(true);
    expect(handoff.claimBoundary.operatingBudgetReadinessDoesNotValidateMaterialSource).toBe(true);
    expect(handoff.claimBoundary.handoffCarriesFrontierQueueOnly).toBe(true);
    expect(handoff.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("allows source-authority handoff for complete receipts without opening physical claims", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const operatingBudgetReadiness = buildPassingOperatingBudgetReadiness(receipts);
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
      downstreamGateStatuses: allDownstreamPass,
      downstreamGateArtifactRefs: allDownstreamArtifactRefs,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
    });
    const handoff = buildNhm2TileSourceAuthorityHandoff({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      falsificationReport: report,
      operatingBudgetReadiness,
    });

    expect(isNhm2TileSourceAuthorityHandoff(handoff)).toBe(true);
    expect(handoff.summary.handoffStatus).toBe("handoff_ready");
    expect(handoff.summary.handoffReadyForSameBasisAuthority).toBe(true);
    expect(handoff.summary.materialEvidenceReady).toBe(true);
    expect(handoff.summary.fullApparatusTensorReady).toBe(true);
    expect(handoff.summary.fullApparatusComponentDetailRefsReady).toBe(true);
    expect(handoff.summary.sourceAuthorityEvidenceReady).toBe(true);
    expect(handoff.summary.operatingBudgetsReady).toBe(true);
    expect(handoff.summary.physicalValidationStillRequired).toBe(true);
    expect(handoff.summary.firstFrontierResolutionMode).toBe("none");
    expect(handoff.summary.firstFrontierCampaignDomain).toBe("none");
    expect(handoff.summary.frontierResolutionItemCount).toBe(0);
    expect(handoff.frontierResolutionQueue).toEqual([]);
    expect(handoff.gates.every((gate) => gate.status === "pass")).toBe(true);
    expect(handoff.gates.every((gate) => Object.keys(gate.requiredCorrections).length === 0)).toBe(
      true,
    );
    expect(handoff.summary.firstRequiredCorrections).toEqual({});
    expect(handoff.handoffTarget.targetContractVersion).toBe(
      "nhm2_source_side_same_basis_tensor_authority/v1",
    );
    expect(handoff.handoffTarget.requiresTensorComponents).toEqual([
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
    ]);
    expect(handoff.sourceRefs.fullApparatusTensorOperatingBudgetRef).toBe(
      "artifact://full-apparatus-tensor-budget",
    );
    expect(handoff.claimBoundary.handoffReadyIsNotPhysicalCredibility).toBe(true);
    expect(handoff.claimBoundary.handoffCarriesFrontierQueueOnly).toBe(true);
    expect(handoff.summary.transportClaimAllowed).toBe(false);
  });

  it("blocks same-basis authority handoff when full-apparatus tensor only has grouped component refs", () => {
    const groupedOnlyEvidence = {
      ...passingEvidence.fullApparatusTensor!,
      componentDetailRefs: undefined,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      ...passingEvidence,
      fullApparatusTensor: groupedOnlyEvidence,
    });
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: receipts,
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });
    const operatingBudgetReadiness = buildNhm2TileSourceOperatingBudgetReadiness({
      generatedAt,
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
        materialCouponEvidence: passingEvidence.materialCoupon,
      }),
      forceGapLoadBudget,
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        forceGapLoadBudget,
        roughnessPatchEvidence: passingEvidence.roughnessPatch,
      }),
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        forceGapLoadBudget,
        activeControlEvidence: passingEvidence.activeControl,
      }),
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
        fatigueLayerScalingEvidence: passingEvidence.fatigueLayerScaling,
      }),
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
        fullApparatusTensorEvidence: groupedOnlyEvidence,
      }),
      fullApparatusTensorOperatingBudgetRef: "artifact://grouped-only-full-apparatus-budget",
    });
    const plan = buildNhm2TileSourcePhysicalValidationPlan({
      generatedAt,
      materialEvidenceReceipts: receipts,
      operatingBudgetReadiness,
      downstreamGateStatuses: allDownstreamPass,
      downstreamGateArtifactRefs: allDownstreamArtifactRefs,
    });
    const roadmap = buildNhm2TileSourceEvidenceGapRoadmap({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
    });
    const report = buildNhm2TileSourceFalsificationReport({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      evidenceGapRoadmap: roadmap,
      operatingBudgetReadiness,
    });
    const handoff = buildNhm2TileSourceAuthorityHandoff({
      materialEvidenceReceipts: receipts,
      physicalValidationPlan: plan,
      falsificationReport: report,
      operatingBudgetReadiness,
    });
    const componentDetailGate = handoff.gates.find(
      (gate) => gate.gateId === "component_detail_refs",
    );
    const tensorGate = handoff.gates.find((gate) => gate.gateId === "full_apparatus_tensor");

    expect(isNhm2TileSourceAuthorityHandoff(handoff)).toBe(true);
    expect(receipts.summary.fullApparatusTensorReady).toBe(false);
    expect(operatingBudgetReadiness.summary.allOperatingBudgetsReady).toBe(false);
    expect(handoff.summary.handoffReadyForSameBasisAuthority).toBe(false);
    expect(handoff.summary.fullApparatusComponentDetailRefsReady).toBe(false);
    expect(handoff.summary.handoffStatus).toBe("falsified");
    expect(tensorGate?.status).toBe("fail");
    expect(componentDetailGate?.status).toBe("fail");
    expect(componentDetailGate?.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_T01_ref_missing_for_operating_budget",
        "full_apparatus_T12_ref_missing_for_operating_budget",
        "full_apparatus_T33_ref_missing_for_operating_budget",
      ]),
    );
    expect(componentDetailGate?.requiredCorrections).toMatchObject({
      tensorComponentRefMissingCount: 10,
      missingTensorComponentIds: expect.arrayContaining(["T01", "T12", "T33"]),
      requiredTensorComponentCount: 10,
    });
    expect(handoff.sourceRefs.fullApparatusTensorOperatingBudgetRef).toBe(
      "artifact://grouped-only-full-apparatus-budget",
    );
    expect(handoff.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("builds a material-coupon test plan with explicit missing coupon tests", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      materialCoupon: {
        evidenceTier: "missing",
        evidenceRef: null,
        material: "ultra_high_stress_tin",
        measuredTensileStressPa: null,
        fractureOrYieldStressPa: null,
        supportStressPa: 5.45707087858e8,
        cryogenicTemperatureK: null,
        dielectricResponseRef: null,
        conductivityRef: null,
        roughnessRmsMeters: null,
        fabricationToleranceMeters: null,
      },
    });
    const plan = buildNhm2TileSourceMaterialCouponTestPlan({
      materialEvidenceReceipts: receipts,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
    });
    const fractureYield = plan.testItems.find((item) => item.testId === "fracture_yield_margin");

    expect(isNhm2TileSourceMaterialCouponTestPlan(plan)).toBe(true);
    expect(plan.couponTarget.requiredFractureOrYieldStressPa).toBeCloseTo(1.091414175716e9);
    expect(plan.summary.materialCouponReceiptStatus).toBe("missing");
    expect(plan.summary.nextRequiredTestId).toBe("coupon_provenance");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://material_coupon/provenance_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain(
      "cannot support material credibility",
    );
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "force_gap_pull_in",
        "full_apparatus_tensor",
        "material_credibility_gate",
      ]),
    );
    expect(plan.summary.couponEvidenceReady).toBe(false);
    expect(fractureYield?.status).toBe("open");
    expect(fractureYield?.blockerIds).toContain("fracture_or_yield_margin_missing");
    expect(fractureYield?.measurementTargets).toMatchObject({
      supportStressPa: 5.45707087858e8,
      materialSafetyFactor: 2,
    });
    expect(fractureYield?.measurementTargets.fractureOrYieldStressMinPa).toBeCloseTo(
      1.091414175716e9,
    );
    expect(fractureYield?.falsificationRule).toContain("below 2x");
    expect(fractureYield?.blocksCampaignDomains).toEqual(
      expect.arrayContaining(["fatigue_layer_scaling", "full_apparatus_tensor"]),
    );
    expect(plan.claimBoundary.measuredCouponIsNotFullApparatusTensor).toBe(true);
    expect(plan.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("maps an absent material-coupon receipt to the coupon provenance test", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourceMaterialCouponTestPlan({ materialEvidenceReceipts: receipts });
    const provenance = plan.testItems.find((item) => item.testId === "coupon_provenance");

    expect(receipts.summary.firstBlocker).toBe("material_coupon_receipt_missing");
    expect(plan.summary.nextRequiredTestId).toBe("coupon_provenance");
    expect(provenance?.status).toBe("open");
    expect(provenance?.blockerIds).toContain("material_coupon_receipt_missing");
    expect(provenance?.measurementTargets).toMatchObject({
      requiredEvidenceTier: "measured_or_validated_simulation",
      requiredCurveAndMapRefCount: 7,
      requiredCampaignCompatibilityRefCount: 7,
      requiredMaterialResponseRefCount: 2,
    });
    expect(provenance?.blocksCampaignDomains).toEqual(
      expect.arrayContaining(["roughness_patch_potential", "material_credibility_gate"]),
    );
    expect(plan.summary.couponEvidenceReady).toBe(false);
  });

  it("marks a measured but under-strength coupon as falsifying", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      materialCoupon: {
        evidenceTier: "measured",
        evidenceRef: "receipt://coupon/tin/under-strength-v1",
        architectureId: "topology_optimized_lattice_tin",
        loadCaseRef: "receipt://coupon/tin/under-strength-load-case-v1",
        layerStackCompatibilityRef: "receipt://coupon/tin/under-strength-stack-compatibility-v1",
        topologyOptimizationRef:
          "receipt://coupon/tin/under-strength-topology-optimization-v1",
        depositionProcessRef: "receipt://coupon/tin/under-strength-deposition-process-v1",
        residualStressUniformityMapRef:
          "receipt://coupon/tin/under-strength-residual-stress-map-v1",
        interlayerAdhesionProtocolRef:
          "receipt://coupon/tin/under-strength-interlayer-adhesion-v1",
        tensileStressCurveRef: "receipt://coupon/tin/under-strength-tensile-curve-v1",
        fractureYieldCurveRef: "receipt://coupon/tin/under-strength-fracture-yield-curve-v1",
        cryogenicStateRef: "receipt://coupon/tin/under-strength-cryogenic-state-v1",
        cryogenicCycleRef: "receipt://coupon/tin/under-strength-cryogenic-cycle-v1",
        couponFatigueCurveRef: "receipt://coupon/tin/under-strength-fatigue-curve-v1",
        roughnessMapRef: "receipt://coupon/tin/under-strength-roughness-map-v1",
        fabricationToleranceMapRef: "receipt://coupon/tin/under-strength-fabrication-map-v1",
        material: "ultra_high_stress_tin",
        measuredTensileStressPa: 8e8,
        fractureOrYieldStressPa: 8e8,
        supportStressPa: 5.45707087858e8,
        couponCycleCountToFailure: 2e9,
        couponRequiredCycleCount: 1e9,
        cryogenicTemperatureK: 4,
        dielectricResponseRef: "receipt://dielectric/tin/v1",
        conductivityRef: "receipt://conductivity/tin/v1",
        materialResponseFrequencyHz: 15e9,
        dielectricResponseTemperatureK: 4,
        conductivityTemperatureK: 4,
        stackCompatibilityCouponSampleCount: 8,
        stackCompatibilityLayerCount: 447,
        stackCompatibilitySupportFraction: 0.26,
        stackCompatibilityActiveAreaLostFraction: 0.08,
        dielectricLossTangent: 0.002,
        conductivitySiemensPerMeter: 1.2e6,
        roughnessRmsMeters: 5e-11,
        fabricationToleranceMeters: 5e-10,
      },
    });
    const plan = buildNhm2TileSourceMaterialCouponTestPlan({ materialEvidenceReceipts: receipts });
    const fractureYield = plan.testItems.find((item) => item.testId === "fracture_yield_margin");

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(plan.summary.materialCouponReceiptStatus).toBe("fail");
    expect(plan.summary.nextRequiredTestId).toBe("fracture_yield_margin");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://material_coupon/fracture_yield_margin_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain("447-layer TiN load path");
    expect(plan.summary.nextBlockedCampaignDomains).toContain("full_apparatus_tensor");
    expect(plan.summary.falsifiesCurrentCandidate).toBe(true);
    expect(fractureYield?.status).toBe("falsifying");
    expect(fractureYield?.blockerIds).toContain("fracture_or_yield_margin_below_2x_support_stress");
    expect(fractureYield?.measurementTargets.fractureOrYieldStressMinPa).toBeCloseTo(
      1.091414175716e9,
    );
    expect(plan.summary.transportClaimAllowed).toBe(false);
  });

  it("builds material-coupon operating targets for the ultra-high-stress TiN candidate", () => {
    const budget = buildNhm2TileSourceMaterialCouponOperatingBudget({ generatedAt });

    expect(isNhm2TileSourceMaterialCouponOperatingBudget(budget)).toBe(true);
    expect(budget.operatingTargets.material).toBe("ultra_high_stress_tin");
    expect(budget.operatingTargets.architectureId).toBe("topology_optimized_lattice_tin");
    expect(budget.operatingTargets.layerCount).toBe(447);
    expect(budget.operatingTargets.supportFraction).toBe(0.26);
    expect(budget.operatingTargets.activeAreaLostFraction).toBe(0.08);
    expect(budget.operatingTargets.operatingTemperatureK).toBe(4);
    expect(budget.operatingTargets.campaignLoadCaseRefRequired).toBe(true);
    expect(budget.operatingTargets.topologyOptimizationRefRequired).toBe(true);
    expect(budget.operatingTargets.depositionProcessRefRequired).toBe(true);
    expect(budget.operatingTargets.residualStressUniformityMapRefRequired).toBe(true);
    expect(budget.operatingTargets.interlayerAdhesionProtocolRefRequired).toBe(true);
    expect(budget.operatingTargets.supportStressPa).toBe(5.45707087858e8);
    expect(budget.operatingTargets.requiredFractureOrYieldStressPa).toBeCloseTo(1.091414175716e9);
    expect(budget.operatingTargets.couponRequiredCycleCount).toBe(1e9);
    expect(budget.operatingTargets.fabricationToleranceMaxMeters).toBe(5e-10);
    expect(budget.operatingTargets.materialResponseFrequencyHz).toBe(15e9);
    expect(budget.operatingTargets.mechanicalCouponSampleCountMin).toBe(5);
    expect(budget.operatingTargets.stackCompatibilityCouponSampleCountMin).toBe(5);
    expect(budget.operatingTargets.cryogenicCycleSampleCountMin).toBe(10);
    expect(budget.operatingTargets.materialResponseSweepSampleCountMin).toBe(16);
    expect(budget.operatingTargets.surfaceMapSampleCountMin).toBe(10000);
    expect(budget.requiredCorrections.materialMismatch).toBe(true);
    expect(budget.requiredCorrections.supportStressPa).toBe(5.45707087858e8);
    expect(budget.requiredCorrections.tensileStressShortfallPa).toBeNull();
    expect(budget.requiredCorrections.requiredFractureOrYieldStressPa).toBeCloseTo(
      1.091414175716e9,
    );
    expect(budget.requiredCorrections.fractureOrYieldStressShortfallPa).toBeNull();
    expect(budget.requiredCorrections.couponCycleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.cryogenicTemperatureReductionK).toBeNull();
    expect(budget.requiredCorrections.materialResponseFrequencyAbsDeltaHz).toBeNull();
    expect(budget.requiredCorrections.roughnessRmsReductionMeters).toBeNull();
    expect(budget.requiredCorrections.fabricationToleranceReductionMeters).toBeNull();
    expect(budget.requiredCorrections.missingCurveAndMapRefCount).toBe(7);
    expect(budget.requiredCorrections.missingCampaignCompatibilityRefCount).toBe(7);
    expect(budget.requiredCorrections.missingMaterialResponseRefCount).toBe(2);
    expect(budget.requiredCorrections.materialResponseNumericValuesAvailable).toBe(false);
    expect(budget.requiredCorrections.mechanicalCouponSampleCountMin).toBe(5);
    expect(budget.requiredCorrections.cryogenicCycleSampleCountMin).toBe(10);
    expect(budget.requiredCorrections.materialResponseSweepSampleCountMin).toBe(16);
    expect(budget.requiredCorrections.surfaceMapSampleCountMin).toBe(10000);
    expect(budget.requiredCorrections.tensileStressCouponSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.fractureYieldCouponSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.cryogenicCycleSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.couponFatigueCurveSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.dielectricResponseFrequencySampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.conductivityTemperatureSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.roughnessMapSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.fabricationToleranceMapSampleCountShortfall).toBeNull();
    expect(budget.summary.firstBlocker).toBe("material_coupon_receipt_missing_for_operating_budget");
    expect(budget.claimBoundary.materialResponseRefsDoNotSubstituteForFullTensor).toBe(true);
  });

  it("clears material-coupon operating budget when measured TiN coupon margins pass", () => {
    const budget = buildNhm2TileSourceMaterialCouponOperatingBudget({
      generatedAt,
      materialCouponEvidence: passingEvidence.materialCoupon,
    });

    expect(budget.summary.materialCouponEvidenceReady).toBe(true);
    expect(budget.summary.firstBlocker).toBe("none");
    expect(budget.derivedOperatingBudget.curveAndMapRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.campaignCompatibilityRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.architectureCompatibilityRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.architectureIdMatches).toBe(true);
    expect(budget.derivedOperatingBudget.stackLayerCountMargin).toBe(1);
    expect(budget.derivedOperatingBudget.supportFractionMargin).toBe(1);
    expect(budget.derivedOperatingBudget.activeAreaLostFractionMargin).toBe(1);
    expect(budget.suppliedMaterialCouponEvidence.tensileStressCurveRef).toBe(
      "receipt://coupon/tin/tensile-stress-curve-4k-v1",
    );
    expect(budget.derivedOperatingBudget.tensileStressMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.fractureOrYieldStressMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.couponFatigueCycleMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.cryogenicTemperatureMargin).toBe(1);
    expect(budget.derivedOperatingBudget.materialResponseFrequencyMargin).toBe(1);
    expect(budget.derivedOperatingBudget.dielectricTemperatureMargin).toBe(1);
    expect(budget.derivedOperatingBudget.conductivityTemperatureMargin).toBe(1);
    expect(budget.derivedOperatingBudget.materialResponseValuesAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.couponSamplingComplete).toBe(true);
    expect(budget.derivedOperatingBudget.stackCompatibilityCouponSampleCountMargin).toBe(1.6);
    expect(budget.derivedOperatingBudget.tensileStressCouponSampleCountMargin).toBe(1.6);
    expect(budget.derivedOperatingBudget.fractureYieldCouponSampleCountMargin).toBe(1.6);
    expect(budget.derivedOperatingBudget.cryogenicCycleSampleCountMargin).toBe(1.6);
    expect(budget.derivedOperatingBudget.couponFatigueCurveSampleCountMargin).toBe(1.6);
    expect(budget.derivedOperatingBudget.dielectricResponseFrequencySampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.conductivityTemperatureSampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.roughnessMapSampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.fabricationToleranceMapSampleCountMargin).toBe(2);
    expect(budget.suppliedMaterialCouponEvidence.dielectricLossTangent).toBe(0.002);
    expect(budget.suppliedMaterialCouponEvidence.conductivitySiemensPerMeter).toBe(1.2e6);
    expect(budget.derivedOperatingBudget.roughnessRmsMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.fabricationToleranceMargin).toBe(1);
    expect(budget.requiredCorrections.materialMismatch).toBe(false);
    expect(budget.requiredCorrections.architectureIdMismatch).toBe(false);
    expect(budget.requiredCorrections.stackCompatibilityLayerCountShortfall).toBe(0);
    expect(budget.requiredCorrections.supportFractionAbsDelta).toBe(0);
    expect(budget.requiredCorrections.activeAreaLostFractionAbsDelta).toBe(0);
    expect(budget.requiredCorrections.tensileStressShortfallPa).toBe(0);
    expect(budget.requiredCorrections.fractureOrYieldStressShortfallPa).toBe(0);
    expect(budget.requiredCorrections.couponCycleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.cryogenicTemperatureReductionK).toBe(0);
    expect(budget.requiredCorrections.materialResponseFrequencyAbsDeltaHz).toBe(0);
    expect(budget.requiredCorrections.dielectricTemperatureReductionK).toBe(0);
    expect(budget.requiredCorrections.conductivityTemperatureReductionK).toBe(0);
    expect(budget.requiredCorrections.roughnessRmsReductionMeters).toBe(0);
    expect(budget.requiredCorrections.fabricationToleranceReductionMeters).toBe(0);
    expect(budget.requiredCorrections.missingCurveAndMapRefCount).toBe(0);
    expect(budget.requiredCorrections.missingCampaignCompatibilityRefCount).toBe(0);
    expect(budget.requiredCorrections.missingMaterialResponseRefCount).toBe(0);
    expect(budget.requiredCorrections.materialResponseNumericValuesAvailable).toBe(true);
    expect(budget.requiredCorrections.tensileStressCouponSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.fractureYieldCouponSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.cryogenicCycleSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.couponFatigueCurveSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.dielectricResponseFrequencySampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.conductivityTemperatureSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.roughnessMapSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.fabricationToleranceMapSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.stackCompatibilityCouponSampleCountShortfall).toBe(0);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies material-coupon receipts when coupon, sweep, or map sample support is sparse", () => {
    const sparseCouponEvidence = {
      ...passingEvidence.materialCoupon!,
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://coupon/tin/sparse-sample-support-v1",
      tensileStressCouponSampleCount: 2,
      fractureYieldCouponSampleCount: 3,
      cryogenicCycleSampleCount: 4,
      couponFatigueCurveSampleCount: 2,
      dielectricResponseFrequencySampleCount: 8,
      conductivityTemperatureSampleCount: 6,
      roughnessMapSampleCount: 2500,
      fabricationToleranceMapSampleCount: 4000,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      materialCoupon: sparseCouponEvidence,
    });
    const materialSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "material_coupon",
    );
    const budget = buildNhm2TileSourceMaterialCouponOperatingBudget({
      generatedAt,
      materialCouponEvidence: sparseCouponEvidence,
    });

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(materialSurface?.status).toBe("fail");
    expect(materialSurface?.blockers).toEqual(
      expect.arrayContaining([
        "tensile_stress_coupon_sample_count_below_5",
        "fracture_yield_coupon_sample_count_below_5",
        "cryogenic_cycle_sample_count_below_10",
        "coupon_fatigue_curve_sample_count_below_5",
        "dielectric_response_frequency_sample_count_below_16",
        "conductivity_temperature_sample_count_below_16",
        "coupon_roughness_map_sample_count_below_10000",
        "fabrication_tolerance_map_sample_count_below_10000",
      ]),
    );
    expect(materialSurface?.numericalMargins.couponSamplingComplete).toBe(0);
    expect(materialSurface?.numericalMargins.tensileStressCouponSampleCountMargin).toBe(0.4);
    expect(materialSurface?.numericalMargins.roughnessMapSampleCountMargin).toBe(0.25);
    expect(budget.summary.materialCouponEvidenceReady).toBe(false);
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.derivedOperatingBudget.couponSamplingComplete).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "tensile_stress_coupon_sample_count_below_5_for_operating_budget",
        "fracture_yield_coupon_sample_count_below_5_for_operating_budget",
        "cryogenic_cycle_sample_count_below_10_for_operating_budget",
        "coupon_fatigue_curve_sample_count_below_5_for_operating_budget",
        "dielectric_response_frequency_sample_count_below_16_for_operating_budget",
        "conductivity_temperature_sample_count_below_16_for_operating_budget",
        "coupon_roughness_map_sample_count_below_10000_for_operating_budget",
        "fabrication_tolerance_map_sample_count_below_10000_for_operating_budget",
      ]),
    );
    expect(budget.requiredCorrections.tensileStressCouponSampleCountShortfall).toBe(3);
    expect(budget.requiredCorrections.fractureYieldCouponSampleCountShortfall).toBe(2);
    expect(budget.requiredCorrections.cryogenicCycleSampleCountShortfall).toBe(6);
    expect(budget.requiredCorrections.couponFatigueCurveSampleCountShortfall).toBe(3);
    expect(budget.requiredCorrections.dielectricResponseFrequencySampleCountShortfall).toBe(8);
    expect(budget.requiredCorrections.conductivityTemperatureSampleCountShortfall).toBe(10);
    expect(budget.requiredCorrections.roughnessMapSampleCountShortfall).toBe(7500);
    expect(budget.requiredCorrections.fabricationToleranceMapSampleCountShortfall).toBe(6000);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("falsifies material-coupon operating budget when strength or metrology margins fail", () => {
    const budget = buildNhm2TileSourceMaterialCouponOperatingBudget({
      generatedAt,
      materialCouponEvidence: {
        evidenceTier: "measured",
        evidenceRef: "receipt://coupon/tin/failing-operating-budget-v1",
        architectureId: "topology_optimized_lattice_tin",
        loadCaseRef: "receipt://coupon/tin/failing-load-case-v1",
        layerStackCompatibilityRef: "receipt://coupon/tin/failing-stack-compatibility-v1",
        topologyOptimizationRef:
          "receipt://coupon/tin/failing-topology-optimization-v1",
        depositionProcessRef: "receipt://coupon/tin/failing-deposition-process-v1",
        residualStressUniformityMapRef:
          "receipt://coupon/tin/failing-residual-stress-map-v1",
        interlayerAdhesionProtocolRef:
          "receipt://coupon/tin/failing-interlayer-adhesion-v1",
        tensileStressCurveRef: "receipt://coupon/tin/failing-tensile-curve-v1",
        fractureYieldCurveRef: "receipt://coupon/tin/failing-fracture-yield-curve-v1",
        cryogenicStateRef: "receipt://coupon/tin/failing-cryogenic-state-v1",
        cryogenicCycleRef: "receipt://coupon/tin/failing-cryogenic-cycle-v1",
        couponFatigueCurveRef: "receipt://coupon/tin/failing-fatigue-curve-v1",
        roughnessMapRef: "receipt://coupon/tin/failing-roughness-map-v1",
        fabricationToleranceMapRef: "receipt://coupon/tin/failing-fabrication-map-v1",
        material: "ultra_high_stress_tin",
        measuredTensileStressPa: 4e8,
        fractureOrYieldStressPa: 8e8,
        supportStressPa: 5.45707087858e8,
        couponCycleCountToFailure: 5e8,
        couponRequiredCycleCount: 1e9,
        cryogenicTemperatureK: 6,
        dielectricResponseRef: null,
        conductivityRef: null,
        materialResponseFrequencyHz: 7.5e9,
        dielectricResponseTemperatureK: 6,
        conductivityTemperatureK: 6,
        dielectricLossTangent: null,
        conductivitySiemensPerMeter: null,
        roughnessRmsMeters: 2e-10,
        fabricationToleranceMeters: 1e-9,
        stackCompatibilityCouponSampleCount: 8,
        stackCompatibilityLayerCount: 447,
        stackCompatibilitySupportFraction: 0.26,
        stackCompatibilityActiveAreaLostFraction: 0.08,
      },
    });

    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "measured_tensile_stress_below_support_stress_operating_budget",
        "fracture_or_yield_margin_below_2x_support_stress_operating_budget",
        "coupon_fatigue_cycle_margin_below_required_campaign_cycles_operating_budget",
        "cryogenic_temperature_above_4k_operating_budget",
        "dielectric_response_ref_missing_for_operating_budget",
        "conductivity_ref_missing_for_operating_budget",
        "material_response_frequency_not_15ghz_for_operating_budget",
        "dielectric_response_temperature_above_4k_for_operating_budget",
        "conductivity_temperature_above_4k_for_operating_budget",
        "material_response_numeric_values_missing_for_operating_budget",
        "coupon_roughness_rms_above_0p1nm_operating_budget",
        "fabrication_tolerance_above_0p5nm_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.tensileStressMargin).toBeLessThan(1);
    expect(budget.derivedOperatingBudget.fractureOrYieldStressMargin).toBeLessThan(1);
    expect(budget.derivedOperatingBudget.roughnessRmsMargin).toBeLessThan(1);
    expect(budget.requiredCorrections.materialMismatch).toBe(false);
    expect(budget.requiredCorrections.tensileStressShortfallPa).toBeCloseTo(1.45707087858e8);
    expect(budget.requiredCorrections.fractureOrYieldStressShortfallPa).toBeCloseTo(
      2.91414175716e8,
    );
    expect(budget.requiredCorrections.couponCycleCountShortfall).toBe(5e8);
    expect(budget.requiredCorrections.cryogenicTemperatureReductionK).toBe(2);
    expect(budget.requiredCorrections.materialResponseFrequencyAbsDeltaHz).toBe(7.5e9);
    expect(budget.requiredCorrections.dielectricTemperatureReductionK).toBe(2);
    expect(budget.requiredCorrections.conductivityTemperatureReductionK).toBe(2);
    expect(budget.requiredCorrections.roughnessRmsReductionMeters).toBeCloseTo(1e-10, 15);
    expect(budget.requiredCorrections.fabricationToleranceReductionMeters).toBeCloseTo(5e-10, 15);
    expect(budget.requiredCorrections.missingCurveAndMapRefCount).toBe(0);
    expect(budget.requiredCorrections.missingCampaignCompatibilityRefCount).toBe(0);
    expect(budget.requiredCorrections.missingMaterialResponseRefCount).toBe(2);
    expect(budget.requiredCorrections.materialResponseNumericValuesAvailable).toBe(false);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("blocks scalar-only material-coupon values without stress curve and metrology provenance", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      materialCoupon: {
        evidenceTier: "measured",
        evidenceRef: "receipt://coupon/tin/scalar-only-v1",
        material: "ultra_high_stress_tin",
        measuredTensileStressPa: 2.3e9,
        fractureOrYieldStressPa: 2.1e9,
        supportStressPa: 5.45707087858e8,
        cryogenicTemperatureK: 4,
        dielectricResponseRef: "receipt://dielectric/tin/v1",
        conductivityRef: "receipt://conductivity/tin/v1",
        roughnessRmsMeters: 5e-11,
        fabricationToleranceMeters: 5e-10,
      },
    });
    const plan = buildNhm2TileSourceMaterialCouponTestPlan({ materialEvidenceReceipts: receipts });
    const budget = buildNhm2TileSourceMaterialCouponOperatingBudget({
      generatedAt,
      materialCouponEvidence: {
        evidenceTier: "measured",
        evidenceRef: "receipt://coupon/tin/scalar-only-v1",
        material: "ultra_high_stress_tin",
        measuredTensileStressPa: 2.3e9,
        fractureOrYieldStressPa: 2.1e9,
        supportStressPa: 5.45707087858e8,
        cryogenicTemperatureK: 4,
        dielectricResponseRef: "receipt://dielectric/tin/v1",
        conductivityRef: "receipt://conductivity/tin/v1",
        roughnessRmsMeters: 5e-11,
        fabricationToleranceMeters: 5e-10,
      },
    });
    const materialSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "material_coupon",
    );
    const provenance = plan.testItems.find((item) => item.testId === "coupon_provenance");

    expect(materialSurface?.status).toBe("fail");
    expect(materialSurface?.blockers).toEqual(
      expect.arrayContaining([
        "tensile_stress_curve_ref_missing",
        "fracture_yield_curve_ref_missing",
        "cryogenic_state_ref_missing",
        "candidate_stack_architecture_id_missing",
        "candidate_stack_load_case_ref_missing",
        "candidate_stack_layer_compatibility_ref_missing",
        "candidate_stack_topology_optimization_ref_missing",
        "candidate_stack_deposition_process_ref_missing",
        "candidate_stack_residual_stress_uniformity_map_ref_missing",
        "candidate_stack_interlayer_adhesion_protocol_ref_missing",
        "stack_compatibility_coupon_sample_count_missing",
        "stack_compatibility_layer_count_missing",
        "stack_compatibility_support_fraction_missing",
        "stack_compatibility_active_area_lost_fraction_missing",
        "cryogenic_cycle_ref_missing",
        "coupon_fatigue_curve_ref_missing",
        "coupon_fatigue_cycle_margin_missing",
        "coupon_roughness_map_ref_missing",
        "fabrication_tolerance_map_ref_missing",
        "material_response_numeric_values_missing",
      ]),
    );
    expect(materialSurface?.numericalMargins.couponProvenanceRefsAvailable).toBe(0);
    expect(plan.summary.nextRequiredTestId).toBe("coupon_provenance");
    expect(provenance?.status).toBe("falsifying");
    expect(budget.summary.materialCouponEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.curveAndMapRefsAvailable).toBe(false);
    expect(budget.requiredCorrections.materialMismatch).toBe(false);
    expect(budget.requiredCorrections.tensileStressShortfallPa).toBe(0);
    expect(budget.requiredCorrections.fractureOrYieldStressShortfallPa).toBe(0);
    expect(budget.requiredCorrections.missingCurveAndMapRefCount).toBe(7);
    expect(budget.requiredCorrections.missingCampaignCompatibilityRefCount).toBe(7);
    expect(budget.requiredCorrections.missingMaterialResponseRefCount).toBe(0);
    expect(budget.requiredCorrections.materialResponseNumericValuesAvailable).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "tensile_stress_curve_ref_missing_for_operating_budget",
        "fracture_yield_curve_ref_missing_for_operating_budget",
        "cryogenic_state_ref_missing_for_operating_budget",
        "candidate_stack_architecture_id_missing_for_operating_budget",
        "candidate_stack_load_case_ref_missing_for_operating_budget",
        "candidate_stack_layer_compatibility_ref_missing_for_operating_budget",
        "candidate_stack_topology_optimization_ref_missing_for_operating_budget",
        "candidate_stack_deposition_process_ref_missing_for_operating_budget",
        "candidate_stack_residual_stress_uniformity_map_ref_missing_for_operating_budget",
        "candidate_stack_interlayer_adhesion_protocol_ref_missing_for_operating_budget",
        "stack_compatibility_coupon_sample_count_missing_for_operating_budget",
        "stack_compatibility_layer_count_missing_for_operating_budget",
        "stack_compatibility_support_fraction_missing_for_operating_budget",
        "stack_compatibility_active_area_lost_fraction_missing_for_operating_budget",
        "cryogenic_cycle_ref_missing_for_operating_budget",
        "coupon_fatigue_curve_ref_missing_for_operating_budget",
        "coupon_fatigue_cycle_margin_missing_for_operating_budget",
        "coupon_roughness_map_ref_missing_for_operating_budget",
        "fabrication_tolerance_map_ref_missing_for_operating_budget",
        "material_response_numeric_values_missing_for_operating_budget",
      ]),
    );
  });

  it("maps an absent force-gap receipt to force-gap provenance", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourceForceGapPullInTestPlan({
      materialEvidenceReceipts: receipts,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
    });
    const provenance = plan.testItems.find((item) => item.testId === "force_gap_provenance");

    expect(isNhm2TileSourceForceGapPullInTestPlan(plan)).toBe(true);
    expect(plan.forceGapTarget.operatingGapMeters).toBe(8e-9);
    expect(plan.forceGapTarget.forceGradientConsistencyMin).toBe(0.75);
    expect(plan.summary.forceGapReceiptStatus).toBe("missing");
    expect(plan.summary.nextRequiredTestId).toBe("force_gap_provenance");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://force_gap_pull_in/provenance_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain(
      "cannot identify the apparatus",
    );
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "roughness_patch_potential",
        "active_control_energy_noise_heat_timing",
        "full_apparatus_tensor",
        "material_credibility_gate",
        "covariant_conservation",
      ]),
    );
    expect(provenance?.status).toBe("open");
    expect(provenance?.blockerIds).toContain("force_gap_curve_and_pull_in_margin_at_8nm_missing");
    expect(provenance?.measurementTargets).toMatchObject({
      requiredEvidenceTier: "measured_or_validated_simulation",
      requiredCurveAndModelRefCount: 7,
      operatingGapMeters: 8e-9,
      layerCount: 447,
    });
    expect(provenance?.artifactToProduce).toBe("receipt://force_gap_pull_in/provenance_v1");
    expect(plan.summary.forceGapEvidenceReady).toBe(false);
    expect(plan.claimBoundary.forceGapPassIsNotFullApparatusTensor).toBe(true);
  });

  it("marks a measured force-gap pull-in failure as falsifying", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      forceGapPullIn: {
        evidenceTier: "measured",
        evidenceRef: "receipt://force-gap/failing-8nm-v1",
        ...forceGapProtocolRefs,
        forceGapCurveRef: "receipt://force-gap/failing-Fg-curve-v1",
        forceGradientCurveRef: "receipt://force-gap/failing-dFdg-curve-v1",
        stiffnessModelRef: "receipt://force-gap/failing-stiffness-model-v1",
        gapMeters: 8e-9,
        casimirForceN: 1.42e4,
        forceGradientNPerM: 3e6,
        effectiveSpringConstantNPerM: 1e6,
        stictionMargin: 0.8,
        activeGapControlAuthorityN: 1e4,
      },
    });
    const plan = buildNhm2TileSourceForceGapPullInTestPlan({ materialEvidenceReceipts: receipts });
    const forceGradient = plan.testItems.find((item) => item.testId === "force_gradient");
    const pullIn = plan.testItems.find((item) => item.testId === "pull_in_margin");
    const stiction = plan.testItems.find((item) => item.testId === "stiction_margin");
    const activeAuthority = plan.testItems.find(
      (item) => item.testId === "active_gap_control_authority",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(plan.summary.forceGapReceiptStatus).toBe("fail");
    expect(plan.summary.nextRequiredTestId).toBe("force_gradient");
    expect(plan.summary.pullInMargin).toBeLessThan(1);
    expect(plan.summary.stictionMargin).toBeLessThan(1);
    expect(plan.summary.activeAuthorityMargin).toBeLessThan(1);
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://force_gap_pull_in/force_gradient_8nm_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain("pull-in analysis");
    expect(plan.summary.nextBlockedCampaignDomains).toContain("covariant_conservation");
    expect(plan.summary.falsifiesCurrentCandidate).toBe(true);
    expect(forceGradient?.status).toBe("falsifying");
    expect(forceGradient?.blockerIds).toContain("force_gradient_inconsistent_with_force_curve_at_8nm");
    expect(forceGradient?.measurementTargets).toMatchObject({
      operatingGapMeters: 8e-9,
      idealForceGradientNPerM: expect.closeTo(7.094192142140448e12, 3),
      forceGradientConsistencyMin: 0.75,
      gradientConsistencyFormula: "symmetric_ratio(dFdg, 4*abs(F)/g)",
    });
    expect(pullIn?.status).toBe("falsifying");
    expect(pullIn?.measurementTargets).toMatchObject({
      pullInMarginMin: 1,
      pullInMarginFormula: "effectiveSpringConstantNPerM / forceGradientNPerM",
      idealGradientReferenceNPerM: expect.closeTo(7.094192142140448e12, 3),
    });
    expect(stiction?.status).toBe("falsifying");
    expect(stiction?.measurementTargets).toMatchObject({
      stictionMarginMin: 1,
      stictionProtocolRefRequired: true,
    });
    expect(activeAuthority?.status).toBe("falsifying");
    expect(activeAuthority?.blockerIds).toContain("active_gap_control_authority_below_1p2x_force");
    expect(activeAuthority?.measurementTargets).toMatchObject({
      activeControlAuthorityFactorMin: 1.2,
      ideal447LayerStackForceAbsN: expect.closeTo(14188.384284280897, 3),
      activeGapControlAuthorityMinN: expect.closeTo(17026.061141137077, 3),
    });
    expect(activeAuthority?.falsificationRule).toContain("below 1.2x");
    expect(plan.summary.transportClaimAllowed).toBe(false);
  });

  it("falsifies force-gap receipts with nonphysical force, stiffness, stiction, and authority values", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      forceGapPullIn: {
        evidenceTier: "measured",
        evidenceRef: "receipt://force-gap/nonphysical-values-v1",
        ...forceGapProtocolRefs,
        forceGapCurveRef: "receipt://force-gap/nonphysical-Fg-curve-v1",
        forceGradientCurveRef: "receipt://force-gap/nonphysical-dFdg-curve-v1",
        stiffnessModelRef: "receipt://force-gap/nonphysical-stiffness-model-v1",
        curveMinGapMeters: 9e-9,
        curveMaxGapMeters: 7e-9,
        gapMeters: -8e-9,
        casimirForceN: 0,
        forceGradientNPerM: -1,
        effectiveSpringConstantNPerM: -1,
        stictionMargin: -0.1,
        activeGapControlAuthorityN: -1,
      },
    });
    const forceSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "force_gap_pull_in",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(forceSurface?.status).toBe("fail");
    expect(forceSurface?.blockers).toEqual(
      expect.arrayContaining([
        "force_gap_curve_bounds_invalid",
        "force_gap_value_invalid",
        "force_gap_not_at_8nm",
        "casimir_force_at_gap_invalid",
        "force_gradient_at_gap_invalid",
        "force_gradient_consistency_with_force_curve_missing",
        "effective_spring_constant_invalid",
        "pull_in_margin_missing",
        "stiction_margin_invalid",
        "active_gap_control_authority_invalid",
        "active_gap_control_authority_missing",
      ]),
    );
    expect(forceSurface?.numericalMargins.pullInMargin).toBeNull();
    expect(forceSurface?.numericalMargins.activeAuthorityMargin).toBeNull();
    expect(forceSurface?.numericalMargins.expectedGradientFromSuppliedForce).toBeNull();
    expect(forceSurface?.numericalMargins.forceGradientConsistencyMargin).toBeNull();
    expect(receipts.summary.physicalViabilityClaimAllowed).toBe(false);
    expect(receipts.summary.transportClaimAllowed).toBe(false);
  });

  it("keeps scalar-only force-gap evidence blocked without curve and stiffness provenance", () => {
    const scalarOnlyForceGapEvidence = {
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://force-gap/scalar-only-8nm-v1",
      gapMeters: 8e-9,
      casimirForceN: 1.42e4,
      forceGradientNPerM: 7.1e12,
      effectiveSpringConstantNPerM: 8.6e12,
      stictionMargin: 1.5,
      activeGapControlAuthorityN: 2e4,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      forceGapPullIn: scalarOnlyForceGapEvidence,
    });
    const plan = buildNhm2TileSourceForceGapPullInTestPlan({ materialEvidenceReceipts: receipts });
    const budget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      forceGapPullInEvidence: scalarOnlyForceGapEvidence,
    });
    const provenance = plan.testItems.find((item) => item.testId === "force_gap_provenance");

    expect(plan.summary.forceGapEvidenceReady).toBe(false);
    expect(plan.summary.nextRequiredTestId).toBe("force_gap_provenance");
    expect(provenance?.blockerIds).toEqual(
      expect.arrayContaining([
        "force_gap_curve_ref_missing",
        "force_gradient_curve_ref_missing",
        "force_gap_stiffness_model_ref_missing",
      ]),
    );
    expect(budget.summary.forceGapEvidenceReady).toBe(false);
    expect(budget.margins.curveModelRefsAvailable).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "force_gap_curve_ref_missing_for_load_budget",
        "force_gradient_curve_ref_missing_for_load_budget",
        "force_gap_stiffness_model_ref_missing_for_load_budget",
      ]),
    );
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("builds the frozen 447-layer ideal force-gap load budget", () => {
    const budget = buildNhm2TileSourceForceGapLoadBudget({ generatedAt });

    expect(isNhm2TileSourceForceGapLoadBudget(budget)).toBe(true);
    expect(budget.frozenGeometry.gapMeters).toBe(8e-9);
    expect(budget.frozenGeometry.tileAreaMeters2).toBe(1e-4);
    expect(budget.frozenGeometry.layerCount).toBe(447);
    expect(budget.idealLoadBudget.forcePer447LayerStackN).toBeCloseTo(14188.38, 2);
    expect(budget.idealLoadBudget.forceScaleKilonewtons).toBeCloseTo(14.188, 2);
    expect(budget.idealLoadBudget.requiredActiveGapControlAuthorityN).toBeCloseTo(17026.06, 2);
    expect(budget.idealLoadBudget.forceGradientConsistencyMin).toBe(0.75);
    expect(budget.suppliedForceGapEvidence.stictionMargin).toBeNull();
    expect(budget.margins.stictionMarginToMinimum).toBeNull();
    expect(budget.requiredCorrections.pullInMarginDefinition).toBe(
      "effectiveSpringConstantNPerM / idealForceGradientNPerM",
    );
    expect(budget.requiredCorrections.springConstantMinNPerM).toBe(
      budget.idealLoadBudget.forceGradientNPerM,
    );
    expect(budget.requiredCorrections.springConstantShortfallNPerM).toBeNull();
    expect(budget.requiredCorrections.activeGapControlAuthorityMinN).toBe(
      budget.idealLoadBudget.requiredActiveGapControlAuthorityN,
    );
    expect(budget.requiredCorrections.activeGapControlAuthorityShortfallN).toBeNull();
    expect(budget.requiredCorrections.suppliedForceAbsTargetN).toBeCloseTo(14188.38, 2);
    expect(budget.summary.firstBlocker).toBe("force_gap_receipt_missing_for_load_budget");
    expect(budget.claimBoundary.internalLoadIsNotThrust).toBe(true);
  });

  it("clears the force-gap load budget with validated stiffness and control authority", () => {
    const budget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });

    expect(budget.summary.forceGapEvidenceReady).toBe(true);
    expect(budget.summary.firstBlocker).toBe("none");
    expect(budget.margins.curveModelRefsAvailable).toBe(true);
    expect(budget.margins.localCurveSamplingComplete).toBe(true);
    expect(budget.margins.localSampleWindowMargin).toBe(1);
    expect(budget.margins.forceGapCurveLocalSampleMargin).toBeGreaterThan(1);
    expect(budget.margins.forceGradientCurveLocalSampleMargin).toBeGreaterThan(1);
    expect(budget.suppliedForceGapEvidence.forceGapCurveRef).toBe("receipt://force-gap/Fg-curve-8nm-v1");
    expect(budget.margins.suppliedForceToIdealStackForce).toBeCloseTo(1, 1);
    expect(budget.margins.suppliedGradientConsistencyWithForceCurve).toBeGreaterThan(0.75);
    expect(budget.margins.pullInMarginToIdealGradient).toBeGreaterThan(1);
    expect(budget.margins.stictionMarginToMinimum).toBeGreaterThan(1);
    expect(budget.margins.activeAuthorityMarginToIdealLoad).toBeGreaterThan(1);
    expect(budget.requiredCorrections.springConstantShortfallNPerM).toBe(0);
    expect(budget.requiredCorrections.stictionMarginShortfall).toBe(0);
    expect(budget.requiredCorrections.activeGapControlAuthorityShortfallN).toBe(0);
    expect(budget.requiredCorrections.forceGradientConsistencyShortfall).toBe(0);
    expect(budget.requiredCorrections.localSampleWindowShortfallMeters).toBe(0);
    expect(budget.requiredCorrections.forceGapCurveLocalSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.forceGradientCurveLocalSampleCountShortfall).toBe(0);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("blocks force-gap load evidence with sparse local F(g) and dFdg samples near 8 nm", () => {
    const sparseEvidence = {
      ...passingEvidence.forceGapPullIn!,
      evidenceRef: "receipt://force-gap/sparse-local-sampling-v1",
      localSampleWindowMeters: 4e-10,
      forceGapCurveSampleCountNearOperatingGap: 5,
      forceGradientCurveSampleCountNearOperatingGap: 4,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      forceGapPullIn: sparseEvidence,
    });
    const forceSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "force_gap_pull_in",
    );
    const budget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      forceGapPullInEvidence: sparseEvidence,
    });

    expect(forceSurface?.status).toBe("fail");
    expect(forceSurface?.blockers).toEqual(
      expect.arrayContaining([
        "force_gap_local_sample_window_below_1nm",
        "force_gap_curve_local_sample_count_below_9",
        "force_gradient_curve_local_sample_count_below_9",
      ]),
    );
    expect(forceSurface?.numericalMargins.localSampleWindowMargin).toBeCloseTo(0.4, 12);
    expect(forceSurface?.numericalMargins.forceGapCurveLocalSampleMargin).toBeCloseTo(
      5 / 9,
      12,
    );
    expect(forceSurface?.numericalMargins.forceGradientCurveLocalSampleMargin).toBeCloseTo(
      4 / 9,
      12,
    );
    expect(budget.summary.forceGapEvidenceReady).toBe(false);
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.margins.localCurveSamplingComplete).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "force_gap_local_sample_window_below_1nm_for_load_budget",
        "force_gap_curve_local_sample_count_below_9_for_load_budget",
        "force_gradient_curve_local_sample_count_below_9_for_load_budget",
      ]),
    );
    expect(budget.requiredCorrections.localSampleWindowShortfallMeters).toBeCloseTo(
      6e-10,
      18,
    );
    expect(budget.requiredCorrections.forceGapCurveLocalSampleCountShortfall).toBe(4);
    expect(budget.requiredCorrections.forceGradientCurveLocalSampleCountShortfall).toBe(5);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("falsifies the load path when measured stiffness and control authority are below the ideal budget", () => {
    const budget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      forceGapPullInEvidence: {
        evidenceTier: "measured",
        evidenceRef: "receipt://force-gap/failing-budget-v1",
        ...forceGapProtocolRefs,
        forceGapCurveRef: "receipt://force-gap/failing-Fg-curve-v1",
        forceGradientCurveRef: "receipt://force-gap/failing-dFdg-curve-v1",
        stiffnessModelRef: "receipt://force-gap/failing-stiffness-model-v1",
        gapMeters: 8e-9,
        casimirForceN: 1.42e4,
        forceGradientNPerM: 3e6,
        effectiveSpringConstantNPerM: 1e12,
        stictionMargin: 0.8,
        activeGapControlAuthorityN: 1e4,
      },
    });

    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "force_gap_gradient_inconsistent_with_force_curve_for_load_budget",
        "ideal_load_pull_in_margin_below_one",
        "force_gap_stiction_margin_below_one_for_load_budget",
        "ideal_load_active_control_authority_below_1p2x_stack_force",
      ]),
    );
    expect(budget.margins.suppliedGradientConsistencyWithForceCurve).toBeLessThan(0.75);
    expect(budget.margins.pullInMarginToIdealGradient).toBeLessThan(1);
    expect(budget.margins.stictionMarginToMinimum).toBeLessThan(1);
    expect(budget.margins.activeAuthorityMarginToIdealLoad).toBeLessThan(1);
    expect(budget.requiredCorrections.springConstantShortfallNPerM).toBeGreaterThan(0);
    expect(budget.requiredCorrections.stictionMarginShortfall).toBeCloseTo(0.2, 6);
    expect(budget.requiredCorrections.activeGapControlAuthorityShortfallN).toBeGreaterThan(0);
    expect(budget.requiredCorrections.forceGradientConsistencyShortfall).toBeGreaterThan(0);
    expect(budget.requiredCorrections.suppliedForceDeltaFromIdealStackForceN).toBeCloseTo(
      11.62,
      1,
    );
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("maps an absent roughness/patch receipt to roughness-patch provenance", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourceRoughnessPatchTestPlan({
      materialEvidenceReceipts: receipts,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
    });
    const provenance = plan.testItems.find((item) => item.testId === "roughness_patch_provenance");

    expect(isNhm2TileSourceRoughnessPatchTestPlan(plan)).toBe(true);
    expect(plan.roughnessPatchTarget.operatingGapMeters).toBe(8e-9);
    expect(plan.roughnessPatchTarget.asperityMaxMeters).toBe(4e-9);
    expect(plan.summary.roughnessPatchReceiptStatus).toBe("missing");
    expect(plan.summary.nextRequiredTestId).toBe("roughness_patch_provenance");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://roughness_patch_metrology/provenance_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain(
      "paired 8 nm surfaces",
    );
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "force_gap_pull_in",
        "active_control_energy_noise_heat_timing",
        "full_apparatus_tensor",
        "material_credibility_gate",
        "covariant_conservation",
      ]),
    );
    expect(provenance?.status).toBe("open");
    expect(provenance?.blockerIds).toContain("roughness_asperity_tail_and_patch_potential_map_missing");
    expect(provenance?.measurementTargets).toMatchObject({
      requiredEvidenceTier: "measured_or_validated_simulation",
      requiredMapAndModelRefCount: 8,
      operatingGapMeters: 8e-9,
      pairedSurfaceRegistrationRequired: true,
    });
    expect(provenance?.artifactToProduce).toBe(
      "receipt://roughness_patch_metrology/provenance_v1",
    );
    expect(plan.summary.roughnessPatchEvidenceReady).toBe(false);
    expect(plan.claimBoundary.roughnessPatchPassIsNotFullApparatusTensor).toBe(true);
  });

  it("marks roughness, asperity, patch, and residual electrostatic failures as falsifying", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      roughnessPatch: {
        evidenceTier: "measured",
        evidenceRef: "receipt://roughness-patch/failing-8nm-v1",
        ...roughnessPatchProtocolRefs,
        roughnessMapRef: "receipt://roughness-patch/maps/failing-roughness-height-v1",
        asperityDistributionRef: "receipt://roughness-patch/maps/failing-asperity-tail-v1",
        patchVoltageMapRef: "receipt://roughness-patch/maps/failing-patch-voltage-v1",
        roughnessRmsMeters: 2e-10,
        asperityP99Meters: 2.5e-9,
        asperityP999Meters: 3.5e-9,
        asperityMaxMeters: 5e-9,
        patchVoltageRmsVolts: 0.02,
        residualElectrostaticForceFraction: 0.08,
        correctionRef: "receipt://roughness-patch/correction-v1",
      },
    });
    const plan = buildNhm2TileSourceRoughnessPatchTestPlan({ materialEvidenceReceipts: receipts });
    const roughness = plan.testItems.find((item) => item.testId === "roughness_rms");
    const asperityTail = plan.testItems.find((item) => item.testId === "asperity_tail");
    const patchVoltage = plan.testItems.find((item) => item.testId === "patch_voltage_rms");
    const residual = plan.testItems.find((item) => item.testId === "residual_electrostatic_force");

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(plan.summary.roughnessPatchReceiptStatus).toBe("fail");
    expect(plan.summary.nextRequiredTestId).toBe("roughness_rms");
    expect(plan.summary.roughnessRmsMeters).toBe(2e-10);
    expect(plan.summary.asperityMaxMargin).toBeLessThan(1);
    expect(plan.summary.patchVoltageRmsVolts).toBe(0.02);
    expect(plan.summary.residualElectrostaticForceFraction).toBe(0.08);
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://roughness_patch_metrology/roughness_rms_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain("surface process");
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "force_gap_pull_in",
        "active_control_energy_noise_heat_timing",
        "full_apparatus_tensor",
        "material_credibility_gate",
      ]),
    );
    expect(plan.summary.falsifiesCurrentCandidate).toBe(true);
    expect(roughness?.status).toBe("falsifying");
    expect(roughness?.measurementTargets).toMatchObject({
      roughnessRmsMaxMeters: 1e-10,
      roughnessMapLateralResolutionMaxMeters: 5e-10,
      roughnessScanAreaFractionMin: 0.95,
      operatingGapMeters: 8e-9,
    });
    expect(asperityTail?.status).toBe("falsifying");
    expect(asperityTail?.measurementTargets).toMatchObject({
      asperityP999MaxMeters: 3e-9,
      asperityMaxMeters: 4e-9,
      minimumGapClearanceRequiredMeters: 4e-9,
      operatingGapMeters: 8e-9,
    });
    expect(patchVoltage?.status).toBe("falsifying");
    expect(patchVoltage?.measurementTargets).toMatchObject({
      patchVoltageRmsMaxVolts: 0.01,
      patchVoltageCorrelationLengthPositive: true,
    });
    expect(residual?.status).toBe("falsifying");
    expect(residual?.blockerIds).toContain("residual_electrostatic_force_correction_above_5pct_or_missing");
    expect(residual?.measurementTargets).toMatchObject({
      residualElectrostaticForceFractionMax: 0.05,
      residualElectrostaticForceMaxN: expect.closeTo(709.419214214, 3),
    });
    expect(residual?.falsificationRule).toContain("exceeds 5%");
    expect(plan.summary.transportClaimAllowed).toBe(false);
  });

  it("falsifies roughness/patch receipts when RMS or residual fraction values are negative", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      roughnessPatch: {
        ...passingEvidence.roughnessPatch!,
        roughnessRmsMeters: -5e-11,
        patchVoltageRmsVolts: -5e-3,
        residualElectrostaticForceFraction: -0.02,
      },
    });
    const roughnessSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "roughness_patch_metrology",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(roughnessSurface?.status).toBe("fail");
    expect(roughnessSurface?.blockers).toContain("roughness_rms_above_0p1nm_or_missing");
    expect(roughnessSurface?.blockers).toContain("patch_voltage_rms_above_10mv_or_missing");
    expect(roughnessSurface?.blockers).toContain(
      "residual_electrostatic_force_correction_above_5pct_or_missing",
    );
    expect(roughnessSurface?.numericalMargins.roughnessRmsMeters).toBe(-5e-11);
    expect(roughnessSurface?.numericalMargins.patchVoltageRmsVolts).toBe(-5e-3);
    expect(
      roughnessSurface?.numericalMargins.residualElectrostaticForceFraction,
    ).toBe(-0.02);
  });

  it("falsifies roughness/patch receipts and budgets with nonphysical metrology domains", () => {
    const invalidRoughnessPatch = {
      ...passingEvidence.roughnessPatch!,
      mapLateralResolutionMeters: -1e-9,
      scanAreaFraction: 1.2,
      roughnessRmsMeters: Number.NaN,
      asperityP99Meters: 0,
      asperityP999Meters: -1e-9,
      asperityMaxMeters: 0,
      patchVoltageRmsVolts: Number.NaN,
      patchVoltageCorrelationLengthMeters: Number.POSITIVE_INFINITY,
      residualElectrostaticForceFraction: -0.01,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      roughnessPatch: invalidRoughnessPatch,
    });
    const budget = buildNhm2TileSourceRoughnessPatchOperatingBudget({
      generatedAt,
      roughnessPatchEvidence: invalidRoughnessPatch,
    });
    const roughnessSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "roughness_patch_metrology",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(roughnessSurface?.status).toBe("fail");
    expect(roughnessSurface?.blockers).toEqual(
      expect.arrayContaining([
        "roughness_map_lateral_resolution_invalid",
        "roughness_scan_area_fraction_invalid",
        "roughness_rms_invalid",
        "asperity_p99_invalid",
        "asperity_p999_invalid",
        "asperity_tail_margin_invalid",
        "patch_voltage_correlation_length_invalid",
        "patch_voltage_rms_invalid",
        "residual_electrostatic_force_fraction_invalid",
      ]),
    );
    expect(roughnessSurface?.numericalMargins.roughnessMapResolutionMargin).toBeNull();
    expect(roughnessSurface?.numericalMargins.scanAreaCoverageMargin).toBeNull();
    expect(roughnessSurface?.numericalMargins.asperityMaxMargin).toBeNull();
    expect(roughnessSurface?.numericalMargins.patchVoltageDerivedElectrostaticPressurePa).toBeNull();
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "roughness_map_lateral_resolution_invalid_for_operating_budget",
        "roughness_scan_area_fraction_invalid_for_operating_budget",
        "roughness_rms_invalid_for_operating_budget",
        "asperity_p99_invalid_for_operating_budget",
        "asperity_p999_invalid_for_operating_budget",
        "asperity_max_invalid_for_operating_budget",
        "patch_voltage_correlation_length_invalid_for_operating_budget",
        "patch_voltage_invalid_for_operating_budget",
        "residual_electrostatic_force_fraction_invalid_for_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.roughnessMapResolutionMargin).toBeNull();
    expect(budget.derivedOperatingBudget.scanAreaCoverageMargin).toBeNull();
    expect(budget.derivedOperatingBudget.asperityMaxMargin).toBeNull();
    expect(budget.derivedOperatingBudget.minimumGapClearanceMeters).toBeNull();
    expect(budget.derivedOperatingBudget.patchVoltageDerivedElectrostaticPressurePa).toBeNull();
    expect(budget.derivedOperatingBudget.residualElectrostaticForceN).toBeNull();
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("builds roughness/patch operating targets from the frozen 8 nm gap and load budget", () => {
    const budget = buildNhm2TileSourceRoughnessPatchOperatingBudget({ generatedAt });

    expect(isNhm2TileSourceRoughnessPatchOperatingBudget(budget)).toBe(true);
    expect(budget.operatingTargets.gapMeters).toBe(8e-9);
    expect(budget.operatingTargets.roughnessRmsMaxMeters).toBe(1e-10);
    expect(budget.operatingTargets.roughnessMapLateralResolutionMaxMeters).toBe(5e-10);
    expect(budget.operatingTargets.roughnessMapSampleCountMin).toBe(10000);
    expect(budget.operatingTargets.asperityTailSampleCountMin).toBe(1000);
    expect(budget.operatingTargets.patchVoltageMapSampleCountMin).toBe(10000);
    expect(budget.operatingTargets.roughnessScanAreaFractionMin).toBe(0.95);
    expect(budget.operatingTargets.asperityP99MaxMeters).toBe(2e-9);
    expect(budget.operatingTargets.asperityP999MaxMeters).toBe(3e-9);
    expect(budget.operatingTargets.asperityMaxMeters).toBe(4e-9);
    expect(budget.operatingTargets.residualElectrostaticForceMaxN).toBeCloseTo(709.419, 2);
    expect(budget.requiredCorrections.roughnessRmsMaxMeters).toBe(1e-10);
    expect(budget.requiredCorrections.roughnessMapLateralResolutionMaxMeters).toBe(5e-10);
    expect(budget.requiredCorrections.roughnessMapResolutionReductionMeters).toBeNull();
    expect(budget.requiredCorrections.roughnessMapSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.asperityTailSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.patchVoltageMapSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.roughnessScanAreaFractionMin).toBe(0.95);
    expect(budget.requiredCorrections.roughnessScanAreaFractionShortfall).toBeNull();
    expect(budget.requiredCorrections.roughnessRmsReductionMeters).toBeNull();
    expect(budget.requiredCorrections.minimumGapClearanceRequiredMeters).toBe(4e-9);
    expect(budget.requiredCorrections.patchVoltageRmsMaxVolts).toBe(0.01);
    expect(budget.requiredCorrections.residualElectrostaticForceMaxN).toBeCloseTo(709.419, 2);
    expect(budget.requiredCorrections.residualElectrostaticForceReductionN).toBeNull();
    expect(budget.summary.firstBlocker).toBe("roughness_patch_receipt_missing_for_operating_budget");
    expect(budget.claimBoundary.patchElectrostaticTermsMustEnterFullTensor).toBe(true);
  });

  it("clears roughness/patch operating budget when measured margins stay inside targets", () => {
    const budget = buildNhm2TileSourceRoughnessPatchOperatingBudget({
      generatedAt,
      roughnessPatchEvidence: passingEvidence.roughnessPatch,
    });

    expect(budget.summary.roughnessPatchEvidenceReady).toBe(true);
    expect(budget.summary.firstBlocker).toBe("none");
    expect(budget.derivedOperatingBudget.mapRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.mapProvenanceRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.mapSamplingComplete).toBe(true);
    expect(budget.suppliedRoughnessPatchEvidence.gapMetrologyRef).toBe(
      "receipt://roughness-patch/gap-metrology-8nm-v1",
    );
    expect(budget.suppliedRoughnessPatchEvidence.roughnessMapRef).toBe(
      "receipt://roughness-patch/maps/roughness-height-v1",
    );
    expect(budget.derivedOperatingBudget.roughnessMapResolutionMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.roughnessMapSampleCountMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.asperityTailSampleCountMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.patchVoltageMapSampleCountMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.scanAreaCoverageMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.roughnessRmsMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.asperityP99Margin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.asperityP999Margin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.asperityMaxMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.minimumGapClearanceMeters).toBeCloseTo(6e-9);
    expect(budget.derivedOperatingBudget.patchVoltageMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.patchVoltageDerivedElectrostaticForceFraction).toBeLessThan(0.05);
    expect(budget.derivedOperatingBudget.patchVoltageDerivedElectrostaticMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.residualElectrostaticForceN).toBeCloseTo(283.768, 2);
    expect(budget.derivedOperatingBudget.residualElectrostaticMargin).toBeGreaterThan(1);
    expect(budget.requiredCorrections.roughnessRmsReductionMeters).toBe(0);
    expect(budget.requiredCorrections.roughnessMapResolutionReductionMeters).toBe(0);
    expect(budget.requiredCorrections.roughnessMapSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.asperityTailSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.patchVoltageMapSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.roughnessScanAreaFractionShortfall).toBe(0);
    expect(budget.requiredCorrections.asperityP99ReductionMeters).toBe(0);
    expect(budget.requiredCorrections.asperityP999ReductionMeters).toBe(0);
    expect(budget.requiredCorrections.asperityMaxReductionMeters).toBe(0);
    expect(budget.requiredCorrections.gapClearanceShortfallMeters).toBe(0);
    expect(budget.requiredCorrections.patchVoltageReductionVolts).toBe(0);
    expect(budget.requiredCorrections.patchVoltageDerivedElectrostaticFractionReduction).toBe(0);
    expect(budget.requiredCorrections.residualElectrostaticForceFractionReduction).toBe(0);
    expect(budget.requiredCorrections.residualElectrostaticForceReductionN).toBe(0);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("blocks roughness/patch evidence when map sample support is too sparse", () => {
    const sparseEvidence = {
      ...passingEvidence.roughnessPatch!,
      evidenceRef: "receipt://roughness-patch/sparse-map-support-v1",
      roughnessMapSampleCount: 5000,
      asperityTailSampleCount: 400,
      patchVoltageMapSampleCount: 3000,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      roughnessPatch: sparseEvidence,
    });
    const roughnessSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "roughness_patch_metrology",
    );
    const budget = buildNhm2TileSourceRoughnessPatchOperatingBudget({
      generatedAt,
      roughnessPatchEvidence: sparseEvidence,
    });

    expect(roughnessSurface?.status).toBe("fail");
    expect(roughnessSurface?.blockers).toEqual(
      expect.arrayContaining([
        "roughness_map_sample_count_below_10000",
        "asperity_tail_sample_count_below_1000",
        "patch_voltage_map_sample_count_below_10000",
      ]),
    );
    expect(roughnessSurface?.numericalMargins.roughnessMapSampleCountMargin).toBe(0.5);
    expect(roughnessSurface?.numericalMargins.asperityTailSampleCountMargin).toBe(0.4);
    expect(roughnessSurface?.numericalMargins.patchVoltageMapSampleCountMargin).toBe(0.3);
    expect(budget.summary.roughnessPatchEvidenceReady).toBe(false);
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.derivedOperatingBudget.mapSamplingComplete).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "roughness_map_sample_count_below_10000_for_operating_budget",
        "asperity_tail_sample_count_below_1000_for_operating_budget",
        "patch_voltage_map_sample_count_below_10000_for_operating_budget",
      ]),
    );
    expect(budget.requiredCorrections.roughnessMapSampleCountShortfall).toBe(5000);
    expect(budget.requiredCorrections.asperityTailSampleCountShortfall).toBe(600);
    expect(budget.requiredCorrections.patchVoltageMapSampleCountShortfall).toBe(7000);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("keeps scalar-only roughness/patch evidence blocked without map provenance", () => {
    const scalarOnlyRoughnessEvidence = {
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://roughness-patch/scalar-only-8nm-v1",
      roughnessRmsMeters: 5e-11,
      asperityP99Meters: 1e-9,
      asperityMaxMeters: 2e-9,
      patchVoltageRmsVolts: 5e-3,
      residualElectrostaticForceFraction: 0.02,
      correctionRef: "receipt://roughness-patch/correction-v1",
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      roughnessPatch: scalarOnlyRoughnessEvidence,
    });
    const plan = buildNhm2TileSourceRoughnessPatchTestPlan({ materialEvidenceReceipts: receipts });
    const budget = buildNhm2TileSourceRoughnessPatchOperatingBudget({
      generatedAt,
      roughnessPatchEvidence: scalarOnlyRoughnessEvidence,
    });
    const provenance = plan.testItems.find((item) => item.testId === "roughness_patch_provenance");

    expect(plan.summary.roughnessPatchEvidenceReady).toBe(false);
    expect(plan.summary.nextRequiredTestId).toBe("roughness_patch_provenance");
    expect(provenance?.blockerIds).toEqual(
      expect.arrayContaining([
        "roughness_map_ref_missing",
        "roughness_gap_metrology_ref_missing",
        "roughness_surface_pairing_ref_missing",
        "asperity_tail_distribution_ref_missing",
        "asperity_tail_fit_ref_missing",
        "patch_voltage_map_ref_missing",
        "patch_voltage_calibration_ref_missing",
        "residual_electrostatic_model_ref_missing",
      ]),
    );
    expect(budget.summary.roughnessPatchEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.mapRefsAvailable).toBe(false);
    expect(budget.requiredCorrections.roughnessRmsReductionMeters).toBe(0);
    expect(budget.requiredCorrections.asperityMaxReductionMeters).toBe(0);
    expect(budget.requiredCorrections.patchVoltageReductionVolts).toBe(0);
    expect(budget.requiredCorrections.residualElectrostaticForceFractionReduction).toBe(0);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "roughness_map_ref_missing_for_operating_budget",
        "roughness_gap_metrology_ref_missing_for_operating_budget",
        "roughness_surface_pairing_ref_missing_for_operating_budget",
        "asperity_tail_distribution_ref_missing_for_operating_budget",
        "asperity_tail_fit_ref_missing_for_operating_budget",
        "patch_voltage_map_ref_missing_for_operating_budget",
        "patch_voltage_calibration_ref_missing_for_operating_budget",
        "residual_electrostatic_model_ref_missing_for_operating_budget",
        "roughness_map_lateral_resolution_missing_for_operating_budget",
        "roughness_scan_area_fraction_missing_for_operating_budget",
        "asperity_p999_missing_for_operating_budget",
        "patch_voltage_correlation_length_missing_for_operating_budget",
      ]),
    );
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies roughness/patch evidence when asperities or electrostatic contamination exceed operating budget", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      roughnessPatch: {
        evidenceTier: "measured",
        evidenceRef: "receipt://roughness-patch/failing-operating-budget-v1",
        ...roughnessPatchProtocolRefs,
        mapLateralResolutionMeters: 1e-9,
        scanAreaFraction: 0.9,
        asperityP999Meters: 4e-9,
        roughnessMapRef: "receipt://roughness-patch/maps/failing-roughness-height-v1",
        asperityDistributionRef: "receipt://roughness-patch/maps/failing-asperity-tail-v1",
        patchVoltageMapRef: "receipt://roughness-patch/maps/failing-patch-voltage-v1",
        roughnessRmsMeters: 2e-10,
        asperityP99Meters: 3e-9,
        asperityMaxMeters: 9e-9,
        patchVoltageRmsVolts: 1,
        residualElectrostaticForceFraction: 0.08,
        correctionRef: null,
      },
    });
    const budget = buildNhm2TileSourceRoughnessPatchOperatingBudget({
      generatedAt,
      roughnessPatchEvidence: {
        evidenceTier: "measured",
        evidenceRef: "receipt://roughness-patch/failing-operating-budget-v1",
        ...roughnessPatchProtocolRefs,
        mapLateralResolutionMeters: 1e-9,
        scanAreaFraction: 0.9,
        asperityP999Meters: 4e-9,
        roughnessMapRef: "receipt://roughness-patch/maps/failing-roughness-height-v1",
        asperityDistributionRef: "receipt://roughness-patch/maps/failing-asperity-tail-v1",
        patchVoltageMapRef: "receipt://roughness-patch/maps/failing-patch-voltage-v1",
        roughnessRmsMeters: 2e-10,
        asperityP99Meters: 3e-9,
        asperityMaxMeters: 9e-9,
        patchVoltageRmsVolts: 1,
        residualElectrostaticForceFraction: 0.08,
        correctionRef: null,
      },
    });
    const roughnessSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "roughness_patch_metrology",
    );

    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(roughnessSurface?.blockers).toEqual(
      expect.arrayContaining([
        "patch_voltage_derived_electrostatic_fraction_above_5pct",
        "residual_electrostatic_force_correction_above_5pct_or_missing",
      ]),
    );
    expect(roughnessSurface?.numericalMargins.patchVoltageDerivedElectrostaticForceFraction).toBeGreaterThan(0.05);
    expect(roughnessSurface?.numericalMargins.patchVoltageDerivedElectrostaticMargin).toBeLessThan(1);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "roughness_rms_above_0p1nm_operating_budget",
        "roughness_map_lateral_resolution_above_0p5nm_operating_budget",
        "roughness_scan_area_fraction_below_0p95_operating_budget",
        "asperity_p99_above_2nm_operating_budget",
        "asperity_p999_above_3nm_operating_budget",
        "asperity_max_exceeds_half_gap_operating_budget",
        "asperity_tail_closes_8nm_gap",
        "patch_voltage_above_10mv_operating_budget",
        "residual_electrostatic_force_above_5pct_operating_budget",
        "patch_voltage_derived_electrostatic_fraction_above_5pct_operating_budget",
        "roughness_patch_correction_ref_missing_for_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.minimumGapClearanceMeters).toBeLessThan(0);
    expect(budget.derivedOperatingBudget.residualElectrostaticForceN).toBeCloseTo(1135.07, 2);
    expect(budget.derivedOperatingBudget.patchVoltageDerivedElectrostaticForceFraction).toBeGreaterThan(0.05);
    expect(budget.derivedOperatingBudget.patchVoltageDerivedElectrostaticMargin).toBeLessThan(1);
    expect(budget.requiredCorrections.roughnessRmsReductionMeters).toBeCloseTo(1e-10, 15);
    expect(budget.requiredCorrections.roughnessMapResolutionReductionMeters).toBeCloseTo(5e-10, 15);
    expect(budget.requiredCorrections.roughnessScanAreaFractionShortfall).toBeCloseTo(0.05, 12);
    expect(budget.requiredCorrections.asperityP99ReductionMeters).toBeCloseTo(1e-9, 15);
    expect(budget.requiredCorrections.asperityP999ReductionMeters).toBeCloseTo(1e-9, 15);
    expect(budget.requiredCorrections.asperityMaxReductionMeters).toBeCloseTo(5e-9, 15);
    expect(budget.requiredCorrections.gapClearanceShortfallMeters).toBeCloseTo(5e-9, 15);
    expect(budget.requiredCorrections.patchVoltageReductionVolts).toBeCloseTo(0.99, 12);
    expect(
      budget.requiredCorrections.patchVoltageDerivedElectrostaticFractionReduction,
    ).toBeGreaterThan(0);
    expect(budget.requiredCorrections.residualElectrostaticForceFractionReduction).toBeCloseTo(
      0.03,
      12,
    );
    expect(budget.requiredCorrections.residualElectrostaticForceReductionN).toBeGreaterThan(0);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("maps an absent active-control receipt to active-control provenance", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourceActiveControlTestPlan({
      materialEvidenceReceipts: receipts,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
    });
    const provenance = plan.testItems.find((item) => item.testId === "active_control_provenance");

    expect(isNhm2TileSourceActiveControlTestPlan(plan)).toBe(true);
    expect(plan.activeControlTarget.switchingRateHz).toBe(15e9);
    expect(plan.activeControlTarget.gapNoiseRmsMaxMeters).toBeCloseTo(8e-11);
    expect(plan.summary.activeControlReceiptStatus).toBe("missing");
    expect(plan.summary.nextRequiredTestId).toBe("active_control_provenance");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://active_control/provenance_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain("active-control trace");
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "full_apparatus_tensor",
        "material_credibility_gate",
        "covariant_conservation",
        "time_dependent_source_campaign",
      ]),
    );
    expect(provenance?.status).toBe("open");
    expect(provenance?.blockerIds).toContain("active_gap_control_energy_and_noise_missing");
    expect(provenance?.measurementTargets).toMatchObject({
      requiredEvidenceTier: "measured_or_validated_simulation",
      requiredTraceRefCount: 17,
      requiredFailureModeCount: 5,
      switchingRateHz: 15e9,
    });
    expect(provenance?.blocksCampaignDomains).toContain("time_dependent_source_campaign");
    expect(plan.summary.activeControlEvidenceReady).toBe(false);
    expect(plan.claimBoundary.activeControlPassIsNotFullApparatusTensor).toBe(true);
    expect(plan.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("marks active-control bandwidth, noise, timing, heat, and failure-mode evidence as falsifying", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      activeControl: {
        evidenceTier: "measured",
        evidenceRef: "receipt://active-control/failing-gap-lock-v1",
        energyWaveformRef: "receipt://active-control/failing-energy-waveform-v1",
        controlTransferFunctionRef: "receipt://active-control/failing-transfer-function-v1",
        gapNoiseTraceRef: "receipt://active-control/failing-gap-noise-trace-v1",
        thermalModelRef: "receipt://active-control/failing-thermal-model-v1",
        heatLoadTraceRef: "receipt://active-control/failing-heat-load-trace-v1",
        timingSyncTraceRef: "receipt://active-control/failing-timing-sync-trace-v1",
        energyPerCycleJ: 1e-9,
        bandwidthHz: 15e9,
        switchingRateHz: 15e9,
        gapNoiseRmsMeters: 2e-10,
        noiseSpectrumRef: null,
        heatLoadW: null,
        timingJitterSeconds: 1e-11,
        failureModeRef: null,
        failureModeCoverage: null,
      },
    });
    const plan = buildNhm2TileSourceActiveControlTestPlan({ materialEvidenceReceipts: receipts });
    const controlBandwidth = plan.testItems.find((item) => item.testId === "control_bandwidth");
    const gapNoise = plan.testItems.find((item) => item.testId === "gap_noise");
    const heatLoad = plan.testItems.find((item) => item.testId === "heat_load");
    const timingJitter = plan.testItems.find((item) => item.testId === "timing_jitter");
    const failureMode = plan.testItems.find((item) => item.testId === "failure_mode");

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(plan.summary.activeControlReceiptStatus).toBe("fail");
    expect(plan.summary.nextRequiredTestId).toBe("active_control_provenance");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://active_control/provenance_v1",
    );
    expect(plan.summary.nextBlockedCampaignDomains).toContain("time_dependent_source_campaign");
    expect(plan.summary.bandwidthMargin).toBeLessThan(1);
    expect(plan.summary.noiseMargin).toBeLessThan(1);
    expect(plan.summary.timingMargin).toBeLessThan(1);
    expect(plan.summary.energyPerCycleJ).toBe(1e-9);
    expect(plan.summary.heatLoadW).toBeNull();
    expect(plan.summary.falsifiesCurrentCandidate).toBe(true);
    expect(controlBandwidth?.status).toBe("falsifying");
    expect(gapNoise?.status).toBe("falsifying");
    expect(heatLoad?.status).toBe("falsifying");
    expect(timingJitter?.status).toBe("falsifying");
    expect(failureMode?.status).toBe("falsifying");
    expect(controlBandwidth?.blockerIds).toContain("gap_lock_bandwidth_below_2x_switching_rate");
    expect(controlBandwidth?.measurementTargets).toMatchObject({
      switchingRateHz: 15e9,
      bandwidthMinHz: 30e9,
      controllerPhaseMarginMinDegrees: 45,
      controllerGainMarginMinDb: 6,
    });
    expect(controlBandwidth?.falsificationRule).toContain("30 GHz");
    expect(gapNoise?.blockerIds).toContain("gap_noise_above_1pct_gap");
    expect(gapNoise?.blockerIds).toContain("active_control_noise_spectrum_ref_missing");
    expect(gapNoise?.measurementTargets).toMatchObject({
      operatingGapMeters: 8e-9,
      gapNoiseRmsMaxMeters: 8e-11,
      noiseSpectrumRefRequired: true,
    });
    expect(timingJitter?.blockerIds).toContain("timing_jitter_above_0p1_cycle");
    expect(timingJitter?.measurementTargets.timingJitterMaxSeconds).toBeCloseTo(
      6.666666666666667e-12,
      18,
    );
    expect(timingJitter?.measurementTargets.phaseNoiseMaxSeconds).toBeCloseTo(
      3.3333333333333333e-12,
      18,
    );
    expect(heatLoad?.blockerIds).toContain("active_control_heat_load_missing");
    expect(heatLoad?.measurementTargets).toMatchObject({
      thermalSinkCapacityFactorMin: 1.2,
      heatLoadTraceRefRequired: true,
      thermalModelRefRequired: true,
    });
    expect(failureMode?.blockerIds).toContain("active_control_failure_mode_ref_missing");
    expect(failureMode?.blockerIds).toContain("active_control_loss_of_lock_failure_mode_missing");
    expect(failureMode?.measurementTargets).toMatchObject({
      requiredFailureModeCount: 5,
      failSafeShutdownCoverageRequired: true,
    });
    expect(failureMode?.falsificationRule).toContain("fail-safe");
    expect(plan.summary.transportClaimAllowed).toBe(false);
  });

  it("falsifies active-control receipts when heat load is below waveform-derived control power", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      activeControl: {
        ...passingEvidence.activeControl!,
        heatLoadW: 0.1,
      },
    });
    const activeSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "active_control_energy",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(activeSurface?.status).toBe("fail");
    expect(activeSurface?.blockers).toContain(
      "active_control_heat_load_below_computed_control_power",
    );
    expect(activeSurface?.numericalMargins.controlPowerW).toBe(15);
    expect(activeSurface?.numericalMargins.thermalAccountingMargin).toBeCloseTo(
      0.006666666666666667,
      12,
    );
    expect(activeSurface?.numericalMargins.heatSinkReferenceLoadW).toBe(15);
  });

  it("falsifies active-control receipts when energy per cycle is nonpositive", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      activeControl: {
        ...passingEvidence.activeControl!,
        energyPerCycleJ: -1e-9,
      },
    });
    const activeSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "active_control_energy",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(activeSurface?.status).toBe("fail");
    expect(activeSurface?.blockers).toContain("active_control_energy_per_cycle_invalid");
    expect(activeSurface?.numericalMargins.energyPerCycleJ).toBe(-1e-9);
    expect(activeSurface?.numericalMargins.controlPowerW).toBeNull();
    expect(activeSurface?.numericalMargins.thermalAccountingMargin).toBeNull();
  });

  it("falsifies active-control receipts and budgets with nonphysical numeric domains", () => {
    const invalidActiveControl = {
      ...passingEvidence.activeControl!,
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://active-control/nonphysical-domains-v1",
      energyPerCycleJ: 1e-9,
      actuatorAuthorityN: -1,
      bandwidthHz: -1,
      switchingRateHz: Number.NaN,
      gapNoiseRmsMeters: 0,
      heatLoadW: -1,
      heatSinkCapacityW: -1,
      sourceTensorContaminationFraction: 1.2,
      timingJitterSeconds: -1,
      phaseNoiseRmsSeconds: -1,
      controllerPhaseMarginDegrees: -1,
      controllerGainMarginDb: Number.NaN,
      lockAcquisitionTimeSeconds: -1,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      activeControl: invalidActiveControl,
    });
    const activeSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "active_control_energy",
    );
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence),
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });
    const budget = buildNhm2TileSourceActiveControlOperatingBudget({
      generatedAt,
      forceGapLoadBudget,
      activeControlEvidence: invalidActiveControl,
    });

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(activeSurface?.status).toBe("fail");
    expect(activeSurface?.blockers).toEqual(
      expect.arrayContaining([
        "active_control_actuator_authority_invalid",
        "active_control_switching_rate_invalid",
        "active_control_bandwidth_invalid",
        "gap_noise_rms_invalid",
        "active_control_heat_load_invalid",
        "active_control_heat_sink_capacity_invalid",
        "active_control_source_tensor_contamination_fraction_invalid",
        "timing_jitter_invalid",
        "phase_noise_invalid",
        "controller_phase_margin_invalid",
        "controller_gain_margin_invalid",
        "active_control_lock_acquisition_time_invalid",
      ]),
    );
    expect(activeSurface?.numericalMargins.controlPowerW).toBeNull();
    expect(activeSurface?.numericalMargins.thermalAccountingMargin).toBeNull();
    expect(activeSurface?.numericalMargins.thermalSinkMargin).toBeNull();
    expect(activeSurface?.numericalMargins.sourceTensorContaminationMargin).toBeNull();

    expect(budget.summary.activeControlEvidenceReady).toBe(false);
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "active_control_actuator_authority_invalid_for_operating_budget",
        "active_control_switching_rate_invalid_for_operating_budget",
        "active_control_bandwidth_invalid_for_operating_budget",
        "active_control_gap_noise_invalid_for_operating_budget",
        "active_control_heat_load_invalid_for_operating_budget",
        "active_control_heat_sink_capacity_invalid_for_operating_budget",
        "active_control_source_tensor_contamination_invalid_for_operating_budget",
        "active_control_timing_jitter_invalid_for_operating_budget",
        "active_control_phase_noise_invalid_for_operating_budget",
        "active_control_controller_phase_margin_invalid_for_operating_budget",
        "active_control_controller_gain_margin_invalid_for_operating_budget",
        "active_control_lock_acquisition_time_invalid_for_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.controlPowerW).toBeNull();
    expect(budget.derivedOperatingBudget.switchingRateMargin).toBeNull();
    expect(budget.derivedOperatingBudget.thermalAccountingMargin).toBeNull();
    expect(budget.derivedOperatingBudget.thermalSinkCapacityMargin).toBeNull();
    expect(budget.derivedOperatingBudget.sourceTensorContaminationMargin).toBeNull();
    expect(budget.suppliedActiveControlEvidence.switchingRateHz).toBeNull();
    expect(budget.suppliedActiveControlEvidence.controllerGainMarginDb).toBeNull();
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies active-control receipts when actuator authority is below the frozen 447-layer load", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      activeControl: {
        ...passingEvidence.activeControl!,
        actuatorAuthorityN: 1e4,
      },
    });
    const activeSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "active_control_energy",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(receipts.thresholds.ideal447LayerStackForceAbsN).toBeCloseTo(
      14188.384284280897,
      12,
    );
    expect(receipts.thresholds.activeControlAuthorityMinN).toBeCloseTo(
      14188.384284280897 * 1.2,
      12,
    );
    expect(activeSurface?.status).toBe("fail");
    expect(activeSurface?.blockers).toContain(
      "active_control_actuator_authority_below_447_layer_load",
    );
    expect(
      activeSurface?.numericalMargins.activeControlActuatorAuthorityMargin,
    ).toBeCloseTo(1e4 / (14188.384284280897 * 1.2), 12);
    expect(activeSurface?.numericalMargins.activeControlAuthorityMinN).toBeCloseTo(
      14188.384284280897 * 1.2,
      12,
    );
  });

  it("builds active-control operating targets from the frozen 15 GHz cadence", () => {
    const budget = buildNhm2TileSourceActiveControlOperatingBudget({ generatedAt });

    expect(isNhm2TileSourceActiveControlOperatingBudget(budget)).toBe(true);
    expect(budget.operatingTargets.switchingRateHz).toBe(15e9);
    expect(budget.operatingTargets.bandwidthMinHz).toBe(30e9);
    expect(budget.operatingTargets.gapNoiseRmsMaxMeters).toBe(8e-11);
    expect(budget.operatingTargets.timingJitterMaxSeconds).toBeCloseTo(6.666666666666667e-12);
    expect(budget.operatingTargets.phaseNoiseMaxSeconds).toBeCloseTo(3.3333333333333333e-12);
    expect(budget.operatingTargets.controllerPhaseMarginMinDegrees).toBe(45);
    expect(budget.operatingTargets.controllerGainMarginMinDb).toBe(6);
    expect(budget.operatingTargets.thermalSinkCapacityFactorMin).toBe(1.2);
    expect(budget.operatingTargets.sourceTensorContaminationFractionMax).toBe(0.05);
    expect(budget.operatingTargets.requiredGapControlAuthorityN).toBeCloseTo(17026.06, 2);
    expect(budget.operatingTargets.timeTraceSampleCountMin).toBe(4096);
    expect(budget.operatingTargets.phaseNoiseSpectrumBinCountMin).toBe(512);
    expect(budget.operatingTargets.lockAcquisitionTrialCountMin).toBe(100);
    expect(budget.derivedOperatingBudget.gapControlAuthorityMargin).toBeNull();
    expect(budget.requiredCorrections.switchingRateTargetHz).toBe(15e9);
    expect(budget.requiredCorrections.switchingRateAbsDeltaHz).toBeNull();
    expect(budget.requiredCorrections.bandwidthMinHz).toBe(30e9);
    expect(budget.requiredCorrections.bandwidthShortfallHz).toBeNull();
    expect(budget.requiredCorrections.gapControlAuthorityMinN).toBeCloseTo(17026.06, 2);
    expect(budget.requiredCorrections.suppliedGapControlAuthorityN).toBeNull();
    expect(budget.requiredCorrections.suppliedActuatorAuthorityN).toBeNull();
    expect(budget.requiredCorrections.gapNoiseRmsMaxMeters).toBe(8e-11);
    expect(budget.requiredCorrections.gapNoiseRmsReductionMeters).toBeNull();
    expect(budget.requiredCorrections.phaseNoiseMaxSeconds).toBeCloseTo(3.3333333333333333e-12);
    expect(budget.requiredCorrections.phaseNoiseReductionSeconds).toBeNull();
    expect(budget.requiredCorrections.controllerPhaseMarginMinDegrees).toBe(45);
    expect(budget.requiredCorrections.controllerGainMarginMinDb).toBe(6);
    expect(budget.requiredCorrections.heatSinkCapacityCriterion).toBe(
      "heatSinkCapacityW >= 1.2 * max(heatLoadW, energyPerCycleJ * switchingRateHz)",
    );
    expect(budget.requiredCorrections.heatSinkCapacityMinW).toBeNull();
    expect(budget.requiredCorrections.sourceTensorContaminationFractionMax).toBe(0.05);
    expect(budget.requiredCorrections.sourceTensorContaminationFractionReduction).toBeNull();
    expect(budget.requiredCorrections.requiredTraceRefCount).toBe(17);
    expect(budget.requiredCorrections.missingTraceRefCount).toBe(17);
    expect(budget.requiredCorrections.timeTraceSampleCountMin).toBe(4096);
    expect(budget.requiredCorrections.energyWaveformSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.actuatorAuthorityTraceSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.gapNoiseTraceSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.heatLoadTraceSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.timingSyncTraceSampleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.phaseNoiseSpectrumBinCountMin).toBe(512);
    expect(budget.requiredCorrections.phaseNoiseSpectrumBinCountShortfall).toBeNull();
    expect(budget.requiredCorrections.lockAcquisitionTrialCountMin).toBe(100);
    expect(budget.requiredCorrections.lockAcquisitionTrialCountShortfall).toBeNull();
    expect(budget.requiredCorrections.requiredFailureModeCount).toBe(5);
    expect(budget.requiredCorrections.missingFailureModeCount).toBe(5);
    expect(budget.summary.firstBlocker).toBe("active_control_receipt_missing_for_operating_budget");
    expect(budget.claimBoundary.controllerEvidenceDoesNotSupplyFullApparatusTensor).toBe(true);
  });

  it("clears the active-control operating budget when power, noise, timing, and heat are accounted", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: receipts,
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });
    const budget = buildNhm2TileSourceActiveControlOperatingBudget({
      generatedAt,
      forceGapLoadBudget,
      activeControlEvidence: passingEvidence.activeControl,
    });

    expect(budget.summary.activeControlEvidenceReady).toBe(true);
    expect(budget.summary.firstBlocker).toBe("none");
    expect(budget.derivedOperatingBudget.controlPowerW).toBe(15);
    expect(budget.derivedOperatingBudget.gapControlAuthorityMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.suppliedActuatorAuthorityMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.activeControlTraceRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.activeControlCalibrationRefsAvailable).toBe(true);
    expect(budget.suppliedActiveControlEvidence.energyWaveformRef).toBe(
      "receipt://active-control/energy-waveform-v1",
    );
    expect(budget.suppliedActiveControlEvidence.actuatorAuthorityTraceRef).toBe(
      "receipt://active-control/actuator-authority-trace-v1",
    );
    expect(budget.derivedOperatingBudget.noiseSpectrumAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.failureModeCoverageComplete).toBe(true);
    expect(budget.derivedOperatingBudget.activeControlTraceSamplingComplete).toBe(true);
    expect(budget.derivedOperatingBudget.switchingRateMargin).toBe(1);
    expect(budget.derivedOperatingBudget.bandwidthMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.noiseMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.timingMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.phaseNoiseMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.controllerPhaseMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.controllerGainMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.thermalAccountingMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.thermalSinkCapacityMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.sourceTensorContaminationMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.energyWaveformSampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.actuatorAuthorityTraceSampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.gapNoiseTraceSampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.heatLoadTraceSampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.timingSyncTraceSampleCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.phaseNoiseSpectrumBinCountMargin).toBe(2);
    expect(budget.derivedOperatingBudget.lockAcquisitionTrialCountMargin).toBe(2.5);
    expect(budget.requiredCorrections.switchingRateAbsDeltaHz).toBe(0);
    expect(budget.requiredCorrections.bandwidthShortfallHz).toBe(0);
    expect(budget.requiredCorrections.gapControlAuthorityShortfallN).toBe(0);
    expect(budget.requiredCorrections.actuatorAuthorityShortfallN).toBe(0);
    expect(budget.requiredCorrections.gapNoiseRmsReductionMeters).toBe(0);
    expect(budget.requiredCorrections.timingJitterReductionSeconds).toBe(0);
    expect(budget.requiredCorrections.phaseNoiseReductionSeconds).toBe(0);
    expect(budget.requiredCorrections.controllerPhaseMarginShortfallDegrees).toBe(0);
    expect(budget.requiredCorrections.controllerGainMarginShortfallDb).toBe(0);
    expect(budget.requiredCorrections.heatLoadShortfallW).toBe(0);
    expect(budget.requiredCorrections.heatSinkCapacityCriterion).toBe(
      "heatSinkCapacityW >= 1.2 * max(heatLoadW, energyPerCycleJ * switchingRateHz)",
    );
    expect(budget.requiredCorrections.heatSinkCapacityShortfallW).toBe(0);
    expect(budget.requiredCorrections.energyPerCycleReductionJ).toBe(0);
    expect(budget.requiredCorrections.sourceTensorContaminationFractionReduction).toBe(0);
    expect(budget.requiredCorrections.energyWaveformSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.actuatorAuthorityTraceSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.gapNoiseTraceSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.heatLoadTraceSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.timingSyncTraceSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.phaseNoiseSpectrumBinCountShortfall).toBe(0);
    expect(budget.requiredCorrections.lockAcquisitionTrialCountShortfall).toBe(0);
    expect(budget.requiredCorrections.missingTraceRefCount).toBe(0);
    expect(budget.requiredCorrections.missingFailureModeCount).toBe(0);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies active-control evidence that is complete but not synchronized to the frozen 15 GHz cadence", () => {
    const halfRateActiveControl = {
      ...passingEvidence.activeControl,
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://active-control/half-rate-v1",
      switchingRateHz: 7.5e9,
      bandwidthHz: 45e9,
      timingJitterSeconds: 1e-12,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      activeControl: halfRateActiveControl,
    });
    const activeSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "active_control_energy",
    );
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence),
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });
    const budget = buildNhm2TileSourceActiveControlOperatingBudget({
      generatedAt,
      forceGapLoadBudget,
      activeControlEvidence: halfRateActiveControl,
    });

    expect(activeSurface?.status).toBe("fail");
    expect(activeSurface?.blockers).toContain("active_control_switching_rate_not_15ghz");
    expect(activeSurface?.numericalMargins.switchingRateMargin).toBe(0.5);
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toContain("active_control_switching_rate_not_15ghz");
    expect(budget.derivedOperatingBudget.switchingRateMargin).toBe(0.5);
    expect(budget.derivedOperatingBudget.controlPowerW).toBe(7.5);
    expect(budget.requiredCorrections.switchingRateAbsDeltaHz).toBe(7.5e9);
    expect(budget.requiredCorrections.bandwidthShortfallHz).toBe(0);
    expect(budget.requiredCorrections.timingJitterReductionSeconds).toBe(0);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies active-control evidence when waveform, noise, heat, timing, or lock sampling is too sparse", () => {
    const sparseActiveControl = {
      ...passingEvidence.activeControl,
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://active-control/sparse-traces-v1",
      energyWaveformSampleCount: 1024,
      actuatorAuthorityTraceSampleCount: 2048,
      gapNoiseTraceSampleCount: 1000,
      heatLoadTraceSampleCount: 512,
      timingSyncTraceSampleCount: 2048,
      phaseNoiseSpectrumBinCount: 128,
      lockAcquisitionTrialCount: 20,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      activeControl: sparseActiveControl,
    });
    const activeSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "active_control_energy",
    );
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence),
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });
    const budget = buildNhm2TileSourceActiveControlOperatingBudget({
      generatedAt,
      forceGapLoadBudget,
      activeControlEvidence: sparseActiveControl,
    });

    expect(activeSurface?.status).toBe("fail");
    expect(activeSurface?.blockers).toEqual(
      expect.arrayContaining([
        "active_control_energy_waveform_sample_count_below_4096",
        "active_control_actuator_authority_trace_sample_count_below_4096",
        "active_control_gap_noise_trace_sample_count_below_4096",
        "active_control_heat_load_trace_sample_count_below_4096",
        "active_control_timing_sync_trace_sample_count_below_4096",
        "active_control_phase_noise_spectrum_bin_count_below_512",
        "active_control_lock_acquisition_trial_count_below_100",
      ]),
    );
    expect(activeSurface?.numericalMargins.energyWaveformSampleCountMargin).toBe(0.25);
    expect(activeSurface?.numericalMargins.phaseNoiseSpectrumBinCountMargin).toBe(0.25);
    expect(activeSurface?.numericalMargins.lockAcquisitionTrialCountMargin).toBe(0.2);
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.derivedOperatingBudget.activeControlTraceSamplingComplete).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "active_control_energy_waveform_sample_count_below_4096_for_operating_budget",
        "active_control_gap_noise_trace_sample_count_below_4096_for_operating_budget",
        "active_control_heat_load_trace_sample_count_below_4096_for_operating_budget",
        "active_control_phase_noise_spectrum_bin_count_below_512_for_operating_budget",
        "active_control_lock_acquisition_trial_count_below_100_for_operating_budget",
      ]),
    );
    expect(budget.requiredCorrections.energyWaveformSampleCountShortfall).toBe(3072);
    expect(budget.requiredCorrections.actuatorAuthorityTraceSampleCountShortfall).toBe(2048);
    expect(budget.requiredCorrections.gapNoiseTraceSampleCountShortfall).toBe(3096);
    expect(budget.requiredCorrections.heatLoadTraceSampleCountShortfall).toBe(3584);
    expect(budget.requiredCorrections.timingSyncTraceSampleCountShortfall).toBe(2048);
    expect(budget.requiredCorrections.phaseNoiseSpectrumBinCountShortfall).toBe(384);
    expect(budget.requiredCorrections.lockAcquisitionTrialCountShortfall).toBe(80);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies active-control evidence when the 15 GHz operating budget is thermally or dynamically inconsistent", () => {
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      forceGapPullInEvidence: {
        evidenceTier: "measured",
        evidenceRef: "receipt://force-gap/insufficient-active-authority-v1",
        ...forceGapProtocolRefs,
        forceGapCurveRef: "receipt://force-gap/Fg-curve-active-control-v1",
        forceGradientCurveRef: "receipt://force-gap/dFdg-curve-active-control-v1",
        stiffnessModelRef: "receipt://force-gap/stiffness-model-active-control-v1",
        gapMeters: 8e-9,
        casimirForceN: 1.42e4,
        forceGradientNPerM: 7.1e12,
        effectiveSpringConstantNPerM: 8.6e12,
        stictionMargin: 1.5,
        activeGapControlAuthorityN: 1e4,
      },
    });
    const budget = buildNhm2TileSourceActiveControlOperatingBudget({
      generatedAt,
      forceGapLoadBudget,
      activeControlEvidence: {
        evidenceTier: "measured",
        evidenceRef: "receipt://active-control/failing-operating-budget-v1",
        energyWaveformRef: "receipt://active-control/failing-energy-waveform-v1",
        actuatorAuthorityTraceRef: "receipt://active-control/failing-actuator-authority-v1",
        gapSensorCalibrationRef: "receipt://active-control/failing-gap-sensor-calibration-v1",
        controlTransferFunctionRef: "receipt://active-control/failing-transfer-function-v1",
        controllerStabilityRef: "receipt://active-control/failing-controller-stability-v1",
        gapNoiseTraceRef: "receipt://active-control/failing-gap-noise-trace-v1",
        thermalModelRef: "receipt://active-control/failing-thermal-model-v1",
        heatSinkCapacityTraceRef: "receipt://active-control/failing-heat-sink-capacity-v1",
        heatLoadTraceRef: "receipt://active-control/failing-heat-load-trace-v1",
        timingSyncTraceRef: "receipt://active-control/failing-timing-sync-trace-v1",
        phaseNoiseSpectrumRef: "receipt://active-control/failing-phase-noise-spectrum-v1",
        lockAcquisitionTraceRef: "receipt://active-control/failing-lock-acquisition-v1",
        energyPerCycleJ: 1e-9,
        actuatorAuthorityN: 1e4,
        bandwidthHz: 15e9,
        switchingRateHz: 15e9,
        gapNoiseRmsMeters: 2e-10,
        noiseSpectrumRef: null,
        heatLoadW: 0.1,
        heatSinkCapacityW: 0.1,
        timingJitterSeconds: 1e-11,
        phaseNoiseRmsSeconds: 1e-11,
        controllerPhaseMarginDegrees: 30,
        controllerGainMarginDb: 3,
        lockAcquisitionTimeSeconds: null,
        failureModeRef: null,
        failureModeCoverage: null,
      },
    });

    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "active_control_bandwidth_below_30ghz",
        "active_control_gap_authority_below_447_layer_load",
        "active_control_supplied_actuator_authority_below_447_layer_load",
        "active_control_gap_noise_above_80pm",
        "active_control_noise_spectrum_ref_missing_for_operating_budget",
        "active_control_timing_jitter_above_0p1_cycle",
        "active_control_phase_noise_above_0p05_cycle",
        "active_control_controller_phase_margin_below_45deg",
        "active_control_controller_gain_margin_below_6db",
        "active_control_heat_load_below_computed_control_power",
        "active_control_heat_sink_capacity_below_1p2x_heat_load",
        "active_control_lock_acquisition_time_missing_for_operating_budget",
        "active_control_failure_mode_ref_missing_for_operating_budget",
        "active_control_loss_of_lock_failure_mode_missing_for_operating_budget",
        "active_control_fail_safe_shutdown_missing_for_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.controlPowerW).toBe(15);
    expect(budget.derivedOperatingBudget.gapControlAuthorityMargin).toBeLessThan(1);
    expect(budget.derivedOperatingBudget.suppliedActuatorAuthorityMargin).toBeLessThan(1);
    expect(budget.derivedOperatingBudget.noiseSpectrumAvailable).toBe(false);
    expect(budget.derivedOperatingBudget.thermalAccountingMargin).toBeLessThan(1);
    expect(budget.derivedOperatingBudget.thermalSinkCapacityMargin).toBeLessThan(1);
    expect(budget.requiredCorrections.bandwidthShortfallHz).toBe(15e9);
    expect(budget.requiredCorrections.gapControlAuthorityShortfallN).toBeGreaterThan(0);
    expect(budget.requiredCorrections.actuatorAuthorityShortfallN).toBeGreaterThan(0);
    expect(budget.requiredCorrections.gapNoiseRmsReductionMeters).toBeCloseTo(1.2e-10, 18);
    expect(budget.requiredCorrections.timingJitterReductionSeconds).toBeGreaterThan(0);
    expect(budget.requiredCorrections.phaseNoiseReductionSeconds).toBeGreaterThan(0);
    expect(budget.requiredCorrections.controllerPhaseMarginShortfallDegrees).toBe(15);
    expect(budget.requiredCorrections.controllerGainMarginShortfallDb).toBe(3);
    expect(budget.requiredCorrections.heatLoadShortfallW).toBeCloseTo(14.9, 6);
    expect(budget.requiredCorrections.heatSinkCapacityShortfallW).toBeCloseTo(0.02, 6);
    expect(budget.requiredCorrections.energyPerCycleHeatLimitedMaxJ).toBeCloseTo(
      6.666666666666667e-12,
      18,
    );
    expect(budget.requiredCorrections.energyPerCycleReductionJ).toBeGreaterThan(0);
    expect(budget.requiredCorrections.missingTraceRefCount).toBe(5);
    expect(budget.requiredCorrections.missingFailureModeCount).toBe(5);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("blocks scalar-only active-control values without waveform, transfer, thermal, and timing traces", () => {
    const scalarOnlyActiveControl = {
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://active-control/scalar-only-gap-lock-v1",
      energyPerCycleJ: 1e-9,
      bandwidthHz: 45e9,
      switchingRateHz: 15e9,
      gapNoiseRmsMeters: 5e-11,
      noiseSpectrumRef: "receipt://active-control/gap-noise-spectrum-v1",
      heatLoadW: 20,
      timingJitterSeconds: 2e-12,
      failureModeRef: "receipt://active-control/failure-modes-v1",
      failureModeCoverage: {
        lossOfLock: false,
        thermalRunaway: false,
        noiseRunaway: false,
        timingDesynchronization: false,
        failSafeShutdown: false,
      },
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      activeControl: scalarOnlyActiveControl,
    });
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence),
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });
    const plan = buildNhm2TileSourceActiveControlTestPlan({ materialEvidenceReceipts: receipts });
    const budget = buildNhm2TileSourceActiveControlOperatingBudget({
      generatedAt,
      forceGapLoadBudget,
      activeControlEvidence: scalarOnlyActiveControl,
    });
    const activeSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "active_control_energy",
    );
    const provenance = plan.testItems.find((item) => item.testId === "active_control_provenance");

    expect(activeSurface?.status).toBe("fail");
    expect(activeSurface?.blockers).toEqual(
      expect.arrayContaining([
        "active_control_energy_waveform_ref_missing",
        "active_control_actuator_authority_trace_ref_missing",
        "active_control_gap_sensor_calibration_ref_missing",
        "active_control_transfer_function_ref_missing",
        "active_control_controller_stability_ref_missing",
        "active_control_gap_noise_trace_ref_missing",
        "active_control_thermal_model_ref_missing",
        "active_control_heat_sink_capacity_trace_ref_missing",
        "active_control_heat_load_trace_ref_missing",
        "active_control_timing_sync_trace_ref_missing",
        "active_control_sector_light_crossing_sync_ref_missing",
        "active_control_sector_boundary_timing_map_ref_missing",
        "active_control_phase_noise_spectrum_ref_missing",
        "active_control_lock_acquisition_trace_ref_missing",
        "active_control_actuator_authority_missing",
        "active_control_heat_sink_capacity_missing",
        "phase_noise_receipt_missing",
        "active_control_sector_boundary_skew_missing",
        "active_control_light_crossing_sync_margin_missing",
        "controller_phase_margin_missing",
        "controller_gain_margin_missing",
        "active_control_lock_acquisition_time_missing",
        "active_control_loss_of_lock_failure_mode_missing",
        "active_control_fail_safe_shutdown_missing",
      ]),
    );
    expect(activeSurface?.numericalMargins.activeControlProvenanceRefsAvailable).toBe(0);
    expect(plan.summary.nextRequiredTestId).toBe("active_control_provenance");
    expect(provenance?.status).toBe("falsifying");
    expect(provenance?.measurementTargets.requiredTraceRefCount).toBe(17);
    expect(provenance?.falsificationRule).toContain("trace");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://active_control/provenance_v1",
    );
    expect(budget.summary.activeControlEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.activeControlTraceRefsAvailable).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "active_control_energy_waveform_ref_missing_for_operating_budget",
        "active_control_actuator_authority_trace_ref_missing_for_operating_budget",
        "active_control_gap_sensor_calibration_ref_missing_for_operating_budget",
        "active_control_transfer_function_ref_missing_for_operating_budget",
        "active_control_controller_stability_ref_missing_for_operating_budget",
        "active_control_actuator_authority_missing_for_operating_budget",
        "active_control_gap_noise_trace_ref_missing_for_operating_budget",
        "active_control_thermal_model_ref_missing_for_operating_budget",
        "active_control_heat_sink_capacity_trace_ref_missing_for_operating_budget",
        "active_control_heat_load_trace_ref_missing_for_operating_budget",
        "active_control_timing_sync_trace_ref_missing_for_operating_budget",
        "active_control_sector_light_crossing_sync_ref_missing_for_operating_budget",
        "active_control_sector_boundary_timing_map_ref_missing_for_operating_budget",
        "active_control_sector_boundary_skew_missing_for_operating_budget",
        "active_control_light_crossing_sync_margin_missing_for_operating_budget",
        "active_control_phase_noise_spectrum_ref_missing_for_operating_budget",
        "active_control_lock_acquisition_trace_ref_missing_for_operating_budget",
        "active_control_phase_noise_missing_for_operating_budget",
        "active_control_controller_phase_margin_missing_for_operating_budget",
        "active_control_controller_gain_margin_missing_for_operating_budget",
        "active_control_heat_sink_capacity_missing_for_operating_budget",
        "active_control_lock_acquisition_time_missing_for_operating_budget",
        "active_control_loss_of_lock_failure_mode_missing_for_operating_budget",
        "active_control_fail_safe_shutdown_missing_for_operating_budget",
      ]),
    );
    expect(budget.requiredCorrections.bandwidthShortfallHz).toBe(0);
    expect(budget.requiredCorrections.gapNoiseRmsReductionMeters).toBe(0);
    expect(budget.requiredCorrections.timingJitterReductionSeconds).toBe(0);
    expect(budget.requiredCorrections.heatLoadShortfallW).toBe(0);
    expect(budget.requiredCorrections.energyPerCycleReductionJ).toBe(0);
    expect(budget.requiredCorrections.missingTraceRefCount).toBe(15);
    expect(budget.requiredCorrections.missingFailureModeCount).toBe(5);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("maps absent fatigue and layer-scaling receipts to fatigue-scaling provenance", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourceFatigueLayerScalingTestPlan({
      materialEvidenceReceipts: receipts,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
    });
    const provenance = plan.testItems.find((item) => item.testId === "fatigue_scaling_provenance");

    expect(isNhm2TileSourceFatigueLayerScalingTestPlan(plan)).toBe(true);
    expect(plan.fatigueLayerScalingTarget.layerCount).toBe(447);
    expect(plan.fatigueLayerScalingTarget.layerScalingEfficiencyMin).toBe(0.9);
    expect(plan.fatigueLayerScalingTarget.perLayerVariationFractionMax).toBe(0.05);
    expect(plan.fatigueLayerScalingTarget.layerNonadditivityFractionMax).toBe(0.1);
    expect(plan.fatigueLayerScalingTarget.activeAreaRetentionMin).toBe(0.6);
    expect(plan.fatigueLayerScalingTarget.supportCouplingFractionMax).toBe(0.1);
    expect(plan.fatigueLayerScalingTarget.electromagneticCouplingFractionMax).toBe(0.1);
    expect(plan.fatigueLayerScalingTarget.mechanicalCouplingFractionMax).toBe(0.1);
    expect(plan.fatigueLayerScalingTarget.sourceTensorRetentionFractionMin).toBe(0.9);
    expect(plan.fatigueLayerScalingTarget.thermalCycleDriftFractionMax).toBe(0.01);
    expect(plan.fatigueLayerScalingTarget.creepDriftFractionMax).toBe(0.01);
    expect(plan.fatigueLayerScalingTarget.delaminationMarginMin).toBe(1);
    expect(plan.fatigueLayerScalingTarget.interlayerAdhesionMarginMin).toBe(1);
    expect(plan.summary.combinedReceiptStatus).toBe("missing");
    expect(plan.summary.nextRequiredTestId).toBe("fatigue_scaling_provenance");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://fatigue_layer_scaling/provenance_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain("source-retention maps");
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "material_coupon_behavior",
        "active_control_energy_noise_heat_timing",
        "full_apparatus_tensor",
        "material_credibility_gate",
        "covariant_conservation",
        "time_dependent_source_campaign",
      ]),
    );
    expect(provenance?.status).toBe("open");
    expect(provenance?.blockerIds).toEqual(
      expect.arrayContaining([
        "fatigue_lifetime_receipt_missing",
        "layer_scaling_nonadditivity_measurement_missing",
      ]),
    );
    expect(provenance?.measurementTargets).toMatchObject({
      requiredEvidenceTier: "measured_or_validated_simulation",
      requiredFatigueProvenanceRefCount: 8,
      requiredLayerScalingProvenanceRefCount: 9,
      layerCount: 447,
    });
    expect(provenance?.blocksCampaignDomains).toContain("time_dependent_source_campaign");
    expect(plan.summary.fatigueLayerScalingEvidenceReady).toBe(false);
    expect(plan.claimBoundary.fatigueLayerScalingPassIsNotFullApparatusTensor).toBe(true);
    expect(plan.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("marks fatigue lifetime and layer scaling failures as falsifying", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      fatigueLayerScaling: {
        evidenceTier: "measured",
        evidenceRef: "receipt://fatigue-layer-scaling/failing-447-layer-v1",
        loadSpectrumRef: "receipt://fatigue-layer-scaling/failing-load-spectrum-v1",
        cycleProtocolRef: "receipt://fatigue-layer-scaling/failing-cycle-protocol-v1",
        cryogenicFatigueRef: "receipt://fatigue-layer-scaling/failing-cryogenic-fatigue-v1",
        fatigueCurveRef: "receipt://fatigue-layer-scaling/failing-fatigue-curve-v1",
        thermalCycleRef: "receipt://fatigue-layer-scaling/failing-thermal-cycle-v1",
        creepDriftRef: "receipt://fatigue-layer-scaling/failing-creep-drift-v1",
        delaminationProtocolRef: "receipt://fatigue-layer-scaling/failing-delamination-protocol-v1",
        interlayerAdhesionRef: "receipt://fatigue-layer-scaling/failing-interlayer-adhesion-v1",
        layerScalingMapRef: "receipt://fatigue-layer-scaling/failing-layer-scaling-map-v1",
        perLayerVariationMapRef: "receipt://fatigue-layer-scaling/failing-per-layer-variation-map-v1",
        nonadditivityModelRef: "receipt://fatigue-layer-scaling/failing-nonadditivity-model-v1",
        activeAreaMapRef: "receipt://fatigue-layer-scaling/failing-active-area-map-v1",
        supportCouplingMapRef: "receipt://fatigue-layer-scaling/failing-support-coupling-map-v1",
        electromagneticCouplingMapRef: "receipt://fatigue-layer-scaling/failing-electromagnetic-coupling-map-v1",
        mechanicalCouplingMapRef: "receipt://fatigue-layer-scaling/failing-mechanical-coupling-map-v1",
        multiphysicsCouplingRef: "receipt://fatigue-layer-scaling/failing-multiphysics-coupling-v1",
        sourceTensorRetentionMapRef: "receipt://fatigue-layer-scaling/failing-source-tensor-retention-map-v1",
        cycleCountToFailure: 5e8,
        requiredCycleCount: 1e9,
        thermalCycleDriftFraction: 0.02,
        creepDriftFraction: 0.02,
        delaminationMargin: 0.8,
        interlayerAdhesionMargin: 0.7,
        layerScalingEfficiency: 0.72,
        perLayerVariationFraction: 0.08,
        nonadditivityFraction: 0.2,
        activeAreaRetention: 0.5,
        supportCouplingFraction: 0.2,
        electromagneticCouplingFraction: 0.2,
        mechanicalCouplingFraction: 0.2,
        sourceTensorRetentionFraction: 0.5,
        supportCouplingStatus: "fail",
      },
    });
    const plan = buildNhm2TileSourceFatigueLayerScalingTestPlan({
      materialEvidenceReceipts: receipts,
    });
    const cycleMargin = plan.testItems.find((item) => item.testId === "cycle_margin");
    const thermalCycleDrift = plan.testItems.find(
      (item) => item.testId === "thermal_cycle_drift",
    );
    const creepDrift = plan.testItems.find((item) => item.testId === "creep_drift");
    const scalingEfficiency = plan.testItems.find(
      (item) => item.testId === "layer_scaling_efficiency",
    );
    const nonadditivity = plan.testItems.find((item) => item.testId === "nonadditivity_fraction");
    const activeArea = plan.testItems.find((item) => item.testId === "active_area_retention");
    const supportCoupling = plan.testItems.find((item) => item.testId === "support_coupling");
    const sourceTensorRetention = plan.testItems.find(
      (item) => item.testId === "source_tensor_retention",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(plan.summary.fatigueReceiptStatus).toBe("fail");
    expect(plan.summary.layerScalingReceiptStatus).toBe("fail");
    expect(plan.summary.combinedReceiptStatus).toBe("fail");
    expect(plan.summary.nextRequiredTestId).toBe("cycle_margin");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://fatigue_layer_scaling/cycle_margin_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain("fatigue-falsified");
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "full_apparatus_tensor",
        "material_credibility_gate",
        "time_dependent_source_campaign",
      ]),
    );
    expect(plan.summary.cycleMargin).toBeLessThan(1);
    expect(plan.summary.thermalCycleDriftMargin).toBeLessThan(1);
    expect(plan.summary.creepDriftMargin).toBeLessThan(1);
    expect(plan.summary.scalingMargin).toBeLessThan(1);
    expect(plan.summary.nonadditivityMargin).toBeLessThan(1);
    expect(plan.summary.activeAreaMargin).toBeLessThan(1);
    expect(plan.summary.falsifiesCurrentCandidate).toBe(true);
    expect(cycleMargin?.status).toBe("falsifying");
    expect(thermalCycleDrift?.status).toBe("falsifying");
    expect(creepDrift?.status).toBe("falsifying");
    expect(scalingEfficiency?.status).toBe("falsifying");
    expect(nonadditivity?.status).toBe("falsifying");
    expect(activeArea?.status).toBe("falsifying");
    expect(supportCoupling?.status).toBe("falsifying");
    expect(sourceTensorRetention?.status).toBe("falsifying");
    expect(cycleMargin?.blockerIds).toContain("fatigue_cycle_margin_below_required");
    expect(cycleMargin?.measurementTargets).toMatchObject({
      cycleMarginMin: 1,
      cycleMarginFormula: "cycleCountToFailure / requiredCycleCount",
    });
    expect(thermalCycleDrift?.blockerIds).toContain("thermal_cycle_drift_above_0p01");
    expect(thermalCycleDrift?.measurementTargets).toMatchObject({
      thermalCycleDriftFractionMax: 0.01,
      thermalCycleRefRequired: true,
    });
    expect(creepDrift?.blockerIds).toContain("creep_drift_above_0p01");
    expect(scalingEfficiency?.blockerIds).toContain("layer_scaling_efficiency_below_0p9");
    expect(scalingEfficiency?.measurementTargets).toMatchObject({
      layerCount: 447,
      layerScalingEfficiencyMin: 0.9,
      layerScalingMapRefRequired: true,
      multiphysicsCouplingRefRequired: true,
    });
    expect(nonadditivity?.blockerIds).toContain("layer_nonadditivity_above_0p1");
    expect(nonadditivity?.measurementTargets).toMatchObject({
      layerNonadditivityFractionMax: 0.1,
      layerNonadditivityModelRefRequired: true,
    });
    expect(activeArea?.blockerIds).toContain("active_area_retention_below_0p6");
    expect(activeArea?.measurementTargets.activeAreaRetentionMin).toBe(0.6);
    expect(activeArea?.measurementTargets.effectiveActiveLayerCountMin).toBeCloseTo(
      217.242,
      3,
    );
    expect(supportCoupling?.blockerIds).toContain("support_coupling_status_not_pass");
    expect(supportCoupling?.falsificationRule).toContain("support coupling");
    expect(sourceTensorRetention?.blockerIds).toContain("source_tensor_retention_below_0p9");
    expect(sourceTensorRetention?.measurementTargets).toMatchObject({
      sourceTensorRetentionFractionMin: 0.9,
      sourceTensorRetentionMapRefRequired: true,
    });
    expect(sourceTensorRetention?.measurementTargets.effectiveSourceTensorLayerCountMin).toBeCloseTo(
      402.3,
      3,
    );
    expect(plan.summary.transportClaimAllowed).toBe(false);
  });

  it("falsifies source-tensor retention claims that exceed scaling and active-area support", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      fatigueLayerScaling: {
        ...passingEvidence.fatigueLayerScaling!,
        layerScalingEfficiency: 0.92,
        nonadditivityFraction: 0.08,
        activeAreaRetention: 1,
        sourceTensorRetentionFraction: 0.94,
      },
    });
    const scalingSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "layer_scaling",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(receipts.summary.materialEvidenceReady).toBe(false);
    expect(scalingSurface?.status).toBe("fail");
    expect(scalingSurface?.blockers).toContain("scalar_retention_estimate_below_0p9");
    expect(scalingSurface?.blockers).toContain(
      "source_tensor_retention_exceeds_scaling_area_estimate",
    );
    expect(scalingSurface?.numericalMargins.scalarRetentionEstimate).toBeCloseTo(0.8464, 12);
    expect(scalingSurface?.numericalMargins.scalarRetentionEstimateMargin).toBeCloseTo(
      0.9404444444444444,
      12,
    );
    expect(
      scalingSurface?.numericalMargins.sourceTensorRetentionConsistencyMargin,
    ).toBeCloseTo(0.9004255319148936, 12);
  });

  it("falsifies fatigue/layer-scaling receipts and budgets with nonphysical numeric domains", () => {
    const invalidFatigueScaling = {
      ...passingEvidence.fatigueLayerScaling!,
      cycleCountToFailure: -1,
      requiredCycleCount: 0,
      thermalCycleDriftFraction: -0.01,
      creepDriftFraction: 1.2,
      delaminationMargin: 0,
      interlayerAdhesionMargin: Number.NaN,
      layerScalingEfficiency: 1.2,
      perLayerVariationFraction: -0.1,
      nonadditivityFraction: 1.2,
      activeAreaRetention: -0.1,
      supportCouplingFraction: -0.1,
      electromagneticCouplingFraction: 1.2,
      mechanicalCouplingFraction: Number.NaN,
      sourceTensorRetentionFraction: 1.2,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      fatigueLayerScaling: invalidFatigueScaling,
    });
    const budget = buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
      generatedAt,
      fatigueLayerScalingEvidence: invalidFatigueScaling,
    });
    const fatigueSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "fatigue_lifetime",
    );
    const scalingSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "layer_scaling",
    );

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(fatigueSurface?.status).toBe("fail");
    expect(scalingSurface?.status).toBe("fail");
    expect(fatigueSurface?.blockers).toEqual(
      expect.arrayContaining([
        "cycle_count_to_failure_invalid",
        "required_cycle_count_invalid",
        "thermal_cycle_drift_fraction_invalid",
        "creep_drift_fraction_invalid",
        "delamination_margin_invalid",
        "interlayer_adhesion_margin_invalid",
      ]),
    );
    expect(scalingSurface?.blockers).toEqual(
      expect.arrayContaining([
        "layer_scaling_efficiency_invalid",
        "per_layer_variation_fraction_invalid",
        "layer_nonadditivity_fraction_invalid",
        "active_area_retention_invalid",
        "support_coupling_fraction_invalid",
        "electromagnetic_coupling_fraction_invalid",
        "mechanical_coupling_fraction_invalid",
        "source_tensor_retention_fraction_invalid",
      ]),
    );
    expect(fatigueSurface?.numericalMargins.cycleMargin).toBeNull();
    expect(fatigueSurface?.numericalMargins.thermalCycleDriftMargin).toBeNull();
    expect(fatigueSurface?.numericalMargins.creepDriftMargin).toBeNull();
    expect(scalingSurface?.numericalMargins.scalingMargin).toBeNull();
    expect(scalingSurface?.numericalMargins.scalarRetentionEstimate).toBeNull();
    expect(scalingSurface?.numericalMargins.sourceTensorRetentionFraction).toBeNull();
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "cycle_count_to_failure_invalid_for_operating_budget",
        "required_cycle_count_invalid_for_operating_budget",
        "thermal_cycle_drift_fraction_invalid_for_operating_budget",
        "creep_drift_fraction_invalid_for_operating_budget",
        "delamination_margin_invalid_for_operating_budget",
        "interlayer_adhesion_margin_invalid_for_operating_budget",
        "layer_scaling_efficiency_invalid_for_operating_budget",
        "per_layer_variation_fraction_invalid_for_operating_budget",
        "layer_nonadditivity_fraction_invalid_for_operating_budget",
        "active_area_retention_invalid_for_operating_budget",
        "support_coupling_fraction_invalid_for_operating_budget",
        "electromagnetic_coupling_fraction_invalid_for_operating_budget",
        "mechanical_coupling_fraction_invalid_for_operating_budget",
        "source_tensor_retention_fraction_invalid_for_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.cycleMargin).toBeNull();
    expect(budget.derivedOperatingBudget.effectiveActiveLayerCount).toBeNull();
    expect(budget.derivedOperatingBudget.effectiveActiveLayerCountMargin).toBeNull();
    expect(budget.derivedOperatingBudget.sourceTensorRetentionFraction).toBeNull();
    expect(budget.derivedOperatingBudget.sourceTensorRetentionMargin).toBeNull();
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("builds fatigue/layer-scaling operating targets for the frozen 447-layer candidate", () => {
    const budget = buildNhm2TileSourceFatigueLayerScalingOperatingBudget({ generatedAt });

    expect(isNhm2TileSourceFatigueLayerScalingOperatingBudget(budget)).toBe(true);
    expect(budget.operatingTargets.layerCount).toBe(447);
    expect(budget.operatingTargets.layerScalingEfficiencyMin).toBe(0.9);
    expect(budget.operatingTargets.perLayerVariationFractionMax).toBe(0.05);
    expect(budget.operatingTargets.layerNonadditivityFractionMax).toBe(0.1);
    expect(budget.operatingTargets.activeAreaRetentionMin).toBe(0.6);
    expect(budget.operatingTargets.supportCouplingFractionMax).toBe(0.1);
    expect(budget.operatingTargets.electromagneticCouplingFractionMax).toBe(0.1);
    expect(budget.operatingTargets.mechanicalCouplingFractionMax).toBe(0.1);
    expect(budget.operatingTargets.sourceTensorRetentionFractionMin).toBe(0.9);
    expect(budget.operatingTargets.thermalCycleDriftFractionMax).toBe(0.01);
    expect(budget.operatingTargets.creepDriftFractionMax).toBe(0.01);
    expect(budget.operatingTargets.delaminationMarginMin).toBe(1);
    expect(budget.operatingTargets.interlayerAdhesionMarginMin).toBe(1);
    expect(budget.operatingTargets.requiredCycleCount).toBe(1e9);
    expect(budget.operatingTargets.layerMapSampleLayerCountMin).toBe(447);
    expect(budget.operatingTargets.couplingMapSampleInterfaceCountMin).toBe(446);
    expect(budget.operatingTargets.effectiveActiveLayerCountMin).toBeCloseTo(217.242, 3);
    expect(budget.operatingTargets.effectiveSourceTensorLayerCountMin).toBeCloseTo(402.3, 3);
    expect(budget.requiredCorrections.cycleMarginMin).toBe(1);
    expect(budget.requiredCorrections.cycleCountRequired).toBe(1e9);
    expect(budget.requiredCorrections.cycleCountShortfall).toBeNull();
    expect(budget.requiredCorrections.thermalCycleDriftFractionMax).toBe(0.01);
    expect(budget.requiredCorrections.thermalCycleDriftReduction).toBeNull();
    expect(budget.requiredCorrections.layerScalingEfficiencyMin).toBe(0.9);
    expect(budget.requiredCorrections.layerScalingEfficiencyShortfall).toBeNull();
    expect(budget.requiredCorrections.effectiveActiveLayerCountMin).toBeCloseTo(217.242, 3);
    expect(budget.requiredCorrections.effectiveActiveLayerCountShortfall).toBeNull();
    expect(budget.requiredCorrections.effectiveSourceTensorLayerCountMin).toBeCloseTo(402.3, 3);
    expect(budget.requiredCorrections.effectiveSourceTensorLayerCountShortfall).toBeNull();
    expect(budget.requiredCorrections.requiredFatigueProvenanceRefCount).toBe(8);
    expect(budget.requiredCorrections.missingFatigueProvenanceRefCount).toBe(8);
    expect(budget.requiredCorrections.requiredLayerScalingProvenanceRefCount).toBe(9);
    expect(budget.requiredCorrections.missingLayerScalingProvenanceRefCount).toBe(9);
    expect(budget.requiredCorrections.supportCouplingStatusSatisfied).toBe(false);
    expect(budget.requiredCorrections.layerMapSampleLayerCountMin).toBe(447);
    expect(budget.requiredCorrections.layerScalingSampledLayerCountShortfall).toBeNull();
    expect(budget.requiredCorrections.perLayerVariationSampledLayerCountShortfall).toBeNull();
    expect(budget.requiredCorrections.activeAreaMapSampledLayerCountShortfall).toBeNull();
    expect(budget.requiredCorrections.sourceTensorRetentionSampledLayerCountShortfall).toBeNull();
    expect(budget.requiredCorrections.couplingMapSampleInterfaceCountMin).toBe(446);
    expect(budget.requiredCorrections.supportCouplingSampledInterfaceCountShortfall).toBeNull();
    expect(
      budget.requiredCorrections.electromagneticCouplingSampledInterfaceCountShortfall,
    ).toBeNull();
    expect(budget.requiredCorrections.mechanicalCouplingSampledInterfaceCountShortfall).toBeNull();
    expect(budget.summary.firstBlocker).toBe(
      "fatigue_layer_scaling_receipt_missing_for_operating_budget",
    );
    expect(budget.claimBoundary.layerScalingCrossTermsMustEnterFullTensor).toBe(true);
  });

  it("clears fatigue/layer-scaling operating budget when cycle and layer margins pass", () => {
    const budget = buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
      generatedAt,
      fatigueLayerScalingEvidence: passingEvidence.fatigueLayerScaling,
    });

    expect(budget.summary.fatigueLayerScalingEvidenceReady).toBe(true);
    expect(budget.summary.firstBlocker).toBe("none");
    expect(budget.derivedOperatingBudget.fatigueProvenanceRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.layerScalingProvenanceRefsAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.layerMapCoverageComplete).toBe(true);
    expect(budget.suppliedFatigueLayerScalingEvidence.cycleProtocolRef).toBe(
      "receipt://fatigue-layer-scaling/cycle-protocol-v1",
    );
    expect(budget.derivedOperatingBudget.cycleMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.thermalCycleDriftMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.creepDriftMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.scalingMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.nonadditivityMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.activeAreaMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.effectiveActiveLayerCount).toBeCloseTo(424.9182, 5);
    expect(budget.derivedOperatingBudget.effectiveActiveLayerCountMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.sourceTensorRetentionFraction).toBeCloseTo(0.94, 4);
    expect(budget.derivedOperatingBudget.sourceTensorRetentionMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.layerScalingSampledLayerCountMargin).toBe(1);
    expect(budget.derivedOperatingBudget.perLayerVariationSampledLayerCountMargin).toBe(1);
    expect(budget.derivedOperatingBudget.activeAreaMapSampledLayerCountMargin).toBe(1);
    expect(budget.derivedOperatingBudget.sourceTensorRetentionSampledLayerCountMargin).toBe(1);
    expect(budget.derivedOperatingBudget.supportCouplingSampledInterfaceCountMargin).toBe(1);
    expect(
      budget.derivedOperatingBudget.electromagneticCouplingSampledInterfaceCountMargin,
    ).toBe(1);
    expect(budget.derivedOperatingBudget.mechanicalCouplingSampledInterfaceCountMargin).toBe(1);
    expect(budget.requiredCorrections.cycleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.thermalCycleDriftReduction).toBe(0);
    expect(budget.requiredCorrections.creepDriftReduction).toBe(0);
    expect(budget.requiredCorrections.delaminationMarginShortfall).toBe(0);
    expect(budget.requiredCorrections.interlayerAdhesionMarginShortfall).toBe(0);
    expect(budget.requiredCorrections.layerScalingEfficiencyShortfall).toBe(0);
    expect(budget.requiredCorrections.perLayerVariationReduction).toBe(0);
    expect(budget.requiredCorrections.layerNonadditivityReduction).toBe(0);
    expect(budget.requiredCorrections.activeAreaRetentionShortfall).toBe(0);
    expect(budget.requiredCorrections.supportCouplingFractionReduction).toBe(0);
    expect(budget.requiredCorrections.electromagneticCouplingFractionReduction).toBe(0);
    expect(budget.requiredCorrections.mechanicalCouplingFractionReduction).toBe(0);
    expect(budget.requiredCorrections.effectiveActiveLayerCountShortfall).toBe(0);
    expect(budget.requiredCorrections.sourceTensorRetentionFractionShortfall).toBe(0);
    expect(budget.requiredCorrections.effectiveSourceTensorLayerCountShortfall).toBe(0);
    expect(budget.requiredCorrections.missingFatigueProvenanceRefCount).toBe(0);
    expect(budget.requiredCorrections.missingLayerScalingProvenanceRefCount).toBe(0);
    expect(budget.requiredCorrections.supportCouplingStatusSatisfied).toBe(true);
    expect(budget.requiredCorrections.layerScalingSampledLayerCountShortfall).toBe(0);
    expect(budget.requiredCorrections.perLayerVariationSampledLayerCountShortfall).toBe(0);
    expect(budget.requiredCorrections.activeAreaMapSampledLayerCountShortfall).toBe(0);
    expect(budget.requiredCorrections.sourceTensorRetentionSampledLayerCountShortfall).toBe(0);
    expect(budget.requiredCorrections.supportCouplingSampledInterfaceCountShortfall).toBe(0);
    expect(
      budget.requiredCorrections.electromagneticCouplingSampledInterfaceCountShortfall,
    ).toBe(0);
    expect(budget.requiredCorrections.mechanicalCouplingSampledInterfaceCountShortfall).toBe(0);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies layer scaling when active area clears the mechanical floor but misses source tensor retention", () => {
    const budget = buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
      generatedAt,
      fatigueLayerScalingEvidence: {
        ...passingEvidence.fatigueLayerScaling,
        activeAreaRetention: 0.7,
        sourceTensorRetentionFraction: 0.63,
      },
    });

    expect(budget.derivedOperatingBudget.activeAreaMargin).toBeGreaterThan(1);
    expect(budget.derivedOperatingBudget.sourceTensorRetentionFraction).toBeCloseTo(
      0.63,
      3,
    );
    expect(budget.derivedOperatingBudget.sourceTensorRetentionMargin).toBeLessThan(1);
    expect(budget.blockers).toEqual(
      expect.arrayContaining(["source_tensor_retention_below_0p9_operating_budget"]),
    );
    expect(budget.requiredCorrections.activeAreaRetentionShortfall).toBe(0);
    expect(budget.requiredCorrections.sourceTensorRetentionFractionShortfall).toBeCloseTo(
      0.27,
      6,
    );
    expect(budget.requiredCorrections.effectiveSourceTensorLayerCountShortfall).toBeCloseTo(
      120.69,
      4,
    );
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies layer scaling when 447-layer maps do not sample every layer and interface", () => {
    const sparseLayerScaling = {
      ...passingEvidence.fatigueLayerScaling!,
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://fatigue-layer-scaling/sparse-layer-map-v1",
      layerScalingSampledLayerCount: 128,
      perLayerVariationSampledLayerCount: 200,
      activeAreaMapSampledLayerCount: 180,
      sourceTensorRetentionSampledLayerCount: 220,
      supportCouplingSampledInterfaceCount: 100,
      electromagneticCouplingSampledInterfaceCount: 150,
      mechanicalCouplingSampledInterfaceCount: 120,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      ...passingEvidence,
      fatigueLayerScaling: sparseLayerScaling,
    });
    const scalingSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "layer_scaling",
    );
    const budget = buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
      generatedAt,
      fatigueLayerScalingEvidence: sparseLayerScaling,
    });

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(scalingSurface?.status).toBe("fail");
    expect(scalingSurface?.blockers).toEqual(
      expect.arrayContaining([
        "layer_scaling_sampled_layer_count_below_447",
        "per_layer_variation_sampled_layer_count_below_447",
        "active_area_map_sampled_layer_count_below_447",
        "source_tensor_retention_sampled_layer_count_below_447",
        "support_coupling_sampled_interface_count_below_446",
        "electromagnetic_coupling_sampled_interface_count_below_446",
        "mechanical_coupling_sampled_interface_count_below_446",
      ]),
    );
    expect(scalingSurface?.numericalMargins.layerMapCoverageComplete).toBe(0);
    expect(scalingSurface?.numericalMargins.layerScalingSampledLayerCountMargin).toBeCloseTo(
      128 / 447,
      12,
    );
    expect(
      scalingSurface?.numericalMargins.supportCouplingSampledInterfaceCountMargin,
    ).toBeCloseTo(100 / 446, 12);
    expect(budget.summary.fatigueLayerScalingEvidenceReady).toBe(false);
    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.derivedOperatingBudget.layerMapCoverageComplete).toBe(false);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "layer_scaling_sampled_layer_count_below_447_for_operating_budget",
        "per_layer_variation_sampled_layer_count_below_447_for_operating_budget",
        "active_area_map_sampled_layer_count_below_447_for_operating_budget",
        "source_tensor_retention_sampled_layer_count_below_447_for_operating_budget",
        "support_coupling_sampled_interface_count_below_446_for_operating_budget",
        "electromagnetic_coupling_sampled_interface_count_below_446_for_operating_budget",
        "mechanical_coupling_sampled_interface_count_below_446_for_operating_budget",
      ]),
    );
    expect(budget.requiredCorrections.layerScalingSampledLayerCountShortfall).toBe(319);
    expect(budget.requiredCorrections.perLayerVariationSampledLayerCountShortfall).toBe(247);
    expect(budget.requiredCorrections.activeAreaMapSampledLayerCountShortfall).toBe(267);
    expect(budget.requiredCorrections.sourceTensorRetentionSampledLayerCountShortfall).toBe(227);
    expect(budget.requiredCorrections.supportCouplingSampledInterfaceCountShortfall).toBe(346);
    expect(
      budget.requiredCorrections.electromagneticCouplingSampledInterfaceCountShortfall,
    ).toBe(296);
    expect(budget.requiredCorrections.mechanicalCouplingSampledInterfaceCountShortfall).toBe(326);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("falsifies fatigue/layer scaling when cycle, effective layer, or support margins fail", () => {
    const budget = buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
      generatedAt,
      fatigueLayerScalingEvidence: {
        evidenceTier: "measured",
        evidenceRef: "receipt://fatigue-layer-scaling/failing-operating-budget-v1",
        loadSpectrumRef: "receipt://fatigue-layer-scaling/failing-load-spectrum-v1",
        cycleProtocolRef: "receipt://fatigue-layer-scaling/failing-cycle-protocol-v1",
        cryogenicFatigueRef: "receipt://fatigue-layer-scaling/failing-cryogenic-fatigue-v1",
        fatigueCurveRef: "receipt://fatigue-layer-scaling/failing-fatigue-curve-v1",
        thermalCycleRef: "receipt://fatigue-layer-scaling/failing-thermal-cycle-v1",
        creepDriftRef: "receipt://fatigue-layer-scaling/failing-creep-drift-v1",
        delaminationProtocolRef: "receipt://fatigue-layer-scaling/failing-delamination-protocol-v1",
        interlayerAdhesionRef: "receipt://fatigue-layer-scaling/failing-interlayer-adhesion-v1",
        layerScalingMapRef: "receipt://fatigue-layer-scaling/failing-layer-scaling-map-v1",
        perLayerVariationMapRef: "receipt://fatigue-layer-scaling/failing-per-layer-variation-map-v1",
        nonadditivityModelRef: "receipt://fatigue-layer-scaling/failing-nonadditivity-model-v1",
        activeAreaMapRef: "receipt://fatigue-layer-scaling/failing-active-area-map-v1",
        supportCouplingMapRef: "receipt://fatigue-layer-scaling/failing-support-coupling-map-v1",
        electromagneticCouplingMapRef: "receipt://fatigue-layer-scaling/failing-electromagnetic-coupling-map-v1",
        mechanicalCouplingMapRef: "receipt://fatigue-layer-scaling/failing-mechanical-coupling-map-v1",
        multiphysicsCouplingRef: "receipt://fatigue-layer-scaling/failing-multiphysics-coupling-v1",
        sourceTensorRetentionMapRef: "receipt://fatigue-layer-scaling/failing-source-tensor-retention-map-v1",
        cycleCountToFailure: 5e8,
        requiredCycleCount: 1e9,
        thermalCycleDriftFraction: 0.02,
        creepDriftFraction: 0.02,
        delaminationMargin: 0.8,
        interlayerAdhesionMargin: 0.7,
        layerScalingEfficiency: 0.72,
        perLayerVariationFraction: 0.08,
        nonadditivityFraction: 0.2,
        activeAreaRetention: 0.5,
        supportCouplingFraction: 0.2,
        electromagneticCouplingFraction: 0.2,
        mechanicalCouplingFraction: 0.2,
        sourceTensorRetentionFraction: 0.5,
        supportCouplingStatus: "fail",
      },
    });

    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "fatigue_cycle_margin_below_one_operating_budget",
        "thermal_cycle_drift_above_0p01_operating_budget",
        "creep_drift_above_0p01_operating_budget",
        "delamination_margin_below_one_operating_budget",
        "interlayer_adhesion_margin_below_one_operating_budget",
        "layer_scaling_efficiency_below_0p9_operating_budget",
        "per_layer_variation_above_0p05_operating_budget",
        "layer_nonadditivity_above_0p1_operating_budget",
        "active_area_retention_below_0p6_operating_budget",
        "effective_active_layer_count_below_operating_budget",
        "support_coupling_fraction_above_0p1_operating_budget",
        "electromagnetic_coupling_fraction_above_0p1_operating_budget",
        "mechanical_coupling_fraction_above_0p1_operating_budget",
        "source_tensor_retention_below_0p9_operating_budget",
        "support_coupling_status_not_pass_for_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.effectiveActiveLayerCount).toBeCloseTo(128.736, 3);
    expect(budget.derivedOperatingBudget.effectiveActiveLayerCountMargin).toBeLessThan(1);
    expect(budget.requiredCorrections.cycleCountShortfall).toBe(5e8);
    expect(budget.requiredCorrections.thermalCycleDriftReduction).toBeCloseTo(0.01, 12);
    expect(budget.requiredCorrections.creepDriftReduction).toBeCloseTo(0.01, 12);
    expect(budget.requiredCorrections.delaminationMarginShortfall).toBeCloseTo(0.2, 12);
    expect(budget.requiredCorrections.interlayerAdhesionMarginShortfall).toBeCloseTo(0.3, 12);
    expect(budget.requiredCorrections.layerScalingEfficiencyShortfall).toBeCloseTo(0.18, 12);
    expect(budget.requiredCorrections.perLayerVariationReduction).toBeCloseTo(0.03, 12);
    expect(budget.requiredCorrections.layerNonadditivityReduction).toBeCloseTo(0.1, 12);
    expect(budget.requiredCorrections.activeAreaRetentionShortfall).toBeCloseTo(0.1, 12);
    expect(budget.requiredCorrections.supportCouplingFractionReduction).toBeCloseTo(0.1, 12);
    expect(budget.requiredCorrections.electromagneticCouplingFractionReduction).toBeCloseTo(0.1, 12);
    expect(budget.requiredCorrections.mechanicalCouplingFractionReduction).toBeCloseTo(0.1, 12);
    expect(budget.requiredCorrections.effectiveActiveLayerCountShortfall).toBeCloseTo(88.506, 3);
    expect(budget.requiredCorrections.sourceTensorRetentionFractionShortfall).toBeCloseTo(
      0.4,
      3,
    );
    expect(budget.requiredCorrections.effectiveSourceTensorLayerCountShortfall).toBeCloseTo(
      178.8,
      3,
    );
    expect(budget.requiredCorrections.supportCouplingStatusSatisfied).toBe(false);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("blocks scalar-only fatigue/layer-scaling values without cycle, map, and coupling provenance", () => {
    const scalarOnlyFatigueScaling = {
      evidenceTier: "measured" as const,
      evidenceRef: "receipt://fatigue-layer-scaling/scalar-only-v1",
      cycleCountToFailure: 2e9,
      requiredCycleCount: 1e9,
      layerScalingEfficiency: 0.95,
      nonadditivityFraction: 0.05,
      activeAreaRetention: 0.7,
      supportCouplingStatus: "pass" as const,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      fatigueLayerScaling: scalarOnlyFatigueScaling,
    });
    const plan = buildNhm2TileSourceFatigueLayerScalingTestPlan({ materialEvidenceReceipts: receipts });
    const budget = buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
      generatedAt,
      fatigueLayerScalingEvidence: scalarOnlyFatigueScaling,
    });
    const fatigueSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "fatigue_lifetime",
    );
    const scalingSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "layer_scaling",
    );
    const provenance = plan.testItems.find((item) => item.testId === "fatigue_scaling_provenance");

    expect(fatigueSurface?.status).toBe("fail");
    expect(scalingSurface?.status).toBe("fail");
    expect(fatigueSurface?.blockers).toEqual(
      expect.arrayContaining([
        "fatigue_load_spectrum_ref_missing",
        "fatigue_cycle_protocol_ref_missing",
        "cryogenic_fatigue_ref_missing",
        "fatigue_curve_ref_missing",
        "thermal_cycle_ref_missing",
        "creep_drift_ref_missing",
        "delamination_protocol_ref_missing",
        "interlayer_adhesion_ref_missing",
        "thermal_cycle_drift_fraction_missing",
        "creep_drift_fraction_missing",
        "delamination_margin_missing",
        "interlayer_adhesion_margin_missing",
      ]),
    );
    expect(scalingSurface?.blockers).toEqual(
      expect.arrayContaining([
        "layer_scaling_map_ref_missing",
        "per_layer_variation_map_ref_missing",
        "layer_nonadditivity_model_ref_missing",
        "active_area_map_ref_missing",
        "support_coupling_map_ref_missing",
        "electromagnetic_coupling_map_ref_missing",
        "mechanical_coupling_map_ref_missing",
        "multiphysics_coupling_ref_missing",
        "source_tensor_retention_map_ref_missing",
        "per_layer_variation_fraction_missing",
        "support_coupling_fraction_missing",
        "electromagnetic_coupling_fraction_missing",
        "mechanical_coupling_fraction_missing",
        "source_tensor_retention_fraction_missing",
      ]),
    );
    expect(fatigueSurface?.numericalMargins.fatigueProvenanceRefsAvailable).toBe(0);
    expect(scalingSurface?.numericalMargins.layerScalingProvenanceRefsAvailable).toBe(0);
    expect(plan.summary.nextRequiredTestId).toBe("fatigue_scaling_provenance");
    expect(provenance?.status).toBe("falsifying");
    expect(provenance?.measurementTargets.requiredFatigueProvenanceRefCount).toBe(8);
    expect(provenance?.measurementTargets.requiredLayerScalingProvenanceRefCount).toBe(9);
    expect(provenance?.falsificationRule).toContain("source-retention maps");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://fatigue_layer_scaling/provenance_v1",
    );
    expect(budget.summary.fatigueLayerScalingEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.fatigueProvenanceRefsAvailable).toBe(false);
    expect(budget.derivedOperatingBudget.layerScalingProvenanceRefsAvailable).toBe(false);
    expect(budget.requiredCorrections.cycleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.thermalCycleDriftReduction).toBeNull();
    expect(budget.requiredCorrections.creepDriftReduction).toBeNull();
    expect(budget.requiredCorrections.delaminationMarginShortfall).toBeNull();
    expect(budget.requiredCorrections.interlayerAdhesionMarginShortfall).toBeNull();
    expect(budget.requiredCorrections.layerScalingEfficiencyShortfall).toBe(0);
    expect(budget.requiredCorrections.perLayerVariationReduction).toBeNull();
    expect(budget.requiredCorrections.layerNonadditivityReduction).toBe(0);
    expect(budget.requiredCorrections.activeAreaRetentionShortfall).toBe(0);
    expect(budget.requiredCorrections.supportCouplingFractionReduction).toBeNull();
    expect(budget.requiredCorrections.electromagneticCouplingFractionReduction).toBeNull();
    expect(budget.requiredCorrections.mechanicalCouplingFractionReduction).toBeNull();
    expect(budget.requiredCorrections.sourceTensorRetentionFractionShortfall).toBeNull();
    expect(budget.requiredCorrections.missingFatigueProvenanceRefCount).toBe(8);
    expect(budget.requiredCorrections.missingLayerScalingProvenanceRefCount).toBe(9);
    expect(budget.requiredCorrections.supportCouplingStatusSatisfied).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "fatigue_load_spectrum_ref_missing_for_operating_budget",
        "fatigue_cycle_protocol_ref_missing_for_operating_budget",
        "cryogenic_fatigue_ref_missing_for_operating_budget",
        "fatigue_curve_ref_missing_for_operating_budget",
        "thermal_cycle_ref_missing_for_operating_budget",
        "creep_drift_ref_missing_for_operating_budget",
        "delamination_protocol_ref_missing_for_operating_budget",
        "interlayer_adhesion_ref_missing_for_operating_budget",
        "thermal_cycle_drift_fraction_missing_for_operating_budget",
        "creep_drift_fraction_missing_for_operating_budget",
        "delamination_margin_missing_for_operating_budget",
        "interlayer_adhesion_margin_missing_for_operating_budget",
        "layer_scaling_map_ref_missing_for_operating_budget",
        "per_layer_variation_fraction_missing_for_operating_budget",
        "per_layer_variation_map_ref_missing_for_operating_budget",
        "layer_nonadditivity_model_ref_missing_for_operating_budget",
        "active_area_map_ref_missing_for_operating_budget",
        "support_coupling_map_ref_missing_for_operating_budget",
        "support_coupling_fraction_missing_for_operating_budget",
        "electromagnetic_coupling_fraction_missing_for_operating_budget",
        "electromagnetic_coupling_map_ref_missing_for_operating_budget",
        "mechanical_coupling_fraction_missing_for_operating_budget",
        "mechanical_coupling_map_ref_missing_for_operating_budget",
        "multiphysics_coupling_ref_missing_for_operating_budget",
        "source_tensor_retention_fraction_missing_for_operating_budget",
        "source_tensor_retention_map_ref_missing_for_operating_budget",
      ]),
    );
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("maps an absent full-apparatus tensor receipt to tensor provenance", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({ generatedAt });
    const plan = buildNhm2TileSourceFullApparatusTensorTestPlan({
      materialEvidenceReceipts: receipts,
      materialEvidenceReceiptsRef: "artifact://material-receipts",
    });
    const provenance = plan.testItems.find(
      (item) => item.testId === "full_apparatus_tensor_provenance",
    );

    expect(isNhm2TileSourceFullApparatusTensorTestPlan(plan)).toBe(true);
    expect(plan.fullApparatusTensorTarget.requiredComponents).toEqual([
      "T00",
      "T0i",
      "diagonalTij",
      "offDiagonalTij",
    ]);
    expect(plan.fullApparatusTensorTarget.requiredTensorComponentCount).toBe(10);
    expect(plan.fullApparatusTensorTarget.requiredTermCount).toBe(9);
    expect(plan.fullApparatusTensorTarget.requiredSubsystemReceiptCount).toBe(5);
    expect(plan.fullApparatusTensorTarget.requiredRegions).toEqual([
      "wall",
      "hull",
      "exterior_shell",
    ]);
    expect(plan.fullApparatusTensorTarget.sourceSideOnly).toBe(true);
    expect(plan.fullApparatusTensorTarget.targetEchoForbidden).toBe(true);
    expect(plan.summary.fullApparatusTensorReceiptStatus).toBe("missing");
    expect(plan.summary.nextRequiredTestId).toBe("full_apparatus_tensor_provenance");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://full_apparatus_tensor/provenance_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain(
      "full-apparatus tensor value artifact",
    );
    expect(plan.summary.nextBlockedCampaignDomains).toEqual(
      expect.arrayContaining([
        "source_side_same_basis_authority",
        "regional_residual_closure",
        "wall_t00_closure",
        "covariant_conservation",
        "qei_worldline_dossier",
        "observer_family_energy_conditions",
        "material_credibility_gate",
        "coupled_closure",
        "time_dependent_source_campaign",
      ]),
    );
    expect(provenance?.status).toBe("open");
    expect(provenance?.blockerIds).toContain("support_drive_terms_in_full_apparatus_Tmunu_missing");
    expect(provenance?.measurementTargets).toMatchObject({
      requiredEvidenceTier: "measured_or_validated_simulation",
      requiredTensorValueArtifactContract: "nhm2_tile_source_full_apparatus_tensor_values/v1",
      requiredTensorComponentCount: 10,
      requiredTermCount: 9,
      requiredRegionCount: 3,
      sourceSideOnly: true,
      targetEchoForbidden: true,
    });
    expect(provenance?.falsificationRule).toContain("source-side full-apparatus tensor");
    expect(provenance?.blocksCampaignDomains).toContain("coupled_closure");
    expect(plan.summary.fullApparatusTensorEvidenceReady).toBe(false);
    expect(plan.claimBoundary.scalarCasimirT00IsNotFullApparatusTensor).toBe(true);
    expect(plan.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("marks scalar-like or incomplete full-apparatus tensor evidence as falsifying", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      fullApparatusTensor: {
        evidenceTier: "validated_simulation",
        evidenceRef: "receipt://full-apparatus-tmunu/scalar-like-fail-v1",
        sameChart: true,
        sameBasis: false,
        sameUnits: true,
        noMetricTargetEcho: false,
        components: {
          T00: true,
          T0i: false,
          diagonalTij: true,
          offDiagonalTij: false,
        },
        termCoverage: {
          supportStructureStressEnergy: false,
          spacerContactStressEnergy: false,
          activeControlFieldEnergy: false,
          thermalLoadStressEnergy: false,
          patchPotentialElectrostaticStress: false,
          fatigueDamageEvolution: false,
          layerScalingCrossTerms: false,
          casimirInteractionStressEnergy: true,
          materialStrainEnergy: false,
        },
        regionalCoverage: {
          wall: true,
          hull: false,
          exteriorShell: false,
        },
      },
    });
    const plan = buildNhm2TileSourceFullApparatusTensorTestPlan({
      materialEvidenceReceipts: receipts,
    });
    const sameBasis = plan.testItems.find((item) => item.testId === "same_basis");
    const noEcho = plan.testItems.find((item) => item.testId === "no_metric_target_echo");
    const t0i = plan.testItems.find((item) => item.testId === "T0i_components");
    const offDiagonal = plan.testItems.find(
      (item) => item.testId === "off_diagonal_Tij_components",
    );
    const support = plan.testItems.find(
      (item) => item.testId === "support_structure_stress_energy",
    );
    const activeControl = plan.testItems.find(
      (item) => item.testId === "active_control_field_energy",
    );
    const materialCouponReceiptRef = plan.testItems.find(
      (item) => item.testId === "material_coupon_receipt_ref",
    );
    const forceGapReceiptRef = plan.testItems.find(
      (item) => item.testId === "force_gap_receipt_ref",
    );
    const roughnessPatchReceiptRef = plan.testItems.find(
      (item) => item.testId === "roughness_patch_receipt_ref",
    );
    const activeControlReceiptRef = plan.testItems.find(
      (item) => item.testId === "active_control_receipt_ref",
    );
    const fatigueLayerScalingReceiptRef = plan.testItems.find(
      (item) => item.testId === "fatigue_layer_scaling_receipt_ref",
    );
    const casimir = plan.testItems.find(
      (item) => item.testId === "casimir_interaction_stress_energy",
    );
    const hull = plan.testItems.find((item) => item.testId === "regional_hull_coverage");

    expect(receipts.summary.candidateDisposition).toBe("falsified");
    expect(plan.summary.fullApparatusTensorReceiptStatus).toBe("fail");
    expect(plan.summary.nextRequiredTestId).toBe("same_basis");
    expect(plan.summary.nextRequiredArtifactToProduce).toBe(
      "receipt://full_apparatus_tensor/same_basis_v1",
    );
    expect(plan.summary.nextRequiredFalsificationRule).toContain("same-basis mismatch");
    expect(plan.summary.componentCoverageFraction).toBe(0.5);
    expect(plan.summary.termCoverageFraction).toBeCloseTo(1 / 9);
    expect(plan.summary.falsifiesCurrentCandidate).toBe(true);
    expect(sameBasis?.status).toBe("falsifying");
    expect(sameBasis?.measurementTargets).toMatchObject({
      sameBasisRequired: true,
      basisMustMatchSourceAuthority: true,
    });
    expect(noEcho?.status).toBe("falsifying");
    expect(noEcho?.measurementTargets.noMetricTargetEchoRequired).toBe(true);
    expect(t0i?.status).toBe("falsifying");
    expect(t0i?.measurementTargets).toMatchObject({
      componentGroup: "T0i",
      requiredTensorComponentCount: 3,
      silentlyZeroForbidden: true,
    });
    expect(t0i?.falsificationRule).toContain("T01/T02/T03");
    expect(offDiagonal?.status).toBe("falsifying");
    expect(offDiagonal?.measurementTargets).toMatchObject({
      componentGroup: "offDiagonalTij",
      requiredTensorComponentCount: 3,
      silentlyZeroForbidden: true,
    });
    expect(offDiagonal?.falsificationRule).toContain("T12/T13/T23");
    expect(support?.status).toBe("falsifying");
    expect(activeControl?.status).toBe("falsifying");
    expect(activeControl?.measurementTargets).toMatchObject({
      termId: "activeControlFieldEnergy",
      termRefRequired: true,
      termMustEnterTensorValueArtifact: true,
    });
    expect(materialCouponReceiptRef?.status).toBe("falsifying");
    expect(materialCouponReceiptRef?.blockerIds).toContain(
      "full_apparatus_material_coupon_receipt_ref_missing",
    );
    expect(materialCouponReceiptRef?.measurementTargets).toMatchObject({
      subsystemReceiptId: "materialCoupon",
      requiredSubsystemReceiptCount: 5,
      subsystemReceiptRefRequired: true,
      mustTieToTensorTerms: true,
    });
    expect(forceGapReceiptRef?.status).toBe("falsifying");
    expect(forceGapReceiptRef?.blockerIds).toContain(
      "full_apparatus_force_gap_receipt_ref_missing",
    );
    expect(roughnessPatchReceiptRef?.status).toBe("falsifying");
    expect(roughnessPatchReceiptRef?.blockerIds).toContain(
      "full_apparatus_roughness_patch_receipt_ref_missing",
    );
    expect(activeControlReceiptRef?.status).toBe("falsifying");
    expect(activeControlReceiptRef?.blockerIds).toContain(
      "full_apparatus_active_control_receipt_ref_missing",
    );
    expect(fatigueLayerScalingReceiptRef?.status).toBe("falsifying");
    expect(fatigueLayerScalingReceiptRef?.blockerIds).toContain(
      "full_apparatus_fatigue_layer_scaling_receipt_ref_missing",
    );
    expect(casimir?.status).toBe("satisfied");
    expect(hull?.status).toBe("falsifying");
    expect(hull?.measurementTargets).toMatchObject({
      regionId: "hull",
      regionalSupportRefRequired: true,
      canonicalSupportRequired: true,
    });
    expect(t0i?.blockerIds).toContain("full_apparatus_T0i_missing");
    expect(offDiagonal?.blockerIds).toContain("full_apparatus_off_diagonal_Tij_missing");
    expect(support?.blockerIds).toContain("full_apparatus_support_structure_stress_energy_missing");
    expect(activeControl?.blockerIds).toContain("full_apparatus_active_control_field_energy_missing");
    expect(hull?.blockerIds).toContain("full_apparatus_hull_region_missing");
    expect(plan.summary.transportClaimAllowed).toBe(false);
  });

  it("builds full-apparatus tensor operating targets with scalar-only forbidden", () => {
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({ generatedAt });

    expect(isNhm2TileSourceFullApparatusTensorOperatingBudget(budget)).toBe(true);
    expect(budget.operatingTargets.requiredComponentGroupCount).toBe(4);
    expect(budget.operatingTargets.requiredTensorComponentCount).toBe(10);
    expect(budget.operatingTargets.requiredTermCount).toBe(9);
    expect(budget.operatingTargets.requiredRegionCount).toBe(3);
    expect(budget.operatingTargets.scalarT00OnlyForbidden).toBe(true);
    expect(budget.derivedOperatingBudget.componentCoverageFraction).toBe(0);
    expect(budget.derivedOperatingBudget.termCoverageFraction).toBe(0);
    expect(budget.derivedOperatingBudget.regionalCoverageFraction).toBe(0);
    expect(budget.requiredCorrections.componentGroupMissingCount).toBe(4);
    expect(budget.requiredCorrections.missingComponentGroupIds).toEqual([
      "T00",
      "T0i",
      "diagonalTij",
      "offDiagonalTij",
    ]);
    expect(budget.requiredCorrections.componentGroupRefMissingCount).toBe(4);
    expect(budget.requiredCorrections.tensorComponentRefMissingCount).toBe(10);
    expect(budget.requiredCorrections.stressEnergyTermMissingCount).toBe(9);
    expect(budget.requiredCorrections.stressEnergyTermRefMissingCount).toBe(9);
    expect(budget.requiredCorrections.regionCoverageMissingCount).toBe(3);
    expect(budget.requiredCorrections.regionalSupportRefMissingCount).toBe(3);
    expect(budget.requiredCorrections.authorityMetadataMissingCount).toBe(4);
    expect(budget.requiredCorrections.componentCoverageFractionShortfall).toBe(1);
    expect(budget.requiredCorrections.termCoverageFractionShortfall).toBe(1);
    expect(budget.requiredCorrections.regionalCoverageFractionShortfall).toBe(1);
    expect(budget.requiredCorrections.tensorValueArtifactAvailable).toBe(false);
    expect(budget.requiredCorrections.scalarT00OnlyDetected).toBe(false);
    expect(budget.summary.firstBlocker).toBe(
      "full_apparatus_tensor_receipt_missing_for_operating_budget",
    );
    expect(budget.claimBoundary.scalarCasimirT00IsNotFullApparatusTensor).toBe(true);
  });

  it("blocks full-apparatus tensor evidence when coverage flags lack provenance refs", () => {
    const booleanOnlyEvidence = {
      ...passingEvidence.fullApparatusTensor!,
      componentRefs: undefined,
      componentDetailRefs: undefined,
      termRefs: undefined,
      regionalSupportRefs: undefined,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      fullApparatusTensor: booleanOnlyEvidence,
    });
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: booleanOnlyEvidence,
    });
    const tensorSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "full_apparatus_tensor",
    );

    expect(tensorSurface?.status).toBe("fail");
    expect(tensorSurface?.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_T00_ref_missing",
        "full_apparatus_T0i_ref_missing",
        "full_apparatus_T01_ref_missing",
        "full_apparatus_T12_ref_missing",
        "full_apparatus_support_structure_stress_energy_ref_missing",
        "full_apparatus_wall_region_support_ref_missing",
      ]),
    );
    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.componentRefsComplete).toBe(false);
    expect(budget.derivedOperatingBudget.componentDetailRefsComplete).toBe(false);
    expect(budget.derivedOperatingBudget.termRefsComplete).toBe(false);
    expect(budget.derivedOperatingBudget.regionalSupportRefsComplete).toBe(false);
    expect(budget.requiredCorrections.componentGroupMissingCount).toBe(0);
    expect(budget.requiredCorrections.componentGroupRefMissingCount).toBe(4);
    expect(budget.requiredCorrections.missingComponentGroupRefIds).toEqual([
      "T00",
      "T0i",
      "diagonalTij",
      "offDiagonalTij",
    ]);
    expect(budget.requiredCorrections.tensorComponentRefMissingCount).toBe(10);
    expect(budget.requiredCorrections.missingTensorComponentIds).toContain("T01");
    expect(budget.requiredCorrections.stressEnergyTermMissingCount).toBe(0);
    expect(budget.requiredCorrections.stressEnergyTermRefMissingCount).toBe(9);
    expect(budget.requiredCorrections.regionCoverageMissingCount).toBe(0);
    expect(budget.requiredCorrections.regionalSupportRefMissingCount).toBe(3);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_T00_ref_missing_for_operating_budget",
        "full_apparatus_T0i_ref_missing_for_operating_budget",
        "full_apparatus_T01_ref_missing_for_operating_budget",
        "full_apparatus_T12_ref_missing_for_operating_budget",
        "full_apparatus_support_structure_stress_energy_ref_missing_for_operating_budget",
        "full_apparatus_wall_region_support_ref_missing_for_operating_budget",
      ]),
    );
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("blocks grouped full-apparatus component refs without per-component tensor refs", () => {
    const groupedOnlyEvidence = {
      ...passingEvidence.fullApparatusTensor!,
      componentDetailRefs: undefined,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      fullApparatusTensor: groupedOnlyEvidence,
    });
    const plan = buildNhm2TileSourceFullApparatusTensorTestPlan({
      materialEvidenceReceipts: receipts,
    });
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: groupedOnlyEvidence,
    });
    const tensorSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "full_apparatus_tensor",
    );
    const t0i = plan.testItems.find((item) => item.testId === "T0i_components");
    const diagonal = plan.testItems.find((item) => item.testId === "diagonal_Tij_components");
    const offDiagonal = plan.testItems.find(
      (item) => item.testId === "off_diagonal_Tij_components",
    );

    expect(tensorSurface?.status).toBe("fail");
    expect(tensorSurface?.numericalMargins.componentRefsAvailable).toBe(1);
    expect(tensorSurface?.numericalMargins.componentDetailRefsAvailable).toBe(0);
    expect(tensorSurface?.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_T01_ref_missing",
        "full_apparatus_T02_ref_missing",
        "full_apparatus_T03_ref_missing",
        "full_apparatus_T11_ref_missing",
        "full_apparatus_T12_ref_missing",
        "full_apparatus_T13_ref_missing",
        "full_apparatus_T22_ref_missing",
        "full_apparatus_T23_ref_missing",
        "full_apparatus_T33_ref_missing",
      ]),
    );
    expect(t0i?.blockerIds).toEqual(
      expect.arrayContaining([
        "full_apparatus_T01_ref_missing",
        "full_apparatus_T02_ref_missing",
        "full_apparatus_T03_ref_missing",
      ]),
    );
    expect(diagonal?.blockerIds).toEqual(
      expect.arrayContaining([
        "full_apparatus_T11_ref_missing",
        "full_apparatus_T22_ref_missing",
        "full_apparatus_T33_ref_missing",
      ]),
    );
    expect(offDiagonal?.blockerIds).toEqual(
      expect.arrayContaining([
        "full_apparatus_T12_ref_missing",
        "full_apparatus_T13_ref_missing",
        "full_apparatus_T23_ref_missing",
      ]),
    );
    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.componentRefsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.componentDetailRefsComplete).toBe(false);
    expect(budget.requiredCorrections.componentGroupMissingCount).toBe(0);
    expect(budget.requiredCorrections.componentGroupRefMissingCount).toBe(0);
    expect(budget.requiredCorrections.tensorComponentRefMissingCount).toBe(10);
    expect(budget.requiredCorrections.missingTensorComponentIds).toEqual([
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
    ]);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_T01_ref_missing_for_operating_budget",
        "full_apparatus_T12_ref_missing_for_operating_budget",
        "full_apparatus_T33_ref_missing_for_operating_budget",
      ]),
    );
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("blocks full-apparatus tensor operating budget when tensor-value artifact is missing", () => {
    const provenanceOnlyEvidence = {
      ...passingEvidence.fullApparatusTensor!,
      tensorValueArtifactRef: undefined,
      tensorValueArtifactContract: undefined,
    };
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts({
      generatedAt,
      fullApparatusTensor: provenanceOnlyEvidence,
    });
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: provenanceOnlyEvidence,
    });
    const tensorSurface = receipts.receiptSurfaces.find(
      (surface) => surface.surfaceId === "full_apparatus_tensor",
    );

    expect(tensorSurface?.status).toBe("fail");
    expect(tensorSurface?.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_tensor_value_artifact_ref_missing",
        "full_apparatus_tensor_value_artifact_contract_missing_or_invalid",
      ]),
    );
    expect(tensorSurface?.numericalMargins.tensorValueArtifactAvailable).toBe(0);
    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(false);
    expect(budget.derivedOperatingBudget.componentDetailRefsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.tensorValueArtifactAvailable).toBe(false);
    expect(budget.requiredCorrections.tensorValueArtifactRequired).toBe(true);
    expect(budget.requiredCorrections.tensorValueArtifactAvailable).toBe(false);
    expect(budget.requiredCorrections.componentGroupMissingCount).toBe(0);
    expect(budget.requiredCorrections.tensorComponentRefMissingCount).toBe(0);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_tensor_value_artifact_ref_missing_for_operating_budget",
        "full_apparatus_tensor_value_artifact_contract_missing_or_invalid_for_operating_budget",
      ]),
    );
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("clears full-apparatus tensor operating budget only with full source-side coverage", () => {
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: passingEvidence.fullApparatusTensor,
    });

    expect(budget.summary.fullApparatusTensorEvidenceReady).toBe(true);
    expect(budget.summary.firstBlocker).toBe("none");
    expect(budget.derivedOperatingBudget.authorityMetadataComplete).toBe(true);
    expect(budget.derivedOperatingBudget.componentRefsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.componentDetailRefsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.tensorValueArtifactAvailable).toBe(true);
    expect(budget.derivedOperatingBudget.termRefsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.regionalSupportRefsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.regionalSampleCountsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.regionalSampleCountsMeetMinimum).toBe(true);
    expect(budget.derivedOperatingBudget.fullTensorCoverageComplete).toBe(true);
    expect(budget.derivedOperatingBudget.requiredStressEnergyTermsComplete).toBe(true);
    expect(budget.derivedOperatingBudget.requiredRegionalCoverageComplete).toBe(true);
    expect(budget.derivedOperatingBudget.scalarT00Only).toBe(false);
    expect(budget.derivedOperatingBudget.componentCoverageFraction).toBe(1);
    expect(budget.derivedOperatingBudget.termCoverageFraction).toBe(1);
    expect(budget.derivedOperatingBudget.regionalCoverageFraction).toBe(1);
    expect(budget.requiredCorrections.componentGroupMissingCount).toBe(0);
    expect(budget.requiredCorrections.componentGroupRefMissingCount).toBe(0);
    expect(budget.requiredCorrections.tensorComponentRefMissingCount).toBe(0);
    expect(budget.requiredCorrections.stressEnergyTermMissingCount).toBe(0);
    expect(budget.requiredCorrections.stressEnergyTermRefMissingCount).toBe(0);
    expect(budget.requiredCorrections.regionCoverageMissingCount).toBe(0);
    expect(budget.requiredCorrections.regionalSupportRefMissingCount).toBe(0);
    expect(budget.requiredCorrections.regionalSampleCountMissingOrInvalidCount).toBe(0);
    expect(budget.requiredCorrections.regionalTensorSampleCountMin).toBe(447);
    expect(budget.requiredCorrections.regionalSampleCountBelowMinimumCount).toBe(0);
    expect(budget.requiredCorrections.wallRegionalSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.hullRegionalSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.exteriorShellRegionalSampleCountShortfall).toBe(0);
    expect(budget.requiredCorrections.authorityMetadataMissingCount).toBe(0);
    expect(budget.requiredCorrections.componentCoverageFractionShortfall).toBe(0);
    expect(budget.requiredCorrections.termCoverageFractionShortfall).toBe(0);
    expect(budget.requiredCorrections.regionalCoverageFractionShortfall).toBe(0);
    expect(budget.requiredCorrections.tensorValueArtifactAvailable).toBe(true);
    expect(budget.requiredCorrections.scalarT00OnlyDetected).toBe(false);
    expect(budget.summary.physicalViabilityClaimAllowed).toBe(false);
  });

  it("falsifies full-apparatus tensor operating budget when source tensor is scalar-like or incomplete", () => {
    const budget = buildNhm2TileSourceFullApparatusTensorOperatingBudget({
      generatedAt,
      fullApparatusTensorEvidence: {
        evidenceTier: "validated_simulation",
        evidenceRef: "receipt://full-apparatus-tmunu/scalar-like-operating-budget-fail-v1",
        sameChart: true,
        sameBasis: true,
        sameUnits: true,
        noMetricTargetEcho: false,
        components: {
          T00: true,
          T0i: false,
          diagonalTij: false,
          offDiagonalTij: false,
        },
        termCoverage: {
          supportStructureStressEnergy: false,
          spacerContactStressEnergy: false,
          activeControlFieldEnergy: false,
          thermalLoadStressEnergy: false,
          patchPotentialElectrostaticStress: false,
          fatigueDamageEvolution: false,
          layerScalingCrossTerms: false,
          casimirInteractionStressEnergy: true,
          materialStrainEnergy: false,
        },
        regionalCoverage: {
          wall: true,
          hull: false,
          exteriorShell: false,
        },
      },
    });

    expect(budget.summary.falsifiesCurrentCandidate).toBe(true);
    expect(budget.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_tensor_metric_echo_detected_or_not_checked_for_operating_budget",
        "full_apparatus_tensor_scalar_T00_only_forbidden",
        "full_apparatus_T0i_missing_for_operating_budget",
        "full_apparatus_diagonal_Tij_missing_for_operating_budget",
        "full_apparatus_off_diagonal_Tij_missing_for_operating_budget",
        "full_apparatus_support_structure_stress_energy_missing_for_operating_budget",
        "full_apparatus_active_control_field_energy_missing_for_operating_budget",
        "full_apparatus_hull_region_missing_for_operating_budget",
      ]),
    );
    expect(budget.derivedOperatingBudget.scalarT00Only).toBe(true);
    expect(budget.derivedOperatingBudget.componentCoverageFraction).toBe(0.25);
    expect(budget.derivedOperatingBudget.termCoverageFraction).toBeCloseTo(1 / 9);
    expect(budget.derivedOperatingBudget.regionalCoverageFraction).toBeCloseTo(1 / 3);
    expect(budget.requiredCorrections.scalarT00OnlyDetected).toBe(true);
    expect(budget.requiredCorrections.missingAuthorityMetadataIds).toContain("noMetricTargetEcho");
    expect(budget.requiredCorrections.componentGroupMissingCount).toBe(3);
    expect(budget.requiredCorrections.missingComponentGroupIds).toEqual([
      "T0i",
      "diagonalTij",
      "offDiagonalTij",
    ]);
    expect(budget.requiredCorrections.stressEnergyTermMissingCount).toBe(8);
    expect(budget.requiredCorrections.missingStressEnergyTermIds).toContain(
      "activeControlFieldEnergy",
    );
    expect(budget.requiredCorrections.regionCoverageMissingCount).toBe(2);
    expect(budget.requiredCorrections.missingRegionIds).toEqual(["hull", "exteriorShell"]);
    expect(budget.requiredCorrections.componentCoverageFractionShortfall).toBe(0.75);
    expect(budget.requiredCorrections.termCoverageFractionShortfall).toBeCloseTo(8 / 9);
    expect(budget.requiredCorrections.regionalCoverageFractionShortfall).toBeCloseTo(2 / 3);
    expect(budget.summary.transportClaimAllowed).toBe(false);
  });

  it("aggregates operating budget readiness without opening physical claims", () => {
    const receipts = buildNhm2TileSourceMaterialEvidenceReceipts(passingEvidence);
    const forceGapLoadBudget = buildNhm2TileSourceForceGapLoadBudget({
      generatedAt,
      materialEvidenceReceipts: receipts,
      forceGapPullInEvidence: passingEvidence.forceGapPullIn,
    });
    const readiness = buildNhm2TileSourceOperatingBudgetReadiness({
      generatedAt,
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
        materialCouponEvidence: passingEvidence.materialCoupon,
      }),
      materialCouponOperatingBudgetRef: "artifact://material-coupon-budget",
      forceGapLoadBudget,
      forceGapLoadBudgetRef: "artifact://force-gap-load-budget",
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        forceGapLoadBudget,
        roughnessPatchEvidence: passingEvidence.roughnessPatch,
      }),
      roughnessPatchOperatingBudgetRef: "artifact://roughness-patch-budget",
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        forceGapLoadBudget,
        activeControlEvidence: passingEvidence.activeControl,
      }),
      activeControlOperatingBudgetRef: "artifact://active-control-budget",
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
        fatigueLayerScalingEvidence: passingEvidence.fatigueLayerScaling,
      }),
      fatigueLayerScalingOperatingBudgetRef: "artifact://fatigue-layer-budget",
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
        fullApparatusTensorEvidence: passingEvidence.fullApparatusTensor,
      }),
      fullApparatusTensorOperatingBudgetRef: "artifact://full-apparatus-budget",
    });

    expect(isNhm2TileSourceOperatingBudgetReadiness(readiness)).toBe(true);
    expect(readiness.summary.allOperatingBudgetsReady).toBe(true);
    expect(readiness.summary.firstBlocker).toBe("none");
    expect(readiness.summary.physicalViabilityClaimAllowed).toBe(false);
    expect(readiness.claimBoundary.budgetsDoNotSupplyExperimentalReceipts).toBe(true);
    expect(readiness.claimBoundary.budgetsDoNotSupplyFullTensorValues).toBe(true);
  });

  it("keeps missing operating budget evidence as a campaign blocker", () => {
    const readiness = buildNhm2TileSourceOperatingBudgetReadiness({
      generatedAt,
      materialCouponOperatingBudget: buildNhm2TileSourceMaterialCouponOperatingBudget({
        generatedAt,
      }),
      forceGapLoadBudget: buildNhm2TileSourceForceGapLoadBudget({ generatedAt }),
      roughnessPatchOperatingBudget: buildNhm2TileSourceRoughnessPatchOperatingBudget({
        generatedAt,
      }),
      activeControlOperatingBudget: buildNhm2TileSourceActiveControlOperatingBudget({
        generatedAt,
      }),
      fatigueLayerScalingOperatingBudget: buildNhm2TileSourceFatigueLayerScalingOperatingBudget({
        generatedAt,
      }),
      fullApparatusTensorOperatingBudget: buildNhm2TileSourceFullApparatusTensorOperatingBudget({
        generatedAt,
      }),
    });

    expect(readiness.summary.allOperatingBudgetsReady).toBe(false);
    expect(readiness.summary.firstBlocker).toBe(
      "material_coupon:material_coupon_receipt_missing_for_operating_budget",
    );
    expect(readiness.summary.blockerCount).toBeGreaterThan(0);
    expect(readiness.summary.physicalViabilityClaimAllowed).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        "full_apparatus_tensor:full_apparatus_tensor_receipt_missing_for_operating_budget",
      ]),
    );
  });
});
