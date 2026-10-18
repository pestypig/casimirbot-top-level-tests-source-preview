import { describe, expect, it } from "vitest";
import {
  initializePipelineState,
  type EnergyPipelineState,
} from "../server/energy-pipeline";
import {
  resolveModeFallbackMode,
  runModeTransitionSectorPreflight,
} from "../server/control/sectorControlPreflight";

const makeState = (
  patch: Partial<EnergyPipelineState> & Record<string, unknown> = {},
): EnergyPipelineState => {
  const state = initializePipelineState() as EnergyPipelineState &
    Record<string, unknown>;
  Object.assign(state, patch);
  return state as EnergyPipelineState;
};

describe("sector-control mode transition preflight", () => {
  it("passes requested mode when hard guardrails are green", () => {
    const state = makeState({
      fordRomanCompliance: true,
      natarioConstraint: true,
    });
    const preflight = runModeTransitionSectorPreflight(state, "taxi");

    expect(preflight.required).toBe(true);
    expect(preflight.plannerMode).toBe("stability_scan");
    expect(preflight.plannerResult.ok).toBe(true);
    expect(preflight.fallbackMode).toBeNull();
    expect(preflight.fallbackApplied).toBe(false);
    expect(preflight.plannerResult.plan.observerGrid?.observers.length).toBeGreaterThan(0);
  });

  it("fail-closes and routes to emergency on hard guardrail failure", () => {
    const state = makeState({
      fordRomanCompliance: false,
      natarioConstraint: true,
    });
    const preflight = runModeTransitionSectorPreflight(state, "cruise");

    expect(preflight.plannerResult.ok).toBe(false);
    expect(preflight.plannerResult.firstFail).toBe("FordRomanQI");
    expect(preflight.fallbackMode).toBe("emergency");
    expect(preflight.fallbackApplied).toBe(true);
  });

  it("routes emergency hard-fail fallback to standby", () => {
    const state = makeState({
      fordRomanCompliance: false,
      natarioConstraint: false,
    });
    const preflight = runModeTransitionSectorPreflight(state, "emergency");

    expect(preflight.plannerResult.ok).toBe(false);
    expect(preflight.fallbackMode).toBe("standby");
    expect(resolveModeFallbackMode("emergency")).toBe("standby");
  });
});

