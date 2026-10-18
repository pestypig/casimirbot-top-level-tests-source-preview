import { describe, expect, it } from "vitest";

import { evaluateSolarEventCongruence, type SolarEventObservation } from "../sim_core/solar_event_congruence";

const timeGrid = (length = 16): Float64Array => Float64Array.from({ length }, (_, index) => index * 12);

function baseEvent(): SolarEventObservation {
  const time = timeGrid();
  return {
    event_id: "fixture_flare_congruence",
    time_s: time,
    goes_xray_flux: Float64Array.from(time, (_, index) => (index > 7 ? 1 + index * 0.1 : 0.1)),
    euv_irradiance: Float64Array.from(time, (_, index) => (index > 7 ? 2 + Math.sin(index) * 0.2 : 0.3)),
    p_mode_phase_rad: Float64Array.from(time, (_, index) => (index > 7 ? 0.05 : Math.PI * (index % 2))),
    ribbon_flux_Mx: Float64Array.from(time, (_, index) => (index > 7 ? 5e20 : 1e20)),
    ribbon_area_m2: Float64Array.from(time, (_, index) => (index > 7 ? 2e13 : 1e12)),
    pil_horizontal_field_T: Float64Array.from(time, (_, index) => (index > 10 ? 0.19 : 0.11)),
    sunquake_power: Float64Array.from(time, (_, index) => (index === 10 ? 5 : 0.2)),
    ribbon_blob_width_km: Float64Array.from([330, 410, 450]),
    ribbon_blob_spacing_km: Float64Array.from([1025, 1110, 1180]),
    rotation_measure_rad_m2: Float64Array.from([4, 5, 6]),
    polarization_fraction: Float64Array.from([0.12, 0.11, 0.13]),
    source_region_id: "AR-fixture",
    noaa_active_region: "13354",
    harp_id: "HARP-fixture",
    topology_context_ref: "pfss:fixture",
    magnetic_free_energy_J: 1e25,
    energy_closure_fraction: 1,
  };
}

const metricStatus = (report: ReturnType<typeof evaluateSolarEventCongruence>, id: string) =>
  report.metrics.find((metric) => metric.id === id)?.status;

describe("solar event congruence", () => {
  it("reports missing diagnostics deterministically when evidence is absent", () => {
    const report = evaluateSolarEventCongruence({ event_id: "empty_event", time_s: timeGrid() });
    expect(metricStatus(report, "magnetic_reconnection_null")).toBe("missing");
    expect(metricStatus(report, "p_mode_phase_modulation")).toBe("missing");
    expect(metricStatus(report, "collapse_residual_hypothesis")).toBe("missing");
    expect(report.speculative_residual_allowed).toBe(false);
    expect(report.constraint_envelope.residual_budget.blocked_reasons).toContain("magnetic_floor_not_computed_or_failed");
  });

  it("scores primary congruence metrics with pass, warn, and advisory statuses", () => {
    const report = evaluateSolarEventCongruence(baseEvent());
    expect(metricStatus(report, "magnetic_reconnection_null")).toBe("pass");
    expect(metricStatus(report, "p_mode_phase_modulation")).toBe("pass");
    expect(metricStatus(report, "ribbon_blob_tearing")).toBe("pass");
    expect(metricStatus(report, "photospheric_field_backreaction")).toBe("pass");
    expect(metricStatus(report, "polarimetric_faraday_path")).toBe("advisory");
    expect(metricStatus(report, "multifractal_flare_memory_proxy")).toBe("pass");
    expect(report.primary_physics_pass).toBe(true);
    expect(report.constraint_envelope.energy_budget.status).toBe("pass");
    expect(report.constraint_envelope.topology_budget.status).toBe("pass");
    expect(report.constraint_envelope.residual_budget.residual_claim_tier).toBe("advisory_only");
    expect(report.metrics.every((metric) => metric.entropy_diagnostics.entropy_penalty <= 1)).toBe(true);
    expect(report.metrics.every((metric) => metric.entropy_diagnostics.entropy_stretch_lambda >= 1)).toBe(true);
  });

  it("fails the magnetic null when the declared free-energy support is non-physical", () => {
    const report = evaluateSolarEventCongruence({ ...baseEvent(), magnetic_free_energy_J: 0 });
    expect(metricStatus(report, "magnetic_reconnection_null")).toBe("fail");
    expect(report.primary_physics_pass).toBe(false);
    expect(report.speculative_residual_allowed).toBe(false);
  });

  it("warns p-mode timing when raw phase lock does not beat shuffled controls", () => {
    const time = timeGrid();
    const report = evaluateSolarEventCongruence({
      ...baseEvent(),
      goes_xray_flux: Float64Array.from(time, (_, index) => (index > 7 ? 1 : 0)),
      p_mode_phase_rad: Float64Array.from(time, () => 0.05),
    });

    expect(metricStatus(report, "p_mode_phase_modulation")).toBe("warn");
    expect(report.constraint_envelope.timing_budget.phase_lock_score).toBeGreaterThan(0.9);
  });

  it("keeps collapse residual advisory-only and blocked from primary source-power semantics", () => {
    const report = evaluateSolarEventCongruence(baseEvent());
    const residual = report.metrics.find((metric) => metric.id === "collapse_residual_hypothesis");
    expect(report.speculative_residual_allowed).toBe(true);
    expect(residual?.status).toBe("advisory");
    expect(residual?.null_model).toBe("post_mhd_residual_only");
    expect(residual?.notes).toContain("never a primary winner");
    expect(report).not.toHaveProperty("winner");
    expect(report).not.toHaveProperty("source_power_enabled");
  });

  it("blocks collapse residuals when energy closure exceeds the continuous-spectrum budget", () => {
    const report = evaluateSolarEventCongruence({ ...baseEvent(), energy_closure_fraction: 1.2 });
    expect(report.speculative_residual_allowed).toBe(false);
    expect(metricStatus(report, "collapse_residual_hypothesis")).toBe("missing");
    expect(report.constraint_envelope.residual_budget.blocked_reasons).toContain("energy_closure_exceeds_budget");
  });

  it("keeps Faraday path advisory and unable to unlock residual by itself", () => {
    const report = evaluateSolarEventCongruence({
      event_id: "faraday_only",
      time_s: timeGrid(),
      rotation_measure_rad_m2: Float64Array.from([1, 2, 3]),
      polarization_fraction: Float64Array.from([0.1, 0.1, 0.1]),
    });

    expect(metricStatus(report, "polarimetric_faraday_path")).toBe("advisory");
    expect(report.speculative_residual_allowed).toBe(false);
    expect(metricStatus(report, "collapse_residual_hypothesis")).toBe("missing");
    expect(report.constraint_envelope.residual_budget.blocked_reasons).toContain("magnetic_floor_not_computed_or_failed");
  });

  it("records ordinary aliasing nulls for speculative residual entropy hygiene", () => {
    const report = evaluateSolarEventCongruence(baseEvent());
    const residual = report.metrics.find((metric) => metric.id === "collapse_residual_hypothesis");

    expect(residual?.entropy_diagnostics.aliasing_nulls).toContain("magnetic_reconnection_null");
    expect(residual?.entropy_diagnostics.aliasing_nulls).toContain("p_mode_phase_modulation");
    expect(residual?.entropy_diagnostics.aliasing_nulls).toContain("ribbon_blob_tearing");
    expect(residual?.entropy_diagnostics.entropy_adjusted_score).toBe(0);
  });
});
