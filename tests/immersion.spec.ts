import { describe, it, expect } from "vitest";
import { computeImmersion } from "../client/src/lib/noise/immersion";

function synthClickSwell(sr = 44_100, bars = 8, bpm = 120) {
  const beatsPerBar = 4;
  const spBeat = Math.round((60 / bpm) * sr);
  const total = bars * beatsPerBar * spBeat;
  const loopSamples = spBeat * beatsPerBar * 4;
  const x = new Float32Array(total);
  for (let beat = 0; beat < bars * beatsPerBar; beat += 1) {
    x[beat * spBeat] = 1;
  }
  for (let idx = 0; idx < total; idx += 1) {
    const t = idx / sr;
    const phase = (idx % loopSamples) / loopSamples;
    const inBeat = (idx % spBeat) / spBeat;
    const loopEnv = 0.6 + 0.4 * Math.cos(2 * Math.PI * phase);
    const beatAccent = 0.5 + 0.5 * Math.cos(2 * Math.PI * inBeat);
    const bass = Math.sin(2 * Math.PI * 55 * t) * loopEnv * beatAccent;
    const lead =
      Math.sin(2 * Math.PI * 220 * t + Math.sin(2 * Math.PI * (bpm / 60) * t) * 0.3) *
      (0.2 + 0.3 * loopEnv);
    x[idx] += bass + lead;
  }
  return x;
}

describe("Immersion basics", () => {
  it("yields high timing and resolve scores on synthetic grid", () => {
    const sr = 44_100;
    const bpm = 120;
    const x = synthClickSwell(sr, 8, bpm);
    const tempo = { bpm, timeSig: "4/4" as const, offsetMs: 0 };
    const scores = computeImmersion(x, sr, tempo);
    expect(scores.timing).toBeGreaterThan(0.65);
    expect(scores.resolve4_low).toBeGreaterThan(0.9);
    expect(scores.resolve8_low).toBeGreaterThan(0.9);
    expect(scores.idi).toBeGreaterThan(0.3);
    expect(scores.confidence).toBeGreaterThan(0.1);
  });
});
