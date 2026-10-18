import { describe, expect, it } from "vitest";
import { resolveCommittedLocalRestMissionTargetDistanceContract } from "../server/energy-pipeline";
import {
  buildWarpMissionTimeEstimatorContract,
  isCertifiedWarpMissionTargetDistanceContract,
  isCertifiedWarpMissionTimeEstimatorContract,
} from "../shared/contracts/warp-mission-time-estimator.v1";
import {
  makeWarpCruiseEnvelopePreflightFixture,
  makeWarpMissionTargetDistanceFixture,
  makeWarpMissionTimeEstimatorFixture,
  makeWarpRouteTimeWorldlineFixture,
  makeWarpWorldlineFixture,
} from "./helpers/warp-worldline-fixture";

describe("warp mission-time estimator contract", () => {
  it("builds a deterministic bounded mission-time estimate from certified route-time and committed target-distance inputs", () => {
    const estimator = makeWarpMissionTimeEstimatorFixture();
    const second = makeWarpMissionTimeEstimatorFixture();

    expect(second).toEqual(estimator);
    expect(estimator.status).toBe("bounded_target_coupled_estimate_ready");
    expect(estimator.targetId).toBe("alpha-cen-a");
    expect(estimator.targetFrame).toBe("heliocentric-icrs");
    expect(estimator.routeTimeStatus).toBe("bounded_local_segment_certified");
    expect(estimator.coordinateTimeEstimate.seconds).toBeGreaterThan(0);
    expect(estimator.properTimeEstimate.seconds).toBeGreaterThan(0);
    expect(estimator.coordinateTimeEstimate.years).toBeGreaterThan(0);
    expect(estimator.properTimeEstimate.years).toBeGreaterThan(0);
    expect(estimator.coordinateTimeEstimate.meaning).toContain("coordinate time");
    expect(estimator.properTimeEstimate.meaning).toContain("proper time");
    expect(estimator.nonClaims).toContain("not max-speed certified");
    expect(estimator.nonClaims).toContain("not viability-promotion evidence");
    expect(isCertifiedWarpMissionTimeEstimatorContract(estimator)).toBe(true);
  });

  it("fails closed when route-time or target-distance inputs are missing or non-certified", () => {
    const worldline = makeWarpWorldlineFixture();
    const preflight = makeWarpCruiseEnvelopePreflightFixture(worldline);
    const routeTime = makeWarpRouteTimeWorldlineFixture(worldline, preflight);
    const targetDistance = makeWarpMissionTargetDistanceFixture();

    expect(
      buildWarpMissionTimeEstimatorContract({
        worldline,
        preflight,
        routeTimeWorldline: null,
        targetDistance,
      }),
    ).toBeNull();
    expect(
      buildWarpMissionTimeEstimatorContract({
        worldline,
        preflight,
        routeTimeWorldline: routeTime,
        targetDistance: null,
      }),
    ).toBeNull();
    expect(
      buildWarpMissionTimeEstimatorContract({
        worldline,
        preflight,
        routeTimeWorldline: routeTime,
        targetDistance: {
          contractVersion: "local_rest_target_distance_contract/v1",
          certified: true,
        } as any,
      }),
    ).toBeNull();
  });

  it("resolves target distances deterministically from the committed local-rest snapshot", () => {
    const alpha = resolveCommittedLocalRestMissionTargetDistanceContract("alpha-cen-a");
    const proxima = resolveCommittedLocalRestMissionTargetDistanceContract("proxima");

    expect(alpha).not.toBeNull();
    expect(proxima).not.toBeNull();
    expect(isCertifiedWarpMissionTargetDistanceContract(alpha)).toBe(true);
    expect(isCertifiedWarpMissionTargetDistanceContract(proxima)).toBe(true);
    expect(alpha?.snapshotPath).toBe(
      "server/_generated/local-rest_epoch-1763696773601_r-200pc_012fd60ec17881cc.json",
    );
    expect(proxima?.snapshotPath).toBe(
      "server/_generated/local-rest_epoch-1763696773601_r-200pc_012fd60ec17881cc.json",
    );
    expect(alpha?.targetId).toBe("alpha-cen-a");
    expect(proxima?.targetId).toBe("proxima");
    expect(alpha?.targetFrame).toBe("heliocentric-icrs");
    expect(proxima?.targetFrame).toBe("heliocentric-icrs");
    expect(alpha?.distanceMeters ?? 0).toBeGreaterThan(proxima?.distanceMeters ?? 0);
  });
});
