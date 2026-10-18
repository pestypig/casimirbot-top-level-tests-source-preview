import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isCasimirMaterialReceipt,
  type CasimirMaterialReceiptV1,
} from "../shared/contracts/casimir-material-receipt.v1";
import { buildNhm2RegionalSourceTensorCandidate } from "../shared/contracts/nhm2-regional-source-tensor-candidate.v1";
import {
  buildNhm2RegionalSourceTensorQualityControl,
  isNhm2RegionalSourceTensorQualityControlArtifact,
} from "../shared/contracts/nhm2-regional-source-tensor-quality-control.v1";
import {
  NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS,
  NHM2_TENSOR_COMPONENTS,
  type Nhm2RegionalSourceClosureRegionId,
  type Nhm2RegionalTensor,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import type { Nhm2RegionalSourceTensorTargetsArtifactV1 } from "../shared/contracts/nhm2-regional-source-tensor-targets.v1";
import { buildRegionalMaterialSourceTensorModel } from "../tools/nhm2/build-regional-material-source-tensor-model";

const generatedAt = "2026-06-12T00:00:00.000Z";
const profile = "stage1_centerline_alpha_0p995_v1";

const sourceByRegion: Record<Nhm2RegionalSourceClosureRegionId, number> = {
  global: -58267450.96267209,
  hull: -16732756.921958108,
  wall: -27108804644.765415,
  exterior_shell: -5133810475.7006645,
};

const targetByRegion: Record<Nhm2RegionalSourceClosureRegionId, number> = {
  global: -58267450.98955891,
  hull: -733553902.6786809,
  wall: -1699539201.2526472,
  exterior_shell: -1699157799.1011546,
};

const factorByRegion: Record<Nhm2RegionalSourceClosureRegionId, number> = {
  global: 1.000000000461438,
  hull: 43.83939276115646,
  wall: 0.06269325495990913,
  exterior_shell: 0.33097400208745587,
};

const tensor = (value: number): Nhm2RegionalTensor =>
  Object.fromEntries(
    NHM2_TENSOR_COMPONENTS.map((component) => [component, value]),
  ) as Nhm2RegionalTensor;

const targets = (): Nhm2RegionalSourceTensorTargetsArtifactV1 => ({
  contractVersion: "nhm2_regional_source_tensor_targets/v1",
  generatedAt,
  laneId: "nhm2_shift_lapse",
  selectedProfileId: profile,
  runId: "nhm2-reference-ledger-2026-05-05-v1",
  sourceEvidenceRef: "regional-evidence.json",
  regions: NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId) => ({
    regionId,
    requiredT00_SI: targetByRegion[regionId],
    currentSourceT00_SI: sourceByRegion[regionId],
    requiredOverCurrentSource: factorByRegion[regionId],
    currentSourceOverRequired: sourceByRegion[regionId] / targetByRegion[regionId],
    currentRelativeResidual: regionId === "global" ? 4.6e-10 : 1,
    toleranceRelLInf: 0.1,
    targetSourceT00_SI: targetByRegion[regionId],
    tuningDirection:
      regionId === "hull"
        ? "increase_magnitude"
        : regionId === "global"
          ? "hold"
          : "decrease_magnitude",
    scalarT00WithinTolerance: regionId === "global",
    tensorAuthorityRequired: true,
    materialReceiptRequired: true,
    blockers:
      regionId === "global"
        ? ["regional_tensor_authority_incomplete"]
        : ["scalar_T00_outside_tolerance"],
  })),
  summary: {
    allScalarT00WithinTolerance: false,
    allRegionsHaveTargets: true,
    regionalTensorTuningReady: true,
    firstBlocker: "hull:scalar_T00_outside_tolerance",
  },
  claimBoundary: {
    diagnosticOnly: true,
    scalarTargetsDoNotValidateSource: true,
    regionalTensorAuthorityStillRequired: true,
    physicalClaimAllowed: false,
    transportClaimAllowed: false,
  },
});

const materialReceipt = (): CasimirMaterialReceiptV1 => ({
  contractVersion: "casimir_material_receipt/v1",
  generatedAt,
  tileBatchId: "regional-qc-test",
  geometry: {
    gapMeters: 8e-9,
    gapMetrologyStatus: "measured",
    roughnessRmsMeters: 1e-10,
    beyondPfaValidity: "pass",
  },
  material: {
    modelKind: "lifshitz",
    dielectricResponseRef: "dielectric.json",
    finiteConductivityIncluded: true,
    finiteTemperatureIncluded: true,
    roughnessCorrectionIncluded: true,
  },
  environment: { vacuumSealEvidence: "present", temperatureK: 4 },
  correctionFactors: { conductivity: 1, temperature: 1, roughness: 1, geometry: 1 },
  status: "material_receipted",
  literatureRefs: [
    "reid_white_johnson_2010_arbitrary_geometry_casimir",
    "klimchitskaya_mohideen_mostepanenko_2009_lifshitz_review",
  ],
  claimBoundary: {
    diagnosticOnly: true,
    idealCasimirDoesNotValidateTileSource: true,
  },
});

