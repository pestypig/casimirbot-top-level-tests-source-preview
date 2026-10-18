import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateDeepMixingLedger,
  DEEP_MIXING_G0_AUDIT_INPUTS,
  runOneZoneAudit,
  SECONDS_PER_JULIAN_YEAR,
  SOLAR_HYDROGEN_BURN_REFERENCE_KG_S,
} from "../client/src/lib/deepMixingPhysics";
import {
  controlStep,
  DEEP_MIXING_TARGETS,
  DeepMixingAutopilot,
  type DeepMixingTelemetry,
} from "../client/src/lib/deepMixingPreset";
import { buildStarSimTheoryBadgesV1 } from "../shared/theory/starsim-theory-badges";

const observedResidual = (value: number, uncertainty = 1, sampleAgeDays = 0) => ({
  value,
  uncertainty,
  sampleAgeDays,
  evidenceMode: "observed" as const,
});

const validTelemetry = (overrides: Partial<DeepMixingTelemetry> = {}): DeepMixingTelemetry => ({
  dLogL_per_Myr: 0,
  dLogTc_per_Myr: 0,
  seismicResidual: observedResidual(0),
  neutrinoResidual: observedResidual(0),
  achievedEpsilon: DeepMixingAutopilot.epsilon,
  ...overrides,
});

