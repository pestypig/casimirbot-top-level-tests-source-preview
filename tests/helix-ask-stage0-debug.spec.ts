import { describe, expect, it } from "vitest";
import { __testHelixAskStage0Debug } from "../server/routes/agi.plan";

describe("helix ask stage0 debug propagation", () => {
  it("writes soft must-include telemetry into global and scoped debug payloads", () => {
    const debugPayload: Record<string, unknown> = {};
    __testHelixAskStage0Debug.applyStage0DebugFields(
      debugPayload,
      {
        used: false,
        shadow_only: true,
        candidate_count: 8,
        hit_rate: 0.25,
        fallback_reason: "stage0_shadow_mode",
        build_age_ms: 1250,
        commit: "abc123",
        rollout_mode: "shadow",
        canary_hit: true,
        soft_must_include_applied: true,
        policy_decision: "stage0_shadow_mode",
        fail_open_reason: "stage0_shadow_mode",
      },
      "retrieval",
    );

    expect(debugPayload.stage0_soft_must_include_applied).toBe(true);
    expect(debugPayload.retrieval_stage0_soft_must_include_applied).toBe(true);
  });

  it("merges soft must-include telemetry deterministically", () => {
    const merged = __testHelixAskStage0Debug.mergeRepoSearchStage0Telemetry(
      {
        used: false,
        shadow_only: true,
        candidate_count: 1,
        hit_rate: 0,
        fallback_reason: "stage0_shadow_mode",
        build_age_ms: null,
        commit: null,
        soft_must_include_applied: false,
      },
      {
        used: true,
        shadow_only: false,
        candidate_count: 3,
        hit_rate: 0.5,
        fallback_reason: null,
        build_age_ms: null,
        commit: "def456",
        soft_must_include_applied: true,
      },
    );

    expect(merged?.soft_must_include_applied).toBe(true);
    expect(merged?.used).toBe(true);
    expect(merged?.candidate_count).toBe(3);
  });

  it("keeps effective stage0 state consistent when later pass is bypassed", () => {
    const debugPayload: Record<string, unknown> = {};

    __testHelixAskStage0Debug.applyStage0DebugFields(debugPayload, {
      used: true,
      shadow_only: false,
      candidate_count: 12,
      hit_rate: 0.5,
      fallback_reason: null,
      build_age_ms: 500,
      commit: "abc123",
      rollout_mode: "full",
      canary_hit: true,
      policy_decision: "stage0_active",
      fail_open_reason: null,
      soft_must_include_applied: true,
    });

    __testHelixAskStage0Debug.applyStage0DebugFields(debugPayload, {
      used: false,
      shadow_only: false,
      candidate_count: 0,
      hit_rate: 0,
      fallback_reason: "explicit_path_query",
      build_age_ms: 700,
      commit: "abc123",
      rollout_mode: "full",
      canary_hit: true,
      policy_decision: "explicit_path_query",
      fail_open_reason: "explicit_path_query",
      soft_must_include_applied: true,
    });

    expect(debugPayload.stage0_used).toBe(true);
    expect(debugPayload.stage0_policy_decision).toBe("stage0_active");
    expect(debugPayload.stage0_fallback_reason).toBeNull();
    expect(debugPayload.stage0_fail_open_reason).toBeNull();
  });

  it("prefers active policy when merging telemetry across passes", () => {
    const merged = __testHelixAskStage0Debug.mergeRepoSearchStage0Telemetry(
      {
        used: true,
        shadow_only: false,
        candidate_count: 10,
        hit_rate: 0.2,
        fallback_reason: null,
        build_age_ms: 100,
        commit: "abc123",
        policy_decision: "stage0_active",
        fail_open_reason: null,
      },
      {
        used: false,
        shadow_only: false,
        candidate_count: 0,
        hit_rate: 0,
        fallback_reason: "explicit_path_query",
        build_age_ms: 120,
        commit: "abc123",
        policy_decision: "explicit_path_query",
        fail_open_reason: "explicit_path_query",
      },
    );

    expect(merged?.used).toBe(true);
    expect(merged?.policy_decision).toBe("stage0_active");
    expect(merged?.fallback_reason).toBeNull();
    expect(merged?.fail_open_reason).toBeNull();
  });

  it("clears sticky stage0.5 hard-fail when a later pass recovers", () => {
    const merged = __testHelixAskStage0Debug.mergeStage05Telemetry(
      {
        used: true,
        file_count: 12,
        card_count: 0,
        kind_counts: { code: 0, doc: 0, config: 0, data: 0, binary: 0 },
        llm_used: true,
        fallback_reason: null,
        extract_ms: 40,
        total_ms: 1800,
        budget_capped: true,
        summary_required: true,
        summary_hard_fail: true,
        summary_fail_reason: "stage05_slot_coverage_missing:code_path",
        slot_plan: {
          mode: "dynamic",
          slots: ["definition", "mechanism", "equation", "code_path"],
          required: ["definition", "mechanism", "equation", "code_path"],
        },
        slot_coverage: {
          required: ["definition", "mechanism", "equation", "code_path"],
          present: ["definition", "mechanism", "equation"],
          missing: ["code_path"],
          ratio: 0.75,
        },
        fullfile_mode: true,
        two_pass_used: true,
        two_pass_batches: 2,
        overflow_policy: "two_pass",
      },
      {
        used: true,
        file_count: 12,
        card_count: 8,
        kind_counts: { code: 2, doc: 6, config: 0, data: 0, binary: 0 },
        llm_used: true,
        fallback_reason: null,
        extract_ms: 8,
        total_ms: 520,
        budget_capped: false,
        summary_required: true,
        summary_hard_fail: false,
        summary_fail_reason: null,
        slot_plan: {
          mode: "dynamic",
          slots: ["definition", "mechanism", "equation", "code_path"],
          required: ["definition", "mechanism", "equation", "code_path"],
        },
        slot_coverage: {
          required: ["definition", "mechanism", "equation", "code_path"],
          present: ["definition", "mechanism", "equation", "code_path"],
          missing: [],
          ratio: 1,
        },
        fullfile_mode: true,
        two_pass_used: false,
        two_pass_batches: 1,
        overflow_policy: "two_pass",
      },
    );

    expect(merged?.summary_hard_fail).toBe(false);
    expect(merged?.summary_fail_reason).toBeNull();
    expect(merged?.slot_coverage?.missing ?? []).toEqual([]);
    expect(merged?.card_count).toBe(8);
  });

  it("updates debug payload to cleared stage0.5 hard-fail after recovery", () => {
    const debugPayload: Record<string, unknown> = {};

    __testHelixAskStage0Debug.applyStage05DebugFields(debugPayload, {
      used: true,
      file_count: 12,
      card_count: 0,
      kind_counts: { code: 0, doc: 0, config: 0, data: 0, binary: 0 },
      llm_used: true,
      fallback_reason: null,
      extract_ms: 55,
      total_ms: 1800,
      budget_capped: true,
      summary_required: true,
      summary_hard_fail: true,
      summary_fail_reason: "stage05_slot_coverage_missing:code_path",
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "mechanism", "equation", "code_path"],
        required: ["definition", "mechanism", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "mechanism", "equation", "code_path"],
        present: ["definition", "mechanism", "equation"],
        missing: ["code_path"],
        ratio: 0.75,
      },
      fullfile_mode: true,
      two_pass_used: true,
      two_pass_batches: 2,
      overflow_policy: "two_pass",
    });

    __testHelixAskStage0Debug.applyStage05DebugFields(debugPayload, {
      used: true,
      file_count: 12,
      card_count: 8,
      kind_counts: { code: 2, doc: 6, config: 0, data: 0, binary: 0 },
      llm_used: true,
      fallback_reason: null,
      extract_ms: 9,
      total_ms: 540,
      budget_capped: false,
      summary_required: true,
      summary_hard_fail: false,
      summary_fail_reason: null,
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "mechanism", "equation", "code_path"],
        required: ["definition", "mechanism", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "mechanism", "equation", "code_path"],
        present: ["definition", "mechanism", "equation", "code_path"],
        missing: [],
        ratio: 1,
      },
      fullfile_mode: true,
      two_pass_used: false,
      two_pass_batches: 1,
      overflow_policy: "two_pass",
    });

    expect(debugPayload.stage05_summary_hard_fail).toBe(false);
    expect(debugPayload.stage05_summary_fail_reason).toBeNull();
  });

  it("downgrades code_path-only hard-fail for equation-required summaries during merge", () => {
    const merged = __testHelixAskStage0Debug.mergeStage05Telemetry(undefined, {
      used: true,
      file_count: 12,
      card_count: 0,
      kind_counts: { code: 0, doc: 0, config: 0, data: 0, binary: 0 },
      llm_used: true,
      fallback_reason: null,
      extract_ms: 61,
      total_ms: 36164,
      budget_capped: true,
      summary_required: true,
      summary_hard_fail: true,
      summary_fail_reason: "stage05_slot_coverage_missing:code_path",
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "mechanism", "equation", "code_path", "example"],
        required: ["definition", "mechanism", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "mechanism", "equation", "code_path"],
        present: ["definition", "mechanism", "equation"],
        missing: ["code_path"],
        ratio: 0.75,
      },
      fullfile_mode: true,
      two_pass_used: true,
      two_pass_batches: 2,
      overflow_policy: "two_pass",
    });

    expect(merged?.summary_hard_fail).toBe(false);
    expect(merged?.summary_fail_reason).toBeNull();
    expect(merged?.slot_coverage?.missing ?? []).toEqual(["code_path"]);
  });

  it("marks soft code_path gap in debug and suppresses hard-fail flag", () => {
    const debugPayload: Record<string, unknown> = {};

    __testHelixAskStage0Debug.applyStage05DebugFields(debugPayload, {
      used: true,
      file_count: 12,
      card_count: 0,
      kind_counts: { code: 0, doc: 0, config: 0, data: 0, binary: 0 },
      llm_used: true,
      fallback_reason: null,
      extract_ms: 61,
      total_ms: 36164,
      budget_capped: true,
      summary_required: true,
      summary_hard_fail: true,
      summary_fail_reason: "stage05_slot_coverage_missing:code_path",
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "mechanism", "equation", "code_path", "example"],
        required: ["definition", "mechanism", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "mechanism", "equation", "code_path"],
        present: ["definition", "mechanism", "equation"],
        missing: ["code_path"],
        ratio: 0.75,
      },
      fullfile_mode: true,
      two_pass_used: true,
      two_pass_batches: 2,
      overflow_policy: "two_pass",
    });

    expect(debugPayload.stage05_summary_hard_fail).toBe(false);
    expect(debugPayload.stage05_summary_fail_reason).toBeNull();
    expect(debugPayload.stage05_soft_code_path_gap_applied).toBe(true);
  });

  it("downgrades stage0.5 llm timeout hard-fail to soft runtime fail-open", () => {
    const merged = __testHelixAskStage0Debug.mergeStage05Telemetry(undefined, {
      used: true,
      file_count: 12,
      card_count: 0,
      kind_counts: { code: 0, doc: 0, config: 0, data: 0, binary: 0 },
      llm_used: false,
      fallback_reason: null,
      extract_ms: 7,
      total_ms: 29231,
      budget_capped: false,
      summary_required: true,
      summary_hard_fail: true,
      summary_fail_reason: "stage05_llm_timeout",
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "equation", "code_path"],
        required: ["definition", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "equation", "code_path"],
        present: [],
        missing: ["definition", "equation", "code_path"],
        ratio: 0,
      },
      fullfile_mode: true,
      two_pass_used: true,
      two_pass_batches: 1,
      overflow_policy: "two_pass",
    });

    expect(merged?.summary_hard_fail).toBe(false);
    expect(merged?.summary_fail_reason).toBeNull();
  });

  it("marks soft runtime fail-open in debug and suppresses hard-fail flag", () => {
    const debugPayload: Record<string, unknown> = {};

    __testHelixAskStage0Debug.applyStage05DebugFields(debugPayload, {
      used: true,
      file_count: 12,
      card_count: 0,
      kind_counts: { code: 0, doc: 0, config: 0, data: 0, binary: 0 },
      llm_used: false,
      fallback_reason: null,
      extract_ms: 7,
      total_ms: 29231,
      budget_capped: false,
      summary_required: true,
      summary_hard_fail: true,
      summary_fail_reason: "stage05_llm_timeout",
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "equation", "code_path"],
        required: ["definition", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "equation", "code_path"],
        present: [],
        missing: ["definition", "equation", "code_path"],
        ratio: 0,
      },
      fullfile_mode: true,
      two_pass_used: true,
      two_pass_batches: 1,
      overflow_policy: "two_pass",
    });

    expect(debugPayload.stage05_summary_hard_fail).toBe(false);
    expect(debugPayload.stage05_summary_fail_reason).toBeNull();
    expect(debugPayload.stage05_soft_runtime_fail_open).toBe(true);
  });

  it("treats missing required slot coverage as hard-fail even when cards exist", () => {
    const merged = __testHelixAskStage0Debug.mergeStage05Telemetry(undefined, {
      used: true,
      file_count: 12,
      card_count: 8,
      kind_counts: { code: 4, doc: 1, config: 3, data: 0, binary: 0 },
      llm_used: true,
      fallback_reason: null,
      extract_ms: 15,
      total_ms: 29112,
      budget_capped: false,
      summary_required: true,
      summary_hard_fail: false,
      summary_fail_reason: null,
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "equation", "code_path"],
        required: ["definition", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "equation", "code_path"],
        present: [],
        missing: ["definition", "equation", "code_path"],
        ratio: 0,
      },
      fullfile_mode: true,
      two_pass_used: true,
      two_pass_batches: 1,
      overflow_policy: "two_pass",
    });

    expect(merged?.summary_hard_fail).toBe(true);
    expect(merged?.summary_fail_reason).toBe("stage05_slot_coverage_missing");
  });

  it("marks debug hard-fail for missing required slot coverage despite nonzero cards", () => {
    const debugPayload: Record<string, unknown> = {};

    __testHelixAskStage0Debug.applyStage05DebugFields(debugPayload, {
      used: true,
      file_count: 12,
      card_count: 8,
      kind_counts: { code: 4, doc: 1, config: 3, data: 0, binary: 0 },
      llm_used: true,
      fallback_reason: null,
      extract_ms: 15,
      total_ms: 29112,
      budget_capped: false,
      summary_required: true,
      summary_hard_fail: false,
      summary_fail_reason: null,
      slot_plan: {
        mode: "dynamic",
        slots: ["definition", "equation", "code_path"],
        required: ["definition", "equation", "code_path"],
      },
      slot_coverage: {
        required: ["definition", "equation", "code_path"],
        present: [],
        missing: ["definition", "equation", "code_path"],
        ratio: 0,
      },
      fullfile_mode: true,
      two_pass_used: true,
      two_pass_batches: 1,
      overflow_policy: "two_pass",
    });

    expect(debugPayload.stage05_summary_hard_fail).toBe(true);
    expect(debugPayload.stage05_summary_fail_reason).toBe("stage05_slot_coverage_missing");
  });
});
