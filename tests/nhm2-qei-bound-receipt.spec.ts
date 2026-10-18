import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isNhm2QeiBoundReceipt,
} from "../shared/contracts/nhm2-qei-bound-receipt.v1";
import { buildNhm2RegionalSupportFunctionAtlas } from "../shared/contracts/nhm2-regional-support-function-atlas.v1";
import {
  NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS,
  NHM2_TENSOR_COMPONENTS,
  type Nhm2RegionalTensor,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2TileEffectiveFullTensorSourceArtifact } from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import { buildQeiBoundReceipt } from "../tools/nhm2/build-qei-bound-receipt";
import { writeFileSync } from "node:fs";

const writeJson = (dir: string, name: string, value: unknown): string => {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
};

const atlasRegion = (
  regionId:
    | "global"
    | "hull"
    | "wall"
    | "exterior_shell"
    | "hull_wall_transition"
    | "wall_exterior_transition",
) => ({
  regionId,
  semanticRole:
    regionId === "global"
      ? "global_region" as const
      : regionId.includes("transition")
        ? "transition_region" as const
        : "closure_region" as const,
  maskRef: `mask.${regionId}`,
  supportFunctionRef: `support.${regionId}`,
  sampleCount: 8,
  supportStats: {
    minWeight: 0,
    maxWeight: 1,
    meanWeight: 1,
    nonzeroFraction: 1,
    effectiveVolume: 27,
  },
  aggregationPolicy: {
    weighting: "support_weighted" as const,
    normalization: "sum_weights" as const,
    includeTransitionSamples: !regionId.includes("transition"),
  },
});

const atlas = () =>
  buildNhm2RegionalSupportFunctionAtlas({
    runIdentity: {
      runId: "qei-bound-test",
      profileId: "stage1_centerline_alpha_0p995_v1",
      chartId: "comoving_cartesian",
      metricRef: "metric.json",
      sourceModelRef: "source.json",
      gridRef: "grid.json",
      samplePlanRef: "sample-plan.json",
      createdAt: "2026-06-13T00:00:00.000Z",
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
      global: atlasRegion("global"),
      hull: atlasRegion("hull"),
      wall: atlasRegion("wall"),
      exterior_shell: atlasRegion("exterior_shell"),
      hull_wall_transition: atlasRegion("hull_wall_transition"),
      wall_exterior_transition: atlasRegion("wall_exterior_transition"),
    },
    transitionKernels: [
      {
        kernelId: "kernel:hull_wall",
        fromRegion: "hull",
        toRegion: "wall",
        supportRegion: "hull_wall_transition",
        kernelKind: "smootherstep_c2",
        smoothnessClass: "C2",
        widthMeters: 2,
        derivativeTermsAvailable: true,
      },
      {
        kernelId: "kernel:wall_exterior",
        fromRegion: "wall",
        toRegion: "exterior_shell",
        supportRegion: "wall_exterior_transition",
        kernelKind: "smootherstep_c2",
        smoothnessClass: "C2",
        widthMeters: 2,
        derivativeTermsAvailable: true,
      },
    ],
    partitionOfUnity: {
      appliesTo: [...NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS],
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
      transitionDerivativeTermsRequired: true,
    },
    provenance: {
      generatedFrom: ["reference.json"],
      inputHashes: { "reference.json": "hash" },
      atlasHash: "qei-bound-atlas-hash",
      targetEchoForbidden: true,
      targetDerivedFieldsUsed: false,
    },
  });

const tensor = (): Nhm2RegionalTensor =>
  Object.fromEntries(
    NHM2_TENSOR_COMPONENTS.map((component) => [component, component === "T00" ? -1 : 0]),
  ) as Nhm2RegionalTensor;

