import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isNhm2MetricRequiredRegionalTensorReceipt,
} from "../shared/contracts/nhm2-metric-required-regional-tensor-receipt.v1";
import { buildNhm2ReferenceRunArtifact } from "../shared/contracts/nhm2-reference-run.v1";
import type { Nhm2RegionalTensor } from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import { buildNhm2SameChartFullTensorArtifact } from "../shared/contracts/nhm2-same-chart-full-tensor.v1";
import {
  buildMetricRequiredRegionalTensorReceiptFromSourceClosure,
  publishMetricRequiredRegionalTensorReceipt,
} from "../tools/nhm2/publish-metric-required-regional-tensor-receipt";

const profile = "stage1_centerline_alpha_0p995_v1";

const referenceRun = () =>
  buildNhm2ReferenceRunArtifact({
    generatedAt: "2026-05-04T00:00:00.000Z",
    runId: "metric-receipt-run",
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

const diagonalTensor = (value: number): Nhm2RegionalTensor => ({
  T00: -value,
  T11: value,
  T22: value,
  T33: value,
});

const regionalComparison = (regionId: "hull" | "wall" | "exterior_shell") => ({
  regionId,
  metricRequiredTensor: diagonalTensor(10),
  metricTensorRef: `metric.${regionId}`,
  metricAccounting: {
    aggregationMode: "unknown",
    normalizationBasis: null,
    sampleCount: null,
  },
  metricT00Diagnostics: {
    derivationMode: "runtime_integrated_metric_t00",
    trace: {
      tensorRef: `metric.${regionId}`,
      regionMaskRef: `metric.mask.${regionId}`,
      aggregationMode: "mean",
      normalizationBasis: "sample_count",
      sampleCount: 144,
      pathFacts: {
        chartRef: "comoving_cartesian",
        unitsRef: "J/m^3",
      },
    },
  },
});

const sourceClosure = () => ({
  artifactId: "nhm2_source_closure",
  schemaVersion: "nhm2_source_closure/v2",
  tensors: {
    metricRequired: diagonalTensor(1),
  },
  tensorRefs: {
    metricRequired: "metric.global",
  },
  regionComparisons: {
    regions: [
      regionalComparison("hull"),
      regionalComparison("wall"),
      regionalComparison("exterior_shell"),
    ],
  },
});

const sameChartFullTensor = (value: number) =>
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

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-metric-receipt-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("NHM2 metric-required regional tensor receipt", () => {
  it("emits all required regions and keeps missing tensor components explicit", () => {
    const artifact = buildMetricRequiredRegionalTensorReceiptFromSourceClosure({
      generatedAt: "2026-05-05T00:00:00.000Z",
      referenceRun: referenceRun(),
      sourceClosure: sourceClosure(),
      sourceClosureRef: "fixture-source-closure.json",
    });

    expect(isNhm2MetricRequiredRegionalTensorReceipt(artifact)).toBe(true);
    expect(artifact.regions.map((region) => region.regionId)).toEqual([
      "global",
      "hull",
      "wall",
      "exterior_shell",
    ]);
    expect(artifact.summary.allRequiredRegionsPresent).toBe(true);
    expect(artifact.summary.allRequiredRegionsFullTensor).toBe(false);
    expect(artifact.summary.sameBasisComparisonReady).toBe(false);

    const hull = artifact.regions.find((region) => region.regionId === "hull");
    expect(hull?.aggregationMode).toBe("mean");
    expect(hull?.normalizationBasis).toBe("sample_count");
    expect(hull?.sampleCount).toBe(144);
    expect(hull?.tensorAuthorityMode).toBe("diagonal_reduced_order");
    expect(hull?.tensor.T01).toBeUndefined();
    expect(hull?.missingComponentIds).toContain("T01");
    expect(hull?.missingComponentIds).toContain("T12");
    expect(hull?.componentStatus.T01).toBe("missing");
    expect(hull?.blockers).toContain("metric_required_full_tensor_authority_missing");
    expect(hull?.blockers).toContain("metric_required_full_tensor_components_missing");

    const global = artifact.regions.find((region) => region.regionId === "global");
    expect(global?.warnings).toContain("global_metric_accounting_missing");
    expect(global?.aggregationMode).toBe("unknown");
    expect(global?.blockers).toContain("metric_required_aggregation_mode_unknown");
    expect(global?.blockers).toContain("metric_required_sample_count_missing");
  });

  it("upgrades a region from diagonal estimate to symmetric full tensor when same-chart full tensor evidence is supplied", () => {
    const artifact = buildMetricRequiredRegionalTensorReceiptFromSourceClosure({
      generatedAt: "2026-05-05T00:00:00.000Z",
      referenceRun: referenceRun(),
      sourceClosure: sourceClosure(),
      sourceClosureRef: "fixture-source-closure.json",
      fullTensorSourceRef: "fixture-full-tensor-source.json",
      fullTensorRegionSources: [
        {
          regionId: "wall",
          sameChartFullTensor: sameChartFullTensor(10),
          artifactRef: "artifact://same-chart/wall",
          regionMaskRef: "metric.mask.wall",
          aggregationMode: "mean",
          normalizationBasis: "sample_count",
          sampleCount: 1,
        },
      ],
    });
    const wall = artifact.regions.find((region) => region.regionId === "wall");

    expect(wall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
    expect(wall?.tensor.T00).toBe(-10);
    expect(wall?.tensor.T01).toBe(0);
    expect(wall?.tensor.T12).toBe(0);
    expect(wall?.missingComponentIds).toEqual([]);
    expect(wall?.blockers).not.toContain("metric_required_full_tensor_authority_missing");
    expect(wall?.blockers).not.toContain("metric_required_full_tensor_components_missing");
    expect(wall?.derivationMode).toBe("einstein_tensor_geometry_fd4_v1");
    expect(wall?.tensorRef).toBe("artifact://same-chart/wall#wall");
    expect(artifact.sourceArtifactRefs).toContain("fixture-full-tensor-source.json");
  });

  it("does not zero-fill blocked or missing same-chart momentum and off-diagonal components", () => {
    const partialSameChart = buildNhm2SameChartFullTensorArtifact({
      generatedAt: "2026-05-05T00:00:00.000Z",
      laneId: "nhm2_shift_lapse",
      selectedProfileId: profile,
      chartId: "comoving_cartesian",
      metricFamily: "nhm2_shift_lapse",
      routeId: "einstein_tensor_geometry_fd4_v1",
      source: "einstein_tensor_geometry_fd4_v1",
      tensor: {
        T00: -10,
        T01: 99,
        T11: 10,
        T22: 10,
        T33: 10,
      },
      componentStatuses: {
        T0x: "blocked",
      },
      componentBlockers: {
        T0x: ["metric_T0i_route_not_admitted"],
      },
    });
    const artifact = buildMetricRequiredRegionalTensorReceiptFromSourceClosure({
      generatedAt: "2026-05-05T00:00:00.000Z",
      referenceRun: referenceRun(),
      sourceClosure: sourceClosure(),
      sourceClosureRef: "fixture-source-closure.json",
      fullTensorRegionSources: [
        {
          regionId: "wall",
          sameChartFullTensor: partialSameChart,
          artifactRef: "artifact://same-chart/wall-partial",
          regionMaskRef: "metric.mask.wall",
          aggregationMode: "mean",
          normalizationBasis: "sample_count",
          sampleCount: 1,
        },
      ],
    });
    const wall = artifact.regions.find((region) => region.regionId === "wall");

    expect(wall?.tensorAuthorityMode).toBe("diagonal_reduced_order");
    expect(wall?.tensor.T01).toBeUndefined();
    expect(wall?.missingComponentIds).toContain("T01");
    expect(wall?.missingComponentIds).toContain("T12");
    expect(wall?.blockers).toContain("same_chart_full_tensor_incomplete");
    expect(wall?.blockers).toContain("same_chart_component_missing:T0x");
    expect(wall?.blockers).toContain("metric_T0i_route_not_admitted");
    expect(wall?.blockers).toContain("metric_required_full_tensor_authority_missing");
  });

  it("publishes metric receipt from a regional same-chart full tensor source manifest", () =>
    withTemp((root) => {
      writeFileSync(join(root, "reference.json"), JSON.stringify(referenceRun()), "utf8");
      writeFileSync(join(root, "source.json"), JSON.stringify(sourceClosure()), "utf8");
      writeFileSync(
        join(root, "full-tensor-source.json"),
        JSON.stringify({
          contractVersion: "nhm2_metric_required_regional_full_tensor_source/v1",
          regions: [
            {
              regionId: "wall",
              artifactRef: "artifact://same-chart/wall",
              regionMaskRef: "metric.mask.wall",
              aggregationMode: "mean",
              normalizationBasis: "sample_count",
              sampleCount: 1,
              sameChartFullTensor: sameChartFullTensor(10),
            },
          ],
        }),
        "utf8",
      );

      const artifact = publishMetricRequiredRegionalTensorReceipt({
        repoRoot: root,
        referenceRunPath: "reference.json",
        sourceClosurePath: "source.json",
        metricRequiredFullTensorSourcePath: "full-tensor-source.json",
        outPath: "receipt.json",
      });
      const wall = artifact.regions.find((region) => region.regionId === "wall");
      const written = JSON.parse(readFileSync(join(root, "receipt.json"), "utf8"));

      expect(wall?.tensorAuthorityMode).toBe("symmetric_full_tensor");
      expect(wall?.blockers).not.toContain("metric_required_full_tensor_authority_missing");
      expect(written.contractVersion).toBe("nhm2_metric_required_regional_tensor_receipt/v1");
    }));
});
