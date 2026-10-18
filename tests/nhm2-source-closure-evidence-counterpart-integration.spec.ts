import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import { publishRegionalSourceClosureEvidence } from "../tools/nhm2/publish-regional-source-closure-evidence";
import { publishTileEffectiveCounterpart } from "../tools/nhm2/publish-tile-effective-counterpart";
import { classifySourceToGeometryDivergence } from "../tools/nhm2/report-source-to-geometry-divergence";
import { validateNhm2ReferenceRun } from "../tools/nhm2/validate-reference-run";

const profile = "stage1_centerline_alpha_0p995_v1";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "integration-run",
    repo: { repositoryFullName: "local/casimirbot", branch: "main", commitSha: "abc", dirtyTreeStatus: "dirty" },
    selectedFamily: { laneId: "nhm2_shift_lapse", selectedProfileId: profile, expectedProfileId: profile, profileMatch: true },
    claimLock: { currentClaimTier: "diagnostic", maximumClaimTier: "reduced-order", validationMode: "red_team_hardening", validationClaimAllowed: false, latestAliasForbidden: true },
    commands: [],
    artifactSet: [],
    hashLock: { inputManifestSha256: null, toleranceManifestSha256: null, artifactSetSha256: null, literatureClaimMapSha256: null },
    blockerSummary: { overallState: "review", blockingReasons: [], observerConsistencyStatus: "unknown", sourceClosureRegionalStatus: "unknown", qeiDossierStatus: "missing", reproducibilityStatus: "missing" },
  });

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

const sourceRegion = (
  regionId: "hull" | "wall" | "exterior_shell",
  role: "tile_effective_counterpart" | "gr_matter_channel_observation" = "tile_effective_counterpart",
  tileValue = 10,
) => ({
  regionId,
  status: "pass",
  metricRequiredTensor: tensor(10),
  tileEffectiveTensor: tensor(tileValue),
  residualNorms: {
    relLInf: Math.abs(tileValue - 10) / 10,
    absLInf: Math.abs(tileValue - 10),
    toleranceRelLInf: 0.1,
    pass: tileValue === 10,
  },
  metricAccounting: { sampleCount: 10, aggregationMode: "mean", normalizationBasis: "sample_count" },
  tileAccounting: { sampleCount: 10, aggregationMode: "mean", normalizationBasis: "sample_count" },
  tileT00Diagnostics: {
    trace: {
      regionMaskRef: `mask.${regionId}`,
      tensorRef: `tile.${regionId}`,
      pathFacts: {
        comparisonRole: role,
        producerModule: "tile-model.ts",
        producerFunction: "emit",
        inputFieldRef: `tile.input.${regionId}`,
        unitsRef: "J/m^3",
        maskClassifierRef: `mask.${regionId}`,
      },
    },
  },
});

