import { describe, expect, it } from "vitest";
import { solveHelixAskMathQuestion } from "../server/services/helix-ask/math";

describe("helix ask math router integration", () => {
  it("routes determinant symbolic ask deterministically", async () => {
    const out = await solveHelixAskMathQuestion("det([[a,b],[c,d]])");
    expect(out?.ok).toBe(true);
    expect(out?.reason).toContain("symbolic_lane:determinant");
    expect(out?.final?.replace(/\s+/g, "")).toContain("a*d-b*c");
  });

  it("routes matrix(...) determinant ask deterministically", async () => {
    const out = await solveHelixAskMathQuestion("det(matrix([a,b],[c,d]))");
    expect(out?.ok).toBe(true);
    expect(out?.reason).toContain("symbolic_lane:determinant");
    expect(out?.final?.replace(/\s+/g, "")).toContain("a*d-b*c");
  });

  it("respects e-as-symbol policy", async () => {
    const symbol = await solveHelixAskMathQuestion("treat e as variable and derivative of e^x");
    const euler = await solveHelixAskMathQuestion("derivative of e^x");
    expect(symbol?.ok && euler?.ok).toBe(true);
    expect(symbol?.final).not.toBe(euler?.final);
  });

  it("warp viability prompts are delegated away from generic math lane", async () => {
    const out = await solveHelixAskMathQuestion("is this warp configuration physically viable?");
    expect(out?.ok).toBe(false);
    expect(out?.reason).toBe("warp_delegation_required");
  });
});
