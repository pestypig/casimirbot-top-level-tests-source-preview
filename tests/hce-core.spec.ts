import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildAudioPacket,
  evolveRun,
  initRun,
  removeRun,
} from "../server/services/hce-core";
import type { HceConfigPayload, HcePeak } from "../shared/hce-types";

type CompleteHceConfigPayload = Omit<
  HceConfigPayload,
  "seed" | "lambda" | "latentDim" | "dt"
> & {
  seed: string;
  lambda: number;
  latentDim: number;
  dt: number;
};

const peakArb = fc.record<HcePeak>({
  omega: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
  gamma: fc.double({ min: 0.01, max: 1.5, noNaN: true, noDefaultInfinity: true }),
  alpha: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
});

const determinismPayloadArb = fc.record<CompleteHceConfigPayload>({
  seed: fc.hexaString({ minLength: 12, maxLength: 32 }).map((s) => s.toLowerCase()),
  rc: fc.double({ min: 0.01, max: 0.45, noNaN: true, noDefaultInfinity: true }),
  tau: fc.double({ min: 0.2, max: 5, noNaN: true, noDefaultInfinity: true }),
  beta: fc.double({ min: 0.05, max: 0.9, noNaN: true, noDefaultInfinity: true }),
  lambda: fc.double({ min: 0.1, max: 0.9, noNaN: true, noDefaultInfinity: true }),
  K: fc.integer({ min: 2, max: 6 }),
  latentDim: fc.integer({ min: 8, max: 64 }),
  dt: fc.double({ min: 0.02, max: 0.08, noNaN: true, noDefaultInfinity: true }),
  peaks: fc.array(peakArb, { minLength: 0, maxLength: 6 }),
});

const invariancePayloadArb = fc.record<CompleteHceConfigPayload>({
  seed: fc.hexaString({ minLength: 12, maxLength: 32 }).map((s) => s.toLowerCase()),
  rc: fc.double({ min: 0.05, max: 0.4, noNaN: true, noDefaultInfinity: true }),
  tau: fc.double({ min: 0.5, max: 4, noNaN: true, noDefaultInfinity: true }),
  beta: fc.double({ min: 0.05, max: 0.9, noNaN: true, noDefaultInfinity: true }),
  lambda: fc.double({ min: 0.2, max: 0.8, noNaN: true, noDefaultInfinity: true }),
  K: fc.integer({ min: 2, max: 5 }),
  latentDim: fc.constant(32),
  dt: fc.constant(0.05),
  peaks: fc.array(peakArb, { minLength: 0, maxLength: 4 }),
});

const energyPayloadArb = fc.record<CompleteHceConfigPayload>({
  seed: fc.hexaString({ minLength: 12, maxLength: 32 }).map((s) => s.toLowerCase()),
  rc: fc.double({ min: 0.05, max: 0.4, noNaN: true, noDefaultInfinity: true }),
  tau: fc.double({ min: 1, max: 4, noNaN: true, noDefaultInfinity: true }),
  beta: fc.double({ min: 0.1, max: 0.8, noNaN: true, noDefaultInfinity: true }),
  lambda: fc.double({ min: 0.2, max: 0.8, noNaN: true, noDefaultInfinity: true }),
  K: fc.integer({ min: 2, max: 5 }),
  latentDim: fc.constant(32),
  dt: fc.constant(0.05),
  peaks: fc.array(peakArb, { minLength: 0, maxLength: 4 }),
});

const clonePayload = <T extends HceConfigPayload>(payload: T): T => ({
  ...payload,
  peaks: payload.peaks.map((peak) => ({ ...peak })),
});

const vectorNorm = (vec: Float64Array): number => {
  let acc = 0;
  for (let i = 0; i < vec.length; i += 1) {
    acc += vec[i] * vec[i];
  }
  return Math.sqrt(acc);
};

