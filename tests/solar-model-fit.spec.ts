import { afterAll, beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import {
  DEFAULT_SOLAR_SPECTRUM_SPECS,
  ingestSolarSpectrumFile,
} from "../server/services/essence/solar-spectrum-ingest";
import { runSolarModelComparison } from "../server/services/essence/solar-spectrum-models";
import { SolarModelConfig } from "@shared/solar-model";
import { resetDbClient } from "../server/db/client";
import { resetEnvelopeStore } from "../server/services/essence/store";

let tmpDir = "";
const SOLAR_HRS_PATH = path.resolve(
  process.cwd(),
  "datasets",
  "solar",
  "spectra",
  "solar-hrs",
  "v1",
  "Spectre_HR_Solar_position_LATMOS_Meftah_V1_1.txt",
);
const itWithSolarHrs = existsSync(SOLAR_HRS_PATH) ? it : it.skip;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "solar-model-fit-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://solar-model-fit";
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

describe("solar model comparison", () => {
  itWithSolarHrs("compares opacity-depth and emissivity models on mu-grid spectra", async () => {
    const spec =
      DEFAULT_SOLAR_SPECTRUM_SPECS.find((item) => item.id === "solar-hrs-v1-mu-grid") ??
      DEFAULT_SOLAR_SPECTRUM_SPECS[3];
    const ingest = await ingestSolarSpectrumFile(spec, { persistEnvelope: false });

    const configs = [
      SolarModelConfig.parse({
        schema_version: "solar_model_config/1",
        model_family: "opacity_depth",
        parameter_bounds: {
          T_ref_K: { min: 5000, max: 6200 },
          alpha: { min: -0.1, max: 0.1 },
          scale: { min: 0.8, max: 1.2 },
          limb_u1: { min: 0.1, max: 0.9 },
          limb_u2: { min: 0.05, max: 0.6 },
        },
        mu_policy: { mode: "mu-grid", stability_target: 0 },
        continuum_windows_m: [
          [200e-9, 210e-9],
          [400e-9, 410e-9],
        ],
        grid: { coarse_samples: 20, refine_samples: 10 },
      }),
      SolarModelConfig.parse({
        schema_version: "solar_model_config/1",
        model_family: "emissivity_drude",
        parameter_bounds: {
          T_ref_K: { min: 5000, max: 6200 },
          eps_base: { min: 0.6, max: 1.1 },
          drude_amp: { min: 0.0, max: 0.6 },
          drude_lambda_m: { min: 150e-9, max: 900e-9 },
          defect_amp: { min: 0.0, max: 0.4 },
          defect_lambda_m: { min: 200e-9, max: 1200e-9 },
          defect_sigma_m: { min: 20e-9, max: 200e-9 },
          mu_exp: { min: 0.0, max: 1.2 },
        },
        mu_policy: { mode: "mu-grid", stability_target: 0 },
        continuum_windows_m: [
          [200e-9, 210e-9],
          [400e-9, 410e-9],
        ],
        grid: { coarse_samples: 20, refine_samples: 10 },
      }),
    ];

    const result = await runSolarModelComparison({
      spectrum: ingest.spectrum,
      analysis: ingest.analysis,
      configs,
      guardrailInputs: {
        density_kg_m3: 5e-6,
        pressure_Pa: 5e4,
        scale_height_km: 150,
        opacity_regime: "H-",
      },
    });

    expect(result.report.models.length).toBe(2);
    expect(result.report.model_configs.length).toBe(2);
    expect(result.report.guardrails.summary.hard_fail_count).toBe(0);
    expect(result.report.viability.reasons).not.toContain("guardrails:hard_fail");
    expect(result.report.inputs_hash).toContain("sha256:");

    const families = result.report.models.map((model) => model.model_family).sort();
    expect(families).toEqual(["emissivity_drude", "opacity_depth"]);
    for (const model of result.report.models) {
      expect(model.metrics.rmse).toBeGreaterThan(0);
    }
  });
});
