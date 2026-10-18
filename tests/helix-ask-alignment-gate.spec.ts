import { describe, expect, it } from "vitest";
import {
  evaluateHelixAskAlignmentGate,
  resolveFrontierHardGuard,
  resolveOpenWorldBypassPolicy,
} from "../server/services/helix-ask/alignment-gate";

describe("Helix Ask alignment gate", () => {
  it("returns PASS when alignment, margin, stability, and confidence are strong", () => {
    const result = evaluateHelixAskAlignmentGate({
      alignment_real: 0.86,
      alignment_decoy: 0.2,
      stability_3_rewrites: 0.84,
      contradiction_rate: 0.04,
      sampleCount: 12,
    });
    expect(result.decision).toBe("PASS");
    expect(result.metrics.coincidence_margin).toBeCloseTo(0.66, 2);
    expect(result.metrics.lower95_p_align).toBeGreaterThan(0.58);
  });

  it("does not force FAIL for perfect small-sample inputs", () => {
    const result = evaluateHelixAskAlignmentGate({
      alignment_real: 1,
      alignment_decoy: 0,
      stability_3_rewrites: 1,
      contradiction_rate: 0,
      sampleCount: 3,
    });
    expect(result.decision).toBe("PASS");
    expect(result.metrics.sample_count).toBe(3);
    expect(result.metrics.lower95_p_align).toBeGreaterThan(0.35);
  });

  it("returns BORDERLINE for mid-confidence coincidence", () => {
    const result = evaluateHelixAskAlignmentGate({
      alignment_real: 0.63,
      alignment_decoy: 0.31,
      stability_3_rewrites: 0.72,
      contradiction_rate: 0.1,
      sampleCount: 60,
    });
    expect(result.decision).toBe("BORDERLINE");
  });

  it("returns FAIL with deterministic fail reason on weak coincidence", () => {
    const result = evaluateHelixAskAlignmentGate({
      alignment_real: 0.42,
      alignment_decoy: 0.35,
      stability_3_rewrites: 0.5,
      contradiction_rate: 0.23,
      sampleCount: 4,
    });
    expect(result.decision).toBe("FAIL");
    expect(result.failReason).toBe("alignment_gate_fail");
  });
});

describe("open world bypass policy", () => {
  it("routes repo-required FAIL to clarify/fail-closed", () => {
    const result = resolveOpenWorldBypassPolicy({
      gateDecision: "FAIL",
      requiresRepoEvidence: true,
      openWorldAllowed: false,
    });
    expect(result.action).toBe("clarify_fail_closed");
    expect(result.reason).toBe("alignment_fail_repo_required");
  });

  it("routes open-world FAIL to bypass with explicit uncertainty", () => {
    const result = resolveOpenWorldBypassPolicy({
      gateDecision: "FAIL",
      requiresRepoEvidence: false,
      openWorldAllowed: true,
    });
    expect(result.action).toBe("bypass_with_uncertainty");
    expect(result.reason).toBe("alignment_fail_open_world_bypass");
  });
});

describe("frontier hard guard", () => {
  it("forces clarify when support ratio is zero and bypass is inactive", () => {
    const result = resolveFrontierHardGuard({
      supportRatio: 0,
      missingRequiredSlots: [],
      openWorldBypassActive: false,
    });
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("clarify_fail_closed");
    expect(result.reason).toBe("support_ratio_zero");
  });

  it("forces bypass mode when support ratio is zero and bypass is active", () => {
    const result = resolveFrontierHardGuard({
      supportRatio: 0,
      missingRequiredSlots: ["definitions"],
      openWorldBypassActive: true,
    });
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("bypass_with_uncertainty");
    expect(result.reason).toBe("support_ratio_zero_and_required_slots_missing");
  });

  it("stays inactive when support ratio is positive and required slots are present", () => {
    const result = resolveFrontierHardGuard({
      supportRatio: 0.4,
      missingRequiredSlots: [],
      openWorldBypassActive: false,
    });
    expect(result.triggered).toBe(false);
    expect(result.action).toBe("none");
    expect(result.reason).toBe("none");
  });
});
