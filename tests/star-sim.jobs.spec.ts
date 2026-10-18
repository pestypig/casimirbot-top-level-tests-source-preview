import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StarSimRouteModule = typeof import("../server/routes/star-sim");
type StarSimJobsModule = typeof import("../server/modules/starsim/jobs");
type StarSimWorkerClientModule = typeof import("../server/modules/starsim/worker/starsim-worker-client");
type StarSimArtifactsModule = typeof import("../server/modules/starsim/artifacts");
type StarSimContractModule = typeof import("../server/modules/starsim/contract");

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

beforeEach(() => {
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-jobs-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_MESA_RUNTIME = "mock";
  process.env.STAR_SIM_GYRE_RUNTIME = "mock";
});

afterEach(async () => {
  const jobsModule: StarSimJobsModule = await import("../server/modules/starsim/jobs");
  const workerClientModule: StarSimWorkerClientModule = await import(
    "../server/modules/starsim/worker/starsim-worker-client"
  );
  await jobsModule.__resetStarSimJobsForTest();
  await workerClientModule.__resetStarSimWorkerForTest();
  delete process.env.STAR_SIM_ARTIFACT_ROOT;
  delete process.env.STAR_SIM_MESA_RUNTIME;
  delete process.env.STAR_SIM_GYRE_RUNTIME;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim job lifecycle", () => {
  it("dedupes identical concurrent job submissions", async () => {
    const app = await buildApp();
    const payload = {
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
    };

    const [first, second] = await Promise.all([
      request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202),
      request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202),
    ]);

    expect(first.body.job_id).toBe(second.body.job_id);
    expect([first.body.deduped, second.body.deduped]).toContain(true);
    expect(first.body.job_fingerprint).toBe(second.body.job_fingerprint);
  });

  it("marks persisted running jobs abandoned after restart-style reload", async () => {
    vi.resetModules();
    const artifactsModule: StarSimArtifactsModule = await import("../server/modules/starsim/artifacts");
    const contractModule: StarSimContractModule = await import("../server/modules/starsim/contract");

    const job: contractModule.StarSimJobRecord = {
      job_id: "job-restart-demo",
      status: "running",
      stage: "running_structure_mesa",
      status_reason: null,
      created_at_iso: "2026-01-01T00:00:00.000Z",
      started_at_iso: "2026-01-01T00:00:05.000Z",
      completed_at_iso: null,
      requested_lanes: ["structure_mesa"],
      heavy_lanes: ["structure_mesa"],
      request_hash: "sha256:restart-demo",
      job_fingerprint: "sha256:restart-demo-job",
      attempt_count: 1,
      max_attempts: 2,
      queue_position: 0,
      result_path: null,
      error: null,
      deduped: false,
      deduped_from_job_id: null,
      precondition_policy: null,
      resolved_draft_hash: null,
      resolved_draft_ref: null,
      source_resolution_ref: null,
      source_cache_key: null,
      lane_plan: null,
    };

    await artifactsModule.persistStarSimJobArtifacts({
      job,
      request: {
        target: {
          object_id: "sun",
          name: "Sun",
          epoch_iso: "2026-01-01T00:00:00.000Z",
        },
        requested_lanes: ["structure_mesa"],
      },
      result: null,
    });

    vi.resetModules();
    const jobsModule: StarSimJobsModule = await import("../server/modules/starsim/jobs");
    const loaded = await jobsModule.getStarSimJob(job.job_id);

    expect(loaded?.status).toBe("abandoned");
    expect(loaded?.status_reason).toBe("orphaned_after_restart");
    expect(loaded?.error).toContain("orphaned");
  });
});
