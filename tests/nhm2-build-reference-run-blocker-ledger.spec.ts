import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildNhm2QeiDossierArtifact } from "../shared/contracts/nhm2-qei-dossier.v1";
import { buildNhm2QeiWorldlineDossier } from "../shared/contracts/nhm2-qei-worldline-dossier.v1";
import { buildNhm2CoupledClosurePassCandidate } from "../shared/contracts/nhm2-coupled-closure-pass-candidate.v1";
import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import {
  buildNhm2RegionalSourceClosureEvidenceArtifact,
  type Nhm2RegionalSourceClosureEvidenceRegion,
  type Nhm2RegionalSourceClosureRegionId,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import {
  buildNhm2TileEffectiveCounterpartArtifact,
  type Nhm2TileEffectiveCounterpartRegion,
} from "../shared/contracts/nhm2-tile-effective-counterpart.v1";
import { buildNhm2SourceSideSameBasisTensorAuthorityArtifact } from "../shared/contracts/nhm2-source-side-same-basis-tensor-authority.v1";
import { buildReferenceRunBlockerLedger } from "../tools/nhm2/build-reference-run-blocker-ledger";
import { renderReferenceRunBlockerLedger } from "../tools/nhm2/render-reference-run-blocker-ledger";
import { assessNhm2SourceClosurePassReadiness } from "../tools/nhm2/source-closure-pass-readiness";
import type { Nhm2ReferenceRunValidationArtifact } from "../tools/nhm2/validate-reference-run";

const profile = "stage1_centerline_alpha_0p995_v1";

const tensor = (value: number) => ({
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

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    runId: "ledger-run",
    repo: { repositoryFullName: "local/casimirbot", branch: "main", commitSha: "abc", dirtyTreeStatus: "dirty" },
    selectedFamily: { laneId: "nhm2_shift_lapse", selectedProfileId: profile, expectedProfileId: profile, profileMatch: true },
    claimLock: { currentClaimTier: "diagnostic", maximumClaimTier: "reduced-order", validationMode: "red_team_hardening", validationClaimAllowed: false, latestAliasForbidden: true },
    commands: [],
    artifactSet: [],
    hashLock: { inputManifestSha256: null, toleranceManifestSha256: null, artifactSetSha256: null, literatureClaimMapSha256: null },
    blockerSummary: { overallState: "review", blockingReasons: [], observerConsistencyStatus: "unknown", sourceClosureRegionalStatus: "unknown", qeiDossierStatus: "missing", reproducibilityStatus: "missing" },
  });

const validation = (state: "pass" | "review" | "fail" = "review"): Nhm2ReferenceRunValidationArtifact => ({
  artifactId: "nhm2_reference_run_validation",
  schemaVersion: "nhm2_reference_run_validation/v1",
  runId: "ledger-run",
  overallState: state,
  gates: [
    {
      gateId: "GATE_TILE_COUNTERPART_FULL_TENSOR_AUTHORITY",
      state,
      reasonCodes: state === "pass" ? [] : ["hull_full_tensor_authority_missing"],
    },
    {
      gateId: "GATE_QEI_DOSSIER_PRESENT",
      state: "review",
      reasonCodes: ["qei_dossier_missing"],
    },
  ],
  claimTierAllowed: state === "pass" ? "reduced-order" : null,
  validationClaimAllowed: false,
  adapterVerificationStatus: "blocked_infra_endpoint_unavailable",
  adapterVerificationPhysicsImpact: "none_claimed",
});

const fullLoopAudit = () => ({
  artifactId: "nhm2_full_loop_audit",
  overallState: "review",
  sections: {
    certificate_policy_result: { state: "GREEN", integrityOk: true },
    uncertainty_perturbation_reproducibility: {
      meshConvergenceOrder: null,
      boundaryConditionSensitivity: null,
      smoothingKernelSensitivity: null,
      independentReproductionStatus: null,
      artifactHashConsistencyStatus: "mismatch",
    },
  },
});

const tileRegion = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  overrides: Partial<Nhm2TileEffectiveCounterpartRegion> = {},
): Nhm2TileEffectiveCounterpartRegion => ({
  regionId,
  status: "pass",
  comparisonRole: "tile_effective_counterpart",
  tensorAuthorityMode: "full_tensor",
  tensor: tensor(10),
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `mask.${regionId}`,
  aggregationMode: "mean",
  normalizationBasis: "sample_count",
  sampleCount: 10,
  provenance: {
    producerModule: "tile.ts",
    producerFunction: "emit",
    inputRefs: [`tile.${regionId}`],
    sourceModelId: "tile",
    sourceModelVersion: "v1",
    derivationMode: "tile_model_direct_full_tensor",
    notDerivedFromMetricRequiredTensor: true,
  },
  blockers: [],
  ...overrides,
});

