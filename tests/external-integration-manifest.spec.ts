import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validateExternalIntegrationManifest } from "../scripts/validate-external-integration-manifest";

const tempRoots: string[] = [];

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeFixture(options: {
  externalNodeId?: string;
  includeEvidenceFields?: boolean;
  usagePathExists?: boolean;
  sourceRefExists?: boolean;
}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "external-manifest-fixture-"));
  tempRoots.push(repoRoot);

  const treePath = path.join("docs", "knowledge", "external-integrations-tree.json");
  writeJson(path.join(repoRoot, treePath), {
    nodes: [{ id: "external-llm-stack" }],
  });

  if (options.usagePathExists ?? true) {
    fs.mkdirSync(path.join(repoRoot, "external", "llama.cpp"), { recursive: true });
  }

  if (options.sourceRefExists ?? true) {
    writeJson(path.join(repoRoot, "docs", "knowledge", "source.json"), { ok: true });
  }

  const evidence = options.includeEvidenceFields === false
    ? {
        source_refs: ["docs/knowledge/source.json"],
      }
    : {
        provenance_class: "third-party",
        maturity_class: "diagnostic",
        source_refs: ["docs/knowledge/source.json"],
      };

  writeJson(path.join(repoRoot, "configs", "external-integration-evidence-manifest.v1.json"), {
    schema_version: "external_integration_evidence_manifest/1",
    tree_path: treePath,
    entries: [
      {
        external_node_id: options.externalNodeId ?? "external-llm-stack",
        usage_surface: [
          {
            path: "external/llama.cpp",
            kind: "directory",
          },
        ],
        evidence,
      },
    ],
  });

  return repoRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("validateExternalIntegrationManifest", () => {
  it("passes for valid manifest fixture", () => {
    const repoRoot = makeFixture({});

    const result = validateExternalIntegrationManifest({
      repoRoot,
      manifestPath: "configs/external-integration-evidence-manifest.v1.json",
      treePath: "docs/knowledge/external-integrations-tree.json",
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails for dangling external_node_id", () => {
    const repoRoot = makeFixture({ externalNodeId: "missing-node" });

    const result = validateExternalIntegrationManifest({
      repoRoot,
      manifestPath: "configs/external-integration-evidence-manifest.v1.json",
      treePath: "docs/knowledge/external-integrations-tree.json",
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("external_node_id does not exist in tree");
  });

  it("fails when evidence fields are missing", () => {
    const repoRoot = makeFixture({ includeEvidenceFields: false });

    const result = validateExternalIntegrationManifest({
      repoRoot,
      manifestPath: "configs/external-integration-evidence-manifest.v1.json",
      treePath: "docs/knowledge/external-integrations-tree.json",
    });

    expect(result.ok).toBe(false);
    const combined = result.errors.join("\n");
    expect(combined).toContain("evidence.provenance_class is required");
    expect(combined).toContain("evidence.maturity_class is required");
  });

  it("fails when usage or source refs are dangling", () => {
    const repoRoot = makeFixture({ usagePathExists: false, sourceRefExists: false });

    const result = validateExternalIntegrationManifest({
      repoRoot,
      manifestPath: "configs/external-integration-evidence-manifest.v1.json",
      treePath: "docs/knowledge/external-integrations-tree.json",
    });

    expect(result.ok).toBe(false);
    const combined = result.errors.join("\n");
    expect(combined).toContain("usage_surface[0].path does not exist");
    expect(combined).toContain("evidence.source_refs[0] does not exist");
  });
});
