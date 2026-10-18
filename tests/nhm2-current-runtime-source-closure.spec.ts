import { describe, expect, it } from "vitest";

import { buildRegionalFullTensorCoverageFromSourceClosure } from "../tools/nhm2/publish-current-nhm2-runtime-source-closure";
import {
  NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS,
  type Nhm2RegionalSourceClosureRegionId,
} from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2SameChartFullTensorArtifact } from "../shared/contracts/nhm2-same-chart-full-tensor.v1";
import type { Nhm2SourceClosureV2Artifact } from "../shared/contracts/nhm2-source-closure.v2";

const fullTensorForRegion = (regionId: Nhm2RegionalSourceClosureRegionId) =>
  buildNhm2SameChartFullTensorArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    routeId: "einstein_tensor_geometry_fd4_v1",
    source: "einstein_tensor_geometry_fd4_v1",
    artifactRef: `runtime.json#region.${regionId}.sameChartFullTensor`,
    tensor: {
      T00: -1,
      T01: 0.1,
      T02: 0.2,
      T03: 0.3,
      T11: 1,
      T12: 0.4,
      T13: 0.5,
      T22: 2,
      T23: 0.6,
      T33: 3,
    },
    adm: {
      alphaStatus: "computed",
      betaStatus: "computed",
      gammaStatus: "computed",
      extrinsicCurvatureStatus: "computed",
    },
  });

const incompleteTensorForRegion = (regionId: Nhm2RegionalSourceClosureRegionId) =>
  buildNhm2SameChartFullTensorArtifact({
    generatedAt: "2026-06-12T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    chartId: "comoving_cartesian",
    metricFamily: "nhm2_shift_lapse",
    routeId: "einstein_tensor_geometry_fd4_v1",
    source: "einstein_tensor_geometry_fd4_v1",
    artifactRef: `runtime.json#region.${regionId}.sameChartFullTensor`,
    tensor: {
      T00: -1,
      T11: 1,
      T22: 2,
      T33: 3,
    },
  });

const sourceClosureWithRegions = (
  regions: Array<{
    regionId: Nhm2RegionalSourceClosureRegionId;
    sampleCount: number | null;
    metricRequiredSameChartFullTensor?: ReturnType<typeof fullTensorForRegion> | null;
  }>,
) =>
  ({
    wallSourceClosure: {
      selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    },
    regionComparisons: {
      regions,
    },
  }) as unknown as Nhm2SourceClosureV2Artifact;

describe("current NHM2 runtime source-closure coverage", () => {
  it("marks the metric side ready when every required region has samples and a complete tensor", () => {
    const coverage = buildRegionalFullTensorCoverageFromSourceClosure({
      generatedAt: "2026-06-12T00:00:00.000Z",
      runtimeArtifactRef: "runtime.json",
      sourceClosureRef: "source-closure.json",
      sourceClosure: sourceClosureWithRegions(
        NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId) => ({
          regionId,
          sampleCount: 8,
          metricRequiredSameChartFullTensor: fullTensorForRegion(regionId),
        })),
      ),
    });

    expect(coverage.summary.metricSideFullTensorReady).toBe(true);
    expect(coverage.summary.firstBlocker).toBeNull();
    expect(coverage.claimBoundary.doesNotValidateSourceSide).toBe(true);
  });

  it("blocks zero-sample and missing regional tensor coverage", () => {
    const coverage = buildRegionalFullTensorCoverageFromSourceClosure({
      generatedAt: "2026-06-12T00:00:00.000Z",
      runtimeArtifactRef: "runtime.json",
      sourceClosureRef: "source-closure.json",
      sourceClosure: sourceClosureWithRegions([
        {
          regionId: "global",
          sampleCount: 8,
          metricRequiredSameChartFullTensor: fullTensorForRegion("global"),
        },
        {
          regionId: "hull",
          sampleCount: 0,
          metricRequiredSameChartFullTensor: fullTensorForRegion("hull"),
        },
        {
          regionId: "wall",
          sampleCount: 8,
          metricRequiredSameChartFullTensor: null,
        },
      ]),
    });

    expect(coverage.summary.metricSideFullTensorReady).toBe(false);
    expect(coverage.summary.zeroSampleRegionIds).toContain("hull");
    expect(coverage.summary.missingArtifactRegionIds).toContain("wall");
    expect(coverage.summary.missingArtifactRegionIds).toContain("exterior_shell");
    expect(coverage.summary.firstBlocker).toMatch(/sample|missing|incomplete/);
  });

  it("uses the runtime root same-chart tensor as global coverage when the closure has no global region", () => {
    const coverage = buildRegionalFullTensorCoverageFromSourceClosure({
      generatedAt: "2026-06-12T00:00:00.000Z",
      runtimeArtifactRef: "runtime.json",
      sourceClosureRef: "source-closure.json",
      globalSameChartFullTensor: fullTensorForRegion("global"),
      sourceClosure: sourceClosureWithRegions([
        {
          regionId: "hull",
          sampleCount: 8,
          metricRequiredSameChartFullTensor: fullTensorForRegion("hull"),
        },
        {
          regionId: "wall",
          sampleCount: 8,
          metricRequiredSameChartFullTensor: fullTensorForRegion("wall"),
        },
        {
          regionId: "exterior_shell",
          sampleCount: 8,
          metricRequiredSameChartFullTensor: fullTensorForRegion("exterior_shell"),
        },
      ]),
    });
    const global = coverage.regions.find((region) => region.regionId === "global");

    expect(global?.hasMetricRequiredSameChartFullTensor).toBe(true);
    expect(global?.blockers).toContain("metric_required_region_sample_count_missing");
    expect(global?.blockers).not.toContain("source_closure_region_missing");
  });

  it("does not count diagonal-only tensor coverage as complete", () => {
    const coverage = buildRegionalFullTensorCoverageFromSourceClosure({
      generatedAt: "2026-06-12T00:00:00.000Z",
      runtimeArtifactRef: "runtime.json",
      sourceClosureRef: "source-closure.json",
      sourceClosure: sourceClosureWithRegions(
        NHM2_REGIONAL_SOURCE_CLOSURE_REQUIRED_REGIONS.map((regionId) => ({
          regionId,
          sampleCount: 8,
          metricRequiredSameChartFullTensor:
            regionId === "wall"
              ? incompleteTensorForRegion(regionId)
              : fullTensorForRegion(regionId),
        })),
      ),
    });
    const wall = coverage.regions.find((region) => region.regionId === "wall");

    expect(coverage.summary.metricSideFullTensorReady).toBe(false);
    expect(coverage.summary.incompleteRegionIds).toContain("wall");
    expect(wall?.missingComponentIds).toEqual(
      expect.arrayContaining(["T0x", "T0y", "T0z", "Txy", "Txz", "Tyz"]),
    );
  });
});
