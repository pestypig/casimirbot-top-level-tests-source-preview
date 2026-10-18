import { describe, it, expect } from "vitest";
import { makeGrid, noteBoundaries, barBoundaries } from "../client/src/lib/noise/beat-scheduler";

describe("Beat scheduler determinism", () => {
  it("yields stable 1/16 boundaries at awkward BPM", () => {
    const sr = 48_000;
    const bpm = 123;
    const grid = makeGrid(sr, bpm, "4/4", 0);
    const start = 0;
    const end = sr * 60;
    const xs = noteBoundaries(grid, "1/16", start, end);
    const ys = noteBoundaries(grid, "1/16", start, end);
    expect(xs).toEqual(ys);
    expect(xs.length).toBeGreaterThan(0);
  });

  it("bar boundaries align with beat * numerator", () => {
    const grid = makeGrid(48_000, 100, "3/4", 0);
    const bounds = barBoundaries(grid, 0, 48_000 * 5);
    expect(bounds.length).toBeGreaterThan(1);
    const delta = Math.abs(bounds[1] - bounds[0] - Math.round(grid.spBar));
    expect(delta <= 1).toBe(true);
  });
});
