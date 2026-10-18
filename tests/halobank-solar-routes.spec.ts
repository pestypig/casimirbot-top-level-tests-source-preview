import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { halobankSolarRouter } from "../server/routes/halobank-solar";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", halobankSolarRouter);
  return app;
}

function vecNorm(values: number[]): number {
  return Math.hypot(...values);
}

describe("halobank solar vectors route", () => {
  it("serves deterministic vector payload with time scales and provenance", async () => {
    const app = makeApp();
    const path =
      "/api/horizons/vectors?ts=2026-02-17T12:00:00.000Z&targets=199,299,399,499,599,699,799,899&center=0&frame=BCRS&aberration=lt+s";
    const resA = await request(app).get(path).expect(200);
    const resB = await request(app).get(path).expect(200);

    expect(resA.body.time_scales?.utc).toBe("2026-02-17T12:00:00.000Z");
    expect(Array.isArray(resA.body.states)).toBe(true);
    expect(resA.body.states.length).toBe(8);
    expect(resA.body.metric_context?.pn_gr_model_id).toBe("halobank.solar.iau2000b1.3-weak-field-ppn-gr/1");
    expect(resA.body.metric_context?.frame).toBe("BCRS");
    expect(resA.body.metric_context?.coordinate_time_scale).toBe("TCB");
    expect(Array.isArray(resA.body.metric_context?.source_potentials_used)).toBe(true);
    expect(resA.body.metric_context?.source_potentials_used?.some((entry: { id?: string }) => entry?.id === "sun_monopole")).toBe(true);
    expect(resA.body.reference?.relation).toBe("target_minus_reference");
    expect(resA.body.reference?.speed_semantics).toBe("relative_to_resolved_reference");
    expect(resA.body.reference_origin_state?.speed_km_s).toBeTypeOf("number");
    expect(resA.body.reference_origin_state?.galactic_axes).toBe("U_toward_gc,V_rotation,W_toward_ngp");
    expect(resA.body.states[0]?.kinematics?.speed_km_s).toBeTypeOf("number");
    expect(resA.body.states[0]?.kinematics?.radial_velocity_km_s).toBeTypeOf("number");
    expect(resA.body.states[0]?.kinematics?.galactic_axes).toBe("U_toward_gc,V_rotation,W_toward_ngp");
    expect(resA.body.provenance?.kernel_bundle_id).toBeDefined();
    expect(resA.body.provenance?.evidence_refs?.some((entry: string) => entry.startsWith("artifact:halobank.solar.metric_context:"))).toBe(true);
    expect(resA.body.gate?.deterministic).toBe(true);
    expect(resA.body.artifacts?.some((entry: { id?: string }) => entry?.id === "metric_context")).toBe(true);
    expect(resA.body).toEqual(resB.body);
  });

  it("reports Earth heliocentric speed relative to the Sun instead of an implicit absolute speed", async () => {
    const app = makeApp();
    const res = await request(app)
      .get("/api/horizons/vectors?ts=2026-02-17T12:00:00.000Z&targets=399&center=10&frame=BCRS&aberration=none")
      .expect(200);

    expect(res.body.reference?.resolved_center).toBe(10);
    expect(res.body.states?.[0]?.target).toBe(399);
    expect(res.body.states?.[0]?.center).toBe(10);
    expect(res.body.states?.[0]?.kinematics?.speed_km_s).toBeGreaterThan(20);
    expect(res.body.states?.[0]?.kinematics?.speed_km_s).toBeLessThan(40);
    expect(res.body.reference_origin_state?.body).toBe(10);
    expect(vecNorm(res.body.states?.[0]?.kinematics?.galactic_uvw_km_s ?? [])).toBeCloseTo(
      res.body.states?.[0]?.kinematics?.speed_km_s,
      8,
    );
  });

  it("discloses synthetic Saturn-moon state sources on the direct vectors route for Mimas and Hyperion", async () => {
    const app = makeApp();
    const path =
      "/api/horizons/vectors?ts=2026-02-17T12:00:00.000Z&targets=601,607&center=699&frame=BCRS&aberration=none";
    const resA = await request(app).get(path).expect(200);
    const resB = await request(app).get(path).expect(200);

    expect(resA.body.reference?.resolved_center).toBe(699);
    expect(resA.body.states).toHaveLength(2);
    expect(resA.body.states?.map((state: { target: number }) => state.target)).toEqual([601, 607]);
    for (const state of resA.body.states as Array<{ pos: number[]; vel: number[] }>) {
      expect(state.pos.every((entry) => Number.isFinite(entry))).toBe(true);
      expect(state.vel.every((entry) => Number.isFinite(entry))).toBe(true);
    }
    expect(resA.body.gate?.verdict).toBe("PASS");
    expect(resA.body.provenance?.source_class).toBe("hybrid_diagnostic");
    expect(resA.body.provenance?.note).toContain("synthetic diagnostic satellite states");
    expect(
      resA.body.provenance?.state_sources
        ?.filter((entry: { source_class?: string }) => entry.source_class === "hybrid_diagnostic")
        .map((entry: { body: number }) => entry.body),
    ).toEqual([601, 607]);
    expect(resA.body.provenance?.state_sources?.some((entry: { body: number; source_class?: string }) => entry.body === 699 && entry.source_class === "kernel_bundle")).toBe(true);
    expect(resA.body).toEqual(resB.body);
  });

  it("fails strict provenance gate when no canonical evidence refs are supplied", async () => {
    const app = makeApp();
    const res = await request(app)
      .get("/api/horizons/vectors?ts=2026-02-17T12:00:00.000Z&strict_provenance=1")
      .expect(200);
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_STRICT_PROVENANCE_MISSING");
  });

  it("returns deterministic orientation fail id for unsupported body-fixed observer kernel", async () => {
    const app = makeApp();
    const observer = encodeURIComponent(
      JSON.stringify({
        mode: "body-fixed",
        body: 599,
        lon_deg: 0,
        lat_deg: 0,
        height_m: 0,
      }),
    );
    const res = await request(app)
      .get(`/api/horizons/vectors?ts=2026-02-17T12:00:00.000Z&observer=${observer}`)
      .expect(200);
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_ORIENTATION_KERNEL_MISSING");
    expect(res.body.reference?.resolved_center).toBe(399);
    expect(res.body.reference?.observer_mode).toBe("body-fixed");
  });

  it("can attach an outer local-rest reference summary without changing solar relative-speed semantics", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "halobank-solar-lsr-"));
    const catalogPath = path.join(tmpDir, "nearby-stars.csv");
    const previousCatalog = process.env.LSR_CATALOG_PATH;
    const previousTtl = process.env.LSR_CACHE_TTL_MS;
    const previousPeculiar = process.env.LSR_SOLAR_PECULIAR;
    try {
      fs.writeFileSync(
        catalogPath,
        [
          "id,ra_deg,dec_deg,plx_mas,pmra_masyr,pmdec_masyr,rv_kms,hr,source",
          "demo-star,15,20,200,5,-3,20,G,test-catalog",
        ].join("\n"),
        "utf8",
      );
      process.env.LSR_CATALOG_PATH = catalogPath;
      process.env.LSR_CACHE_TTL_MS = "0";
      process.env.LSR_SOLAR_PECULIAR = "huang2015";

      const app = makeApp();
      const res = await request(app)
        .get("/api/horizons/vectors?ts=2026-02-17T12:00:00.000Z&targets=399&center=10&include_local_rest=1&local_rest_radius_pc=50")
        .expect(200);

      expect(res.body.reference?.speed_semantics).toBe("relative_to_resolved_reference");
      expect(res.body.reference_chain?.local_rest?.status).toBe("linked");
      expect(res.body.reference_chain?.local_rest?.semantics).toBe("outer_reference_only");
      expect(res.body.reference_chain?.local_rest?.velocity_avg_kms).toHaveLength(3);
      expect(res.body.reference_chain?.local_rest?.ssb_offset_km_s).toHaveLength(3);
      expect(res.body.reference_chain?.local_rest?.calibration?.status).toBe("pass");
      expect(res.body.reference_chain?.local_rest?.calibration?.reference_id).toBe("huang2015");
      expect(res.body.reference_chain?.local_rest?.calibration_artifact_ref).toMatch(
        /^artifact:halobank\.solar\.local_rest_anchor_calibration:/,
      );
      expect(res.body.reference_chain?.local_rest?.projection_of_resolved_reference?.semantics).toBe(
        "resolved_reference_minus_declared_local_rest",
      );
      expect(res.body.reference_origin_state?.local_rest?.status).toBe("projected");
      expect(res.body.reference_origin_state?.local_rest?.semantics).toBe("resolved_reference_minus_declared_local_rest");
      expect(res.body.reference_origin_state?.local_rest?.uvw_km_s).toHaveLength(3);
      expect(res.body.states?.[0]?.kinematics?.local_rest?.status).toBe("projected");
      expect(res.body.states?.[0]?.kinematics?.local_rest?.semantics).toBe("translation_invariant_relative_velocity");
      expect(res.body.states?.[0]?.kinematics?.local_rest?.uvw_km_s).toEqual(
        res.body.states?.[0]?.kinematics?.galactic_uvw_km_s,
      );
      expect(
        res.body.provenance?.evidence_refs?.includes(res.body.reference_chain?.local_rest?.calibration_artifact_ref),
      ).toBe(true);
      expect(res.body.artifacts?.some((entry: { id?: string }) => entry?.id === "local_rest_calibration")).toBe(true);
      expect(res.body.states?.[0]?.center).toBe(10);
    } finally {
      if (previousCatalog === undefined) {
        delete process.env.LSR_CATALOG_PATH;
      } else {
        process.env.LSR_CATALOG_PATH = previousCatalog;
      }
      if (previousTtl === undefined) {
        delete process.env.LSR_CACHE_TTL_MS;
      } else {
        process.env.LSR_CACHE_TTL_MS = previousTtl;
      }
      if (previousPeculiar === undefined) {
        delete process.env.LSR_SOLAR_PECULIAR;
      } else {
        process.env.LSR_SOLAR_PECULIAR = previousPeculiar;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails deterministically when local-rest projection is requested but the stellar anchor is unavailable", async () => {
    const previousCatalog = process.env.LSR_CATALOG_PATH;
    const previousTtl = process.env.LSR_CACHE_TTL_MS;
    try {
      process.env.LSR_CATALOG_PATH = path.join(os.tmpdir(), "missing-halobank-local-rest.csv");
      process.env.LSR_CACHE_TTL_MS = "0";

      const app = makeApp();
      const res = await request(app)
        .get("/api/horizons/vectors?ts=2026-02-17T12:00:00.000Z&targets=399&center=10&include_local_rest=1")
        .expect(200);

      expect(res.body.gate?.verdict).toBe("FAIL");
      expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_LOCAL_REST_UNAVAILABLE");
      expect(res.body.reference_chain?.local_rest?.status).toBe("unavailable");
      expect(res.body.reference_chain?.local_rest?.fail_id).toBe("HALOBANK_SOLAR_LOCAL_REST_UNAVAILABLE");
      expect(res.body.reference_origin_state?.local_rest?.status).toBe("unavailable");
      expect(res.body.states?.[0]?.kinematics?.local_rest?.status).toBe("unavailable");
    } finally {
      if (previousCatalog === undefined) {
        delete process.env.LSR_CATALOG_PATH;
      } else {
        process.env.LSR_CATALOG_PATH = previousCatalog;
      }
      if (previousTtl === undefined) {
        delete process.env.LSR_CACHE_TTL_MS;
      } else {
        process.env.LSR_CACHE_TTL_MS = previousTtl;
      }
    }
  });
});
