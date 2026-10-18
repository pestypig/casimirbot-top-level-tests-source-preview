import { describe, expect, it } from "vitest";
import {
  buildRepoSearchPlan,
  extractRepoSearchTerms,
  PACKAGES_RETRIEVAL_FAIL_REASON,
  runGitTrackedRepoSearch,
  runGitTrackedStage0CandidateLane,
  runRepoSearch,
  resolvePackagesRetrievalMetadata,
  selectRepoSearchPaths,
} from "../server/services/helix-ask/repo-search";

describe("helix ask repo search", () => {
  it("builds a repo search plan for ideology prompts when evidence is weak", () => {
    process.env.HELIX_ASK_REPO_SEARCH = "1";
    process.env.HELIX_ASK_REPO_SEARCH_ON_EVIDENCE_FAIL = "1";
    const plan = buildRepoSearchPlan({
      question: "What is Mission Ethos?",
      topicTags: ["ideology"],
      intentDomain: "repo",
      evidenceGateOk: false,
    });
    expect(plan).not.toBeNull();
    expect(plan?.terms?.length).toBeGreaterThan(0);
  });

  it("includes ideology paths for ideology tags", () => {
    const paths = selectRepoSearchPaths(["ideology"]);
    expect(paths.some((entry) => entry.replace(/\\/g, "/").includes("docs/ethos"))).toBe(true);
  });

  it("attaches additive packages retrieval provenance metadata", () => {
    const metadata = resolvePackagesRetrievalMetadata(["packages"]);
    expect(metadata).toEqual({
      provenance_class: "inferred",
      claim_tier: "diagnostic",
      certifying: false,
    });
  });

  it("keeps non-packages retrieval metadata unchanged", () => {
    const metadata = resolvePackagesRetrievalMetadata(["ideology"]);
    expect(metadata).toBeNull();
  });

  it("exposes deterministic strict fail_reason constant for packages provenance", () => {
    const plan = buildRepoSearchPlan({
      question: "How does the packages tree work?",
      topicTags: ["packages"],
      intentDomain: "repo",
      evidenceGateOk: false,
      strictProvenance: true,
    });
    expect(plan?.retrievalMetadata).toEqual({
      provenance_class: "inferred",
      claim_tier: "diagnostic",
      certifying: false,
    });
    expect(plan?.fail_reason).toBeUndefined();
    expect(PACKAGES_RETRIEVAL_FAIL_REASON).toBe("PACKAGES_EVIDENCE_PROVENANCE_MISSING");
  });

  it("supports git-tracked retrieval lane metadata without throwing", async () => {
    const result = await runGitTrackedRepoSearch({
      query: "needle hull natario",
      maxHits: 4,
    });
    expect(result.terms.length).toBeGreaterThan(0);
    expect(Array.isArray(result.hits)).toBe(true);
    if (result.hits.length > 0) {
      expect(result.hits[0]?.filePath.length).toBeGreaterThan(0);
      expect(result.hits[0]?.line).toBeGreaterThan(0);
    }
    expect(result.stage0).toBeTruthy();
    expect(typeof result.stage0?.used).toBe("boolean");
    expect(typeof result.stage0?.candidate_count).toBe("number");
  });

  it("returns stage0 telemetry for repo-search fallback scans", async () => {
    const result = await runRepoSearch({
      terms: ["helix ask", "retrieval"],
      paths: ["docs", "server/services/helix-ask"],
      explicit: false,
      reason: "test",
      mode: "fallback",
    });
    expect(Array.isArray(result.hits)).toBe(true);
    expect(result.stage0).toBeTruthy();
    expect(typeof result.stage0?.used).toBe("boolean");
    expect(typeof result.stage0?.candidate_count).toBe("number");
  });

  it("applies rollout-mode off as a hard fail-open policy", async () => {
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    try {
      process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "off";
      const result = await runRepoSearch({
        terms: ["helix ask", "retrieval"],
        paths: ["docs", "server/services/helix-ask"],
        explicit: false,
        reason: "test",
        mode: "fallback",
        intentDomain: "repo",
      });
      expect(result.stage0?.used).toBe(false);
      expect(result.stage0?.rollout_mode).toBe("off");
      expect(result.stage0?.policy_decision).toBe("stage0_rollout_off");
      expect(result.stage0?.fail_open_reason).toBe("stage0_rollout_off");
    } finally {
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
    }
  });

  it("enforces canary holdout deterministically for active rollout", async () => {
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    try {
      process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "partial";
      process.env.HELIX_ASK_STAGE0_CANARY_PCT = "0";
      const result = await runRepoSearch({
        terms: ["helix ask", "retrieval"],
        paths: ["docs", "server/services/helix-ask"],
        explicit: false,
        reason: "test",
        mode: "fallback",
        intentDomain: "repo",
        intentId: "repo.repo_api_lookup",
        sessionId: "session-canary-holdout",
      });
      expect(result.stage0?.used).toBe(false);
      expect(result.stage0?.rollout_mode).toBe("partial");
      expect(result.stage0?.canary_hit).toBe(false);
      expect(result.stage0?.policy_decision).toBe("stage0_canary_holdout");
      expect(result.stage0?.fail_open_reason).toBe("stage0_canary_holdout");
    } finally {
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  });

  it("keeps preflight mode in shadow-only during partial rollout", async () => {
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    try {
      process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "partial";
      process.env.HELIX_ASK_STAGE0_CANARY_PCT = "100";
      const result = await runRepoSearch({
        terms: ["helix ask", "retrieval"],
        paths: ["docs", "server/services/helix-ask"],
        explicit: false,
        reason: "test",
        mode: "preflight",
        intentDomain: "repo",
        intentId: "repo.repo_api_lookup",
        sessionId: "session-mode-excluded",
      });
      expect(result.stage0?.used).toBe(false);
      expect(result.stage0?.shadow_only).toBe(true);
      expect(result.stage0?.rollout_mode).toBe("partial");
      expect(result.stage0?.policy_decision).toBe("stage0_mode_excluded");
      expect(result.stage0?.fail_open_reason).toBe("stage0_mode_excluded");
    } finally {
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  });

  it("hard-bypasses stage0 for explicit repo/path prompts", async () => {
    const prevEnabled = process.env.HELIX_ASK_STAGE0_ENABLED;
    const prevShadow = process.env.HELIX_ASK_STAGE0_SHADOW;
    process.env.HELIX_ASK_STAGE0_ENABLED = "1";
    process.env.HELIX_ASK_STAGE0_SHADOW = "0";
    try {
      const result = await runRepoSearch({
        terms: ["server/routes/agi.plan.ts"],
        paths: ["server/routes/agi.plan.ts"],
        explicit: true,
        reason: "explicit_request",
        mode: "explicit",
      });
      expect(result.stage0?.used).toBe(false);
      expect(result.stage0?.fallback_reason).toBe("explicit_repo_query");
    } finally {
      if (prevEnabled === undefined) delete process.env.HELIX_ASK_STAGE0_ENABLED;
      else process.env.HELIX_ASK_STAGE0_ENABLED = prevEnabled;
      if (prevShadow === undefined) delete process.env.HELIX_ASK_STAGE0_SHADOW;
      else process.env.HELIX_ASK_STAGE0_SHADOW = prevShadow;
    }
  });

  it("applies must_include files as a soft stage0 constraint", async () => {
    const prevEnabled = process.env.HELIX_ASK_STAGE0_ENABLED;
    const prevShadow = process.env.HELIX_ASK_STAGE0_SHADOW;
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    process.env.HELIX_ASK_STAGE0_ENABLED = "1";
    process.env.HELIX_ASK_STAGE0_SHADOW = "0";
    process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "full";
    process.env.HELIX_ASK_STAGE0_CANARY_PCT = "100";
    try {
      const repoResult = await runRepoSearch({
        terms: ["helix ask retrieval"],
        paths: ["server/routes/agi.plan.ts"],
        explicit: false,
        reason: "test",
        mode: "fallback",
        intentDomain: "repo",
        intentId: "repo.repo_api_lookup",
        topicTags: ["helix_ask"],
        mustIncludeFiles: ["server/routes/agi.plan.ts"],
      });
      expect(repoResult.stage0?.soft_must_include_applied).toBe(true);
      expect(repoResult.stage0?.fallback_reason).not.toBe("must_include_paths");
      expect(repoResult.stage0?.policy_decision).not.toBe("must_include_paths");

      const gitTrackedResult = await runGitTrackedRepoSearch({
        query: "helix ask retrieval pipeline",
        maxHits: 1,
        mustIncludeFiles: ["server/routes/agi.plan.ts"],
        intentDomain: "repo",
        intentId: "repo.repo_api_lookup",
        topicTags: ["helix_ask"],
      });
      expect(gitTrackedResult.stage0?.soft_must_include_applied).toBe(true);
      expect(gitTrackedResult.stage0?.fallback_reason).not.toBe("must_include_paths");
      expect(gitTrackedResult.stage0?.policy_decision).not.toBe("must_include_paths");
    } finally {
      if (prevEnabled === undefined) delete process.env.HELIX_ASK_STAGE0_ENABLED;
      else process.env.HELIX_ASK_STAGE0_ENABLED = prevEnabled;
      if (prevShadow === undefined) delete process.env.HELIX_ASK_STAGE0_SHADOW;
      else process.env.HELIX_ASK_STAGE0_SHADOW = prevShadow;
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  }, 20_000);

  it("does not hard-bypass stage0 for non-repo slash tokens", async () => {
    const prevEnabled = process.env.HELIX_ASK_STAGE0_ENABLED;
    const prevShadow = process.env.HELIX_ASK_STAGE0_SHADOW;
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    process.env.HELIX_ASK_STAGE0_ENABLED = "1";
    process.env.HELIX_ASK_STAGE0_SHADOW = "0";
    process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "full";
    process.env.HELIX_ASK_STAGE0_CANARY_PCT = "100";
    try {
      const result = await runGitTrackedStage0CandidateLane({
        query: "Explain ratio x/y.z in this model.",
        mode: "fallback",
        intentDomain: "general",
        intentId: "general.conceptual_define_compare",
      });
      expect(result.stage0?.fallback_reason).not.toBe("explicit_path_query");
      expect(result.stage0?.policy_decision).not.toBe("explicit_path_query");
    } finally {
      if (prevEnabled === undefined) delete process.env.HELIX_ASK_STAGE0_ENABLED;
      else process.env.HELIX_ASK_STAGE0_ENABLED = prevEnabled;
      if (prevShadow === undefined) delete process.env.HELIX_ASK_STAGE0_SHADOW;
      else process.env.HELIX_ASK_STAGE0_SHADOW = prevShadow;
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  });

  it("keeps hard explicit-path bypass for repo-root file paths", async () => {
    const prevEnabled = process.env.HELIX_ASK_STAGE0_ENABLED;
    const prevShadow = process.env.HELIX_ASK_STAGE0_SHADOW;
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    process.env.HELIX_ASK_STAGE0_ENABLED = "1";
    process.env.HELIX_ASK_STAGE0_SHADOW = "0";
    process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "full";
    process.env.HELIX_ASK_STAGE0_CANARY_PCT = "100";
    try {
      const result = await runGitTrackedStage0CandidateLane({
        query: "Explain server/routes/agi.plan.ts routing behavior.",
        mode: "fallback",
        intentDomain: "repo",
        intentId: "repo.repo_api_lookup",
      });
      expect(result.stage0?.used).toBe(false);
      expect(result.stage0?.fallback_reason).toBe("explicit_path_query");
      expect(result.stage0?.policy_decision).toBe("explicit_path_query");
    } finally {
      if (prevEnabled === undefined) delete process.env.HELIX_ASK_STAGE0_ENABLED;
      else process.env.HELIX_ASK_STAGE0_ENABLED = prevEnabled;
      if (prevShadow === undefined) delete process.env.HELIX_ASK_STAGE0_SHADOW;
      else process.env.HELIX_ASK_STAGE0_SHADOW = prevShadow;
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  });

  it("hard-bypasses stage0 when source question carries explicit path cues", async () => {
    const prevEnabled = process.env.HELIX_ASK_STAGE0_ENABLED;
    const prevShadow = process.env.HELIX_ASK_STAGE0_SHADOW;
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    process.env.HELIX_ASK_STAGE0_ENABLED = "1";
    process.env.HELIX_ASK_STAGE0_SHADOW = "0";
    process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "full";
    process.env.HELIX_ASK_STAGE0_CANARY_PCT = "100";
    try {
      const result = await runGitTrackedStage0CandidateLane({
        query: "explain routing behavior",
        sourceQuestion: "Explain server/routes/agi.plan.ts routing behavior.",
        mode: "fallback",
        intentDomain: "repo",
        intentId: "repo.repo_api_lookup",
      });
      expect(result.stage0?.used).toBe(false);
      expect(result.stage0?.fallback_reason).toBe("explicit_path_query");
      expect(result.stage0?.policy_decision).toBe("explicit_path_query");
    } finally {
      if (prevEnabled === undefined) delete process.env.HELIX_ASK_STAGE0_ENABLED;
      else process.env.HELIX_ASK_STAGE0_ENABLED = prevEnabled;
      if (prevShadow === undefined) delete process.env.HELIX_ASK_STAGE0_SHADOW;
      else process.env.HELIX_ASK_STAGE0_SHADOW = prevShadow;
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  });

  it("does not hard-bypass stage0 for broad conceptual source questions with inherited path hints", async () => {
    const prevEnabled = process.env.HELIX_ASK_STAGE0_ENABLED;
    const prevShadow = process.env.HELIX_ASK_STAGE0_SHADOW;
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    process.env.HELIX_ASK_STAGE0_ENABLED = "1";
    process.env.HELIX_ASK_STAGE0_SHADOW = "0";
    process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "full";
    process.env.HELIX_ASK_STAGE0_CANARY_PCT = "100";
    try {
      const result = await runGitTrackedStage0CandidateLane({
        query: "docs/knowledge/physics/dynamic-casimir-effect.md modulation outputs",
        sourceQuestion: [
          "How does dynamic Casimir modulation feed into the system's physics outputs?",
          "docs/knowledge/physics/dynamic-casimir-effect.md",
          "docs/papers.md",
        ].join("\n"),
        mode: "fallback",
        intentDomain: "hybrid",
        intentId: "hybrid.concept_plus_system_mapping",
      });
      expect(result.stage0?.fallback_reason).not.toBe("explicit_path_query");
      expect(result.stage0?.policy_decision).not.toBe("explicit_path_query");
    } finally {
      if (prevEnabled === undefined) delete process.env.HELIX_ASK_STAGE0_ENABLED;
      else process.env.HELIX_ASK_STAGE0_ENABLED = prevEnabled;
      if (prevShadow === undefined) delete process.env.HELIX_ASK_STAGE0_SHADOW;
      else process.env.HELIX_ASK_STAGE0_SHADOW = prevShadow;
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  });

  it("does not hard-bypass stage0 when only internal query contains path-like tokens", async () => {
    const prevEnabled = process.env.HELIX_ASK_STAGE0_ENABLED;
    const prevShadow = process.env.HELIX_ASK_STAGE0_SHADOW;
    const prevRollout = process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
    const prevCanary = process.env.HELIX_ASK_STAGE0_CANARY_PCT;
    process.env.HELIX_ASK_STAGE0_ENABLED = "1";
    process.env.HELIX_ASK_STAGE0_SHADOW = "0";
    process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = "full";
    process.env.HELIX_ASK_STAGE0_CANARY_PCT = "100";
    try {
      const result = await runGitTrackedStage0CandidateLane({
        query: "docs/knowledge/physics/dynamic-casimir-effect.md modulation outputs",
        sourceQuestion: "How does dynamic Casimir modulation feed into the system's physics outputs?",
        mode: "fallback",
        intentDomain: "hybrid",
        intentId: "hybrid.concept_plus_system_mapping",
      });
      expect(result.stage0?.fallback_reason).not.toBe("explicit_path_query");
      expect(result.stage0?.policy_decision).not.toBe("explicit_path_query");
    } finally {
      if (prevEnabled === undefined) delete process.env.HELIX_ASK_STAGE0_ENABLED;
      else process.env.HELIX_ASK_STAGE0_ENABLED = prevEnabled;
      if (prevShadow === undefined) delete process.env.HELIX_ASK_STAGE0_SHADOW;
      else process.env.HELIX_ASK_STAGE0_SHADOW = prevShadow;
      if (prevRollout === undefined) delete process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE;
      else process.env.HELIX_ASK_STAGE0_ROLLOUT_MODE = prevRollout;
      if (prevCanary === undefined) delete process.env.HELIX_ASK_STAGE0_CANARY_PCT;
      else process.env.HELIX_ASK_STAGE0_CANARY_PCT = prevCanary;
    }
  });

  it("derives deterministic phrase search terms from adjacent query tokens", () => {
    const terms = extractRepoSearchTerms("How does intent directory routing work in helix ask?", null);
    expect(terms).toContain("intent directory");
    expect(terms).toContain("directory routing");
  });

  it("retains key unigrams alongside phrases for constrained top-N term sets", () => {
    const terms = extractRepoSearchTerms("How does intent directory routing work in helix ask?", null);
    expect(terms.some((term) => term === "routing" || term === "helix")).toBe(true);
    expect(terms).not.toContain("work");
  });

  it("retains the explicit 'helix ask' phrase when present in the query", () => {
    const terms = extractRepoSearchTerms("Explain the helix ask routing path", null);
    expect(terms).toContain("helix ask");
  });

  it("prioritizes exact internal identifiers for repo-technical prompts", () => {
    const terms = extractRepoSearchTerms(
      "Explain how answer_path is populated and why sanitizeSourcesLine matters for diagnostics.",
      null,
    );
    expect(terms[0]).toBe("answer_path");
    expect(terms).toContain("sanitizesourcesline");
  });

  it("extracts CJK terms so multilingual queries do not collapse to empty search terms", () => {
    const terms = extractRepoSearchTerms("什么是二库比叶尔扭曲炮?", null);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.some((term) => term.includes("扭曲") || term.includes("二库比叶尔"))).toBe(true);
  });
});
