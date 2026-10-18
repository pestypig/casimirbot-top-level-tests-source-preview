import { describe, expect, it } from "vitest";

import { __test } from "../scripts/helical-phase6-ab";

describe("helical phase6 harness scoreability classification", () => {
  it("marks payload scoreable only when required semantic fields exist", () => {
    const payload = {
      text: "answer",
      debug: {
        semantic_quality: {
          claim_citation_link_rate: 0.8,
          unsupported_claim_rate: 0.1,
          contradiction_flag: false,
          fail_reasons: [],
        },
      },
    };

    expect(__test.classifyScoreability(payload)).toEqual({
      scoreable: true,
      failClass: null,
      failReason: null,
    });
  });

  it("classifies missing semantic metrics as metric_input_missing", () => {
    const payload = {
      text: "answer",
      debug: {
        semantic_quality: {
          claim_citation_link_rate: 0.2,
          fail_reasons: [],
        },
      },
    };

    expect(__test.classifyScoreability(payload as never)).toEqual({
      scoreable: false,
      failClass: "metric_input_missing",
      failReason: "required_metric_inputs_missing",
    });
  });

  it("classifies malformed metric types as schema_mismatch", () => {
    const payload = {
      text: "answer",
      debug: {
        semantic_quality: {
          claim_citation_link_rate: "bad",
          unsupported_claim_rate: 0.2,
          contradiction_flag: false,
          fail_reasons: [],
        },
      },
    };

    expect(__test.classifyScoreability(payload as never)).toEqual({
      scoreable: false,
      failClass: "schema_mismatch",
      failReason: "semantic_metric_type_mismatch",
    });
  });

  it("does not allow unknown fail_class values", () => {
    expect(__test.classifyScoreability({ fail_class: "weird_failure", fail_reason: "x" } as never)).toEqual({
      scoreable: false,
      failClass: "schema_mismatch",
      failReason: "unknown_fail_class",
    });
  });

  it("uses explicit classifications for parse/http/non-http outcomes", () => {
    expect(__test.metricFromPayload(0, { fail_class: "timeout_soft", fail_reason: "aborted" })).toMatchObject({
      scoreable: false,
      transport_ok: false,
      json_ok: false,
      schema_ok: false,
      pass: false,
      fail_class: "timeout_soft",
      fail_reason: "aborted",
    });

    expect(__test.metricFromPayload(0, { fail_class: "timeout_hard", fail_reason: "hard_timeout" })).toMatchObject({
      scoreable: false,
      transport_ok: false,
      json_ok: false,
      schema_ok: false,
      pass: false,
      fail_class: "timeout_hard",
      fail_reason: "hard_timeout",
    });

    expect(__test.metricFromPayload(0, null)).toMatchObject({
      scoreable: false,
      transport_ok: false,
      json_ok: false,
      schema_ok: false,
      pass: false,
      fail_class: "schema_mismatch",
      fail_reason: "response_payload_not_object",
    });

    expect(__test.metricFromPayload(200, { contract_version: "phase6.ask.v1", fail_class: "invalid_json", fail_reason: "Unexpected token" }, { transportOk: true, jsonOk: false })).toMatchObject({
      scoreable: false,
      transport_ok: true,
      json_ok: false,
      schema_ok: false,
      pass: false,
      fail_class: "invalid_json",
      fail_reason: "Unexpected token",
    });

    expect(__test.metricFromPayload(503, null)).toMatchObject({
      scoreable: false,
      transport_ok: true,
      json_ok: true,
      schema_ok: false,
      pass: false,
      fail_class: "http_error",
      fail_reason: "http_status_503",
    });

    expect(
      __test.metricFromPayload(0, { contract_version: "phase6.ask.v1", fail_class: "circuit_breaker_skip", fail_reason: "circuit_breaker_open_cooldown" }, { transportOk: false, jsonOk: false }),
    ).toMatchObject({
      scoreable: false,
      transport_ok: false,
      http_ok: false,
      json_ok: false,
      schema_ok: false,
      fail_class: "circuit_breaker_skip",
    });
  });
});

