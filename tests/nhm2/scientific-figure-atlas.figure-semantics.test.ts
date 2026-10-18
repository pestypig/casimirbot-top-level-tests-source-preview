import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScientificAtlasManifest, resolveRepoPath } from "./scientific-figure-atlas.test-utils.js";

describe("NHM2 scientific figure atlas semantics", () => {
  it("keeps ledger and audit language out of geometry figures", () => {
    const manifest = loadScientificAtlasManifest();
    for (const figure of manifest.figures.filter((entry) => entry.family === "geometry")) {
      expect(`${figure.title} ${figure.caption}`).not.toMatch(/ledger|certificate|provenance|claim-lock|claim lock|pass\/fail/i);
    }
  });

  it("keeps evidence and math closure off the hull", () => {
    const manifest = loadScientificAtlasManifest();
    for (const figure of manifest.figures.filter((entry) => entry.family === "evidence_ledger" || entry.family === "math_closure")) {
      expect(figure.hullOverlayPolicy.usesHullGeometry).toBe(false);
      expect(figure.hullOverlayPolicy.permitsLedgerOverlayOnHull).toBe(false);
    }
  });

  it("uses chart, matrix, worldline, DAG, or table encodings for non-spatial figures", () => {
    const manifest = loadScientificAtlasManifest();
    const allowed = new Set(["vega_lite", "graphviz_wasm", "svg_table"]);
    for (const figure of manifest.figures.filter((entry) => entry.family === "math_closure" || entry.family === "evidence_ledger")) {
      expect(allowed.has(figure.visualEncoding.renderer)).toBe(true);
    }
  });

  it("marks tile layout as representative and preserves cavity schedule counts", () => {
    const manifest = loadScientificAtlasManifest();
    const tile = manifest.figures.find((entry) => entry.id === "07_representative_tile_layout");
    expect(tile?.caption).toMatch(/Representative Casimir tile-sector layout/i);
    expect(tile?.caption).toMatch(/layout\/process layers/i);
    expect(tile?.caption).not.toMatch(/field strength|energy intensity|curvature intensity/i);

    const schedule = manifest.figures.find((entry) => entry.id === "06_sector_schedule_timeline");
    const source = JSON.parse(fs.readFileSync(resolveRepoPath(schedule!.sourceDataJson), "utf8"));
    const cavity = JSON.parse(fs.readFileSync("configs/needle-hull-mark2-cavity-contract.v1.json", "utf8"));
    expect(source.data.sectorCount).toBe(cavity.geometry.sectorCount);
    expect(source.data.concurrentSectors).toBe(cavity.geometry.concurrentSectors);
  });
});
