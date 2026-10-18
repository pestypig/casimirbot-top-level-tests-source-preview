import { describe, expect, it } from "vitest";
import { scanK3FrequencyBand } from "../server/services/physics/curvature-phase-lock";

const buildSeries = (freqHz: number, dt: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const t = i * dt;
    const drive = Math.sin(2 * Math.PI * freqHz * t);
    const noise = 0.2 * Math.sin(2 * Math.PI * 7 * t);
    return {
      t_s: t,
      k1: 1.2 + 0.6 * drive + noise,
      frame_id: `f${i}`,
      timestamp_iso: new Date(1_700_000_000_000 + t * 1000).toISOString(),
    };
  });

describe("phase-lock scan", () => {
  it("finds the dominant frequency within tolerance", () => {
    const targetHz = 2.0;
    const series = buildSeries(targetHz, 0.05, 240);
    const fGrid = Array.from({ length: 41 }, (_, i) => 0.5 + i * 0.1);
    const first = scanK3FrequencyBand(series, fGrid, {
      window_cycles: 3,
      min_window_s: 0.05,
      band_threshold_ratio: 0.8,
    });
    const second = scanK3FrequencyBand(series, fGrid, {
      window_cycles: 3,
      min_window_s: 0.05,
      band_threshold_ratio: 0.8,
    });

    expect(first.k3ByF.length).toBe(fGrid.length);
    expect(first.fStar).toBeDefined();
    expect(Math.abs((first.fStar ?? 0) - targetHz)).toBeLessThan(0.2);
    expect(first).toEqual(second);
  });
});
