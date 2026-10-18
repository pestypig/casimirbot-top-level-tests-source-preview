import { describe, expect, it } from "vitest";

import { buildCasimirMaterialReceipt } from "../shared/contracts/casimir-material-receipt.v1";
import {
  isNhm2LayeredWallFullTensorSourceAuditArtifact,
} from "../shared/contracts/nhm2-layered-wall-full-tensor-source-audit.v1";
import { buildLayeredWallFullTensorSourceAudit } from "../tools/nhm2/build-layered-wall-full-tensor-source-audit";
import { buildLayeredWallSourceCandidate } from "../tools/nhm2/build-layered-wall-source-candidate";
import { buildLayeredWallSourceTensorCandidate } from "../tools/nhm2/build-layered-wall-source-tensor-candidate";
import { buildWallMaterialSourceTensorModel } from "../tools/nhm2/build-wall-material-source-tensor-model";
import { buildWallSourceLayeringSweep } from "../tools/nhm2/build-wall-source-layering-sweep";

const generatedAt = "2026-06-12T00:00:00.000Z";

const candidate = () =>
  buildLayeredWallSourceCandidate({
    generatedAt,
    sourceSweep: buildWallSourceLayeringSweep({
      generatedAt,
      layerCounts: [447],
      packingFractions: [1],
      orientationProjections: [1],
      materialCorrections: [1],
      metricReliefFactors: [1],
    }),
    sourceSweepRef: "sweep.json",
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
      dielectricResponseRef: "fixture:lifshitz-response",
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

const fullComponentModel = () => ({
  modelKind: "lifshitz_wall_tensor",
  basis: "local_wall_orthonormal",
  projection: {
    wallNormalRef: "fixture:wall-normal",
    sameChartProjectionStatus: "pass",
  },
  components: {
    T00: {
      valueSI: -1.6995e9,
      status: "material_receipted",
      provenanceRef: "fixture:wall-source:T00",
    },
    T0x: {
      valueSI: 0,
      status: "computed",
      provenanceRef: "fixture:wall-source:T0x",
      assumptions: ["static_comoving_cavity_zero_momentum_density"],
    },
    T0y: {
      valueSI: 0,
      status: "computed",
      provenanceRef: "fixture:wall-source:T0y",
      assumptions: ["static_comoving_cavity_zero_momentum_density"],
    },
    T0z: {
      valueSI: 0,
      status: "computed",
      provenanceRef: "fixture:wall-source:T0z",
      assumptions: ["static_comoving_cavity_zero_momentum_density"],
    },
    Txx: { valueSI: 4.1e7, status: "computed", provenanceRef: "fixture:wall-source:Txx" },
    Txy: { valueSI: 0, status: "computed", provenanceRef: "fixture:wall-source:Txy" },
    Txz: { valueSI: 0, status: "computed", provenanceRef: "fixture:wall-source:Txz" },
    Tyy: { valueSI: 4.1e7, status: "computed", provenanceRef: "fixture:wall-source:Tyy" },
    Tyz: { valueSI: 0, status: "computed", provenanceRef: "fixture:wall-source:Tyz" },
    Tzz: { valueSI: 4.1e7, status: "computed", provenanceRef: "fixture:wall-source:Tzz" },
  },
});

describe("NHM2 layered wall full-tensor source audit", () => {
  it("emits T00 only and remains proxy when no material receipt is attached", () => {
    const built = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: candidate(),
      candidateRef: "candidate.json",
    });
    const t00 = built.components.find((component) => component.componentId === "T00");

    expect(t00?.valueSI).toBeTypeOf("number");
    expect(t00?.status).toBe("derived_ideal_proxy");
    expect(built.authority.tensorAuthorityMode).toBe("proxy");
    expect(built.authority.fullTensorCandidate).toBe(false);
    expect(built.blockers).toContain("material_receipt_missing_or_not_receipted");
    expect(built.claimBoundary.missingComponentsAreNotZero).toBe(true);
    expect(isNhm2LayeredWallFullTensorSourceAuditArtifact(built)).toBe(true);
  });

  it("marks all T0i momentum-density components missing instead of zero", () => {
    const built = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: candidate(),
      candidateRef: "candidate.json",
    });
    const momentum = built.components.filter((component) =>
      ["T0x", "T0y", "T0z"].includes(component.componentId),
    );

    expect(momentum).toHaveLength(3);
    expect(momentum.every((component) => component.valueSI === null)).toBe(true);
    expect(momentum.every((component) => component.status === "missing")).toBe(true);
    expect(momentum.every((component) =>
      component.blockers.includes("momentum_density_model_missing"),
    )).toBe(true);
    expect(built.authority.hasT0i).toBe(false);
  });

  it("marks off-diagonal spatial stresses missing and blocks full tensor authority", () => {
    const built = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: candidate(),
      candidateRef: "candidate.json",
    });
    const offDiagonal = built.components.filter((component) =>
      ["Txy", "Txz", "Tyz"].includes(component.componentId),
    );

    expect(offDiagonal.every((component) => component.valueSI === null)).toBe(true);
    expect(offDiagonal.every((component) => component.status === "missing")).toBe(true);
    expect(built.authority.hasOffDiagonalTij).toBe(false);
    expect(built.authority.fullTensorCandidate).toBe(false);
    expect(built.blockers).toContain("off_diagonal_stress_model_missing");
  });

  it("does not let a material receipt substitute for a material tensor model", () => {
    const built = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: candidate(),
      candidateRef: "candidate.json",
      materialReceipt: materialReceipt(),
      materialReceiptRef: "receipt.json",
    });

    expect(built.sourceModel.modelKind).toBe("lifshitz_material_tensor");
    expect(built.authority.fullTensorCandidate).toBe(false);
    expect(built.blockers).toContain(
      "material_receipt_attached_but_material_tensor_model_missing",
    );
    expect(built.blockers).not.toContain("material_receipt_missing_or_not_receipted");
  });

  it("uses an explicit non-proxy wall source tensor model for full tensor authority", () => {
    const selected = candidate();
    const receipt = materialReceipt();
    const sourceTensorModel = buildWallMaterialSourceTensorModel({
      generatedAt,
      candidate: selected,
      candidateRef: "candidate.json",
      materialReceipt: receipt,
      materialReceiptRef: "receipt.json",
      componentModel: fullComponentModel(),
    });
    const built = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: selected,
      candidateRef: "candidate.json",
      materialReceipt: receipt,
      materialReceiptRef: "receipt.json",
      sourceTensorModel,
      sourceTensorModelRef: "wall-source-tensor-model.json",
    });

    expect(sourceTensorModel.claimBoundary.zeroComponentsMustBeExplicitlyComputed).toBe(true);
    expect(sourceTensorModel.components.find((component) => component.componentId === "T0x")?.valueSI).toBe(0);
    expect(built.authority.hasT0i).toBe(true);
    expect(built.authority.hasDiagonalTij).toBe(true);
    expect(built.authority.hasOffDiagonalTij).toBe(true);
    expect(built.authority.fullTensorCandidate).toBe(true);
    expect(built.authority.tensorAuthorityMode).toBe("symmetric_full_tensor");
    expect(built.blockers).not.toContain("momentum_density_model_missing");
    expect(built.blockers).not.toContain("off_diagonal_stress_model_missing");
  });

  it("blocks metric-required provenance in a declared source tensor model", () => {
    expect(() =>
      buildWallMaterialSourceTensorModel({
        generatedAt,
        candidate: candidate(),
        candidateRef: "candidate.json",
        componentModel: {
          components: {
            T00: {
              valueSI: -1,
              status: "computed",
              provenanceRef: "metric_required.wall.T00",
            },
          },
        },
      }),
    ).toThrow(/metric-required tensors/);
  });

  it("keeps the downstream tensor adapter proxy when the audit is incomplete", () => {
    const selected = candidate();
    const audit = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: selected,
      candidateRef: "candidate.json",
    });
    const tensorCandidate = buildLayeredWallSourceTensorCandidate({
      generatedAt,
      candidate: selected,
      candidateRef: "candidate.json",
      fullTensorAudit: audit,
      fullTensorAuditRef: "audit.json",
    });
    const wall = tensorCandidate.regions.find((region) => region.regionId === "wall");

    expect(wall?.tensorAuthorityMode).toBe("proxy");
    expect(wall?.tensor.T00).toBeCloseTo(-selected.candidateWallT00AbsSI, 3);
    expect(wall?.tensor.T01).toBeUndefined();
    expect(wall?.tensor.T12).toBeUndefined();
    expect(tensorCandidate.reasonCodes).toContain("wall:proxy_tensor_authority");
    expect(tensorCandidate.reasonCodes).toContain(
      "wall:full_tensor_components_missing",
    );
  });

  it("switches the downstream wall source tensor from proxy to symmetric full tensor when the audit is complete", () => {
    const selected = candidate();
    const receipt = materialReceipt();
    const sourceTensorModel = buildWallMaterialSourceTensorModel({
      generatedAt,
      candidate: selected,
      candidateRef: "candidate.json",
      materialReceipt: receipt,
      materialReceiptRef: "receipt.json",
      componentModel: fullComponentModel(),
    });
    const audit = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: selected,
      candidateRef: "candidate.json",
      materialReceipt: receipt,
      materialReceiptRef: "receipt.json",
      sourceTensorModel,
      sourceTensorModelRef: "wall-source-tensor-model.json",
    });
    const tensorCandidate = buildLayeredWallSourceTensorCandidate({
      generatedAt,
      candidate: selected,
      candidateRef: "candidate.json",
      fullTensorAudit: audit,
      fullTensorAuditRef: "audit.json",
    });
    const wall = tensorCandidate.regions.find((region) => region.regionId === "wall");

    expect(wall?.status).toBe("pass");
    expect(wall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
    expect(wall?.tensor.T01).toBe(0);
    expect(wall?.tensor.T12).toBe(0);
    expect(wall?.provenance.derivationMode).toBe("source_model_reconstituted_full_tensor");
    expect(tensorCandidate.reasonCodes).not.toContain("wall:proxy_tensor_authority");
    expect(tensorCandidate.reasonCodes).not.toContain(
      "wall:full_tensor_components_missing",
    );
  });

  it("does not use viability, validation, or certification language in the audit artifact", () => {
    const built = buildLayeredWallFullTensorSourceAudit({
      generatedAt,
      candidate: candidate(),
      candidateRef: "candidate.json",
    });

    expect(JSON.stringify(built)).not.toMatch(/\b(viable|validated|certified)\b/i);
  });
});
