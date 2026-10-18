import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  writeCurvatureLeverageBenchmarkLadder,
  type CurvatureLeverageBenchmarkLadderReport,
} from "../scripts/curvature-leverage-benchmark-ladder";
import { writeCurvatureLeverageBenchmarkSweep } from "../scripts/curvature-leverage-benchmark-sweep";
import { kappa_body } from "../shared/curvature-proxy";
import { C, G } from "../shared/physics-const";

const constantsPath = "configs/constants/codata-2022.v1.json";
const benchmarksPath = "configs/curvature-leverage-benchmarks.v1.json";
const tempRoots: string[] = [];

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeNhm2Fixture(): { root: string; nhm2Path: string; outPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "curvature-benchmark-ladder-"));
  tempRoots.push(root);
  const nhm2Path = path.join(root, "nhm2-curvature-leverage.json");
  const outPath = path.join(root, "ladder.json");

  writeJson(nhm2Path, {
    artifactId: "nhm2_curvature_leverage_report",
    schemaVersion: "v1",
    promotionAllowed: false,
    regions: [
      {
        lane: "nhm2_full_solve",
        region: "wall",
        leverage: 1e-28,
        tensorNorm_m2: 1e-34,
        leverLength_m: 1000,
        sourceRegionStatus: "review",
        observerClosureStatus: "review",
        qeiStatus: "missing",
        conservationStatus: "present",
        promotionAllowed: false,
      },
      {
        lane: "nhm2_full_solve",
        region: "hull",
        leverage: 1e-9,
        tensorNorm_m2: 1e-15,
        leverLength_m: 1000,
        sourceRegionStatus: "fail",
        observerClosureStatus: "review",
        qeiStatus: "missing",
        conservationStatus: "missing",
        promotionAllowed: false,
      },
    ],
  });

  return { root, nhm2Path, outPath };
}

