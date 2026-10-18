import path from "node:path";
import { describe, expect, it } from "vitest";
import { HELIX_MCP_EVIDENCE_CAPABILITY_DESCRIPTORS } from "../shared/helix-mcp-evidence-capability-registry";

import { buildHelixMcpEvidenceConformanceAudit } from
  "../scripts/lib/helix-mcp-evidence-conformance";

describe("Helix MCP Evidence Capability Conformance v1 audit", () => {
  it("emits one deterministic 14-dimension row per production tool", () => {
    const first = buildHelixMcpEvidenceConformanceAudit({ workspaceRoot: path.resolve(process.cwd()) });
    const replay = buildHelixMcpEvidenceConformanceAudit({ workspaceRoot: path.resolve(process.cwd()) });
    expect(first).toEqual(replay);
    expect(first.report_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.deterministic_framework_ok, first.failures.join("\n")).toBe(true);
    expect(first.rows).toHaveLength(first.inventory.unique_tool_count);
    expect(first.inventory).toEqual({
      registration_count: 145,
      unique_tool_count: 111,
      joined_tool_count: 17,
      gap_tool_count: 94,
    });
    expect(first.rows.every((row) => Object.keys(row.dimensions).length === 14)).toBe(true);
    expect(first.rows.every((row) => row.dimensions.live_convergence === "not_assessed"))
      .toBe(true);
    expect(first.live_convergence_claimed).toBe(false);
  });

  it("conforms only the adopted reference capabilities and preserves all other tools as gaps", () => {
    const audit = buildHelixMcpEvidenceConformanceAudit({ workspaceRoot: path.resolve(process.cwd()) });
    const adopted = audit.rows.filter((row) => row.dimensions.catalog_identity === "conforms");
    expect(adopted.map((row) => row.mcp_tool_name).sort()).toEqual(
      HELIX_MCP_EVIDENCE_CAPABILITY_DESCRIPTORS.map(descriptor => descriptor.mcp_tool_name).sort(),
    );
    expect(adopted.find((row) => row.mcp_tool_name === "helix_public_ui_catalog")?.dimensions.ui_crosswalk)
      .toBe("conforms");
    expect(audit.rows.filter((row) => row.dimensions.catalog_identity === "gap"))
      .toHaveLength(94);
    expect(
      audit.rows.find((row) => row.mcp_tool_name === "helix_room_consent_revoke"),
    ).toMatchObject({
      dimensions: { catalog_identity: "gap" },
      gap_reason_codes: ["mcp_evidence_capability_descriptor_missing"],
    });
    for (const tool of ["helix_room_consent_grant", "helix_room_floor_acquire"]) {
      expect(audit.rows.find((row) => row.mcp_tool_name === tool)).toMatchObject({
        dimensions: { catalog_identity: "gap" },
        gap_reason_codes: ["mcp_evidence_capability_descriptor_missing"],
      });
    }
    expect(audit.rows.filter((row) => row.dimensions.catalog_identity === "gap")
      .every((row) => row.gap_reason_codes.includes("mcp_evidence_capability_descriptor_missing")))
      .toBe(true);
  });
});