const tileCounterpart = () =>
  buildNhm2TileEffectiveCounterpartArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    runId: "ledger-run",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceAuthorityMode: "cycle_averaged_tile_model",
    qeiDossierRef: "qei.json",
    qeiApplicabilityStatus: "PASS",
    quantumStateAssumptions: ["declared"],
    renormalizationConvention: "declared",
    cavityBoundaryModel: "declared",
    cycleAverageClosureStatus: "pass",
    dutyCycleStatus: "pass",
    lightCrossingConsistencyStatus: "pass",
    conservationDiagnostics: { divTStatus: "pass", divTResidualLInf: 0, continuityResidualLInf: 0, momentumResidualLInf: 0 },
    regions: [tileRegion("global"), tileRegion("hull"), tileRegion("wall"), tileRegion("exterior_shell")],
    literatureRefs: ["fewster_thompson_2023_stationary_worldline_qei"],
  });

const evidenceRegion = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  relLInf = 0,
): Nhm2RegionalSourceClosureEvidenceRegion => ({
  regionId,
  status: relLInf > 0.1 ? "fail" : "pass",
  comparisonBasisStatus: "same_basis",
  metricRequired: {
    tensorRef: `metric.${regionId}`,
    tensorAuthorityMode: "full_tensor",
    tensor: tensor(10),
    chartRef: "comoving_cartesian",
    unitsRef: "J/m^3",
    aggregationMode: "mean",
    normalizationBasis: "sample_count",
    sampleCount: 10,
  },
  tileEffectiveCounterpart: {
    tensorRef: `nhm2_tile_effective_counterpart:${regionId}`,
    tensorAuthorityMode: "full_tensor",
    tensor: tensor(relLInf > 0.1 ? 12 : 10),
    chartRef: "comoving_cartesian",
    unitsRef: "J/m^3",
    aggregationMode: "mean",
    normalizationBasis: "sample_count",
    sampleCount: 10,
    comparisonRole: "tile_effective_counterpart",
  },
  residuals: {
    componentResiduals: {
      T00: { metricRequired: -10, tileEffectiveCounterpart: relLInf > 0.1 ? -12 : -10, absResidual: relLInf > 0.1 ? 2 : 0, relResidual: relLInf },
    },
    relLInf,
    absLInf: relLInf > 0.1 ? 2 : 0,
    toleranceRelLInf: 0.1,
    pass: relLInf <= 0.1,
  },
  blockers: [],
});

const regionalEvidence = () =>
  buildNhm2RegionalSourceClosureEvidenceArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    runId: "ledger-run",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    regions: [
      evidenceRegion("global"),
      evidenceRegion("hull", 0.2),
      evidenceRegion("wall"),
      evidenceRegion("exterior_shell"),
    ],
    literatureRefs: ["natario_2001_zero_expansion"],
  });

const sourceAuthority = () =>
  buildNhm2SourceSideSameBasisTensorAuthorityArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    chartId: "comoving_cartesian",
    sourceModelId: "cycle_averaged_tile_model",
    counterpartArtifactRef: "tile.json",
    counterpartArtifact: tileCounterpart(),
  });

const passReadiness = () =>
  assessNhm2SourceClosurePassReadiness({
    generatedAt: "2026-05-05T00:00:00.000Z",
    regionalEvidenceRef: "regional.json",
    regionalEvidence: regionalEvidence(),
    sourceAuthorityRef: "source-authority.json",
    sourceAuthority: sourceAuthority(),
  });

const coupledClosurePassCandidate = () =>
  buildNhm2CoupledClosurePassCandidate({
    artifactRefs: {
      sourceSideSameBasisTensorAuthority: "source-authority.json",
      regionalSourceClosureEvidence: "regional.json",
      sourceClosurePassReadiness: "readiness.json",
    },
    sourceAuthority: sourceAuthority(),
    sourceClosurePassReadiness: passReadiness(),
    regionalEvidence: regionalEvidence(),
  });

