import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import type { Nhm2RegionalTensor } from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import {
  buildNhm2TileCounterpartConservationArtifact,
  isNhm2TileCounterpartConservationArtifact,
} from "../shared/contracts/nhm2-tile-counterpart-conservation.v1";
import { buildNhm2TileEffectiveFullTensorSourceArtifact } from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import { publishTileCounterpartConservation } from "../tools/nhm2/publish-tile-counterpart-conservation";

const profile = "stage1_centerline_alpha_0p995_v1";
const conservationRegion = (regionId: "global" | "hull" | "wall" | "exterior_shell", overrides = {}) => ({
  regionId,
  status: "pass" as const,
  divTResidualLInf: 0.01,
  continuityResidualLInf: 0.01,
  momentumResidualLInf: 0.01,
  toleranceLInf: 0.1,
  sampleCount: 10,
  blockers: [],
  ...overrides,
});

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "run-1",
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

const tensor = (value: number): Nhm2RegionalTensor => ({
  T00: -value,
  T01: 0,
  T02: 0,
  T03: 0,
  T11: value * 0.02,
  T12: 0,
  T13: 0,
  T22: value * 0.02,
  T23: 0,
  T33: value * 0.02,
});

const sourceRegion = (
  regionId: "global" | "hull" | "wall" | "exterior_shell",
  value: number,
) => ({
  regionId,
  status: "pass" as const,
  tensorAuthorityMode: "symmetric_full_tensor" as const,
  tensor: tensor(value),
  symmetry: {
    declared: true,
    kind: "symmetric" as const,
    lowerComponentsDerivedBySymmetry: true,
  },
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `mask.${regionId}`,
  aggregationMode: "mean" as const,
  normalizationBasis: "sample_count" as const,
  sampleCount: 12,
  sourceSupport: {
    supportKernelId: "support.v1",
    cycleAverageStatus: "pass" as const,
    dutyCycleStatus: "pass" as const,
    lightCrossingConsistencyStatus: "pass" as const,
  },
  provenance: {
    producerModule: "tile-source",
    producerFunction: "emit",
    derivationMode: "source_model_reconstituted_full_tensor" as const,
    inputRefs: [`source.${regionId}`],
    preAggregationValueRefs: [`source.pre.${regionId}`],
    notDerivedFromMetricRequiredTensor: true,
  },
  blockers: [],
});

const sourceArtifact = (values: {
  global: number;
  hull: number;
  wall: number;
  exterior_shell: number;
}) =>
  buildNhm2TileEffectiveFullTensorSourceArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    runId: "run-1",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceModel: {
      sourceModelId: "tile-source.v1",
      sourceModelVersion: "v1",
      sourceModelClass: "reconstituted_from_source_channels",
      sourceSideOnly: true,
      notDerivedFromMetricRequiredTensor: true,
      metricRequiredInputRefs: [],
      sourceInputRefs: ["source-input.json"],
      qeiDossierRef: null,
      conservationRef: null,
    },
    regions: [
      sourceRegion("global", values.global),
      sourceRegion("hull", values.hull),
      sourceRegion("wall", values.wall),
      sourceRegion("exterior_shell", values.exterior_shell),
    ],
    literatureRefs: ["fewster_thompson_2023_stationary_worldline_qei"],
  });

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-tile-conservation-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("nhm2 tile counterpart conservation contract", () => {
  it("accepts pass-level conservation diagnostics", () => {
    const artifact = buildNhm2TileCounterpartConservationArtifact({
      runId: "run-1",
      selectedProfileId: profile,
      expectedProfileId: profile,
      laneId: "nhm2_shift_lapse",
      chartRef: "comoving_cartesian",
      derivativeStencil: "central_difference_v1",
      unitsRef: "J/m^3/m",
      regions: [conservationRegion("global"), conservationRegion("hull"), conservationRegion("wall"), conservationRegion("exterior_shell")],
    });
    expect(artifact.overallState).toBe("pass");
    expect(artifact.promotionAllowed).toBe(false);
    expect(isNhm2TileCounterpartConservationArtifact(artifact)).toBe(true);
  });

  it("marks missing residuals as review", () => {
    const artifact = buildNhm2TileCounterpartConservationArtifact({
      runId: "run-1",
      selectedProfileId: profile,
      expectedProfileId: profile,
      laneId: "nhm2_shift_lapse",
      chartRef: "comoving_cartesian",
      derivativeStencil: "not_computed",
      unitsRef: "J/m^3/m",
      regions: [conservationRegion("global", { divTResidualLInf: null }), conservationRegion("hull"), conservationRegion("wall"), conservationRegion("exterior_shell")],
    });
    expect(artifact.overallState).toBe("review");
    expect(artifact.reasonCodes).toContain("global:divT_residual_missing");
  });

  it("fails residuals above tolerance", () => {
    const artifact = buildNhm2TileCounterpartConservationArtifact({
      runId: "run-1",
      selectedProfileId: profile,
      expectedProfileId: profile,
      laneId: "nhm2_shift_lapse",
      chartRef: "comoving_cartesian",
      derivativeStencil: "central_difference_v1",
      unitsRef: "J/m^3/m",
      regions: [conservationRegion("global"), conservationRegion("hull", { divTResidualLInf: 2 }), conservationRegion("wall"), conservationRegion("exterior_shell")],
    });
    expect(artifact.overallState).toBe("fail");
    expect(artifact.reasonCodes).toContain("hull:conservation_residual_exceeded");
  });

  it("publishes pass-level normalized regional jump diagnostics for smooth tensors", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "source.json"),
        JSON.stringify(
          sourceArtifact({
            global: 10,
            hull: 10,
            wall: 10,
            exterior_shell: 10,
          }),
        ),
        "utf8",
      );

      const artifact = publishTileCounterpartConservation({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileFullTensorSourcePath: "source.json",
        outPath: "conservation.json",
      });

      expect(artifact.overallState).toBe("pass");
      expect(artifact.derivativeStencil).toBe("regional_jump_linf_v1");
      expect(artifact.unitsRef).toBe("dimensionless_normalized_tensor_jump");
      expect(artifact.reasonCodes).toEqual([]);
      expect(artifact.regions.every((region) => region.blockers.length === 0)).toBe(true);
      expect(artifact.regions.every((region) => region.divTResidualLInf === 0)).toBe(true);
      expect(isNhm2TileCounterpartConservationArtifact(artifact)).toBe(true);
    }));

  it("fails regional tensor jumps above tolerance with a concrete hotspot", () =>
    withTemp((root) => {
      writeFileSync(
        join(root, "source.json"),
        JSON.stringify(
          sourceArtifact({
            global: 10,
            hull: 10,
            wall: 100,
            exterior_shell: 100,
          }),
        ),
        "utf8",
      );

      const artifact = publishTileCounterpartConservation({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileFullTensorSourcePath: "source.json",
        outPath: "conservation.json",
      });
      const hull = artifact.regions.find((entry) => entry.regionId === "hull");
      const wall = artifact.regions.find((entry) => entry.regionId === "wall");

      expect(artifact.overallState).toBe("fail");
      expect(artifact.reasonCodes).toContain("hull:conservation_residual_exceeded");
      expect(hull?.divTResidualLInf).toBeGreaterThan(0.1);
      expect(hull?.dominantComponentId).toBe("T00");
      expect(hull?.maxHotspotRef).toBe("hull<->wall:T00");
      expect(wall?.blockers).toContain("conservation_residual_exceeded");
      expect(isNhm2TileCounterpartConservationArtifact(artifact)).toBe(true);
    }));
});
