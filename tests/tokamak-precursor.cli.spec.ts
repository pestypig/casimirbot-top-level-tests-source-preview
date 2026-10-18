import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTokamakPrecursorDataset, runTokamakPrecursorDataset } from "../tools/tokamak-precursor-runner";

const DATASET_PATH = path.resolve(process.cwd(), "datasets", "tokamak-rz-precursor.fixture.json");
const describeWithDataset = fs.existsSync(DATASET_PATH) ? describe : describe.skip;

describeWithDataset("tokamak precursor CLI", () => {
  it("computes a deterministic precursor report with AUC", async () => {
    const dataset = await loadTokamakPrecursorDataset(DATASET_PATH);
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokamak-precursor-"));
    const report = runTokamakPrecursorDataset(dataset, {
      dataset_path: DATASET_PATH,
      score_key: "k_combo_v1",
      artifacts: { dir: artifactDir, write_culpability: true },
    });

    expect(report.score_key).toBe("k_combo_v1");
    expect(report.frames.length).toBe(dataset.frames.length);
    expect(report.frames[0]?.metrics.k2).toBeDefined();
    expect(report.frames[0]?.metrics.fragmentation_rate).toBeDefined();
    expect(report.frames[0]?.metrics.bands?.edge).toBeDefined();
    expect(report.frames[0]?.metrics.coherence_budget?.channels).toBeDefined();
    if (report.frames[0]?.metrics.bands?.edge && report.frames[0]?.metrics.bands?.core) {
      expect(report.frames[0]?.metrics.edge_core_decoupling_k2).toBeDefined();
    }
    expect(report.ridge_survival).toBeDefined();
    expect(report.phase_lock?.scan.length ?? 0).toBeGreaterThan(0);
    expect(report.phase_lock?.f_star_hz).toBeDefined();
    if (report.phase_lock?.detuning) {
      expect(report.phase_lock.detuning.series.length).toBeGreaterThan(0);
    }
    expect(report.uncertainty?.auc?.bootstrap?.samples ?? 0).toBeGreaterThan(0);
    expect(report.feature_sensitivity?.ablation).toBeDefined();
    expect(report.domain_shift?.scenarios.length ?? 0).toBeGreaterThan(0);
    expect(report.hazard_forecast?.series.length ?? 0).toBeGreaterThan(0);
    expect(report.culpability?.entries.length ?? 0).toBeGreaterThan(0);
    expect(report.culpability_artifact).toBeDefined();
    expect(report.culpability_artifact_hash).toBeDefined();
    if (report.culpability_artifact_path) {
      expect(fs.existsSync(report.culpability_artifact_path)).toBe(true);
    }
    expect(report.normalization?.ridge_survival?.total_tracks ?? 0).toBeGreaterThanOrEqual(0);
    expect(report.control_experiments?.scenarios.length ?? 0).toBeGreaterThan(0);
    expect(report.roc_curve.length).toBeGreaterThan(0);
    expect(report.auc).not.toBeNull();
    expect(report.auc ?? 0).toBeGreaterThan(0.5);
  });
});
