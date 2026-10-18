import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import type { Nhm2RegionalTensor } from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import {
  isNhm2RegionalSourceTransitionKernel,
} from "../shared/contracts/nhm2-regional-source-transition-kernel.v1";
import { buildNhm2TileEffectiveFullTensorSourceArtifact } from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import { buildRegionalSourceTransitionKernel } from "../tools/nhm2/build-regional-source-transition-kernel";
import { buildRegionalSupportFunctionAtlas } from "../tools/nhm2/build-regional-support-function-atlas";
import { publishTileCounterpartConservation } from "../tools/nhm2/publish-tile-counterpart-conservation";

const profile = "stage1_centerline_alpha_0p995_v1";

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
  T01: value * 1e-6,
  T02: -value * 5e-7,
  T03: value * 2e-7,
  T10: value * 1e-6,
  T11: value * 0.02,
  T12: -value * 1e-3,
  T13: value * 5e-4,
  T20: -value * 5e-7,
  T21: -value * 1e-3,
  T22: value * 0.02,
  T23: -value * 3e-4,
  T30: value * 2e-7,
  T31: value * 5e-4,
  T32: -value * 3e-4,
  T33: value * 0.02,
});

const sourceRegion = (
  regionId: "global" | "hull" | "wall" | "exterior_shell",
  value: number,
) => ({
  regionId,
  status: "pass" as const,
  tensorAuthorityMode: "full_tensor" as const,
  tensor: tensor(value),
  symmetry: {
    declared: true,
    kind: "symmetric" as const,
    lowerComponentsDerivedBySymmetry: false,
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

const sourceArtifact = () =>
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
      sourceRegion("global", 10),
      sourceRegion("hull", 10),
      sourceRegion("wall", 100),
      sourceRegion("exterior_shell", 100),
    ],
    literatureRefs: ["fewster_thompson_2023_stationary_worldline_qei"],
  });

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-transition-kernel-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    writeFileSync(join(root, "source.json"), JSON.stringify(sourceArtifact()), "utf8");
    buildRegionalSupportFunctionAtlas({
      repoRoot: root,
      referenceRunPath: "reference.json",
      tileFullTensorSourcePath: "source.json",
      outPath: "atlas.json",
    });
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("nhm2 regional source transition kernel", () => {
  it("builds source-side smoothing kernels without metric target refs", () =>
    withTemp((root) => {
      const kernel = buildRegionalSourceTransitionKernel({
        repoRoot: root,
        tileFullTensorSourcePath: "source.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "kernel.json",
      });
      const hullWall = kernel.interfaces.find((entry) => entry.interfaceId === "hull_wall");

      expect(isNhm2RegionalSourceTransitionKernel(kernel)).toBe(true);
      expect(kernel.summary.maxRawJumpLInf).toBeGreaterThan(0.1);
      expect(kernel.summary.maxPostKernelJumpLInf).toBeLessThanOrEqual(0.1);
      expect(kernel.summary.allInterfacesWithinTolerance).toBe(true);
      expect(kernel.claimBoundary.doesNotAlterRegionalClosureResiduals).toBe(true);
      expect(kernel.claimBoundary.transitionKernelDoesNotProveLocalCovariantConservation).toBe(true);
      expect(hullWall?.dominantComponentId).toBe("T00");
      expect(hullWall?.smoothingWeight).toBeGreaterThan(0);
      expect(kernel.sourceTensorRef).toBe("source.json");
      expect(kernel.atlasRef).toBe("atlas.json");
      expect(kernel.atlasHash).toMatch(/^[a-f0-9]{64}$/);
      expect(kernel.claimBoundary.metricEchoForbidden).toBe(true);
    }));

  it("lets conservation report pre/post transition residuals while clearing the reduced-order jump gate", () =>
    withTemp((root) => {
      const withoutKernel = publishTileCounterpartConservation({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileFullTensorSourcePath: "source.json",
        outPath: "conservation.raw.json",
      });
      const kernel = buildRegionalSourceTransitionKernel({
        repoRoot: root,
        tileFullTensorSourcePath: "source.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "kernel.json",
      });
      const withKernel = publishTileCounterpartConservation({
        repoRoot: root,
        referenceRunPath: "reference.json",
        tileFullTensorSourcePath: "source.json",
        transitionKernelPath: "kernel.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "conservation.smoothed.json",
      });
      const hull = withKernel.regions.find((entry) => entry.regionId === "hull");

      expect(withoutKernel.overallState).toBe("fail");
      expect(withKernel.overallState).toBe("pass");
      expect(withKernel.derivativeStencil).toBe(
        "regional_jump_linf_with_transition_kernel_v1",
      );
      expect(hull?.preTransitionResidualLInf).toBeGreaterThan(0.1);
      expect(hull?.postTransitionResidualLInf).toBeLessThanOrEqual(0.1);
      expect(hull?.transitionKernelRef).toBe("kernel.json");
      expect(withKernel.atlasRef).toBe("atlas.json");
      expect(withKernel.atlasHash).toBe(kernel.atlasHash);
      expect(hull?.transitionSmoothingWeight).toBeGreaterThan(0);
      expect(withKernel.claimEffect).toBe("conservation_candidate");
      expect(withKernel.promotionAllowed).toBe(false);
      expect(kernel.claimBoundary.diagnosticOnly).toBe(true);
    }));

  it("rejects a transition kernel built from a stale atlas hash", () =>
    withTemp((root) => {
      const kernel = buildRegionalSourceTransitionKernel({
        repoRoot: root,
        tileFullTensorSourcePath: "source.json",
        regionalSupportAtlasPath: "atlas.json",
        outPath: "kernel.json",
      });
      writeFileSync(
        join(root, "kernel.json"),
        JSON.stringify({ ...kernel, atlasHash: "stale-atlas-hash" }),
        "utf8",
      );

      expect(() =>
        publishTileCounterpartConservation({
          repoRoot: root,
          referenceRunPath: "reference.json",
          tileFullTensorSourcePath: "source.json",
          transitionKernelPath: "kernel.json",
          regionalSupportAtlasPath: "atlas.json",
          outPath: "conservation.smoothed.json",
        }),
      ).toThrow(/atlasHash does not match/);
    }));
});
