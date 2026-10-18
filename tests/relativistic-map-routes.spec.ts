import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getGlobalPipelineState,
  initializePipelineState,
  setGlobalPipelineState,
} from "../server/energy-pipeline";
import { helixRelativisticMapRouter } from "../server/routes/helix/relativistic-map";
import {
  makeWarpMissionTimeComparisonFixture,
  makeWarpMissionTimeEstimatorFixture,
  makeWarpRouteTimeWorldlineFixture,
  makeWarpWorldlineFixture,
} from "./helpers/warp-worldline-fixture";

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/helix/relativistic-map", helixRelativisticMapRouter);
  return app;
};

describe("relativistic map route", () => {
  const previousState = getGlobalPipelineState();

  beforeEach(() => {
    setGlobalPipelineState(initializePipelineState());
  });

  afterEach(() => {
    setGlobalPipelineState(previousState);
  });

  it("returns an outer-reference accessibility projection for flat-SR requests", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "sun_centered_accessibility",
        sourceModel: "flat_sr_flip_burn_control",
        catalog: [{ id: "alpha-centauri", position_m: [4, 0, 0] }],
        control: {
          properAcceleration_m_s2: 9.80665,
        },
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.projection?.status).toBe("computed");
    expect(res.body.projection?.semantics).toBe("outer_reference_only");
    expect(res.body.projection?.observerFamily).toBe("grid_static");
    expect(res.body.projection?.claim_tier).toBe("diagnostic");
    expect(res.body.projection?.certifying).toBe(false);
  });

  it("fails closed for warp route-time requests outside the explicit NHM2 accordion contract", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "sun_centered_accessibility",
        sourceModel: "warp_worldline_route_time",
        catalog: [{ id: "tau-ceti", position_m: [12, 0, 0] }],
      })
      .expect(200);

    expect(res.body.ok).toBe(false);
    expect(res.body.projection?.status).toBe("unavailable");
    expect(res.body.projection?.fail_id).toBe("NHM2_TARGET_NOT_IN_EXPLICIT_CONTRACT");
  });

  it("returns a 400 for flat-SR requests that omit the declared control law", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "instantaneous_ship_view",
        sourceModel: "flat_sr_flip_burn_control",
        catalog: [{ id: "demo", position_m: [1, 0, 0] }],
      })
      .expect(400);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("invalid-request");
  });

  it("uses the authoritative pipeline warpWorldline for bounded local-comoving warp projections", async () => {
    const app = makeApp();
    const nextState = initializePipelineState();
    nextState.warpWorldline = makeWarpWorldlineFixture();
    setGlobalPipelineState(nextState);

    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "instantaneous_ship_view",
        sourceModel: "warp_worldline_local_comoving",
        catalog: [{ id: "demo", position_m: [10, 5, 0] }],
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.projection?.status).toBe("computed");
    expect(res.body.projection?.provenance_class).toBe("solve_backed");
  });

  it("keeps the accordion route target-coupled even when the bounded route-time contract exists", async () => {
    const app = makeApp();
    const nextState = initializePipelineState();
    nextState.warpWorldline = makeWarpWorldlineFixture();
    nextState.warpRouteTimeWorldline = makeWarpRouteTimeWorldlineFixture(
      nextState.warpWorldline,
    );
    nextState.warpMissionTimeEstimator = makeWarpMissionTimeEstimatorFixture({
      worldline: nextState.warpWorldline,
      routeTime: nextState.warpRouteTimeWorldline,
    });
    nextState.warpMissionTimeComparison = makeWarpMissionTimeComparisonFixture({
      missionTimeEstimator: nextState.warpMissionTimeEstimator,
    });
    setGlobalPipelineState(nextState);

    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "sun_centered_accessibility",
        sourceModel: "warp_worldline_route_time",
        catalog: [{ id: "tau-ceti", position_m: [12, 0, 0] }],
      })
      .expect(200);

    expect(res.body.ok).toBe(false);
    expect(res.body.projection?.status).toBe("unavailable");
    expect(res.body.projection?.fail_id).toBe("NHM2_TARGET_NOT_IN_EXPLICIT_CONTRACT");
    expect(res.body.projection?.canonicalFrame?.id).toBe("ICRS");
    expect(res.body.projection?.renderFrame?.id).toBe("sol_centered_accordion_render");
  });
});
