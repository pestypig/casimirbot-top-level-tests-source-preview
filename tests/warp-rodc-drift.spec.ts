import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildWarpRodcDriftReport,
  runWarpRodcDriftReport,
} from "../scripts/warp-rodc-drift-report";
import type { WarpRodcSnapshotV1 } from "../shared/warp-rodc-contract";

const makeArtifact = (overrides?: Partial<WarpRodcSnapshotV1>): WarpRodcSnapshotV1 => ({
  artifactType: "warp_rodc_snapshot/v1",
  artifactFamily: "warp-york-control-family",
  generatedOn: "2026-03-30",
  generatedAt: "2026-03-30T00:00:00.000Z",
  boundaryStatement: "boundary",
  contract: {
    id: "york_diagnostic_contract",
    version: 1,
    lane_id: "lane_a_eulerian_comoving_theta_minus_trk",
    classification_scope: "diagnostic_local_only",
  },
  inputs: {
    metricT00Ref: "warp.metric.T00.natario_sdf.shift",
    metricT00Source: "metric",
    shape_function_id: "nhm2_natario_sdf_shell_v1",
    warpFieldType: "natario_sdf",
    dims: [48, 48, 48],
    source_case_id: "nhm2_certified",
  },
  provenance: {
    repo_commit_sha: "eadb6718",
    serviceVersion: "v1",
    buildHash: "build",
    runtimeInstanceId: "runtime",
    timestamp_ms: 1234,
    sourceAuditArtifact: "artifacts/research/full-solve/warp-york-control-family-proof-pack-latest.json",
  },
  evidence_hashes: {
    metric_ref_hash: "metric-ref",
    theta_channel_hash: "theta-hash",
    k_trace_hash: "ktrace-hash",
    slice_hashes_by_view: {
      "york-surface-3p1": "slice-xz",
      "york-surface-rho-3p1": "slice-rho",
    },
  },
  feature_vector: {
    theta_abs_max_raw: 1.1,
    theta_abs_max_display: 1.05,
    positive_count_xz: 10,
    negative_count_xz: 9,
    support_overlap_pct: 3.6,
    near_zero_theta: true,
    signed_lobe_summary: null,
  },
  distance: {
    to_alcubierre: 0.13,
    to_natario: 0.001,
    to_other_baselines: {},
    winning_reference: "natario_control",
    reference_margin: 0.129,
  },
  policy: {
    distance_metric: "weighted_normalized_l1",
    normalization_method: "max_abs_reference_target_with_floor",
    reference_margin_min: 0.08,
    reference_match_threshold: 0.5,
    distinctness_threshold: 0.5,
    feature_weights: {
      theta_abs_max_raw: 1.2,
    },
  },
  robustness: {
    enabled: true,
    totalVariants: 5,
    evaluatedVariants: 5,
    dominantFraction: 1,
    dominantVerdict: "nhm2_low_expansion_family",
    stableVerdict: "nhm2_low_expansion_family",
    stabilityStatus: "stable_low_expansion_like",
    stable_fraction_min: 0.8,
    marginal_fraction_min: 0.6,
    verdictCounts: {
      nhm2_low_expansion_family: 5,
      nhm2_alcubierre_like_family: 0,
      nhm2_distinct_family: 0,
      inconclusive: 0,
    },
  },
  preconditions: {
    controlsIndependent: true,
    allRequiredViewsRendered: true,
    provenanceHashesPresent: true,
    runtimeStatusProvenancePresent: true,
    readyForFamilyVerdict: true,
  },
  cross_lane: {
    baseline_lane_id: "lane_a_eulerian_comoving_theta_minus_trk",
    alternate_lane_id: "lane_b_alternate_observer_pending",
    cross_lane_status: "lane_comparison_inconclusive",
  },
  verdict: {
    family_label: "nhm2_low_expansion_family",
    status: "congruent",
    stability: "stable",
  },
  notes: ["note"],
  checksum: "checksum",
  ...overrides,
});

