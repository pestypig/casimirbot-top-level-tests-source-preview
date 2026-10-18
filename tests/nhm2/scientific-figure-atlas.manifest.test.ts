import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { validateNhm2ScientificFigureAtlas } from "../../tools/nhm2/validate-scientific-figure-atlas.js";
import { ensureScientificAtlasRendered, loadScientificAtlasManifest, resolveRepoPath } from "./scientific-figure-atlas.test-utils.js";

describe("NHM2 scientific figure atlas manifest", () => {
  it("renders atlas into temp output and validates manifest", () => {
    const manifestPath = ensureScientificAtlasRendered();
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(validateNhm2ScientificFigureAtlas(manifestPath)).toEqual([]);
  });

  it("records every output and source-data file", () => {
    const manifest = loadScientificAtlasManifest();
    expect(manifest.figures.length).toBeGreaterThanOrEqual(15);
    for (const figure of manifest.figures) {
      expect(fs.existsSync(resolveRepoPath(figure.outputPng))).toBe(true);
      expect(fs.existsSync(resolveRepoPath(figure.sourceDataJson))).toBe(true);
      if (figure.outputSvg) expect(fs.existsSync(resolveRepoPath(figure.outputSvg))).toBe(true);
    }
  });

  it("keeps source hashes and claim locks intact", () => {
    const manifest = loadScientificAtlasManifest();
    expect(Object.keys(manifest.inputHashes).length).toBeGreaterThan(0);
    for (const hash of Object.values(manifest.inputHashes)) expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.claimBoundary).toEqual({
      validationClaimAllowed: false,
      physicalMechanismClaimAllowed: false,
      promotionAllowed: false,
    });
    for (const figure of manifest.figures) {
      expect(figure.claimBoundary.validationClaimAllowed).toBe(false);
      expect(figure.claimBoundary.physicalMechanismClaimAllowed).toBe(false);
      expect(figure.claimBoundary.promotionAllowed).toBe(false);
      expect(figure.claimBoundary.doesValidateNHM2).toBe(false);
    }
  });
});
