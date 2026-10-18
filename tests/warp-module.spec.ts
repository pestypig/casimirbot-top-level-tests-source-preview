import { describe, expect, it } from "vitest";
import { resolveDutyEff, warpBubbleModule } from "../modules/warp/warp-module";
import type { SimulationParameters } from "../shared/schema";

const makeParams = (
  dynamicConfig: Partial<SimulationParameters["dynamicConfig"]> = {},
  extras: Record<string, unknown> = {},
): SimulationParameters =>
  ({
    dynamicConfig,
    ...extras,
  } as SimulationParameters);

describe("resolveDutyEff", () => {
  it("returns pipeline dutyEffectiveFR when provided", () => {
    const params = makeParams({ sectorCount: 8 }, { dutyEffectiveFR: 0.4 });
    expect(resolveDutyEff(params)).toBeCloseTo(0.4);
  });

  it("converts burst/dwell timing to FR duty", () => {
    const params = makeParams({ burstLengthUs: 10, cycleLengthUs: 100, sectorCount: 5 });
    expect(resolveDutyEff(params)).toBeCloseTo(0.02);
  });

  it("divides sectorDuty by sector count when above FR threshold", () => {
    const params = makeParams({ sectorDuty: 0.05, sectorCount: 4 });
    expect(resolveDutyEff(params)).toBeCloseTo(0.0125);
  });

  it("treats very small sectorDuty as already FR", () => {
    const params = makeParams({ sectorDuty: 0.001, sectorCount: 20 });
    expect(resolveDutyEff(params)).toBeCloseTo(0.001);
  });

  it("threads epsilon tilt and beta tilt vec into Natario shift evaluation", async () => {
    const params = makeParams(
      {
        sectorCount: 400,
        sectorDuty: 2.5e-5,
        burstLengthUs: 10,
        cycleLengthUs: 1000,
        cavityQ: 1e9,
        strokeAmplitudePm: 0,
        epsilonTilt: 2e-7,
        betaTiltVec: [0, -1, 0],
        warpFieldType: "natario",
      } as any,
      {
        radius: 25000,
        gap: 1,
        sagDepth: 16,
        hull: { Lx_m: 2, Ly_m: 2, Lz_m: 2 },
      },
    );

    const result = await warpBubbleModule.calculate(params);
    const center = result.shiftVectorField.evaluateShiftVector(0, 0, 0);
    expect(center[1]).toBeLessThan(0);
    expect(Math.abs(center[1])).toBeGreaterThan(1e-9);
  });
});
