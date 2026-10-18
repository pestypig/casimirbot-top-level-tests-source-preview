import { describe, expect, it } from "vitest";
import { CODEX_PARITY_AGENT_SPINE_CLASSES } from "../server/services/helix-ask/codex-parity-agent-spine-contract";
import { collectRailTableViolations } from "../scripts/helix-ask-ui-debug-parity-harness";

const baseRailTable = () => ({
  schema: "helix.codex_parity_agent_spine_rail_table.v1",
  turn_id: "turn-ui-debug-rail",
  prompt: "What tools are available for the helix ask to use?",
  requested_capability: null,
  visible_tool_surface: ["helix_ask.inspect_capability_catalog"],
  visible_tool_surface_original_count: 1,
  visible_tool_surface_truncated: false,
  selected_capability: "helix_ask.inspect_capability_catalog",
  admitted_capability: "helix_ask.inspect_capability_catalog",
  admission_proof_source: "capability_contract_arbitration",
  admission_proven: true,
  executed_capability: "helix_ask.inspect_capability_catalog",
  observation_kind: "capability_registry",
  observation_ref: "artifact:capability-registry",
  required_observation_kinds_for_requested_capability: [],
  observed_artifact_supports_requested_capability: true,
  reentry_status: "reentered",
  reentry_proof_source: "capability_registry_observation",
  reentry_proven: true,
  goal_satisfaction: "satisfied",
  required_terminal_kind: "capability_help_summary",
  selected_terminal_kind: "capability_help_summary",
  terminal_authority_proof_source: "terminal_authority_single_writer",
  terminal_authority_proven: true,
  visible_terminal_kind: "capability_help_summary",
  visible_projection_source: "terminal_authority_single_writer.visible_text",
  visible_projection_proven: true,
  first_broken_rail: null,
  repair_target: null,
  codex_parity_class: "complete",
  normalized_codex_parity_classes: [...CODEX_PARITY_AGENT_SPINE_CLASSES],
  rail_status: "complete",
  rail_failure_code: null,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
});

describe("helix-ask-ui-debug-parity-harness rail validation", () => {
  it("accepts a complete rail table that is tied to the copied turn and remains debug-only", () => {
    const violations = collectRailTableViolations(
      baseRailTable(),
      { selected_terminal_artifact_kind: "capability_help_summary" },
      "turn-ui-debug-rail",
      "capability_help_summary",
    );
    expect(violations).toEqual([]);
  });

  it("rejects stale or terminal-eligible rail debug mirrors", () => {
    const rail = {
      ...baseRailTable(),
      turn_id: "turn-stale",
      assistant_answer: true,
      terminal_eligible: true,
      raw_content_included: true,
    };

    expect(collectRailTableViolations(rail, { selected_terminal_artifact_kind: "capability_help_summary" }, "turn-ui-debug-rail")).toEqual(
      expect.arrayContaining([
        "rail_turn_id_mismatch:turn-stale!=turn-ui-debug-rail",
        "rail_assistant_answer_not_false",
        "rail_terminal_eligible_not_false",
        "rail_raw_content_included_not_false",
      ]),
    );
  });

  it("rejects copied debug exports whose top-level terminal kind is stale", () => {
    expect(
      collectRailTableViolations(
        baseRailTable(),
        { selected_terminal_artifact_kind: "capability_help_summary" },
        "turn-ui-debug-rail",
        "model_synthesized_answer",
      ),
    ).toEqual(
      expect.arrayContaining([
        "rail_selected_terminal_debug_export_mismatch",
        "rail_visible_terminal_debug_export_mismatch",
      ]),
    );
  });

  it("rejects non-complete rails without failure and repair handles", () => {
    const rail = {
      ...baseRailTable(),
      codex_parity_class: "observation_missing",
      rail_status: "fail_closed",
      first_broken_rail: "observation_artifact",
      rail_failure_code: null,
      repair_target: null,
    };

    expect(
      collectRailTableViolations(
        rail,
        { selected_terminal_artifact_kind: "capability_help_summary" },
        "turn-ui-debug-rail",
        "capability_help_summary",
      ),
    ).toEqual(
      expect.arrayContaining([
        "rail_non_complete_without_rail_failure_code",
        "rail_non_complete_without_repair_target",
      ]),
    );
  });

  it("rejects non-complete rails with non-canonical failure vocabulary", () => {
    const rail = {
      ...baseRailTable(),
      codex_parity_class: "observation_missing",
      rail_status: "fail_closed",
      visible_tool_surface: ["helix_ask.inspect_capability_catalog", ""],
      visible_tool_surface_original_count: 1,
      visible_tool_surface_truncated: true,
      required_observation_kinds_for_requested_capability: ["capability_registry", 7],
      normalized_codex_parity_classes: [...CODEX_PARITY_AGENT_SPINE_CLASSES, 7],
      first_broken_rail: "made_up_rail",
      rail_failure_code: "repo_evidence_weak_after_repair",
      repair_target: "unknown_layer",
    };

    expect(
      collectRailTableViolations(
        rail,
        { selected_terminal_artifact_kind: "capability_help_summary" },
        "turn-ui-debug-rail",
        "capability_help_summary",
      ),
    ).toEqual(
      expect.arrayContaining([
        "rail_first_broken_rail_invalid",
        "rail_failure_code_invalid",
        "rail_normalized_codex_parity_classes_entries_invalid",
        "rail_repair_target_invalid",
        "rail_required_observation_kinds_entries_invalid",
        "rail_visible_tool_surface_original_count_less_than_surface",
        "rail_visible_tool_surface_truncated_without_hidden_entries",
        "rail_visible_tool_surface_entries_invalid",
      ]),
    );
  });

  it("rejects requested capabilities with an empty required-observation contract", () => {
    const rail = {
      ...baseRailTable(),
      requested_capability: "docs-viewer.locate_in_doc",
      visible_tool_surface: ["docs-viewer.locate_in_doc"],
      visible_tool_surface_original_count: 1,
      selected_capability: "docs-viewer.locate_in_doc",
      admitted_capability: "docs-viewer.locate_in_doc",
      executed_capability: "docs-viewer.locate_in_doc",
      required_observation_kinds_for_requested_capability: [],
      observed_artifact_supports_requested_capability: false,
      codex_parity_class: "observation_missing",
      rail_status: "fail_closed",
      first_broken_rail: "observation_artifact",
      rail_failure_code: "observation_missing",
      repair_target: "observation_materializer",
      selected_terminal_kind: "typed_failure",
      visible_terminal_kind: "typed_failure",
    };

    expect(
      collectRailTableViolations(
        rail,
        { selected_terminal_artifact_kind: "typed_failure" },
        "turn-ui-debug-rail",
        "typed_failure",
      ),
    ).toContain("rail_requested_observation_kinds_empty");
  });
});
