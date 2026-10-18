import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TokamakPrecursorDataset } from "@shared/tokamak-precursor";
import { runTokamakRobustnessSuite } from "../tools/robustness-runner";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "datasets",
  "tokamak-rz-precursor.fixture.json",
);
const describeWithFixture = fs.existsSync(FIXTURE_PATH) ? describe : describe.skip;

describeWithFixture("tokamak robustness runner", () => {
  it("produces deterministic reports and bounded drift", () => {
    const dataset = TokamakPrecursorDataset.parse(
      JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")),
    );
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokamak-robustness-"));
    const outputPath = path.join(tmpDir, "robustness.json");
    const report = runTokamakRobustnessSuite(dataset, {
      artifacts: { output_path: outputPath },
      seed: "fixture-seed",
      downsample_factor: 2,
      mask_hole_fraction: 0.05,
      noise_std_fraction: 0.02,
      score_key: "k_combo_v1",
    });

    expect(report.schema_version).toBe("tokamak_robustness_report/1");
    expect(report.baseline.frame_count).toBe(dataset.frames.length);
    expect(fs.existsSync(outputPath)).toBe(true);

    const noise = report.scenarios.find((scenario) => scenario.kind === "noise");
    const noiseLoss = noise?.info_loss?.score_rel_mean;
    expect(noiseLoss).toBeDefined();
    expect(noiseLoss as number).toBeLessThanOrEqual(0.5);

    const mask = report.scenarios.find((scenario) => scenario.kind === "mask_holes");
    const maskLoss = mask?.info_loss?.score_rel_mean;
    expect(maskLoss).toBeDefined();
    expect(maskLoss as number).toBeLessThanOrEqual(0.5);

    const reportAgain = runTokamakRobustnessSuite(dataset, {
      artifacts: { output_path: path.join(tmpDir, "robustness-2.json") },
      seed: "fixture-seed",
      downsample_factor: 2,
      mask_hole_fraction: 0.05,
      noise_std_fraction: 0.02,
      score_key: "k_combo_v1",
    });
    expect(reportAgain.report_hash).toBe(report.report_hash);
  });
});
