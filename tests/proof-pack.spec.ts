import { describe, expect, it, vi } from "vitest";
import { kappa_drive_from_power } from "../shared/curvature-proxy";
import { SI_TO_GEOM_STRESS } from "../shared/gr-units";
import { proofPackSchema } from "../shared/schema";

const loadPipelineModules = async () => {
  vi.resetModules();
  const pipeline = await import("../server/energy-pipeline");
  const proofPack = await import("../server/helix-proof-pack");
  return { ...pipeline, ...proofPack };
};

describe("proof pack contract", () => {
  it("matches pipeline snapshots and conversions", async () => {
    const { initializePipelineState, calculateEnergyPipeline, buildProofPack } =
      await loadPipelineModules();

    const state = initializePipelineState();
    const snapshot = await calculateEnergyPipeline(state);
    const pack = buildProofPack(snapshot);

    const parsed = proofPackSchema.safeParse(pack);
    expect(parsed.success).toBe(true);

    const unitChecks: Array<[string, string]> = [
      ["power_avg_W", "W"],
      ["power_avg_MW", "MW"],
      ["duty_effective", "1"],
      ["duty_burst", "1"],
      ["hull_area_m2", "m^2"],
      ["tile_area_cm2", "cm^2"],
      ["tile_area_m2", "m^2"],
      ["gap_nm", "nm"],
      ["gap_m", "m"],
      ["cavity_volume_m3", "m^3"],
      ["rho_tile_J_m3", "J/m^3"],
      ["U_static_total_J", "J"],
      ["kappa_drive", "1/m^2"],
      ["kappa_drive_gain", "1"],
      ["ts_ratio", "1"],
      ["zeta", "1"],
    ];
    for (const [key, unit] of unitChecks) {
      expect(pack.values[key]?.unit).toBe(unit);
    }

    const powerW = pack.values.power_avg_W.value;
    const powerMW = pack.values.power_avg_MW.value;
    expect(typeof powerW).toBe("number");
    expect(typeof powerMW).toBe("number");
    if (typeof powerW === "number" && typeof powerMW === "number") {
      expect(powerMW).toBeCloseTo(powerW / 1e6, 8);
    }

    const expectedDuty =
      (snapshot as any).d_eff ??
      snapshot.dutyEffectiveFR ??
      snapshot.dutyEffective_FR ??
      snapshot.dutyShip ??
      snapshot.dutyEff ??
      snapshot.dutyCycle ??
      null;
    const duty = pack.values.duty_effective.value;
    if (typeof expectedDuty === "number") {
      expect(duty).toBeCloseTo(expectedDuty, 8);
    } else {
      expect(duty).toBe(null);
    }

    const hullArea =
      snapshot.hullArea_m2 ??
      (snapshot as any).hullArea?.value ??
      (snapshot as any).tiles?.hullArea_m2 ??
      null;
    const packHullArea = pack.values.hull_area_m2.value;
    if (typeof hullArea === "number") {
      expect(packHullArea).toBeCloseTo(hullArea, 6);
    }

    const gapNm = pack.values.gap_nm.value;
    const gapM = pack.values.gap_m.value;
    if (typeof gapNm === "number" && typeof gapM === "number") {
      expect(gapM).toBeCloseTo(gapNm * 1e-9, 12);
    }

    const tileAreaCm2 = pack.values.tile_area_cm2.value;
    const tileAreaM2 = pack.values.tile_area_m2.value;
    if (typeof tileAreaCm2 === "number" && typeof tileAreaM2 === "number") {
      expect(tileAreaM2).toBeCloseTo(tileAreaCm2 * 1e-4, 12);
    }

    const uStatic = pack.values.U_static_J.value;
    const tileCount = pack.values.tile_count.value;
    const uStaticTotal = pack.values.U_static_total_J.value;
    if (typeof uStatic === "number" && typeof tileCount === "number") {
      expect(uStaticTotal).toBeCloseTo(uStatic * tileCount, 6);
    }

    const gain =
      pack.values.kappa_drive_gain.value ?? pack.values.gamma_geo.value ?? null;
    const kappa = pack.values.kappa_drive.value;
    if (
      typeof powerW === "number" &&
      typeof packHullArea === "number" &&
      typeof duty === "number" &&
      typeof gain === "number" &&
      typeof kappa === "number"
    ) {
      const expectedKappa = kappa_drive_from_power(
        powerW,
        packHullArea,
        duty,
        gain,
      );
      expect(kappa).toBeCloseTo(expectedKappa, 12);
    }

    expect(pack.background_geometry?.role).toBe("background_geometry");
    expect(pack.background_geometry?.proxies?.canonical_channel).toBe("kappa_u");
    expect(pack.background_geometry?.stress_energy_bridge?.parity?.pass).toBe(true);
    expect(pack.dynamic_forcing_geometry?.role).toBe("dynamic_forcing_geometry");
    expect(pack.dynamic_forcing_geometry?.proxies?.canonical_channel).toBe("kappa_drive");
    expect(pack.dynamic_forcing_geometry?.stress_energy_bridge?.parity?.pass).toBe(true);
    expect(pack.geometry_coupling?.role).toBe("background_geometry");

    const natario = pack.values.natario_ok.value;
    if (typeof snapshot.natarioConstraint === "boolean") {
      expect(natario).toBe(snapshot.natarioConstraint);
    }
  });

  it("uses VdB region II metric fallback for CL3 metric source when warp metric is missing", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).warp = undefined;
    (state as any).vdbRegionII = {
      alpha: 1,
      n: 80,
      r_tilde_m: 1,
      delta_tilde_m: 0.1,
      sampleCount: 16,
      b_min: 1,
      b_max: 2,
      bprime_min: -1,
      bprime_max: 1,
      bprime_rms: 0.5,
      bdouble_min: -2,
      bdouble_max: 2,
      bdouble_rms: 1,
      t00_min: -3,
      t00_max: -1,
      t00_mean: -2,
      t00_rms: 2,
      support: true,
    };
    (state as any).gr = {
      constraints: {
        rho_constraint: {
          mean: -1.9,
        },
      },
    };

    const pack = buildProofPack(state);
    const metricGeom = pack.values.gr_metric_t00_geom_mean;
    expect(metricGeom?.value).toBeCloseTo(-2, 9);
    expect(metricGeom?.proxy).toBe(false);
    expect(pack.values.gr_cl3_rho_gate_source?.value).toBe(
      "warp.metric.T00.vdb.regionII",
    );
    expect((pack.values.gr_cl3_rho_delta_metric_mean?.value as number) > 0).toBe(
      true,
    );
  });

  it("uses natario metric fallback for CL3 metric source when warp metric is missing", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).warp = undefined;
    (state as any).natario = {
      metricT00: -42,
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario_sdf.shift",
    };
    (state as any).gr = {
      constraints: {
        rho_constraint: {
          mean: -40 * SI_TO_GEOM_STRESS,
        },
      },
    };

    const pack = buildProofPack(state);
    const metricGeom = pack.values.gr_metric_t00_geom_mean;
    expect(metricGeom?.value).toBeCloseTo(-42 * SI_TO_GEOM_STRESS, 9);
    expect(metricGeom?.proxy).toBe(false);
    expect(pack.values.gr_cl3_rho_gate_source?.value).toBe(
      "warp.metric.T00.natario_sdf.shift",
    );
    expect((pack.values.gr_cl3_rho_delta_metric_mean?.value as number) > 0).toBe(true);
  });

  it("uses nhm2 shift-lapse metric fallback for CL3 metric source when that family is active", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).warp = {
      metricAdapter: {
        family: "nhm2_shift_lapse",
      },
    };
    (state as any).natario = {
      metricT00: -42,
      metricT00Source: "metric",
    };
    (state as any).gr = {
      constraints: {
        rho_constraint: {
          mean: -40 * SI_TO_GEOM_STRESS,
        },
      },
    };

    const pack = buildProofPack(state);
    expect(pack.values.gr_cl3_rho_gate_source?.value).toBe(
      "warp.metric.T00.nhm2.shift_lapse",
    );
    expect(pack.values.metric_t00_family_authority_status?.value).toBe(
      "candidate_authoritative_solve_family",
    );
    expect(pack.values.metric_t00_transport_certification_status?.value).toBe(
      "bounded_transport_fail_closed_reference_only",
    );
  });

  it("emits the exploratory quantum semiclassical replay/comparison side by side with proof-pack geometry", async () => {
    const { initializePipelineState, calculateEnergyPipeline, buildProofPack } =
      await loadPipelineModules();

    const state = initializePipelineState();
    const snapshot = await calculateEnergyPipeline(state);
    (snapshot as any).quantum_semiclassical_source_replay_id =
      "kalra_2022_etomidate__bruno_2015__packet_contrast";
    (snapshot as any).quantum_semiclassical_tau_or_predicted_s = 3.5e-3;
    (snapshot as any).quantum_semiclassical_collapse_bound_margin = -0.1;

    const pack = buildProofPack(snapshot);
    const parsed = proofPackSchema.safeParse(pack);
    expect(parsed.success).toBe(true);
    expect(pack.background_geometry?.role).toBe("background_geometry");
    expect(pack.dynamic_forcing_geometry?.role).toBe("dynamic_forcing_geometry");
    expect(pack.quantum_semiclassical_source_replay?.profile_id).toBe(
      "kalra_2022_etomidate__bruno_2015__packet_contrast",
    );
    expect(pack.quantum_semiclassical_comparison?.measurement_timescale_kind).toBe(
      "microtubule_transport_lifetime_proxy",
    );
    expect(pack.quantum_semiclassical_comparison?.time_crystal_signature_pass).toBe(false);
    expect(pack.quantum_semiclassical_comparison?.falsifiers_triggered).toContain(
      "gravity_related_collapse_not_validated_in_biology",
    );
  });

  it("does not treat VdB region II as metric source when derivative evidence is missing", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).warp = undefined;
    (state as any).vdbRegionII = {
      t00_mean: -2,
      sampleCount: 16,
      support: true,
      bprime_min: 0,
      bprime_max: 0,
      bdouble_min: 0,
      bdouble_max: 0,
    };
    (state as any).gr = {
      constraints: {
        rho_constraint: {
          mean: -1.9,
        },
      },
    };

    const pack = buildProofPack(state);
    expect(pack.values.gr_metric_t00_geom_mean?.value).toBeUndefined();
    expect(pack.values.gr_cl3_rho_gate_source?.value).toBe("metric-missing");
    expect(pack.values.gr_cl3_rho_gate_reason?.value).toBe("metric_source_missing");
  });

  it("propagates warp.metricT00Ref into CL3 gate source", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).warp = {
      metricT00: -10,
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.vdb.regionII",
    };
    (state as any).gr = {
      constraints: {
        rho_constraint: {
          mean: -9.5,
        },
      },
    };

    const pack = buildProofPack(state);
    expect(pack.values.gr_cl3_rho_gate_source?.value).toBe(
      "warp.metric.T00.vdb.regionII",
    );
  });

  it("emits CL3 missing-input reason when metric T00 is unavailable", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).warp = {
      metricAdapter: {
        chart: { label: "comoving_cartesian", dtGammaPolicy: "computed", contractStatus: "ok" },
      },
    };
    (state as any).gr = {
      constraints: {
        rho_constraint: {
          mean: -2.1,
        },
      },
    };

    const pack = buildProofPack(state);
    expect(pack.values.gr_cl3_rho_gate?.value).toBe(false);
    expect(pack.values.gr_cl3_rho_gate_source?.value).toBe("metric-missing");
    expect(pack.values.gr_cl3_rho_gate_reason?.value).toBe("metric_source_missing");
    expect(pack.values.gr_cl3_rho_missing_parts?.value).toContain("missing_metric_t00");
    expect(pack.values.gr_cl3_rho_delta_mean?.value).toBe(null);
  });

  it("emits theta strict congruence status fields", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const strictEnv = process.env.WARP_STRICT_CONGRUENCE;
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const state = initializePipelineState();
    (state as any).thetaCal = 12;
    (state as any).warp = {
      metricAdapter: {
        betaDiagnostics: {
          method: "not-computed",
          thetaMax: 1.23,
        },
      },
    };

    const pack = buildProofPack(state);
    expect(pack.values.theta_strict_mode?.value).toBe(true);
    expect(pack.values.theta_strict_ok?.value).toBe(false);
    expect(pack.values.theta_strict_reason?.value).toBe("theta_geom_proxy");
    expect(pack.values.theta_audit?.value).toBe(pack.values.theta_pipeline_proxy?.value);
    expect(pack.values.theta_metric_derived?.value).toBe(false);
    expect(pack.values.theta_metric_source?.value).toBe("missing");
    expect(pack.values.theta_metric_reason?.value).toBe("theta_geom_proxy");

    process.env.WARP_STRICT_CONGRUENCE = strictEnv;
  });

  it("emits authoritative low-expansion gate fields from brick-native div_beta", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).theta_geom = 2e-4;
    (state as any).theta_metric_derived = true;
    (state as any).theta_metric_source = "pipeline.gr.theta.mean";
    (state as any).theta_metric_reason = "gr_evolve_brick_theta_mean";
    (state as any).theta_metric_authoritative = true;
    (state as any).theta_metric_authoritative_source = "pipeline.gr.theta.mean";
    (state as any).theta_metric_authoritative_reason =
      "brick_native_theta_present";
    (state as any).theta_geom_projection = 9e-4;
    (state as any).theta_geom_projection_source =
      "warp.metricAdapter.betaDiagnostics.thetaMax";
    (state as any).theta_geom_projection_proxy = false;
    (state as any).theta_metric_projection_available = true;
    (state as any).theta_metric_projection_source =
      "warp.metricAdapter.betaDiagnostics.thetaMax";
    (state as any).theta_metric_projection_reason =
      "projection_metric_adapter_theta_available";
    (state as any).warp = {
      metricAdapter: {
        betaDiagnostics: {
          method: "finite-diff",
          thetaRms: 8e-4,
          thetaMax: 9e-4,
        },
      },
      metricStressDiagnostics: {
        kTraceMean: -2e-4,
      },
    };
    (state as any).gr = {
      theta: {
        mean: 2e-4,
        maxAbs: 4e-4,
        source: "gr_evolve_brick_theta",
      },
      kTrace: {
        mean: -2e-4,
        maxAbs: 4e-4,
        source: "gr_evolve_brick",
      },
      divBeta: {
        rms: 2e-4,
        maxAbs: 4e-4,
        source: "gr_evolve_brick",
      },
    };

    const pack = buildProofPack(state);
    expect(pack.values.metric_div_beta_authoritative?.value).toBe(true);
    expect(pack.values.metric_div_beta_authoritative_reason?.value).toBe(
      "brick_native_div_beta_present",
    );
    expect(pack.values.theta_metric_authoritative?.value).toBe(true);
    expect(pack.values.theta_metric_authoritative_source?.value).toBe(
      "pipeline.gr.theta.mean",
    );
    expect(pack.values.theta_geom?.value).toBe(2e-4);
    expect(pack.values.theta_geom_projection?.value).toBe(9e-4);
    expect(pack.values.metric_k_trace_authoritative?.value).toBe(true);
    expect(pack.values.natario_low_expansion_authoritative_status?.value).toBe(
      "pass",
    );
    expect(pack.values.natario_low_expansion_projection_status?.value).toBe(
      "pass",
    );
    expect(pack.values.natario_low_expansion_projection_source?.value).toBe(
      "pipeline.warp.metricAdapter.betaDiagnostics.thetaRms/thetaMax",
    );
  });

  it("emits qi strict congruence status fields", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const strictEnv = process.env.WARP_STRICT_CONGRUENCE;
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const state = initializePipelineState();
    (state as any).qiGuardrail = {
      rhoSource: "tile-telemetry",
    };

    const pack = buildProofPack(state);
    expect(pack.values.qi_rho_source?.value).toBe("tile-telemetry");
    expect(pack.values.qi_metric_derived?.value).toBe(false);
    expect(pack.values.qi_metric_source?.value).toBe("tile-telemetry");
    expect(pack.values.qi_metric_source?.proxy).toBe(true);
    expect(pack.values.qi_metric_reason?.value).toBe("proxy-or-missing");
    expect(pack.values.qi_strict_mode?.value).toBe(true);
    expect(pack.values.qi_strict_ok?.value).toBe(false);
    expect(pack.values.qi_strict_reason?.value).toBe("qi_rho_proxy");

    process.env.WARP_STRICT_CONGRUENCE = strictEnv;
  });

  it("emits TS metric-derivation status fields", async () => {
    const { initializePipelineState, buildProofPack } = await loadPipelineModules();

    const state = initializePipelineState();
    (state as any).tsMetricDerived = true;
    (state as any).tsMetricDerivedSource = "warp.metricAdapter+clocking";
    (state as any).tsMetricDerivedReason =
      "TS_ratio from proper-distance timing with explicit chart contract";
    (state as any).qiGuardrail = {
      rhoSource: "warp.metric.T00.natario.shift",
      metricDerived: true,
      metricDerivedSource: "warp.metricAdapter+clocking",
      metricDerivedReason: "TS_ratio from proper-distance timing with explicit chart contract",
    };

    const pack = buildProofPack(state);
    expect(pack.values.ts_metric_derived?.value).toBe(true);
    expect(pack.values.ts_metric_source?.value).toBe(
      "warp.metricAdapter+clocking",
    );
    expect(pack.values.ts_metric_source?.proxy).toBe(false);
    expect(pack.values.ts_metric_reason?.proxy).toBe(false);
    expect(pack.values.qi_metric_derived?.value).toBe(true);
    expect(pack.values.qi_metric_source?.value).toBe("warp.metricAdapter+clocking");
    expect(pack.values.qi_metric_source?.proxy).toBe(false);
  });
});
