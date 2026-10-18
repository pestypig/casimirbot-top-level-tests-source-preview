import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  OBSERVABLE_UNIVERSE_ACCORDION_CATALOG_PRESET_NEARBY_LOCAL_REST_SMALL,
} from "../shared/observable-universe-accordion-catalog.v1";
import { helixRelativisticMapRouter } from "../server/routes/helix/relativistic-map";

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/helix/relativistic-map", helixRelativisticMapRouter);
  return app;
};

describe("retired observable universe accordion ETA route", () => {
  it("keeps the archived shift-lapse target closed to current NHM2 route ETA", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "sun_centered_accessibility",
        sourceModel: "warp_worldline_route_time",
        catalog: [{ id: "alpha-cen-a", position_m: [4, 0, 0] }],
      })
      .expect(200);

    expect(res.body.ok).toBe(false);
    expect(res.body.projection?.kind).toBe("relativistic_map_projection");
    expect(res.body.projection?.status).toBe("unavailable");
    expect([
      "RELATIVISTIC_MAP_WARP_WORLDLINE_REQUIRED",
      "RELATIVISTIC_MAP_WARP_ROUTE_TIME_DEFERRED",
    ]).toContain(res.body.projection?.fail_id);
    expect(res.body.projection?.claim_tier).toBe("diagnostic");
    expect(res.body.projection?.certifying).toBe(false);
    expect(res.body.projection?.entries).toBeUndefined();
    expect(res.body.projection?.projection_contract).toMatch(/fail.closed|remain deferred/i);
  });

  it("does not expose a mixed target catalog as an ETA surface", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "sun_centered_accessibility",
        sourceModel: "warp_worldline_route_time",
        catalog: [
          { id: "alpha-cen-a", label: "Alpha Centauri A", position_m: [4, 0, 0] },
          { id: "tau-ceti", label: "Tau Ceti", position_m: [0, 4, 0] },
        ],
      })
      .expect(200);

    expect(res.body.ok).toBe(false);
    expect(res.body.projection?.status).toBe("unavailable");
    expect(res.body.projection?.kind).toBe("relativistic_map_projection");
    expect(res.body.projection?.entries).toBeUndefined();
  });

  it("rejects the retired nearby local-rest preset without reading a catalog", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "sun_centered_accessibility",
        sourceModel: "warp_worldline_route_time",
        catalogPreset:
          OBSERVABLE_UNIVERSE_ACCORDION_CATALOG_PRESET_NEARBY_LOCAL_REST_SMALL,
      })
      .expect(400);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("invalid-request");
    expect(res.body.issues?.some((issue: any) => issue.path?.[0] === "catalog")).toBe(true);
  });

  it("does not silently fall back to flat-SR for any target", async () => {
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
    expect(res.body.projection?.kind).toBe("relativistic_map_projection");
    expect(res.body.projection?.entries).toBeUndefined();
    expect(res.body.projection?.claim_boundary).toMatch(/diagnostic.only/i);
  });
});
