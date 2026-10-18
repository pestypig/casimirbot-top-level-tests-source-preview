import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runWarpRenderCongruenceBenchmark } from "../scripts/warp-render-congruence-benchmark";

type WarpRodcBenchmarkArtifact = {
  artifactType: string;
  artifactFamily: string;
  contract: {
    id: string;
    lane_id: string;
    classification_scope: string;
  };
  evidence_hashes: {
    other_hashes?: Record<string, string | null>;
  };
  verdict: {
    family_label: string;
    status: string;
    stability: string;
  };
  cross_lane: {
    cross_lane_status: string;
  };
  preconditions: {
    readyForFamilyVerdict: boolean;
  };
};

describe("warp render congruence benchmark RODC output", () => {
  it("emits a non-York reduced-order artifact using the shared RODC contract", () => {
    const tempRoot = path.join(process.cwd(), "artifacts", "tmp-tests");
    fs.mkdirSync(tempRoot, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(tempRoot, "warp-render-rodc-"));
    try {
      const debugLogPath = path.join(tempDir, "debug.jsonl");
      const integrityPath = path.join(tempDir, "integrity.json");
      const outJsonPath = path.join(tempDir, "benchmark.json");
      const outMdPath = path.join(tempDir, "benchmark.md");
      const latestJsonPath = path.join(tempDir, "benchmark-latest.json");
      const latestMdPath = path.join(tempDir, "benchmark-latest.md");
      const rodcOutJsonPath = path.join(tempDir, "benchmark-rodc.json");
      const rodcLatestJsonPath = path.join(tempDir, "benchmark-rodc-latest.json");

      fs.writeFileSync(
        debugLogPath,
        `${JSON.stringify({
          id: "evt-1",
          atMs: 1,
          isoTime: "2026-03-30T00:00:00.000Z",
          category: "render_vs_metric_displacement",
          expected: {
            metric_radius_z_m: 2,
            metric_radius_x_m: 2,
            metric_radius_y_m: 2,
          },
          delta: {
            rms_z_residual_m: 0.05,
            max_abs_z_residual_m: 0.06,
            hausdorff_m: 0.2,
          },
          measurements: {
            integralStatus: "pass",
          },
        })}\n`,
      );
      fs.writeFileSync(
        integrityPath,
        `${JSON.stringify({
          final_parity_verdict: "PASS",
          rubric: {
            mercury_observable: { pass: true },
            lensing_observable: { pass: true },
            frame_dragging_observable: { pass: true },
            shapiro_observable: { pass: true },
          },
        }, null, 2)}\n`,
      );

      const result = runWarpRenderCongruenceBenchmark({
        debugLogPath,
        integrityPath,
        outJsonPath,
        outMdPath,
        latestJsonPath,
        latestMdPath,
        rodcOutJsonPath,
        rodcLatestJsonPath,
        minEvents: 1,
      });

      expect(result.ok).toBe(true);
      expect(fs.existsSync(rodcLatestJsonPath)).toBe(true);

      const artifact = JSON.parse(
        fs.readFileSync(rodcLatestJsonPath, "utf8"),
      ) as WarpRodcBenchmarkArtifact;
      expect(artifact.artifactType).toBe("warp_rodc_snapshot/v1");
      expect(artifact.artifactFamily).toBe("warp-render-congruence-benchmark");
      expect(artifact.contract.id).toBe("warp_render_congruence_benchmark_contract");
      expect(artifact.contract.lane_id).toBe("render_metric_parity_lane_a");
      expect(artifact.contract.classification_scope).toBe("diagnostic_local_only");
      expect(artifact.verdict.family_label).toBe("render_metric_parity_aligned");
      expect(artifact.verdict.status).toBe("congruent");
      expect(artifact.verdict.stability).toBe("not_evaluated");
      expect(artifact.cross_lane.cross_lane_status).toBe("single_lane_benchmark");
      expect(artifact.preconditions.readyForFamilyVerdict).toBe(true);
      expect(artifact.evidence_hashes.other_hashes?.debug_log_sha256).toBeTruthy();
      expect(artifact.evidence_hashes.other_hashes?.integrity_suite_sha256).toBeTruthy();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
