import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ClaimRecord = {
  claimId: string;
  maturity: string;
  repoBindings?: string[];
  sources?: Array<{ citation?: string }>;
  validityDomain?: {
    system?: string;
    constraints?: string[];
  };
};

describe("quantum semiclassical math claims registry", () => {
  it("keeps the exploratory registry structurally complete and bound to real repo files", () => {
    const repoRoot = process.cwd();
    const registryPath = path.join(
      repoRoot,
      "docs",
      "knowledge",
      "math-claims",
      "quantum-semiclassical.math-claims.json",
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
    expect(registry.registryId).toBe("quantum-semiclassical-core");
    expect(registry.domain).toBe("quantum-semiclassical-exploratory");

    const claims = registry.claims ?? [];
    expect(claims.length).toBeGreaterThanOrEqual(10);

    const claimIds = claims.map((claim) => claim.claimId);
    expect(new Set(claimIds).size).toBe(claimIds.length);
    expect(claims.every((claim) => claim.maturity === "exploratory")).toBe(true);

    expect(claimIds).toEqual(
      expect.arrayContaining([
        "claim:quantum.semiclassical:gravity_related_collapse",
        "claim:quantum.semiclassical:diosi_penrose_timescale",
        "claim:quantum.semiclassical:microtubule_energy_migration",
        "claim:quantum.semiclassical:time_crystal_subharmonic_locking",
        "claim:quantum.semiclassical:triplet_of_triplets_hypothesis",
        "claim:quantum.semiclassical:spacetime_triplet_geometry_hypothesis",
      ]),
    );

    for (const claim of claims) {
      expect(claim.sources?.length ?? 0).toBeGreaterThan(0);
      expect(claim.validityDomain?.system).toBeTruthy();
      expect(claim.validityDomain?.constraints?.length ?? 0).toBeGreaterThan(0);
      for (const binding of claim.repoBindings ?? []) {
        expect(fs.existsSync(path.join(repoRoot, binding))).toBe(true);
      }
    }
  });
});
