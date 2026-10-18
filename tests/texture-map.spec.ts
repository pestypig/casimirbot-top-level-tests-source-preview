import { describe, expect, it } from "vitest";
import {
  textureFrom,
  blendPeaks,
  createDeterministicRng,
  type TextureFingerprint,
} from "@/lib/noise/texture-map";

describe("texture-map", () => {
  const helixPeaks = [
    { f: 220, q: 1.2, gain: 1.08 },
    { f: 1500, q: 1.5, gain: 0.94 },
    { f: 7200, q: 3.4, gain: 1.12 },
  ];

  const kbTexture: TextureFingerprint = {
    eq: [
      { f: 240, q: 1.1, gain: 1.04 },
      { f: 1800, q: 1.3, gain: 0.96 },
      { f: 6500, q: 3.2, gain: 1.16 },
    ],
    ir: "plate_small.wav",
    chorus: { rate: 0.6, depth: 0.004 },
    sat: { drive: 0.28 },
  };

  it("produces deterministic output with identical params", () => {
    const base = {
      sampleInfluence: 0.7,
      styleInfluence: 0.3,
      weirdness: 0.2,
      seed: 12345,
    };

    const first = textureFrom(helixPeaks, kbTexture, base);
    const second = textureFrom(helixPeaks, kbTexture, base);

    expect(second).toEqual(first);
  });

  it("blends peaks consistently between helix and kb fingerprints", () => {
    const blended = blendPeaks(helixPeaks, kbTexture.eq, 0.7, 0.3);
    expect(blended).toHaveLength(3);
    expect(blended[0].f).toBeGreaterThan(200);
    expect(blended[0].f).toBeLessThan(260);
  });

  it("introduces controlled variation with higher weirdness", () => {
    const mild = textureFrom(helixPeaks, kbTexture, {
      sampleInfluence: 0.7,
      styleInfluence: 0.3,
      weirdness: 0,
      seed: 9,
    });
    const wild = textureFrom(helixPeaks, kbTexture, {
      sampleInfluence: 0.7,
      styleInfluence: 0.3,
      weirdness: 0.9,
      seed: 9,
    });
    expect(wild.eqPeaks).toHaveLength(mild.eqPeaks.length);
    expect(wild.eqPeaks).not.toEqual(mild.eqPeaks);
  });

  it("creates deterministic random sequences", () => {
    const rngA = createDeterministicRng(42);
    const rngB = createDeterministicRng(42);
    const sequenceA = Array.from({ length: 5 }, () => rngA.next());
    const sequenceB = Array.from({ length: 5 }, () => rngB.next());
    expect(sequenceB).toEqual(sequenceA);
  });
});