describe("helical phase6 validity gates and blocked decision policy", () => {
  const seeds = [1103, 2081] as const;

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    arm: "A",
    promptId: "p1",
    seed: 1103,
    replayIndex: 1,
    attempt: 1,
    traceId: "t1",
    status: 200,
    latencyMs: 10,
    payload: {
      text: "ok",
      debug: {
        semantic_quality: {
          claim_citation_link_rate: 0.8,
          unsupported_claim_rate: 0.2,
          contradiction_flag: false,
          fail_reasons: [],
        },
        event_journal: { replay_parity: true, event_hash: "h" },
      },
    },
    metrics: {
      pass: true,
      transport_ok: true,
      http_ok: true,
      json_ok: true,
      schema_ok: true,
      scoreable: true,
      contradiction: false,
      claim_to_hook_linkage: 0.8,
      unsupported_claim_rate: 0.2,
      replay_flag: true,
      event_hash: "h",
      fail_class: null,
      fail_reason: null,
    },
    ...overrides,
  });

  it("passes validity gates for complete and scoreable coverage", () => {
    const armRows = [
      makeRow({ promptId: "p1", seed: 1103 }),
      makeRow({ promptId: "p2", seed: 1103, metrics: { ...makeRow().metrics, claim_to_hook_linkage: 0.6 } }),
      makeRow({ promptId: "p1", seed: 2081, metrics: { ...makeRow().metrics, unsupported_claim_rate: 0.3 } }),
      makeRow({ promptId: "p2", seed: 2081 }),
    ] as never[];

    const summaryA = __test.summarizeArm(armRows, seeds, 4);
    const summaryB = __test.summarizeArm(armRows, seeds, 4);
    const validity = __test.computeValidity(summaryA, summaryB);

    expect(validity.valid).toBe(true);
    expect(validity.failures).toEqual([]);
  });

  it("blocks decisions and retains locked layers when validity fails", () => {
    const badRows = [
      makeRow({
        status: 0,
        metrics: {
          ...makeRow().metrics,
          pass: false,
          transport_ok: false,
          http_ok: false,
          json_ok: false,
          schema_ok: false,
          scoreable: false,
          claim_to_hook_linkage: 0,
          unsupported_claim_rate: 1,
          fail_class: "timeout_soft",
          fail_reason: "aborted",
        },
      }),
    ] as never[];
    const summaryA = __test.summarizeArm(badRows, seeds, 4);
    const summaryB = __test.summarizeArm(badRows, seeds, 4);
    const validity = __test.computeValidity(summaryA, summaryB);

    const recommended = [{ layer: "telemetry_x_t", decision: "drop", basis: "x" }];
    const locked = [{ layer: "telemetry_x_t", decision: "keep", basis: "phase6_locked_decision" }];
    const resolved = __test.resolveLayerDecisions(validity.valid, recommended as never, locked as never);

    expect(validity.valid).toBe(false);
    expect(resolved.evaluation).toEqual({
      blocked: true,
      reason: "evaluation_blocked_due_to_run_invalidity",
    });
    expect(resolved.layerDecisions[0]).toMatchObject({
      layer: "telemetry_x_t",
      decision: "keep",
    });
    expect(String(resolved.layerDecisions[0].basis)).toContain("evaluation_blocked_due_to_run_invalidity");
  });

  it("non-http outcomes do not inflate json/schema rates and invalid payload paths lower gates", () => {
    const rows = [
      makeRow({ promptId: "p1", seed: 1103 }),
      makeRow({
        promptId: "p2",
        seed: 1103,
        status: 200,
        metrics: {
          ...makeRow().metrics,
          pass: false,
          json_ok: false,
          schema_ok: false,
          scoreable: false,
          fail_class: "invalid_json",
          fail_reason: "Unexpected token",
        },
      }),
      makeRow({
        promptId: "p1",
        seed: 2081,
        status: 200,
        metrics: {
          ...makeRow().metrics,
          pass: false,
          schema_ok: false,
          scoreable: false,
          fail_class: "schema_mismatch",
          fail_reason: "contract_version_mismatch",
        },
      }),
      makeRow({
        promptId: "p2",
        seed: 2081,
        status: 0,
        metrics: {
          ...makeRow().metrics,
          pass: false,
          transport_ok: false,
          http_ok: false,
          json_ok: false,
          schema_ok: false,
          scoreable: false,
          fail_class: "circuit_breaker_skip",
          fail_reason: "circuit_breaker_open_cooldown",
        },
      }),
    ] as never[];

    const summary = __test.summarizeArm(rows, seeds, 4);
    expect(summary.http_status_ok_rate).toBeCloseTo(0.75, 5);
    expect(summary.json_ok_rate).toBeCloseTo(0.5, 5);
    expect(summary.schema_ok_rate).toBeCloseTo(0.25, 5);
    expect(summary.usable_response_rate).toBeCloseTo(0.25, 5);
  });
});
