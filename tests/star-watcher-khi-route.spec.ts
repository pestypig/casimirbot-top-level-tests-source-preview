import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { SOLAR_KHI_MEASUREMENT_SCHEMA_VERSION } from "@shared/contracts/solar-khi-observation.v1";
import { starWatcherRouter } from "../server/routes/star-watcher";

const measurementInput = (reconstruction: "mfbd" | "speckle") => ({
  schema_version: SOLAR_KHI_MEASUREMENT_SCHEMA_VERSION,
  observation_id: "dkist-fastcam-route-test",
  boundary_id: "boundary-1",
  reconstruction,
  native_km_per_pixel: 6,
  effective_resolution_km: 19,
  cadence_s: 2.7,
  flow_speed_km_s: 3,
  minimum_dip_prominence: 0.04,
  frames: Array.from({ length: 8 }, (_, frameIndex) => {
    const time = frameIndex * 2.7;
    const amplitude = Math.exp(0.03 * time);
    return {
      frame_index: frameIndex,
      time_offset_s: time,
      boundary_displacement_px: Array.from({ length: 20 }, (_unused, index) => amplitude * Math.sin(2 * Math.PI * index / 10)),
      intensity_along_boundary: Array.from({ length: 51 }, (_unused, index) => index % 10 === 5 ? 0.5 : index % 10 === 4 || index % 10 === 6 ? 0.8 : 1),
      ridge_position_px: 3 + 0.2 * time,
    };
  }),
});

describe("Star Watcher DKIST FastCam KHI route", () => {
  const app = express();
  app.use("/api/star-watcher", starWatcherRouter);

  it("returns numerical measurements, reconstruction agreement, and the native model route", async () => {
    const response = await request(app)
      .post("/api/star-watcher/dkist-fastcam/analyze")
      .send({ mfbd: measurementInput("mfbd"), speckle: measurementInput("speckle") })
      .expect(200);

    expect(response.body.authority).toBe("deterministic_numerical_measurement");
    expect(response.body.claim_tier).toBe("diagnostic");
    expect(response.body.measurements).toHaveLength(2);
    expect(response.body.reconstruction_agreement.matched).toBe(true);
    expect(response.body.model_route.selected.modelId).toBe("dkist-fastcam-416-khi-temporal-v1");
  });

  it("fails closed on schema-invalid boundary inputs", async () => {
    const response = await request(app)
      .post("/api/star-watcher/dkist-fastcam/analyze")
      .send({ mfbd: { schema_version: SOLAR_KHI_MEASUREMENT_SCHEMA_VERSION } })
      .expect(400);
    expect(response.body.error).toBe("invalid_solar_khi_request");
  });
});
