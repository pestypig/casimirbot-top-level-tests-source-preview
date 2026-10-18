import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { starSimRouter } from "../server/routes/star-sim";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/star-sim", starSimRouter);
  return app;
};

describe("star-sim v1 route", () => {
  it("wraps solar classification, reduced structure, solar diagnostics, and barycenter context into one contract", async () => {
    const app = buildApp();
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
        activity: {
          replay_series_id: "gong-silso-cycle23-radial-band",
          flare_replay_series_id: "flare-sunquake-timing-replay",
          sunquake_replay_series_id: "flare-sunquake-timing-replay",
        },
        orbital_context: {
          naif_body_id: 10,
        },
      })
      .expect(200);

    expect(res.body.schema_version).toBe("star-sim-v1");
    expect(res.body.meta.contract_version).toBe("star-sim-v1");
    expect(res.body.target.object_id).toBe("sun");
    expect(res.body.taxonomy.obs_class).toBe("O5");
    expect(res.body.taxonomy.phys_class).toBe("P4");
    expect(res.body.taxonomy.requested_phys_class).toBe("P1");
    expect(res.body.taxonomy.requested_phys_class_status).toBe("complete");
    expect(res.body.solver_plan.executed_lanes).toEqual([
      "classification",
      "structure_1d",
      "activity_solar_observed",
      "barycenter_analytic",
    ]);

    const classification = res.body.lanes.find((lane: any) => lane.lane_id === "classification");
    const activity = res.body.lanes.find((lane: any) => lane.lane_id === "activity_solar_observed");
    const barycenter = res.body.lanes.find((lane: any) => lane.lane_id === "barycenter_analytic");

    expect(classification.status).toBe("available");
    expect(classification.execution_kind).toBe("fit");
    expect(classification.result.spectral_type).toBe("G2V");
    expect(activity.status).toBe("available");
    expect(activity.execution_kind).toBe("replay");
    expect(activity.tree_dag.parent_claim_ids).toContain("claim:halobank.solar:stellar_observables_diagnostic");
    expect(activity.tree_dag.parent_claim_ids).toContain("claim:halobank.solar:stellar_flare_sunquake_diagnostic");
    expect(barycenter.status).toBe("available");
    expect(barycenter.result.state_source.source_model).toBe("astronomy-engine-barycentric/1");
    expect(barycenter.result.ephemeris_grade).toBe("approximate");
    expect(res.body.congruence.overall_available_score).toBeGreaterThan(0);
    expect(res.body.congruence.overall_requested_score).toBeGreaterThan(0);
  });

  it("hard-gates the solar activity lane for non-solar G-type stars", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        target: {
          object_id: "hd-146233",
          name: "18 Scorpii",
          epoch_iso: "2026-01-01T00:00:00.000Z",
        },
        spectroscopy: {
          teff_K: 5823,
          logg_cgs: 4.45,
        },
        requested_lanes: ["classification", "activity"],
        strict_lanes: true,
      })
      .expect(200);

    const activity = res.body.lanes.find((lane: any) => lane.requested_lane === "activity");
    expect(activity.status).toBe("unavailable");
    expect(activity.status_reason).toBe("sun_only_lane");
    expect(activity.result.reason).toContain("Solar replay diagnostics");
    expect(res.body.taxonomy.obs_class).toBe("O1");
    expect(res.body.taxonomy.requested_phys_class_status).toBe("blocked");
    expect(res.body.congruence.requested_blockers).toEqual(["activity"]);
    expect(res.body.congruence.overall_requested_score).toBe(0);
  });

  it("treats barycenter as not applicable without orbital context instead of bad physics", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        target: {
          object_id: "kepler-11",
          name: "Kepler-11",
          epoch_iso: "2026-01-01T00:00:00.000Z",
        },
        requested_lanes: ["classification", "barycenter"],
      })
      .expect(200);

    const barycenter = res.body.lanes.find((lane: any) => lane.requested_lane === "barycenter");
    expect(barycenter.status).toBe("not_applicable");
    expect(barycenter.status_reason).toBe("orbital_context_missing");
    expect(res.body.congruence.not_applicable_requested_lanes).toEqual(["barycenter"]);
    expect(res.body.congruence.requested_blockers).toEqual([]);
  });

  it("returns structure lane unavailable for out-of-domain masses", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        target: {
          object_id: "rigel-like-demo",
          name: "Rigel-like Demo",
          epoch_iso: "2026-01-01T00:00:00.000Z",
        },
        structure: {
          mass_Msun: 30,
        },
        requested_lanes: ["structure_1d"],
        strict_lanes: true,
      })
      .expect(200);

    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("out_of_domain");
    expect(res.body.congruence.overall_requested_score).toBe(0);
  });

  it("keeps deterministic hashes and congruence under JSON field reordering", async () => {
    const app = buildApp();
    const payloadA = {
      target: {
        object_id: "sun",
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
      },
      spectroscopy: {
        teff_K: 5772,
        logg_cgs: 4.438,
      },
      activity: {
        replay_series_id: "gong-silso-cycle23-radial-band",
      },
      orbital_context: {
        naif_body_id: 10,
      },
      requested_lanes: ["classification", "activity", "barycenter"],
    };
    const payloadB = {
      requested_lanes: ["classification", "activity", "barycenter"],
      orbital_context: {
        naif_body_id: 10,
      },
      activity: {
        replay_series_id: "gong-silso-cycle23-radial-band",
      },
      spectroscopy: {
        logg_cgs: 4.438,
        teff_K: 5772,
      },
      target: {
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
        object_id: "sun",
      },
    };

    const [resA, resB] = await Promise.all([
      request(app).post("/api/star-sim/v1/run").send(payloadA).expect(200),
      request(app).post("/api/star-sim/v1/run").send(payloadB).expect(200),
    ]);

    expect(resA.body.meta.deterministic_request_hash).toBe(resB.body.meta.deterministic_request_hash);
    expect(resA.body.meta.canonical_observables_hash).toBe(resB.body.meta.canonical_observables_hash);
    expect(resA.body.meta.solver_manifest_hash).toBe(resB.body.meta.solver_manifest_hash);
    expect(resA.body.congruence).toEqual(resB.body.congruence);
  });
});