const source = () =>
  buildNhm2TileEffectiveFullTensorSourceArtifact({
    generatedAt: "2026-06-13T00:00:00.000Z",
    runId: "qei-bound-test",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    expectedProfileId: "stage1_centerline_alpha_0p995_v1",
    laneId: "nhm2_shift_lapse",
    sourceModel: {
      sourceModelId: "qei-bound-source",
      sourceModelVersion: "test",
      sourceModelClass: "renormalized_qft_declared",
      sourceSideOnly: true,
      notDerivedFromMetricRequiredTensor: true,
      metricRequiredInputRefs: [],
      sourceInputRefs: ["source-input.json"],
      qeiDossierRef: null,
      conservationRef: null,
    },
    regions: NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId) => ({
      regionId,
      status: "pass",
      tensorAuthorityMode: "symmetric_full_tensor",
      tensor: tensor(),
      symmetry: {
        declared: false,
        kind: "none",
        lowerComponentsDerivedBySymmetry: false,
      },
      chartRef: "comoving_cartesian",
      unitsRef: "J/m^3",
      regionMaskRef: `mask.${regionId}`,
      aggregationMode: "mean",
      normalizationBasis: "volume",
      sampleCount: 8,
      sourceSupport: {
        supportKernelId: `support.${regionId}`,
        cycleAverageStatus: "pass",
        dutyCycleStatus: "pass",
        lightCrossingConsistencyStatus: "pass",
      },
      provenance: {
        producerModule: "test",
        producerFunction: "source",
        derivationMode: "source_model_direct_full_tensor",
        inputRefs: ["source-input.json"],
        preAggregationValueRefs: [`source:${regionId}`],
        notDerivedFromMetricRequiredTensor: true,
      },
      blockers: [],
    })),
    literatureRefs: [],
  });

const reviewedButAuthoritativeSource = () => {
  const artifact = source();
  return {
    ...artifact,
    overallState: "review" as const,
    claimEffect: "diagnostic_only" as const,
    regions: artifact.regions.map((region) => ({
      ...region,
      status: "review" as const,
      blockers: ["qei_dossier_not_pass", "conservation_unknown"],
    })),
    reasonCodes: [
      ...artifact.reasonCodes,
      ...NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.flatMap((regionId) => [
        `${regionId}:qei_dossier_not_pass`,
        `${regionId}:conservation_unknown`,
      ]),
    ],
  };
};

