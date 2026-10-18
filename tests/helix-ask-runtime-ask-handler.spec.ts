import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AskHandlerDeps = Record<string, unknown>;

const buildDeps = (): AskHandlerDeps => ({
  sessionMemoryEnabled: false,
  interpreterActive: true,
  interpreterSchemaVersion: "helix.interpreter.v1",
  langSchemaVersion: "helix.lang.v1",
  hasExplicitResponseLanguageOverride: () => false,
  resolveSessionPinnedResponseLanguage: () => null,
  resolveDetectedResponseLanguageCandidate: () => null,
  inferLanguageFromScript: () => null,
  normalizeLanguageTag: (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null,
  resolveHelixAskInterpreterResolution: async (args: Record<string, unknown>) => ({
    artifact: (args.providedArtifact as Record<string, unknown> | null | undefined) ?? null,
    status: (args.providedStatus as string | null | undefined) ?? null,
    error: (args.providedError as string | null | undefined) ?? null,
  }),
  resolveHelixAskResponseLanguage: () => "en",
  shouldApplyInterpreterDispatchState: (args: Record<string, unknown>) => args.status === "ok",
  clampNumber: (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value)),
  isEnglishLikeLanguage: (value: string) => value.toLowerCase().startsWith("en"),
  shouldForceInterpreterFailClosed: () => false,
  buildLocalizedConfirmPrompt: () => "Please confirm.",
  buildClassifierResultForAsk: () => null,
  resolveRouteReasonForAsk: () => "mode:read",
  resolveFinalGateOutcomeForAsk: () => "in_progress",
  extractResponseTextForHistory: (payload: Record<string, unknown> | null) => {
    if (!payload) return null;
    for (const candidate of [payload.text, payload.answer, payload.message]) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
    return null;
  },
  coerceDebugString: (value: unknown) => (typeof value === "string" ? value : null),
  buildRequestMetadata: (request: Record<string, unknown>) => ({
    session_id: typeof request.sessionId === "string" ? request.sessionId : null,
    trace_id: typeof request.traceId === "string" ? request.traceId : null,
    turn_id: typeof request.turnId === "string" ? request.turnId : null,
    thread_id: typeof request.threadId === "string" ? request.threadId : null,
    source_language:
      typeof request.sourceLanguage === "string" ? request.sourceLanguage : null,
    language_detected:
      typeof request.languageDetected === "string" ? request.languageDetected : null,
    language_confidence:
      typeof request.languageConfidence === "number" ? request.languageConfidence : null,
    code_mixed: request.codeMixed === true,
    pivot_confidence:
      typeof request.pivotConfidence === "number" ? request.pivotConfidence : null,
    translated: request.translated === true,
    lang_schema_version:
      typeof request.lang_schema_version === "string" ? request.lang_schema_version : null,
    response_language:
      typeof request.responseLanguage === "string" ? request.responseLanguage : "en",
  }),
  resolveMultilangRollout: () => ({
    stage: "off",
    active: false,
    shadow: false,
    canaryHit: false,
    activePercent: 0,
    promotionFrozen: false,
  }),
  resolveDispatchState: () => null,
});

const buildExecutionDeps = (): AskHandlerDeps => ({
  ...buildDeps(),
  buildStrictFailLedger: () => null,
  buildMemoryCitation: () => null,
  extractResponseEvidenceRefs: () => [],
  extractMemoryCitationRolloutIds: () => [],
  normalizeErrorEnvelope: (_status: number, payload: unknown) =>
    payload as Record<string, unknown>,
  outputContractVersion: "helix.ask.output.v1",
  multilangRuntimeState: {
    stage: "off",
    killSwitch: false,
    consecutive15mBreaches: 0,
    freezePromotionUntilMs: null,
    lastRollbackReason: null,
  },
  multilangPromotionSlo: 0.995,
  multilangRollback15mSlo: 0.98,
  multilangRollback24hSlo: 0.99,
  metrics: {
    recordHelixAskMultilangTranslation: () => {},
    recordHelixAskMultilangLanguageMatch: () => {},
    recordHelixAskMultilangFallback: () => {},
    recordHelixAskMultilangCanonicalTerm: () => {},
    observeHelixAskMultilangAddedLatency: () => {},
  },
  recordMultilangObservation: () => {},
  recordFailure: () => {},
  recordSuccess: () => {},
  classifyTimeoutFailClass: () => null,
  canonicalTermPreservationRatio: () => 1,
  withTimeout: async <T>(promise: Promise<T>) => await promise,
});

