import { describe, expect, it } from "vitest";

import { buildHelixMcpEvidencePublicUiCrosswalk } from
  "../scripts/lib/helix-mcp-evidence-public-ui-crosswalk";

describe("Helix MCP evidence public UI crosswalk", () => {
  it("classifies every public control without DOM authority or per-button tools", () => {
    const audit = buildHelixMcpEvidencePublicUiCrosswalk();
    expect(audit.ok, audit.failures.join("\n")).toBe(true);
    expect(audit.account_type).toBe("user");
    expect(audit.surface_count).toBe(20);
    expect(audit.control_count).toBe(523);
    expect(audit.semantic_group_count).toBe(43);
    expect(audit.controls_with_explicit_capability_count).toBe(0);
    expect(new Set(audit.controls.map((control) => control.control_id)).size)
      .toBe(audit.control_count);
    expect(audit.per_button_tool_generation).toBe(false);
    expect(audit.direct_dom_authority).toBe(false);
    expect(audit.controls.every((control) =>
      control.mcp_tool_name === null &&
      control.remotely_clickable === false &&
      control.grants_authority === false,
    )).toBe(true);
    expect(audit.semantic_groups.every((group) =>
      group.control_count === group.control_ids.length &&
      group.direct_dom_authority === false,
    )).toBe(true);
    expect(audit.semantic_groups.map((group) => group.capability_id)).toContain(
      "helix_ask.inspect_capability_catalog",
    );
  });

  it("keeps Ask-local and blocked Shared Live Room controls outside promoted capabilities", () => {
    const audit = buildHelixMcpEvidencePublicUiCrosswalk();
    const askLocal = audit.controls.filter((control) =>
      control.surface_id === "helix.ask" && control.authority_state === "client_local",
    );
    expect(askLocal.length).toBeGreaterThan(0);
    expect(askLocal.every((control) =>
      control.classification === (control.interaction_kind === "human_only" ? "human_only" : "presentation_not_applicable"),
    )).toBe(true);

    const blockedRoom = audit.controls.filter((control) =>
      control.surface_id === "helix.ask.shared_live_room" &&
      control.authority_state === "blocked_pending_contract",
    );
    expect(blockedRoom).toHaveLength(143);
    expect(blockedRoom.every((control) =>
      control.classification === "blocked_pending_contract",
    )).toBe(true);
  });
});
