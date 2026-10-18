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

describe("helix ask runtime ask-engine", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-ask-engine-"));
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

  it("returns the interpreter confirmation payload without invoking route controls", async () => {
    const { executeHelixAskEngineShell } = await import(
      "../server/services/helix-ask/runtime/ask-engine"
    );

    const resolveExecutionControl = vi.fn();
    const result = await executeHelixAskEngineShell({
      askStartedAtMs: Date.now(),
      requestTimeoutMs: 5000,
      request: {
        question: "What is the Alcubierre bubble?",
        sourceQuestion: "What is the Alcubierre bubble?",
        sourceLanguage: "zh-hans",
        languageDetected: "zh-hans",
        traceId: "ask-engine-confirm",
        interpreter: {
          schema_version: "helix.interpreter.v1",
          source_text: "What is the Alcubierre bubble?",
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
      runtimeDeps: buildDeps() as never,
      executionDeps: buildExecutionDeps() as never,
      resolveExecutionControl,
    });

    expect(result.completed).toBe(false);
    if (result.completed) {
      throw new Error("expected confirmation response");
    }
    expect(result.status).toBe(200);
    expect(result.payload.fail_reason).toBe("HELIX_INTERPRETER_CONFIRM_REQUIRED");
    expect(result.payload.needs_confirmation).toBe(true);
    expect(resolveExecutionControl).not.toHaveBeenCalled();
  });

  it("propagates route-owned early responses and headers", async () => {
    const { executeHelixAskEngineShell } = await import(
      "../server/services/helix-ask/runtime/ask-engine"
    );

    const result = await executeHelixAskEngineShell({
      askStartedAtMs: Date.now(),
      requestTimeoutMs: 5000,
      request: {
        sessionId: "ask-engine-early",
        question: "How does the engine short-circuit?",
        traceId: "ask-engine-early",
      },
      runtimeDeps: buildDeps() as never,
      executionDeps: buildExecutionDeps() as never,
      resolveExecutionControl: () => ({
        allow: false,
        status: 503,
        payload: { error: "circuit_open" },
        headers: { "Retry-After": "7" },
      }),
    });

    expect(result.completed).toBe(false);
    if (result.completed) {
      throw new Error("expected circuit-open response");
    }
    expect(result.status).toBe(503);
    expect(result.payload.error).toBe("circuit_open");
    expect(result.headers).toEqual({ "Retry-After": "7" });
  });

  it("executes the route flow after the shell resolves execution control", async () => {
    const { executeHelixAskEngineShell } = await import(
      "../server/services/helix-ask/runtime/ask-engine"
    );
    const { buildHelixThreadState, buildHelixTurnState } = await import(
      "../server/services/helix-thread/reducer"
    );

    const sent: Array<{ status: number; payload: Record<string, unknown> }> = [];
    let capturedThreadId = "";
    let capturedTurnId = "";

    const result = await executeHelixAskEngineShell({
      askStartedAtMs: Date.now(),
      requestTimeoutMs: 5000,
      request: {
        sessionId: "ask-engine-success",
        question: "How does the ask engine orchestrate the route flow?",
        traceId: "ask-engine-success",
      },
      runtimeDeps: buildDeps() as never,
      executionDeps: buildExecutionDeps() as never,
      resolveExecutionControl: ({ requestData, threadId, turnId }) => {
        capturedThreadId = threadId;
        capturedTurnId = turnId;
        expect(requestData.question).toBe(
          "How does the ask engine orchestrate the route flow?"
        );
        return {
          allow: true,
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
              text: "A stable engine answer.",
              debug: {
                policy_prompt_family: "unit-test-family",
              },
            });
          },
        };
      },
    });

    expect(result.completed).toBe(true);
    if (!result.completed) {
      throw new Error("expected successful engine execution");
    }
    expect(result.threadId).toBe(capturedThreadId);
    expect(result.turnId).toBe(capturedTurnId);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.status).toBe(200);
    expect(sent[0]?.payload.thread_id).toBe(capturedThreadId);
    expect(sent[0]?.payload.turn_id).toBe(capturedTurnId);

    const turnState = buildHelixTurnState({
      threadId: capturedThreadId,
      turnId: capturedTurnId,
    });
    expect(turnState?.status).toBe("completed");

    const threadState = buildHelixThreadState({
      threadId: capturedThreadId,
    });
    expect(threadState.status).toBe("idle");
    expect(threadState.turns.at(-1)?.assistant_text).toBe("A stable engine answer.");
  });
});
