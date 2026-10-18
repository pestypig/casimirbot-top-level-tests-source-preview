import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  curvaturePrefactors,
  kappaDrive,
  kappaDriveFromPower,
} from "@/physics/curvature";
import { G, c } from "@/physics/constants";

const relClose = (a: number, b: number, tol = 1e-9) => {
  const denom = Math.max(1e-30, Math.abs(b));
  return Math.abs(a - b) / denom <= tol;
};

const drive = (powerW: number, areaM2: number, duty: number, gain: number) =>
  kappaDriveFromPower(powerW, areaM2, duty, gain);

describe("Dimensional prefactors", () => {
  it("matches GR-derived constants for drive and body curvature", () => {
    const driveExpected = (8 * Math.PI * G) / Math.pow(c, 5);
    const bodyExpected = (8 * Math.PI * G) / (3 * c * c);
    expect(relClose(curvaturePrefactors.drive, driveExpected, 1e-12)).toBe(
      true,
    );
    expect(relClose(curvaturePrefactors.body, bodyExpected, 1e-12)).toBe(true);
  });

  it("keeps density and power forms identical", () => {
    const powerArb = fc.double({
      min: 1e-3,
      max: 1e9,
      noDefaultInfinity: true,
      noNaN: true,
    });
    const areaArb = fc.double({
      min: 1e-3,
      max: 1e6,
      noDefaultInfinity: true,
      noNaN: true,
    });
    const dutyArb = fc.double({
      min: 1e-4,
      max: 0.9,
      noDefaultInfinity: true,
      noNaN: true,
    });
    const gainArb = fc.double({
      min: 1e-3,
      max: 1e6,
      noDefaultInfinity: true,
      noNaN: true,
    });

    fc.assert(
      fc.property(powerArb, areaArb, dutyArb, gainArb, (power, area, duty, gain) => {
        const density = power / area;
        const viaPower = kappaDriveFromPower(power, area, duty, gain);
        const viaDensity = kappaDrive(density, duty, gain);
        expect(relClose(viaPower, viaDensity, 1e-12)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});

describe("Warp ledger falsifiability slopes (F1–F4)", () => {
  const powerArb = fc.double({
    min: 1,
    max: 1e8,
    noDefaultInfinity: true,
    noNaN: true,
  });
  const areaArb = fc.double({
    min: 1e-2,
    max: 1e5,
    noDefaultInfinity: true,
    noNaN: true,
  });
  const dutyArb = fc.double({
    min: 1e-4,
    max: 0.3,
    noDefaultInfinity: true,
    noNaN: true,
  });
  const gainArb = fc.double({
    min: 1e-2,
    max: 1e5,
    noDefaultInfinity: true,
    noNaN: true,
  });

  it("F1: duty scaling stays linear until the cap", () => {
    const etaArb = fc.double({
      min: 0.2,
      max: 2.5,
      noDefaultInfinity: true,
      noNaN: true,
    });

    fc.assert(
      fc.property(powerArb, areaArb, dutyArb, etaArb, gainArb, (power, area, duty, eta, gain) => {
        const base = drive(power, area, duty, gain);
        const scaled = drive(power, area, duty * eta, gain);
        expect(relClose(scaled, base * eta, 1e-9)).toBe(true);
      }),
      { numRuns: 75 },
    );
  });

  it("F1 guard: duty clamp holds once the Ford–Roman cap hits", () => {
    const highDuty = fc.double({
      min: 0.5,
      max: 1.5,
      noDefaultInfinity: true,
      noNaN: true,
    });
    const etaArb = fc.double({
      min: 1.2,
      max: 10,
      noDefaultInfinity: true,
      noNaN: true,
    });

    fc.assert(
      fc.property(powerArb, areaArb, highDuty, etaArb, gainArb, (power, area, dutyRaw, eta, gain) => {
        const duty = Math.min(1, dutyRaw);
        const dutyScaled = Math.min(1, dutyRaw * eta);
        const base = drive(power, area, duty, gain);
        const capped = drive(power, area, dutyScaled, gain);
        const ceiling = drive(power, area, 1, gain);

        if (dutyScaled >= 1 - 1e-12) {
          expect(relClose(capped, ceiling, 1e-9)).toBe(true);
        } else {
          expect(relClose(capped, base * (dutyScaled / duty), 1e-9)).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("F2: doubling area halves power density and curvature", () => {
    fc.assert(
      fc.property(powerArb, areaArb, dutyArb, gainArb, (power, area, duty, gain) => {
        const base = drive(power, area, duty, gain);
        const doubledArea = drive(power, area * 2, duty, gain);
        expect(relClose(doubledArea, base * 0.5, 1e-9)).toBe(true);
      }),
      { numRuns: 75 },
    );
  });

  it("F3: geometry gain acts linearly on kappa_drive", () => {
    fc.assert(
      fc.property(powerArb, areaArb, dutyArb, gainArb, (power, area, duty, gain) => {
        const base = drive(power, area, duty, gain);
        const boosted = drive(power, area, duty, gain * 2);
        expect(relClose(boosted, base * 2, 1e-9)).toBe(true);
      }),
      { numRuns: 75 },
    );
  });

  it("F4: storage/Q ladder scales curvature one-for-one", () => {
    const qBand = fc.double({
      min: 5e8,
      max: 1e9,
      noDefaultInfinity: true,
      noNaN: true,
    });

    fc.assert(
      fc.property(
        powerArb,
        areaArb,
        dutyArb,
        fc.double({ min: 1e-3, max: 1e3, noDefaultInfinity: true, noNaN: true }),
        qBand,
        qBand,
        (power, area, duty, baseGain, q1, q2) => {
          const base = drive(power, area, duty, baseGain * q1);
          const varied = drive(power, area, duty, baseGain * q2);
          const expected = base * (q2 / q1);
          expect(relClose(varied, expected, 1e-9)).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });
});
