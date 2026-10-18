import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateWarpRodcClaims } from "../scripts/validate-warp-rodc-claims";

type WarpRodcClaimRecord = {
  claimId: string;
  statement: string;
  maturity: string;
  clCeiling?: string;
  status?: string;
  contract?: {
    id?: string;
    version?: number;
    laneId?: string;
    classificationScope?: string;
  };
  baselines?: string[];
  evidencePaths?: string[];
  falsifier?: {
    condition?: string;
    evidence?: string;
    note?: string;
  };
  repoBindings?: string[];
  sources?: Array<{ citation?: string }>;
  validityDomain?: {
    system?: string;
    constraints?: string[];
  };
};

type WarpRodcRegistry = {
  $schema?: string;
  schemaVersion?: string;
  registryId?: string;
  domain?: string;
  updatedAt?: string;
  claims?: WarpRodcClaimRecord[];
};

type WarpRodcArtifact = {
  contract: {
    id: string;
    version: number;
    lane_id: string;
    classification_scope: string;
  };
  verdict: {
    family_label: string;
    status: string;
    stability: string;
  };
  cross_lane: {
    cross_lane_status: string;
  };
};

type WarpRodcDriftReport = {
  latestArtifactPath: string;
  summary: {
    status: string;
  };
};

describe("warp RODC claim registry", () => {
  it("governs York and render benchmark claims against per-claim artifacts, drift refs, and contract metadata", () => {
    const repoRoot = process.cwd();
    const registryPath = path.join(
      repoRoot,
      "docs",
      "knowledge",
      "math-claims",
      "warp-rodc.claims.v1.json",
    );
    const yorkArtifactPath = path.join(
      repoRoot,
      "artifacts",
      "research",
      "full-solve",
      "warp-york-control-family-rodc-latest.json",
    );
    const yorkDriftPath = path.join(
      repoRoot,
      "artifacts",
      "research",
      "full-solve",
      "warp-rodc-drift-latest.json",
    );
    const renderArtifactPath = path.join(
      repoRoot,
      "artifacts",
      "research",
      "full-solve",
      "warp-render-congruence-rodc-latest.json",
    );
    const renderDriftPath = path.join(
      repoRoot,
      "artifacts",
      "research",
      "full-solve",
      "warp-render-congruence-rodc-drift-latest.json",
    );

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as WarpRodcRegistry;
    const yorkArtifact = JSON.parse(fs.readFileSync(yorkArtifactPath, "utf8")) as WarpRodcArtifact;
    const yorkDrift = JSON.parse(fs.readFileSync(yorkDriftPath, "utf8")) as WarpRodcDriftReport;
    const renderArtifact = JSON.parse(
      fs.readFileSync(renderArtifactPath, "utf8"),
    ) as WarpRodcArtifact;
    const renderDrift = JSON.parse(
      fs.readFileSync(renderDriftPath, "utf8"),
    ) as WarpRodcDriftReport;
    const validation = validateWarpRodcClaims();

    expect(validation.ok).toBe(true);
    expect(validation.errorCount).toBe(0);
    expect(validation.claimCount).toBeGreaterThanOrEqual(2);

    expect(registry.$schema).toBe("../../qa/schemas/math-claim-registry.schema.json");
    expect(registry.schemaVersion).toBe("1.0.0");
    expect(registry.registryId).toBe("warp-rodc");
    expect(registry.domain).toBe("warp-reduced-order-diagnostics");

    const claims = registry.claims ?? [];
    expect(claims).toHaveLength(2);
    const claimById = new Map(claims.map((claim) => [claim.claimId, claim]));

    const yorkClaim = claimById.get("claim:warp.rodc:york_lane_a_nhm2_low_expansion_family");
    expect(yorkClaim).toBeTruthy();
    expect(yorkClaim?.maturity).toBe("diagnostic");
    expect(yorkClaim?.clCeiling).toBe("CL2");
    expect(yorkClaim?.status).toBe(yorkArtifact.verdict.status);
    expect(yorkClaim?.contract?.id).toBe(yorkArtifact.contract.id);
    expect(yorkClaim?.contract?.version).toBe(yorkArtifact.contract.version);
    expect(yorkClaim?.contract?.laneId).toBe(yorkArtifact.contract.lane_id);
    expect(yorkClaim?.contract?.classificationScope).toBe(
      yorkArtifact.contract.classification_scope,
    );
    expect(yorkClaim?.falsifier?.evidence).toBe(
      "artifacts/research/full-solve/warp-rodc-drift-latest.json",
    );
    expect(yorkClaim?.evidencePaths).toContain(
      "artifacts/research/full-solve/warp-york-control-family-rodc-latest.json",
    );
    expect(yorkClaim?.evidencePaths).toContain(
      "artifacts/research/full-solve/warp-rodc-drift-latest.json",
    );
    expect(yorkDrift.latestArtifactPath).toBe(
      "artifacts/research/full-solve/warp-york-control-family-rodc-latest.json",
    );
    expect(["inconclusive", "stable", "drifted", "contract_drift"]).toContain(
      yorkDrift.summary.status,
    );

    const renderClaim = claimById.get("claim:warp.rodc:render_metric_parity_lane_a_benchmark");
    expect(renderClaim).toBeTruthy();
    expect(renderClaim?.maturity).toBe("diagnostic");
    expect(renderClaim?.clCeiling).toBe("CL2");
    expect(renderClaim?.status).toBe(renderArtifact.verdict.status);
    expect(renderClaim?.contract?.id).toBe(renderArtifact.contract.id);
    expect(renderClaim?.contract?.version).toBe(renderArtifact.contract.version);
    expect(renderClaim?.contract?.laneId).toBe(renderArtifact.contract.lane_id);
    expect(renderClaim?.contract?.classificationScope).toBe(
      renderArtifact.contract.classification_scope,
    );
    expect(renderClaim?.falsifier?.evidence).toBe(
      "artifacts/research/full-solve/warp-render-congruence-rodc-drift-latest.json",
    );
    expect(renderClaim?.evidencePaths).toContain(
      "artifacts/research/full-solve/warp-render-congruence-rodc-latest.json",
    );
    expect(renderClaim?.evidencePaths).toContain(
      "artifacts/research/full-solve/warp-render-congruence-rodc-drift-latest.json",
    );
    expect(renderClaim?.evidencePaths).toContain(
      "docs/audits/research/warp-render-congruence-benchmark-latest.md",
    );
    expect(renderDrift.latestArtifactPath).toBe(
      "artifacts/research/full-solve/warp-render-congruence-rodc-latest.json",
    );
    expect(["inconclusive", "stable", "drifted", "contract_drift"]).toContain(
      renderDrift.summary.status,
    );

    for (const claim of claims) {
      for (const binding of claim.repoBindings ?? []) {
        expect(fs.existsSync(path.join(repoRoot, binding))).toBe(true);
      }
      for (const evidencePath of claim.evidencePaths ?? []) {
        expect(fs.existsSync(path.join(repoRoot, evidencePath))).toBe(true);
      }
      expect(claim.validityDomain?.system).toBeTruthy();
      expect(claim.validityDomain?.constraints?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(claim.sources?.length ?? 0).toBeGreaterThanOrEqual(2);
    }

    const resultByClaim = new Map(validation.claimResults.map((entry) => [entry.claimId, entry]));
    expect(resultByClaim.get("claim:warp.rodc:york_lane_a_nhm2_low_expansion_family")?.artifactPath).toBe(
      "artifacts/research/full-solve/warp-york-control-family-rodc-latest.json",
    );
    expect(resultByClaim.get("claim:warp.rodc:render_metric_parity_lane_a_benchmark")?.artifactPath).toBe(
      "artifacts/research/full-solve/warp-render-congruence-rodc-latest.json",
    );

    expect(yorkArtifact.cross_lane.cross_lane_status).toBe("lane_stable_low_expansion_like");
    expect(renderArtifact.cross_lane.cross_lane_status).toBe("single_lane_benchmark");
  });

  it("rejects cross-lane stability overclaim when the referenced artifact is lane_comparison_inconclusive", () => {
    const repoRoot = process.cwd();
    const registryPath = path.join(
      repoRoot,
      "docs",
      "knowledge",
      "math-claims",
      "warp-rodc.claims.v1.json",
    );
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as WarpRodcRegistry;
    const yorkArtifactPath = path.join(
      repoRoot,
      "artifacts",
      "research",
      "full-solve",
      "warp-york-control-family-rodc-latest.json",
    );
    const yorkArtifact = JSON.parse(fs.readFileSync(yorkArtifactPath, "utf8")) as WarpRodcArtifact;
    const mutated = structuredClone(registry);
    const yorkClaim = (mutated.claims ?? []).find(
      (entry) => entry.claimId === "claim:warp.rodc:york_lane_a_nhm2_low_expansion_family",
    );
    expect(yorkClaim).toBeTruthy();
    if (!yorkClaim) return;
    yorkClaim.statement =
      "Under york_diagnostic_contract@v1 the cross-lane result is lane_stable_low_expansion_like.";

    const tempDir = fs.mkdtempSync(path.join(repoRoot, "tmp-warp-rodc-claims-"));
    try {
      const tempRegistryPath = path.join(tempDir, "warp-rodc.claims.v1.json");
      const tempArtifactPath = path.join(tempDir, "warp-york-control-family-rodc-latest.json");
      const mutatedArtifact = structuredClone(yorkArtifact);
      mutatedArtifact.cross_lane = {
        ...mutatedArtifact.cross_lane,
        cross_lane_status: "lane_comparison_inconclusive",
      };
      fs.writeFileSync(tempArtifactPath, JSON.stringify(mutatedArtifact, null, 2), "utf8");
      yorkClaim.evidencePaths = (
        yorkClaim.evidencePaths ??
        []
      ).map((entry) =>
        entry === "artifacts/research/full-solve/warp-york-control-family-rodc-latest.json"
          ? path.relative(repoRoot, tempArtifactPath).replace(/\\/g, "/")
          : entry,
      );
      fs.writeFileSync(tempRegistryPath, JSON.stringify(mutated, null, 2), "utf8");
      const result = validateWarpRodcClaims({ registryPath: tempRegistryPath });
      expect(result.ok).toBe(false);
      expect(
        result.issues.some(
          (issue) => issue.code === "cross_lane_inconclusive_stability_overclaim",
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
