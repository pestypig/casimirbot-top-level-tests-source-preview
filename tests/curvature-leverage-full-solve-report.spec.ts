import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  writeNhm2CurvatureLeverageReport,
  type Nhm2CurvatureLeverageReport,
} from "../scripts/curvature-leverage-full-solve-report";
import { kappa_u } from "../shared/curvature-proxy";

const tempRoots: string[] = [];

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeFixture(): { metricPath: string; evidencePath: string; outPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "curvature-leverage-report-"));
  tempRoots.push(root);

  const metricPath = path.join(root, "metric-required.json");
  const evidencePath = path.join(root, "regional-evidence.json");
  const outPath = path.join(root, "report.json");

  writeJson(metricPath, {
    artifactId: "nhm2_source_closure_diagonal_tensor",
    schemaVersion: "nhm2_source_closure_diagonal_tensor/v1",
    tensorRole: "metric_required",
    regionId: null,
    diagonalTensor: { T00: -10, T11: 10, T22: 10, T33: 10 },
  });

  writeJson(evidencePath, {
    artifactId: "nhm2_regional_source_closure_evidence",
    schemaVersion: "nhm2_regional_source_closure_evidence/v1",
    regions: [
      {
        regionId: "wall",
        status: "review",
        comparisonBasisStatus: "aggregation_mismatch",
        metricRequired: {
          tensorRef: "artifact://nhm2/metric-required/wall",
          unitsRef: "J/m^3",
          tensor: { T00: -30, T11: 10, T22: 20, T33: 5 },
        },
        tileEffectiveCounterpart: {
          tensorRef: "artifact://nhm2/tile-effective/wall",
        },
        residuals: {
          relLInf: 0.2,
        },
        blockers: ["qei_missing"],
      },
      {
        regionId: "hull",
        status: "fail",
        comparisonBasisStatus: "same_basis",
        metricRequired: {
          tensorRef: "artifact://nhm2/metric-required/hull",
          unitsRef: "geometric_units",
          tensor: { T00: -4e-12, T11: 2e-12, T22: 1e-12, T33: 1e-12 },
        },
        tileEffectiveCounterpart: {
          tensorRef: "artifact://nhm2/tile-effective/hull",
        },
        residuals: {
          relLInf: 0.5,
        },
        blockers: ["residual_exceeded"],
      },
    ],
  });

  return { metricPath, evidencePath, outPath };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("NHM2 curvature leverage full-solve report", () => {
  it("emits non-promoting regional leverage records from full-solve tensor evidence", () => {
    const { metricPath, evidencePath, outPath } = makeFixture();

    const report = writeNhm2CurvatureLeverageReport({
      metricRequiredPath: metricPath,
      regionalEvidencePath: evidencePath,
      outPath,
      leverLengths: { wall: 1_200, hull: 800 },
      qeiStatus: "missing",
      conservationStatus: "present",
      generatedAt: "2026-05-19T00:00:00.000Z",
    });

    expect(fs.existsSync(outPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outPath, "utf8")) as Nhm2CurvatureLeverageReport;
    expect(written).toEqual(report);
    expect(written.promotionAllowed).toBe(false);
    expect(written.source.claimRoute).toBe("full_solve_tensor_required_only");
    expect(written.regions.length).toBe(2);

    for (const region of written.regions) {
      expect(region.lane).toBe("nhm2_full_solve");
      expect(region.metricRequiredTensorRef).toBeTruthy();
      expect(region.promotionAllowed).toBe(false);
      expect(region.qeiStatus).toBe("missing");
      expect(region.conservationStatus).toBe("present");
      expect(region.leverage).toBeCloseTo(
        Math.abs(region.tensorNorm_m2) * region.leverLength_m * region.leverLength_m,
        18,
      );
    }

    const wall = written.regions.find((region) => region.region === "wall");
    expect(wall?.tensorNormRoute).toBe("energy_density_to_kappa_u");
    expect(wall?.tensorNorm_m2).toBeCloseTo(kappa_u(30), 18);
    expect(wall?.leverage).toBeCloseTo(kappa_u(30) * 1_200 * 1_200, 18);

    const hull = written.regions.find((region) => region.region === "hull");
    expect(hull?.tensorNormRoute).toBe("geometric_tensor_norm");
    expect(hull?.tensorNorm_m2).toBeCloseTo(4e-12, 18);
    expect(hull?.leverage).toBeCloseTo(4e-12 * 800 * 800, 18);
  });

  it("does not use external observable lanes as NHM2 sources", () => {
    const { metricPath, evidencePath, outPath } = makeFixture();
    const report = writeNhm2CurvatureLeverageReport({
      metricRequiredPath: metricPath,
      regionalEvidencePath: evidencePath,
      outPath,
    });

    const externalLanes = new Set([
      "self_gravity_shape",
      "tidal_response",
      "ring_wave_response",
      "stellar_hydrostatic",
    ]);
    expect(report.regions.some((region) => externalLanes.has(region.lane))).toBe(false);
  });
});
