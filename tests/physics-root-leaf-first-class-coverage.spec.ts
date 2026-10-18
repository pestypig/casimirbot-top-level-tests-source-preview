import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Root = { id: string };
type PathEntry = { root_id: string };
type Manifest = {
  roots: Root[];
  paths: PathEntry[];
};

describe("physics root-leaf manifest first-class root-lane coverage", () => {
  it("ensures every required root lane appears as at least one paths[].root_id", () => {
    const manifestPath = path.join(
      process.cwd(),
      "configs",
      "physics-root-leaf-manifest.v1.json",
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;

    const requiredRootIds = manifest.roots.map((root) => root.id).sort();
    const rootIdsInPaths = new Set(manifest.paths.map((entry) => entry.root_id));

    const missingRootEntrypoints = requiredRootIds.filter(
      (rootId) => !rootIdsInPaths.has(rootId),
    );

    expect(missingRootEntrypoints).toEqual([]);
  });
});