describe("hce-core determinism and stability", () => {
  const tempArb = fc.double({ min: 0.01, max: 0.2, noNaN: true, noDefaultInfinity: true });

  it("replays identical branch and audio packets for identical seeds", () => {
    fc.assert(
      fc.property(
        determinismPayloadArb,
        tempArb,
        fc.integer({ min: 8, max: 24 }),
        (payload, temp, stepsFactor) => {
          const steps = stepsFactor;
          const runA = initRun(clonePayload(payload));
          const runB = initRun(clonePayload(payload));

          try {
            for (let i = 0; i < steps; i += 1) {
              const stepA = evolveRun(runA, undefined, temp);
              const stepB = evolveRun(runB, undefined, temp);
              expect(stepB.suggestedBranch).toBe(stepA.suggestedBranch);

              const packetA = buildAudioPacket(runA, stepA.suggestedBranch);
              const packetB = buildAudioPacket(runB, stepB.suggestedBranch);
              expect(packetB).toEqual(packetA);
            }
          } finally {
            removeRun(runA.id);
            removeRun(runB.id);
          }
        },
      ),
      { numRuns: 75 },
    );
  });

  it("maintains branch selection when halving the integrator dt", () => {
    const tempRange = fc.double({ min: 0.01, max: 0.1, noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(invariancePayloadArb, tempRange, (payload, temp) => {
        const coarse = initRun(clonePayload(payload));
        const fine = initRun(clonePayload(payload));
        const steps = Math.round(30 / payload.dt);
        const fineDt = payload.dt / 2;

        try {
          let matches = 0;
          for (let i = 0; i < steps; i += 1) {
            const coarseStep = evolveRun(coarse, payload.dt, temp);
            evolveRun(fine, fineDt, temp);
            const fineStep = evolveRun(fine, fineDt, temp);
            if (coarseStep.suggestedBranch === fineStep.suggestedBranch) {
              matches += 1;
            }
          }
          const jaccard = matches / steps;
          expect(jaccard).toBeGreaterThanOrEqual(0.98);
        } finally {
          removeRun(coarse.id);
          removeRun(fine.id);
        }
      }),
      { numRuns: 25 },
    );
  });

  it("keeps the state energy bounded over long simulations", () => {
    fc.assert(
      fc.property(
        energyPayloadArb,
        fc.double({ min: 0.05, max: 0.15, noNaN: true, noDefaultInfinity: true }),
        (payload, temp) => {
          const run = initRun(clonePayload(payload));
          const dt = run.config.dt;
          const totalSteps = Math.round((10 * 60) / dt);
          const warmupSteps = Math.round(5 / dt);
          const sampleStride = 5;

          let minNorm = Number.POSITIVE_INFINITY;
          let maxNorm = 0;
          let firstSum = 0;
          let secondSum = 0;
          let firstCount = 0;
          let secondCount = 0;

          try {
            for (let step = 0; step < totalSteps; step += 1) {
              evolveRun(run, dt, temp);
              if (step < warmupSteps || step % sampleStride !== 0) {
                continue;
              }
              const norm = vectorNorm(run.psi);
              if (step < totalSteps / 2) {
                firstSum += norm;
                firstCount += 1;
              } else {
                secondSum += norm;
                secondCount += 1;
              }
              if (norm < minNorm) minNorm = norm;
              if (norm > maxNorm) maxNorm = norm;
            }
          } finally {
            removeRun(run.id);
          }

          expect(firstCount).toBeGreaterThan(0);
          expect(secondCount).toBeGreaterThan(0);

          const avgFirst = firstSum / firstCount;
          const avgSecond = secondSum / secondCount;
          const mean = (avgFirst + avgSecond) / 2;
          const relativeShift = Math.abs(avgFirst - avgSecond) / mean;

          expect(minNorm).toBeGreaterThan(0);
          // Keep energy bounded but allow headroom for long integrations and rounding.
          const maxNormLimit = 60;
          const relativeShiftLimit = 0.5;
          expect(maxNorm).toBeLessThanOrEqual(maxNormLimit);
          expect(relativeShift).toBeLessThanOrEqual(relativeShiftLimit);
        },
      ),
      { numRuns: 3, seed: 42 },
    );
  });
});
