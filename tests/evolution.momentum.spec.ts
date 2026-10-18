import { describe, expect, it } from "vitest";
import { computeMomentum } from "../server/services/evolution/momentum";

describe("evolution momentum", () => {
  it("computes deterministic stable ordering", () => {
    const out = computeMomentum({
      deltaLoc: 40,
      deltaFiles: 3,
      deltaContracts: 1,
      subsystemLoc: { b: 10, a: 30 },
      couplingMissingEdges: 2,
      testsRun: 8,
      testsFailed: 1,
      testTimeDeltaMs: 250,
      policyTouched: true,
      contractDocsTouched: false,
      schemaTouched: true,
    });
    expect(out.subsystem.map((x) => x.subsystem)).toEqual(["a", "b"]);
    expect(out.scope).toBeGreaterThan(0);
    expect(out.uncertainty).toBeGreaterThan(2);
  });

  it("uses assumption branch when no tests ran", () => {
    const out = computeMomentum({
      deltaLoc: 1,
      deltaFiles: 1,
      deltaContracts: 0,
      subsystemLoc: {},
      couplingMissingEdges: 0,
      testsRun: 0,
      testsFailed: 0,
      testTimeDeltaMs: 0,
      policyTouched: false,
      contractDocsTouched: false,
      schemaTouched: false,
    });
    expect(out.test).toBe(-0.5);
  });
});
