import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildCasimirMaterialReceipt } from "../shared/contracts/casimir-material-receipt.v1";
import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import {
  buildNhm2TileLocalSourceElementsArtifact,
  isNhm2TileLocalSourceElementsArtifact,
  type Nhm2TileLocalSourceElementV1,
} from "../shared/contracts/nhm2-tile-local-source-element.v1";
import type { Nhm2RegionalTensor } from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2SourceSideSameBasisTensorAuthorityArtifact } from "../shared/contracts/nhm2-source-side-same-basis-tensor-authority.v1";
import { aggregateTileLocalSourceToRegionalCounterpart } from "../tools/nhm2/aggregate-tile-local-source-to-regional-counterpart";
import { buildLayeredWallSourceCandidate } from "../tools/nhm2/build-layered-wall-source-candidate";
import { buildTileLocalSourceElementsFromCavityContract } from "../tools/nhm2/build-tile-local-source-elements";
import { buildWallMaterialSourceTensorModel } from "../tools/nhm2/build-wall-material-source-tensor-model";
import { buildWallSourceLayeringSweep } from "../tools/nhm2/build-wall-source-layering-sweep";
import { buildRegionalMaterialSourceTensorModel } from "../tools/nhm2/build-regional-material-source-tensor-model";

const profile = "stage1_centerline_alpha_0p995_v1";
const generatedAt = "2026-06-12T00:00:00.000Z";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt,
    runId: "tile-local-run",
    repo: {
      repositoryFullName: "local/casimirbot",
      branch: "main",
      commitSha: "abc",
      dirtyTreeStatus: "dirty",
    },
    selectedFamily: {
      laneId: "nhm2_shift_lapse",
      selectedProfileId: profile,
      expectedProfileId: profile,
      profileMatch: true,
    },
    claimLock: {
      currentClaimTier: "diagnostic",
      maximumClaimTier: "reduced-order",
      validationMode: "red_team_hardening",
      validationClaimAllowed: false,
      latestAliasForbidden: true,
    },
    commands: [],
    artifactSet: [],
    hashLock: {
      inputManifestSha256: null,
      toleranceManifestSha256: null,
      artifactSetSha256: null,
      literatureClaimMapSha256: null,
    },
    blockerSummary: {
      overallState: "review",
      blockingReasons: [],
      observerConsistencyStatus: "unknown",
      sourceClosureRegionalStatus: "unknown",
      qeiDossierStatus: "missing",
      reproducibilityStatus: "missing",
    },
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

