import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildNhm2FullLoopAuditContract,
  type Nhm2FullLoopAuditSectionsInput,
} from "../shared/contracts/nhm2-full-loop-audit.v1";
import type { WarpNhm2FullLoopPolicyLayer, ViabilityResult } from "../types/warpViability";

const runtime = vi.hoisted(() => ({
  viability: null as ViabilityResult | null,
}));

vi.mock("../tools/warpViability", () => ({
  evaluateWarpViability: vi.fn(async () => {
    if (!runtime.viability) {
      throw new Error("missing viability fixture");
    }
    return runtime.viability;
  }),
}));

vi.mock("../tools/liveSnapshot", () => ({
  pullSettledSnapshot: vi.fn(async () => null),
}));

vi.mock("../server/services/observability/otel-tracing.js", () => ({
  withSpan: async (_name: string, _opts: unknown, fn: (span: any) => Promise<unknown>) =>
    fn({
      addAttributes: vi.fn(),
      status: undefined,
    }),
}));

import { issueWarpViabilityCertificate } from "../tools/warpViabilityCertificate";

const makeArtifactRef = (artifactId: string, path: string) => ({
  artifactId,
  path,
  contractVersion: null,
  status: null,
});

const makeNhm2PolicyLayer = (): WarpNhm2FullLoopPolicyLayer => {
  const sections: Nhm2FullLoopAuditSectionsInput = {
    family_semantics: {
      sectionId: "family_semantics",
      state: "pass",
      reasons: [],
      artifactRefs: [makeArtifactRef("nhm2_closed_loop_doc", "docs/nhm2-closed-loop.md")],
      familyId: "nhm2_shift_lapse",
      baseFamily: "natario_zero_expansion",
      lapseExtension: true,
      selectedProfileId: "stage1_centerline_alpha_0p9625_v1",
      semanticBoundaries: [
        "Natario-style zero-expansion base family",
        "NHM2 lapse extension remains a separate audit overlay",
      ],
      nonClaims: ["does not redefine generic warp viability certificate semantics"],
    },
    claim_tier: {
      sectionId: "claim_tier",
      state: "review",
      reasons: ["insufficient_provenance"],
      artifactRefs: [makeArtifactRef("math_status", "MATH_STATUS.md")],
      currentTier: "diagnostic",
      maximumClaimTier: "reduced-order",
      viabilityStatus: "ADMISSIBLE",
      promotionReason: "insufficient_provenance",
      surfaceStages: [
        { module: "tools/warpViability.ts", stage: "diagnostic" },
        { module: "tools/warpViabilityCertificate.ts", stage: "certified" },
      ],
    },
    lapse_provenance: {
      sectionId: "lapse_provenance",
      state: "pass",
      reasons: [],
      artifactRefs: [makeArtifactRef("metric_adapter", "modules/warp/warp-metric-adapter.ts")],
      metricFamily: "nhm2_shift_lapse",
      shiftLapseProfileId: "stage1_centerline_alpha_0p9625_v1",
      shiftLapseProfileStage: "stage1",
      familyAuthorityStatus: "candidate_authoritative_solve_family",
      transportCertificationStatus: "bounded_transport_proof_bearing_gate_admitted",
      metricT00ContractStatus: "ok",
      chartContractStatus: "ok",
    },
    strict_signal_readiness: {
      sectionId: "strict_signal_readiness",
      state: "pass",
      reasons: [],
      artifactRefs: [makeArtifactRef("strict_signal", "runtime://pipeline/nhm2StrictSignalReadiness")],
      strictModeEnabled: true,
      thetaMetricDerived: true,
      tsMetricDerived: true,
      qiMetricDerived: true,
      qiApplicabilityStatus: "PASS",
      missingSignals: [],
    },
    source_closure: {
      sectionId: "source_closure",
      state: "pass",
      reasons: [],
      artifactRefs: [makeArtifactRef("source_closure", "runtime://pipeline/nhm2SourceClosure")],
      metricTensorRef: "warp.metricStressEnergy",
      tileEffectiveTensorRef: "warp.tileEffectiveStressEnergy",
      residualRms: 0.01,
      residualMax: 0.02,
      residualByRegion: { hull: 0.01, wall: 0.02, exteriorShell: 0.01 },
      toleranceRef: "nhm2_source_closure_rel_linf<=0.1",
      assumptionsDrifted: false,
    },
    observer_audit: {
      sectionId: "observer_audit",
      state: "pass",
      reasons: [],
      artifactRefs: [makeArtifactRef("observer_audit", "runtime://pipeline/nhm2ObserverAudit")],
      metric: {
        state: "pass",
        wecMinOverAllTimelike: 0.1,
        necMinOverAllNull: 0.1,
        decStatus: "PASS",
        secStatus: "PASS",
        observerWorstCaseLocation: "wall",
        typeIFraction: 1,
        missedViolationFraction: 0,
        maxRobustMinusEulerian: 0,
      },
      tile: {
        state: "pass",
        wecMinOverAllTimelike: 0.1,
        necMinOverAllNull: 0.1,
        decStatus: "PASS",
        secStatus: "PASS",
        observerWorstCaseLocation: "wall",
        typeIFraction: 1,
        missedViolationFraction: 0,
        maxRobustMinusEulerian: 0,
      },
    },
    gr_stability_safety: {
      sectionId: "gr_stability_safety",
      state: "pass",
      reasons: [],
      artifactRefs: [makeArtifactRef("gr_evolve_brick", "server/gr-evolve-brick.ts")],
      solverHealth: "pass",
      perturbationFamilies: [],
      H_rms: 1e-4,
      M_rms: 1e-4,
      H_maxAbs: 1e-3,
      M_maxAbs: 1e-3,
      centerlineProperAcceleration_mps2: 0,
      wallNormalSafetyMargin: 0.4,
      blueshiftMax: 0.2,
      stabilityWorstCase: null,
      safetyWorstCaseLocation: null,
    },
    mission_time_outputs: {
      sectionId: "mission_time_outputs",
      state: "pass",
      reasons: [],
      artifactRefs: [makeArtifactRef("mission_time_comparison", "runtime://pipeline/warpMissionTimeComparison")],
      worldlineStatus: "bounded_solve_backed",
      routeTimeStatus: "bounded_local_segment_certified",
      missionTimeEstimatorStatus: "bounded_target_coupled_estimate_ready",
      missionTimeComparisonStatus: "bounded_target_coupled_comparison_ready",
      targetId: "alpha-cen-a",
      coordinateTimeEstimateSeconds: 100,
      properTimeEstimateSeconds: 100,
      properMinusCoordinateSeconds: 0,
      comparatorId: "nhm2_classical_no_time_dilation_reference",
    },
    shift_vs_lapse_decomposition: {
      sectionId: "shift_vs_lapse_decomposition",
      state: "review",
      reasons: ["shift_lapse_decomposition_missing"],
      artifactRefs: [],
      shiftDrivenContribution: null,
      lapseDrivenContribution: null,
      expansionLeakageBound: null,
      thetaFlatnessStatus: null,
      divBetaFlatnessStatus: null,
      natarioBaselineComparisonRef: null,
    },
    uncertainty_perturbation_reproducibility: {
      sectionId: "uncertainty_perturbation_reproducibility",
      state: "unavailable",
      reasons: ["perturbation_suite_missing", "reproducibility_missing"],
      artifactRefs: [],
      precisionAgreementStatus: null,
      meshConvergenceOrder: null,
      boundaryConditionSensitivity: null,
      smoothingKernelSensitivity: null,
      coldStartReproductionStatus: null,
      independentReproductionStatus: null,
      artifactHashConsistencyStatus: null,
    },
    certificate_policy_result: {
      sectionId: "certificate_policy_result",
      state: "unavailable",
      reasons: ["certificate_missing"],
      artifactRefs: [makeArtifactRef("warp_certificate", "tools/warpViabilityCertificate.ts")],
      viabilityStatus: "ADMISSIBLE",
      hardConstraintPass: true,
      firstHardFailureId: null,
      certificateStatus: null,
      certificateHash: null,
      certificateIntegrity: "unavailable",
      promotionTier: "diagnostic",
      promotionReason: "insufficient_provenance",
    },
  };

  const artifact = buildNhm2FullLoopAuditContract({
    generatedAt: "2026-04-08T00:00:00.000Z",
    sections,
  });
  if (!artifact) {
    throw new Error("expected NHM2 full-loop audit contract");
  }
  return {
    policyId: "nhm2_full_loop_audit",
    state: artifact.overallState,
    currentClaimTier: artifact.currentClaimTier,
    maximumClaimTier: artifact.maximumClaimTier,
    highestPassingClaimTier: artifact.highestPassingClaimTier,
    blockingReasons: [...artifact.blockingReasons],
    artifact,
  };
};

