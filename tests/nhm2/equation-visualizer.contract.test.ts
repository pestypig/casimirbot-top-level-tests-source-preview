import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateNhm2EquationVisualizerManifest,
  validateNhm2EquationVisualizerPresetFile,
} from "../../shared/contracts/nhm2-equation-visualizer.v1.js";
import { validateEquationVisualizerPresets } from "../../tools/nhm2/validate-equation-visualizer-presets.js";
import { validateEquationVisualizerArtifact } from "../../tools/nhm2/validate-equation-visualizer-artifact.js";
import { ensureEquationVisualizerRendered, loadEquationVisualizerManifest, loadEquationVisualizerPresets } from "./equation-visualizer.test-utils.js";

describe("NHM2 equation visualizer contracts", () => {
  it("validates presets against the equation map", () => {
    const presets = loadEquationVisualizerPresets();
    expect(validateNhm2EquationVisualizerPresetFile(presets)).toEqual([]);
    expect(validateEquationVisualizerPresets()).toEqual([]);
  });

  it("renders demo artifacts and validates the manifest", () => {
    const manifestPath = ensureEquationVisualizerRendered();
    const manifest = loadEquationVisualizerManifest();
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(validateNhm2EquationVisualizerManifest(manifest)).toEqual([]);
    expect(validateEquationVisualizerArtifact(manifestPath)).toEqual([]);
    expect(manifest.outputs.length).toBeGreaterThanOrEqual(5);
  });
});
