import { describe, expect, it } from "vitest";

import { isNhm2WallSourceLayeringSweepArtifact } from "../shared/contracts/nhm2-wall-source-layering-sweep.v1";
import { buildWallSourceLayeringSweep } from "../tools/nhm2/build-wall-source-layering-sweep";

const generatedAt = "2026-06-12T00:00:00.000Z";

describe("NHM2 wall-source layering sweep", () => {
  it("anchors the current wall scalar gap to the tile-local source and metric-required wall T00", () => {
    const artifact = buildWallSourceLayeringSweep({ generatedAt });

    expect(artifact.baseline.requiredWallT00AbsSI).toBeCloseTo(1.6995e9, 1);
    expect(artifact.baseline.tileLocalWallT00AbsSI).toBeCloseTo(
      3_808_962.223968027,
      6,
    );
    expect(artifact.baseline.requiredMultiplier).toBeCloseTo(
      446.18452483089413,
      6,
    );
    expect(artifact.baseline.baselineWarnings).toContain(
      "required_wall_t00_fallback_from_current_whitepaper_read",
    );
    expect(isNhm2WallSourceLayeringSweepArtifact(artifact)).toBe(true);
  });

  it("marks 447 ideal fixed-volume layers as a scalar T00 pass but never a physical pass", () => {
    const artifact = buildWallSourceLayeringSweep({
      generatedAt,
      layerCounts: [447],
      packingFractions: [1],
      orientationProjections: [1],
      materialCorrections: [1],
      metricReliefFactors: [1],
    });
    const row = artifact.sweepRows[0];

    expect(row.layerCount).toBe(447);
    expect(row.idealStackThicknessMeters).toBeCloseTo(0.001344576, 12);
    expect(row.fixedVolumeResidual).toBeLessThan(0.01);
    expect(row.scalarT00Pass10pct).toBe(true);
    expect(row.scalarT00Pass1pct).toBe(true);
    expect(row.physicalPassAllowed).toBe(false);
    expect(row.blockers).toContain("scalar_t00_only_not_full_tensor");
    expect(artifact.claimBoundary.scalarT00CannotSubstituteForFullTensor).toBe(true);
  });

  it("keeps expanded-wall-volume layering from inheriting a fixed-volume scalar pass", () => {
    const artifact = buildWallSourceLayeringSweep({
      generatedAt,
      layerCounts: [447],
      packingFractions: [1],
      orientationProjections: [1],
      materialCorrections: [1],
      metricReliefFactors: [1],
    });
    const row = artifact.sweepRows[0];

    expect(row.scalarT00Pass10pct).toBe(true);
    expect(row.expandedVolumeSourceMultiplier).toBeCloseTo(447 / 448, 12);
    expect(row.expandedScalarT00Pass10pct).toBe(false);
    expect(row.blockers).toContain(
      "expanded_volume_does_not_preserve_fixed_volume_pass",
    );
  });

  it("shows metric-relief parameters can reduce the ideal layer count without becoming solve evidence", () => {
    const artifact = buildWallSourceLayeringSweep({
      generatedAt,
      layerCounts: [20],
      packingFractions: [1],
      orientationProjections: [1],
      materialCorrections: [1],
      metricReliefFactors: [21.1],
    });
    const row = artifact.sweepRows[0];

    expect(row.requiredIdealLayerCountAtCurrentFactors).toBe(22);
    expect(row.scalarT00Pass10pct).toBe(true);
    expect(row.scalarT00Pass1pct).toBe(false);
    expect(row.blockers).toContain("metric_relief_is_parameter_not_solve_artifact");
  });

  it("shows material correction penalties push the scalar layer requirement back up", () => {
    const artifact = buildWallSourceLayeringSweep({
      generatedAt,
      layerCounts: [447],
      packingFractions: [1],
      orientationProjections: [1],
      materialCorrections: [0.1],
      metricReliefFactors: [1],
    });
    const row = artifact.sweepRows[0];

    expect(row.requiredIdealLayerCountAtCurrentFactors).toBe(4462);
    expect(row.scalarT00Pass10pct).toBe(false);
    expect(row.blockers).toContain("material_correction_is_parameter_not_receipt");
  });

  it("records tile coverage scale without using tile count as source closure", () => {
    const artifact = buildWallSourceLayeringSweep({ generatedAt });

    expect(artifact.hullSurfaceEstimate.tileAreaMeters2).toBeCloseTo(1e-4, 12);
    expect(artifact.hullSurfaceEstimate.boxTilesPerLayer).toBeGreaterThan(
      artifact.hullSurfaceEstimate.ellipsoidTilesPerLayer,
    );
    expect(artifact.claimBoundary.sweepDoesNotValidatePhysicalSource).toBe(true);
    expect(artifact.claimBoundary.materialReceiptStillRequired).toBe(true);
  });
});
