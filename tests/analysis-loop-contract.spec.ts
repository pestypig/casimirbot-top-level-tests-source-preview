import { describe, expect, it } from "vitest";
import {
  CONSTRAINT_LOOP_FAIL_REASON_PROVENANCE_MISSING,
  runConstraintLoop,
  type ConstraintLoopHandlers,
} from "../modules/analysis/constraint-loop";

describe("constraint-loop provenance contract", () => {
  it("adds provenance to loop results when provided", () => {
    const handlers: ConstraintLoopHandlers<number, number, { score: number }> = {
      derive: (state) => state,
      constrain: (_state, derivatives) => ({ score: derivatives }),
      gate: () => ({ status: "pass", residuals: { score: 0 } }),
      step: (state) => state + 1,
    };

    const result = runConstraintLoop({
      initialState: 1,
      maxIterations: 1,
      handlers,
      provenance: {
        provenance_class: "proxy",
        claim_tier: "diagnostic",
        certifying: false,
      },
    });

    expect(result.accepted).toBe(true);
    expect(result.provenance).toEqual({
      provenance_class: "proxy",
      claim_tier: "diagnostic",
      certifying: false,
    });
  });

  it("forces deterministic strict provenance failure when missing", () => {
    const handlers: ConstraintLoopHandlers<number, number, { score: number }> = {
      derive: (state) => state,
      constrain: (_state, derivatives) => ({ score: derivatives }),
      gate: () => ({ status: "pass", residuals: { score: 0 } }),
      step: (state) => state + 1,
    };

    const result = runConstraintLoop({
      initialState: 1,
      maxIterations: 1,
      handlers,
      strictProvenance: true,
    });

    expect(result.accepted).toBe(false);
    expect(result.attempts[0]?.accepted).toBe(false);
    expect(result.attempts[0]?.gate.status).toBe("fail");
    expect(result.attempts[0]?.gate.fail_reason).toBe(
      CONSTRAINT_LOOP_FAIL_REASON_PROVENANCE_MISSING,
    );
  });
});
