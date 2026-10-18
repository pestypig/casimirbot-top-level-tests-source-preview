import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StarSimRouteModule = typeof import("../server/routes/star-sim");
type StarSimJobsModule = typeof import("../server/modules/starsim/jobs");
type StarSimWorkerClientModule = typeof import("../server/modules/starsim/worker/starsim-worker-client");

let artifactRoot = "";

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
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-orchestration-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_SOURCE_FETCH_MODE = "fixture";
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
  delete process.env.STAR_SIM_SOURCE_FETCH_MODE;
  delete process.env.STAR_SIM_MESA_RUNTIME;
  delete process.env.STAR_SIM_GYRE_RUNTIME;
  delete process.env.STAR_SIM_GAIA_DR3_MODE;
  delete process.env.STAR_SIM_SDSS_ASTRA_MODE;
  delete process.env.STAR_SIM_LAMOST_DR10_MODE;
  delete process.env.STAR_SIM_TESS_MAST_MODE;
  delete process.env.STAR_SIM_TASOC_MODE;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim resolve-first orchestration", () => {
  it("goes from identifiers to an enqueued structure job and preserves source provenance in solver artifacts", async () => {
    const app = await buildApp();
    const submit = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(202);

    expect(submit.body.job_enqueued).toBe(true);
    expect(submit.body.resolution_stage).toBe("job_enqueued");
    expect(["queued_structure_mesa", "running_structure_mesa"]).toContain(submit.body.stage);
    expect(submit.body.source_resolution_ref).toMatch(/resolve-response\.json$/);
    expect(submit.body.resolved_draft_ref).toMatch(/canonical-request\.json$/);
    expect(submit.body.lane_plan.runnable_lanes).toEqual(["structure_mesa"]);
    expect(submit.body.benchmark_backed).toBe(true);
    expect(submit.body.benchmark_receipt_ref).toMatch(/benchmark-receipt\.json$/);
    expect(submit.body.benchmark_input_signature).toMatch(/^sha256:/);
    expect(submit.body.previous_benchmark_receipt_ref).toBeNull();
    expect(submit.body.benchmark_repeatability).toBeUndefined();
    expect(["demo_solar_a", "demo_solar_b"]).toContain(submit.body.benchmark_target_id);
    expect(submit.body.benchmark_target_match_mode).toBe("matched_by_identifier");
    expect(submit.body.benchmark_target_identity_basis).toBe("trusted_identifier");
    expect(submit.body.identifiers_trusted.gaia_dr3_source_id).toBe("123456789012345678");
    const queuedReceipt = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), submit.body.benchmark_receipt_ref), "utf8"),
    );
    expect(queuedReceipt.benchmark_target_id).toBe("demo_solar_a");
    expect(queuedReceipt.benchmark_input_signature).toBe(submit.body.benchmark_input_signature);
    expect(queuedReceipt.observable_envelope_diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_path: "spectroscopy.teff_K",
          status: "in_envelope",
        }),
      ]),
    );

    await waitForJob(app, submit.body.job_id, "completed");
    const result = await request(app).get(`/api/star-sim/v1/jobs/${submit.body.job_id}/result`).expect(200);
    const structureLane = result.body.lanes.find((lane: { requested_lane: string }) => lane.requested_lane === "structure_mesa");
    expect(structureLane?.status).toBe("available");
    expect(result.body.benchmark_backed).toBe(true);
    expect(result.body.benchmark_receipt_ref).toBe(submit.body.benchmark_receipt_ref);
    expect(result.body.benchmark_input_signature).toBe(submit.body.benchmark_input_signature);
    const completedReceipt = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), result.body.benchmark_receipt_ref), "utf8"),
    );
    expect(completedReceipt.lane_diagnostics.structure_mesa.fit_quality).toBeTruthy();

    const canonicalRequestRef = structureLane.artifact_refs.find(
      (artifact: { kind: string }) => artifact.kind === "canonical_request",
    )?.path;
    const cachedCanonicalRequest = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), canonicalRequestRef), "utf8"),
    );
    expect(cachedCanonicalRequest.source_context.source_cache_key).toBe(submit.body.source_cache_key);
    expect(cachedCanonicalRequest.source_context.source_resolution_ref).toBe(submit.body.source_resolution_ref);
    expect(cachedCanonicalRequest.source_context.identifiers_resolved.gaia_dr3_source_id).toBe("123456789012345678");
    expect(cachedCanonicalRequest.source_context.selected_field_origins["spectroscopy.teff_K"]).toBe("sdss_astra");
  });

  it("enqueues structure plus oscillation when the resolved target is fully ready and preserves claim threading", async () => {
    const app = await buildApp();
    const submit = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        requested_lanes: ["structure_mesa", "oscillation_gyre"],
      })
      .expect(202);

    expect(submit.body.lane_plan.runnable_lanes).toEqual(["structure_mesa", "oscillation_gyre"]);
    await waitForJob(app, submit.body.job_id, "completed");

    const result = await request(app).get(`/api/star-sim/v1/jobs/${submit.body.job_id}/result`).expect(200);
    const structureLane = result.body.lanes.find((lane: { requested_lane: string }) => lane.requested_lane === "structure_mesa");
    const oscillationLane = result.body.lanes.find((lane: { requested_lane: string }) => lane.requested_lane === "oscillation_gyre");

    expect(structureLane?.status).toBe("available");
    expect(oscillationLane?.status).toBe("available");
    expect(oscillationLane?.tree_dag.parent_claim_ids).toContain(structureLane?.tree_dag.claim_id);
    const receipt = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), result.body.benchmark_receipt_ref), "utf8"),
    );
    expect(receipt.lane_diagnostics.structure_mesa.fit_quality).toBeTruthy();
    expect(receipt.lane_diagnostics.oscillation_gyre.comparison_quality).toBeTruthy();
  });

  it("blocks strict requested-lane orchestration when oscillation inputs are unresolved", async () => {
    const app = await buildApp();
    const prior = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(202);
    await waitForJob(app, prior.body.job_id, "completed");
    process.env.STAR_SIM_TASOC_MODE = "disabled";
    process.env.STAR_SIM_TESS_MAST_MODE = "disabled";

    const blocked = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        requested_lanes: ["structure_mesa", "oscillation_gyre"],
      })
      .expect(200);

    expect(blocked.body.job_enqueued).toBe(false);
    expect(blocked.body.resolution_stage).toBe("preflight_blocked");
    expect(blocked.body.job_id).toBeNull();
    expect(blocked.body.lane_plan.runnable_lanes).toEqual(["structure_mesa"]);
    expect(blocked.body.lane_plan.blocked_lanes).toContain("oscillation_gyre");
    expect(blocked.body.blocked_reasons).toContain("seismology_unresolved");
    expect(blocked.body.benchmark_backed).toBe(true);
    expect(blocked.body.benchmark_receipt_ref).toMatch(/benchmark-receipt\.json$/);
    expect(blocked.body.previous_benchmark_receipt_ref).toBeTruthy();
    expect(blocked.body.benchmark_repeatability.same_input_signature).toBe(false);
    expect(blocked.body.benchmark_repeatability.drift_categories).toEqual(
      expect.arrayContaining(["lane_plan_changed", "blocked_reasons_changed", "diagnostic_summary_changed"]),
    );
    const blockedReceipt = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), blocked.body.benchmark_receipt_ref), "utf8"),
    );
    expect(blockedReceipt.blocked_lanes).toContain("oscillation_gyre");
    expect(blockedReceipt.blocked_reasons).toContain("seismology_unresolved");
  });

  it("preserves trusted-identifier conflict semantics without assigning a benchmark target", async () => {
    const app = await buildApp();
    const submit = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
          lamost_obsid: "LAMOST-B-0002",
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(202);

    expect(submit.body.job_enqueued).toBe(true);
    expect(submit.body.benchmark_target_id).toBeUndefined();
    expect(submit.body.benchmark_target_match_mode).toBe("conflicted_trusted_identifiers");
    expect(submit.body.benchmark_target_conflict_reason).toBe("multiple_trusted_identifier_targets");
    expect(submit.body.benchmark_target_identity_basis).toBe("conflicted_trusted_identifiers");
    expect(submit.body.benchmark_target_quality_ok).toBe(false);
    expect(submit.body.benchmark_backed).toBe(false);
    expect(submit.body.benchmark_receipt_ref).toBeNull();
    expect(submit.body.benchmark_input_signature).toBeNull();
    await waitForJob(app, submit.body.job_id, "completed");
  });

  it("runs the available prefix when requested and leaves oscillation blocked", async () => {
    const app = await buildApp();
    const submit = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        precondition_policy: "run_available_prefix",
        target: {
          name: "Demo Solar B",
        },
        identifiers: {
          gaia_dr3_source_id: "987654321098765432",
        },
        requested_lanes: ["structure_mesa", "oscillation_gyre"],
      })
      .expect(202);

    expect(submit.body.policy_used).toBe("run_available_prefix");
    expect(submit.body.requested_lanes).toEqual(["structure_mesa", "oscillation_gyre"]);
    expect(submit.body.lane_plan.runnable_lanes).toEqual(["structure_mesa"]);
    expect(["demo_solar_a", "demo_solar_b"]).toContain(submit.body.benchmark_target_id);
    expect(submit.body.lane_plan.blocked_lanes).toEqual(["oscillation_gyre"]);

    await waitForJob(app, submit.body.job_id, "completed");
    const result = await request(app).get(`/api/star-sim/v1/jobs/${submit.body.job_id}/result`).expect(200);
    expect(result.body.solver_plan.requested_lanes).toEqual(["structure_mesa"]);
    expect(result.body.lanes).toHaveLength(1);
    expect(result.body.lanes[0].requested_lane).toBe("structure_mesa");
  });

  it("carries user overrides into the frozen solver draft and changes dedupe identity when source resolution changes", async () => {
    const app = await buildApp();
    const first = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        spectroscopy: {
          teff_K: 5901,
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(202);

    const frozenRequest = JSON.parse(
      fs.readFileSync(path.join(artifactRoot, "jobs", first.body.job_id, "request.json"), "utf8"),
    );
    expect(frozenRequest.spectroscopy.teff_K).toBe(5901);
    expect(frozenRequest.source_context.selected_field_origins["spectroscopy.teff_K"]).toBe("user_override");

    const second = await request(app)
      .post("/api/star-sim/v1/jobs")
      .send({
        resolve_before_run: true,
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        source_hints: {
          preferred_catalogs: ["gaia_dr3", "lamost_dr10", "sdss_astra"],
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(202);

    expect(first.body.source_cache_key).not.toBe(second.body.source_cache_key);
    expect(first.body.job_id).not.toBe(second.body.job_id);
    expect(first.body.benchmark_input_signature).not.toBe(second.body.benchmark_input_signature);
    expect(second.body.previous_benchmark_receipt_ref).toBeTruthy();
    expect(second.body.benchmark_repeatability.same_input_signature).toBe(false);
    expect(second.body.benchmark_repeatability.drift_categories).toContain("selected_field_origins_changed");
    await waitForJob(app, first.body.job_id, "completed");
    await waitForJob(app, second.body.job_id, "completed");
  });

  it("keeps the benchmark input signature stable for equivalent benchmark-backed runs", async () => {
    const app = await buildApp();
    const payload = {
      resolve_before_run: true,
      target: {
        name: "Demo Solar A",
      },
      identifiers: {
        gaia_dr3_source_id: "123456789012345678",
      },
      requested_lanes: ["structure_mesa"],
    };

    const first = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    await waitForJob(app, first.body.job_id, "completed");
    const second = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);

    expect(first.body.benchmark_input_signature).toBe(second.body.benchmark_input_signature);
    expect(first.body.benchmark_receipt_ref).toBe(second.body.benchmark_receipt_ref);
    expect(second.body.previous_benchmark_receipt_ref).toBeTruthy();
    expect(second.body.benchmark_repeatability).toEqual(
      expect.objectContaining({
        repeatable: true,
        same_input_signature: true,
      }),
    );
    await waitForJob(app, second.body.job_id, "completed");
  });

  it("does not emit benchmark receipts for non-benchmark manual jobs", async () => {
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

    expect(submit.body.benchmark_backed).toBe(false);
    expect(submit.body.benchmark_receipt_ref).toBeNull();
    expect(submit.body.benchmark_input_signature).toBeNull();
    expect(submit.body.previous_benchmark_receipt_ref).toBeNull();
    expect(submit.body.benchmark_repeatability).toBeUndefined();
    await waitForJob(app, submit.body.job_id, "completed");
  });

});
