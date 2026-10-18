import { describe, expect, it } from "vitest";
import { evaluateSafeMathExpression, validateSafeMathExpression } from "../../scripts/equations/safe-mathjs-evaluator.js";

describe("NHM2 equation visualizer safe evaluator", () => {
  it("evaluates arithmetic and whitelisted functions", () => {
    expect(evaluateSafeMathExpression("a^2 + exp(b)", { a: 3, b: 0 }).value).toBeCloseTo(10);
  });

  it("rejects unknown functions and symbols", () => {
    expect(validateSafeMathExpression("evil(a)", new Set(["a"])).join(";")).toMatch(/disallowed_function/);
    expect(validateSafeMathExpression("a + z", new Set(["a"])).join(";")).toMatch(/unknown_symbol:z/);
  });

  it("rejects assignments and imports", () => {
    expect(validateSafeMathExpression("a = 1", new Set(["a"])).join(";")).toMatch(/disallowed_node_type|disallowed_operator/);
    expect(validateSafeMathExpression("import('fs')", new Set()).join(";")).toMatch(/disallowed_function|unknown_symbol/);
  });

  it("records non-finite outputs instead of returning plotted zero", () => {
    const result = evaluateSafeMathExpression("1 / x", { x: 0 });
    expect(result.value).toBeNull();
    expect(result.invalidReason).toMatch(/non_finite/);
  });
});
