import { describe, expect, it } from "vitest";
import { buildAtomicOrbitalCloud } from "../client/src/lib/atomic-orbitals";

describe("atomic orbital claim tier contract", () => {
  it("tags quantum orbital outputs as diagnostic simulation and non-certifying", () => {
    const cloud = buildAtomicOrbitalCloud("quantum", { n: 2, l: 1, m: 0 }, { seed: 42, sampleCount: 128 });
    expect(cloud.mode).toBe("quantum");
    expect(cloud.claim_tier).toBe("diagnostic");
    expect(cloud.provenance_class).toBe("simulation");
    expect(cloud.certifying).toBe(false);
    expect(cloud.points.length).toBe(128);
  });

  it("tags classical orbital outputs as diagnostic proxy and non-certifying", () => {
    const cloud = buildAtomicOrbitalCloud("classical", { n: 3, l: 1, m: 1 }, { seed: 7, sampleCount: 192 });
    expect(cloud.mode).toBe("classical");
    expect(cloud.claim_tier).toBe("diagnostic");
    expect(cloud.provenance_class).toBe("proxy");
    expect(cloud.certifying).toBe(false);
    expect(cloud.points.length).toBe(192);
  });

  it("is deterministic for same mode and seed", () => {
    const a = buildAtomicOrbitalCloud("quantum", { n: 2, l: 1, m: 0 }, { seed: 99, sampleCount: 96 });
    const b = buildAtomicOrbitalCloud("quantum", { n: 2, l: 1, m: 0 }, { seed: 99, sampleCount: 96 });
    expect(a).toEqual(b);
  });
});
