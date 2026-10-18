import { describe, expect, it } from "vitest";
import { buildRidgeSurvival } from "../server/services/physics/ridge-survival";
import type { RidgeTrack } from "../server/services/physics/curvature-metrics";

describe("ridge survival", () => {
  it("computes survival and hazard for known lifetimes", () => {
    const tracks: RidgeTrack[] = [
      { id: "r1", first_frame: 0, last_frame: 0, lifetime_frames: 1 },
      { id: "r2", first_frame: 0, last_frame: 1, lifetime_frames: 2 },
      { id: "r3", first_frame: 0, last_frame: 1, lifetime_frames: 2 },
      { id: "r4", first_frame: 0, last_frame: 2, lifetime_frames: 3 },
    ];
    const result = buildRidgeSurvival(tracks);
    expect(result.total_tracks).toBe(4);
    expect(result.max_lifetime_frames).toBe(3);

    const point1 = result.points.find((point) => point.t_frames === 1);
    const point2 = result.points.find((point) => point.t_frames === 2);
    const point3 = result.points.find((point) => point.t_frames === 3);

    expect(point1?.survival).toBeCloseTo(1, 6);
    expect(point1?.hazard).toBeCloseTo(0, 6);
    expect(point1?.mean_residual_life).toBeCloseTo(1, 6);

    expect(point2?.survival).toBeCloseTo(0.75, 6);
    expect(point2?.hazard).toBeCloseTo(0.25, 6);
    expect(point2?.mean_residual_life).toBeCloseTo(1 / 3, 6);

    expect(point3?.survival).toBeCloseTo(0.25, 6);
    expect(point3?.hazard).toBeCloseTo(2 / 3, 6);
    expect(point3?.mean_residual_life).toBeCloseTo(0, 6);
  });

  it("returns deterministic bootstrap intervals with a seed", () => {
    const tracks: RidgeTrack[] = [
      { id: "r1", first_frame: 0, last_frame: 0, lifetime_frames: 1 },
      { id: "r2", first_frame: 0, last_frame: 1, lifetime_frames: 2 },
      { id: "r3", first_frame: 0, last_frame: 1, lifetime_frames: 2 },
      { id: "r4", first_frame: 0, last_frame: 2, lifetime_frames: 3 },
    ];
    const resultA = buildRidgeSurvival(tracks, {
      bootstrap_samples: 50,
      seed: "ridge-seed",
    });
    const resultB = buildRidgeSurvival(tracks, {
      bootstrap_samples: 50,
      seed: "ridge-seed",
    });
    expect(resultA).toEqual(resultB);
    expect(resultA.points[0]?.survival_ci).toBeDefined();
  });
});