const sourceClosure = (
  role: "tile_effective_counterpart" | "gr_matter_channel_observation" = "tile_effective_counterpart",
  tileValue = 10,
) => ({
  artifactId: "nhm2_source_closure",
  schemaVersion: "nhm2_source_closure/v2",
  status: "pass",
  tensors: { metricRequired: tensor(10), tileEffective: tensor(tileValue) },
  tensorRefs: { metricRequired: "metric.global", tileEffective: "tile.global" },
  globalAccounting: {
    metric: { sampleCount: 10, aggregationMode: "mean", normalizationBasis: "sample_count" },
    tile: { sampleCount: 10, aggregationMode: "mean", normalizationBasis: "sample_count" },
  },
  regionComparisons: {
    regions: [
      sourceRegion("hull", role, tileValue),
      sourceRegion("wall", role, tileValue),
      sourceRegion("exterior_shell", role, tileValue),
    ],
  },
});

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-counterpart-integration-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("regional source-closure evidence counterpart integration", () => {
  it("uses the explicit tile counterpart artifact when supplied", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure()), "utf8");
      publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "tile.json" });
      const evidence = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        tileEffectiveCounterpartPath: "tile.json",
        outPath: "evidence.json",
      });

      expect(evidence.regions.every((region) => region.tileEffectiveCounterpart.tensorRef?.startsWith("nhm2_tile_effective_counterpart"))).toBe(true);
      expect(evidence.regions.every((region) => region.tileEffectiveCounterpart.comparisonRole === "tile_effective_counterpart")).toBe(true);
    }));

  it("refuses gr_matter_channel_observation as a counterpart", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure("gr_matter_channel_observation")), "utf8");
      const evidence = publishRegionalSourceClosureEvidence({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "evidence.json" });

      expect(evidence.overallState).not.toBe("pass");
      expect(evidence.regions.find((region) => region.regionId === "hull")?.tileEffectiveCounterpart.comparisonRole).toBe("gr_matter_channel_observation");
    }));

  it("moves the first divergence boundary after a counterpart artifact is supplied", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure("gr_matter_channel_observation", 12)), "utf8");
      const diagnostic = publishRegionalSourceClosureEvidence({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "diagnostic.json" });

      writeFileSync(join(root, "source-counterpart.json"), JSON.stringify(sourceClosure("tile_effective_counterpart", 12)), "utf8");
      publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source-counterpart.json", outPath: "tile.json" });
      const evidence = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source-counterpart.json",
        tileEffectiveCounterpartPath: "tile.json",
        outPath: "evidence.json",
      });

      expect(classifySourceToGeometryDivergence(diagnostic.regions.find((region) => region.regionId === "hull")!)).toBe("counterpart_missing");
      expect(classifySourceToGeometryDivergence(evidence.regions.find((region) => region.regionId === "hull")!)).toBe("residual_exceeded");
    }));

  it("retires stale legacy counterpart blockers when the explicit counterpart supplies matching tensors", () =>
    withTemp((root) => {
      const staleClosure = sourceClosure("gr_matter_channel_observation", 12) as any;
      staleClosure.status = "fail";
      for (const region of staleClosure.regionComparisons.regions) {
        region.status = "fail";
        region.reasonCodes = ["counterpart_missing", "legacy_residual_exceeded"];
        region.comparisonBasisAuthorityStatus = "counterpart_missing";
        region.counterpartResolutionStatus = "missing";
      }
      writeFileSync(join(root, "source.json"), JSON.stringify(staleClosure), "utf8");

      writeFileSync(
        join(root, "source-counterpart.json"),
        JSON.stringify(sourceClosure("tile_effective_counterpart", 10)),
        "utf8",
      );
      publishTileEffectiveCounterpart({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source-counterpart.json",
        outPath: "tile.json",
      });
      const evidence = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        tileEffectiveCounterpartPath: "tile.json",
        outPath: "evidence.json",
      });
      const hull = evidence.regions.find((region) => region.regionId === "hull");

      expect(hull?.blockers).not.toContain("counterpart_missing");
      expect(hull?.blockers).not.toContain("legacy_residual_exceeded");
      expect(hull?.residuals.pass).toBe(true);
      expect(hull?.status).toBe("pass");
      expect(evidence.overallState).not.toBe("fail");
    }));

  it("reference-run validation fails if regional evidence ignores the explicit counterpart artifact", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure()), "utf8");
      const tile = publishTileEffectiveCounterpart({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "tile.json" });
      const legacyEvidence = publishRegionalSourceClosureEvidence({ repoRoot: root, referenceRunPath: "reference.json", sourceClosurePath: "source.json", outPath: "legacy-evidence.json" });
      const validation = validateNhm2ReferenceRun({
        referenceRun: referenceRun(),
        regionalSourceClosureEvidence: legacyEvidence,
        tileEffectiveCounterpart: tile,
      });

      const gate = validation.gates.find((entry) => entry.gateId === "GATE_SOURCE_CLOSURE_EVIDENCE_USES_COUNTERPART");
      expect(gate?.state).toBe("fail");
      expect(gate?.reasonCodes).toContain("global_source_evidence_uses_legacy_or_missing_counterpart");
    }));
});
