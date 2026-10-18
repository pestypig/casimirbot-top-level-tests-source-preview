import { collectSupplementsFromOutputs } from "../server/services/planner/supplements";
import { describe, expect, it } from "vitest";
import { stripRunawayAnswerArtifacts } from "../server/services/helix-ask/answer-artifacts";
import { __testScoreDeterministicClaimCitationLinkage } from "../server/routes/agi.plan";
import {
  __testOnlyBuildStage0RolloutActionArtifact,
  __testOnlyBuildStage0SweepGateMetrics,
  __testOnlyEvaluateStage0PromotionGate,
  __testOnlyIsStage0TechnicalFailOpenReason,
  buildQualityBaselineContract,
} from "../scripts/helix-ask-sweep";
import { evaluateClaimCitationLinkage } from "../server/services/helix-ask/query";
import { getGuidanceArtifacts } from "../server/services/ideology/artifacts";

describe("stripRunawayAnswerArtifacts", () => {
  it("removes leaked instruction preamble and trailing debug sections", () => {
    const input = [
      "In answer, use the context and evidence bullets to craft your response. Certainly! Let's dive into the concept.",
      "",
      "Feedback loops are governance cycles that rely on verified signals.",
      "",
      "Ask debug",
      "- internal=1",
      "",
      "Context sources",
      "docs/ethos/ideology.json",
    ].join("\n");
    const cleaned = stripRunawayAnswerArtifacts(input);
    expect(cleaned).toBe("Feedback loops are governance cycles that rely on verified signals.");
  });

  it("removes END_OF_ANSWER and deduplicates repeated Sources lines", () => {
    const input = [
      "Feedback Loop Hygiene means close loops with verified signals.",
      "",
      "END_OF_ANSWER",
      "",
      "Sources: docs/knowledge/ethos/feedback-loop-hygiene.md, docs/ethos/ideology.json",
      "Sources: docs/knowledge/ethos/feedback-loop-hygiene.md, docs/ethos/ideology.json",
    ].join("\n");
    const cleaned = stripRunawayAnswerArtifacts(input);
    expect(cleaned).toBe([
      "Feedback Loop Hygiene means close loops with verified signals.",
      "",
      "Sources: docs/knowledge/ethos/feedback-loop-hygiene.md, docs/ethos/ideology.json",
    ].join("\n"));
  });

  it("preserves citation sources when trailing fallback markers are stripped", () => {
    const input = [
      "Deterministic fallback answer with retained retrieval evidence.",
      "",
      "Sources: server/services/helix-ask/repo-search.ts, server/routes/agi.plan.ts",
      "",
      "Ask debug",
      "- fallback=clarify",
    ].join("\n");
    const cleaned = stripRunawayAnswerArtifacts(input);
    expect(cleaned).toBe([
      "Deterministic fallback answer with retained retrieval evidence.",
      "",
      "Sources: server/services/helix-ask/repo-search.ts, server/routes/agi.plan.ts",
    ].join("\n"));
  });


  it("removes Tree Walk heading and Execution log variants while preserving Sources", () => {
    const input = [
      "Grounded answer body.",
      "",
      "## Tree Walk:",
      "- node=a",
      "- node=b",
      "",
      "Execution log:",
      "- internal=1",
      "",
      "Sources: server/routes/agi.plan.ts",
    ].join("\n");
    const cleaned = stripRunawayAnswerArtifacts(input);
    expect(cleaned).toBe(["Grounded answer body.", "", "Sources: server/routes/agi.plan.ts"].join("\n"));
  });

  it("removes Ask debug variant blocks in mid-answer", () => {
    const input = [
      "Line one.",
      "",
      "### Ask debug - trace",
      "- foo=bar",
      "",
      "Line two.",
    ].join("\n");
    const cleaned = stripRunawayAnswerArtifacts(input);
    expect(cleaned).toBe(["Line one.", "", "Line two."].join("\n"));
  });
  it("keeps at least one Sources line after artifact stripping", () => {
    const input = [
      "Grounded relation answer body.",
      "",
      "sources: docs/knowledge/warp/warp-bubble.md, docs/ethos/ideology.json",
      "",
      "Tree Walk",
      "- debug",
    ].join("\n");
    const cleaned = stripRunawayAnswerArtifacts(input);
    expect(cleaned).toMatch(/Sources:\s*docs\/knowledge\/warp\/warp-bubble\.md/i);
  });
});


