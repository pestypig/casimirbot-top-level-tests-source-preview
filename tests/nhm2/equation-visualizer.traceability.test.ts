import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadEquationVisualizerManifest, resolveRepoPath } from "./equation-visualizer.test-utils.js";

describe("NHM2 equation visualizer traceability", () => {
  it("traces every output to the equation map, node, form, source data, and preset", () => {
    const manifest = loadEquationVisualizerManifest();
    expect(manifest.equationMap.sha256).toMatch(/^[a-f0-9]{64}$/);
    for (const output of manifest.outputs) {
      expect(output.equationNodeId).toBeTruthy();
      expect(output.computableFormId).toBeTruthy();
      expect(fs.existsSync(resolveRepoPath(output.outputPng))).toBe(true);
      expect(fs.existsSync(resolveRepoPath(output.outputSvg!))).toBe(true);
      expect(fs.existsSync(resolveRepoPath(output.sourceDataJson))).toBe(true);
      expect(fs.existsSync(resolveRepoPath(output.vegaSpecJson!))).toBe(true);
      expect(fs.existsSync(resolveRepoPath(output.visualizerPresetJson))).toBe(true);
    }
  });

  it("records variable sources and repo artifact hashes in source-data JSON", () => {
    const manifest = loadEquationVisualizerManifest();
    for (const output of manifest.outputs) {
      const source = JSON.parse(fs.readFileSync(resolveRepoPath(output.sourceDataJson), "utf8"));
      expect(source.variables.length).toBeGreaterThan(0);
      for (const variable of source.variables) {
        expect(variable.name).toBeTruthy();
        expect(variable.source).toBeTruthy();
        expect(variable.units).toBeTruthy();
        if (variable.source === "repo_artifact") expect(variable.artifactHash).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
});