const coupledClosurePassCandidateWithCorrections = () => {
  const artifact = coupledClosurePassCandidate();
  const firstNonPass = artifact.gates.find((gate) => gate.status !== "pass");
  if (firstNonPass != null) {
    firstNonPass.requiredCorrections = {
      effectiveSourceTensorLayerCountShortfall: 42,
    };
    artifact.summary.firstRequiredCorrections = {
      effectiveSourceTensorLayerCountShortfall: 42,
    };
  }
  return artifact;
};

const qei = () =>
  buildNhm2QeiDossierArtifact({
    runId: "ledger-run",
    profileId: profile,
    status: "pass",
    rhoSource: "tile_effective",
    qeiApplicabilityStatus: "PASS",
    quantumStateAssumptions: ["declared"],
    renormalizationConvention: "declared",
    cavityBoundaryModel: "declared",
    samplingWorldlines: [{ id: "w1", regionId: "wall", properTimeWindow_s: 1, qeiMargin: 0.1, status: "pass" }],
    worstWorldlineId: "w1",
    dutyCyclePass: true,
    lightCrossingConsistencyStatus: "pass",
    cycleAverageClosureStatus: "pass",
    literatureRefs: ["https://arxiv.org/abs/2301.01698"],
  });

const qeiWorldline = () =>
  buildNhm2QeiWorldlineDossier({
    generatedAt: "2026-06-12T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    atlasRef: "atlas.json",
    atlasHash: "atlas-hash",
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
  });

const incompleteQeiWorldline = () =>
  buildNhm2QeiWorldlineDossier({
    generatedAt: "2026-06-12T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    atlasRef: "atlas.json",
    atlasHash: "atlas-hash",
    worldlines: [
      {
        worldlineId: "qei:wall:atlas",
        regionId: "wall",
        chartId: "comoving_cartesian",
        samplingFunction: {
          kind: "gaussian",
          tauSeconds: null,
          normalized: false,
        },
        sampledRho: {
          valueSI: -1,
          provenanceRef: "source:wall:T00",
          status: "computed",
        },
        bound: {
          valueSI: null,
          status: "missing",
        },
        margin: {
          valueSI: null,
          pass: null,
        },
        consistency: {
          tauVsDuty: "missing",
          tauVsLightCrossing: "missing",
          tauVsModulation: "missing",
        },
        blockers: ["qei_bound_missing", "qei_bound_provenance_missing"],
      },
    ],
  });

