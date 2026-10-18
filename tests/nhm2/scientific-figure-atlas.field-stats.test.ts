import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { validateNhm2ScientificFigureFidelity } from "../../tools/nhm2/validate-scientific-figure-fidelity.js";
import { ensureScientificAtlasRendered, loadScientificAtlasManifest, resolveRepoPath } from "./scientific-figure-atlas.test-utils.js";

describe("NHM2 scientific figure atlas field statistics", () => {
  it("passes the fidelity validator", () => {
    const manifestPath = ensureScientificAtlasRendered();
    expect(validateNhm2ScientificFigureFidelity(manifestPath)).toEqual([]);
  });

  it("writes field-stat sidecars for scalar heatmaps", () => {
    const manifest = loadScientificAtlasManifest();
    const scalarFigures = manifest.figures.filter((figure) => figure.kind === "field_slice");
    expect(scalarFigures.length).toBeGreaterThan(0);
    for (const figure of scalarFigures) {
      expect(figure.fieldStatsJson).toBeTruthy();
      const statsPath = resolveRepoPath(figure.fieldStatsJson!);
      expect(fs.existsSync(statsPath)).toBe(true);
      const stats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
      const entries = Array.isArray(stats) ? stats : [stats];
      for (const entry of entries) {
        expect(entry.field).toBeTruthy();
        expect(entry.rawMin).toMatch(/e[+-]\d+|0\.000e\+0/i);
        expect(entry.rawMax).toMatch(/e[+-]\d+|0\.000e\+0/i);
        expect(entry.sourceHash).toMatch(/^[a-f0-9]{64}$/);
        expect(entry.tickLabels.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
