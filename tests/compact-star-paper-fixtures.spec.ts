import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("compact-star paper fixtures and docs", () => {
  it("ships compact-star docs and tree with cited research anchors", () => {
    const repoRoot = process.cwd();
    const requiredPaths = [
      "docs/architecture/compact-star-limit-observables-phase-1-plan.md",
      "docs/knowledge/physics/physics-compact-star-limit-observables-tree.json",
      "docs/knowledge/physics/compact-star-radio-observable-contract.md",
      "docs/knowledge/physics/pulsar-death-line-limit.md",
      "docs/knowledge/physics/pulsar-vacuum-gap-sparking.md",
      "docs/knowledge/physics/pulsar-surface-mountain-hypothesis.md",
      "docs/knowledge/physics/pulsar-dynamic-spectrum-diffraction.md",
      "docs/knowledge/physics/compact-star-matter-hypothesis-envelope.md",
      "docs/knowledge/physics/compact-star-quantum-classical-bridge.md",
      "docs/knowledge/physics/long-period-radio-transient-limit.md",
    ];
    for (const filePath of requiredPaths) {
      expect(fs.existsSync(path.join(repoRoot, filePath))).toBe(true);
    }

    const architectureDoc = fs.readFileSync(
      path.join(repoRoot, "docs/architecture/compact-star-limit-observables-phase-1-plan.md"),
      "utf8",
    );
    expect(architectureDoc).toContain("https://arxiv.org/abs/2503.07936");
    expect(architectureDoc).toContain("https://arxiv.org/abs/2506.12305");
    expect(architectureDoc).toContain("https://link.aps.org/doi/10.1103/PhysRevLett.133.205201");
    expect(architectureDoc).toContain("https://arxiv.org/pdf/1904.11153");
  });
});
