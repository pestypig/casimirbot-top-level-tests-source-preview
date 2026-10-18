import { describe, expect, test } from "vitest";
import { buildWindow, computeS, computeSApprox } from "../server/qi/qi-saturation";

describe("qi saturation reducer", () => {
  test("buildWindow normalizes area to 1", () => {
    const dt = 1e-4;
    const lorentz = buildWindow(1001, dt, 1e-2, "lorentzian");
    const gauss = buildWindow(1001, dt, 1e-2, "gaussian");
    const sumLorentz = lorentz.reduce((acc, v) => acc + v, 0) * dt;
    const sumGauss = gauss.reduce((acc, v) => acc + v, 0) * dt;
    expect(Math.abs(sumLorentz - 1)).toBeLessThan(1e-6);
    expect(Math.abs(sumGauss - 1)).toBeLessThan(1e-6);
  });

  test("computeS responds to rho magnitude", () => {
    const dt = 1e-3;
    const samples = 1001;
    const rhoStrong = new Float64Array(samples).fill(0);
    const rhoWeak = new Float64Array(samples).fill(0);
    rhoStrong[samples >> 1] = -1;
    rhoWeak[samples >> 1] = -0.5;
    const sStrong = computeS(rhoStrong, dt, "lorentzian", 1e-2, 1);
    const sWeak = computeS(rhoWeak, dt, "lorentzian", 1e-2, 1);
    expect(sWeak).toBeLessThan(sStrong);
  });

  test("computeSApprox scales with qi_limit", () => {
    const a = computeSApprox(-1, 1);
    const b = computeSApprox(-1, 2);
    expect(b).toBeLessThan(a);
  });
});
