import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isNhm2MetricRequiredRegionalFullTensorSourceArtifact,
} from "../shared/contracts/nhm2-metric-required-regional-full-tensor-source.v1";
import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import { buildNhm2SameChartFullTensorArtifact } from "../shared/contracts/nhm2-same-chart-full-tensor.v1";
import { publishMetricRequiredRegionalTensorReceipt } from "../tools/nhm2/publish-metric-required-regional-tensor-receipt";
import { publishMetricRequiredFullTensorSource } from "../tools/nhm2/publish-metric-required-full-tensor-source";

const profile = "stage1_centerline_alpha_0p995_v1";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    runId: "metric-full-tensor-source-run",
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

const sameChartFullTensor = (value: number, defaultAssumptions: string[] = []) =>
  buildNhm2SameChartFullTensorArtifact({
    generatedAt: "2026-05-05T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: profile,
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    routeId: "einstein_tensor_geometry_fd4_v1",
    source: "einstein_tensor_geometry_fd4_v1",
    tensor: {
      T00: -value,
      T01: 0,
      T02: 0,
      T03: 0,
      T11: value,
      T12: 0,
      T13: 0,
      T22: value,
      T23: 0,
      T33: value,
    },
    defaultAssumptions,
    componentStatuses: {
      T00: "derived_same_chart",
      T0x: "derived_same_chart",
      T0y: "derived_same_chart",
      T0z: "derived_same_chart",
      Txx: "derived_same_chart",
      Txy: "derived_same_chart",
      Txz: "derived_same_chart",
      Tyy: "derived_same_chart",
      Tyz: "derived_same_chart",
      Tzz: "derived_same_chart",
    },
    adm: {
      alphaStatus: "computed",
      betaStatus: "computed",
      gammaStatus: "computed",
      extrinsicCurvatureStatus: "computed",
    },
  });

const sourceClosure = () => ({
  artifactId: "nhm2_source_closure",
  schemaVersion: "nhm2_source_closure/v2",
  tensors: {
    metricRequired: { T00: -1, T11: 1, T22: 1, T33: 1 },
  },
  tensorRefs: {
    metricRequired: "metric.global",
  },
  metricAccounting: {
    aggregationMode: "mean",
    normalizationBasis: "sample_count",
    sampleCount: 1,
    regionMaskRef: "metric.mask.global",
  },
  regionComparisons: {
    regions: ["global", "hull", "wall", "exterior_shell"].map((regionId) => ({
      regionId,
      metricAccounting: {
        aggregationMode: "mean",
        normalizationBasis: "sample_count",
        sampleCount: regionId === "global" ? 512 : 144,
        regionMaskRef: `metric.mask.${regionId}`,
      },
      metricT00Diagnostics: {
        trace: {
          regionMaskRef: `metric.mask.${regionId}`,
          aggregationMode: "mean",
          normalizationBasis: "sample_count",
          sampleCount: regionId === "global" ? 512 : 144,
        },
      },
    })),
  },
});

const sourceClosureWithoutGlobalMetadata = () => ({
  artifactId: "nhm2_source_closure",
  schemaVersion: "nhm2_source_closure/v2",
  tensors: {
    metricRequired: { T00: -1, T11: 1, T22: 1, T33: 1 },
  },
  tensorRefs: {
    metricRequired: "metric.global",
  },
  regionComparisons: {
    regions: ["hull", "wall", "exterior_shell"].map((regionId) => ({
      regionId,
      metricAccounting: {
        aggregationMode: "mean",
        normalizationBasis: "sample_count",
        sampleCount: 144,
        regionMaskRef: `metric.mask.${regionId}`,
      },
      metricT00Diagnostics: {
        trace: {
          regionMaskRef: `metric.mask.${regionId}`,
          aggregationMode: "mean",
          normalizationBasis: "sample_count",
          sampleCount: 144,
        },
      },
    })),
  },
});

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-metric-full-tensor-source-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const component = (
  artifact: ReturnType<typeof sameChartFullTensor>,
  componentId: string,
) => artifact.components.find((entry) => entry.componentId === componentId);

