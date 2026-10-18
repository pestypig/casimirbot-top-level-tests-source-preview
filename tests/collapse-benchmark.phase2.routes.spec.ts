import path from "node:path";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  CollapseBenchmarkResult,
  collapseTriggerDecision,
  hazardProbability,
} from "@shared/collapse-benchmark";
import { collapseBenchmarksRouter } from "../server/routes/benchmarks.collapse";
import { handleInformationEvent, getTelemetrySnapshot } from "../server/services/star/service";

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/benchmarks/collapse", collapseBenchmarksRouter);
  return app;
};

describe("collapse benchmark (Phase 3): HTTP API", () => {
  it("POST /api/benchmarks/collapse returns a valid CollapseBenchmarkResult (deterministic under asOf)", async () => {
    const app = createApp();
    const asOf = "2025-01-01T00:00:00.000Z";
    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 50,
      tau_ms: 1_000,
      r_c_m: 0.25,
      seed: "deadbeef",
    };

    const res1 = await request(app).post(`/api/benchmarks/collapse?asOf=${encodeURIComponent(asOf)}`).send(body).expect(200);
    const parsed1 = CollapseBenchmarkResult.parse(res1.body);
    expect(parsed1.data_cutoff_iso).toBe(asOf);
    expect(parsed1.information_boundary.data_cutoff_iso).toBe(asOf);

    const res2 = await request(app).post(`/api/benchmarks/collapse?asOf=${encodeURIComponent(asOf)}`).send(body).expect(200);
    expect(res2.body).toEqual(res1.body);
  });

  it("POST /api/benchmarks/collapse rejects missing tau_ms in v1", async () => {
    const app = createApp();
    await request(app)
      .post("/api/benchmarks/collapse")
      .send({ schema_version: "collapse_benchmark/1", dt_ms: 50, r_c_m: 0.25 })
      .expect(400);
  });

  it("POST /api/benchmarks/collapse accepts DP input and derives tau", async () => {
    const app = createApp();
    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 25,
      dp: {
        schema_version: "dp_collapse/1",
        ell_m: 2e-10,
        grid: {
          dims: [18, 18, 18],
          voxel_size_m: [1e-9, 1e-9, 1e-9],
          origin_m: [0, 0, 0],
        },
        method: { kernel: "plummer", max_voxels: 1000 },
        branch_a: {
          kind: "analytic",
          primitives: [
            { kind: "gaussian", mass_kg: 6e-16, sigma_m: 1.4e-9, center_m: [-2e-9, 0, 0] },
          ],
        },
        branch_b: {
          kind: "analytic",
          primitives: [
            { kind: "gaussian", mass_kg: 6e-16, sigma_m: 1.4e-9, center_m: [2e-9, 0, 0] },
          ],
        },
      },
    };

    const res = await request(app).post("/api/benchmarks/collapse").send(body).expect(200);
    const parsed = CollapseBenchmarkResult.parse(res.body);
    expect(parsed.tau_source).toBe("dp_deltaE");
    expect(parsed.r_c_source).toBe("dp_smear");
    expect(parsed.dp?.ell_m).toBeCloseTo(2e-10, 12);
    expect(parsed.dp?.deltaE_J ?? 0).toBeGreaterThan(0);
  });

  it("POST /api/benchmarks/collapse exposes split geometry channels when curvature inputs are provided", async () => {
    const app = createApp();
    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 50,
      tau_estimator: {
        kappa_drive_m2: 1e-3,
        kappa_body_m2: 1e-5,
        coherence: 0.4,
        dispersion: 0.7,
        residual_rms: 0.01,
        roots_count: 12,
        r_c_hint_m: 0.6,
        tau_hint_ms: 1_400,
      },
    };

    const res = await request(app).post("/api/benchmarks/collapse").send(body).expect(200);
    const parsed = CollapseBenchmarkResult.parse(res.body);
    expect(parsed.background_geometry?.role).toBe("background_geometry");
    expect(parsed.background_geometry?.proxies?.canonical_channel).toBe("kappa_u");
    expect(parsed.dynamic_forcing_geometry?.role).toBe("dynamic_forcing_geometry");
    expect(parsed.dynamic_forcing_geometry?.proxies?.canonical_channel).toBe("kappa_drive");
    expect(parsed.geometry_coupling?.role).toBe("background_geometry");
  });

  it("POST /api/benchmarks/collapse emits source-backed exploratory comparison replay when requested", async () => {
    const app = createApp();
    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 25,
      tau_ms: 3.5,
      r_c_m: 1e-8,
      quantum_semiclassical_source_replay_id: "kalra_2022__zhang_2017__packet_primary",
    };

    const res = await request(app).post("/api/benchmarks/collapse").send(body).expect(200);
    const parsed = CollapseBenchmarkResult.parse(res.body);
    expect(parsed.quantum_semiclassical_source_replay?.profile_id).toBe("kalra_2022__zhang_2017__packet_primary");
    expect(parsed.quantum_semiclassical_comparison?.measurement_timescale_kind).toBe(
      "microtubule_transport_lifetime_proxy",
    );
    expect(parsed.quantum_semiclassical_comparison?.subharmonic_lock_ratio).toBe(2);
    expect(parsed.quantum_semiclassical_comparison?.time_crystal_signature_pass).toBe(true);
  });

  it("POST /api/benchmarks/collapse accepts dp_adapter inputs and derives tau", async () => {
    const app = createApp();
    const dims = [4, 4, 4] as const;
    const total = dims[0] * dims[1] * dims[2];
    const energyA = new Float32Array(total);
    const energyB = new Float32Array(total);
    const energy = 1e3 * (299_792_458 * 299_792_458);
    energyA[0] = energy;
    energyB[total - 1] = energy;
    const toPayload = (arr: Float32Array) => ({
      encoding: "base64" as const,
      dtype: "float32" as const,
      endian: "little" as const,
      order: "row-major" as const,
      data_b64: Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64"),
    });

    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 25,
      dp_adapter: {
        schema_version: "dp_adapter/1",
        ell_m: 2e-10,
        branch_a: {
          density: toPayload(energyA),
          units: "energy_density_J_m3",
          grid_bounds: {
            dims,
            bounds: { min: [0, 0, 0], max: [4e-9, 4e-9, 4e-9] },
          },
        },
        branch_b: {
          density: toPayload(energyB),
          units: "energy_density_J_m3",
          grid_bounds: {
            dims,
            bounds: { min: [0, 0, 0], max: [4e-9, 4e-9, 4e-9] },
          },
        },
      },
    };

    const res = await request(app).post("/api/benchmarks/collapse").send(body).expect(200);
    const parsed = CollapseBenchmarkResult.parse(res.body);
    expect(parsed.tau_source).toBe("dp_deltaE");
    expect(parsed.r_c_source).toBe("dp_smear");
    expect(parsed.dp?.ell_m).toBeCloseTo(2e-10, 12);
    expect(parsed.dp?.deltaE_J ?? 0).toBeGreaterThan(0);
  });

  it("POST /api/benchmarks/collapse/dp-plan returns planning metrics", async () => {
    const app = createApp();
    const asOf = "2025-01-01T00:00:00.000Z";
    const body = {
      schema_version: "dp_plan/1",
      dp: {
        schema_version: "dp_collapse/1",
        ell_m: 2e-10,
        grid: {
          dims: [12, 12, 12],
          voxel_size_m: [1e-9, 1e-9, 1e-9],
          origin_m: [0, 0, 0],
        },
        branch_a: {
          kind: "analytic",
          primitives: [
            { kind: "gaussian", mass_kg: 4e-16, sigma_m: 1.2e-9, center_m: [-1.5e-9, 0, 0] },
          ],
        },
        branch_b: {
          kind: "analytic",
          primitives: [
            { kind: "gaussian", mass_kg: 4e-16, sigma_m: 1.2e-9, center_m: [1.5e-9, 0, 0] },
          ],
        },
      },
      visibility: { v0: 1, times_s: [0, 0.5, 1] },
      environment: { gamma_env_s: 1e-3, label: "env" },
    };

    const res = await request(app)
      .post(`/api/benchmarks/collapse/dp-plan?asOf=${encodeURIComponent(asOf)}`)
      .send(body)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.schema_version).toBe("dp_plan/1");
    expect(res.body.data_cutoff_iso).toBe(asOf);
    expect(res.body.dp?.deltaE_J ?? 0).toBeGreaterThan(0);
    expect(res.body.gamma_dp_s).toBeGreaterThan(0);
    expect(res.body.visibility?.curve?.length ?? 0).toBe(3);
  });

  it("POST /api/benchmarks/collapse/dp-adapter builds from stress_energy_brick", async () => {
    const app = createApp();
    const asOf = "2025-01-01T00:00:00.000Z";
    const dims = [4, 4, 4] as const;
    const body = {
      schema_version: "dp_adapter_build/1",
      source: "stress_energy_brick",
      ell_m: 2e-10,
      grid_bounds: {
        dims,
        bounds: { min: [-1e-6, -1e-6, -1e-6], max: [1e-6, 1e-6, 1e-6] },
      },
      branch_a: { label: "stress-a", sign_mode: "absolute" as const },
      branch_b: { label: "stress-b", sign_mode: "absolute" as const },
    };

    const res = await request(app)
      .post(`/api/benchmarks/collapse/dp-adapter?asOf=${encodeURIComponent(asOf)}`)
      .send(body)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.schema_version).toBe("dp_adapter_build/1");
    expect(res.body.data_cutoff_iso).toBe(asOf);
    expect(res.body.dp_adapter.schema_version).toBe("dp_adapter/1");
    expect(res.body.dp_adapter.branch_a.units).toBe("energy_density_J_m3");
    expect(res.body.dp_adapter.branch_b.units).toBe("energy_density_J_m3");
    expect(res.body.branches.a.units).toBe("energy_density_J_m3");
    expect(res.body.branches.b.units).toBe("energy_density_J_m3");
  });

  it("POST /api/benchmarks/collapse/dp-adapter builds from gr_evolve_brick", async () => {
    const app = createApp();
    const asOf = "2025-01-01T00:00:00.000Z";
    const dims = [4, 4, 4] as const;
    const body = {
      schema_version: "dp_adapter_build/1",
      source: "gr_evolve_brick",
      ell_m: 2e-10,
      include_matter: true,
      grid_bounds: {
        dims,
        bounds: { min: [-1e-6, -1e-6, -1e-6], max: [1e-6, 1e-6, 1e-6] },
      },
      branch_a: { params: { steps: 0, iterations: 0 }, label: "gr-a", sign_mode: "positive" as const },
      branch_b: { params: { steps: 0, iterations: 0 }, label: "gr-b", sign_mode: "positive" as const },
    };

    const res = await request(app)
      .post(`/api/benchmarks/collapse/dp-adapter?asOf=${encodeURIComponent(asOf)}`)
      .send(body)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.schema_version).toBe("dp_adapter_build/1");
    expect(res.body.data_cutoff_iso).toBe(asOf);
    expect(res.body.dp_adapter.schema_version).toBe("dp_adapter/1");
    expect(res.body.dp_adapter.branch_a.units).toBe("geom_stress");
    expect(res.body.dp_adapter.branch_b.units).toBe("geom_stress");
    expect(res.body.branches.a.units).toBe("geom_stress");
    expect(res.body.branches.b.units).toBe("geom_stress");
  });

  it("POST /api/benchmarks/collapse can derive r_c_m from lattice summary and binds lattice_generation_hash", async () => {
    const app = createApp();
    const asOf = "2025-01-01T00:00:00.000Z";
    const lattice_generation_hash = "lattice:abc123";
    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 50,
      tau_ms: 1_000,
      lattice: {
        lattice_generation_hash,
        dims: [10, 10, 10],
        voxel_size_m: 0.1,
        lattice_size_m: [1, 2, 3],
        coverage: 0.5,
      },
    };

    const res = await request(app)
      .post(`/api/benchmarks/collapse?asOf=${encodeURIComponent(asOf)}`)
      .send(body)
      .expect(200);

    const parsed = CollapseBenchmarkResult.parse(res.body);
    expect(parsed.lattice_generation_hash).toBe(lattice_generation_hash);
    expect(parsed.r_c_source).toBe("geometry");
    expect(parsed.r_c_m).toBeCloseTo(0.5, 12);
    expect(parsed.L_present_m).toBeCloseTo(0.5, 12);
    expect(parsed.kappa_present_m2).toBeCloseTo(4, 12);
  });

  it("POST /api/benchmarks/collapse refuses stale lattice_generation_hash when expected differs", async () => {
    const app = createApp();
    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 50,
      tau_ms: 1_000,
      expected_lattice_generation_hash: "lattice:new",
      lattice: {
        lattice_generation_hash: "lattice:old",
        dims: [10, 10, 10],
        voxel_size_m: 0.1,
      },
    };

    const res = await request(app).post("/api/benchmarks/collapse").send(body).expect(409);
    expect(res.body.error).toBe("stale_lattice_generation_hash");
    expect(res.body.expected).toBe("lattice:new");
    expect(res.body.got).toBe("lattice:old");
  });

  it("POST /api/benchmarks/collapse/explain returns resolved values + hashes", async () => {
    const app = createApp();
    const asOf = "2025-01-01T00:00:00.000Z";
    const body = {
      schema_version: "collapse_benchmark/1",
      dt_ms: 50,
      tau_ms: 1_000,
      r_c_m: 0.25,
    };
    const res = await request(app)
      .post(`/api/benchmarks/collapse/explain?asOf=${encodeURIComponent(asOf)}`)
      .send(body)
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resolved.tau_ms).toBe(1_000);
    expect(res.body.tau_source).toBe("manual");
    expect(res.body.r_c_source).toBe("manual");
    expect(res.body.data_cutoff_iso).toBe(asOf);
    expect(typeof res.body.inputs_hash).toBe("string");
    expect(res.body.inputs_hash.startsWith("sha256:")).toBe(true);
    expect(typeof res.body.features_hash).toBe("string");
    expect(res.body.features_hash.startsWith("sha256:")).toBe(true);
  });

  it("GET /api/benchmarks/collapse/from-session uses session dp_tau_estimate_ms with manual r_c_m", async () => {
    const app = createApp();
    const session_id = "collapse-session-1";
    const session_type = "debate";
    const timestamp = Date.parse("2025-01-01T00:00:00.000Z");

    handleInformationEvent({
      session_id,
      session_type,
      bytes: 2_048,
      complexity_score: 0.6,
      alignment: 0.1,
      origin: "model",
      timestamp,
    });

    const snapshot = getTelemetrySnapshot(session_id, session_type);
    const tau_ms = snapshot.dp_tau_estimate_ms;
    expect(tau_ms).toBeGreaterThan(0);
    if (tau_ms == null) {
      throw new Error("dp_tau_estimate_ms unavailable for session");
    }

    const dt_ms = 20;
    const r_c_m = 0.4;
    const asOf = "2025-01-02T00:00:00.000Z";

    const res = await request(app)
      .get("/api/benchmarks/collapse/from-session")
      .query({ session_id, session_type, dt_ms, r_c_m, asOf })
      .expect(200);

    const parsed = CollapseBenchmarkResult.parse(res.body);
    expect(parsed.tau_source).toBe("session_dp_tau");
    expect(parsed.tau_ms).toBeCloseTo(tau_ms, 12);
    expect(parsed.p_trigger).toBeCloseTo(hazardProbability(dt_ms, tau_ms), 12);
    expect(parsed.data_cutoff_iso).toBe(asOf);
  });

  it("GET /api/benchmarks/collapse/from-session loads lattice sidecars when r_c_m is omitted", async () => {
    const app = createApp();
    const session_id = "collapse-session-sidecar";
    const session_type = "lab";
    const timestamp = Date.parse("2025-01-01T00:00:00.000Z");

    handleInformationEvent({
      session_id,
      session_type,
      bytes: 1_024,
      complexity_score: 0.55,
      alignment: 0.05,
      origin: "model",
      timestamp,
    });

    const snapshot = getTelemetrySnapshot(session_id, session_type);
    const tau_ms = snapshot.dp_tau_estimate_ms;
    expect(tau_ms).toBeGreaterThan(0);
    if (tau_ms == null) {
      throw new Error("dp_tau_estimate_ms unavailable for session");
    }

    const sidecarPath = path.resolve(process.cwd(), "tests/fixtures/lattice.sidecar.fixture.json");
    const dt_ms = 40;
    const asOf = "2025-01-03T00:00:00.000Z";

    const res = await request(app)
      .get("/api/benchmarks/collapse/from-session")
      .query({
        session_id,
        session_type,
        lattice_sidecar_path: sidecarPath,
        dt_ms,
        expected_lattice_generation_hash: "lattice:sidecar-fixture",
        asOf,
      })
      .expect(200);

    const parsed = CollapseBenchmarkResult.parse(res.body);
    expect(parsed.tau_source).toBe("session_dp_tau");
    expect(parsed.lattice_generation_hash).toBe("lattice:sidecar-fixture");
    expect(parsed.r_c_source).toBe("geometry");
    expect(parsed.r_c_m).toBeCloseTo(0.6, 12); // min axis (1.2 m) / 2
    expect(parsed.p_trigger).toBeCloseTo(hazardProbability(dt_ms, tau_ms), 12);
    expect(parsed.data_cutoff_iso).toBe(asOf);
  });

  it("POST /api/benchmarks/collapse/run is deterministic under fixed seed + asOf", async () => {
    const app = createApp();
    const asOf = "2025-01-01T00:00:00.000Z";
    const steps = 1_000;
    const seed = "deadbeef";
    const dt_ms = 50;
    const tau_ms = 1_000;
    const lattice_generation_hash = "lattice:deadbeef";
    const lattice = {
      lattice_generation_hash,
      dims: [10, 10, 10],
      voxel_size_m: 0.1,
      lattice_size_m: [1, 2, 3],
      coverage: 0.95,
    };
    const histogram_bins = 10;

    const body = { steps, dt_ms, tau_ms, lattice, seed, histogram_bins };
    const res1 = await request(app).post(`/api/benchmarks/collapse/run?asOf=${encodeURIComponent(asOf)}`).send(body).expect(200);
    const res2 = await request(app).post(`/api/benchmarks/collapse/run?asOf=${encodeURIComponent(asOf)}`).send(body).expect(200);
    expect(res2.body).toEqual(res1.body);

    const p = hazardProbability(dt_ms, tau_ms);
    let expectedTriggers = 0;
    for (let i = 0; i < steps; i += 1) {
      if (collapseTriggerDecision(seed, i, p).trigger) expectedTriggers += 1;
    }
    expect(res1.body.p_trigger).toBe(p);
    expect(res1.body.trigger_count).toBe(expectedTriggers);
    expect(res1.body.lattice_generation_hash).toBe(lattice_generation_hash);
    expect(res1.body.r_c_source).toBe("geometry");
    expect(res1.body.r_c_m).toBeCloseTo(0.5, 12);

    const counts: number[] = res1.body.histogram_u?.counts ?? [];
    expect(counts.length).toBe(histogram_bins);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(steps);
    expect(res1.body.trigger_rate).toBeCloseTo(expectedTriggers / steps, 12);
  });
});
