import { describe, expect, it } from "vitest";

import type { HelixAskTraceEvent } from "../server/services/helix-ask/surface/response-debug-payload";
import {
  attachHelixAskReasoningSidebarToDebug,
  buildHelixAskReasoningSidebarFromDebug,
} from "../server/services/helix-ask/surface/reasoning-sidebar";

const coerceDebugString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const coerceDebugBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const coerceDebugNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const coerceDebugObjectArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];

const clipText = (value: string | undefined, limit: number): string => {
  const normalized = String(value ?? "");
  return normalized.length <= limit ? normalized : normalized.slice(0, limit);
};

const traceEvents: HelixAskTraceEvent[] = [
  {
    ts: "2026-04-10T00:00:00.000Z",
    tool: "helix.ask.event",
    stage: "Routing prior",
    detail: "Fallback evaluated",
    ok: true,
    durationMs: 12,
  },
  {
    ts: "2026-04-10T00:00:01.000Z",
    tool: "helix.ask.event",
    stage: "Finalization",
    detail: "Answer cleaned preview",
    ok: true,
    durationMs: 45,
  },
];

describe("helix ask reasoning sidebar", () => {
  it("builds sidebar steps and markdown from debug state", () => {
    const sidebar = buildHelixAskReasoningSidebarFromDebug({
      debugRecord: {
        intent_domain: "repo",
        policy_prompt_family: "repo_technical",
        fallback_reason_taxonomy: "none",
        open_world_bypass_mode: "inactive",
        objective_total_count: 2,
        objective_loop_state: [{ objective_label: "Deadlines" }, { objective_label: "Timeouts" }],
        objective_retrieval_queries: [
          { objective_id: "obj-1", pass_index: 1, queries: ["fast quality mode deadlines"] },
        ],
        objective_finalize_gate_mode: "strict_covered",
        objective_unresolved_count: 0,
        objective_coverage_unresolved_count: 0,
        objective_unknown_block_count: 0,
        objective_reasoning_trace: [
          { objective_id: "obj-1", final_status: "covered", plain_reasoning: "Deadlines are bounded." },
        ],
        objective_step_transcripts: [{ objective_id: "obj-1", verb: "RETRIEVE", decision: "used_repo", llm_model: "none" }],
        objective_assembly_mode: "deterministic_fallback",
        objective_assembly_blocked_reason: "none",
        objective_assembly_rescue_attempted: false,
        objective_assembly_rescue_success: false,
        helix_ask_fail_reason: "none",
        helix_ask_fail_class: "none",
        answer_final_text: "Key files - docs/helix-ask-reasoning-ladder-research-report.md",
      },
      traceEvents,
      coerceDebugString,
      coerceDebugBoolean,
      coerceDebugNumber,
      coerceDebugObjectArray,
      clipText,
    });

    expect(sidebar.steps[0]).toMatchObject({
      step: 1,
      title: "Routing + Policy",
      status: "done",
    });
    expect(sidebar.steps.at(-1)).toMatchObject({
      title: "Final Output",
      status: "done",
    });
    expect(sidebar.event_clock).toHaveLength(2);
    expect(sidebar.markdown).toContain("# Reasoning Sidebar");
    expect(sidebar.markdown).toContain("Routing + Policy");
    expect(sidebar.markdown).toContain("Final Output");
  });

  it("attaches sidebar fields to the debug payload", () => {
    const debugRecord: Record<string, unknown> = {
      intent_domain: "repo",
      policy_prompt_family: "repo_technical",
      fallback_reason_taxonomy: "none",
      open_world_bypass_mode: "inactive",
      helix_ask_fail_reason: "none",
      helix_ask_fail_class: "none",
      answer_final_text: "Key files",
    };

    attachHelixAskReasoningSidebarToDebug({
      debugRecord,
      traceEvents,
      coerceDebugString,
      coerceDebugBoolean,
      coerceDebugNumber,
      coerceDebugObjectArray,
      clipText,
    });

    expect(debugRecord.reasoning_sidebar_enabled).toBe(true);
    expect(debugRecord.reasoning_sidebar).toEqual(
      expect.objectContaining({
        version: "v1",
        steps: expect.any(Array),
        event_clock: expect.any(Array),
      }),
    );
    expect(debugRecord.reasoning_sidebar_markdown).toEqual(expect.any(String));
    expect(debugRecord.reasoning_sidebar_step_count).toBeGreaterThan(0);
    expect(debugRecord.reasoning_sidebar_event_count).toBe(2);
  });
});
