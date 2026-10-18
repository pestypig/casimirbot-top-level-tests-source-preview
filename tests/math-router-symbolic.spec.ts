import { describe, expect, it } from "vitest";
import { runSymbolicLane } from "../server/services/math-router/lanes/symbolic";

describe("math router symbolic lane", () => {
  it("det([[a,b],[c,d]]) -> a*d - b*c", async () => {
    const out = await runSymbolicLane({ prompt: "det([[a,b],[c,d]])", constants: { e: "euler" } });
    expect(out.ok).toBe(true);
    expect(out.result?.replace(/\s+/g, "")).toContain("a*d-b*c");
  });

  it("det([[1,2],[3,4]]) -> -2", async () => {
    const out = await runSymbolicLane({ prompt: "det([[1,2],[3,4]])", constants: { e: "euler" } });
    expect(out.ok).toBe(true);
    expect(out.result).toBe("-2");
  });

  it("det(matrix([a,b],[c,d])) -> a*d - b*c", async () => {
    const out = await runSymbolicLane({ prompt: "det(matrix([a,b],[c,d]))", constants: { e: "euler" } });
    expect(out.ok).toBe(true);
    expect(out.result?.replace(/\s+/g, "")).toContain("a*d-b*c");
  });

  it("derivative differs for e as symbol vs euler", async () => {
    const symbol = await runSymbolicLane({ prompt: "derivative of e^x", constants: { e: "symbol" } });
    const euler = await runSymbolicLane({ prompt: "derivative of e^x", constants: { e: "euler" } });
    expect(symbol.ok && euler.ok).toBe(true);
    expect(symbol.result).not.toBe(euler.result);
  });
});
