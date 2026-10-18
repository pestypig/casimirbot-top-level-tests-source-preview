import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScientificAtlasManifest, resolveRepoPath } from "./scientific-figure-atlas.test-utils.js";

describe("NHM2 scientific figure atlas scalar legends", () => {
  it("uses independent color scales for lapse and shift panels", () => {
    const manifest = loadScientificAtlasManifest();
    const figure = manifest.figures.find((entry) => entry.id === "03_lapse_shift_grid_slice");
    expect(figure?.outputSvg).toBeTruthy();
    const specPath = resolveRepoPath(figure!.outputSvg!).replace(/\.svg$/i, ".spec.json");
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    expect(spec.resolve?.scale?.color).toBe("independent");
    const stats = JSON.parse(fs.readFileSync(resolveRepoPath(figure!.fieldStatsJson!), "utf8"));
    const fields = new Set(stats.map((entry: any) => entry.field));
    expect(fields).toEqual(new Set(["alpha", "alpha_minus_1", "beta_x", "beta_magnitude"]));
  });

  it("uses a zero-centered signed theta domain with readable scientific tick labels", () => {
    const manifest = loadScientificAtlasManifest();
    const figure = manifest.figures.find((entry) => entry.id === "04_theta_signed_diagnostic");
    const stats = JSON.parse(fs.readFileSync(resolveRepoPath(figure!.fieldStatsJson!), "utf8"))[0];
    expect(stats.normalization).toBe("signed_zero_centered");
    expect(stats.colorDomain[0]).toBeCloseTo(-stats.colorDomain[1], 12);
    expect(new Set(stats.tickLabels).size).toBeGreaterThanOrEqual(3);
    expect(stats.tickLabels.join(" ")).toMatch(/e[+-]\d+/i);
    expect(typeof stats.nearZeroEpsilon).toBe("number");
  });
});
