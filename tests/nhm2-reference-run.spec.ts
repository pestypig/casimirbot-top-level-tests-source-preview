import { describe, expect, it } from "vitest";

import {
  buildNhm2ReferenceRunArtifact,
  isNhm2ReferenceRunArtifact,
  type Nhm2ReferenceRunArtifact,
} from "../shared/contracts/nhm2-reference-run.v1";
import { buildNhm2QeiDossierArtifact } from "../shared/contracts/nhm2-qei-dossier.v1";
import { buildNhm2QeiWorldlineDossier } from "../shared/contracts/nhm2-qei-worldline-dossier.v1";
import {
  buildNhm2RegionalSourceClosureEvidenceArtifact,
  type Nhm2RegionalSourceClosureEvidenceRegion,
  type Nhm2RegionalSourceClosureRegionId,
  type Nhm2RegionalTensor,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import {
  buildNhm2TileEffectiveCounterpartArtifact,
  type Nhm2TileEffectiveCounterpartRegion,
} from "../shared/contracts/nhm2-tile-effective-counterpart.v1";
import { validateNhm2ReferenceRun } from "../tools/nhm2/validate-reference-run";

const makeReferenceRun = (
  artifactSet: Nhm2ReferenceRunArtifact["artifactSet"] = [],
) =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-04-25T00:00:00.000Z",
    runId: "nhm2-reference-test",
    repo: {
      repositoryFullName: "local/casimirbot",
      branch: "main",
      commitSha: "abc123",
      dirtyTreeStatus: "dirty",
    },
    selectedFamily: {
      laneId: "nhm2_shift_lapse",
      selectedProfileId: "stage1_centerline_alpha_0p995_v1",
      expectedProfileId: "stage1_centerline_alpha_0p995_v1",
      profileMatch: true,
    },
    claimLock: {
      currentClaimTier: "diagnostic",
      maximumClaimTier: "reduced-order",
      validationMode: "red_team_hardening",
      validationClaimAllowed: false,
      latestAliasForbidden: true,
    },
    commands: [
      {
        id: "freeze",
        command: "npm run nhm2:freeze-reference-run",
        status: "not_run",
        startedAt: null,
        completedAt: null,
      },
    ],
    artifactSet,
    hashLock: {
      inputManifestSha256: null,
      toleranceManifestSha256: null,
      artifactSetSha256: null,
      literatureClaimMapSha256: null,
    },
    blockerSummary: {
      overallState: "review",
      blockingReasons: ["insufficient_provenance"],
      observerConsistencyStatus: "unknown",
      sourceClosureRegionalStatus: "unknown",
      qeiDossierStatus: "missing",
      reproducibilityStatus: "missing",
    },
  });

const validLiteratureMap = {
  schemaVersion: "nhm2_literature_claim_map/v1",
  claimPolicy: {
    externalTheoryDoesNotValidateNHM2: true,
    webOrPaperCitationRequiredForExternalTheoryClaims: true,
    noPredictiveLanguageFromExperimentalMathOnly: true,
  },
  sources: [
    {
      sourceId: "maldacena_1997_ads_cft",
      title: "The Large N Limit of Superconformal Field Theories and Supergravity",
      url: "https://arxiv.org/abs/hep-th/9711200",
      claimSupport: ["controlled_holographic_context"],
      nonSupport: ["does_not_validate_nhm2_source_mechanism"],
    },
  ],
};

const passFullLoop = {
  overallState: "pass",
  highestPassingClaimTier: "reduced-order",
  sections: {
    observer_audit: {
      state: "pass",
      artifactRefs: [{ artifactId: "nhm2_observer_audit", status: "pass" }],
    },
    uncertainty_perturbation_reproducibility: {
      meshConvergenceOrder: 2,
      boundaryConditionSensitivity: "bounded",
      smoothingKernelSensitivity: "bounded",
      independentReproductionStatus: "pass",
      artifactHashConsistencyStatus: "pass",
    },
    certificate_policy_result: {
      state: "pass",
    },
  },
};

const passObserver = {
  status: "pass",
  reasonCodes: [],
  shiftLapseProfileId: "stage1_centerline_alpha_0p995_v1",
  metric_required: {
    conditions: {
      wec: { status: "pass" },
      nec: { status: "pass" },
      dec: { status: "pass" },
      sec: { status: "pass" },
    },
  },
  tile_effective: {
    conditions: {
      wec: { status: "pass" },
      nec: { status: "pass" },
      dec: { status: "pass" },
      sec: { status: "pass" },
    },
  },
};