describe("NHM2 metric-required regional full tensor source", () => {
  it("publishes global tensor evidence without copying it into regional rows", () =>
    withTemp((root) => {
      writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure()), "utf8");
      writeFileSync(
        join(root, "runtime.json"),
        JSON.stringify({ nhm2SameChartFullTensor: sameChartFullTensor(10) }),
        "utf8",
      );

      const artifact = publishMetricRequiredFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        runtimeArtifactPath: "runtime.json",
        sourceClosurePath: "source.json",
        outPath: "full-tensor-source.json",
      });
      const wall = artifact.regions.find((region) => region.regionId === "wall");

      expect(isNhm2MetricRequiredRegionalFullTensorSourceArtifact(artifact)).toBe(true);
      expect(artifact.summary.allRequiredRegionsPresent).toBe(true);
      expect(artifact.summary.allRequiredRegionsFullTensor).toBe(false);
      expect(artifact.regions.find((region) => region.regionId === "global")?.status).toBe(
        "computed",
      );
      expect(wall?.status).toBe("blocked");
      expect(wall?.warnings).toContain("global_same_chart_tensor_not_reused_as_regional_tensor");
      expect(wall?.blockers).toContain("metric_required_region_full_tensor_aggregation_missing");
      expect(component(wall?.sameChartFullTensor as ReturnType<typeof sameChartFullTensor>, "T00")?.valueSI).toBeNull();
      expect(component(wall?.sameChartFullTensor as ReturnType<typeof sameChartFullTensor>, "T0x")?.status).toBe("blocked");
    }));

  it("publishes required region-specific same-chart tensor evidence with source-closure metadata", () =>
    withTemp((root) => {
      writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure()), "utf8");
      writeFileSync(
        join(root, "runtime.json"),
        JSON.stringify({
          regionComparisons: {
            regions: ["global", "hull", "wall", "exterior_shell"].map((regionId, index) => ({
              regionId,
              sameChartFullTensor: sameChartFullTensor(10 + index),
            })),
          },
        }),
        "utf8",
      );

      const artifact = publishMetricRequiredFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        runtimeArtifactPath: "runtime.json",
        sourceClosurePath: "source.json",
        outPath: "full-tensor-source.json",
      });
      const global = artifact.regions.find((region) => region.regionId === "global");
      const wall = artifact.regions.find((region) => region.regionId === "wall");

      expect(artifact.regions.map((region) => region.regionId)).toEqual([
        "global",
        "hull",
        "wall",
        "exterior_shell",
      ]);
      expect(artifact.summary.allRequiredRegionsPresent).toBe(true);
      expect(artifact.summary.allRequiredRegionsFullTensor).toBe(true);
      expect(artifact.summary.allAggregationMetadataKnown).toBe(true);
      expect(artifact.summary.blockedRegionIds).toEqual([]);
      expect(artifact.summary.missingRegionIds).toEqual([]);
      expect(artifact.summary.firstBlocker).toBeNull();
      expect(global?.status).toBe("computed");
      expect(global?.regionMaskRef).toBe("metric.mask.global");
      expect(global?.sampleCount).toBe(512);
      expect(wall?.status).toBe("computed");
      expect(wall?.regionMaskRef).toBe("metric.mask.wall");
      expect(wall?.aggregationMode).toBe("mean");
      expect(wall?.sampleCount).toBe(144);
      expect(wall?.sameChartFullTensor.completeness.fullTensorComplete).toBe(true);
      expect(wall?.blockers).toEqual([]);
    }));

  it("fills missing global metric aggregation metadata from runtime regional evidence", () =>
    withTemp((root) => {
      writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
      writeFileSync(
        join(root, "source.json"),
        JSON.stringify(sourceClosureWithoutGlobalMetadata()),
        "utf8",
      );
      writeFileSync(
        join(root, "runtime.json"),
        JSON.stringify({
          regionComparisons: {
            regions: [
              {
                regionId: "global",
                sameChartFullTensor: sameChartFullTensor(10),
                metricAccounting: {
                  aggregationMode: "mean",
                  normalizationBasis: "sample_count",
                  sampleCount: 512,
                  regionMaskRef: "runtime.metric.mask.global",
                },
                metricT00Diagnostics: {
                  trace: {
                    aggregationMode: "mean",
                    normalizationBasis: "sample_count",
                    sampleCount: 512,
                    regionMaskRef: "runtime.metric.mask.global",
                  },
                },
              },
              ...["hull", "wall", "exterior_shell"].map((regionId, index) => ({
                regionId,
                sameChartFullTensor: sameChartFullTensor(20 + index),
              })),
            ],
          },
        }),
        "utf8",
      );

      const artifact = publishMetricRequiredFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        runtimeArtifactPath: "runtime.json",
        sourceClosurePath: "source.json",
        outPath: "full-tensor-source.json",
      });
      const global = artifact.regions.find((region) => region.regionId === "global");

      expect(global?.status).toBe("computed");
      expect(global?.regionMaskRef).toBe("runtime.metric.mask.global");
      expect(global?.aggregationMode).toBe("mean");
      expect(global?.normalizationBasis).toBe("sample_count");
      expect(global?.sampleCount).toBe(512);
      expect(global?.blockers).not.toContain("metric_required_region_mask_ref_missing");
      expect(global?.blockers).not.toContain(
        "metric_required_region_full_tensor_aggregation_missing",
      );
      expect(global?.blockers).not.toContain(
        "metric_required_region_full_tensor_normalization_missing",
      );
      expect(global?.blockers).not.toContain(
        "metric_required_region_full_tensor_sample_count_missing",
      );
      expect(global?.warnings).toContain(
        "metric_required_region_metadata_consumed_from_runtime_region_evidence",
      );
    }));

  it("can infer global metric aggregation metadata from complete same-chart tensor assumptions", () =>
    withTemp((root) => {
      writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
      writeFileSync(
        join(root, "source.json"),
        JSON.stringify(sourceClosureWithoutGlobalMetadata()),
        "utf8",
      );
      writeFileSync(
        join(root, "runtime.json"),
        JSON.stringify({
          regionComparisons: {
            regions: [
              {
                regionId: "global",
                sameChartFullTensor: sameChartFullTensor(10, [
                  "regional tensor components are averaged over the source-closure brick mask",
                  "regionId=global",
                  "sampleCount=512",
                  "brick_mask=ellipsoid_axes_m(1.000000,1.000000,1.000000)",
                ]),
              },
              ...["hull", "wall", "exterior_shell"].map((regionId, index) => ({
                regionId,
                sameChartFullTensor: sameChartFullTensor(20 + index),
              })),
            ],
          },
        }),
        "utf8",
      );

      const artifact = publishMetricRequiredFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        runtimeArtifactPath: "runtime.json",
        sourceClosurePath: "source.json",
        outPath: "full-tensor-source.json",
      });
      const global = artifact.regions.find((region) => region.regionId === "global");

      expect(global?.status).toBe("computed");
      expect(global?.regionMaskRef).toBe("metric_required.region.global.brick_mask");
      expect(global?.aggregationMode).toBe("mean");
      expect(global?.normalizationBasis).toBe("sample_count");
      expect(global?.sampleCount).toBe(512);
      expect(global?.warnings).toContain(
        "metric_required_region_metadata_inferred_from_same_chart_tensor_assumptions",
      );
    }));

  it("keeps global metric aggregation blocked when runtime evidence lacks metadata", () =>
    withTemp((root) => {
      writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
      writeFileSync(
        join(root, "source.json"),
        JSON.stringify(sourceClosureWithoutGlobalMetadata()),
        "utf8",
      );
      writeFileSync(
        join(root, "runtime.json"),
        JSON.stringify({
          regionComparisons: {
            regions: [
              {
                regionId: "global",
                sameChartFullTensor: sameChartFullTensor(10, [
                  "regional tensor components are averaged over the source-closure brick mask",
                  "regionId=global",
                ]),
              },
              ...["hull", "wall", "exterior_shell"].map((regionId, index) => ({
                regionId,
                sameChartFullTensor: sameChartFullTensor(20 + index),
              })),
            ],
          },
        }),
        "utf8",
      );

      const artifact = publishMetricRequiredFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        runtimeArtifactPath: "runtime.json",
        sourceClosurePath: "source.json",
        outPath: "full-tensor-source.json",
      });
      const global = artifact.regions.find((region) => region.regionId === "global");

      expect(global?.blockers).toContain("metric_required_region_mask_ref_missing");
      expect(global?.blockers).toContain(
        "metric_required_region_full_tensor_normalization_missing",
      );
      expect(global?.blockers).toContain(
        "metric_required_region_full_tensor_sample_count_missing",
      );
      expect(artifact.summary.allAggregationMetadataKnown).toBe(false);
    }));

  it("feeds the generated source into the metric-required receipt path", () =>
    withTemp((root) => {
      writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure()), "utf8");
      writeFileSync(
        join(root, "runtime.json"),
        JSON.stringify({
          regionComparisons: {
            regions: [
              {
                regionId: "wall",
                sameChartFullTensor: sameChartFullTensor(10),
              },
            ],
          },
        }),
        "utf8",
      );

      publishMetricRequiredFullTensorSource({
        repoRoot: root,
        referenceRunPath: "reference.json",
        runtimeArtifactPath: "runtime.json",
        sourceClosurePath: "source.json",
        outPath: "full-tensor-source.json",
      });
      const receipt = publishMetricRequiredRegionalTensorReceipt({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        metricRequiredFullTensorSourcePath: "full-tensor-source.json",
        outPath: "receipt.json",
      });
      const written = JSON.parse(readFileSync(join(root, "receipt.json"), "utf8"));
      const wall = receipt.regions.find((region) => region.regionId === "wall");

      expect(wall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
      expect(wall?.blockers).not.toContain("metric_required_full_tensor_authority_missing");
      expect(written.sourceArtifactRefs).toContain("full-tensor-source.json");
    }));
});
