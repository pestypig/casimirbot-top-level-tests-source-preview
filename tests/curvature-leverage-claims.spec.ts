import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REGISTRY_PATH = path.join(
  "docs",
  "knowledge",
  "math-claims",
  "curvature-leverage.math-claims.json",
);

function loadRegistry(): {
  registryId: string;
  claims: Array<{
    claimId: string;
    statement: string;
    maturity: string;
    validityDomain: { constraints: string[] };
    repoBindings?: string[];
  }>;
} {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

describe("curvature leverage claim registry", () => {
  it("keeps all curvature leverage claims non-promoting", () => {
    const registry = loadRegistry();

    expect(registry.registryId).toBe("curvature-leverage-core");
    for (const claim of registry.claims) {
      expect(claim.maturity).toMatch(/diagnostic|reduced-order|reduced_order/);
      expect(JSON.stringify(claim)).not.toContain("\"promotionAllowed\":true");
      expect(JSON.stringify(claim.validityDomain.constraints)).toContain("promotion");
    }
  });

  it("binds NHM2 leverage to full-solve tensor precedence", () => {
    const registry = loadRegistry();

    const claim = registry.claims.find(
      (entry) =>
        entry.claimId === "claim:curvature.leverage:nhm2_full_solve_tensor_precedence",
    );

    expect(claim).toBeTruthy();
    expect(JSON.stringify(claim)).toContain("metricRequiredTensorRef");
    expect(JSON.stringify(claim)).toContain("full solve");
    expect(claim?.repoBindings).toContain("shared/curvature-leverage.ts");
    expect(claim?.repoBindings).toContain("docs/research/nhm2-observable-equation-map.v1.json");
  });

  it("keeps external observables as calibrators, not NHM2 verdicts", () => {
    const registry = loadRegistry();
    const claim = registry.claims.find(
      (entry) =>
        entry.claimId === "claim:curvature.leverage:external_observables_are_calibrators",
    );

    expect(claim).toBeTruthy();
    expect(claim?.statement).toContain("do not validate NHM2");
    expect(JSON.stringify(claim)).toContain("NHM2 claims must route through full-solve tensor artifacts");
  });

  it("binds the benchmark ladder to compactness without promotion", () => {
    const registry = loadRegistry();
    const claim = registry.claims.find(
      (entry) =>
        entry.claimId === "claim:curvature.leverage:benchmark_ladder_compactness_anchor",
    );

    expect(claim).toBeTruthy();
    expect(claim?.statement).toContain("kappa_body R^2 = 2GM/(Rc^2)");
    expect(claim?.repoBindings).toContain("scripts/curvature-leverage-benchmark-ladder.ts");
    expect(JSON.stringify(claim)).toContain("promotionAllowed must remain false");
  });
});
