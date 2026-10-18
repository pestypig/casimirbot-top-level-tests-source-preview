import { describe, expect, it, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { buildEnergyFieldFromSunpy, runSolarCurvatureFromSunpy } from "../server/services/essence/solar-energy-adapter";
import { loadSolarEnergyCalibration } from "../server/services/essence/solar-energy-adapter";
import type { SunpyExportPayload } from "../server/services/essence/sunpy-coherence-bridge";
import { resetDbClient } from "../server/db/client";
import { resetEnvelopeStore } from "../server/services/essence/store";

const float32ToB64 = (arr: Float32Array) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
const isoPlusMs = (baseIso: string, deltaMs: number) => new Date(Date.parse(baseIso) + deltaMs).toISOString();
const fixturePath = path.resolve(process.cwd(), "datasets", "solar-energy-proxy.fixture.json");
const itWithFixture = existsSync(fixturePath) ? it : it.skip;

let tmpDir = "";

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "solar-energy-adapter-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://solar-energy-adapter";
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

const basePayload = (): SunpyExportPayload => {
  const t0 = "2025-01-01T00:00:00.000Z";
  const grid_size = 4;
  const map = new Float32Array([0, 0.5, 1, 0.25, 0.1, 0.2, 0.3, 0.4, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75]);
  return {
    instrument: "AIA",
    wavelength_A: 193,
    meta: { start: t0, end: isoPlusMs(t0, 5 * 60_000), cadence_s: 60 },
    frames: [{ index: 0, obstime: isoPlusMs(t0, 60_000), grid_size, map_b64: float32ToB64(map) }],
    events: [
      { event_type: "FL", start_time: isoPlusMs(t0, 120_000), end_time: isoPlusMs(t0, 180_000), goes_class: "M1.0" },
    ],
    cdaweb: null,
    jsoc_sharp: null,
    jsoc_cutout: null,
    goes_xrs: null,
  };
};

describe("solar energy adapter", () => {
  it("maps SunPy frames to u_field using the versioned calibration (deterministic hashes)", () => {
    const payload = basePayload();
    const asOf = payload.meta?.end;
    const energyField = buildEnergyFieldFromSunpy(payload, { asOf, leakageSentinel: true });
    const calib = loadSolarEnergyCalibration();
    const vSample = Math.pow(0.5, calib.u_exponent ?? 1) * calib.u_total_scale_Jm3;

    expect(energyField.components.u_total_Jm3.encoding).toBe("base64");
    expect(energyField.meta?.calibration_version).toBe(calib.version);
    expect(energyField.data_cutoff_iso).toBe(asOf);
    expect(energyField.inputs_hash).toBe(energyField.information_boundary.inputs_hash);
    expect(energyField.features_hash).toBe(energyField.information_boundary.features_hash);
    expect(energyField.information_boundary.mode).toBe("observables");
    expect((energyField.meta as any)?.provenance_class).toBe("inferred");
    expect((energyField.meta as any)?.claim_tier).toBe("diagnostic");
    expect((energyField.meta as any)?.certifying).toBe(false);

    const buf = Buffer.from(energyField.components.u_total_Jm3.data_b64, "base64");
    const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    expect(arr[1]).toBeCloseTo(vSample, 8);
    expect(arr[2]).toBeCloseTo(calib.u_total_scale_Jm3, 8);
  });

  itWithFixture("matches the fixture dataset hashes", () => {
    const manifest = JSON.parse(readFileSync(fixturePath, "utf8"));
    const entry = manifest.entries[0];
    const payload: SunpyExportPayload = {
      instrument: entry.input.instrument,
      wavelength_A: entry.input.wavelength_A,
      meta: { start: entry.input.start, end: entry.input.end },
      frames: [{ index: 0, obstime: entry.input.end, grid_size: entry.input.grid_size, map_b64: entry.input.map_b64 }],
      events: [],
      cdaweb: null,
      jsoc_sharp: null,
      jsoc_cutout: null,
      goes_xrs: null,
    };
    const field = buildEnergyFieldFromSunpy(payload, { calibrationVersion: entry.input.calibration_version, asOf: entry.input.end });
    expect(field.inputs_hash).toBe(entry.expected.hashes.inputs_hash);
    expect(field.features_hash).toBe(entry.expected.hashes.features_hash);
  });

  it("keeps hashes invariant when HEK rows mutate in observables-only mode", () => {
    const payloadA = basePayload();
    const payloadB = { ...payloadA, events: [{ event_type: "FL", start_time: payloadA.meta?.start, goes_class: "X9.9" }] } as SunpyExportPayload;

    const a = buildEnergyFieldFromSunpy(payloadA, { leakageSentinel: true });
    const b = buildEnergyFieldFromSunpy(payloadB, { leakageSentinel: true });

    expect(a.inputs_hash).toBe(b.inputs_hash);
    expect(a.features_hash).toBe(b.features_hash);
    expect(a.information_boundary.inputs_hash).toBe(b.information_boundary.inputs_hash);
    expect(a.information_boundary.features_hash).toBe(b.information_boundary.features_hash);
  });

  it("refuses to apply the AIA energy proxy to DKIST 416 nm photospheric continuum", () => {
    const payload = basePayload();
    payload.instrument = "DKIST_FastCam";
    payload.wavelength_A = 4160;
    expect(() => buildEnergyFieldFromSunpy(payload)).toThrow(
      "solar_energy_calibration_incompatible_photospheric_continuum",
    );
  });


  it("marks strict non-measured provenance with deterministic fail_reason", () => {
    const payload = basePayload();
    const energyField = buildEnergyFieldFromSunpy(payload, {
      provenanceClass: "proxy",
      claimTier: "certified",
      strictMeasuredProvenance: true,
    });

    expect((energyField.meta as any)?.provenance_class).toBe("proxy");
    expect((energyField.meta as any)?.claim_tier).toBe("diagnostic");
    expect((energyField.meta as any)?.certifying).toBe(false);
    expect((energyField.meta as any)?.fail_reason).toBe("STAR_MATERIALS_PROVENANCE_NON_MEASURED");
  });

  it("runs curvature unit on the calibrated u_field and respects data_cutoff", async () => {
    const payload = basePayload();
    const asOf = payload.meta?.end;
    const { energyField, curvature } = await runSolarCurvatureFromSunpy(payload, {
      asOf,
      personaId: "persona:solar-energy-test",
      persistEnvelope: false,
    });

    expect(energyField.data_cutoff_iso).toBe(asOf);
    expect(curvature.summary.total_energy_J).toBeGreaterThan(0);
    expect(curvature.summary.residual_rms).toBeGreaterThanOrEqual(0);
    expect(curvature.artifacts.energy_field_url).toBeTruthy();
  });
});
