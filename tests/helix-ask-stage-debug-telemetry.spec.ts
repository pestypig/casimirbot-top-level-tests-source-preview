import { describe, expect, it } from "vitest";

import {
  applyStage0DebugFields,
  applyStage05DebugFields,
  mergeRepoSearchStage0Telemetry,
  mergeStage05Telemetry,
} from "../server/services/helix-ask/runtime/stage-debug-telemetry";

describe("helix ask stage debug telemetry", () => {
  it("merges stage0 telemetry into an active invariant and applies scoped debug fields", () => {
    const merged = mergeRepoSearchStage0Telemetry(
      {
        used: false,
        shadow_only: true,
        candidate_count: 3,
        hit_rate: 0.22,
        fallback_reason: "shadow_only",
        build_age_ms: 120,
        commit: "old",
        rollout_mode: "shadow",
        canary_hit: false,
        soft_must_include_applied: false,
        policy_decision: "shadow_only",
        fail_open_reason: "shadow_only",
      } as any,
      {
        used: true,
        shadow_only: false,
        candidate_count: 7,
        hit_rate: 0.61,
        fallback_reason: null,
        build_age_ms: 80,
        commit: "new",
        rollout_mode: "active",
        canary_hit: true,
        soft_must_include_applied: true,
        policy_decision: "stage0_active",
        fail_open_reason: null,
      } as any,
    );

    expect(merged?.used).toBe(true);
    expect(merged?.shadow_only).toBe(false);
    expect(merged?.candidate_count).toBe(7);
    expect(merged?.build_age_ms).toBe(80);
    expect(merged?.fallback_reason).toBeNull();
    expect(merged?.policy_decision).toBe("stage0_active");

    const debugPayload: Record<string, unknown> = {};
    applyStage0DebugFields(debugPayload, merged, "preflight");

    expect(debugPayload.stage0_used).toBe(true);
    expect(debugPayload.stage0_candidate_count).toBe(7);
    expect(debugPayload.stage0_fallback_reason).toBeNull();
    expect(debugPayload.preflight_stage0_used).toBe(true);
    expect(debugPayload.preflight_stage0_policy_decision).toBe("stage0_active");
  });

  it("merges stage05 telemetry and clears hard fail for soft runtime fail-open", () => {
    const merged = mergeStage05Telemetry(
      {
        used: false,
        file_count: 1,
        card_count: 1,
        kind_counts: { code: 1, doc: 0, config: 0, data: 0, binary: 0 },
        llm_used: false,
        fallback_reason: "stage05_slot_coverage_missing",
        extract_ms: 10,
        total_ms: 20,
        budget_capped: false,
        summary_required: true,
        summary_hard_fail: true,
        summary_fail_reason: "stage05_slot_coverage_missing",
        slot_plan: { required: ["equation"], slots: [] },
        slot_coverage: { required: ["equation"], present: [], missing: ["equation"], ratio: 0 },
        fullfile_mode: false,
        two_pass_used: false,
        two_pass_batches: 0,
        overflow_policy: "single_pass",
        input_scope: "docs_first",
        input_path_count: 1,
        input_wide_added_count: 0,
        input_connectivity_added_count: 0,
        input_seed_signal_token_count: 0,
        input_connected_hint_path_count: 0,
      } as any,
      {
        used: true,
        file_count: 2,
        card_count: 3,
        kind_counts: { code: 1, doc: 2, config: 0, data: 0, binary: 0 },
        llm_used: true,
        fallback_reason: "stage05_llm_http_429",
        extract_ms: 15,
        total_ms: 30,
        budget_capped: false,
        summary_required: true,
        summary_hard_fail: true,
        summary_fail_reason: "stage05_llm_http_429",
        slot_plan: { required: ["equation"], slots: [] },
        slot_coverage: { required: ["equation"], present: ["equation"], missing: [], ratio: 1 },
        fullfile_mode: true,
        two_pass_used: true,
        two_pass_batches: 1,
        overflow_policy: "two_pass",
        input_scope: "code_first",
        input_path_count: 2,
        input_wide_added_count: 1,
        input_connectivity_added_count: 1,
        input_seed_signal_token_count: 4,
        input_connected_hint_path_count: 1,
        llm_error_code: "llm_http_429",
        llm_error_class: "rate_limited",
        llm_retry_after_ms: 500,
        llm_provider_called: true,
      } as any,
    );

    expect(merged?.used).toBe(true);
    expect(merged?.summary_hard_fail).toBe(false);
    expect(merged?.summary_fail_reason).toBeNull();
    expect(merged?.slot_coverage?.ratio).toBe(1);
    expect(merged?.two_pass_used).toBe(true);

    const debugPayload: Record<string, unknown> = {};
    applyStage05DebugFields(debugPayload, merged, "retrieval");

    expect(debugPayload.stage05_used).toBe(true);
    expect(debugPayload.stage05_summary_hard_fail).toBe(false);
    expect(debugPayload.stage05_soft_runtime_fail_open).toBe(false);
    expect(debugPayload.stage05_two_pass_used).toBe(true);
    expect(debugPayload.retrieval_stage05_slot_coverage).toEqual(merged?.slot_coverage);
  });

  it("applies stage05 soft runtime fail-open without promoting a hard fail", () => {
    const debugPayload: Record<string, unknown> = {};

    applyStage05DebugFields(
      debugPayload,
      {
        used: false,
        file_count: 1,
        card_count: 1,
        kind_counts: { code: 0, doc: 1, config: 0, data: 0, binary: 0 },
        llm_used: true,
        fallback_reason: "stage05_llm_http_401",
        extract_ms: 12,
        total_ms: 18,
        budget_capped: false,
        summary_required: true,
        summary_hard_fail: true,
        summary_fail_reason: "stage05_llm_http_401",
        slot_plan: { required: ["equation"], slots: [] },
        slot_coverage: { required: ["equation"], present: ["equation"], missing: [], ratio: 1 },
        fullfile_mode: false,
        two_pass_used: false,
        two_pass_batches: 0,
        overflow_policy: "single_pass",
        input_scope: "docs_first",
        input_path_count: 1,
        input_wide_added_count: 0,
        input_connectivity_added_count: 0,
        input_seed_signal_token_count: 0,
        input_connected_hint_path_count: 0,
        llm_error_code: "llm_http_401",
        llm_error_class: "transport",
        llm_retry_after_ms: 0,
        llm_provider_called: true,
      } as any,
      "repair",
    );

    expect(debugPayload.stage05_summary_hard_fail).toBe(false);
    expect(debugPayload.stage05_soft_runtime_fail_open).toBe(true);
    expect(debugPayload.stage05_fallback_reason).toBe("stage05_llm_http_401");
    expect(debugPayload.repair_stage05_summary_hard_fail).toBe(false);
    expect(debugPayload.repair_stage05_soft_runtime_fail_open).toBe(true);
    expect(debugPayload.repair_stage05_soft_runtime_fail_reason).toBe("stage05_llm_http_401");
  });

  it("normalizes pipeline stage05 coverage telemetry to code_path when the route narrows coverage", () => {
    const debugPayload: Record<string, unknown> = {
      pipeline_stage05_code_path_only: true,
    };

    applyStage05DebugFields(
      debugPayload,
      {
        used: true,
        file_count: 2,
        card_count: 8,
        kind_counts: { code: 1, doc: 7, config: 0, data: 0, binary: 0 },
        llm_used: false,
        fallback_reason: null,
        extract_ms: 20,
        total_ms: 30,
        budget_capped: false,
        summary_required: true,
        summary_hard_fail: false,
        summary_fail_reason: null,
        slot_plan: { required: ["definition", "mechanism", "code_path"], slots: [] },
        slot_coverage: {
          required: ["definition", "mechanism", "code_path"],
          present: ["code_path"],
          missing: ["definition", "mechanism"],
          ratio: 0.3333,
        },
        fullfile_mode: false,
        two_pass_used: false,
        two_pass_batches: 0,
        overflow_policy: "single_pass",
        input_scope: "docs_first",
        input_path_count: 2,
        input_wide_added_count: 0,
        input_connectivity_added_count: 0,
        input_seed_signal_token_count: 0,
        input_connected_hint_path_count: 0,
      } as any,
      "retrieval",
    );

    expect(debugPayload.stage05_slot_plan).toMatchObject({
      required: ["code_path"],
    });
    expect(debugPayload.stage05_slot_coverage).toEqual({
      required: ["code_path"],
      present: ["code_path"],
      missing: [],
      ratio: 1,
    });
    expect(debugPayload.retrieval_stage05_slot_coverage).toEqual({
      required: ["code_path"],
      present: ["code_path"],
      missing: [],
      ratio: 1,
    });
  });
});