const wallSourceTensorModel = () => {
  const selected = buildLayeredWallSourceCandidate({
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
  return buildWallMaterialSourceTensorModel({
    generatedAt,
    candidate: selected,
    candidateRef: "candidate.json",
    materialReceipt: materialReceipt(),
    materialReceiptRef: "receipt.json",
    componentModel: {
      modelKind: "lifshitz_wall_tensor",
      basis: "local_wall_orthonormal",
      projection: {
        wallNormalRef: "fixture:wall-normal",
        sameChartProjectionStatus: "pass",
      },
      components: {
        T00: { valueSI: -1.6995e9, status: "material_receipted", provenanceRef: "fixture:T00" },
        T0x: { valueSI: 0, status: "computed", provenanceRef: "fixture:T0x" },
        T0y: { valueSI: 0, status: "computed", provenanceRef: "fixture:T0y" },
        T0z: { valueSI: 0, status: "computed", provenanceRef: "fixture:T0z" },
        Txx: { valueSI: 4.1e7, status: "computed", provenanceRef: "fixture:Txx" },
        Txy: { valueSI: 0, status: "computed", provenanceRef: "fixture:Txy" },
        Txz: { valueSI: 0, status: "computed", provenanceRef: "fixture:Txz" },
        Tyy: { valueSI: 4.1e7, status: "computed", provenanceRef: "fixture:Tyy" },
        Tyz: { valueSI: 0, status: "computed", provenanceRef: "fixture:Tyz" },
        Tzz: { valueSI: 4.1e7, status: "computed", provenanceRef: "fixture:Tzz" },
      },
    },
  });
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

const element = (
  id: string,
  tensor: Nhm2RegionalTensor,
  regionWeights: Nhm2TileLocalSourceElementV1["regionWeights"],
  materialReceiptStatus: Nhm2TileLocalSourceElementV1["material"]["materialReceiptStatus"] = "material_receipted",
): Nhm2TileLocalSourceElementV1 => ({
  tileElementId: id,
  tileBatchId: "batch-1",
  sectorId: "sector-1",
  chartId: "comoving_cartesian",
  positionChartMeters: null,
  normalChart: null,
  areaMeters2: 1e-4,
  gapMeters: 8e-9,
  duty: {
    burstDuty: 0.12,
    shipDuty: 0.12,
    concurrentSectorFraction: 0.025,
    effectiveDuty: 0.00036,
  },
  qFactor: 100000,
  material: {
    materialStack: "fixture",
    materialReceiptRef: "receipt",
    materialReceiptStatus,
  },
  scalarBudget: {
    idealCasimirEnergyPerAreaSI: -0.0008464360497706726,
    idealCasimirEnergyPerTileSI: -8.464360497706727e-8,
    idealGapEnergyDensitySI: -105804.50622133407,
    cycleAveragedT00SI: tensor.T00 ?? null,
    status: "computed",
  },
  localTensor: tensor,
  componentStatus: Object.fromEntries(
    Object.keys(tensor).map((component) => [component, "computed"]),
  ),
  tensorAuthorityMode: "unknown",
  missingComponentIds: [],
  regionWeights,
  provenance: {
    producerModule: "fixture",
    producerFunction: "element",
    sourceModelId: "fixture",
    sourceModelVersion: "v1",
    sourceSideOnly: true,
    notDerivedFromMetricRequiredTensor: true,
    inputRefs: ["fixture"],
    approximationMode: "representative_sector_bin",
  },
  blockers: [],
  warnings: [],
});

const artifactWith = (elements: Nhm2TileLocalSourceElementV1[]) =>
  buildNhm2TileLocalSourceElementsArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "tile-local-run",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceModel: {
      sourceModelId: "fixture",
      sourceModelVersion: "v1",
      sourceSideOnly: true,
      notDerivedFromMetricRequiredTensor: true,
      metricRequiredInputRefs: [],
      sourceInputRefs: ["fixture"],
      approximationMode: "representative_sector_bin",
    },
    tileUnit: {
      areaMeters2: 1e-4,
      gapMeters: 8e-9,
      tileWidthMeters: 0.01,
      tileHeightMeters: 0.01,
      sectorCount: 80,
      concurrentSectors: 2,
      qFactor: 100000,
      dutyCycle: 0.12,
      dutyShip: 0.12,
      modulationFrequencyHz: 15e9,
      materialStack: "fixture",
      idealCasimirEnergyPerAreaSI: -0.0008464360497706726,
      idealCasimirEnergyPerTileSI: -8.464360497706727e-8,
      idealGapEnergyDensitySI: -105804.50622133407,
    },
    elements,
  });

describe("NHM2 tile-local source elements", () => {
  it("derives the frozen 10 mm x 10 mm tile unit from the cavity contract", () => {
    const artifact = buildTileLocalSourceElementsFromCavityContract({
      runId: "tile-local-run",
      selectedProfileId: profile,
      expectedProfileId: profile,
    });

    expect(artifact.tileUnit.areaMeters2).toBeCloseTo(1e-4, 12);
    expect(artifact.tileUnit.gapMeters).toBeCloseTo(8e-9, 16);
    expect(artifact.tileUnit.idealCasimirEnergyPerTileSI).toBeCloseTo(
      -8.464360497706727e-8,
      16,
    );
    expect(artifact.summary.anyMissingMaterialReceipt).toBe(true);
    expect(artifact.claimBoundary.idealScalarBudgetIsNotMaterialReceipt).toBe(true);
    expect(isNhm2TileLocalSourceElementsArtifact(artifact)).toBe(true);
  });

  it("aggregates scalar tile-local elements without pretending missing components are zero", () => {
    const artifact = buildTileLocalSourceElementsFromCavityContract({
      runId: "tile-local-run",
      selectedProfileId: profile,
      expectedProfileId: profile,
    });
    const counterpart = aggregateTileLocalSourceToRegionalCounterpart({
      referenceRun: referenceRun(),
      tileLocalSourceElements: artifact,
      tileLocalSourceElementsRef: "tile-local.json",
    });
    const wall = counterpart.regions.find((region) => region.regionId === "wall");

    expect(wall?.comparisonRole).toBe("tile_effective_counterpart");
    expect(wall?.tensor.T00).toBeTypeOf("number");
    expect(wall?.tensor.T01).toBeUndefined();
    expect(wall?.tensorAuthorityMode).toBe("proxy");
    expect(wall?.blockers).toContain("full_tensor_authority_missing");
  });

  it("uses a wall material source tensor model to produce non-proxy wall counterpart authority", () => {
    const artifact = buildTileLocalSourceElementsFromCavityContract({
      runId: "tile-local-run",
      selectedProfileId: profile,
      expectedProfileId: profile,
      materialReceipt: materialReceipt(),
      wallMaterialSourceTensorModel: wallSourceTensorModel(),
      wallMaterialSourceTensorModelRef: "wall-source-tensor-model.json",
    });
    const counterpart = aggregateTileLocalSourceToRegionalCounterpart({
      referenceRun: referenceRun(),
      tileLocalSourceElements: artifact,
      tileLocalSourceElementsRef: "tile-local.json",
    });
    const authority = buildNhm2SourceSideSameBasisTensorAuthorityArtifact({
      generatedAt,
      laneId: "nhm2_shift_lapse",
      selectedProfileId: profile,
      chartId: "comoving_cartesian",
      sourceModelId: "nhm2_wall_material_source_tensor_model",
      counterpartArtifactRef: "tile-counterpart.json",
      counterpartArtifact: counterpart,
      casimirMaterialReceipt: materialReceipt(),
      requiredRegionIds: ["wall"],
    });
    const wall = counterpart.regions.find((region) => region.regionId === "wall");

    expect(wall?.comparisonRole).toBe("tile_effective_counterpart");
    expect(wall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
    expect(wall?.tensor.T01).toBe(0);
    expect(wall?.tensor.T12).toBe(0);
    expect(wall?.blockers).toEqual([]);
    expect(authority.summary.hasWallAuthority).toBe(true);
    expect(authority.summary.allRequiredRegionsAuthoritative).toBe(true);
  });

  it("preserves an explicit regional global source row instead of averaging representative regions", () => {
    const componentModel = JSON.parse(
      readFileSync("fixtures/nhm2/regional-source-components.tuned-v1.json", "utf8"),
    );
    const receipt = materialReceipt();
    const regionalModel = buildRegionalMaterialSourceTensorModel({
      generatedAt,
      componentModel,
      materialReceipt: receipt,
      materialReceiptRef: "receipt.json",
      sourceModelRef: "fixtures/nhm2/regional-source-components.tuned-v1.json",
    });
    const artifact = buildTileLocalSourceElementsFromCavityContract({
      runId: "tile-local-run",
      selectedProfileId: profile,
      expectedProfileId: profile,
      materialReceipt: receipt,
      regionalMaterialSourceTensorModel: regionalModel,
      regionalMaterialSourceTensorModelRef: "regional-source-model.json",
    });
    const globalElement = artifact.elements.find(
      (entry) => entry.tileElementId === "nhm2_tile_local_source:global:representative_sector_bin",
    );
    const hullElement = artifact.elements.find(
      (entry) => entry.tileElementId === "nhm2_tile_local_source:hull:representative_sector_bin",
    );
    const counterpart = aggregateTileLocalSourceToRegionalCounterpart({
      referenceRun: referenceRun(),
      tileLocalSourceElements: artifact,
      tileLocalSourceElementsRef: "tile-local.json",
    });
    const global = counterpart.regions.find((region) => region.regionId === "global");

    expect(globalElement?.sectorId).toBe("explicit_global_source_row");
    expect(globalElement?.regionWeights).toEqual({ global: 1 });
    expect(hullElement?.regionWeights.global).toBeUndefined();
    expect(global?.tensor.T00).toBe(-58267451);
    expect(global?.sampleCount).toBe(1);
    expect(global?.provenance.derivationMode).toBe("explicit_global_source_row");
    expect(global?.provenance.notDerivedFromMetricRequiredTensor).toBe(true);
  });

  it("keeps diagonal-only local tensors non-authoritative because T0i and off-diagonal Tij are missing", () => {
    const artifact = artifactWith([
      element("wall-diagonal", { T00: -10, T11: 10, T22: 10, T33: 10 }, {
        global: 1,
        wall: 1,
      }),
      element("hull-full", fullTensor(10), { global: 1, hull: 1 }),
      element("exterior-full", fullTensor(10), { global: 1, exterior_shell: 1 }),
    ]);
    const counterpart = aggregateTileLocalSourceToRegionalCounterpart({
      referenceRun: referenceRun(),
      tileLocalSourceElements: artifact,
      tileLocalSourceElementsRef: "tile-local.json",
    });
    const authority = buildNhm2SourceSideSameBasisTensorAuthorityArtifact({
      generatedAt: "2026-06-12T00:00:00.000Z",
      laneId: "nhm2_shift_lapse",
      selectedProfileId: profile,
      chartId: "comoving_cartesian",
      sourceModelId: "fixture",
      counterpartArtifactRef: "tile-counterpart.json",
      counterpartArtifact: counterpart,
    });

    expect(counterpart.regions.find((region) => region.regionId === "wall")?.tensorAuthorityMode).toBe(
      "diagonal_reduced_order",
    );
    expect(authority.summary.hasWallAuthority).toBe(false);
    expect(authority.regions.find((region) => region.regionId === "wall")?.status).toBe(
      "proxy_limited",
    );
  });

  it("marks missing wall region weights as missing counterpart evidence", () => {
    const artifact = artifactWith([
      element("hull-full", fullTensor(10), { global: 1, hull: 1 }),
      element("exterior-full", fullTensor(10), { global: 1, exterior_shell: 1 }),
    ]);
    const counterpart = aggregateTileLocalSourceToRegionalCounterpart({
      referenceRun: referenceRun(),
      tileLocalSourceElements: artifact,
      tileLocalSourceElementsRef: "tile-local.json",
    });
    const wall = counterpart.regions.find((region) => region.regionId === "wall");

    expect(wall?.status).toBe("missing");
    expect(wall?.blockers).toContain("tile_local_source_region_weight_missing");
  });
});
