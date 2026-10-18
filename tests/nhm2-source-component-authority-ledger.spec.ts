import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildNhm2SourceComponentAuthorityLedger,
  isNhm2SourceComponentAuthorityLedger,
} from "../shared/contracts/nhm2-source-component-authority-ledger.v1";
import { isNhm2TileEffectiveFullTensorCounterpart } from "../shared/contracts/nhm2-tile-effective-full-tensor-counterpart.v1";
import type { Nhm2RegionalSourceClosureRegionId } from "../shared/contracts/nhm2-regional-source-closure-evidence.v1";
import {
  buildNhm2TileEffectiveCounterpartArtifact,
  type Nhm2TileEffectiveCounterpartRegion,
  type Nhm2TileEffectiveCounterpartTensorAuthorityMode,
} from "../shared/contracts/nhm2-tile-effective-counterpart.v1";
import { publishSourceComponentAuthorityLedger } from "../tools/nhm2/publish-source-component-authority-ledger";

const profile = "stage1_centerline_alpha_0p995_v1";
const regions = ["global", "hull", "wall", "exterior_shell"] as const;

const tensor = (value: number, mode: Nhm2TileEffectiveCounterpartTensorAuthorityMode) => ({
  T00: -value,
  T11: value,
  T22: value,
  T33: value,
  ...(mode === "diagonal_reduced_order"
    ? {}
    : {
        T01: 0,
        T02: 0,
        T03: 0,
        T10: 0,
        T12: 0,
        T13: 0,
        T20: 0,
        T21: 0,
        T23: 0,
        T30: 0,
        T31: 0,
        T32: 0,
      }),
});

const region = (
  regionId: Nhm2RegionalSourceClosureRegionId,
  mode: Nhm2TileEffectiveCounterpartTensorAuthorityMode = "full_tensor",
  metricEcho = false,
): Nhm2TileEffectiveCounterpartRegion => ({
  regionId,
  status: "pass",
  comparisonRole: metricEcho ? "metric_echo_diagnostic_only" : "tile_effective_counterpart",
  tensorAuthorityMode: mode,
  tensor: tensor(10, mode),
  chartRef: "comoving_cartesian",
  unitsRef: "J/m^3",
  regionMaskRef: `mask.${regionId}`,
  aggregationMode: "mean",
  normalizationBasis: "sample_count",
  sampleCount: 16,
  provenance: {
    producerModule: "fixture",
    producerFunction: "emit",
    inputRefs: [`source.${regionId}`],
    sourceModelId: "fixture_source_model",
    sourceModelVersion: "v1",
    derivationMode: metricEcho
      ? "metric_echo"
      : mode === "diagonal_reduced_order"
        ? "diagonal_proxy"
        : "tile_model_direct_full_tensor",
    notDerivedFromMetricRequiredTensor: !metricEcho,
  },
  blockers: [],
});

const counterpart = (
  mode: Nhm2TileEffectiveCounterpartTensorAuthorityMode = "full_tensor",
  metricEchoRegion: Nhm2RegionalSourceClosureRegionId | null = null,
) =>
  buildNhm2TileEffectiveCounterpartArtifact({
    generatedAt: "2026-06-13T00:00:00.000Z",
    runId: "component-ledger-run",
    selectedProfileId: profile,
    expectedProfileId: profile,
    laneId: "nhm2_shift_lapse",
    sourceAuthorityMode: "unknown",
    sourceTensorArtifactRef: "source-tensor.json",
    sourceTensorAuthorityMode: mode,
    conservationRef: null,
    conservationStatus: "unknown",
    qeiDossierRef: "qei.json",
    qeiApplicabilityStatus: "PASS",
    quantumStateAssumptions: ["declared"],
    renormalizationConvention: "declared",
    cavityBoundaryModel: "declared",
    cycleAverageClosureStatus: "pass",
    dutyCycleStatus: "pass",
    lightCrossingConsistencyStatus: "pass",
    conservationDiagnostics: {
      divTStatus: "pass",
      divTResidualLInf: 0,
      continuityResidualLInf: 0,
      momentumResidualLInf: 0,
    },
    regions: regions.map((regionId) => region(regionId, mode, regionId === metricEchoRegion)),
    literatureRefs: ["fixture"],
  });

const withTemp = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), "nhm2-source-component-ledger-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("NHM2 source component authority ledger", () => {
  it("marks a source-side full tensor counterpart complete component by component", () => {
    const ledger = buildNhm2SourceComponentAuthorityLedger({
      generatedAt: "2026-06-13T00:00:00.000Z",
      counterpartArtifactRef: "counterpart.json",
      counterpartArtifact: counterpart(),
    });

    expect(isNhm2SourceComponentAuthorityLedger(ledger)).toBe(true);
    expect(ledger.summary.sourceSideComponentAuthorityComplete).toBe(true);
    expect(ledger.summary.anyMissing).toBe(false);
    expect(ledger.regions.find((entry) => entry.regionId === "wall")?.components).toHaveLength(10);
  });

  it("does not silently zero-fill missing momentum density or off-diagonal stresses", () => {
    const ledger = buildNhm2SourceComponentAuthorityLedger({
      generatedAt: "2026-06-13T00:00:00.000Z",
      counterpartArtifactRef: "counterpart.json",
      counterpartArtifact: counterpart("diagonal_reduced_order"),
    });

    expect(ledger.summary.sourceSideComponentAuthorityComplete).toBe(false);
    expect(ledger.summary.anyMissing).toBe(true);
    expect(ledger.summary.missingComponentRefs).toContain("wall:T01");
    expect(ledger.summary.missingComponentRefs).toContain("wall:T12");
    expect(ledger.regions.find((entry) => entry.regionId === "wall")?.status).toBe("review");
  });

  it("flags metric echoes at component level", () => {
    const ledger = buildNhm2SourceComponentAuthorityLedger({
      generatedAt: "2026-06-13T00:00:00.000Z",
      counterpartArtifactRef: "counterpart.json",
      counterpartArtifact: counterpart("full_tensor", "wall"),
    });

    expect(ledger.summary.anyMetricEcho).toBe(true);
    expect(ledger.summary.metricEchoComponentRefs).toContain("wall:T00");
    expect(ledger.regions.find((entry) => entry.regionId === "wall")?.status).toBe("fail");
  });

  it("publisher emits both component ledger and full tensor counterpart receipt", () =>
    withTemp((root) => {
      writeFileSync(join(root, "counterpart.json"), JSON.stringify(counterpart()), "utf8");

      const { ledger, fullTensorCounterpart } = publishSourceComponentAuthorityLedger({
        repoRoot: root,
        tileEffectiveCounterpartPath: "counterpart.json",
        outPath: "component-ledger.json",
        fullTensorCounterpartOutPath: "full-counterpart.json",
      });

      expect(isNhm2SourceComponentAuthorityLedger(ledger)).toBe(true);
      expect(fullTensorCounterpart).not.toBeNull();
      expect(isNhm2TileEffectiveFullTensorCounterpart(fullTensorCounterpart)).toBe(true);
      expect(fullTensorCounterpart?.summary.tileEffectiveCounterpartFullTensorAvailable).toBe(true);
      expect(fullTensorCounterpart?.claimBoundary.targetEchoForbidden).toBe(true);
    }));
});
