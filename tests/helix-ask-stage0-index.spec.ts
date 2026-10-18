import { describe, expect, it } from "vitest";
import {
  applyStage0HitRate,
  buildStage0SnapshotFromPaths,
  createStage0ScopeMatcher,
  isStage0SnapshotStale,
  queryStage0Snapshot,
} from "../server/services/helix-ask/stage0-index";

describe("helix ask stage0 index", () => {
  it("builds deterministic snapshot shape from git-style paths", () => {
    const snapshot = buildStage0SnapshotFromPaths(
      [
        "server/routes/agi.plan.ts",
        "server/routes/agi.plan.ts",
        "./docs/helix-ask-flow.md",
        "../outside.ts",
      ],
      "abc123",
      42,
    );

    expect(snapshot.version).toBe("helix-stage0/1");
    expect(snapshot.commit).toBe("abc123");
    expect(snapshot.builtAtMs).toBe(42);
    expect(snapshot.files.map((entry) => entry.filePath)).toEqual([
      "docs/helix-ask-flow.md",
      "server/routes/agi.plan.ts",
    ]);
  });

  it("returns deterministic ranked candidates for repeated queries", () => {
    const snapshot = buildStage0SnapshotFromPaths(
      [
        "server/routes/agi.plan.ts",
        "server/services/helix-ask/repo-search.ts",
        "docs/helix-ask-flow.md",
      ],
      "abc123",
    );

    const first = queryStage0Snapshot(snapshot, {
      query: "helix ask repo search",
      maxCandidates: 4,
    });
    const second = queryStage0Snapshot(snapshot, {
      query: "helix ask repo search",
      maxCandidates: 4,
    });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.some((entry) => entry.filePath.includes("repo-search.ts"))).toBe(true);
  });

  it("applies path scope matching against directories and exact files", () => {
    const matcher = createStage0ScopeMatcher(["docs", "server/routes/agi.plan.ts"]);
    expect(matcher("docs/helix-ask-flow.md")).toBe(true);
    expect(matcher("server/routes/agi.plan.ts")).toBe(true);
    expect(matcher("server/services/helix-ask/repo-search.ts")).toBe(false);
  });

  it("computes stale detection and hit rates deterministically", () => {
    const snapshot = buildStage0SnapshotFromPaths(["docs/helix-ask-flow.md"], "abc123", 1_000);
    expect(isStage0SnapshotStale(snapshot, 150_000, 120_000)).toBe(true);

    const telemetry = applyStage0HitRate(
      {
        used: true,
        shadow_only: false,
        candidate_count: 1,
        hit_rate: 0,
        fallback_reason: null,
        build_age_ms: 500,
        commit: "abc123",
      },
      [{ filePath: "docs/helix-ask-flow.md" }],
      [{ filePath: "docs/helix-ask-flow.md", line: 1, text: "x", term: "helix" }],
    );

    expect(telemetry.hit_rate).toBe(1);
    expect(telemetry.candidate_count).toBe(1);
  });
});