describe("warp viability certificate NHM2 policy layer", () => {
  beforeEach(() => {
    runtime.viability = null;
  });

  it("keeps generic certificate status unchanged while surfacing NHM2 full-loop review separately", async () => {
    runtime.viability = {
      status: "ADMISSIBLE",
      constraints: [],
      snapshot: {
        warp_mechanics_provenance_class: "measured",
        warp_mechanics_claim_tier: "diagnostic",
      },
      policyLayers: {
        nhm2_full_loop_audit: makeNhm2PolicyLayer(),
      },
    };

    const cert = await issueWarpViabilityCertificate({}, { useLiveSnapshot: false });

    expect(cert.payload.status).toBe("ADMISSIBLE");
    expect(cert.payload.policyLayers?.nhm2_full_loop_audit.state).toBe("unavailable");
    expect(
      cert.payload.policyLayers?.nhm2_full_loop_audit.artifact.sections.certificate_policy_result.state,
    ).toBe("pass");
    expect(
      cert.payload.policyLayers?.nhm2_full_loop_audit.artifact.sections.certificate_policy_result.certificateStatus,
    ).toBe("ADMISSIBLE");
    expect(
      cert.payload.policyLayers?.nhm2_full_loop_audit.artifact.sections.certificate_policy_result.certificateIntegrity,
    ).toBe("ok");
    expect(
      cert.payload.policyLayers?.nhm2_full_loop_audit.artifact.sections.certificate_policy_result.certificateHash,
    ).toBeNull();
  });

  it("leaves generic non-NHM2 certificates unchanged when no policy layer is present", async () => {
    runtime.viability = {
      status: "ADMISSIBLE",
      constraints: [],
      snapshot: {
        warp_mechanics_provenance_class: "measured",
        warp_mechanics_claim_tier: "certified",
      },
    };

    const cert = await issueWarpViabilityCertificate({}, { useLiveSnapshot: false });

    expect(cert.payload.status).toBe("ADMISSIBLE");
    expect(cert.payload.policyLayers).toBeUndefined();
  });
});