const candidate = () =>
  buildNhm2RegionalSourceTensorCandidate({
    generatedAt,
    artifactRefs: {
      regionalSourceTensorTargets: "targets.json",
      fullTensorTemplate: "template.json",
      materialReceipt: "receipt.json",
    },
    targets: targets(),
    fullTensorTemplate: {
      templateId: "template",
      regions: NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId) => ({
        regionId,
        tensor: tensor(sourceByRegion[regionId]),
        provenanceRef: `template:${regionId}`,
      })),
    },
    materialReceipt: materialReceipt(),
  });

const materialModel = (values: Record<Nhm2RegionalSourceClosureRegionId, number>) =>
  buildRegionalMaterialSourceTensorModel({
    generatedAt,
    materialReceipt: materialReceipt(),
    materialReceiptRef: "receipt.json",
    componentModel: {
      modelKind: "lifshitz_regional_tensor",
      selectedProfileId: profile,
      regions: Object.fromEntries(
        NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId) => [
          regionId,
          {
            status: "material_receipted",
            tensor: tensor(values[regionId]),
            aggregationMode: "representative_sector_bin",
            normalizationBasis: "sample_count",
            sampleCount: 1,
            basisRef: "same_basis",
            provenanceRef: `material-model:${regionId}`,
          },
        ]),
      ),
    },
  });

const buildQc = (
  regionalMaterialSourceTensorModel: ReturnType<typeof materialModel> | null,
) =>
  buildNhm2RegionalSourceTensorQualityControl({
    generatedAt,
    artifactRefs: {
      regionalSourceTensorTargets: "targets.json",
      regionalSourceTensorCandidate: "candidate.json",
      regionalMaterialSourceTensorModel:
        regionalMaterialSourceTensorModel == null ? null : "regional-model.json",
      materialReceipt: "receipt.json",
    },
    targets: targets(),
    candidate: candidate(),
    regionalMaterialSourceTensorModel,
    materialReceipt: materialReceipt(),
  });

