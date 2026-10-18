import { describe, expect, it, vi } from "vitest";

import { applyResponseFallbackTaxonomy } from "../server/services/helix-ask/surface/response-taxonomy";
import {
  applyEquationTelemetryNormalization,
  applyMultilangResponseMetadata,
  applyTermPriorTelemetry,
} from "../server/services/helix-ask/surface/response-telemetry";

describe("helix ask response taxonomy helpers", () => {
  it("suppresses objective-loop primary taxonomy when strict coverage resolved cleanly", () => {
    const debugPayload: Record<string, unknown> = {
      objective_loop_primary_active: true,
      objective_finalize_gate_mode: "strict_covered",
      objective_coverage_unresolved_count: 0,
      objective_unknown_block_count: 0,
    };

    applyResponseFallbackTaxonomy({
      debugPayload,
      answerPath: [],
      fallbackReason: "fallback",
      failClosedReason: null,
      answerFallbackReason: null,
      answerShortFallbackReason: null,
      toolResultsFallbackReason: null,
      qualityFloorReasons: [],
      ambiguityAppliedForTaxonomy: true,
      classifyFallbackReason: () => "fallback",
    });

    expect(debugPayload.fallback_reason).toBeNull();
    expect(debugPayload.fallback_reason_taxonomy).toBe("none");
    expect(debugPayload.fallback_reason_taxonomy_suppressed).toBe(true);
  });

  it("applies classified fallback taxonomy and notes ambiguity suppression", () => {
    const debugPayload: Record<string, unknown> = {
      ambiguity_gate_applied: true,
      placeholder_fallback_applied: true,
    };

    applyResponseFallbackTaxonomy({
      debugPayload,
      answerPath: [],
      fallbackReason: "repo_runtime",
      failClosedReason: null,
      answerFallbackReason: null,
      answerShortFallbackReason: null,
      toolResultsFallbackReason: null,
      qualityFloorReasons: ["deterministic_contract"],
      ambiguityAppliedForTaxonomy: false,
      classifyFallbackReason: () => "repo_runtime",
    });

    expect(debugPayload.fallback_reason).toBe("repo_runtime");
    expect(debugPayload.fallback_reason_taxonomy).toBe("repo_runtime");
    expect(debugPayload.ambiguity_gate_taxonomy_suppressed_by_equation_lock).toBe(true);
  });
});

describe("helix ask response telemetry helpers", () => {
  it("normalizes equation telemetry from answer-path markers", () => {
    const debugPayload: Record<string, unknown> = {
      equation_selector_authority_lock: true,
      equation_primary_anchor_match: false,
    };

    applyEquationTelemetryNormalization({
      debugPayload,
      answerPath: ["fallback:equation_selector_restore", "post_lock_override_blocked_final"],
      equationStateVersion: "selector_authoritative_v1",
    });

    expect(debugPayload.equation_state_version).toBe("selector_authoritative_v1");
    expect(debugPayload.equation_degrade_path_id).toBe("equation_selector_restore");
    expect(debugPayload.post_lock_gate_override_attempted).toBe(true);
    expect(debugPayload.anchor_drift_detected).toBe(true);
  });

  it("records term-prior telemetry and populates multilang result fields", () => {
    const metrics = {
      recordHelixAskTermPriorImpact: vi.fn(),
      recordHelixAskTermRouteOutcome: vi.fn(),
    };
    const debugPayload: Record<string, unknown> = {};
    const termPriorDecision = {
      prior_suppressed_reason: null,
      term_hits: [
        {
          term_id: "warp",
          category: "physics",
          canonical: "warp drive",
          matched_in: "query",
          match_type: "direct",
          term_hit_confidence: 0.92,
        },
      ],
    };

    const nextImpact = applyTermPriorTelemetry({
      termPriorDecision,
      termPriorApplied: true,
      termPriorRepoOverrideApplied: false,
      termPriorRepoEvidenceStrength: 0.93456,
      termPriorRepoEvidenceArtifactCount: 2,
      intentDomain: "general",
      debugPayload,
      metrics,
      termPriorImpact: "neutral",
    });

    const result: Record<string, unknown> = {};
    applyMultilangResponseMetadata({
      includeMultilangMetadataForRequest: true,
      result,
      sourceLanguage: "es",
      languageDetected: "es",
      languageConfidence: 0.88,
      codeMixedTurn: true,
      pivotConfidence: 0.75,
      multilangDispatchState: "review",
      multilangConfirm: false,
      responseLanguage: "en",
      langSchemaVersion: "lang_v1",
      interpreterStatus: "used",
      interpreterConfidence: 0.64,
      interpreterDispatchEligible: true,
      interpreterArtifact: {
        dispatch_state: "review",
        confirm_prompt: "Confirm",
        term_ids: ["warp"],
        concept_ids: ["metric"],
      },
      interpreterSchemaVersion: "interp_v1",
      termPriorDecision,
      termPriorApplied: true,
      termPriorImpact: nextImpact,
    });

    expect(nextImpact).toBe("helped");
    expect(metrics.recordHelixAskTermPriorImpact).toHaveBeenCalledWith("helped");
    expect(metrics.recordHelixAskTermRouteOutcome).toHaveBeenCalledWith("warp", "general");
    expect(debugPayload.term_prior_impact).toBe("helped");
    expect(debugPayload.term_prior_repo_evidence_strength).toBe(0.9346);
    expect(result.response_language).toBe("en");
    expect(result.lang_schema_version).toBe("lang_v1");
    expect(result.interpreter_status).toBe("used");
    expect(result.term_prior_applied).toBe(true);
    expect(result.term_hits).toEqual([
      {
        term_id: "warp",
        category: "physics",
        canonical: "warp drive",
        matched_in: "query",
        match_type: "direct",
        term_hit_confidence: 0.92,
      },
    ]);
  });
});
