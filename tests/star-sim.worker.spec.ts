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
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-worker-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_MESA_RUNTIME = "mock";
  process.env.STAR_SIM_GYRE_RUNTIME = "mock";
  process.env.STAR_SIM_WORKER_TIMEOUT_MS = "5000";
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
  delete process.env.STAR_SIM_WORKER_TIMEOUT_MS;
  delete process.env.STAR_SIM_JOB_MAX_ATTEMPTS;
  delete process.env.STAR_SIM_WORKER_CRASH_ON_KIND;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim async worker routes", () => {
  it("runs a structure_mesa job to completion and persists artifact-backed results", async () => {
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
        requested_lanes: ["structure_mesa"],
      })
      .expect(202);

    const jobId = submit.body?.job_id;
    expect(typeof jobId).toBe("string");

    const job = await waitForJob(app, jobId, "completed");
    expect(job.result_path).toBeTruthy();

    const result = await request(app).get(`/api/star-sim/v1/jobs/${jobId}/result`).expect(200);
    const lane = result.body.lanes.find((entry: any) => entry.requested_lane === "structure_mesa");
    expect(lane.status).toBe("available");
    expect(lane.execution_kind).toBe("simulation");
    expect(lane.result.runtime.kind).toBe("mock");
    expect(lane.result.benchmark_case_id).toBe("simplex_solar_calibration");
    expect(Array.isArray(lane.artifact_refs)).toBe(true);
    expect(lane.artifact_refs.length).toBeGreaterThan(0);
    for (const ref of lane.artifact_refs) {
      expect(fs.existsSync(path.resolve(ref.path))).toBe(true);
    }
  });

  it("marks a crashed worker job failed instead of leaving it running forever", async () => {
    process.env.STAR_SIM_WORKER_CRASH_ON_KIND = "structure_mesa";
    process.env.STAR_SIM_JOB_MAX_ATTEMPTS = "1";
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
        requested_lanes: ["structure_mesa"],
      })
      .expect(202);

    const job = await waitForJob(app, submit.body.job_id, "failed");
    expect(job.status_reason).toBe("worker_crash");
    expect(job.attempt_count).toBe(1);
    expect(job.error).toContain("star_sim_worker_exit");
  });

  it("fails honestly when docker runtime is selected but not configured", async () => {
    process.env.STAR_SIM_MESA_RUNTIME = "docker";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
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
        requested_lanes: ["structure_mesa"],
      })
      .expect(200);

    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("solver_unconfigured");
    expect(res.body.lanes[0].runtime_mode).toBe("docker");
  });
});
