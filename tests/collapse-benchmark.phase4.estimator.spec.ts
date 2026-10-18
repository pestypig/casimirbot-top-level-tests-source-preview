import { describe, expect, it } from "vitest";
import { CollapseBenchmarkInput, estimateTauRcFromCurvature } from "@shared/collapse-benchmark";
import { buildCollapseBenchmarkResult } from "../server/services/collapse-benchmark";

describe("collapse benchmark (Phase 4): curvature-coupled estimator", () => {
  it("shortens tau and shrinks r_c as instability rises", () => {
    const calm = estimateTauRcFromCurvature({
      kappa_drive_m2: 1e-6,
      kappa_body_m2: 5e-5,
      coherence: 0.9,
      dispersion: 0.1,
      residual_rms: 1e-6,
      roots_count: 4,
      r_c_hint_m: 1.2,
      tau_hint_ms: 2_000,
    });

    const turbulent = estimateTauRcFromCurvature({
      kappa_drive_m2: 5e-3,
      kappa_body_m2: 2e-5,
      coherence: 0.25,
      dispersion: 0.85,
      residual_rms: 0.02,
      roots_count: 40,
      r_c_hint_m: 1.2,
      tau_hint_ms: 2_000,
    });

    expect(turbulent.instability).toBeGreaterThan(calm.instability);
    expect(turbulent.tau_ms).toBeLessThan(calm.tau_ms);
    expect(turbulent.r_c_m).toBeLessThan(calm.r_c_m);

    const residualSweep = [1e-6, 1e-4, 1e-2].map((residual_rms) =>
      estimateTauRcFromCurvature({
        kappa_drive_m2: 1e-4,
        kappa_body_m2: 1e-5,
        coherence: 0.6,
        dispersion: 0.5,
        residual_rms,
        roots_count: 8,
        r_c_hint_m: 0.9,
        tau_hint_ms: 1_200,
      }).tau_ms,
    );
    expect(residualSweep[0]).toBeGreaterThan(residualSweep[1]);
    expect(residualSweep[1]).toBeGreaterThan(residualSweep[2]);
  });

  it("promotes field_estimator source when tau_estimator is provided without tau_ms", () => {
    const input = CollapseBenchmarkInput.parse({
      schema_version: "collapse_benchmark/1",
      dt_ms: 50,
      seed: "tau-estimator-only",
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
    });

    const result = buildCollapseBenchmarkResult(input, "2025-01-01T00:00:00.000Z");
    expect(result.tau_source).toBe("field_estimator");
    expect(result.r_c_source).toBe("field_estimator");
    expect(result.tau_estimator?.mode).toBe("curvature_heuristic");
    expect(result.background_geometry?.role).toBe("background_geometry");
    expect(result.background_geometry?.proxies?.canonical_channel).toBe("kappa_u");
    expect(result.dynamic_forcing_geometry?.role).toBe("dynamic_forcing_geometry");
    expect(result.dynamic_forcing_geometry?.proxies?.canonical_channel).toBe("kappa_drive");
    expect(result.geometry_coupling?.role).toBe("background_geometry");
    expect(result.tau_ms).toBeLessThan(1_400);
    expect(result.r_c_m).toBeGreaterThan(0);
  });

  it("emits source-backed quantum semiclassical replay and comparison when a replay profile is selected", () => {
    const input = CollapseBenchmarkInput.parse({
      schema_version: "collapse_benchmark/1",
      dt_ms: 25,
      tau_ms: 3.5,
      r_c_m: 1e-8,
      quantum_semiclassical_source_replay_id: "kalra_2022__zhang_2017__packet_primary",
    });

    const result = buildCollapseBenchmarkResult(input, "2025-01-01T00:00:00.000Z");
    expect(result.quantum_semiclassical_source_replay?.profile_id).toBe("kalra_2022__zhang_2017__packet_primary");
    expect(result.quantum_semiclassical_source_replay?.measurement_timescale_kind).toBe(
      "microtubule_transport_lifetime_proxy",
    );
    expect(result.quantum_semiclassical_source_replay?.microtubule_transport_length_m).toBeCloseTo(6.64e-9, 12);
    expect(result.quantum_semiclassical_comparison?.measurement_timescale_kind).toBe(
      "microtubule_transport_lifetime_proxy",
    );
    expect(result.quantum_semiclassical_comparison?.subharmonic_lock_ratio).toBe(2);
    expect(result.quantum_semiclassical_comparison?.time_crystal_signature_pass).toBe(true);
    expect(result.quantum_semiclassical_comparison?.notes).toContain(
      "source_replay_profile=kalra_2022__zhang_2017__packet_primary",
    );
  });

  it("accepts a sourced negative contrast replay profile and lowers the exploratory comparison", () => {
    const input = CollapseBenchmarkInput.parse({
      schema_version: "collapse_benchmark/1",
      dt_ms: 25,
      tau_ms: 3.5,
      r_c_m: 1e-8,
      quantum_semiclassical_source_replay_id: "kalra_2022_etomidate__bruno_2015__packet_contrast",
    });

    const result = buildCollapseBenchmarkResult(input, "2025-01-01T00:00:00.000Z");
    expect(result.quantum_semiclassical_source_replay?.profile_id).toBe(
      "kalra_2022_etomidate__bruno_2015__packet_contrast",
    );
    expect(result.quantum_semiclassical_source_replay?.microtubule_transport_length_m).toBeCloseTo(
      5.6e-9,
      12,
    );
    expect(result.quantum_semiclassical_comparison?.subharmonic_lock_ratio).toBe(1);
    expect(result.quantum_semiclassical_comparison?.time_crystal_signature_pass).toBe(false);
    expect(result.quantum_semiclassical_comparison?.falsifiers_triggered).toContain(
      "no_time_crystal_signature",
    );
    expect((result.quantum_semiclassical_comparison?.orch_or_measurement_support_score ?? 1)).toBeLessThan(
      0.5,
    );
  });
});