describe("helix ask runtime ask-handler", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-ask-runtime-handler-"));
    process.env.HELIX_THREAD_LEDGER_PATH = path.join(tempDir, "helix-thread-ledger.jsonl");
    process.env.HELIX_THREAD_INDEX_PATH = path.join(tempDir, "helix-thread-index.json");
    process.env.HELIX_THREAD_PERSIST = "1";
    vi.resetModules();
  });

  afterEach(async () => {
    const { __resetHelixThreadLedgerStore } = await import(
      "../server/services/helix-thread/ledger"
    );
    const { __resetHelixThreadRegistryStore } = await import(
      "../server/services/helix-thread/registry"
    );
    __resetHelixThreadLedgerStore();
    __resetHelixThreadRegistryStore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.HELIX_THREAD_LEDGER_PATH;
    delete process.env.HELIX_THREAD_INDEX_PATH;
    delete process.env.HELIX_THREAD_PERSIST;
    vi.clearAllMocks();
  });

  it("does not hard-block provider_error fallback artifacts", async () => {
    const { prepareHelixAskRouteRequest } = await import(
      "../server/services/helix-ask/runtime/ask-handler"
    );

    const result = await prepareHelixAskRouteRequest({
      request: {
        question: "What is the Alcubierre bubble?",
        sourceQuestion: "ä»€ä¹ˆæ˜¯é˜¿å°”åº“æ¯”è€¶å°”æ‰­æ›²ç‚®?",
        sourceLanguage: "zh-hans",
        languageDetected: "zh-hans",
        translated: true,
        pivotConfidence: 0.93,
        traceId: "provider-error-fallback",
        interpreter: {
          schema_version: "helix.interpreter.v1",
          source_text: "ä»€ä¹ˆæ˜¯é˜¿å°”åº“æ¯”è€¶å°”æ‰­æ›²ç‚®?",
          source_language: "zh-hans",
          code_mixed: false,
          pivot_candidates: [{ text: "What is the Alcubierre bubble?", confidence: 0.45 }],
          selected_pivot: { text: "What is the Alcubierre bubble?", confidence: 0.45 },
          concept_candidates: [],
          term_preservation: { ratio: 1, missing_terms: [] },
          ambiguity: { top2_gap: 0, ambiguous: true },
          term_ids: [],
          concept_ids: [],
          confirm_prompt: "ä½ æ˜¯æŒ‡â€œAlcubierre bubbleâ€å—ï¼Ÿ",
          dispatch_state: "blocked",
        },
        interpreterStatus: "provider_error",
        interpreterError: "interpreter_http_404:not_found",
      },
      deps: buildDeps() as never,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected prepared request");
    }
    expect(result.requestData.interpreterStatus).toBe("provider_error");
    expect(result.requestData.interpreterError).toBe("interpreter_http_404:not_found");
    expect(result.requestData.turnId).toBe("provider-error-fallback");
  });

  it("returns a confirmation payload for blocked interpreter dispatch", async () => {
    const { prepareHelixAskRouteRequest } = await import(
      "../server/services/helix-ask/runtime/ask-handler"
    );

    const result = await prepareHelixAskRouteRequest({
      request: {
        question: "What is the Alcubierre bubble?",
        sourceQuestion: "ä»€ä¹ˆæ˜¯é˜¿å°”åº“æ¯”è€¶å°”æ‰­æ›²ç‚®?",
        sourceLanguage: "zh-hans",
        languageDetected: "zh-hans",
        traceId: "interpreter-confirm",
        interpreter: {
          schema_version: "helix.interpreter.v1",
          source_text: "ä»€ä¹ˆæ˜¯é˜¿å°”åº“æ¯”è€¶å°”æ‰­æ›²ç‚®?",
          source_language: "zh-hans",
          code_mixed: false,
          pivot_candidates: [{ text: "What is the Alcubierre bubble?", confidence: 0.45 }],
          selected_pivot: { text: "What is the Alcubierre bubble?", confidence: 0.45 },
          concept_candidates: [],
          term_preservation: { ratio: 1, missing_terms: [] },
          ambiguity: { top2_gap: 0, ambiguous: true },
          term_ids: [],
          concept_ids: [],
          confirm_prompt: "Please confirm.",
          dispatch_state: "blocked",
        },
        interpreterStatus: "ok",
      },
      deps: buildDeps() as never,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected confirmation response");
    }
    expect(result.status).toBe(200);
    expect(result.payload.fail_reason).toBe("HELIX_INTERPRETER_CONFIRM_REQUIRED");
    expect(result.payload.needs_confirmation).toBe(true);
    expect(result.payload.dispatch_state).toBe("confirm");
    expect(result.payload.turn_id).toBe("interpreter-confirm");
  });

  it("resolves explicit thread context with a stable thread id", async () => {
    const { prepareHelixAskRouteRequest, resolveHelixAskRouteContext } = await import(
      "../server/services/helix-ask/runtime/ask-handler"
    );

    const prepared = await prepareHelixAskRouteRequest({
      request: {
        sessionId: "ask-runtime-session",
        question: "How does the ask runtime resolve thread context?",
        traceId: "ask-runtime-context",
      },
      deps: buildDeps() as never,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      throw new Error("expected prepared request");
    }

    const firstContext = resolveHelixAskRouteContext({
      requestData: prepared.requestData,
      deps: buildDeps() as never,
    });
    expect(firstContext.ok).toBe(true);
    if (!firstContext.ok) {
      throw new Error("expected first route context");
    }

    const resumedPrepared = await prepareHelixAskRouteRequest({
      request: {
        sessionId: "ask-runtime-session",
        threadId: firstContext.threadId,
        question: "Continue the same ask thread.",
        traceId: "ask-runtime-context-2",
      },
      deps: buildDeps() as never,
    });
    expect(resumedPrepared.ok).toBe(true);
    if (!resumedPrepared.ok) {
      throw new Error("expected resumed prepared request");
    }

    const resumedContext = resolveHelixAskRouteContext({
      requestData: resumedPrepared.requestData,
      deps: buildDeps() as never,
    });
    expect(resumedContext.ok).toBe(true);
    if (!resumedContext.ok) {
      throw new Error("expected resumed route context");
    }
    expect(resumedContext.threadId).toBe(firstContext.threadId);
    expect(resumedContext.turnId).toBe("ask-runtime-context-2");
  });

  it("executes the ask lifecycle wrapper and finalizes thread state on success", async () => {
    const {
      executeHelixAskRouteFlow,
      prepareHelixAskRouteRequest,
      resolveHelixAskRouteContext,
    } = await import("../server/services/helix-ask/runtime/ask-handler");
    const { buildHelixThreadState, buildHelixTurnState } = await import(
      "../server/services/helix-thread/reducer"
    );

    const prepared = await prepareHelixAskRouteRequest({
      request: {
        sessionId: "ask-runtime-flow-session",
        question: "How does the ask lifecycle wrapper finalize success?",
        traceId: "ask-runtime-flow",
      },
      deps: buildDeps() as never,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      throw new Error("expected prepared request");
    }

    const routeContext = resolveHelixAskRouteContext({
      requestData: prepared.requestData,
      deps: buildDeps() as never,
    });
    expect(routeContext.ok).toBe(true);
    if (!routeContext.ok) {
      throw new Error("expected route context");
    }

    const sent: Array<{ status: number; payload: Record<string, unknown> }> = [];
    await executeHelixAskRouteFlow({
      askStartedAtMs: Date.now(),
      requestTimeoutMs: 5000,
      requestData: routeContext.requestData,
      requestMetadata: routeContext.requestMetadata,
      requestQuestionSeed: prepared.requestQuestionSeed,
      threadId: routeContext.threadId,
      turnId: routeContext.turnId,
      threadContext: routeContext.threadContext,
      includeMultilangMetadata: routeContext.includeMultilangMetadata,
      dispatchState: routeContext.dispatchState,
      multilangRollout: routeContext.multilangRollout,
      keepAlive: {
        send: (status, payload) =>
          sent.push({
            status,
            payload: payload as Record<string, unknown>,
          }),
      },
      strictProvenance: false,
      executeAsk: async (responder) => {
        responder.send(200, {
          text: "A stable answer.",
          debug: {
            policy_prompt_family: "unit-test-family",
          },
        });
      },
      deps: buildExecutionDeps() as never,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.status).toBe(200);
    expect(sent[0]?.payload.thread_id).toBe(routeContext.threadId);
    expect(sent[0]?.payload.turn_id).toBe(routeContext.turnId);

    const turnState = buildHelixTurnState({
      threadId: routeContext.threadId,
      turnId: routeContext.turnId,
    });
    expect(turnState?.status).toBe("completed");

    const threadState = buildHelixThreadState({
      threadId: routeContext.threadId,
    });
    expect(threadState.status).toBe("idle");
    expect(threadState.turns.at(-1)?.assistant_text).toBe("A stable answer.");
  });
});
