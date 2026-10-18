import { describe, expect, it } from "vitest";
import {
  NEEDLE_NATARIO_RELATION_FAIL_REASON,
  evaluateNeedleNatarioRelationProof,
  isNeedleNatarioFamilyClaim,
} from "../server/services/helix-ask/relation-proof";

describe("helix ask relation proof gate (needle hull -> natario family)", () => {
  it("allows claim when required relation evidence edges are present", () => {
    const result = evaluateNeedleNatarioRelationProof({
      question: "Is the needle hull a natario solution?",
      contextFiles: [
        "client/src/components/needle-hull-preset.tsx",
        "docs/needle-hull-mainframe.md",
      ],
      docBlocks: [
        {
          path: "client/src/components/needle-hull-preset.tsx",
          block: 'dynamicConfig: { warpFieldType: "natario" }',
        },
        {
          path: "docs/needle-hull-mainframe.md",
          block: "Needle Hull Mainframe ... Natario warp geometry presets",
        },
      ],
      repoEvidenceRequired: true,
      openWorldBypassAllowed: false,
    });

    expect(result.applicable).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("allow");
    expect(result.missing_edge_ids).toEqual([]);
    expect(result.matched_edge_ids.length).toBe(2);
  });

  it("rejects global-token leakage across edges when only one edge block has all tokens", () => {
    const result = evaluateNeedleNatarioRelationProof({
      question: "Is the needle hull a natario solution?",
      contextFiles: [
        "client/src/components/needle-hull-preset.tsx",
        "docs/needle-hull-mainframe.md",
      ],
      docBlocks: [
        {
          path: "client/src/components/needle-hull-preset.tsx",
          block: "warpFieldType natario needle hull warp geometry",
        },
      ],
      repoEvidenceRequired: true,
      openWorldBypassAllowed: false,
    });

    expect(result.applicable).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("clarify_fail_closed");
    expect(result.fail_reason).toBe(NEEDLE_NATARIO_RELATION_FAIL_REASON);
    expect(result.matched_edge_ids).toEqual(["needle_preset_sets_natario_field"]);
    expect(result.missing_edge_ids).toEqual(["needle_mainframe_binds_natario_geometry"]);
  });

  it("blocks alias-only relation claim when evidence edges are missing", () => {
    const result = evaluateNeedleNatarioRelationProof({
      question: "Is the needle hull a natario solution?",
      contextFiles: ["docs/knowledge/warp/natario-zero-expansion.md"],
      docBlocks: [
        {
          path: "docs/knowledge/warp/natario-zero-expansion.md",
          block: "aliases: needle hull, natario",
        },
      ],
      repoEvidenceRequired: true,
      openWorldBypassAllowed: false,
    });

    expect(result.applicable).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("clarify_fail_closed");
    expect(result.fail_reason).toBe(NEEDLE_NATARIO_RELATION_FAIL_REASON);
    expect(result.missing_edge_ids.length).toBeGreaterThan(0);
  });

  it("permits open-world bypass only when policy allows it", () => {
    const result = evaluateNeedleNatarioRelationProof({
      question: "Is the needle hull a natario solution?",
      contextFiles: [],
      docBlocks: [],
      repoEvidenceRequired: false,
      openWorldBypassAllowed: true,
    });

    expect(result.applicable).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("allow_open_world_bypass");
    expect(result.fail_reason).toBe(NEEDLE_NATARIO_RELATION_FAIL_REASON);
  });

  it("detects targeted family-membership claims deterministically", () => {
    expect(isNeedleNatarioFamilyClaim("Show evidence edges proving needle hull is natario-family.")).toBe(true);
    expect(isNeedleNatarioFamilyClaim("Is Needle Hull Natario family?")).toBe(true);
    expect(isNeedleNatarioFamilyClaim("What is Natario zero expansion?")).toBe(false);
  });
});
