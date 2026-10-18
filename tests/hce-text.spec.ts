import { describe, expect, it } from "vitest";
import { applyLanguageBias, hashEmbed } from "../server/services/hce-text";

const toArray = (vec: Float64Array) => Array.from(vec);

const norm = (vec: Float64Array) =>
  Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));

describe("hashEmbed", () => {
  it("produces deterministic embeddings", () => {
    const a = hashEmbed("collapse to crystal", 16);
    const b = hashEmbed("collapse to crystal", 16);
    expect(toArray(a)).toEqual(toArray(b));
  });

  it("returns normalized vectors when input is non-empty", () => {
    const vec = hashEmbed("colored noise field", 32);
    expect(norm(vec)).toBeCloseTo(1, 6);
  });
});

describe("applyLanguageBias", () => {
  it("favours branches aligned with the embedding", () => {
    const psi = new Float64Array([0.8, 0.1, 0]);
    const centers = [
      new Float64Array([1, 0, 0]),
      new Float64Array([0, 1, 0]),
    ];
    const embedding = new Float64Array([1, 0, 0]);
    const base = [1, 1];
    const biased = applyLanguageBias(base, psi, centers, embedding, 0.5);
    expect(biased[0]).toBeLessThan(biased[1]);
  });
});

