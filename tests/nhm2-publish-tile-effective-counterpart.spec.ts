import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import { publishTileEffectiveCounterpart } from "../tools/nhm2/publish-tile-effective-counterpart";

const profile = "stage1_centerline_alpha_0p995_v1";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "run-1",
    repo: { repositoryFullName: "local/casimirbot", branch: "main", commitSha: "abc", dirtyTreeStatus: "dirty" },
    selectedFamily: { laneId: "nhm2_shift_lapse", selectedProfileId: profile, expectedProfileId: profile, profileMatch: true },
    claimLock: { currentClaimTier: "diagnostic", maximumClaimTier: "reduced-order", validationMode: "red_team_hardening", validationClaimAllowed: false, latestAliasForbidden: true },
    commands: [],
    artifactSet: [],
    hashLock: { inputManifestSha256: null, toleranceManifestSha256: null, artifactSetSha256: null, literatureClaimMapSha256: null },
    blockerSummary: { overallState: "review", blockingReasons: [], observerConsistencyStatus: "unknown", sourceClosureRegionalStatus: "unknown", qeiDossierStatus: "missing", reproducibilityStatus: "missing" },
  });

const tensor = (value: number, full = true) => ({
  T00: -value,
  ...(full ? { T01: 0, T02: 0, T03: 0, T10: 0 } : {}),
  T11: value,
  ...(full ? { T12: 0, T13: 0, T20: 0, T21: 0 } : {}),
  T22: value,
  ...(full ? { T23: 0, T30: 0, T31: 0, T32: 0 } : {}),
  T33: value,
});

const sourceRegion = (
  regionId: "hull" | "wall" | "exterior_shell",
  role = "tile_effective_counterpart",
  full = true,
) => ({
  regionId,
  status: "pass",
  metricRequiredTensor: tensor(10, true),
  tileEffectiveTensor: tensor(10, full),
  tileAccounting: { sampleCount: 10, aggregationMode: "mean", normalizationBasis: "sample_count" },
  tileT00Diagnostics: {
    trace: {
      regionMaskRef: `mask.${regionId}`,
      tensorRef: role === "metric_echo_diagnostic_only" ? `copied_from_metric_required.${regionId}` : `tile.${regionId}`,
      pathFacts: {
        comparisonRole: role,
        producerModule: "tile-model.ts",
        producerFunction: "emit",
        inputFieldRef: `tile.input.${regionId}`,
        preAggregationValueRef: `tile.pre.${regionId}`,
        unitsRef: "J/m^3",
        maskClassifierRef: `mask.${regionId}`,
      },
    },
  },
});

const sourceClosure = (role = "tile_effective_counterpart", full = true) => ({
  artifactId: "nhm2_source_closure",
  schemaVersion: "nhm2_source_closure/v2",
  status: "pass",
  tensors: { metricRequired: tensor(10, true), tileEffective: tensor(10, full) },
  tensorRefs: { metricRequired: "metric.global", tileEffective: "tile.global" },
  globalAccounting: {
    tile: { sampleCount: 10, aggregationMode: "mean", normalizationBasis: "sample_count" },
  },
  regionComparisons: {
    regions: [
      sourceRegion("hull", role, full),
      sourceRegion("wall", role, full),
      sourceRegion("exterior_shell", role, full),
    ],
  },
});

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-tile-counterpart-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("publish tile-effective counterpart", () => {
  it("legacy gr_matter_channel_observation becomes review, not pass", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure("gr_matter_channel_observation")), "utf8");
      const artifact = publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "out.json" });

      expect(artifact.overallState).toBe("review");
      expect(artifact.regions.find((region) => region.regionId === "hull")?.comparisonRole).toBe("gr_matter_channel_observation");
    }));

  it("metric-derived copy becomes fail with metric_echo_not_source_closure", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure("metric_echo_diagnostic_only")), "utf8");
      const artifact = publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "out.json" });

      expect(artifact.overallState).toBe("fail");
      expect(artifact.reasonCodes).toContain("hull:metric_echo_not_source_closure");
    }));

  it("diagonal proxy becomes review with full tensor authority missing", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure("tile_effective_counterpart", false)), "utf8");
      const artifact = publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "out.json" });

      expect(artifact.overallState).toBe("review");
      expect(artifact.reasonCodes).toContain("hull:full_tensor_authority_missing");
    }));

  it("full tensor same-basis tile counterpart emits tile_effective_counterpart role", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure()), "utf8");
      const artifact = publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "out.json" });

      expect(artifact.regions.find((region) => region.regionId === "wall")?.comparisonRole).toBe("tile_effective_counterpart");
    }));

  it("audit-only allows latest while validation mode rejects it", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source-latest.json"), JSON.stringify(sourceClosure()), "utf8");
      expect(() =>
        publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source-latest.json", outPath: "out.json" }),
      ).toThrow(/latest aliases are forbidden/);
      expect(
        publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source-latest.json", outPath: "out.json", auditOnly: true }).artifactId,
      ).toBe("nhm2_tile_effective_counterpart");
    }));
});