describe("controlled stellar composition transport G0", () => {
  it("separates gross circulation, net hydrogen delivery, and alpha", () => {
    const ledger = calculateDeepMixingLedger({
      epsilon: 0.01,
      areaFraction: 0.1,
      transportEfficiency: 1,
      sourceHydrogenFraction: 0.7,
      receiverHydrogenFraction: 0.34,
      elapsedSeconds: SECONDS_PER_JULIAN_YEAR,
      envelopeHydrogenMassKg: 1.1e30,
    });

    expect(ledger.maturity).toBe("reduced_order_diagnostic");
    expect(ledger.grossCirculationKgS).toBe(6e9);
    expect(ledger.netHydrogenDeliveryKgS).toBeCloseTo(2.16e9, 5);
    expect(ledger.accessibleFuelFractionAlpha).toBeCloseTo(
      2.16e9 * SECONDS_PER_JULIAN_YEAR / 1.1e30,
      15,
    );
    expect(ledger.radialSetpointMps).toBeCloseTo(1.0067e-10, 4);
    expect(ledger.reservoirExceeded).toBe(false);
  });

  it("reproduces the frozen one-zone discrepancy without calling it a solar prediction", () => {
    const audit = runOneZoneAudit({ ...DEEP_MIXING_G0_AUDIT_INPUTS });

    expect(audit.maturity).toBe("reduced_order_diagnostic");
    expect(audit.grossCirculationKgS).toBe(6e9);
    expect(audit.netHydrogenDeliveryKgS).toBeCloseTo(2.16e9, 5);
    expect(audit.burnOffsetFraction).toBeCloseTo(0.0036, 12);
    expect(audit.noMixDepletionMyr).toBeCloseTo(6284.804, 3);
    expect(audit.mixedDepletionMyr).toBeCloseTo(6307.511, 3);
    expect(audit.extensionMyr).toBeCloseTo(22.707, 3);
    expect(audit.requiredEpsilonForTarget).toBeCloseTo(0.242079, 5);
    expect(audit.requiredGrossCirculationKgS / 1e11).toBeCloseTo(1.452474156, 8);
    expect(audit.requiredRadialSetpointMps * SECONDS_PER_JULIAN_YEAR * 1000).toBeCloseTo(76.9, 1);
  });

  it("fails closed on invalid efficiencies, areas, and composition direction", () => {
    const base = {
      epsilon: 0.01,
      areaFraction: 0.1,
      transportEfficiency: 1,
      sourceHydrogenFraction: 0.7,
      receiverHydrogenFraction: 0.34,
      elapsedSeconds: 1,
      envelopeHydrogenMassKg: 1,
    };
    expect(() => calculateDeepMixingLedger({ ...base, transportEfficiency: 1.01 })).toThrow(RangeError);
    expect(() => calculateDeepMixingLedger({ ...base, areaFraction: 0 })).toThrow(RangeError);
    expect(() => calculateDeepMixingLedger({
      ...base,
      sourceHydrogenFraction: 0.2,
      receiverHydrogenFraction: 0.34,
    })).toThrow(RangeError);
  });

  it("keeps requested lifetime thresholds separate from epsilon hypotheses", () => {
    expect(DEEP_MIXING_TARGETS.every((target) => !("epsilon" in target))).toBe(true);
    expect(DEEP_MIXING_TARGETS.map((target) => target.epsilonHypothesis)).toEqual([1e-3, 5e-3, 1e-2]);
    expect(SOLAR_HYDROGEN_BURN_REFERENCE_KG_S).toBe(6e11);
  });

  it.each([1, -1])("trips symmetric drift guardrails for sign %s", (sign) => {
    const result = controlStep(
      DeepMixingAutopilot,
      validTelemetry({ dLogL_per_Myr: sign * 1.1e-3 }),
    );
    expect(result.enteredSafe).toBe(true);
    expect(result.reasons).toContain("luminosity_drift_limit");
  });

  it.each([1, -1])("uses residual magnitudes rather than favorable signs for sign %s", (sign) => {
    const result = controlStep(
      DeepMixingAutopilot,
      validTelemetry({ seismicResidual: observedResidual(sign * 2, 1) }),
    );
    expect(result.enteredSafe).toBe(true);
    expect(result.reasons).toContain("seismic_residual_limit");
  });

  it("fails closed on uncertainty-free, stale, non-finite, and synthetic telemetry", () => {
    const uncertaintyFree = controlStep(
      DeepMixingAutopilot,
      validTelemetry({ seismicResidual: observedResidual(0, 0) }),
    );
    expect(uncertaintyFree.failClosed).toBe(true);
    expect(uncertaintyFree.reasons).toContain("invalid_or_stale_telemetry");

    const stale = controlStep(
      DeepMixingAutopilot,
      validTelemetry({ neutrinoResidual: observedResidual(0, 1, 31) }),
    );
    expect(stale.failClosed).toBe(true);

    const nonFinite = controlStep(
      DeepMixingAutopilot,
      validTelemetry({ dLogTc_per_Myr: Number.NaN }),
    );
    expect(nonFinite.failClosed).toBe(true);

    const synthetic = controlStep(DeepMixingAutopilot, {
      ...validTelemetry(),
      seismicResidual: { ...observedResidual(0), evidenceMode: "synthetic" },
    });
    expect(synthetic.failClosed).toBe(true);
    expect(synthetic.reasons).toContain("synthetic_telemetry_cannot_authorize");
  });

  it("freezes the future-gate definitions without inventing G1 tolerances", () => {
    const preregPath = join(
      process.cwd(),
      "configs",
      "research",
      "controlled-stellar-composition-transport-g0-preregistration.v1.json",
    );
    const prereg = JSON.parse(readFileSync(preregPath, "utf8"));
    expect(prereg.maturity).toBe("reduced_order_diagnostic");
    expect(prereg.claimBoundary.interventionFeasible).toBe(false);
    expect(prereg.acceptancePolicy.tolerances).toBeNull();
    expect(prereg.numericalPolicy.fixtureFallbackAllowed).toBe(false);
    expect(prereg.terminalOutcomes).toEqual([
      "NO_ADMISSIBLE_PROFILE",
      "NARROW_ADMISSIBLE_PROFILE",
      "ROBUST_ADMISSIBLE_FAMILY",
    ]);
  });

  it("renames the graph boundary as a feasibility proposition and keeps the hazard non-evidentiary", () => {
    const { badges } = buildStarSimTheoryBadgesV1();
    const boundary = badges.find(
      (badge) => badge.id === "starsim.restoration.claim_boundary.planning_forecast_only",
    );
    const hazard = badges.find(
      (badge) => badge.id === "starsim.restoration.transition_hazard_proxy",
    );
    expect(boundary?.title).toBe("Controlled Stellar Composition Transport Feasibility Proposition");
    expect(boundary?.claimBoundary.physicalMechanismClaimAllowed).toBe(false);
    expect(hazard?.title).toBe("Non-evidentiary transition hazard visualization");
    expect(hazard?.status).toBe("diagnostic");
  });
});
