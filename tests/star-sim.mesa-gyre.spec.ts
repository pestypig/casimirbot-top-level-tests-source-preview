import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StarSimRouteModule = typeof import("../server/routes/star-sim");
type StarSimJobsModule = typeof import("../server/modules/starsim/jobs");
type StarSimWorkerClientModule = typeof import("../server/modules/starsim/worker/starsim-worker-client");

let artifactRoot = "";

const buildApp = async () => {
  vi.resetModules();
  const routeModule: StarSimRouteModule = await import("../server/routes/star-sim");
  const jobsModule: StarSimJobsModule = await import("../server/modules/starsim/jobs");
  const workerClientModule: StarSimWorkerClientModule = await import(
    "../server/modules/starsim/worker/starsim-worker-client"
  );
  await jobsModule.__resetStarSimJobsForTest();
  await workerClientModule.__resetStarSimWorkerForTest();
  const app = express();
  app.use(express.json());
  app.use("/api/star-sim", routeModule.starSimRouter);
  return app;
};

const waitForJob = async (app: express.Express, jobId: string, expected: string) => {
  for (let i = 0; i < 40; i += 1) {
    const response = await request(app).get(`/api/star-sim/v1/jobs/${jobId}`).expect(200);
    if (response.body?.status === expected) {
      return response.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`job ${jobId} did not reach ${expected}`);
};

beforeEach(() => {
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-mesa-gyre-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_MESA_RUNTIME = "mock";
  process.env.STAR_SIM_GYRE_RUNTIME = "mock";
});

afterEach(async () => {
  const jobsModule: StarSimJobsModule = await import("../server/modules/starsim/jobs");
  const workerClientModule: StarSimWorkerClientModule = await import(
    "../server/modules/starsim/worker/starsim-worker-client"
  );
  jobsModule.__resetStarSimJobsForTest();
  await workerClientModule.__resetStarSimWorkerForTest();
  delete process.env.STAR_SIM_ARTIFACT_ROOT;
  delete process.env.STAR_SIM_MESA_RUNTIME;
  delete process.env.STAR_SIM_GYRE_RUNTIME;
  delete process.env.STAR_SIM_CACHE_TTL_MS;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim MESA/GYRE lanes", () => {
  it("blocks oscillation_gyre when no structure_mesa model is available", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
          epoch_iso: "2026-01-01T00:00:00.000Z",
        },
        asteroseismology: {
          numax_uHz: 3090,
          deltanu_uHz: 135.1,
        },
        requested_lanes: ["oscillation_gyre"],
        strict_lanes: true,
      })
      .expect(200);

    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("missing_structure_model");
    expect(res.body.congruence.requested_blockers).toEqual(["oscillation_gyre"]);
  });

  it("runs structure_mesa and oscillation_gyre together and threads the parent claim through the result", async () => {
    const app = await buildApp();
    const submit = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
          epoch_iso: "2026-01-01T00:00:00.000Z",
        },
        spectroscopy: {
          teff_K: 5772,
          logg_cgs: 4.438,
          metallicity_feh: 0,
        },
        structure: {
          mass_Msun: 1,
          radius_Rsun: 1,
        },
        asteroseismology: {
          numax_uHz: 3090,
          deltanu_uHz: 135.1,
          mode_frequencies_uHz: [3090.0, 3160.4, 3232.1],
        },
        requested_lanes: ["structure_mesa", "oscillation_gyre"],
      })
      .expect(202);

    const jobId = submit.body?.job_id;
    await waitForJob(app, jobId, "completed");

    const result = await request(app).get(`/api/star-sim/v1/jobs/${jobId}/result`).expect(200);
    const structureLane = result.body.lanes.find((lane: any) => lane.requested_lane === "structure_mesa");
    const oscillationLane = result.body.lanes.find((lane: any) => lane.requested_lane === "oscillation_gyre");

    expect(structureLane.status).toBe("available");
    expect(structureLane.phys_class).toBe("P3");
    expect(oscillationLane.status).toBe("available");
    expect(oscillationLane.execution_kind).toBe("simulation");
    expect(oscillationLane.tree_dag.parent_claim_ids).toContain(structureLane.tree_dag.claim_id);
    expect(oscillationLane.result.structure_cache_key).toBe(structureLane.cache_key);
    expect(oscillationLane.result.mode_summary.mode_count).toBe(3);
  });
});