const passSourceClosure = {
  regionComparisons: {
    regions: [
      {
        regionId: "hull",
        comparisonBasisStatus: "same_basis",
        counterpartResolutionStatus: "resolved",
        metricExpectedCounterpartRole: "tile_effective_counterpart",
        tileTensorRef: "artifact://tile-effective-counterpart-hull",
        status: "pass",
        tileT00Diagnostics: {
          trace: {
            tensorRef: "tile_effective_counterpart.hull",
            pathFacts: { comparisonRole: "tile_effective_counterpart" },
          },
        },
      },
      {
        regionId: "wall",
        comparisonBasisStatus: "same_basis",
        counterpartResolutionStatus: "resolved",
        metricExpectedCounterpartRole: "tile_effective_counterpart",
        tileTensorRef: "artifact://tile-effective-counterpart-wall",
        status: "pass",
        tileT00Diagnostics: {
          trace: {
            tensorRef: "tile_effective_counterpart.wall",
            pathFacts: { comparisonRole: "tile_effective_counterpart" },
          },
        },
      },
      {
        regionId: "exterior_shell",
        comparisonBasisStatus: "same_basis",
        counterpartResolutionStatus: "resolved",
        metricExpectedCounterpartRole: "tile_effective_counterpart",
        tileTensorRef: "artifact://tile-effective-counterpart-exterior-shell",
        status: "pass",
        tileT00Diagnostics: {
          trace: {
            tensorRef: "tile_effective_counterpart.exterior_shell",
            pathFacts: { comparisonRole: "tile_effective_counterpart" },
          },
        },
      },
    ],
  },
  tensorSymmetry: "symmetric",
  tensors: {
    metricRequired: { T00: 1, T01: 0, T02: 0, T03: 0, T11: 1, T12: 0, T13: 0, T22: 1, T23: 0, T33: 1 },
    tileEffective: { T00: 1, T01: 0, T02: 0, T03: 0, T11: 1, T12: 0, T13: 0, T22: 1, T23: 0, T33: 1 },
  },
};

const fullTensor = (value: number): Nhm2RegionalTensor => ({
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

const evidenceRegion = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  overrides: Partial<Nhm2RegionalSourceClosureEvidenceRegion> = {},
): Nhm2RegionalSourceClosureEvidenceRegion => ({
  regionId,
  status: "pass",
  comparisonBasisStatus: "same_basis",
  metricRequired: {
    tensorRef: `metric.${regionId}`,
    tensorAuthorityMode: "full_tensor",
    tensor: fullTensor(10),
    chartRef: "comoving_cartesian",
    unitsRef: "J/m^3",
    aggregationMode: "mean",
    normalizationBasis: "sample_count",
    sampleCount: 10,
  },
  tileEffectiveCounterpart: {
    tensorRef: `nhm2_tile_effective_counterpart:${regionId}`,
    tensorAuthorityMode: "full_tensor",
    tensor: fullTensor(10),
    chartRef: "comoving_cartesian",
    unitsRef: "J/m^3",
    aggregationMode: "mean",
    normalizationBasis: "sample_count",
    sampleCount: 10,
    comparisonRole: "tile_effective_counterpart",
  },
  residuals: {
    componentResiduals: {
      T00: {
        metricRequired: -10,
        tileEffectiveCounterpart: -10,
        absResidual: 0,
        relResidual: 0,
      },
    },
    relLInf: 0,
    absLInf: 0,
    toleranceRelLInf: 0.1,
    pass: true,
  },
  blockers: [],
  ...overrides,
});

const passingRegionalEvidence = () =>
  buildNhm2RegionalSourceClosureEvidenceArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "nhm2-reference-test",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    expectedProfileId: "stage1_centerline_alpha_0p995_v1",
    laneId: "nhm2_shift_lapse",
    regions: [
      evidenceRegion("global"),
      evidenceRegion("hull"),
      evidenceRegion("wall"),
      evidenceRegion("exterior_shell"),
    ],
    literatureRefs: ["natario_2001_zero_expansion"],
  });

const tileCounterpartRegion = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  overrides: Partial<Nhm2TileEffectiveCounterpartRegion> = {},
): Nhm2TileEffectiveCounterpartRegion => ({
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
    producerModule: "tile-model.ts",
    producerFunction: "emitFullTensor",
    inputRefs: [`tile.input.${regionId}`],
    sourceModelId: "tile-model",
    sourceModelVersion: "v1",
    derivationMode: "tile_model_direct_full_tensor",
    notDerivedFromMetricRequiredTensor: true,
  },
  blockers: [],
  ...overrides,
});

