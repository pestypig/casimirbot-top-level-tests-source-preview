import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getTrajectory } from "../server/services/evolution/trajectory";
import { appendPatchRecord, getPatchesPath } from "../server/services/evolution/patch-store";

describe("evolution trajectory", () => {
  beforeEach(() => {
    const patchesPath = getPatchesPath();
    if (fs.existsSync(patchesPath)) {
      fs.rmSync(patchesPath, { force: true });
    }
  });

  it("returns deterministic trajectory summary", () => {
    appendPatchRecord({
      patchId: "patch:test-trajectory",
      ts: "2026-02-23T00:00:00.000Z",
      title: "Trajectory",
      touchedPaths: ["server/routes/evolution.ts"],
      intentTags: ["evolution"],
    });
    const result = getTrajectory("patch:test-trajectory");
    expect(result).toBeTruthy();
    expect(result?.id).toBe("patch:test-trajectory");
    expect(result?.rollingState.patchesSeen).toBeGreaterThan(0);
  });

  it("ignores corrupt lines and uses stable timestamp ordering", () => {
    const patchesPath = getPatchesPath();
    fs.mkdirSync(patchesPath.replace(/\/patches\.jsonl$/, ""), { recursive: true });
    fs.writeFileSync(
      patchesPath,
      [
        "{not-json}",
        JSON.stringify({
          patchId: "patch:later",
          ts: "2026-02-23T00:00:03.000Z",
          title: "Later",
          touchedPaths: ["a"],
          intentTags: ["x"],
        }),
        JSON.stringify({
          patchId: "patch:earlier",
          ts: "2026-02-23T00:00:01.000Z",
          title: "Earlier",
          touchedPaths: ["b"],
          intentTags: ["y"],
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const result = getTrajectory("patch:later");
    expect(result?.rollingState.patchesSeen).toBe(2);
    expect(result?.rollingState.latestTimestamp).toBe("2026-02-23T00:00:03.000Z");
  });
});