describe("warp rodc drift report", () => {
  it("reports stable when reduced-order artifacts are unchanged", () => {
    const latest = makeArtifact({ generatedAt: "2026-03-31T00:00:00.000Z", checksum: "new-checksum" });
    const previous = makeArtifact();
    const report = buildWarpRodcDriftReport({
      latestArtifact: latest,
      previousArtifact: previous,
      latestArtifactPath: "artifacts/research/full-solve/warp-york-control-family-rodc-latest.json",
      previousArtifactPath: "artifacts/research/full-solve/warp-york-control-family-rodc-2026-03-30.json",
    });

    expect(report.summary.status).toBe("stable");
    expect(report.featureDrift.totalChanged).toBe(0);
    expect(report.distanceDrift.totalChanged).toBe(0);
    expect(report.verdict.changed).toBe(false);
  });

  it("reports drift when verdict, features, or hashes change", () => {
    const previous = makeArtifact();
    const latest = makeArtifact({
      feature_vector: {
        ...previous.feature_vector,
        theta_abs_max_raw: 4.2,
      },
      distance: {
        ...previous.distance,
        to_alcubierre: 0.02,
        to_natario: 0.3,
        winning_reference: "alcubierre_control",
        reference_margin: 0.28,
      },
      evidence_hashes: {
        ...previous.evidence_hashes,
        theta_channel_hash: "theta-hash-new",
      },
      verdict: {
        family_label: "nhm2_alcubierre_like_family",
        status: "congruent",
        stability: "marginal",
      },
    });
    const report = buildWarpRodcDriftReport({
      latestArtifact: latest,
      previousArtifact: previous,
      latestArtifactPath: "latest.json",
      previousArtifactPath: "previous.json",
    });

    expect(report.summary.status).toBe("drifted");
    expect(report.featureDrift.totalChanged).toBeGreaterThan(0);
    expect(report.distanceDrift.totalChanged).toBeGreaterThan(0);
    expect(report.evidenceHashChanges.theta_channel_hash.changed).toBe(true);
    expect(report.verdict.changed).toBe(true);
  });

  it("reports contract drift when the lane or contract changes", () => {
    const previous = makeArtifact();
    const latest = makeArtifact({
      contract: {
        ...previous.contract,
        lane_id: "lane_b_alternate_observer_pending",
      },
    });
    const report = buildWarpRodcDriftReport({
      latestArtifact: latest,
      previousArtifact: previous,
      latestArtifactPath: "latest.json",
      previousArtifactPath: "previous.json",
    });

    expect(report.summary.status).toBe("contract_drift");
    expect(report.contract.changed).toBe(true);
  });

  it("reports inconclusive when no previous artifact is available", () => {
    const latest = makeArtifact();
    const report = buildWarpRodcDriftReport({
      latestArtifact: latest,
      previousArtifact: null,
      latestArtifactPath: "latest.json",
      previousArtifactPath: null,
    });

    expect(report.summary.status).toBe("inconclusive");
    expect(report.previousArtifactPath).toBeNull();
  });

  it("ignores a same-run dated copy when auto-selecting the previous artifact", () => {
    const tempRoot = path.join(process.cwd(), "artifacts", "tmp-tests");
    fs.mkdirSync(tempRoot, { recursive: true });
    const tempDir = fs.mkdtempSync(
      path.join(tempRoot, "warp-rodc-drift-"),
    );
    try {
      const latestArtifactPath = path.join(
        tempDir,
        "warp-york-control-family-rodc-latest.json",
      );
      const datedArtifactPath = path.join(
        tempDir,
        "warp-york-control-family-rodc-2026-03-30.json",
      );
      const outJsonPath = path.join(tempDir, "warp-rodc-drift.json");
      const latestJsonPath = path.join(tempDir, "warp-rodc-drift-latest.json");
      const outMdPath = path.join(tempDir, "warp-rodc-drift.md");
      const latestMdPath = path.join(tempDir, "warp-rodc-drift-latest.md");
      const latest = makeArtifact({
        checksum: "same-run-checksum",
        generatedAt: "2026-03-30T07:09:39.733Z",
      });
      const serialized = `${JSON.stringify(latest, null, 2)}\n`;
      fs.writeFileSync(latestArtifactPath, serialized);
      fs.writeFileSync(datedArtifactPath, serialized);

      const result = runWarpRodcDriftReport({
        latestArtifactPath,
        outJsonPath,
        latestJsonPath,
        outMdPath,
        latestMdPath,
      });

      expect(result.report.summary.status).toBe("inconclusive");
      expect(result.report.previousArtifactPath).toBeNull();
      expect(result.report.latestArtifactPath).toMatch(
        /^artifacts\/tmp-tests\/warp-rodc-drift-/,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
