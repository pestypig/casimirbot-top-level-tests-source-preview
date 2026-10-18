import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildNhm2QeiWorldlineDossier } from "../shared/contracts/nhm2-qei-worldline-dossier.v1";
import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import { buildNhm2TileCounterpartConservationArtifact } from "../shared/contracts/nhm2-tile-counterpart-conservation.v1";
import { publishTileEffectiveCounterpart } from "../tools/nhm2/publish-tile-effective-counterpart";
import { publishTileEffectiveFullTensorSource } from "../tools/nhm2/publish-tile-effective-full-tensor-source";

const profile = "stage1_centerline_alpha_0p995_v1";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    runId: "run-1",
    repo: { repositoryFullName: "local/casimirbot", branch: "main", commitSha: "abc", dirtyTreeStatus: "dirty" },
    selectedFamily: { laneId: "nhm2_shift_lapse", selectedProfileId: profile, expectedProfileId: profile, profileMatch: true },
    claimLock: { currentClaimTier: "diagnostic", maximumClaimTier: "reduced-order", validationMode: "red_team_hardening", validationClaimAllowed: false, latestAliasForbidden: true },
    commands: [],
    artifactSet: [],
    hashLock: { inputManifestSha256: null, toleranceManifestSha256: null, artifactSetSha256: null, literatureClaimMapSha256: null },
    blockerSummary: { overallState: "review", blockingReasons: [], observerConsistencyStatus: "unknown", sourceClosureRegionalStatus: "unknown", qeiDossierStatus: "missing", reproducibilityStatus: "missing" },
  });

const tensor = {
  T00: -1,
  T01: 0,
  T02: 0,
  T03: 0,
  T11: 1,
  T12: 0,
  T13: 0,
  T22: 1,
  T23: 0,
  T33: 1,
};

const sourceInput = (overrides = {}) => ({
  schemaVersion: "nhm2_tile_source_input/v1",
  runId: "run-1",
  profileId: profile,
  sourceModelId: "tile-source.v1",
  sourceModelVersion: "v1",
  sourceModelClass: "reconstituted_from_source_channels",
  notDerivedFromMetricRequiredTensor: true,
  metricRequiredInputRefs: [],
  sourceChannels: {
    regions: ["global", "hull", "wall", "exterior_shell"].map((regionId) => ({
      regionId,
      tensor,
      symmetry: "symmetric",
      chartRef: "comoving_cartesian",
      unitsRef: "J/m^3",
      regionMaskRef: `mask.${regionId}`,
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
      sampleCount: 10,
      inputRefs: [`source.${regionId}`],
      preAggregationValueRefs: [`source.pre.${regionId}`],
    })),
  },
  ...overrides,
});

const qeiWorldlineDossier = () =>
  buildNhm2QeiWorldlineDossier({
    generatedAt: "2026-06-18T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    worldlines: [
      {
        worldlineId: "wall-qei",
        regionId: "wall",
        chartId: "comoving_cartesian",
        samplingFunction: { kind: "lorentzian", tauSeconds: 1e-9, normalized: true },
        sampledRho: { valueSI: -1, status: "computed" },
        bound: { valueSI: 2, status: "literature_bound" },
        margin: { valueSI: 3, pass: true },
        consistency: {
          tauVsDuty: "pass",
          tauVsLightCrossing: "pass",
          tauVsModulation: "pass",
        },
        blockers: [],
      },
    ],
  });

