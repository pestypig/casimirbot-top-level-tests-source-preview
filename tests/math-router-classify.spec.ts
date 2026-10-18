import { describe, expect, it } from "vitest";
import { classifyMathRouterPrompt } from "../server/services/math-router/classify";

describe("math router classify", () => {
  it("classifies symbolic determinant with e as variable", () => {
    const result = classifyMathRouterPrompt("det([[a,b],[c,d]]) treat e as variable");
    expect(result.intent).toBe("compute");
    expect(result.domain).toBe("symbolic_linear_algebra");
    expect(result.assumptions.constants.e).toBe("symbol");
  });

  it("classifies numeric determinant matrix as numeric lane", () => {
    const result = classifyMathRouterPrompt("determinant of 50x50 numeric matrix");
    expect(result.domain).toBe("numeric_linear_algebra");
    expect(result.engine).toBe("numeric");
  });

  it("classifies warp viability certificate ask as warp delegation", () => {
    const result = classifyMathRouterPrompt("is this warp configuration physically viable with certificate hash?");
    expect(result.intent).toBe("warp_delegation");
    expect(result.engine).toBe("physics.warp.viability");
  });

  it("does not treat generic warp discussion as viability delegation", () => {
    const result = classifyMathRouterPrompt("explain natario shift vector in plain terms");
    expect(result.intent).not.toBe("warp_delegation");
  });
});
