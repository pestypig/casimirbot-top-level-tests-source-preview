import { describe, expect, it } from "vitest";
import {
  rankEquationBenchmarkSummaries,
  recommendEquationBenchmarkProfile,
  type EquationBenchmarkMatrixSummary,
} from "../scripts/lib/helix-ask-equation-benchmark-matrix";

describe("helix ask equation benchmark matrix recommendation", () => {
  const summaries: EquationBenchmarkMatrixSummary[] = [
    {
      name: "baseline",
      total: 10,
      pass: 7,
      fail: 3,
      passRate: 0.7,
      avgScore: 68,
      p95LatencyMs: 18000,
      failureCount: 8,
    },
    {
      name: "profile_a",
      total: 10,
      pass: 8,
      fail: 2,
      passRate: 0.8,
      avgScore: 72,
      p95LatencyMs: 22000,
      failureCount: 6,
    },
    {
      name: "profile_b",
      total: 10,
      pass: 8,
      fail: 2,
      passRate: 0.8,
      avgScore: 72,
      p95LatencyMs: 15000,
      failureCount: 6,
    },
  ];

  it("ranks by quality first, then lower latency on ties", () => {
    const ranked = rankEquationBenchmarkSummaries(summaries);
    expect(ranked[0]?.name).toBe("profile_b");
    expect(ranked[1]?.name).toBe("profile_a");
    expect(ranked[2]?.name).toBe("baseline");
  });

  it("returns best profile and baseline deltas", () => {
    const recommendation = recommendEquationBenchmarkProfile({
      summaries,
      baselineName: "baseline",
    });
    expect(recommendation).toBeTruthy();
    expect(recommendation?.best.name).toBe("profile_b");
    expect(recommendation?.baseline?.name).toBe("baseline");
    expect(recommendation?.deltasFromBaseline?.passRateDelta).toBe(0.1);
    expect(recommendation?.deltasFromBaseline?.avgScoreDelta).toBe(4);
    expect(recommendation?.deltasFromBaseline?.p95LatencyDeltaMs).toBe(-3000);
  });
});