const conservation = () =>
  buildNhm2TileCounterpartConservationArtifact({
    runId: "run-1",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    chartRef: "comoving_cartesian",
    derivativeStencil: "fd4",
    unitsRef: "J/m^3",
    regions: ["global", "hull", "wall", "exterior_shell"].map((regionId) => ({
      regionId: regionId as "global" | "hull" | "wall" | "exterior_shell",
      status: "pass" as const,
      divTResidualLInf: 0.01,
      continuityResidualLInf: 0.01,
      momentumResidualLInf: 0.01,
      toleranceLInf: 0.1,
      sampleCount: 4,
      blockers: [],
    })),
  });

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-full-tensor-source-"));
  try {
    writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("publish tile-effective full-tensor source", () => {
  it("produces review artifact when QEI and conservation are missing", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceInput()), "utf8");
      const artifact = publishTileEffectiveFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceInputPath: "source.json",
        outPath: "out.json",
      });
      expect(artifact.overallState).toBe("review");
      expect(artifact.regions.every((region) => region.tensorAuthorityMode === "symmetric_full_tensor")).toBe(true);
      expect(artifact.reasonCodes).toContain("hull:qei_dossier_not_pass");
      expect(artifact.reasonCodes).toContain("hull:conservation_unknown");
    }));

  it("emits fail artifact if metric refs appear", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceInput({
        notDerivedFromMetricRequiredTensor: false,
        metricRequiredInputRefs: ["metric.required.hull"],
      })), "utf8");
      const artifact = publishTileEffectiveFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceInputPath: "source.json",
        outPath: "out.json",
      });
      expect(artifact.overallState).toBe("fail");
      expect(artifact.reasonCodes).toContain("metric_required_input_refs_present");
    }));

  it("accepts current QEI worldline dossiers as source-side QEI pass evidence", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceInput()), "utf8");
      writeFileSync(join(root, "source-closure.json"), JSON.stringify({}), "utf8");
      writeFileSync(join(root, "qei-worldline.json"), JSON.stringify(qeiWorldlineDossier()), "utf8");
      writeFileSync(join(root, "conservation.json"), JSON.stringify(conservation()), "utf8");
      const artifact = publishTileEffectiveFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceInputPath: "source.json",
        qeiDossierPath: "qei-worldline.json",
        conservationPath: "conservation.json",
        outPath: "out.json",
      });
      const counterpart = publishTileEffectiveCounterpart({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source-closure.json",
        tileFullTensorSourcePath: "out.json",
        qeiDossierPath: "qei-worldline.json",
        conservationPath: "conservation.json",
        outPath: "counterpart.json",
      });

      expect(artifact.overallState).toBe("pass");
      expect(artifact.reasonCodes).not.toContain("hull:qei_dossier_not_pass");
      expect(artifact.reasonCodes).not.toContain("hull:conservation_unknown");
      expect(counterpart.qeiApplicabilityStatus).toBe("PASS");
      expect(counterpart.regions.find((region) => region.regionId === "wall")?.blockers).toEqual([]);
    }));

  it("keeps diagonal source input in review, never pass", () =>
    withTemp((root) => {
      const diagonal = { T00: -1, T11: 1, T22: 1, T33: 1 };
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceInput({
        sourceChannels: {
          regions: ["global", "hull", "wall", "exterior_shell"].map((regionId) => ({
            regionId,
            tensor: diagonal,
            symmetry: "none",
            chartRef: "comoving_cartesian",
            unitsRef: "J/m^3",
            regionMaskRef: `mask.${regionId}`,
            aggregationMode: "mean",
            normalizationBasis: "sample_count",
            sampleCount: 10,
            inputRefs: [`source.${regionId}`],
          })),
        },
      })), "utf8");
      const artifact = publishTileEffectiveFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceInputPath: "source.json",
        outPath: "out.json",
      });
      expect(artifact.overallState).not.toBe("pass");
      expect(artifact.reasonCodes).toContain("global:full_tensor_authority_missing");
    }));

  it("rejects latest aliases unless audit-only is set", () =>
    withTemp((root) => {
      writeFileSync(join(root, "source-latest.json"), JSON.stringify(sourceInput()), "utf8");
      expect(() => publishTileEffectiveFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceInputPath: "source-latest.json",
        outPath: "out.json",
      })).toThrow(/latest aliases are forbidden/);
      expect(publishTileEffectiveFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceInputPath: "source-latest.json",
        outPath: "out.json",
        auditOnly: true,
      }).artifactId).toBe("nhm2_tile_effective_full_tensor_source");
    }));
});
