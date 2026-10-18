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

const liveRunnerPath = path.resolve("tests", "fixtures", "starsim", "live-runtime-runner.cjs");

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
  for (let i = 0; i < 50; i += 1) {
    const response = await request(app).get(`/api/star-sim/v1/jobs/${jobId}`).expect(200);
    if (response.body?.status === expected) {
      return response.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`job ${jobId} did not reach ${expected}`);
};

beforeEach(() => {
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-live-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_ENABLE_LIVE_BENCHMARKS = "1";
  process.env.STAR_SIM_MESA_RUNTIME = "wsl";
  process.env.STAR_SIM_GYRE_RUNTIME = "wsl";
  process.env.STAR_SIM_WSL_LAUNCH_MODE = "direct";
  process.env.STAR_SIM_WSL_BIN = process.execPath;
  process.env.STAR_SIM_MESA_COMMAND = liveRunnerPath;
  process.env.STAR_SIM_GYRE_COMMAND = liveRunnerPath;
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
  delete process.env.STAR_SIM_ENABLE_LIVE_BENCHMARKS;
  delete process.env.STAR_SIM_MESA_RUNTIME;
  delete process.env.STAR_SIM_GYRE_RUNTIME;
  delete process.env.STAR_SIM_WSL_LAUNCH_MODE;
  delete process.env.STAR_SIM_WSL_BIN;
  delete process.env.STAR_SIM_MESA_COMMAND;
  delete process.env.STAR_SIM_GYRE_COMMAND;
  delete process.env.STAR_SIM_WORKER_TIMEOUT_MS;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim live fitting lanes", () => {
  it("runs a live solar-like structure fit and serves the validated cached artifact", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        object_id: "alpha-centauri-a",
        name: "Alpha Centauri A",
        epoch_iso: "2026-01-01T00:00:00.000Z",
        spectral_type: "G2",
        luminosity_class: "V",
      },
      spectroscopy: {
        teff_K: 5790,
        logg_cgs: 4.31,
        metallicity_feh: 0.22,
      },
      structure: {
        mass_Msun: 1.1,
        radius_Rsun: 1.22,
      },
      fit_profile_id: "solar_like_observable_fit_v1",
      fit_constraints: {
        mixing_length_alpha_max: 2.05,
      },
      requested_lanes: ["structure_mesa"],
    };

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    await waitForJob(app, submit.body.job_id, "completed");

    const result = await request(app).get(`/api/star-sim/v1/jobs/${submit.body.job_id}/result`).expect(200);
    const lane = result.body.lanes.find((entry: any) => entry.requested_lane === "structure_mesa");
    expect(lane.status).toBe("available");
    expect(lane.maturity).toBe("research_sim");
    expect(lane.runtime_mode).toBe("wsl");
    expect(lane.result.runtime.live_solver).toBe(true);
    expect(lane.result.runtime.execution_mode).toBe("live_fit");
    expect(lane.result.fit_status).toBe("fit_completed");
    expect(lane.result.diagnostic_summary.fit_quality).toBeTruthy();
    expect(lane.result.fit_profile_id).toBe("solar_like_observable_fit_v1");
    expect(lane.result.supported_domain.passed).toBe(true);
    expect(lane.result.supported_domain.id).toBe("solar_like_main_sequence_live");
    expect(lane.result.benchmark_pack.id).toBe("solar_like_structure_fit_pack_v1");
    expect(lane.benchmark_validation.passed).toBe(true);
    expect(lane.artifact_refs.some((ref: any) => ref.kind === "solver_metadata")).toBe(true);
    expect(lane.artifact_refs.some((ref: any) => ref.kind === "model_artifact")).toBe(true);
    expect(lane.artifact_refs.some((ref: any) => ref.kind === "benchmark_pack")).toBe(true);

    const cached = await request(app).post("/api/star-sim/v1/run").send(payload).expect(200);
    expect(cached.body.lanes[0].status).toBe("available");
    expect(cached.body.lanes[0].cache_key).toBe(lane.cache_key);
    expect(cached.body.lanes[0].benchmark_validation.passed).toBe(true);
  });

  it("runs a live solar-like structure plus seismic comparison chain with correct parent threading", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        object_id: "alpha-centauri-a",
        name: "Alpha Centauri A",
        epoch_iso: "2026-01-01T00:00:00.000Z",
        spectral_type: "G2",
        luminosity_class: "V",
      },
      spectroscopy: {
        teff_K: 5790,
        logg_cgs: 4.31,
        metallicity_feh: 0.22,
      },
      structure: {
        mass_Msun: 1.1,
        radius_Rsun: 1.22,
      },
      asteroseismology: {
        numax_uHz: 2300,
        deltanu_uHz: 106.0,
        mode_frequencies_uHz: [2230.2, 2301.5, 2369.8],
      },
      fit_profile_id: "solar_like_seismic_compare_v1",
      requested_lanes: ["structure_mesa", "oscillation_gyre"],
    };

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    await waitForJob(app, submit.body.job_id, "completed");

    const result = await request(app).get(`/api/star-sim/v1/jobs/${submit.body.job_id}/result`).expect(200);
    const structureLane = result.body.lanes.find((lane: any) => lane.requested_lane === "structure_mesa");
    const oscillationLane = result.body.lanes.find((lane: any) => lane.requested_lane === "oscillation_gyre");

    expect(structureLane.status).toBe("available");
    expect(structureLane.maturity).toBe("research_sim");
    expect(oscillationLane.status).toBe("available");
    expect(oscillationLane.maturity).toBe("research_sim");
    expect(oscillationLane.result.runtime.live_solver).toBe(true);
    expect(oscillationLane.result.runtime.execution_mode).toBe("live_comparison");
    expect(oscillationLane.result.fit_status).toBe("comparison_completed");
    expect(oscillationLane.result.diagnostic_summary.comparison_quality).toBeTruthy();
    expect(oscillationLane.result.benchmark_pack.id).toBe("solar_like_seismic_compare_pack_v1");
    expect(oscillationLane.benchmark_validation.passed).toBe(true);
    expect(oscillationLane.tree_dag.parent_claim_ids).toContain(structureLane.tree_dag.claim_id);
    expect(oscillationLane.result.structure_cache_key).toBe(structureLane.cache_key);
    expect(oscillationLane.result.seismic_match_summary.matched_mode_count).toBe(3);
    expect(oscillationLane.artifact_refs.some((ref: any) => ref.kind === "solver_metadata")).toBe(true);
    expect(oscillationLane.artifact_refs.some((ref: any) => ref.kind === "mode_table")).toBe(true);
    expect(oscillationLane.artifact_refs.some((ref: any) => ref.kind === "benchmark_pack")).toBe(true);
  });

  it("rejects unsupported live requests outside the declared domain", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        target: {
          object_id: "sirius-a",
          name: "Sirius A",
          epoch_iso: "2026-01-01T00:00:00.000Z",
          spectral_type: "A1",
          luminosity_class: "V",
        },
        spectroscopy: {
          teff_K: 9900,
          logg_cgs: 4.3,
          metallicity_feh: 0.4,
        },
        structure: {
          mass_Msun: 2.0,
          radius_Rsun: 1.7,
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(200);

    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("out_of_supported_domain");
    expect(res.body.lanes[0].runtime_mode).toBe("wsl");
  });

  it("rejects underconstrained live fit requests with insufficient observables", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        target: {
          object_id: "test-star",
          name: "Test Star",
          epoch_iso: "2026-01-01T00:00:00.000Z",
          spectral_type: "G5",
          luminosity_class: "V",
        },
        spectroscopy: {
          teff_K: 5700,
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(200);

    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("insufficient_observables");
  });

  it("rejects seismic comparison requests without asteroseismic data", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        target: {
          object_id: "alpha-centauri-a",
          name: "Alpha Centauri A",
          epoch_iso: "2026-01-01T00:00:00.000Z",
          spectral_type: "G2",
          luminosity_class: "V",
        },
        spectroscopy: {
          teff_K: 5790,
          logg_cgs: 4.31,
          metallicity_feh: 0.22,
        },
        structure: {
          radius_Rsun: 1.22,
        },
        requested_lanes: ["oscillation_gyre"],
      })
      .expect(200);

    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("seismology_required");
  });

  it("fails live validation honestly and does not cache the bad result", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        object_id: "alpha-centauri-a",
        name: "Alpha Centauri A",
        epoch_iso: "2026-01-01T00:00:00.000Z",
        spectral_type: "G2",
        luminosity_class: "V",
      },
      spectroscopy: {
        teff_K: 5790,
        logg_cgs: 4.31,
        metallicity_feh: 0.22,
      },
      structure: {
        mass_Msun: 1.1,
        radius_Rsun: 1.22,
      },
      physics_flags: {
        force_validation_fail: true,
      },
      requested_lanes: ["structure_mesa"],
    };

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    const failed = await waitForJob(app, submit.body.job_id, "failed");
    expect(failed.status_reason).toBe("lane_execution_error");

    const uncached = await request(app).post("/api/star-sim/v1/run").send(payload).expect(200);
    expect(uncached.body.lanes[0].status).toBe("unavailable");
    expect(uncached.body.lanes[0].status_reason).toBe("async_job_required");
    expect(uncached.body.lanes[0].cache_status).toBe("missing");
  });
});