const passingTileCounterpart = () =>
  buildNhm2TileEffectiveCounterpartArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "nhm2-reference-test",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    expectedProfileId: "stage1_centerline_alpha_0p995_v1",
    laneId: "nhm2_shift_lapse",
    sourceAuthorityMode: "cycle_averaged_tile_model",
    qeiDossierRef: "artifacts/research/full-solve/nhm2-qei-dossier.json",
    qeiApplicabilityStatus: "PASS",
    quantumStateAssumptions: ["bounded sampled reference state"],
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
    regions: [
      tileCounterpartRegion("global"),
      tileCounterpartRegion("hull"),
      tileCounterpartRegion("wall"),
      tileCounterpartRegion("exterior_shell"),
    ],
    literatureRefs: ["fewster_thompson_2023_stationary_worldline_qei"],
  });

const failingRegionalEvidence = () =>
  buildNhm2RegionalSourceClosureEvidenceArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "nhm2-reference-test",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    expectedProfileId: "stage1_centerline_alpha_0p995_v1",
    laneId: "nhm2_shift_lapse",
    regions: [
      evidenceRegion("global"),
      evidenceRegion("hull", {
        residuals: {
          componentResiduals: {
            T00: {
              metricRequired: -10,
              tileEffectiveCounterpart: -12,
              absResidual: 2,
              relResidual: 0.2,
            },
          },
          relLInf: 0.2,
          absLInf: 2,
          toleranceRelLInf: 0.1,
          pass: false,
        },
      }),
      evidenceRegion("wall"),
      evidenceRegion("exterior_shell"),
    ],
    literatureRefs: ["natario_2001_zero_expansion"],
  });

