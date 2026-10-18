import { describe, it, expect } from "vitest";
import { governFromTelemetry } from "../modules/policies/coherence-governor";
import type { TTelemetrySnapshot } from "@shared/star-telemetry";

const baseSnapshot = (overrides: Partial<TTelemetrySnapshot> = {}): TTelemetrySnapshot => ({
  session_id: "test-session",
  session_type: "debate",
  global_coherence: 0.5,
  levels: {},
  phase_dispersion: 0.5,
  collapse_pressure: 0.5,
  energy_budget: 0.5,
  ...overrides,
});

describe("coherence governor", () => {
  it("suggests collapse with lower threshold when pressure is high and dispersion is low", () => {
    const snap = baseSnapshot({
      global_coherence: 0.8,
      collapse_pressure: 0.9,
      phase_dispersion: 0.1,
      gamma_sync_z: 4,
      equilibrium: true,
      equilibrium_hold_ms: 120,
    });

    const decision = governFromTelemetry(snap);

    expect(decision.action).toBe("collapse");
    // Baseline is 0.6; high pressure + low dispersion should drop it.
    expect(decision.adjustedCollapseThreshold).toBeLessThan(0.6);
  });

  it("raises collapse threshold when dispersion is high", () => {
    const snap = baseSnapshot({
      global_coherence: 0.6,
      collapse_pressure: 0.7,
      phase_dispersion: 0.8,
    });

    const decision = governFromTelemetry(snap);

    expect(decision.adjustedCollapseThreshold).toBeGreaterThanOrEqual(0.6);
  });

  it("emits tool budget and branching hints", () => {
    const snap = baseSnapshot({
      global_coherence: 0.4,
      collapse_pressure: 0.4,
      phase_dispersion: 0.7,
      energy_budget: 0.9,
    });

    const decision = governFromTelemetry(snap);

    expect(decision.toolBudgetHints.maxToolsPerRound).toBeGreaterThan(0);
    expect(decision.toolBudgetHints.branchFactor).toBeGreaterThanOrEqual(1);
  });

  it("blocks collapse until equilibrium holds", () => {
    const base = baseSnapshot({
      global_coherence: 0.8,
      collapse_pressure: 0.9,
      phase_dispersion: 0.1,
      gamma_sync_z: 4,
    });

    const withoutEquilibrium = governFromTelemetry({
      ...base,
      equilibrium: false,
      equilibrium_hold_ms: 0,
    });
    const withEquilibrium = governFromTelemetry({
      ...base,
      equilibrium: true,
      equilibrium_hold_ms: 120,
    });

    expect(withEquilibrium.action).toBe("collapse");
    expect(withoutEquilibrium.action).not.toBe("collapse");
  });

  it("overrides recommended collapse when equilibrium is false", () => {
    const snap = baseSnapshot({
      global_coherence: 0.7,
      collapse_pressure: 0.9,
      phase_dispersion: 0.8,
      recommended_action: "collapse",
      equilibrium: false,
      equilibrium_hold_ms: 0,
    });

    const decision = governFromTelemetry(snap);

    expect(decision.action).toBe("ask_clarification");
  });
});
