import { describe, it, expect } from "vitest";
import { mathSympyVerifierHandler } from "../server/specialists/verifiers/math.sympy.verify";

const gate = process.env.ENABLE_SPECIALISTS === "1" && process.env.ENABLE_PY_CHECKERS === "1";

(gate ? describe : describe.skip)("math.sympy verify", () => {
  const baseInput = {
    problem: {
      id: "prob-1",
      persona_id: "persona:test",
      goal: "check math",
      context: { ground_truth: "14" },
    },
    solver_output: {
      summary: "FINAL ANSWER: 14",
      data: { final: "2*(3+4)" },
      artifacts: [],
      essence_ids: [],
    },
  };

  it("accepts equivalent expressions", async () => {
    const result = await mathSympyVerifierHandler(baseInput);
    expect(result.ok).toBe(true);
  });

  it("rejects mismatched expressions", async () => {
    const mismatch = {
      ...baseInput,
      problem: { ...baseInput.problem, context: { ground_truth: "15" } },
    };
    const result = await mathSympyVerifierHandler(mismatch);
    expect(result.ok).toBe(false);
  });
});
