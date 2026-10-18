import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getAxisTemplate, validateAxisTemplateForMode } from "../../scripts/equations/equation-axis-templates.js";
import { sampleEquationNode } from "../../scripts/equations/equation-sampler.js";
import { loadEquationMap } from "../../scripts/equations/load-equation-map.js";
import { resolveEquationNode } from "../../scripts/equations/equation-node-resolver.js";
import { loadEquationVisualizerPresets, loadEquationVisualizerManifest, resolveRepoPath } from "./equation-visualizer.test-utils.js";

describe("NHM2 equation visualizer axis templates", () => {
  it("validates preset axis templates", () => {
    const map = loadEquationMap();
    const presets = loadEquationVisualizerPresets();
    for (const preset of presets.presets) {
      const resolved = resolveEquationNode(map, preset);
      const template = getAxisTemplate(resolved.form, preset.axisTemplateId);
      expect(validateAxisTemplateForMode(template)).toEqual([]);
    }
  });

  it("1D sweeps and worldline plots produce bounded samples", () => {
    const map = loadEquationMap();
    const presets = loadEquationVisualizerPresets();
    for (const preset of presets.presets.filter((entry) => entry.graphMode === "one_dimensional_sweep" || entry.graphMode === "worldline_sampling_plot")) {
      const resolved = resolveEquationNode(map, preset);
      const sample = sampleEquationNode(resolved);
      expect(sample.rows.length).toBeLessThanOrEqual(resolved.form.domainPolicy.maxSamples);
      expect(sample.rows.length).toBeGreaterThan(1);
    }
  });

  it("tensor matrix marks missing cells as missing, not zero", () => {
    const manifest = loadEquationVisualizerManifest();
    const output = manifest.outputs.find((entry) => entry.id === "same_basis_residual_component");
    const source = JSON.parse(fs.readFileSync(resolveRepoPath(output!.sourceDataJson), "utf8"));
    const missing = source.rows.filter((row: any) => row.status === "missing");
    expect(missing.length).toBeGreaterThan(0);
    for (const row of missing) expect(row.value).toBeNull();
  });
});
