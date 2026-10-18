import { describe, it, expect, beforeEach } from "vitest";
import { buildEnergyFieldFromSunpy } from "../server/services/essence/solar-energy-adapter";
import type { SunpyExportPayload } from "../server/services/essence/sunpy-coherence-bridge";
import {
  logSolarForecastFromFeatures,
  logSolarOutcome,
  evaluateSolarForecasts,
  resetSolarForecastLogs,
} from "../server/services/essence/solar-forecast";

const float32ToB64 = (arr: Float32Array) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
const isoPlus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

const makePayload = (): SunpyExportPayload => {
  const t0 = "2025-02-01T00:00:00.000Z";
  const grid_size = 2;
  const map = new Float32Array([0.2, 0.4, 0.6, 0.8]);
  return {
    instrument: "AIA",
    wavelength_A: 193,
    meta: { start: t0, end: isoPlus(t0, 5 * 60_000), cadence_s: 60 },
    frames: [{ index: 0, obstime: isoPlus(t0, 60_000), grid_size, map_b64: float32ToB64(map) }],
    events: [],
    cdaweb: null,
    jsoc_sharp: null,
    jsoc_cutout: null,
    goes_xrs: null,
  };
};

beforeEach(() => {
  resetSolarForecastLogs();
});

describe("solar forecast loop", () => {
  it("logs forecasts and evaluates Brier/AUC deterministically", () => {
    const payload = makePayload();
    const asOf = payload.meta?.end;
    const features = buildEnergyFieldFromSunpy(payload, { asOf });

    const issued = isoPlus(asOf!, 0);
    const forecast = logSolarForecastFromFeatures(features, {
      issued_at_iso: issued,
      horizon_s: 600,
      model_version: "solar-proxy-v1",
      p_event: 0.6,
    });
    expect(forecast.inputs_hash).toBe(forecast.information_boundary.inputs_hash);
    expect(forecast.features_hash).toBe(forecast.information_boundary.features_hash);
    expect(forecast.information_boundary.mode).toBe("observables");

    logSolarOutcome({
      window_start_iso: isoPlus(issued, 120_000),
      window_end_iso: isoPlus(issued, 600_000),
      event_present: true,
      label_source: "spec-fixture",
    });

    const report = evaluateSolarForecasts({ horizon_s: 600 });
    expect(report.count).toBe(1);
    expect(report.joined).toBe(1);
    expect(report.brier_score).toBeCloseTo(Math.pow(0.6 - 1, 2), 12);
    expect(report.auc).toBeNull(); // only one sample => null AUC
    expect(report.information_boundary.inputs_hash).toBe(report.inputs_hash);
    expect(report.information_boundary.features_hash).toBe(report.features_hash);
  });

  it("enforces timing guards for issued_at and label windows", () => {
    const payload = makePayload();
    const asOf = payload.meta?.end;
    const features = buildEnergyFieldFromSunpy(payload, { asOf });

    expect(() =>
      logSolarForecastFromFeatures(features, {
        issued_at_iso: isoPlus(asOf!, -1_000),
        horizon_s: 600,
        model_version: "solar-proxy-v1",
        p_event: 0.3,
      }),
    ).toThrow();

    const forecast = logSolarForecastFromFeatures(features, {
      issued_at_iso: asOf!,
      horizon_s: 600,
      model_version: "solar-proxy-v1",
      p_event: 0.3,
    });

    logSolarOutcome({
      window_start_iso: isoPlus(asOf!, -30_000), // before data_cutoff -> should trip join guard
      window_end_iso: isoPlus(asOf!, 60_000),
      event_present: false,
    });

    expect(() => evaluateSolarForecasts({ horizon_s: forecast.horizon_s })).toThrow();
  });
});
