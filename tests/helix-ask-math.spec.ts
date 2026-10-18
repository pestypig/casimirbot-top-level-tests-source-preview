import { describe, expect, it } from "vitest";
import {
  buildHelixAskMathAnswer,
  isHelixAskMathQuestion,
  solveHelixAskMathQuestion,
} from "../server/services/helix-ask/math";

describe("Helix Ask math solver", () => {
  it("detects symbolic equations without numeric literals", () => {
    const symbolic =
      "thetaScaleCore = gammaGeo^3 * qEnhancement * sqrt(dutyFactor)";
    expect(isHelixAskMathQuestion(symbolic)).toBe(true);
  });

  it("does not classify conceptual equation prompts as direct math solves", () => {
    const conceptual = "what's the equation of the collapse of the wave function?";
    expect(isHelixAskMathQuestion(conceptual)).toBe(false);
  });

  it("does not classify conceptual prompts that only mention a solve in prose as math", () => {
    const conceptual =
      "The text proves the regime is mild by looking at the norm of the shift vector. Why is this important to the solve it belongs to?";
    expect(isHelixAskMathQuestion(conceptual)).toBe(false);
  });

  it("solves linear equations with implicit multiplication", async () => {
    const result = await solveHelixAskMathQuestion(
      "Solve for x: 2x + 5 = 17. Explain briefly",
    );
    expect(result?.ok).toBe(true);
    expect(result?.variable).toBe("x");
    expect(result?.solutions?.[0]).toBe("6");
    expect(buildHelixAskMathAnswer(result!)).toContain("x = 6");
  });

  it("handles non-x derivatives", async () => {
    const result = await solveHelixAskMathQuestion("What is d/dt of t^2 + 3t?");
    expect(result?.ok).toBe(true);
    expect(result?.variable).toBe("t");
    expect(result?.final).toContain("2t");
    expect(result?.final).toContain("+3");
  });

  it("handles indefinite integrals", async () => {
    const result = await solveHelixAskMathQuestion("What is the integral of x^2 + 3x?");
    expect(result?.ok).toBe(true);
    expect(result?.kind).toBe("integral");
    expect(result?.variable).toBe("x");
    expect(result?.final).toContain("x^3");
    expect(result?.final).toContain("x^2");
    expect(buildHelixAskMathAnswer(result!)).toContain("+ C");
  });

  it("handles non-x integrals", async () => {
    const result = await solveHelixAskMathQuestion("Integrate 2t with respect to t");
    expect(result?.ok).toBe(true);
    expect(result?.kind).toBe("integral");
    expect(result?.variable).toBe("t");
    expect(result?.final).toBe("t^2");
  });

  it("evaluates arithmetic prompts with leading words cleanly", async () => {
    const result = await solveHelixAskMathQuestion("What is 2 + 2?");
    expect(result?.ok).toBe(true);
    expect(result?.kind).toBe("evaluate");
    expect(result?.expr).toBe("2 + 2");
    expect(result?.final).toBe("4");
    expect(buildHelixAskMathAnswer(result!)).toContain("2 + 2");
    expect(buildHelixAskMathAnswer(result!)).toContain("4");
  });

  it("returns null for conceptual prose that is not an actual math expression", async () => {
    const result = await solveHelixAskMathQuestion(
      "The text proves the regime is mild by looking at the norm of the shift vector. Why is this important to the solve it belongs to?",
    );
    expect(result).toBeNull();
  });

  it("solves small systems of equations", async () => {
    const result = await solveHelixAskMathQuestion(
      "Solve for x and y: x + y = 10; x - y = 4",
    );
    expect(result?.ok).toBe(true);
    expect(result?.solutionMap?.x?.[0]).toBe("7");
    expect(result?.solutionMap?.y?.[0]).toBe("3");
    expect(buildHelixAskMathAnswer(result!)).toContain("x = 7");
    expect(buildHelixAskMathAnswer(result!)).toContain("y = 3");
  });

  it("can isolate codebase-style variables symbolically", async () => {
    const result = await solveHelixAskMathQuestion(
      "Solve for gammaGeo: thetaScaleCore = gammaGeo^3 * qEnhancement * sqrt(dutyFactor)",
    );
    expect(result?.ok).toBe(true);
    expect(result?.variable).toBe("gammaGeo");
    expect(result?.registryId).toBe("natario.theta_scale_core.gamma_geo");
    expect(result?.gatePass).toBe(true);
    expect(result?.residualPass).toBe(true);
    expect(result?.solutions?.[0]).toContain("thetaScaleCore");
    expect(result?.solutions?.[0]).not.toMatch(/\bi\b/i);
  });



  it("adds conservative certainty defaults for non-strict flows", async () => {
    const result = await solveHelixAskMathQuestion("Solve for x: 2x + 5 = 17");
    expect(result?.provenance_class).toBe("inferred");
    expect(result?.claim_tier).toBe("diagnostic");
    expect(result?.certifying).toBe(false);
    expect(result?.fail_reason).toBeUndefined();
  });

  it("adds deterministic strict fail_reason when certainty evidence is missing", async () => {
    const result = await solveHelixAskMathQuestion("Solve for x: 2x + 5 = 17", {
      strictCertainty: true,
      certaintyEvidenceOk: false,
    });
    expect(result?.provenance_class).toBe("inferred");
    expect(result?.claim_tier).toBe("diagnostic");
    expect(result?.certifying).toBe(false);
    expect(result?.fail_reason).toBe("CERTAINTY_EVIDENCE_MISSING");
  });

  it("refuses to claim a real solution when none exists", async () => {
    const result = await solveHelixAskMathQuestion("Solve: x^2 + 1 = 0");
    expect(result?.ok).toBe(true);
    expect(result?.gatePass).toBe(false);
    expect(buildHelixAskMathAnswer(result!)).toContain("admissible real solution");
  });
});
