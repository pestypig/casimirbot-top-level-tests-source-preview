import { describe, expect, it } from "vitest";
import { autoMatchTexture } from "@/lib/noise/kb-autoselect";
import type { BarWindow, KBTexture, Original } from "@/types/noise-gens";

const mockTextures: KBTexture[] = [
  {
    id: "fixture_a",
    name: "Fixture A",
    barkProfile: Array.from({ length: 24 }, (_, index) => 0.1 + index * 0.01),
  },
  {
    id: "fixture_b",
    name: "Fixture B",
    barkProfile: Array.from({ length: 24 }, (_, index) => 0.2 + index * 0.008),
  },
  {
    id: "fixture_c",
    name: "Fixture C",
    barkProfile: Array.from({ length: 24 }, (_, index) => 0.05 + index * 0.012),
  },
];

const baseOriginal: Original = {
  id: "demo-track-001",
  title: "Demo Track",
  artist: "Helix Unit",
  listens: 1200,
  duration: 245,
};

const baseWindow: BarWindow = {
  startBar: 1,
  endBar: 5,
};

describe("kb auto-match helper", () => {
  it("returns deterministic match for identical inputs", () => {
    const first = autoMatchTexture({
      original: baseOriginal,
      textures: mockTextures,
      window: baseWindow,
    });
    const second = autoMatchTexture({
      original: baseOriginal,
      textures: mockTextures,
      window: baseWindow,
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.kb.id).toBe(second?.kb.id);
    expect(first?.confidence).toBeCloseTo(second?.confidence ?? 0, 5);
  });

  it("changes selection when window offsets change", () => {
    const first = autoMatchTexture({
      original: baseOriginal,
      textures: mockTextures,
      window: { startBar: 1, endBar: 5 },
    });
    const shifted = autoMatchTexture({
      original: baseOriginal,
      textures: mockTextures,
      window: { startBar: 5, endBar: 9 },
    });
    if (mockTextures.length > 1) {
      expect(first?.kb.id).not.toBe(shifted?.kb.id);
    }
  });

  it("returns null when textures are missing", () => {
    const match = autoMatchTexture({
      original: baseOriginal,
      textures: [],
      window: baseWindow,
    });
    expect(match).toBeNull();
  });
});
