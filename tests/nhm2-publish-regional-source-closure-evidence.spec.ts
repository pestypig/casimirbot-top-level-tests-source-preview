import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import {
  isNhm2RegionalSourceClosureEvidenceArtifact,
  type Nhm2RegionalTensor,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import {
  buildNhm2TileEffectiveCounterpartArtifact,
  type Nhm2TileEffectiveCounterpartRegion,
} from "../shared/contracts/nhm2-tile-effective-counterpart.v1";
import { buildMetricRequiredRegionalTensorReceiptFromSourceClosure } from "../tools/nhm2/publish-metric-required-regional-tensor-receipt";
import { publishRegionalSourceClosureEvidence } from "../tools/nhm2/publish-regional-source-closure-evidence";

const profile = "stage1_centerline_alpha_0p995_v1";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "run-1",
    repo: {
      repositoryFullName: "local/casimirbot",
      branch: "main",
      commitSha: "abc123",
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

const residuals = (metric = -10, tile = -10) => ({
  T00: {
    metricRequired: metric,
    tileEffective: tile,
    absResidual: Math.abs(metric - tile),
    relResidual: metric === 0 ? null : Math.abs(metric - tile) / Math.abs(metric),
  },
});

const sourceRegion = (
  regionId: "hull" | "wall" | "exterior_shell",
  options: {
    role?: "tile_effective_counterpart" | "gr_matter_channel_observation";
    basis?: string;
    pass?: boolean;
  } = {},
) => ({
  regionId,
  status: options.pass === false ? "fail" : "pass",
  comparisonBasisStatus: options.basis ?? "same_basis",
  counterpartResolutionStatus:
    options.role === "gr_matter_channel_observation" ? "missing" : "resolved",
  comparisonBasisAuthorityStatus:
    options.role === "gr_matter_channel_observation" ? "counterpart_missing" : "resolved",
  metricRequiredTensor: tensor(10),
  tileEffectiveTensor: tensor(options.pass === false ? 12 : 10),
  metricTensorRef: `metric.${regionId}`,
  tileTensorRef: `tile.${regionId}`,
  metricAccounting: {
    sampleCount: 10,
    aggregationMode: "mean",
    normalizationBasis: "sample_count",
  },
  tileAccounting: {
    sampleCount: 10,
    aggregationMode: "mean",
    normalizationBasis: "sample_count",
  },
  metricT00Diagnostics: {
    trace: {
      tensorRef: `metric.${regionId}`,
      pathFacts: {
        unitsRef: "J/m^3",
        comparisonRole: "metric_required_reference",
      },
    },
  },
  tileT00Diagnostics: {
    trace: {
      tensorRef: `tile.${regionId}`,
      pathFacts: {
        unitsRef: "J/m^3",
        comparisonRole: options.role ?? "tile_effective_counterpart",
      },
    },
  },
  residualComponents: residuals(-10, options.pass === false ? -12 : -10),
  residualNorms: {
    absLInf: options.pass === false ? 2 : 0,
    relLInf: options.pass === false ? 0.2 : 0,
    toleranceRelLInf: 0.1,
    pass: options.pass !== false,
  },
});

const sourceClosure = (role?: "tile_effective_counterpart" | "gr_matter_channel_observation") => ({
  artifactId: "nhm2_source_closure",
  schemaVersion: "nhm2_source_closure/v2",
  status: role === "gr_matter_channel_observation" ? "review" : "pass",
  tensors: {
    metricRequired: tensor(10),
    tileEffective: tensor(10),
  },
  tensorRefs: {
    metricRequired: "metric.global",
    tileEffective: "tile.global",
  },
  globalAccounting: {
    metric: {
      sampleCount: 10,
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
    },
    tile: {
      sampleCount: 10,
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
    },
  },
  comparisonBasisStatus: "same_basis",
  residualComponents: residuals(),
  residualNorms: {
    absLInf: 0,
    relLInf: 0,
    toleranceRelLInf: 0.1,
    pass: true,
  },
  regionComparisons: {
    regions: [
      sourceRegion("hull", { role }),
      sourceRegion("wall", { role }),
      sourceRegion("exterior_shell", { role }),
    ],
  },
});

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-source-evidence-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const writeArtifacts = (root: string, closure: unknown, sourceName = "source.json") => {
  writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
  writeFileSync(join(root, sourceName), JSON.stringify(closure), "utf8");
};

const counterpartRegion = (
  regionId: Nhm2TileEffectiveCounterpartRegion["regionId"],
): Nhm2TileEffectiveCounterpartRegion => ({
  regionId,
  status: "review",
  comparisonRole: "tile_effective_counterpart",
  tensorAuthorityMode: "proxy",
  tensor: { T00: -10 },
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `tile.region.${regionId}`,
  aggregationMode: "mean",
  normalizationBasis: "sample_count",
  sampleCount: 1,
  provenance: {
    producerModule: "fixture",
    producerFunction: "counterpartRegion",
    inputRefs: ["fixture"],
    sourceModelId: "fixture",
    sourceModelVersion: "v1",
    derivationMode: "diagonal_proxy",
    notDerivedFromMetricRequiredTensor: true,
  },
  blockers: ["proxy_tensor_authority"],
});

const tileCounterpart = () =>
  buildNhm2TileEffectiveCounterpartArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "run-1",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceAuthorityMode: "proxy",
    sourceTensorArtifactRef: "tile-local.json",
    sourceTensorAuthorityMode: "proxy",
    conservationRef: null,
    conservationStatus: "unknown",
    qeiDossierRef: null,
    qeiApplicabilityStatus: "UNKNOWN",
    quantumStateAssumptions: [],
    renormalizationConvention: null,
    cavityBoundaryModel: "ideal_parallel_plate_scalar_placeholder",
    cycleAverageClosureStatus: "review",
    dutyCycleStatus: "review",
    lightCrossingConsistencyStatus: "unknown",
    conservationDiagnostics: {
      divTStatus: "unknown",
      divTResidualLInf: null,
      continuityResidualLInf: null,
      momentumResidualLInf: null,
    },
    regions: [
      counterpartRegion("global"),
      counterpartRegion("hull"),
      counterpartRegion("wall"),
      counterpartRegion("exterior_shell"),
    ],
    literatureRefs: ["fixture"],
  });

