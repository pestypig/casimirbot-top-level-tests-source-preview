import { describe, expect, it, vi } from "vitest";

import { applyHelixAskSuccessSurface } from "../server/services/helix-ask/surface/ask-answer-surface";

const buildBaseArgs = () => {
  const recordMultilangObservation = vi.fn();
  const metrics = {
    recordHelixAskMultilangTranslation: vi.fn(),
    recordHelixAskMultilangLanguageMatch: vi.fn(),
    recordHelixAskMultilangFallback: vi.fn(),
    recordHelixAskMultilangCanonicalTerm: vi.fn(),
    observeHelixAskMultilangAddedLatency: vi.fn(),
  };

  return {
    payload: {
      text: "Surface text",
      debug: {},
    } as Record<string, unknown>,
    requestMetadata: {
      source_language: "fr",
      language_detected: "fr",
      language_confidence: 0.92,
      code_mixed: false,
      pivot_confidence: 0.84,
      translated: true,
      response_language: "en",
      lang_schema_version: "helix.lang.v1",
    },
    requestData: {
      interpreter: {
        selected_pivot: { confidence: 0.84 },
        dispatch_state: "allow",
        confirm_prompt: "Confirm?",
        term_ids: ["warp.alcubierre"],
        concept_ids: ["concept.warp"],
        ambiguity: { top2_gap: 0.22 },
      },
      interpreter_schema_version: "helix.interpreter.v1",
      interpreterStatus: "ok",
      interpreterError: null,
      sourceQuestion: "Bonjour",
      question: "Hello",
    },
    includeMultilangMetadata: true,
    dispatchState: "allow",
    multilangRollout: {
      stage: "shadow",
      active: false,
      shadow: true,
      canaryHit: false,
      activePercent: 25,
      promotionFrozen: false,
    },
    threadId: "thread-surface-1",
    turnId: "ask-surface-1",
    outputContractVersion: "phase6.ask.v1",
    interpreterSchemaVersion: "helix.interpreter.v1",
    buildMemoryCitation: vi.fn(() => ({
      entries: [{ path: "server/routes/agi.plan.ts", line_start: 1, line_end: 2, note: "route" }],
      rollout_ids: ["ask-surface-1"],
    })),
    extractResponseEvidenceRefs: vi.fn(() => ["server/routes/agi.plan.ts"]),
    extractMemoryCitationRolloutIds: vi.fn(() => ["ask-surface-1"]),
    clampNumber: (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value)),
    normalizeLanguageTag: (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null,
    isEnglishLikeLanguage: (value: string) => value.toLowerCase().startsWith("en"),
    canonicalTermPreservationRatio: vi.fn(() => 0.997),
    metrics,
    multilangRuntimeState: {
      stage: "shadow",
      killSwitch: false,
      consecutive15mBreaches: 1,
      freezePromotionUntilMs: null,
      lastRollbackReason: null,
    },
    multilangPromotionSlo: 0.995,
    multilangRollback15mSlo: 0.98,
    multilangRollback24hSlo: 0.99,
    recordMultilangObservation,
    metricsSpies: metrics,
    recordMultilangObservationSpy: recordMultilangObservation,
  };
};

