import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokamakRzEnergyField } from "../server/services/essence/tokamak-energy-adapter";
import { runTokamakSyntheticDiagnostics } from "../server/services/physics/tokamak-synthetic-diagnostics";

type FixtureManifest = {
  entries: Array<{ input: Record<string, unknown> }>;
};

const FIXTURE_MANIFEST_PATH = path.resolve(
  process.cwd(),
  "datasets",
  "tokamak-rz-energy.fixture.json",
);
const describeWithFixture = fs.existsSync(FIXTURE_MANIFEST_PATH) ? describe : describe.skip;

describeWithFixture("tokamak synthetic diagnostics", () => {
  it("generates sensor diagnostics and info-loss metrics", () => {
    const manifest = JSON.parse(
      fs.readFileSync(FIXTURE_MANIFEST_PATH, "utf8"),
    ) as FixtureManifest;
    const entry = manifest.entries[0];
    const field = buildTokamakRzEnergyField(entry.input as any);
    const report = runTokamakSyntheticDiagnostics({
      schema_version: "tokamak_synthetic_input/1",
      device_id: field.device_id,
      shot_id: field.shot_id,
      timestamp_iso: field.timestamp_iso,
      grid: field.grid,
      frame: field.frame,
      separatrix_mask: field.separatrix_mask,
      u_total: field.components.u_total_Jm3,
      score_key: "k2",
      config: {
        bolometry_chords: 3,
        interferometry_chords: 3,
        probe_count: 4,
      },
    });

    expect(report.sensors.bolometry.length).toBe(3);
    expect(report.sensors.interferometry.length).toBe(3);
    expect(report.sensors.probes.length).toBe(4);
    expect(report.truth.k_metrics.k2).toBeDefined();
    expect(report.reconstruction.k_metrics.k2).toBeDefined();
    expect(report.reconstruction.u_total_recon?.data_b64).toBeTruthy();
    expect(report.info_loss.k_metrics.k2_abs).toBeGreaterThanOrEqual(0);
    expect(report.reconstruction_mode).toBe("backprojection");
    expect(report.score_comparison?.score_key).toBe("k2");
    expect(report.score_comparison?.abs_delta).toBeGreaterThanOrEqual(0);
  });
});