describe("nhm2_regional_source_tensor_quality_control/v1", () => {
  it("keeps target-fit candidates blocked when no material tensor model is supplied", () => {
    const artifact = buildQc(null);
    const wall = artifact.regions.find((region) => region.regionId === "wall");

    expect(artifact.summary.candidateScalarAligned).toBe(true);
    expect(artifact.summary.candidateIsTargetFit).toBe(true);
    expect(artifact.summary.materialModelAvailable).toBe(false);
    expect(artifact.summary.sourceModelEligibleForHarness).toBe(false);
    expect(artifact.summary.regionalNumericalClosurePass).toBe(false);
    expect(wall?.status).toBe("missing");
    expect(wall?.sourceEligibilityBlockers).toContain(
      "regional_material_source_tensor_model_missing",
    );
    expect(artifact.claimBoundary.targetFitCandidateIsNotSourceEvidence).toBe(true);
    expect(isNhm2RegionalSourceTensorQualityControlArtifact(artifact)).toBe(true);
  });

  it("keeps source-model eligibility separate when the material tensor is authoritative but regionally off target", () => {
    const artifact = buildQc(materialModel(sourceByRegion));
    const hull = artifact.regions.find((region) => region.regionId === "hull");

    expect(artifact.summary.allRegionsIndependentMaterialTensor).toBe(true);
    expect(artifact.summary.allRegionsFullTensor).toBe(true);
    expect(artifact.summary.allRegionsMaterialReceipted).toBe(true);
    expect(artifact.summary.sourceModelEligibleForHarness).toBe(true);
    expect(artifact.summary.allDirectionalTargetsImproved).toBe(false);
    expect(artifact.summary.allMaterialT00WithinTolerance).toBe(false);
    expect(artifact.summary.regionalNumericalClosurePass).toBe(false);
    expect(artifact.summary.firstNumericalBlocker).toBe(
      "hull:material_model_wrong_direction",
    );
    expect(hull?.status).toBe("fail");
    expect(hull?.sourceEligibilityBlockers).toEqual([]);
    expect(hull?.numericalBlockers).toContain("material_model_wrong_direction");
    expect(hull?.numericalBlockers).toContain(
      "material_model_T00_outside_target_tolerance",
    );
  });

  it("marks the source model harness-eligible only when all regional material tensors hit tolerance", () => {
    const artifact = buildQc(materialModel(targetByRegion));
    const wall = artifact.regions.find((region) => region.regionId === "wall");

    expect(artifact.summary.allRegionsIndependentMaterialTensor).toBe(true);
    expect(artifact.summary.allRegionsFullTensor).toBe(true);
    expect(artifact.summary.allRegionsMaterialReceipted).toBe(true);
    expect(artifact.summary.allDirectionalTargetsImproved).toBe(true);
    expect(artifact.summary.allMaterialT00WithinTolerance).toBe(true);
    expect(artifact.summary.sourceModelEligibleForHarness).toBe(true);
    expect(artifact.summary.regionalNumericalClosurePass).toBe(true);
    expect(artifact.summary.firstNumericalBlocker).toBe("none");
    expect(wall?.status).toBe("pass");
    expect(wall?.directionalImprovement).toBe(true);
    expect(wall?.materialModelRelativeErrorToTarget).toBe(0);
    expect(artifact.claimBoundary.physicalClaimAllowed).toBe(false);
    expect(artifact.claimBoundary.requiresDownstreamHarness).toBe(true);
  });

  it("moves the declared fixture from missing-source-model to a numerical residual blocker", () => {
    const fixtureReceipt = JSON.parse(
      readFileSync(
        "fixtures/nhm2/casimir-material-receipt.declared-lifshitz-v1.json",
        "utf8",
      ),
    ) as unknown;
    const fixtureComponentModel = JSON.parse(
      readFileSync("fixtures/nhm2/regional-source-components.directional-v1.json", "utf8"),
    ) as unknown;
    if (!isCasimirMaterialReceipt(fixtureReceipt)) {
      throw new Error("declared Lifshitz fixture must be casimir_material_receipt/v1");
    }
    const model = buildRegionalMaterialSourceTensorModel({
      generatedAt,
      materialReceipt: fixtureReceipt,
      materialReceiptRef: "fixtures/nhm2/casimir-material-receipt.declared-lifshitz-v1.json",
      sourceModelRef: "fixtures/nhm2/regional-source-components.directional-v1.json",
      componentModel: fixtureComponentModel,
    });
    const artifact = buildNhm2RegionalSourceTensorQualityControl({
      generatedAt,
      artifactRefs: {
        regionalSourceTensorTargets: "targets.json",
        regionalSourceTensorCandidate: "candidate.json",
        regionalMaterialSourceTensorModel: "regional-model.json",
        materialReceipt: "fixtures/nhm2/casimir-material-receipt.declared-lifshitz-v1.json",
      },
      targets: targets(),
      candidate: candidate(),
      regionalMaterialSourceTensorModel: model,
      materialReceipt: fixtureReceipt,
    });

    expect(artifact.summary.materialModelAvailable).toBe(true);
    expect(artifact.summary.allSourceEligibilityBlockersClear).toBe(true);
    expect(artifact.summary.sourceModelEligibleForHarness).toBe(true);
    expect(artifact.summary.allDirectionalTargetsImproved).toBe(true);
    expect(artifact.summary.regionalNumericalClosurePass).toBe(false);
    expect(artifact.summary.firstBlocker).toBe(
      "hull:material_model_T00_outside_target_tolerance",
    );
    expect(artifact.summary.firstNumericalBlocker).toBe(
      "hull:material_model_T00_outside_target_tolerance",
    );
    expect(artifact.claimBoundary.physicalClaimAllowed).toBe(false);
  });

  it("allows the tuned declared fixture to pass regional numerical QC without changing claim boundaries", () => {
    const fixtureReceipt = JSON.parse(
      readFileSync(
        "fixtures/nhm2/casimir-material-receipt.declared-lifshitz-v1.json",
        "utf8",
      ),
    ) as unknown;
    const fixtureComponentModel = JSON.parse(
      readFileSync("fixtures/nhm2/regional-source-components.tuned-v1.json", "utf8"),
    ) as unknown;
    if (!isCasimirMaterialReceipt(fixtureReceipt)) {
      throw new Error("declared Lifshitz fixture must be casimir_material_receipt/v1");
    }
    const model = buildRegionalMaterialSourceTensorModel({
      generatedAt,
      materialReceipt: fixtureReceipt,
      materialReceiptRef: "fixtures/nhm2/casimir-material-receipt.declared-lifshitz-v1.json",
      sourceModelRef: "fixtures/nhm2/regional-source-components.tuned-v1.json",
      componentModel: fixtureComponentModel,
    });
    const artifact = buildNhm2RegionalSourceTensorQualityControl({
      generatedAt,
      artifactRefs: {
        regionalSourceTensorTargets: "targets.json",
        regionalSourceTensorCandidate: "candidate.json",
        regionalMaterialSourceTensorModel: "regional-model.tuned-v1.json",
        materialReceipt: "fixtures/nhm2/casimir-material-receipt.declared-lifshitz-v1.json",
      },
      targets: targets(),
      candidate: candidate(),
      regionalMaterialSourceTensorModel: model,
      materialReceipt: fixtureReceipt,
    });

    expect(artifact.summary.candidateScalarAligned).toBe(true);
    expect(artifact.summary.materialModelAvailable).toBe(true);
    expect(artifact.summary.sourceModelEligibleForHarness).toBe(true);
    expect(artifact.summary.allDirectionalTargetsImproved).toBe(true);
    expect(artifact.summary.allMaterialT00WithinTolerance).toBe(true);
    expect(artifact.summary.regionalNumericalClosurePass).toBe(true);
    expect(artifact.summary.firstNumericalBlocker).toBe("none");
    expect(artifact.summary.firstBlocker).toBe("none");
    expect(artifact.regions.every((region) => region.status === "pass")).toBe(true);
    expect(artifact.claimBoundary.physicalClaimAllowed).toBe(false);
    expect(artifact.claimBoundary.transportClaimAllowed).toBe(false);
  });
});
