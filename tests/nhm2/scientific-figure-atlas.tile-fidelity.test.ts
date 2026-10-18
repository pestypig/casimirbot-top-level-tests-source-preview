import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_TILE_LAYERS } from "../../scripts/figures/nhm2/render-faithful-tile-layout.js";
import { loadScientificAtlasManifest, resolveRepoPath } from "./scientific-figure-atlas.test-utils.js";

describe("NHM2 scientific figure atlas tile fidelity", () => {
  it("records required representative tile process layers", () => {
    const manifest = loadScientificAtlasManifest();
    const figure = manifest.figures.find((entry) => entry.id === "07_representative_tile_layout");
    const source = JSON.parse(fs.readFileSync(resolveRepoPath(figure!.sourceDataJson), "utf8"));
    expect(source.representative).toBe(true);
    expect(source.requiredLayers).toEqual([...REQUIRED_TILE_LAYERS]);
  });

  it("keeps tile colors as process/layout layers, not physical intensity", () => {
    const manifest = loadScientificAtlasManifest();
    const figure = manifest.figures.find((entry) => entry.id === "07_representative_tile_layout");
    expect(figure?.caption).toMatch(/process mask|layout\/process/i);
    expect(figure?.caption).not.toMatch(/field strength|energy intensity|curvature intensity|spacetime intensity/i);
  });
});
