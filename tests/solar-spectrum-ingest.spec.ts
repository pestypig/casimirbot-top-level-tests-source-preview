import { describe, expect, it, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import {
  DEFAULT_SOLAR_SPECTRUM_SPECS,
  ingestSolarSpectrumFile,
} from "../server/services/essence/solar-spectrum-ingest";
import { decodeFloat64Vector } from "@shared/solar-spectrum";
import {
  analyzeSolarSpectrum,
  planckRadianceLambda,
} from "@shared/solar-spectrum-analysis";
import { resetDbClient } from "../server/db/client";
import { resetEnvelopeStore } from "../server/services/essence/store";

let tmpDir = "";
const SOLAR_ISS_PATH = path.resolve(
  process.cwd(),
  "datasets",
  "solar",
  "spectra",
  "solar-iss",
  "v1.1",
  "spectrum.dat",
);
const SOLAR_HRS_PATH = path.resolve(
  process.cwd(),
  "datasets",
  "solar",
  "spectra",
  "solar-hrs",
  "v1",
  "Spectre_HR_Solar_position_LATMOS_Meftah_V1_1.txt",
);
const itWithSolarIss = existsSync(SOLAR_ISS_PATH) ? it : it.skip;
const itWithSolarHrs = existsSync(SOLAR_HRS_PATH) ? it : it.skip;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "solar-spectrum-ingest-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://solar-spectrum-ingest";
  await resetDbClient();
  await resetEnvelopeStore();
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_URL;
});

describe("solar spectrum ingest", () => {
  itWithSolarIss("ingests the SOLAR-ISS fixture deterministically and converts units", async () => {
    const spec = DEFAULT_SOLAR_SPECTRUM_SPECS[0];
    const first = await ingestSolarSpectrumFile(spec, { persistEnvelope: false });
    const second = await ingestSolarSpectrumFile(spec, { persistEnvelope: false });

    expect(first.spectrum.inputs_hash).toBe(second.spectrum.inputs_hash);
    expect(first.spectrum.features_hash).toBe(second.spectrum.features_hash);
    expect(first.analysis.inputs_hash).toBe(second.analysis.inputs_hash);
    expect(first.analysis.features_hash).toBe(second.analysis.features_hash);

    const series = first.spectrum.series[0];
    const wavelength = decodeFloat64Vector(series.wavelength_m);
    const ssi = decodeFloat64Vector(series.ssi_W_m2_m);
    expect(wavelength[0]).toBeCloseTo(200e-9, 12);
    expect(ssi[0]).toBeCloseTo(1.0e9, 6);
  });

  itWithSolarHrs("parses the mu grid into multiple series", async () => {
    const spec = DEFAULT_SOLAR_SPECTRUM_SPECS[3];
    const result = await ingestSolarSpectrumFile(spec, { persistEnvelope: false });
    expect(result.spectrum.series.length).toBe(3);
    const mus = result.spectrum.series.map((entry) => entry.mu ?? 0).sort((a, b) => b - a);
    expect(mus).toEqual([1, 0.5, 0.1]);
  });

  itWithSolarHrs("computes limb darkening curves for mu bands", async () => {
    const spec = DEFAULT_SOLAR_SPECTRUM_SPECS[3];
    const band = { id: "uv", lambda_min_m: 200e-9, lambda_max_m: 202e-9 };
    const result = await ingestSolarSpectrumFile(spec, {
      persistEnvelope: false,
      analysis: { bands: [band] },
    });
    const curves = result.analysis.limb_darkening ?? [];
    expect(curves.length).toBe(1);
    expect(curves[0].view).toBe("intermediate");
    expect(curves[0].reference_mu).toBe(1);

    const ratioAt = (mu: number) =>
      curves[0].points.find((point) => Math.abs(point.mu - mu) < 1e-6)?.ratio;
    expect(ratioAt(1)).toBeCloseTo(1, 8);
    expect(ratioAt(0.5)).toBeCloseTo(1.6 / 2.2, 6);
    expect(ratioAt(0.1)).toBeCloseTo(1.0 / 2.2, 6);
  });

  it("returns flat brightness temperature for a synthetic blackbody", () => {
    const tK = 5000;
    const wavelength = new Float64Array([500e-9, 600e-9, 700e-9]);
    const ssi = new Float64Array(
      Array.from(wavelength, (lambda) => planckRadianceLambda(lambda, tK)),
    );

    const analysis = analyzeSolarSpectrum(
      [
        {
          series_id: "bb",
          view: "disk_integrated",
          wavelength_m: wavelength,
          ssi_W_m2_m: ssi,
        },
      ],
      { t0_K: tK, omega_sun_sr: 1, fit: { min_T_K: 4800, max_T_K: 5200, coarse_steps: 6, refine_steps: 6 } },
    );

    for (const value of analysis.series[0].tb_K) {
      expect(value).toBeCloseTo(tK, 6);
    }
  });
});