function readConstants(): Record<string, { value: number }> {
  return JSON.parse(fs.readFileSync(constantsPath, "utf8")).constants;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("curvature leverage benchmark ladder", () => {
  it("proves the body-density leverage identity against compactness fixtures", () => {
    const { outPath } = makeNhm2Fixture();
    const report = writeCurvatureLeverageBenchmarkLadder({
      constantsPath,
      benchmarksPath,
      nhm2ReportPath: "missing-nhm2-report.json",
      outPath,
      generatedAt: "2026-05-19T00:00:00.000Z",
    });

    for (const id of [
      "earth_nominal_iau_b3",
      "sun_nominal_iau_b3",
      "jupiter_nominal_iau_b3",
    ]) {
      const record = report.benchmarks.find((entry) => entry.id === id);
      expect(record).toBeTruthy();
      expect(record?.lane).toBe("compactness_identity");
      expect(record?.marginKind).toBe("identity_check");
      expect(record?.referenceNote).toContain("exact by convention");
      expect(record?.relativeError).toBeLessThan(1e-14);
      expect(record?.promotionAllowed).toBe(false);
    }

    const constants = readConstants();
    const mu = constants.nominal_terrestrial_GM_m3_s2.value;
    const radius = constants.nominal_terrestrial_equatorial_radius_m.value;
    const mass = mu / G;
    const density = (3 * mass) / (4 * Math.PI * radius ** 3);
    expect(kappa_body(density) * radius * radius).toBeCloseTo(
      (2 * mu) / (radius * C * C),
      14,
    );
  });

  it("places quantum, Casimir, planetary, stellar, and horizon references on one scale", () => {
    const { outPath } = makeNhm2Fixture();
    const report = writeCurvatureLeverageBenchmarkLadder({
      constantsPath,
      benchmarksPath,
      nhm2ReportPath: "missing-nhm2-report.json",
      outPath,
    });

    const byId = new Map(report.benchmarks.map((entry) => [entry.id, entry]));
    expect(byId.get("planck_mass_planck_length")?.leverage).toBeCloseTo(2, 14);
    expect(byId.get("schwarzschild_horizon")?.leverage).toBe(1);

    const hydrogen = byId.get("hydrogen_bohr_radius");
    expect(hydrogen?.leverage).toBeGreaterThan(1e-45);
    expect(hydrogen?.leverage).toBeLessThan(1e-42);

    const proton = byId.get("proton_charge_radius");
    expect(proton?.leverage).toBeGreaterThan(1e-40);
    expect(proton?.leverage).toBeLessThan(1e-37);

    const casimirGap = byId.get("casimir_1nm_gap_scale");
    expect(casimirGap?.leverage).toBeGreaterThan(1e-54);
    expect(casimirGap?.leverage).toBeLessThan(1e-51);
    expect(casimirGap?.marginKind).toBe("model_self_reference");
    expect(casimirGap?.marginBand).toBe("sub_quantum_gravity_floor");

    const casimirKm = byId.get("casimir_1nm_1km_scale");
    expect(casimirKm?.leverage).toBeGreaterThan(1e-30);
    expect(casimirKm?.leverage).toBeLessThan(1e-27);
    expect(casimirKm?.marginBand).toBe("laboratory_macro_floor");

    expect(byId.get("earth_nominal_iau_b3")?.leverage).toBeGreaterThan(1e-10);
    expect(byId.get("earth_nominal_iau_b3")?.leverage).toBeLessThan(1e-8);
    expect(byId.get("sun_nominal_iau_b3")?.leverage).toBeGreaterThan(1e-6);
    expect(byId.get("sun_nominal_iau_b3")?.leverage).toBeLessThan(1e-5);
    expect(byId.get("moon_compactness")?.empiricalGravityBenchmark).toBe(true);
    expect(byId.get("saturn_compactness")?.empiricalGravityBenchmark).toBe(true);
    expect(byId.get("mimas_compactness")?.marginKind).toBe("model_self_reference");
    expect(byId.get("saturn_b_ring_density_wave_tidal_100km")?.lane).toBe(
      "ring_response_calibration",
    );
  });

  it("emits NHM2 comparisons without allowing benchmark promotion", () => {
    const { nhm2Path, outPath } = makeNhm2Fixture();
    const report = writeCurvatureLeverageBenchmarkLadder({
      constantsPath,
      benchmarksPath,
      nhm2ReportPath: nhm2Path,
      outPath,
      generatedAt: "2026-05-19T00:00:00.000Z",
    });

    expect(fs.existsSync(outPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outPath, "utf8")) as CurvatureLeverageBenchmarkLadderReport;
    expect(written).toEqual(report);
    expect(written.promotionAllowed).toBe(false);
    expect(written.nhm2Comparisons.length).toBe(2);

    for (const comparison of written.nhm2Comparisons) {
      expect(comparison.promotionAllowed).toBe(false);
      expect(comparison.nearestBenchmark.id).toBeTruthy();
      expect(comparison.nearestEmpiricalGravityBenchmark?.id).toBeTruthy();
      expect(comparison.nearestEmpiricalGravityBenchmark?.lane).toBe(
        "external_observable_calibration",
      );
      expect(comparison.ordersAboveRawCasimir1km).not.toBeNull();
      expect(comparison.ordersBelowBlackHoleHorizon).not.toBeNull();
      expect(["missing", "present"]).toContain(comparison.qeiStatus);
      expect(["missing", "present"]).toContain(comparison.conservationStatus);
    }

    const wall = written.nhm2Comparisons.find((entry) => entry.region === "wall");
    expect(wall?.sourceClosureStatus).toBe("review");
    expect(wall?.nearestBenchmark.id).toBe("casimir_1nm_1km_scale");
    expect(wall?.nearestEmpiricalGravityBenchmark?.id).toBe("mimas_compactness");
    expect(wall?.ordersAboveRawCasimir1km).toBeGreaterThan(0);
    expect(JSON.stringify(written)).not.toContain("\"promotionAllowed\":true");
  });

  it("writes diagnostic sweep artifacts with expected log-log slopes", () => {
    const { nhm2Path, root } = makeNhm2Fixture();
    const outDir = path.join(root, "sweeps");
    const sweep = writeCurvatureLeverageBenchmarkSweep({
      constantsPath,
      nhm2ReportPath: nhm2Path,
      outDir,
      generatedAt: "2026-05-19T00:00:00.000Z",
    });

    expect(fs.existsSync(path.join(outDir, "gap-scale-sweep-latest.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "lever-length-sweep-latest.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "nhm2-region-scale-sweep-latest.json"))).toBe(true);
    expect(sweep.gapScaleSweep.promotionAllowed).toBe(false);
    expect(sweep.leverLengthSweep.sweep.expectedLogLogSlope).toBe(2);
    expect(sweep.nhm2RegionScaleSweep.samples.length).toBe(8);

    expect(logLogSlope(
      sweep.leverLengthSweep.samples[0].leverLength_m,
      sweep.leverLengthSweep.samples[0].leverage,
      sweep.leverLengthSweep.samples.at(-1)?.leverLength_m ?? Number.NaN,
      sweep.leverLengthSweep.samples.at(-1)?.leverage ?? Number.NaN,
    )).toBeCloseTo(2, 12);

    const wallSamples = sweep.nhm2RegionScaleSweep.samples.filter(
      (entry) => entry.region === "wall",
    );
    expect(wallSamples.length).toBe(4);
    expect(logLogSlope(
      wallSamples[0].leverLength_m,
      wallSamples[0].leverage,
      wallSamples.at(-1)?.leverLength_m ?? Number.NaN,
      wallSamples.at(-1)?.leverage ?? Number.NaN,
    )).toBeCloseTo(2, 12);
  });
});

function logLogSlope(x0: number, y0: number, x1: number, y1: number): number {
  return (Math.log10(y1) - Math.log10(y0)) / (Math.log10(x1) - Math.log10(x0));
}