describe("nhm2_qei_bound_receipt/v1", () => {
  it("records explicit blockers when bound and tau evidence are missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-qei-bound-"));
    const atlasPath = writeJson(dir, "atlas.json", atlas());
    const sourcePath = writeJson(dir, "source.json", source());

    const receipt = buildQeiBoundReceipt({
      repoRoot: dir,
      regionalSupportAtlasPath: atlasPath,
      sourceFullTensorPath: sourcePath,
      outPath: "receipt.json",
      auditOnly: true,
    });

    expect(receipt.status).toBe("missing");
    expect(receipt.blockers).toContain("qei_bound_missing");
    expect(receipt.blockers).toContain("sampling_tau_missing");
    expect(receipt.blockers).toContain("qei_bound_provenance_ref_missing");
    expect(receipt.blockers).toContain("qei_tau_source_ref_missing");
    expect(receipt.blockers).toContain("qei_duty_source_ref_missing");
    expect(receipt.blockers).toContain("qei_modulation_source_ref_missing");
    expect(receipt.blockers).toContain("qei_qft_state_ref_missing");
    expect(receipt.blockers).toContain("qei_renormalization_ref_missing");
    expect(isNhm2QeiBoundReceipt(receipt)).toBe(true);
  });

  it("does not mask missing bound evidence behind reviewed source authority", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-qei-bound-"));
    const atlasPath = writeJson(dir, "atlas.json", atlas());
    const sourcePath = writeJson(dir, "source.json", reviewedButAuthoritativeSource());

    const receipt = buildQeiBoundReceipt({
      repoRoot: dir,
      regionalSupportAtlasPath: atlasPath,
      sourceFullTensorPath: sourcePath,
      outPath: "receipt.json",
      auditOnly: true,
    });

    expect(receipt.blockers).not.toContain("source_full_tensor_authority_not_pass");
    expect(receipt.blockers).toContain("qei_bound_missing");
    expect(receipt.blockers).toContain("sampling_tau_missing");
  });

  it("keeps numeric tau and bound evidence in review without provenance refs", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-qei-bound-"));
    const atlasPath = writeJson(dir, "atlas.json", atlas());
    const sourcePath = writeJson(dir, "source.json", source());

    const receipt = buildQeiBoundReceipt({
      repoRoot: dir,
      regionalSupportAtlasPath: atlasPath,
      sourceFullTensorPath: sourcePath,
      outPath: "receipt.json",
      boundModelKind: "ford_roman_lorentzian",
      boundSI: 0,
      boundProvenanceRef: "ford_roman_1996_quantum_inequality",
      tauSeconds: 1e-10,
      samplingKind: "lorentzian",
      samplingNormalized: true,
      dutyCycle: 0.5,
      modulationSeconds: 1e-6,
      qftStateRef: "qft-state.json",
      renormalizationConventionRef: "renormalization.json",
      stationaryWorldlineAssumption: true,
      auditOnly: true,
    });

    expect(receipt.status).toBe("review");
    expect(receipt.blockers).toContain("qei_tau_source_ref_missing");
    expect(receipt.blockers).toContain("qei_duty_source_ref_missing");
    expect(receipt.blockers).toContain("qei_modulation_source_ref_missing");
    expect(receipt.blockers).not.toContain("qei_bound_provenance_ref_missing");
    expect(receipt.blockers).not.toContain("qei_light_crossing_source_ref_missing");
  });

  it("can pass the bound-receipt gate when tau, bound, and applicability refs are present", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-qei-bound-"));
    const atlasPath = writeJson(dir, "atlas.json", atlas());
    const sourcePath = writeJson(dir, "source.json", source());

    const receipt = buildQeiBoundReceipt({
      repoRoot: dir,
      regionalSupportAtlasPath: atlasPath,
      sourceFullTensorPath: sourcePath,
      outPath: "receipt.json",
      boundModelKind: "ford_roman_lorentzian",
      boundSI: 0,
      boundProvenanceRef: "ford_roman_1996_quantum_inequality",
      tauSeconds: 1e-10,
      tauSourceRef: "sampling-policy.json#tau",
      samplingKind: "lorentzian",
      samplingNormalized: true,
      dutyCycle: 0.5,
      dutyCycleSourceRef: "tile-duty.json#dutyCycle",
      modulationSeconds: 1e-6,
      modulationSourceRef: "drive-modulation.json#period",
      qftStateRef: "qft-state.json",
      renormalizationConventionRef: "renormalization.json",
      stationaryWorldlineAssumption: true,
      auditOnly: true,
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.blockers).toEqual([]);
    expect(receipt.tauPolicy.tauVsLightCrossing).toBe("pass");
    expect(receipt.atlasHash).toBe("qei-bound-atlas-hash");
    expect(receipt.tensorRef).toBe("nhm2_tile_effective_full_tensor_source");
  });

  it("keeps declared reduced-order bounds out of physical-proof status", () => {
    const dir = mkdtempSync(join(tmpdir(), "nhm2-qei-bound-"));
    const atlasPath = writeJson(dir, "atlas.json", atlas());
    const sourcePath = writeJson(dir, "source.json", source());

    const receipt = buildQeiBoundReceipt({
      repoRoot: dir,
      regionalSupportAtlasPath: atlasPath,
      sourceFullTensorPath: sourcePath,
      outPath: "receipt.json",
      boundModelKind: "declared_reduced_order",
      boundSI: 0,
      boundProvenanceRef: "declared-qei-bound.json",
      tauSeconds: 1e-10,
      tauSourceRef: "sampling-policy.json#tau",
      samplingKind: "gaussian",
      samplingNormalized: true,
      dutyCycle: 0.5,
      dutyCycleSourceRef: "tile-duty.json#dutyCycle",
      modulationSeconds: 1e-6,
      modulationSourceRef: "drive-modulation.json#period",
      qftStateRef: "qft-state.json",
      renormalizationConventionRef: "renormalization.json",
      stationaryWorldlineAssumption: true,
      auditOnly: true,
    });

    expect(receipt.status).toBe("review");
    expect(receipt.bound.status).toBe("declared_reduced_order");
    expect(receipt.blockers).toContain("qei_bound_model_not_physical_qft_receipt");
    expect(receipt.warnings).toContain("qei_bound_declared_reduced_order_only");
    expect(receipt.claimBoundary.qeiBoundReceiptDoesNotProvePhysicalViability).toBe(true);
  });
});
