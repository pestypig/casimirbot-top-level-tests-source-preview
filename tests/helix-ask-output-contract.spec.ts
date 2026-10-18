import { afterEach, describe, expect, it } from "vitest";

import { __testHelixAskOutputContract } from "../server/routes/agi.plan";

describe("Helix Ask output contract normalization", () => {
  afterEach(() => {
    delete process.env.HELIX_ASK_LIVE_DEBUG_MODE;
  });

  it("classifies timeout semantics into soft vs hard classes", () => {
    expect(__testHelixAskOutputContract.classifyHelixAskTimeoutFailClass("This operation was aborted")).toBe("timeout_soft");
    expect(__testHelixAskOutputContract.classifyHelixAskTimeoutFailClass("request timeout after 10000ms")).toBe("timeout_hard");
    expect(__testHelixAskOutputContract.classifyHelixAskTimeoutFailClass("validation failed")).toBeNull();
  });

  it("normalizes error payloads into phase 6 scoring envelope", () => {
    const requestMetadata = __testHelixAskOutputContract.buildHelixAskRequestMetadata({
      question: "why",
      traceId: "phase6-live-A-p01-s7-r2",
      seed: 7,
      sessionId: "s1",
    });
    const payload = __testHelixAskOutputContract.normalizeHelixAskErrorEnvelope(
      500,
      { ok: false, error: "helix_ask_unhandled", message: "This operation was aborted" },
      requestMetadata,
      Date.now() - 25,
    ) as {
      contract_version?: string;
      request_metadata?: { replay?: { index?: number | null; isReplay?: boolean } };
      status?: { ok?: boolean; http_status?: number; fail_class?: string; fail_reason?: string };
      timing?: { elapsed_ms?: number };
      debug?: { trace_id?: string | null };
    };

    expect(payload.contract_version).toBe(__testHelixAskOutputContract.contractVersion);
    expect(payload.request_metadata?.replay?.index).toBe(2);
    expect(payload.request_metadata?.replay?.isReplay).toBe(true);
    expect(payload.status).toMatchObject({
      ok: false,
      http_status: 500,
      fail_class: "timeout_soft",
      fail_reason: "This operation was aborted",
    });
    expect((payload.timing?.elapsed_ms ?? 0) >= 20).toBe(true);
    expect(payload.debug?.trace_id).toBe("phase6-live-A-p01-s7-r2");
  });

  it("does not count timeout-class failures toward circuit cooldown", () => {
    expect(
      __testHelixAskOutputContract.shouldCountHelixAskCircuitFailure({
        status: 500,
        fail_class: "timeout_hard",
        fail_reason: "helix_ask_timeout",
        message: "Request timed out",
      }),
    ).toBe(false);

    expect(
      __testHelixAskOutputContract.shouldCountHelixAskCircuitFailure(
        new Error("Cannot access 'selectedMove' before initialization"),
      ),
    ).toBe(true);
  });

  it("slims live debug payloads while preserving the deep export reference", () => {
    const fullDebug = {
      debug_export_ref: { endpoint: "/api/agi/ask/turn/t1/debug-export", turn_id: "t1" },
      debug_export_payload_hash: "hash-1",
      route_reason_code: "repo_code_answer",
      final_answer_source: "final_answer_draft",
      terminal_artifact_kind: "model_synthesized_answer",
      route_authority_audit: {
        route_authority_ok: true,
        violation_codes: [],
      },
      loop_parity_trace: {
        actual_tool_calls: [],
        unexpected_tool_calls: [],
        short_circuit_risk_flags: [],
      },
      ask_turn_solver_trace: {
        route: "repo_code_answer",
        completed_solver_path: true,
        source_target_intent: { source: "repo" },
        selected_path: "server/routes/agi.plan.ts",
      },
      current_turn_artifact_ledger: Array.from({ length: 12 }, (_, index) => ({
        artifact_id: `artifact-${index}`,
      })),
      evidence_observations: Array.from({ length: 500 }, (_, index) => ({
        id: `candidate-${index}`,
      })),
      tree_walks: [{ id: "legacy-tree-walk" }],
    };
    const payload = {
      turn_id: "t1",
      trace_id: "trace-1",
      answer: "Final answer",
      debug_export_ref: fullDebug.debug_export_ref,
      debug_export_payload_hash: "hash-1",
      debug: fullDebug,
    };

    const slimmed = __testHelixAskOutputContract.prepareHelixAskLiveResponsePayload(payload) as {
      live_debug_mode?: string;
      debug?: Record<string, unknown>;
    };

    expect(slimmed.live_debug_mode).toBe("slim");
    expect(slimmed.debug?.full_debug_export_ref).toEqual(fullDebug.debug_export_ref);
    expect(slimmed.debug?.full_debug_export_payload_hash).toBe("hash-1");
    expect(slimmed.debug?.route_authority_audit).toEqual(fullDebug.route_authority_audit);
    expect(slimmed.debug?.loop_parity_trace).toEqual(fullDebug.loop_parity_trace);
    expect(slimmed.debug?.ask_turn_solver_trace).toEqual(fullDebug.ask_turn_solver_trace);
    expect(slimmed.debug?.evidence_observations).toBeUndefined();
    expect(slimmed.debug?.tree_walks).toBeUndefined();
    expect(slimmed.debug?.current_turn_artifact_ledger).toMatchObject({
      count: 12,
      truncated: true,
    });
    expect(slimmed.debug?.live_debug_slimming).toMatchObject({
      omitted_fields: ["evidence_observations", "tree_walks"],
      omitted_field_count: 2,
      full_export_available: true,
    });
  });

  it("allows deep live debug by request or environment", () => {
    const payload = {
      debug: {
        evidence_observations: [{ id: "kept-in-deep-mode" }],
      },
    };

    expect(__testHelixAskOutputContract.readHelixAskLiveDebugMode({ debugMode: "deep" })).toBe("deep");
    expect(
      __testHelixAskOutputContract.prepareHelixAskLiveResponsePayload(payload, { mode: "deep" }),
    ).toBe(payload);

    process.env.HELIX_ASK_LIVE_DEBUG_MODE = "deep";
    expect(__testHelixAskOutputContract.readHelixAskLiveDebugMode()).toBe("deep");
  });
});