describe("publish regional source-closure evidence", () => {
  it("current diagnostic-only source closure produces review or fail", () =>
    withTemp((root) => {
      writeArtifacts(root, sourceClosure("gr_matter_channel_observation"));
      const out = "evidence.json";
      const artifact = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        outPath: out,
      });

      expect(artifact.overallState).not.toBe("pass");
      expect(artifact.reasonCodes).toContain(
        "hull:tile_role_not_counterpart:gr_matter_channel_observation",
      );
      expect(isNhm2RegionalSourceClosureEvidenceArtifact(artifact)).toBe(true);
      expect(JSON.parse(readFileSync(join(root, out), "utf8"))).toMatchObject({
        artifactId: "nhm2_regional_source_closure_evidence",
      });
    }));

  it("source closure with all same-basis counterparts produces pass", () =>
    withTemp((root) => {
      writeArtifacts(root, sourceClosure("tile_effective_counterpart"));
      const artifact = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        outPath: "evidence.json",
      });

      expect(artifact.overallState).toBe("pass");
      expect(artifact.regions.map((region) => region.regionId)).toEqual([
        "global",
        "hull",
        "wall",
        "exterior_shell",
      ]);
    }));

  it("latest path is refused unless audit-only", () =>
    withTemp((root) => {
      writeArtifacts(root, sourceClosure("tile_effective_counterpart"), "source-latest.json");
      expect(() =>
        publishRegionalSourceClosureEvidence({
          repoRoot: root,
          referenceRunPath: "reference.json",
          sourceClosurePath: "source-latest.json",
          outPath: "evidence.json",
        }),
      ).toThrow(/latest aliases are forbidden/);

      expect(
        publishRegionalSourceClosureEvidence({
          repoRoot: root,
          referenceRunPath: "reference.json",
          sourceClosurePath: "source-latest.json",
          outPath: "evidence.json",
          auditOnly: true,
        }).artifactId,
      ).toBe("nhm2_regional_source_closure_evidence");
    }));

  it("does not force global same-basis status when supplied counterpart metadata mismatches legacy metric metadata", () =>
    withTemp((root) => {
      const closure = {
        ...sourceClosure("tile_effective_counterpart"),
        globalAccounting: {
          metric: {
            sampleCount: 10,
          },
          tile: {
            sampleCount: 10,
            aggregationMode: "mean",
            normalizationBasis: "sample_count",
          },
        },
      };
      writeArtifacts(root, closure);
      writeFileSync(
        join(root, "counterpart.json"),
        JSON.stringify(tileCounterpart()),
        "utf8",
      );

      const artifact = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        tileEffectiveCounterpartPath: "counterpart.json",
        outPath: "evidence.json",
      });
      const global = artifact.regions.find((region) => region.regionId === "global");

      expect(global?.comparisonBasisStatus).toBe("aggregation_mismatch");
      expect(artifact.reasonCodes).toContain("global:aggregation_mismatch");
      expect(isNhm2RegionalSourceClosureEvidenceArtifact(artifact)).toBe(true);
    }));

  it("does not force global same-basis status when sample counts differ", () =>
    withTemp((root) => {
      writeArtifacts(root, sourceClosure("tile_effective_counterpart"));
      writeFileSync(
        join(root, "counterpart.json"),
        JSON.stringify(tileCounterpart()),
        "utf8",
      );

      const artifact = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        tileEffectiveCounterpartPath: "counterpart.json",
        outPath: "evidence.json",
      });
      const global = artifact.regions.find((region) => region.regionId === "global");

      expect(global?.metricRequired.sampleCount).toBe(10);
      expect(global?.tileEffectiveCounterpart.sampleCount).toBe(1);
      expect(global?.comparisonBasisStatus).toBe("sample_count_mismatch");
      expect(global?.blockers).toContain("sample_count_mismatch");
      expect(artifact.reasonCodes).toContain("global:sample_count_mismatch");
      expect(isNhm2RegionalSourceClosureEvidenceArtifact(artifact)).toBe(true);
    }));

  it("uses metric-required receipt metadata before stale regional metric accounting", () =>
    withTemp((root) => {
      const closure = sourceClosure("tile_effective_counterpart");
      for (const region of closure.regionComparisons.regions) {
        region.comparisonBasisStatus = "diagnostic_only";
        region.metricAccounting = {
          sampleCount: null,
          aggregationMode: "unknown",
          normalizationBasis: null,
        };
        region.metricRequiredTensor = {
          T00: -10,
          T11: 10,
          T22: 10,
          T33: 10,
        };
        region.metricT00Diagnostics.trace = {
          ...region.metricT00Diagnostics.trace,
          tensorRef: `metric.${region.regionId}`,
          regionMaskRef: `metric.mask.${region.regionId}`,
          aggregationMode: "mean",
          normalizationBasis: "sample_count",
          sampleCount: 1,
          pathFacts: {
            chartRef: "comoving_cartesian",
            unitsRef: "J/m^3",
            comparisonRole: "metric_required_reference",
          },
        };
      }
      writeArtifacts(root, closure);
      writeFileSync(
        join(root, "counterpart.json"),
        JSON.stringify(tileCounterpart()),
        "utf8",
      );
      const receipt = buildMetricRequiredRegionalTensorReceiptFromSourceClosure({
        generatedAt: "2026-05-05T00:00:00.000Z",
        referenceRun: referenceRun(),
        sourceClosure: closure,
        sourceClosureRef: "source.json",
      });
      writeFileSync(join(root, "metric-receipt.json"), JSON.stringify(receipt), "utf8");

      const artifact = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        tileEffectiveCounterpartPath: "counterpart.json",
        metricRequiredRegionalTensorReceiptPath: "metric-receipt.json",
        outPath: "evidence.json",
      });
      const hull = artifact.regions.find((region) => region.regionId === "hull");

      expect(hull?.comparisonBasisStatus).toBe("same_basis");
      expect(hull?.metricRequired.aggregationMode).toBe("mean");
      expect(hull?.metricRequired.normalizationBasis).toBe("sample_count");
      expect(hull?.metricRequired.sampleCount).toBe(1);
      expect(hull?.metricRequired.tensorAuthorityMode).toBe("diagonal_reduced_order");
      expect(hull?.blockers).toContain("metric_required_full_tensor_authority_missing");
      expect(hull?.blockers).toContain("metric_tensor_authority_insufficient");
      expect(artifact.reasonCodes).not.toContain("hull:aggregation_mismatch");
      expect(isNhm2RegionalSourceClosureEvidenceArtifact(artifact)).toBe(true);
    }));

  it("artifact includes literatureRefs", () =>
    withTemp((root) => {
      writeArtifacts(root, sourceClosure("tile_effective_counterpart"));
      const artifact = publishRegionalSourceClosureEvidence({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        outPath: "evidence.json",
      });

      expect(artifact.literatureRefs).toContain("natario_2001_zero_expansion");
    }));
});
