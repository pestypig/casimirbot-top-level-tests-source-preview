import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

type Fixture = {
  convention: { theta_relation: string; sign: string };
  alcubierre: { alpha: number; theta: number; trK: number; t00: number };
  natario: { alpha: number; theta: number; trK: number; t00: number };
};

describe("analytic regression pack (reduced-order)", () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "tests/fixtures/warp/analytic-regression.json"), "utf8"),
  ) as Fixture;

  it("enforces repo theta/TrK convention", () => {
    expect(fixture.convention.theta_relation).toContain("theta = -alpha * TrK");
    const lhsA = fixture.alcubierre.theta;
    const rhsA = -fixture.alcubierre.alpha * fixture.alcubierre.trK;
    expect(Math.abs(lhsA - rhsA)).toBeLessThan(1e-9);

    const lhsN = fixture.natario.theta;
    const rhsN = -fixture.natario.alpha * fixture.natario.trK;
    expect(Math.abs(lhsN - rhsN)).toBeLessThan(1e-9);
  });

  it("checks T00 sign/shape sanity without propulsion claims", () => {
    expect(fixture.alcubierre.t00).toBeLessThanOrEqual(0);
    expect(fixture.natario.t00).toBeLessThanOrEqual(0);
  });
});
