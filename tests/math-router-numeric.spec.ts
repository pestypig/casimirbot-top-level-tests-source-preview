import { describe, expect, it } from "vitest";
import { runNumericLane } from "../server/services/math-router/lanes/numeric";

describe("math router numeric lane", () => {
  it("routes 50x50 determinant request to numeric lane", () => {
    const out = runNumericLane("determinant of 50x50 numeric matrix");
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("matrix_entries_required");
    expect(out.verifier.warnings).toContain("large_matrix_declared_without_explicit_entries");
  });

  it("routes numeric expression evaluation", () => {
    const out = runNumericLane("evaluate (2+3)*4");
    expect(out.ok).toBe(true);
    expect(out.value).toBe(20);
    expect(out.verifier.residualPass).toBe(true);
  });

  it("handles NaN/Inf warnings", () => {
    const out = runNumericLane("evaluate 1/0");
    expect(out.ok).toBe(false);
    expect(out.verifier.warnings).toContain("non_finite_result");
  });
});
