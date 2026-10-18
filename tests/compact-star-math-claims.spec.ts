import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ClaimRecord = {
  claimId: string;
  maturity: string;
  repoBindings?: string[];
  sources?: Array<{ citation?: string }>;
};

describe("compact-star math claims registry", () => {
  it("keeps compact-star claim descriptors diagnostic and bound to repo artifacts", () => {
    const repoRoot = process.cwd();
    const registryPath = path.join(
      repoRoot,
      "docs",
      "knowledge",
      "math-claims",
      "compact-star-limit-observables.math-claims.json",
    );

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
      $schema?: string;
      schemaVersion?: string;
      registryId?: string;
      domain?: string;
      claims?: ClaimRecord[];
    };

    expect(registry.$schema).toBe("../../qa/schemas/math-claim-registry.schema.json");
    expect(registry.schemaVersion).toBe("1.0.0");
    expect(registry.registryId).toBe("compact-star-limit-observables-core");
    expect(registry.domain).toBe("compact-star-diagnostics");

    const claims = registry.claims ?? [];
    expect(claims.length).toBeGreaterThanOrEqual(9);
    const claimIds = claims.map((entry) => entry.claimId);
    expect(new Set(claimIds).size).toBe(claimIds.length);
    expect(claims.every((entry) => entry.maturity === "diagnostic")).toBe(true);

    expect(claimIds).toEqual(
      expect.arrayContaining([
        "claim:compact_star:period_pdot_state_point",
        "claim:compact_star:death_line_limit_classifier",
        "claim:compact_star:diffraction_band_spacing_observable",
        "claim:compact_star:compact_matter_hypothesis_envelope",
        "claim:compact_star:micro_macro_bridge_descriptor",
      ]),
    );

    for (const claim of claims) {
      expect(claim.sources?.length ?? 0).toBeGreaterThan(0);
      for (const binding of claim.repoBindings ?? []) {
        expect(fs.existsSync(path.join(repoRoot, binding))).toBe(true);
      }
    }
  });
});
