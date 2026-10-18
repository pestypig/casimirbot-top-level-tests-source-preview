import { describe, expect, it } from "vitest";

import { buildCasimirMaterialReceipt } from "../shared/contracts/casimir-material-receipt.v1";
import { isNhm2LayeredWallSourceCandidateArtifact } from "../shared/contracts/nhm2-layered-wall-source-candidate.v1";
import { buildLayeredWallSourceCandidate } from "../tools/nhm2/build-layered-wall-source-candidate";
import { buildLayeredWallSourceTensorCandidate } from "../tools/nhm2/build-layered-wall-source-tensor-candidate";
import { buildWallSourceLayeringSweep } from "../tools/nhm2/build-wall-source-layering-sweep";

const generatedAt = "2026-06-12T00:00:00.000Z";

const scalarPassSweep = () =>
  buildWallSourceLayeringSweep({
    generatedAt,
    layerCounts: [447],
    packingFractions: [1],
    orientationProjections: [1],
    materialCorrections: [1],
    metricReliefFactors: [1],
  });

const materialReceipt = () =>
  buildCasimirMaterialReceipt({
    generatedAt,
    tileBatchId: "nhm2_cavity_geometry_freeze_v1",
    geometry: {
      gapMeters: 8e-9,
      gapMetrologyStatus: "measured",
      roughnessRmsMeters: 1e-12,
      beyondPfaValidity: "pass",
    },
    material: {
      modelKind: "lifshitz",
      dielectricResponseRef: "fixture:measured-dielectric-response",
      finiteConductivityIncluded: true,
      finiteTemperatureIncluded: true,
      roughnessCorrectionIncluded: true,
    },
    environment: {
      vacuumSealEvidence: "present",
      temperatureK: 4,
    },
    correctionFactors: {
      conductivity: 1,
      temperature: 1,
      roughness: 1,
      geometry: 1,
    },
  });

describe("NHM2 layered wall-source candidate", () => {
  it("turns the 447-layer fixed-volume row into a scalar T00 candidate but not a full-solve pass", () => {
    const candidate = buildLayeredWallSourceCandidate({
      generatedAt,
      sourceSweep: scalarPassSweep(),
      sourceSweepRef: "sweep.json",
    });

    expect(candidate.scalarWallT00Status).toBe("pass_1pct");
    expect(candidate.passPath.scalarWallT00Candidate).toBe(true);
    expect(candidate.passPath.fullSolvePassEligible).toBe(false);
    expect(candidate.fixedVolumeResidual).toBeLessThan(0.01);
    expect(candidate.selectedVolumeMode).toBe("fixed_control_volume");
    expect(candidate.candidateWallT00AbsSI).toBeCloseTo(
      3_808_962.223968027 * 447,
      3,
    );
    expect(candidate.blockers).toContain(
      "fixed_control_volume_not_yet_physical_volume_audit",
    );
    expect(candidate.blockers).toContain("full_tensor_source_missing_or_proxy");
    expect(candidate.blockers).toContain(
      "same_basis_tensor_authority_missing_or_incomplete",
    );
    expect(isNhm2LayeredWallSourceCandidateArtifact(candidate)).toBe(true);
  });

  it("blocks the same row under expanded-wall-volume accounting", () => {
    const candidate = buildLayeredWallSourceCandidate({
      generatedAt,
      sourceSweep: scalarPassSweep(),
      sourceSweepRef: "sweep.json",
      selectedVolumeMode: "expanded_wall_volume",
    });

    expect(candidate.selectedVolumeMode).toBe("expanded_wall_volume");
    expect(candidate.scalarWallT00Status).toBe("fail");
    expect(candidate.passPath.scalarWallT00Candidate).toBe(false);
    expect(candidate.expandedVolumeResidual).toBeGreaterThan(0.99);
    expect(candidate.blockers).toContain(
      "expanded_volume_wall_t00_residual_exceeded",
    );
  });

  it("keeps ideal scalar material status as a blocker even when scalar T00 passes", () => {
    const candidate = buildLayeredWallSourceCandidate({
      generatedAt,
      sourceSweep: scalarPassSweep(),
      sourceSweepRef: "sweep.json",
    });

    expect(candidate.materialStatus).toBe("ideal_scalar_only");
    expect(candidate.passPath.materialReceipt).toBe(false);
    expect(candidate.blockers).toContain("material_receipt_missing_or_not_receipted");
  });

  it("keeps the final claim locked even when non-scalar side gates are supplied as passing", () => {
    const receipt = materialReceipt();
    const candidate = buildLayeredWallSourceCandidate({
      generatedAt,
      sourceSweep: scalarPassSweep(),
      sourceSweepRef: "sweep.json",
      materialReceipt: receipt,
      materialReceiptRef: "receipt.json",
      sameBasisAuthority: {
        summary: {
          hasWallAuthority: true,
          allRequiredRegionsAuthoritative: true,
        },
      } as any,
      sameBasisAuthorityRef: "authority.json",
      conservationArtifact: { overallState: "pass" },
      conservationRef: "conservation.json",
      qeiDossierArtifact: { summary: { dossierComplete: true } },
      qeiDossierRef: "qei.json",
      observerRobustEnergyConditionsArtifact: {
        summary: {
          robustCheckComplete: true,
          anyViolation: false,
          eulerianOnly: false,
        },
      },
      observerRobustEnergyConditionsRef: "observer.json",
    });

    expect(candidate.materialStatus).toBe("material_receipted");
    expect(candidate.passPath.materialReceipt).toBe(true);
    expect(candidate.passPath.sameBasisTensorAuthority).toBe(true);
    expect(candidate.passPath.conservation).toBe(true);
    expect(candidate.passPath.qeiDossier).toBe(true);
    expect(candidate.passPath.observerRobustEnergyConditions).toBe(true);
    expect(candidate.passPath.fullSolvePassEligible).toBe(false);
    expect(candidate.blockers).toContain("full_tensor_source_missing_or_proxy");
    expect(candidate.blockers).toContain("diagnostic_claim_lock_no_physical_pass");
  });

  it("emits only wall T00 into the tensor candidate and leaves missing components explicit", () => {
    const candidate = buildLayeredWallSourceCandidate({
      generatedAt,
      sourceSweep: scalarPassSweep(),
      sourceSweepRef: "sweep.json",
    });
    const tensorCandidate = buildLayeredWallSourceTensorCandidate({
      generatedAt,
      candidate,
      candidateRef: "candidate.json",
    });
    const wall = tensorCandidate.regions.find((region) => region.regionId === "wall");

    expect(wall?.tensor.T00).toBeCloseTo(-candidate.candidateWallT00AbsSI, 3);
    expect(wall?.tensor.T01).toBeUndefined();
    expect(wall?.tensor.T12).toBeUndefined();
    expect(wall?.tensorAuthorityMode).toBe("proxy");
    expect(tensorCandidate.overallState).toBe("fail");
    expect(tensorCandidate.reasonCodes).toContain("wall:proxy_tensor_authority");
    expect(tensorCandidate.reasonCodes).toContain(
      "wall:full_tensor_components_missing",
    );
    expect(tensorCandidate.promotionAllowed).toBe(false);
    expect(tensorCandidate.physicalMechanismClaimAllowed).toBe(false);
  });

  it("does not use viability, validation, or certification language in the candidate artifact", () => {
    const candidate = buildLayeredWallSourceCandidate({
      generatedAt,
      sourceSweep: scalarPassSweep(),
      sourceSweepRef: "sweep.json",
    });

    expect(JSON.stringify(candidate)).not.toMatch(
      /\b(viable|validated|certified)\b/i,
    );
  });
});
