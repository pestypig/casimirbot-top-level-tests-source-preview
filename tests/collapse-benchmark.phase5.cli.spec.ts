import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadCollapseBenchmarkManifest, runCollapseBenchmarkManifest } from "../tools/collapse-benchmark-runner";

const manifestPath = path.resolve(process.cwd(), "datasets/benchmarks/collapse-benchmark.fixture.json");
const describeWithFixture = fs.existsSync(manifestPath) ? describe : describe.skip;

describeWithFixture("collapse benchmark (Phase 5): CLI + golden report", () => {
  it("emits deterministic report hash for the fixture manifest", async () => {
    const manifest = await loadCollapseBenchmarkManifest(manifestPath);
    const report = runCollapseBenchmarkManifest(manifest, {
      manifest_path: manifestPath,
      generated_at_iso: manifest.created_at,
      data_cutoff_iso: manifest.created_at,
    });

    const goldenPath = path.resolve(process.cwd(), "tests/fixtures/collapse-benchmark.report.golden.json");
    const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

    expect(report.report_hash).toBe(golden.report_hash);
    expect(report.runs.map((r) => r.run_hash)).toEqual(golden.runs.map((r: any) => r.run_hash));
    expect(report.runs[0].result.trigger_count).toBe(golden.runs[0].result.trigger_count);
    expect(report.runs[1].result.tau_source).toBe("field_estimator");
  });
});