describe("nhm2 reference run contract", () => {
  it("rejects latest aliases in validation mode", () => {
    const artifact = makeReferenceRun([
      {
        artifactId: "nhm2_full_loop",
        path: "artifacts/research/full-solve/nhm2-full-loop-audit-latest.json",
        schemaVersion: "nhm2_full_loop_audit/v1",
        status: "review",
        sha256: "hash",
        generatedAt: "2026-04-25T00:00:00.000Z",
        usesLatestAlias: false,
        profileId: "stage1_centerline_alpha_0p995_v1",
        profileMatch: true,
      },
    ]);

    expect(artifact.artifactSet[0]?.usesLatestAlias).toBe(true);
    expect(isNhm2ReferenceRunArtifact(artifact)).toBe(false);
  });

  it("rejects profile mismatch as a hard blocker", () => {
    const artifact = makeReferenceRun([
      {
        artifactId: "nhm2_observer_audit",
        path: "artifacts/research/full-solve/nhm2-observer-audit-2026-04-21.json",
        schemaVersion: "nhm2_observer_audit/v1",
        status: "fail",
        sha256: "hash",
        generatedAt: "2026-04-21T00:00:00.000Z",
        usesLatestAlias: false,
        profileId: "stage1_centerline_alpha_0p7000_v1",
        profileMatch: true,
      },
    ]);

    expect(artifact.artifactSet[0]?.profileMatch).toBe(false);
    expect(isNhm2ReferenceRunArtifact(artifact)).toBe(false);
  });

  it("keeps validationClaimAllowed false even when all local gates pass", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: passingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: buildNhm2QeiDossierArtifact({
        runId: "nhm2-reference-test",
        profileId: "stage1_centerline_alpha_0p995_v1",
        status: "pass",
        rhoSource: "metric_required",
        qeiApplicabilityStatus: "PASS",
        quantumStateAssumptions: ["bounded sampled reference state"],
        renormalizationConvention: "declared",
        cavityBoundaryModel: "declared",
        samplingWorldlines: [
          {
            id: "worldline-wall-1",
            regionId: "wall",
            properTimeWindow_s: 1,
            qeiMargin: 0.1,
            status: "pass",
          },
        ],
        worstWorldlineId: "worldline-wall-1",
        dutyCyclePass: true,
        lightCrossingConsistencyStatus: "pass",
        cycleAverageClosureStatus: "pass",
        literatureRefs: ["https://arxiv.org/abs/1807.04726"],
      }),
    });

    expect(validation.validationClaimAllowed).toBe(false);
    expect(validation.overallState).toBe("pass");
  });

  it("missing QEI dossier blocks physical-mechanism language", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: passingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: null,
    });

    const qeiGate = validation.gates.find(
      (entry) => entry.gateId === "GATE_QEI_DOSSIER_PRESENT",
    );
    expect(qeiGate?.state).toBe("review");
    expect(qeiGate?.reasonCodes).toContain("qei_dossier_missing");
  });

  it("accepts a complete QEI worldline dossier for the reference QEI gate", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: passingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: buildNhm2QeiWorldlineDossier({
        generatedAt: "2026-06-12T00:00:00.000Z",
        laneId: "nhm2_shift_lapse",
        selectedProfileId: "stage1_centerline_alpha_0p995_v1",
        worldlines: [
          {
            worldlineId: "qei:wall:atlas",
            regionId: "wall",
            chartId: "comoving_cartesian",
            samplingFunction: {
              kind: "gaussian",
              tauSeconds: 1e-6,
              normalized: true,
            },
            sampledRho: {
              valueSI: -1,
              provenanceRef: "source:wall:T00",
              status: "computed",
            },
            bound: {
              valueSI: 0,
              provenanceRef: "qei-bound-receipt.json",
              status: "computed",
            },
            margin: {
              valueSI: 1,
              pass: true,
            },
            consistency: {
              tauVsDuty: "pass",
              tauVsLightCrossing: "pass",
              tauVsModulation: "pass",
            },
            blockers: [],
          },
        ],
      }),
    });

    const qeiGate = validation.gates.find(
      (entry) => entry.gateId === "GATE_QEI_DOSSIER_PRESENT",
    );
    expect(qeiGate?.state).toBe("pass");
    expect(qeiGate?.reasonCodes).toEqual([]);
  });

  it("QEI-shaped paperwork still blocks promotion when required evidence is incomplete", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: passingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: buildNhm2QeiDossierArtifact({
        runId: "nhm2-reference-test",
        profileId: "stage1_centerline_alpha_0p995_v1",
        status: "review",
        rhoSource: "metric_required",
        qeiApplicabilityStatus: "REVIEW",
        quantumStateAssumptions: [],
        renormalizationConvention: null,
        cavityBoundaryModel: null,
        samplingWorldlines: [
          {
            id: "worldline-wall-1",
            regionId: "wall",
            properTimeWindow_s: null,
            qeiMargin: null,
            status: "review",
          },
        ],
        worstWorldlineId: "missing-worldline",
        dutyCyclePass: null,
        lightCrossingConsistencyStatus: "review",
        cycleAverageClosureStatus: "review",
        literatureRefs: [],
      }),
    });

    const qeiGate = validation.gates.find(
      (entry) => entry.gateId === "GATE_QEI_DOSSIER_PRESENT",
    );
    expect(qeiGate?.state).toBe("review");
    expect(qeiGate?.reasonCodes).toContain("qei_quantum_state_assumptions_missing");
    expect(qeiGate?.reasonCodes).toContain("qei_worst_worldline_unresolved");
    expect(qeiGate?.reasonCodes).toContain("qei_duty_cycle_not_pass");
  });

  it("certificate policy green cannot override full-loop review", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: {
        ...passFullLoop,
        overallState: "review",
        highestPassingClaimTier: null,
      },
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: passingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: null,
    });

    const gate = validation.gates.find(
      (entry) => entry.gateId === "GATE_CERTIFICATE_DOES_NOT_OVERRIDE_REVIEW",
    );
    expect(gate?.state).toBe("fail");
    expect(gate?.reasonCodes).toContain("certificate_policy_green_overrode_non_pass_full_loop");
  });

  it("classifies unavailable adapter verification as infrastructure, not physics impact", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: passingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: buildNhm2QeiDossierArtifact({
        runId: "nhm2-reference-test",
        profileId: "stage1_centerline_alpha_0p995_v1",
        status: "pass",
        rhoSource: "metric_required",
        qeiApplicabilityStatus: "PASS",
        quantumStateAssumptions: ["bounded sampled reference state"],
        renormalizationConvention: "declared",
        cavityBoundaryModel: "declared",
        samplingWorldlines: [
          {
            id: "worldline-wall-1",
            regionId: "wall",
            properTimeWindow_s: 1,
            qeiMargin: 0.1,
            status: "pass",
          },
        ],
        worstWorldlineId: "worldline-wall-1",
        dutyCyclePass: true,
        lightCrossingConsistencyStatus: "pass",
        cycleAverageClosureStatus: "pass",
        literatureRefs: ["https://arxiv.org/abs/1807.04726"],
      }),
      adapterVerificationStatus: "blocked_infra_endpoint_unavailable",
    });

    expect(validation.adapterVerificationStatus).toBe("blocked_infra_endpoint_unavailable");
    expect(validation.adapterVerificationPhysicsImpact).toBe("none_claimed");
  });

  it("missing regional evidence artifact gives review reason", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      literatureClaimMap: validLiteratureMap,
      qeiDossier: buildNhm2QeiDossierArtifact({
        runId: "nhm2-reference-test",
        profileId: "stage1_centerline_alpha_0p995_v1",
        status: "pass",
        rhoSource: "metric_required",
        qeiApplicabilityStatus: "PASS",
        quantumStateAssumptions: ["bounded sampled reference state"],
        renormalizationConvention: "declared",
        cavityBoundaryModel: "declared",
        samplingWorldlines: [
          {
            id: "worldline-wall-1",
            regionId: "wall",
            properTimeWindow_s: 1,
            qeiMargin: 0.1,
            status: "pass",
          },
        ],
        worstWorldlineId: "worldline-wall-1",
        dutyCyclePass: true,
        lightCrossingConsistencyStatus: "pass",
        cycleAverageClosureStatus: "pass",
        literatureRefs: ["https://arxiv.org/abs/1807.04726"],
      }),
    });

    const gate = validation.gates.find(
      (entry) => entry.gateId === "GATE_REGIONAL_SOURCE_CLOSURE_EVIDENCE_ARTIFACT",
    );
    expect(gate?.state).toBe("review");
    expect(gate?.reasonCodes).toContain(
      "regional_source_closure_evidence_artifact_missing",
    );
  });

  it("present failing regional evidence blocks promotion", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: failingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: null,
    });

    const gate = validation.gates.find(
      (entry) => entry.gateId === "GATE_REGIONAL_SOURCE_CLOSURE_EVIDENCE_ARTIFACT",
    );
    expect(gate?.state).toBe("fail");
    expect(gate?.reasonCodes).toContain("regional_evidence_overall_not_pass:fail");
    expect(validation.claimTierAllowed).toBeNull();
  });

  it("present passing regional evidence can retire only the source evidence gate", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: passingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: null,
    });

    const sourceGate = validation.gates.find(
      (entry) => entry.gateId === "GATE_REGIONAL_SOURCE_CLOSURE_EVIDENCE_ARTIFACT",
    );
    const qeiGate = validation.gates.find(
      (entry) => entry.gateId === "GATE_QEI_DOSSIER_PRESENT",
    );
    expect(sourceGate?.state).toBe("pass");
    expect(qeiGate?.state).toBe("review");
    expect(validation.overallState).toBe("review");
  });

  it("certificate green still cannot override source evidence fail", () => {
    const validation = validateNhm2ReferenceRun({
      referenceRun: makeReferenceRun(),
      fullLoopAudit: passFullLoop,
      observerAudit: passObserver,
      sourceClosure: passSourceClosure,
      regionalSourceClosureEvidence: failingRegionalEvidence(),
      tileEffectiveCounterpart: passingTileCounterpart(),
      literatureClaimMap: validLiteratureMap,
      qeiDossier: buildNhm2QeiDossierArtifact({
        runId: "nhm2-reference-test",
        profileId: "stage1_centerline_alpha_0p995_v1",
        status: "pass",
        rhoSource: "metric_required",
        qeiApplicabilityStatus: "PASS",
        quantumStateAssumptions: ["bounded sampled reference state"],
        renormalizationConvention: "declared",
        cavityBoundaryModel: "declared",
        samplingWorldlines: [
          {
            id: "worldline-wall-1",
            regionId: "wall",
            properTimeWindow_s: 1,
            qeiMargin: 0.1,
            status: "pass",
          },
        ],
        worstWorldlineId: "worldline-wall-1",
        dutyCyclePass: true,
        lightCrossingConsistencyStatus: "pass",
        cycleAverageClosureStatus: "pass",
        literatureRefs: ["https://arxiv.org/abs/1807.04726"],
      }),
    });

    expect(validation.overallState).toBe("fail");
    expect(validation.claimTierAllowed).toBeNull();
  });
});
