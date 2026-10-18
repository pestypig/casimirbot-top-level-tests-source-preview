import { describe, expect, it } from "vitest";
import {
  evaluateUiComponentsPathEvidence,
  evaluateMoralLadderPathEvidence,
  extractFilePathsFromText,
} from "../server/services/helix-ask/paths";

describe("Helix Ask path extraction", () => {
  it("prefers .json when a .js variant does not exist", () => {
    const paths = extractFilePathsFromText(
      "Sources: docs/knowledge/sun-ledger.md, docs/ethos/ideology.js",
    );
    expect(paths).toContain("docs/ethos/ideology.json");
    expect(paths).not.toContain("docs/ethos/ideology.js");
  });

  it("adds UI-components routing metadata when UI evidence paths exist", () => {
    const gate = evaluateUiComponentsPathEvidence([
      "client/src/components/helix/HelixAskPill.tsx",
    ]);
    expect(gate).toEqual({
      ok: true,
      routing_metadata: {
        provenance_class: "inferred",
        claim_tier: "diagnostic",
        certifying: false,
      },
    });
  });

  it("returns deterministic strict fail_reason when UI evidence paths are missing", () => {
    const gate = evaluateUiComponentsPathEvidence(["server/routes/agi.plan.ts"], {
      strict: true,
    });
    expect(gate.ok).toBe(false);
    expect(gate.fail_reason).toBe("UI_COMPONENTS_PATH_EVIDENCE_MISSING");
  });

  it("keeps non-strict behavior backward compatible when UI evidence is missing", () => {
    const gate = evaluateUiComponentsPathEvidence(["server/routes/agi.plan.ts"]);
    expect(gate).toEqual({ ok: true });
  });

  it("adds moral-ladder routing metadata when moral-ladder evidence paths exist", () => {
    const gate = evaluateMoralLadderPathEvidence(["docs/moral-ladder-pack/contract.md"]);
    expect(gate).toEqual({
      ok: true,
      routing_metadata: {
        provenance_class: "inferred",
        claim_tier: "diagnostic",
        certifying: false,
      },
    });
  });

  it("returns deterministic strict fail_reason when moral-ladder evidence paths are missing", () => {
    const gate = evaluateMoralLadderPathEvidence(["server/routes/agi.plan.ts"], {
      strict: true,
    });
    expect(gate.ok).toBe(false);
    expect(gate.fail_reason).toBe("MORAL_LADDER_PATH_EVIDENCE_MISSING");
  });

  it("keeps moral-ladder non-strict behavior backward compatible when evidence is missing", () => {
    const gate = evaluateMoralLadderPathEvidence(["server/routes/agi.plan.ts"]);
    expect(gate).toEqual({ ok: true });
  });
});