describe("buildQualityBaselineContract", () => {
  it("marks baseline PASS when summary meets thresholds", () => {
    const contract = buildQualityBaselineContract(
      {
        config: "baseline",
        total: 10,
        ok: 9,
        hard_fail: 1,
        clarify_rate: 0.2,
        prompt_leak_rate: 0,
        decorative_citation_rate: 0,
        avg_quality_score: 0.82,
        quality_rate: 0.8,
      },
      "artifacts/helix-ask-sweep.mock.json",
      "2026-02-18T00:00:00.000Z",
    );

    expect(contract.evaluation.status).toBe("pass");
    expect(contract.evaluation.failing_thresholds).toEqual([]);
    expect(contract.evaluation.ok_rate).toBe(0.9);
  });

  it("marks baseline FAIL with deterministic failing thresholds", () => {
    const contract = buildQualityBaselineContract(
      {
        config: "baseline",
        total: 10,
        ok: 6,
        hard_fail: 4,
        clarify_rate: 0.6,
        prompt_leak_rate: 0.1,
        decorative_citation_rate: 0.4,
        avg_quality_score: 0.55,
        quality_rate: 0.2,
      },
      "artifacts/helix-ask-sweep.mock.json",
      "2026-02-18T00:00:00.000Z",
    );

    expect(contract.evaluation.status).toBe("fail");
    expect(contract.evaluation.failing_thresholds).toEqual([
      "min_ok_rate",
      "max_clarify_rate",
      "max_prompt_leak_rate",
      "max_decorative_citation_rate",
      "min_avg_quality_score",
      "min_quality_rate",
    ]);
  });
});

describe("helix ask sweep stage0 gate metrics", () => {
  it("extracts citation/runtime/stage0 usage metrics with deterministic histograms", () => {
    const metrics = __testOnlyBuildStage0SweepGateMetrics([
      {
        label: "case-1",
        ok: true,
        clarify: false,
        duration_ms: 100,
        hard_failures: [],
        decorative_citations: [],
        prompt_leak: false,
        cited_paths: ["server/routes/agi.plan.ts"],
        context_paths: ["server/routes/agi.plan.ts"],
        answer_length: 120,
        quality_score: 0.9,
        quality_signals: {},
        citation_missing: false,
        runtime_fallback_answer: false,
        stage0_eligible: true,
        stage0_used_active: true,
        stage0_fail_open_reason: null,
        stage0_policy_decision: "stage0_active",
        stage0_technical_fail_open: false,
      },
      {
        label: "case-2",
        ok: false,
        clarify: false,
        duration_ms: 120,
        hard_failures: ["missing citations"],
        decorative_citations: [],
        prompt_leak: false,
        cited_paths: [],
        context_paths: [],
        answer_length: 80,
        quality_score: 0.4,
        quality_signals: {},
        citation_missing: true,
        runtime_fallback_answer: true,
        stage0_eligible: true,
        stage0_used_active: false,
        stage0_fail_open_reason: "index_stale",
        stage0_policy_decision: "stage0_active",
        stage0_technical_fail_open: true,
      },
    ]);

    expect(metrics.citation_missing).toBe(1);
    expect(metrics.runtime_fallback_answer).toBe(1);
    expect(metrics.eligible_turn_count).toBe(2);
    expect(metrics.stage0_active_used_count).toBe(1);
    expect(metrics.stage0_active_usage_rate).toBe(0.5);
    expect(metrics.stage0_technical_fail_open_count).toBe(1);
    expect(metrics.stage0_technical_fail_open_rate).toBe(0.5);
    expect(metrics.fail_open_reason_histogram.index_stale).toBe(1);
    expect(metrics.policy_decision_histogram.stage0_active).toBe(2);
  });

  it("evaluates baseline comparison and emits fail verdict when candidate regresses", () => {
    const gate = __testOnlyEvaluateStage0PromotionGate(
      "baseline",
      {
        citation_missing: 0,
        runtime_fallback_answer: 0,
        eligible_turn_count: 10,
        stage0_active_used_count: 10,
        stage0_active_usage_rate: 1,
        stage0_technical_fail_open_count: 0,
        stage0_technical_fail_open_rate: 0,
        fail_open_reason_histogram: {},
        policy_decision_histogram: { stage0_active: 10 },
      },
      "candidate",
      {
        citation_missing: 2,
        runtime_fallback_answer: 1,
        eligible_turn_count: 10,
        stage0_active_used_count: 8,
        stage0_active_usage_rate: 0.8,
        stage0_technical_fail_open_count: 2,
        stage0_technical_fail_open_rate: 0.2,
        fail_open_reason_histogram: { index_stale: 2 },
        policy_decision_histogram: { stage0_active: 10 },
      },
    );

    expect(gate.verdict).toBe("fail");
    expect(gate.failing_rules.length).toBeGreaterThan(0);
  });

  it("classifies technical fail-open reason codes deterministically", () => {
    expect(__testOnlyIsStage0TechnicalFailOpenReason("index_commit_mismatch")).toBe(true);
    expect(__testOnlyIsStage0TechnicalFailOpenReason("git_tracked_scan_failed")).toBe(true);
    expect(__testOnlyIsStage0TechnicalFailOpenReason("explicit_path_query")).toBe(false);
  });

  it("builds rollback recommendation artifact when stage0 gate fails", () => {
    const artifact = __testOnlyBuildStage0RolloutActionArtifact({
      baseline_config: "baseline",
      candidate_config: "candidate",
      baseline: {
        citation_missing: 0,
        runtime_fallback_answer: 0,
        eligible_turn_count: 10,
        stage0_active_used_count: 10,
        stage0_active_usage_rate: 1,
        stage0_technical_fail_open_count: 0,
        stage0_technical_fail_open_rate: 0,
        fail_open_reason_histogram: {},
        policy_decision_histogram: {},
      },
      candidate: {
        citation_missing: 1,
        runtime_fallback_answer: 1,
        eligible_turn_count: 10,
        stage0_active_used_count: 9,
        stage0_active_usage_rate: 0.9,
        stage0_technical_fail_open_count: 1,
        stage0_technical_fail_open_rate: 0.1,
        fail_open_reason_histogram: { index_stale: 1 },
        policy_decision_histogram: { stage0_active: 10 },
      },
      verdict: "fail",
      failing_rules: ["citation_missing increased"],
    });

    expect(artifact.verdict).toBe("fail");
    expect(artifact.recommendation.mode).toBe("shadow");
    expect(artifact.recommendation.canary_pct).toBe(0);
  });
});