describe("helix ask answer surface", () => {
  it("injects citation and multilang output metadata on successful payloads", () => {
    const args = buildBaseArgs();

    const result = applyHelixAskSuccessSurface(args);

    expect(result.memory_citation).toEqual({
      entries: [{ path: "server/routes/agi.plan.ts", line_start: 1, line_end: 2, note: "route" }],
      rollout_ids: ["ask-surface-1"],
    });
    expect(result.report_mode).toBe(false);
    expect(result.source_language).toBe("fr");
    expect(result.language_detected).toBe("fr");
    expect(result.response_language).toBe("en");
    expect(result.contract_version).toBe("phase6.ask.v1");
    expect((result.request_metadata as Record<string, unknown>).thread_id).toBe("thread-surface-1");
    expect(result.interpreter_status).toBe("ok");
    expect(result.interpreter_confidence).toBe(0.84);
    expect(result.interpreter_term_ids).toEqual(["warp.alcubierre"]);
    expect((result.debug as Record<string, unknown>).multilang_rollout_stage).toBe("shadow");
    expect((result.debug as Record<string, unknown>).report_mode).toBe(false);
  });

  it("restores grounded visible text from envelope sections when final text is empty", () => {
    const args = buildBaseArgs();
    args.payload = {
      text: "",
      answer: "",
      envelope: {
        answer: "",
        sections: [
          {
            title: "Key files",
            body: "- docs/helix-ask-reasoning-ladder-research-report.md",
          },
        ],
      },
      debug: {},
    } as Record<string, unknown>;

    const result = applyHelixAskSuccessSurface(args);

    expect(result.text).toBe("Key files\n- docs/helix-ask-reasoning-ladder-research-report.md");
    expect(result.answer).toBe("Key files\n- docs/helix-ask-reasoning-ladder-research-report.md");
    expect(((result.envelope as Record<string, unknown>).answer)).toBe(
      "Key files\n- docs/helix-ask-reasoning-ladder-research-report.md",
    );
    expect((result.debug as Record<string, unknown>).answer_completion_floor_applied).toBe(true);
    expect((result.debug as Record<string, unknown>).answer_completion_floor_source).toBe(
      "envelope_sections",
    );
  });

  it("falls back to cited paths when no answer text survives but memory citations exist", () => {
    const args = buildBaseArgs();
    args.payload = {
      text: "",
      answer: "",
      envelope: {
        answer: "",
        sections: [],
      },
      debug: {},
    } as Record<string, unknown>;

    const result = applyHelixAskSuccessSurface(args);

    expect(result.text).toBe("Sources: server/routes/agi.plan.ts");
    expect(result.answer).toBe("Sources: server/routes/agi.plan.ts");
    expect((result.debug as Record<string, unknown>).answer_completion_floor_source).toBe(
      "memory_citation",
    );
  });

  it("rebuilds weak relation answers from deterministic relation fallback instead of artifact sections", () => {
    const args = buildBaseArgs();
    args.requestData.question = "How does a warp bubble fit in with the mission ethos?";
    args.payload = {
      text: "Tree Walk\nTree Walk: Ethos Knowledge Walk",
      answer: "Tree Walk\nTree Walk: Ethos Knowledge Walk",
      envelope: {
        answer: "",
        sections: [
          {
            title: "Tree Walk",
            body: "Tree Walk: Ethos Knowledge Walk (tree-derived; source: docs/knowledge/ethos/ethos-knowledge-tree.json)",
          },
          {
            title: "Key files",
            body: "- docs/ethos/ideology.json",
          },
        ],
      },
      debug: {
        intent_id: "hybrid.warp_ethos_relation",
      },
    } as Record<string, unknown>;

    const result = applyHelixAskSuccessSurface(args);

    expect(String(result.text)).toContain("A warp bubble is a modeled spacetime geometry");
    expect(String(result.text)).toContain("Mission ethos");
    expect(String(result.text)).not.toMatch(/\bTree Walk\b/i);
    expect((result.debug as Record<string, unknown>).answer_completion_floor_relation_repair).toBe(
      true,
    );
  });

  it("restores repo-grounded visible text from debug answer state when the payload collapses to a short artifact block", () => {
    const args = buildBaseArgs();
    args.requestData.question = "How does fast quality mode alter answer generation deadlines?";
    args.payload = {
      text: "Key files\n- docs/helix-ask-reasoning-latency-2026-02-16.md",
      answer: "Key files\n- docs/helix-ask-reasoning-latency-2026-02-16.md",
      envelope: {
        answer: "",
        sections: [
          {
            title: "Key files",
            body: "- docs/helix-ask-reasoning-latency-2026-02-16.md",
          },
        ],
      },
      debug: {
        intent_domain: "repo",
        answer_mode: "repo_grounded",
        answer_runtime_fallback_direct: true,
        answer_final_text:
          "How does fast quality mode alter answer generation deadlines is grounded in docs/helix-ask-reasoning-latency-2026-02-16.md. " +
          "Direct Answer: Fast quality mode shortens helper and finalize budgets so the route prefers deterministic completion sooner.",
      },
    } as Record<string, unknown>;

    const result = applyHelixAskSuccessSurface(args);

    expect(String(result.text)).toContain("Fast quality mode shortens helper and finalize budgets");
    expect(String(result.text)).not.toMatch(/^Key files\b/im);
    expect((result.debug as Record<string, unknown>).answer_completion_floor_source).toBe(
      "debug_answer_text",
    );
    expect((result.debug as Record<string, unknown>).answer_completion_floor_repo_repair).toBe(
      true,
    );
  });

  it("does not invent answer text when no grounded substrate exists", () => {
    const args = buildBaseArgs();
    args.payload = {
      text: "",
      answer: "",
      envelope: {
        answer: "",
        sections: [],
      },
      debug: {},
    } as Record<string, unknown>;
    args.buildMemoryCitation = vi.fn(() => null);
    args.extractResponseEvidenceRefs = vi.fn(() => []);
    args.extractMemoryCitationRolloutIds = vi.fn(() => []);

    const result = applyHelixAskSuccessSurface(args);

    expect(result.text).toBe("");
    expect(result.answer).toBe("");
    expect((result.debug as Record<string, unknown>).answer_completion_floor_applied).toBeUndefined();
  });

  it("records multilang observation signals when rollout stage is active", () => {
    const args = buildBaseArgs();
    args.multilangRollout = {
      stage: "active",
      active: true,
      shadow: false,
      canaryHit: true,
      activePercent: 100,
      promotionFrozen: false,
    };
    args.payload.translated = false;
    args.payload.response_language = "de";
    args.payload.fallback = "fallback answer";
    args.payload.multilang_added_latency_ms = 37;
    args.canonicalTermPreservationRatio = vi.fn(() => 0.91);

    const result = applyHelixAskSuccessSurface(args);

    expect(args.metricsSpies.recordHelixAskMultilangTranslation).toHaveBeenCalledWith(true);
    expect(args.metricsSpies.recordHelixAskMultilangLanguageMatch).toHaveBeenCalledWith(true);
    expect(args.metricsSpies.recordHelixAskMultilangFallback).toHaveBeenCalledWith(true);
    expect(args.metricsSpies.recordHelixAskMultilangCanonicalTerm).toHaveBeenCalledWith(true);
    expect(args.metricsSpies.observeHelixAskMultilangAddedLatency).toHaveBeenCalledWith(37);
    expect(args.recordMultilangObservationSpy).toHaveBeenCalledOnce();
    expect((result.debug as Record<string, unknown>).multilang_translation_miss).toBe(true);
    expect((result.debug as Record<string, unknown>).multilang_language_mismatch).toBe(true);
    expect((result.debug as Record<string, unknown>).multilang_fallback_used).toBe(true);
    expect((result.debug as Record<string, unknown>).multilang_stage_runtime).toEqual({
      stage: "shadow",
      kill_switch: false,
      consecutive_15m_breaches: 1,
      freeze_promotion_until: null,
      last_rollback_reason: null,
    });
  });
});
