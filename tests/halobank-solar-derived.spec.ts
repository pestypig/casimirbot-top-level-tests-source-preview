import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { getBaryState, resolveSupportedBody } from "../server/modules/halobank-solar/ephemeris-core";
import { halobankSolarRouter } from "../server/routes/halobank-solar";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", halobankSolarRouter);
  return app;
}

function normalize(values: number[]): [number, number, number] {
  const norm = Math.hypot(...values);
  return [values[0] / norm, values[1] / norm, values[2] / norm];
}

describe("halobank solar derived route", () => {
  it("runs mercury precession module and emits deterministic artifacts + tree_dag contract", async () => {
    const app = makeApp();
    const payload = {
      module: "mercury_precession",
      input: {
        start_iso: "2000-01-01T00:00:00.000Z",
        end_iso: "2030-01-01T00:00:00.000Z",
        step_days: 5,
      },
      evidence_refs: ["artifact:halobank.solar.test:fixture-1"],
    };
    const resA = await request(app).post("/api/halobank/derived").send(payload).expect(200);
    const resB = await request(app).post("/api/halobank/derived").send(payload).expect(200);

    expect(resA.body.module).toBe("mercury_precession");
    expect(resA.body.result?.measured_arcsec_per_century).toBeTypeOf("number");
    expect(resA.body.metric_context?.pn_gr_model_id).toBe("halobank.solar.iau2000b1.3-weak-field-ppn-gr/1");
    expect(resA.body.gate?.verdict).toBe("PASS");
    expect(resA.body.artifacts?.length).toBeGreaterThan(0);
    expect(resA.body.tree_dag?.claim_id).toBe("claim:halobank.solar:mercury_precession");
    expect(resA.body.tree_dag?.equation_refs).toContain("efe_baseline");
    expect(resA.body).toEqual(resB.body);
  });

  it("fails mercury module with deterministic firstFail when perihelion events are insufficient", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "mercury_precession",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-02-01T00:00:00.000Z",
          step_days: 5,
        },
      })
      .expect(200);
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_MERCURY_INSUFFICIENT_EVENTS");
  });

  it("applies strict provenance fail for derived calls without evidence refs", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "resonance_libration",
        strict_provenance: true,
        input: {
          start_iso: "2020-01-01T00:00:00.000Z",
          end_iso: "2030-01-01T00:00:00.000Z",
          step_days: 20,
          primary_id: 599,
          secondary_id: 699,
          p: 5,
          q: 2,
        },
      })
      .expect(200);
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_STRICT_PROVENANCE_MISSING");
  });

  it("finds a candidate eclipse event window for August 2026 geocenter view", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "earth_moon_eclipse_timing",
        input: {
          start_iso: "2026-08-10T00:00:00.000Z",
          end_iso: "2026-08-14T00:00:00.000Z",
          step_minutes: 1,
          observer: { mode: "geocenter" },
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("PASS");
    expect(Array.isArray(res.body.result?.events)).toBe(true);
    expect(res.body.result?.events.length).toBeGreaterThan(0);
  });

  it("supports Earth body-fixed observers for earth-moon eclipse timing geometry", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "earth_moon_eclipse_timing",
        input: {
          start_iso: "2026-08-10T00:00:00.000Z",
          end_iso: "2026-08-14T00:00:00.000Z",
          step_minutes: 1,
          observer: {
            mode: "body-fixed",
            body: 399,
            lon_deg: -20,
            lat_deg: 65,
            height_m: 100,
          },
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.observer_context?.mode).toBe("body-fixed");
    expect(res.body.result?.observer_context?.resolved_body_id).toBe(399);
    expect(res.body.result?.observer_context?.warning).toBeNull();
    expect(Array.isArray(res.body.result?.events)).toBe(true);
    expect(res.body.result?.events.length).toBeGreaterThan(0);
  });

  it("fails body-fixed earth-moon eclipse timing requests for unsupported observer bodies with the route-matched fail id", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "earth_moon_eclipse_timing",
        input: {
          start_iso: "2026-08-10T00:00:00.000Z",
          end_iso: "2026-08-14T00:00:00.000Z",
          step_minutes: 1,
          observer: {
            mode: "body-fixed",
            body: 599,
            lon_deg: 0,
            lat_deg: 0,
            height_m: 0,
          },
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_ORIENTATION_KERNEL_MISSING");
    expect(res.body.result?.observer_context?.mode).toBe("body-fixed");
    expect(res.body.result?.observer_context?.requested_body_id).toBe(599);
    expect(res.body.result?.observer_context?.resolved_body_id).toBe(399);
    expect(res.body.result?.observer_context?.warning).toBe("HALOBANK_SOLAR_ORIENTATION_KERNEL_MISSING");
  });

  it("runs the earth-orientation precession/nutation proxy from HaloBank lunisolar forcing", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "earth_orientation_precession_nutation_proxy",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-03-01T00:00:00.000Z",
          step_minutes: 360,
        },
        evidence_refs: ["artifact:halobank.solar.test:earth-orientation-fixture"],
      })
      .expect(200);

    expect(res.body.module).toBe("earth_orientation_precession_nutation_proxy");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.dominant_driver).toBe("moon");
    expect(res.body.result?.lunar_to_solar_ratio).toBeGreaterThan(1);
    expect(res.body.result?.precession_driver_proxy_per_s2).toBeGreaterThan(0);
    expect(res.body.result?.nutation_driver_proxy_rms_per_s2).toBeGreaterThan(0);
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:earth_orientation_precession_nutation_proxy");
    expect(res.body.tree_dag?.equation_refs).toContain("tide_generating_potential_quadrupole");
    expect(res.body.tree_dag?.equation_refs).toContain("angular_momentum_torque_balance");
  });

  it("runs the planetary-shape/orientation proxy from HaloBank lunisolar forcing", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "planetary_shape_orientation_proxy",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-03-01T00:00:00.000Z",
          step_minutes: 360,
        },
        evidence_refs: ["artifact:halobank.solar.test:planetary-shape-orientation-fixture"],
      })
      .expect(200);

    expect(res.body.module).toBe("planetary_shape_orientation_proxy");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.mean_density_proxy_kg_m3).toBeGreaterThan(0);
    expect(res.body.result?.hydrostatic_rounding_proxy).toBeGreaterThan(0);
    expect(res.body.result?.potato_threshold_ratio).toBeGreaterThan(0);
    expect(res.body.result?.rotational_flattening_proxy).toBeGreaterThan(0);
    expect(res.body.result?.tidal_tensor_proxy_per_s2).toBeGreaterThan(0);
    expect(res.body.result?.love_number_proxy).toBeGreaterThan(0);
    expect(res.body.result?.j2_proxy).toBeGreaterThan(0);
    expect(res.body.result?.dynamical_ellipticity_proxy).toBeGreaterThan(0);
    expect(res.body.result?.precession_constant_proxy_per_s).toBeGreaterThan(0);
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:planetary_shape_orientation_proxy");
    expect(res.body.tree_dag?.equation_refs).toContain("tidal_tensor_weak_field");
    expect(res.body.tree_dag?.equation_refs).toContain("love_number_response_scaling");
    expect(res.body.tree_dag?.equation_refs).toContain("quadrupole_moment_J2_definition");
    expect(res.body.tree_dag?.equation_refs).toContain("dynamical_ellipticity_relation");
    expect(res.body.tree_dag?.equation_refs).toContain("precession_constant_lunisolar_torque");
  });

  it("runs the planetary figure diagnostic over q, J2, love-number, and flattening closure", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "planetary_figure_diagnostic",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-03-01T00:00:00.000Z",
          step_minutes: 360,
        },
        evidence_refs: ["artifact:halobank.solar.test:planetary-figure-diagnostic-fixture"],
      })
      .expect(200);

    expect(res.body.module).toBe("planetary_figure_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.shape_regime).toBe("gravity-rounded");
    expect(res.body.result?.flattening_from_j2_q_proxy).toBeGreaterThan(0);
    expect(res.body.result?.love_number_proxy).toBeGreaterThan(0);
    expect(res.body.result?.background_geometry?.role).toBe("background_geometry");
    expect(res.body.result?.dynamic_forcing_geometry).toBe(null);
    expect(res.body.result?.background_geometry?.proxies?.canonical_channel).toBe("kappa_u");
    expect(res.body.result?.geometry_coupling?.geometry_slot).toBe("G_geometry");
    expect(res.body.result?.geometry_coupling?.proxies?.kappa_body_m2).toBeGreaterThan(0);
    expect(res.body.result?.geometry_coupling?.stress_energy_bridge?.parity?.pass).toBe(true);
    expect(res.body.result?.j2_abs_error).toBeGreaterThanOrEqual(0);
    expect(res.body.result?.normalized_rms_figure_residual).toBeGreaterThanOrEqual(0);
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:planetary_figure_diagnostic");
    expect(res.body.tree_dag?.equation_refs).toContain("planetary_figure_proxy_closure");
    expect(res.body.tree_dag?.equation_refs).toContain("collective_observable_response_closure");
  });

  it("runs the granular tidal-response diagnostic against the Mercury compatibility surface", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "granular_tidal_response_diagnostic",
        input: {
          calibration_profile_id: "mercury-spin-orbit-stress-test",
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-03-01T00:00:00.000Z",
          step_minutes: 360,
        },
        evidence_refs: ["artifact:halobank.solar.test:granular-tidal-mercury-fixture"],
      })
      .expect(200);

    expect(res.body.module).toBe("granular_tidal_response_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.target_body_id).toBe(199);
    expect(res.body.result?.target_body_label).toBe("Mercury");
    expect(res.body.result?.response_regime).toBe("gravity-rounded");
    expect(res.body.result?.granular_dissipation_proxy).toBeGreaterThan(0);
    expect(res.body.result?.tidal_quality_factor_proxy).toBeGreaterThan(0);
    expect(res.body.result?.spin_state_evolution_proxy).toBeGreaterThan(0);
    expect(res.body.result?.angular_momentum_redistribution_proxy).toBeGreaterThan(0);
    expect(res.body.result?.background_geometry?.role).toBe("background_geometry");
    expect(res.body.result?.dynamic_forcing_geometry).toBe(null);
    expect(res.body.result?.geometry_coupling?.source_quantity?.id).toBe("mean_density_proxy_kg_m3");
    expect(res.body.result?.geometry_coupling?.stress_energy_bridge?.parity?.pass).toBe(true);
    expect(res.body.result?.observables_guardrail_id).toBe("granular-matter-response-not-consciousness");
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:granular_tidal_response_diagnostic");
    expect(res.body.tree_dag?.equation_refs).toContain("collective_observable_response_closure");
    expect(res.body.tree_dag?.equation_refs).toContain("granular_dissipation_scaling");
    expect(res.body.tree_dag?.equation_refs).toContain("tidal_quality_factor_scaling");
    expect(res.body.tree_dag?.equation_refs).toContain("spin_orbit_angular_momentum_exchange");
  });

  it("fails the granular tidal-response diagnostic deterministically when the expected regime is forced away from the calibration body", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "granular_tidal_response_diagnostic",
        input: {
          calibration_profile_id: "hyperion-potato-counterexample",
          expected_response_regime: "gravity-rounded",
        },
      })
      .expect(200);

    expect(res.body.module).toBe("granular_tidal_response_diagnostic");
    expect(res.body.result?.target_body_id).toBe(607);
    expect(res.body.result?.response_regime).toBe("strength-supported");
    expect(res.body.result?.expected_response_regime).toBe("gravity-rounded");
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_GRANULAR_TIDAL_RESPONSE_REGIME_MISMATCH");
  });

  it("keeps the Mars profile as the secondary static solid-body calibration", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "planetary_figure_diagnostic",
        input: {
          calibration_profile_id: "mars-solid-body",
        },
        evidence_refs: ["artifact:halobank.solar.test:planetary-figure-diagnostic-mars-profile"],
      })
      .expect(200);

    expect(res.body.module).toBe("planetary_figure_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.calibration_profile_id).toBe("mars-solid-body");
    expect(res.body.result?.target_body_id).toBe(499);
    expect(res.body.result?.target_body_label).toBe("Mars");
    expect(res.body.result?.shape_regime).toBe("gravity-rounded");
    expect(res.body.result?.source_refs).toContain("https://doi.org/10.1029/2020GL090568");
  });

  it("uses Mercury as the primary non-Earth congruence profile and fails hard against the pinned MESSENGER gravity/tide target", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "planetary_figure_diagnostic",
        input: {
          calibration_profile_id: "mercury-spin-orbit-stress-test",
        },
        evidence_refs: ["artifact:halobank.solar.test:planetary-figure-diagnostic-mercury-profile"],
      })
      .expect(200);

    expect(res.body.module).toBe("planetary_figure_diagnostic");
    expect(res.body.result?.calibration_profile_id).toBe("mercury-spin-orbit-stress-test");
    expect(res.body.result?.target_body_id).toBe(199);
    expect(res.body.result?.target_body_label).toBe("Mercury");
    expect(res.body.result?.shape_regime).toBe("gravity-rounded");
    expect(res.body.result?.flattening_abs_error).toBeLessThanOrEqual(0.001);
    expect(res.body.result?.j2_abs_error).toBeGreaterThan(res.body.result?.max_j2_abs_error ?? Number.POSITIVE_INFINITY);
    expect(res.body.result?.effective_love_number_abs_error).toBeGreaterThan(
      res.body.result?.max_effective_love_number_abs_error ?? Number.POSITIVE_INFINITY,
    );
    expect(res.body.result?.normalized_rms_figure_residual).toBeGreaterThan(1);
    expect(res.body.result?.source_refs).toContain("https://arxiv.org/abs/1608.01360");
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_PLANETARY_FIGURE_J2_MISFIT");
  });

  it("runs the Mercury cross-lane congruence diagnostic against the same-body precession and figure surfaces", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "mercury_cross_lane_congruence_diagnostic",
        input: {
          start_iso: "2000-01-01T00:00:00.000Z",
          end_iso: "2030-01-01T00:00:00.000Z",
          step_days: 5,
        },
        evidence_refs: ["artifact:halobank.solar.test:mercury-cross-lane-congruence-fixture"],
      })
      .expect(200);

    expect(res.body.module).toBe("mercury_cross_lane_congruence_diagnostic");
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_PLANETARY_FIGURE_J2_MISFIT");
    expect(res.body.result?.same_body_target_body_id).toBe(199);
    expect(res.body.result?.same_body_target_body_label).toBe("Mercury");
    expect(res.body.result?.precession_probe?.gate_verdict).toBe("PASS");
    expect(res.body.result?.figure_probe?.gate_verdict).toBe("FAIL");
    expect(res.body.result?.figure_probe?.target_body_id).toBe(199);
    expect(res.body.result?.same_body_congruence_score).toBeGreaterThan(res.body.result?.thresholds?.max_combined_margin ?? 0);
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:mercury_cross_lane_congruence_diagnostic");
    expect(res.body.tree_dag?.equation_refs).toContain("mercury_same_body_congruence_metric");
    expect(res.body.tree_dag?.equation_refs).toContain("planetary_figure_proxy_closure");
  });

  it("exposes synthetic Saturn-moon state sources for Mimas and uses the executable diagnostic profile", async () => {
    const app = makeApp();
    const date = new Date("2026-01-01T00:00:00.000Z");
    const mimasA = getBaryState(601, date);
    const mimasB = getBaryState(601, date);

    expect(resolveSupportedBody(601)?.name).toBe("Mimas");
    expect(resolveSupportedBody(601)?.stateSource).toBe("synthetic-saturnian-satellite");
    expect(mimasA).toEqual(mimasB);
    expect(mimasA.pos.every((entry) => Number.isFinite(entry))).toBe(true);
    expect(mimasA.vel.every((entry) => Number.isFinite(entry))).toBe(true);

    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "planetary_figure_diagnostic",
        input: {
          calibration_profile_id: "mimas-potato-threshold",
        },
        evidence_refs: ["artifact:halobank.solar.test:mimas-potato-profile"],
      })
      .expect(200);

    expect(res.body.module).toBe("planetary_figure_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.calibration_profile_id).toBe("mimas-potato-threshold");
    expect(res.body.result?.target_body_id).toBe(601);
    expect(res.body.result?.target_body_label).toBe("Mimas");
    expect(res.body.result?.target_body_state_source).toBe("synthetic-saturnian-satellite");
    expect(res.body.result?.target_body_state_source_label).toContain("synthetic");
    expect(res.body.provenance?.source_class).toBe("hybrid_diagnostic");
    expect(res.body.result?.source_refs).toContain("https://ssd.jpl.nasa.gov/sats/phys_par/sep.html");
  });

  it("exposes synthetic Saturn-moon state sources for Hyperion and keeps the counterexample profile executable", async () => {
    const app = makeApp();
    const date = new Date("2026-01-01T00:00:00.000Z");
    const hyperionA = getBaryState(607, date);
    const hyperionB = getBaryState(607, date);

    expect(resolveSupportedBody(607)?.name).toBe("Hyperion");
    expect(resolveSupportedBody(607)?.stateSource).toBe("synthetic-saturnian-satellite");
    expect(hyperionA).toEqual(hyperionB);
    expect(hyperionA.pos.every((entry) => Number.isFinite(entry))).toBe(true);
    expect(hyperionA.vel.every((entry) => Number.isFinite(entry))).toBe(true);

    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "planetary_figure_diagnostic",
        input: {
          calibration_profile_id: "hyperion-potato-counterexample",
        },
        evidence_refs: ["artifact:halobank.solar.test:hyperion-potato-profile"],
      })
      .expect(200);

    expect(res.body.module).toBe("planetary_figure_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.calibration_profile_id).toBe("hyperion-potato-counterexample");
    expect(res.body.result?.target_body_id).toBe(607);
    expect(res.body.result?.target_body_label).toBe("Hyperion");
    expect(res.body.result?.target_body_state_source).toBe("synthetic-saturnian-satellite");
    expect(res.body.result?.target_body_state_source_label).toContain("synthetic");
    expect(res.body.provenance?.source_class).toBe("hybrid_diagnostic");
    expect(res.body.result?.source_refs).toContain("https://science.nasa.gov/saturn/moons/hyperion/");
  });

  it("runs the stellar observables diagnostic from the sourced GONG+SILSO replay without leaking into consciousness claims", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "stellar_observables_diagnostic",
        input: {
          replay_series_id: "gong-silso-cycle23-radial-band",
        },
        evidence_refs: ["artifact:halobank.solar.test:stellar-observables-diagnostic-replay"],
      })
      .expect(200);

    expect(res.body.module).toBe("stellar_observables_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.activity_pmode_correlation).toBeGreaterThan(0.4);
    expect(res.body.result?.p_mode_slope_nhz_per_activity_unit).toBeGreaterThan(0);
    expect(res.body.result?.observables_guardrail_id).toBe("stellar-plasma-observables-not-consciousness");
    expect(res.body.result?.replay_series_id).toBe("gong-silso-cycle23-radial-band");
    expect(res.body.result?.sample_count).toBeGreaterThanOrEqual(8);
    expect(res.body.result?.epoch_iso_series?.length).toBe(res.body.result?.sample_count);
    expect(res.body.result?.background_geometry?.role).toBe("background_geometry");
    expect(res.body.result?.dynamic_forcing_geometry).toBe(null);
    expect(res.body.result?.geometry_coupling?.source_quantity?.id).toBe("solar_mean_density_proxy_kg_m3");
    expect(res.body.result?.geometry_coupling?.stress_energy_bridge?.parity?.pass).toBe(true);
    expect(res.body.result?.source_refs).toContain("https://www.sidc.be/SILSO/DATA/SN_m_tot_V2.0.txt");
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:stellar_observables_diagnostic");
    expect(res.body.tree_dag?.equation_refs).toContain("collective_observable_response_closure");
    expect(res.body.tree_dag?.equation_refs).toContain("stellar_observables_correlation_diagnostic");
  });

  it("runs the stellar flare-to-sunquake diagnostic against the replayed flare timing windows", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "stellar_flare_sunquake_diagnostic",
        input: {
          replay_series_id: "flare-sunquake-timing-replay",
        },
        evidence_refs: ["artifact:halobank.solar.test:stellar-flare-sunquake-replay"],
      })
      .expect(200);

    expect(res.body.module).toBe("stellar_flare_sunquake_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.flare_energy_helioseismic_correlation).toBeGreaterThan(0.25);
    expect(res.body.result?.mean_timing_offset_s).toBeGreaterThan(0);
    expect(res.body.result?.coupling_score).toBeGreaterThan(0);
    expect(res.body.result?.solar_mean_density_proxy_kg_m3).toBeGreaterThan(0);
    expect(res.body.result?.background_geometry?.role).toBe("background_geometry");
    expect(res.body.result?.dynamic_forcing_geometry).toBe(null);
    expect(res.body.result?.geometry_coupling?.source_quantity?.id).toBe("solar_mean_density_proxy_kg_m3");
    expect(res.body.result?.geometry_coupling?.stress_energy_bridge?.parity?.pass).toBe(true);
    expect(res.body.result?.observables_guardrail_id).toBe("sunquake-not-quantum-collapse");
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:stellar_flare_sunquake_diagnostic");
    expect(res.body.tree_dag?.equation_refs).toContain("collective_observable_response_closure");
    expect(res.body.tree_dag?.equation_refs).toContain("flare_pressure_impulse_coupling");
    expect(res.body.tree_dag?.equation_refs).toContain("flare_sunquake_timing_correlation");
    expect(res.body.tree_dag?.equation_refs).toContain("sunquake_helioseismic_response");
  });

  it("runs the sunquake timing replay diagnostic with deterministic flare-to-sunquake offsets", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "sunquake_timing_replay_diagnostic",
        input: {
          replay_series_id: "flare-sunquake-timing-replay",
        },
        evidence_refs: ["artifact:halobank.solar.test:sunquake-timing-replay"],
      })
      .expect(200);

    expect(res.body.module).toBe("sunquake_timing_replay_diagnostic");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.sample_count).toBeGreaterThanOrEqual(3);
    expect(res.body.result?.timing_alignment_score).toBeGreaterThan(0);
    expect(res.body.result?.max_timing_offset_s).toBeLessThanOrEqual(600);
    expect(res.body.result?.solar_mean_density_proxy_kg_m3).toBeGreaterThan(0);
    expect(res.body.result?.background_geometry?.role).toBe("background_geometry");
    expect(res.body.result?.dynamic_forcing_geometry).toBe(null);
    expect(res.body.result?.geometry_coupling?.source_quantity?.id).toBe("solar_mean_density_proxy_kg_m3");
    expect(res.body.result?.geometry_coupling?.stress_energy_bridge?.parity?.pass).toBe(true);
    expect(res.body.result?.observables_guardrail_id).toBe("sunquake-not-quantum-collapse");
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:sunquake_timing_replay_diagnostic");
    expect(res.body.tree_dag?.equation_refs).toContain("collective_observable_response_closure");
    expect(res.body.tree_dag?.equation_refs).toContain("flare_sunquake_timing_correlation");
    expect(res.body.tree_dag?.equation_refs).toContain("sunquake_helioseismic_response");
  });

  it("fails the stellar flare-to-sunquake diagnostic deterministically when the timing envelope is blown", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "stellar_flare_sunquake_diagnostic",
        input: {
          flare_peak_iso_series: [
            "2017-09-06T12:00:00.000Z",
            "2017-09-06T12:10:00.000Z",
            "2017-09-06T12:20:00.000Z",
          ],
          sunquake_peak_iso_series: [
            "2017-09-06T13:00:00.000Z",
            "2017-09-06T13:10:00.000Z",
            "2017-09-06T13:20:00.000Z",
          ],
          flare_energy_proxy_series: [1.0, 1.4, 2.1],
          helioseismic_amplitude_proxy_series: [0.9, 1.3, 2.0],
        },
      })
      .expect(200);

    expect(res.body.module).toBe("stellar_flare_sunquake_diagnostic");
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_STELLAR_FLARE_SUNQUAKE_MEAN_TIMING_OFFSET_HIGH");
    expect(res.body.result?.mean_timing_offset_s).toBeGreaterThan(600);
    expect(res.body.result?.observables_guardrail_id).toBe("sunquake-not-quantum-collapse");
  });

  it("fails the sunquake timing replay diagnostic deterministically when flare and sunquake peaks drift too far apart", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "sunquake_timing_replay_diagnostic",
        input: {
          flare_peak_iso_series: [
            "2011-02-15T01:44:00.000Z",
            "2011-09-06T22:33:00.000Z",
            "2017-09-06T12:02:00.000Z",
          ],
          sunquake_peak_iso_series: [
            "2011-02-15T02:44:00.000Z",
            "2011-09-06T23:33:00.000Z",
            "2017-09-06T13:02:00.000Z",
          ],
          flare_energy_proxy_series: [1.0, 1.3, 2.2],
          helioseismic_amplitude_proxy_series: [0.9, 1.1, 2.4],
        },
      })
      .expect(200);

    expect(res.body.module).toBe("sunquake_timing_replay_diagnostic");
    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_SUNQUAKE_TIMING_MEAN_OFFSET_HIGH");
    expect(res.body.result?.mean_timing_offset_s).toBeGreaterThan(300);
    expect(res.body.result?.observables_guardrail_id).toBe("sunquake-not-quantum-collapse");
  });

  it("fails the stellar observables diagnostic deterministically when activity and p-mode shifts anti-correlate", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "stellar_observables_diagnostic",
        input: {
          magnetic_activity_index_series: [80, 95, 110, 130, 145, 135, 120, 100],
          p_mode_frequency_shift_nhz_series: [78, 64, 52, 39, 28, 35, 44, 57],
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_STELLAR_OBSERVABLES_ACTIVITY_MODE_CORRELATION_LOW");
  });

  it("fails the earth-orientation proxy deterministically when the sample window is underspecified", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "earth_orientation_precession_nutation_proxy",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-01-01T06:00:00.000Z",
          step_minutes: 360,
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_EARTH_ORIENTATION_INSUFFICIENT_SAMPLES");
  });

  it("detects Saros recurrence pairs in a long global eclipse window", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "saros_cycle",
        input: {
          start_iso: "2000-01-01T00:00:00.000Z",
          end_iso: "2100-01-01T00:00:00.000Z",
          max_events: 512,
        },
      })
      .expect(200);

    expect(res.body.module).toBe("saros_cycle");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.pair_count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.result?.pairs)).toBe(true);
  });

  it("detects jovian moon transit/occultation timing candidates from Earth", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "jovian_moon_event_timing",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-01-05T00:00:00.000Z",
          step_minutes: 5,
          moon: "io",
          event: "any",
        },
      })
      .expect(200);

    expect(res.body.module).toBe("jovian_moon_event_timing");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(Array.isArray(res.body.result?.events)).toBe(true);
    expect(res.body.result?.events.length).toBeGreaterThan(0);
  });

  it("supports Earth body-fixed observers for jovian moon timing geometry", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "jovian_moon_event_timing",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-01-05T00:00:00.000Z",
          step_minutes: 5,
          moon: "io",
          event: "any",
          observer: {
            mode: "body-fixed",
            body: 399,
            lon_deg: -70,
            lat_deg: -30,
            height_m: 100,
          },
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.observer_context?.mode).toBe("body-fixed");
    expect(res.body.result?.observer_context?.resolved_body_id).toBe(399);
    expect(res.body.result?.observer_context?.warning).toBeNull();
    expect(Array.isArray(res.body.result?.events)).toBe(true);
    expect(res.body.result?.events.length).toBeGreaterThan(0);
  });

  it("fails body-fixed jovian moon timing requests for unsupported observer bodies with the route-matched fail id", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "jovian_moon_event_timing",
        input: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-01-05T00:00:00.000Z",
          step_minutes: 5,
          moon: "io",
          event: "any",
          observer: {
            mode: "body-fixed",
            body: 599,
            lon_deg: 0,
            lat_deg: 0,
            height_m: 0,
          },
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_ORIENTATION_KERNEL_MISSING");
    expect(res.body.result?.observer_context?.mode).toBe("body-fixed");
    expect(res.body.result?.observer_context?.requested_body_id).toBe(599);
    expect(res.body.result?.observer_context?.resolved_body_id).toBe(399);
    expect(res.body.result?.observer_context?.warning).toBe("HALOBANK_SOLAR_ORIENTATION_KERNEL_MISSING");
  });

  it("runs the solar light-deflection module against pinned weak-field benchmarks", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "solar_light_deflection",
        input: {
          ts_iso: "2003-09-10T00:00:00.000Z",
          observer_body_id: 399,
          receiver_body_id: 699,
          source_ra_deg: 0,
          source_dec_deg: 60,
        },
        evidence_refs: ["artifact:halobank.solar.test:null-geodesic-fixture"],
      })
      .expect(200);

    expect(res.body.module).toBe("solar_light_deflection");
    expect(res.body.metric_context?.pn_gr_model_id).toBe("halobank.solar.iau2000b1.3-weak-field-ppn-gr/1");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.signal_path?.geometry_mode).toBe("explicit_icrs_source");
    expect(res.body.result?.signal_path?.source_occulted).toBe(false);
    expect(res.body.result?.signal_path?.solar_elongation_deg).toBeGreaterThan(
      res.body.result?.signal_path?.solar_angular_radius_deg,
    );
    expect(res.body.result?.predicted_limb_arcsec).toBeGreaterThan(1.7);
    expect(res.body.result?.predicted_limb_arcsec).toBeLessThan(1.8);
    expect(res.body.result?.predicted_source_deflection_arcsec).toBeGreaterThan(0);
    expect(res.body.result?.shapiro_delay_us).toBeGreaterThan(0);
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:solar_light_deflection");
  });

  it("fails solar light-deflection deterministically when the explicit source is inside the solar disk", async () => {
    const app = makeApp();
    const tsIso = "2003-09-10T00:00:00.000Z";
    const date = new Date(tsIso);
    const earth = getBaryState(399, date);
    const sun = getBaryState(10, date);
    const sourceUnit = normalize([
      sun.pos[0] - earth.pos[0],
      sun.pos[1] - earth.pos[1],
      sun.pos[2] - earth.pos[2],
    ]);

    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "solar_light_deflection",
        input: {
          ts_iso: tsIso,
          observer_body_id: 399,
          receiver_body_id: 699,
          source_unit_icrs: sourceUnit,
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_LIGHT_DEFLECTION_SOURCE_OCCULTED");
    expect(res.body.result?.signal_path?.source_occulted).toBe(true);
    expect(res.body.result?.signal_path?.geometry_mode).toBe("explicit_icrs_source");
  });

  it("supports Earth body-fixed observers for solar light-deflection geometry", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "solar_light_deflection",
        input: {
          ts_iso: "2003-09-10T00:00:00.000Z",
          observer: {
            mode: "body-fixed",
            body: 399,
            lon_deg: -70,
            lat_deg: -30,
            height_m: 100,
          },
          receiver_body_id: 699,
          source_ra_deg: 0,
          source_dec_deg: 60,
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.observer_context?.mode).toBe("body-fixed");
    expect(res.body.result?.observer_context?.resolved_body_id).toBe(399);
    expect(res.body.result?.observer_context?.warning).toBeNull();
    expect(res.body.result?.signal_path?.source_occulted).toBe(false);
  });

  it("fails body-fixed solar light-deflection requests for unsupported observer bodies with the route-matched fail id", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "solar_light_deflection",
        input: {
          ts_iso: "2003-09-10T00:00:00.000Z",
          observer: {
            mode: "body-fixed",
            body: 599,
            lon_deg: 0,
            lat_deg: 0,
            height_m: 0,
          },
          receiver_body_id: 699,
          source_ra_deg: 0,
          source_dec_deg: 60,
        },
      })
      .expect(200);

    expect(res.body.gate?.verdict).toBe("FAIL");
    expect(res.body.gate?.firstFail).toBe("HALOBANK_SOLAR_ORIENTATION_KERNEL_MISSING");
    expect(res.body.result?.observer_context?.mode).toBe("body-fixed");
    expect(res.body.result?.observer_context?.requested_body_id).toBe(599);
    expect(res.body.result?.observer_context?.resolved_body_id).toBe(399);
    expect(res.body.result?.observer_context?.warning).toBe("HALOBANK_SOLAR_ORIENTATION_KERNEL_MISSING");
  });

  it("proves inner-solar parity across Mercury and null-geodesic benchmarks", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/halobank/derived")
      .send({
        module: "inner_solar_metric_parity",
        input: {
          mercury_start_iso: "2000-01-01T00:00:00.000Z",
          mercury_end_iso: "2030-01-01T00:00:00.000Z",
          mercury_step_days: 5,
          ts_iso: "2003-09-10T00:00:00.000Z",
          observer_body_id: 399,
          receiver_body_id: 699,
          source_ra_deg: 0,
          source_dec_deg: 60,
        },
        evidence_refs: ["artifact:halobank.solar.test:metric-parity-fixture"],
      })
      .expect(200);

    expect(res.body.module).toBe("inner_solar_metric_parity");
    expect(res.body.gate?.verdict).toBe("PASS");
    expect(res.body.result?.shared_metric_model_id).toBe("halobank.solar.iau2000b1.3-weak-field-ppn-gr/1");
    expect(res.body.result?.mercury_probe?.gate_verdict).toBe("PASS");
    expect(res.body.result?.null_probe?.gate_verdict).toBe("PASS");
    expect(res.body.result?.null_probe?.geometry_mode).toBe("explicit_icrs_source");
    expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:inner_solar_metric_parity");
  });

  it("calibrates the active local-rest solar-motion anchor against a pinned published reference", async () => {
    const previous = process.env.LSR_SOLAR_PECULIAR;
    try {
      process.env.LSR_SOLAR_PECULIAR = "huang2015";
      const app = makeApp();
      const res = await request(app)
        .post("/api/halobank/derived")
        .send({
          module: "local_rest_anchor_calibration",
          evidence_refs: ["artifact:halobank.solar.test:local-rest-anchor-fixture"],
        })
        .expect(200);

      expect(res.body.module).toBe("local_rest_anchor_calibration");
      expect(res.body.gate?.verdict).toBe("PASS");
      expect(res.body.result?.reference_id).toBe("huang2015");
      expect(res.body.result?.max_component_abs_delta_km_s).toBe(0);
      expect(res.body.tree_dag?.claim_id).toBe("claim:halobank.solar:local_rest_anchor_calibration");
    } finally {
      if (previous === undefined) {
        delete process.env.LSR_SOLAR_PECULIAR;
      } else {
        process.env.LSR_SOLAR_PECULIAR = previous;
      }
    }
  });
});