describe("Helix Ask semantic claim-citation linkage contract (artifacts)", () => {
  it("treats Sources-line references as deterministic claim linkage anchors", () => {
    const cleaned = stripRunawayAnswerArtifacts([
      "Deterministic linkage is enforced in server/routes/agi.plan.ts.",
      "Coverage checks are validated in tests/helix-ask-answer-artifacts.spec.ts.",
      "",
      "Sources: server/routes/agi.plan.ts, tests/helix-ask-answer-artifacts.spec.ts",
      "",
      "Ask debug",
      "- stage=final",
    ].join("\n"));

    const score = __testScoreDeterministicClaimCitationLinkage(cleaned);
    expect(score.failReasons).toEqual([]);
    expect(score.linkRate).toBe(1);
  });

  it("retained Sources lines satisfy deterministic claim linkage after cleanup", () => {
    const input = [
      "Deterministic fallback answer with retained retrieval evidence.",
      "",
      "Sources: server/services/helix-ask/repo-search.ts, server/routes/agi.plan.ts",
      "",
      "Ask debug",
      "- fallback=clarify",
    ].join("\n");
    const cleaned = stripRunawayAnswerArtifacts(input);
    const linkage = evaluateClaimCitationLinkage(cleaned);
    expect(linkage.ok).toBe(true);
    expect(linkage.failReason).toBeUndefined();
  });
});


describe("sector-control supplement lane", () => {
  it("collects sector-control supplements without replacing viability authority", () => {
    const supplements = collectSupplementsFromOutputs([
      {
        supplement: {
          kind: "sector-control",
          tool: "physics.warp.sector_control.plan",
          title: "Sector control packet",
          summary: "Diagnostic-only sector control evidence",
          detail: "certifying=false unless admissible certificate integrity is true",
        },
      },
    ]);

    expect(supplements).toHaveLength(1);
    expect(supplements[0]?.kind).toBe("sector-control");
    expect(supplements[0]?.detail).toContain("certifying=false");
  });
});