const literatureMap = () => ({
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
      claimSupport: ["controlled_holographic_duality_context"],
      nonSupport: ["does_not_validate_nhm2_source_closure"],
    },
  ],
});

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-ledger-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    writeFileSync(join(root, "full-loop.json"), JSON.stringify(fullLoopAudit()), "utf8");
    writeFileSync(join(root, "validation.json"), JSON.stringify(validation()), "utf8");
    writeFileSync(join(root, "tile.json"), JSON.stringify(tileCounterpart()), "utf8");
    writeFileSync(join(root, "regional.json"), JSON.stringify(regionalEvidence()), "utf8");
    writeFileSync(join(root, "source-authority.json"), JSON.stringify(sourceAuthority()), "utf8");
    writeFileSync(join(root, "readiness.json"), JSON.stringify(passReadiness()), "utf8");
    writeFileSync(
      join(root, "coupled.json"),
      JSON.stringify(coupledClosurePassCandidateWithCorrections()),
      "utf8",
    );
    writeFileSync(join(root, "qei.json"), JSON.stringify(qei()), "utf8");
    writeFileSync(join(root, "qei-worldline.json"), JSON.stringify(qeiWorldline()), "utf8");
    writeFileSync(
      join(root, "qei-worldline-incomplete.json"),
      JSON.stringify(incompleteQeiWorldline()),
      "utf8",
    );
    writeFileSync(join(root, "literature.json"), JSON.stringify(literatureMap()), "utf8");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("build reference-run blocker ledger", () => {
  it("produces a blocker ledger from valid fixture artifacts", () =>
    withTemp((root) => {
      const ledger = buildReferenceRunBlockerLedger({
        repoRoot: root,
        referenceRunPath: "reference.json",
        fullLoopAuditPath: "full-loop.json",
        validationPath: "validation.json",
        tileEffectiveCounterpartPath: "tile.json",
        regionalSourceClosureEvidencePath: "regional.json",
        sourceSideAuthorityPath: "source-authority.json",
        sourceClosurePassReadinessPath: "readiness.json",
        qeiDossierPath: "qei.json",
        literatureMapPath: "literature.json",
        outPath: "ledger.json",
      });
      expect(ledger.artifactId).toBe("nhm2_blocker_ledger");
      expect(ledger.claimLock.validationClaimAllowed).toBe(false);
      expect(ledger.tileCounterpartSource.sourceSideAuthorityStatus).toBe("authoritative_same_basis");
      expect(ledger.tileCounterpartSource.sourceClosurePassSignalAllowed).toBe(false);
    }));

  it("fails closed on missing reference run", () =>
    withTemp((root) => {
      expect(() =>
        buildReferenceRunBlockerLedger({
          repoRoot: root,
          referenceRunPath: "missing.json",
          fullLoopAuditPath: "full-loop.json",
          validationPath: "validation.json",
          tileEffectiveCounterpartPath: "tile.json",
          regionalSourceClosureEvidencePath: "regional.json",
          sourceSideAuthorityPath: "source-authority.json",
          sourceClosurePassReadinessPath: "readiness.json",
          literatureMapPath: "literature.json",
          outPath: "ledger.json",
        }),
      ).toThrow(/required ledger input missing/);
    }));

  it("fails closed on invalid tile counterpart", () =>
    withTemp((root) => {
      writeFileSync(join(root, "tile.json"), JSON.stringify({ invalid: true }), "utf8");
      expect(() =>
        buildReferenceRunBlockerLedger({
          repoRoot: root,
          referenceRunPath: "reference.json",
          fullLoopAuditPath: "full-loop.json",
          validationPath: "validation.json",
          tileEffectiveCounterpartPath: "tile.json",
          regionalSourceClosureEvidencePath: "regional.json",
          sourceSideAuthorityPath: "source-authority.json",
          sourceClosurePassReadinessPath: "readiness.json",
          literatureMapPath: "literature.json",
          outPath: "ledger.json",
        }),
      ).toThrow(/tile-effective counterpart/);
    }));

  it("classifies GREEN certificate as non-promotional when validation gates are not pass", () =>
    withTemp((root) => {
      const ledger = buildReferenceRunBlockerLedger({
        repoRoot: root,
        referenceRunPath: "reference.json",
        fullLoopAuditPath: "full-loop.json",
        validationPath: "validation.json",
        tileEffectiveCounterpartPath: "tile.json",
        regionalSourceClosureEvidencePath: "regional.json",
        sourceSideAuthorityPath: "source-authority.json",
        sourceClosurePassReadinessPath: "readiness.json",
        qeiDossierPath: "qei.json",
        literatureMapPath: "literature.json",
        outPath: "ledger.json",
      });
      expect(ledger.certificatePolicy.greenButNonPromotional).toBe(true);
      expect(ledger.certificatePolicy.reason).toMatch(/non-promotional/);
    }));

  it("extracts regional first divergence boundaries correctly", () =>
    withTemp((root) => {
      const ledger = buildReferenceRunBlockerLedger({
        repoRoot: root,
        referenceRunPath: "reference.json",
        fullLoopAuditPath: "full-loop.json",
        validationPath: "validation.json",
        tileEffectiveCounterpartPath: "tile.json",
        regionalSourceClosureEvidencePath: "regional.json",
        sourceSideAuthorityPath: "source-authority.json",
        sourceClosurePassReadinessPath: "readiness.json",
        qeiDossierPath: "qei.json",
        literatureMapPath: "literature.json",
        outPath: "ledger.json",
      });
      expect(ledger.regionalBlockers.find((region) => region.regionId === "hull")?.firstDivergenceBoundary).toBe("residual_exceeded");
    }));

  it("preserves adapterVerificationPhysicsImpact as none_claimed", () =>
    withTemp((root) => {
      const ledger = buildReferenceRunBlockerLedger({
        repoRoot: root,
        referenceRunPath: "reference.json",
        fullLoopAuditPath: "full-loop.json",
        validationPath: "validation.json",
        tileEffectiveCounterpartPath: "tile.json",
        regionalSourceClosureEvidencePath: "regional.json",
        sourceSideAuthorityPath: "source-authority.json",
        sourceClosurePassReadinessPath: "readiness.json",
        qeiDossierPath: "qei.json",
        literatureMapPath: "literature.json",
        outPath: "ledger.json",
      });
      expect(ledger.adapterVerification.physicsImpact).toBe("none_claimed");
    }));

  it("records coupled closure pass-candidate blockers without promoting the ledger", () =>
    withTemp((root) => {
      const ledger = buildReferenceRunBlockerLedger({
        repoRoot: root,
        referenceRunPath: "reference.json",
        fullLoopAuditPath: "full-loop.json",
        validationPath: "validation.json",
        tileEffectiveCounterpartPath: "tile.json",
        regionalSourceClosureEvidencePath: "regional.json",
        sourceSideAuthorityPath: "source-authority.json",
        sourceClosurePassReadinessPath: "readiness.json",
        coupledClosurePassCandidatePath: "coupled.json",
        qeiDossierPath: "qei.json",
        literatureMapPath: "literature.json",
        outPath: "ledger.json",
      });

      expect(ledger.artifactRefs.coupledClosurePassCandidate).toBe("coupled.json");
      expect(ledger.tileCounterpartSource.coupledClosurePassCandidate).toBe(false);
      expect(ledger.tileCounterpartSource.coupledClosureFirstBlocker).not.toBe("none");
      expect(
        ledger.tileCounterpartSource.coupledClosureFirstRequiredCorrections
          .effectiveSourceTensorLayerCountShortfall,
      ).toBe(42);
      expect(
        ledger.tileCounterpartSource.coupledClosureRequiredCorrections[
          "regional_support_function_atlas.effectiveSourceTensorLayerCountShortfall"
        ],
      ).toBe(42);
      expect(renderReferenceRunBlockerLedger(ledger)).toMatch(
        /effectiveSourceTensorLayerCountShortfall=42/,
      );
      expect(
        ledger.gateSummary.find(
          (gate) => gate.gateId === "GATE_COUPLED_CLOSURE_PASS_CANDIDATE",
        )?.state,
      ).not.toBe("pass");
      expect(ledger.claimLock.physicalMechanismClaimAllowed).toBe(false);
    }));

  it("accepts a QEI worldline dossier as canonical ledger evidence", () =>
    withTemp((root) => {
      const ledger = buildReferenceRunBlockerLedger({
        repoRoot: root,
        referenceRunPath: "reference.json",
        fullLoopAuditPath: "full-loop.json",
        validationPath: "validation.json",
        tileEffectiveCounterpartPath: "tile.json",
        regionalSourceClosureEvidencePath: "regional.json",
        sourceSideAuthorityPath: "source-authority.json",
        sourceClosurePassReadinessPath: "readiness.json",
        qeiWorldlineDossierPath: "qei-worldline.json",
        literatureMapPath: "literature.json",
        outPath: "ledger.json",
      });

      expect(ledger.artifactRefs.qeiDossier).toBe("qei-worldline.json");
      expect(ledger.qeiBlockers.status).toBe("pass");
      expect(ledger.qeiBlockers.qeiApplicabilityStatus).toBe("PASS");
      expect(ledger.qeiBlockers.missingFields).toEqual([]);
    }));

  it("reports concrete QEI worldline blockers instead of legacy missing paperwork", () =>
    withTemp((root) => {
      const ledger = buildReferenceRunBlockerLedger({
        repoRoot: root,
        referenceRunPath: "reference.json",
        fullLoopAuditPath: "full-loop.json",
        validationPath: "validation.json",
        tileEffectiveCounterpartPath: "tile.json",
        regionalSourceClosureEvidencePath: "regional.json",
        sourceSideAuthorityPath: "source-authority.json",
        sourceClosurePassReadinessPath: "readiness.json",
        qeiWorldlineDossierPath: "qei-worldline-incomplete.json",
        literatureMapPath: "literature.json",
        outPath: "ledger.json",
      });

      expect(ledger.qeiBlockers.status).toBe("review");
      expect(ledger.qeiBlockers.qeiApplicabilityStatus).toBe("REVIEW");
      expect(ledger.qeiBlockers.missingFields).not.toContain("qei_dossier_missing");
      expect(ledger.qeiBlockers.missingFields).toContain("dossierComplete");
      expect(ledger.qeiBlockers.missingFields).toContain(
        "qei:wall:atlas.bound.missing",
      );
      expect(ledger.qeiBlockers.missingFields).toContain(
        "qei:wall:atlas.samplingFunction.tauSeconds",
      );
      expect(ledger.qeiBlockers.missingFields).toContain(
        "qei:wall:atlas:qei_bound_provenance_missing",
      );
    }));
});
