import { describe, expect, it } from "vitest";
import {
  buildSemanticRepoTechContractRepairAnswer,
  evaluateSemanticRepoTechContract,
} from "../server/services/helix-ask/surface/semantic-repo-tech-contract";

describe("semantic repo-technical contract", () => {
  it("passes when repo anchors, operator step, and codex+paper evidence are present", () => {
    const evaluation = evaluateSemanticRepoTechContract({
      question: "How should we validate this uncertain repo claim?",
      required: true,
      text: [
        "Direct Answer:",
        "- The orchestration shell is in place, but promotion should remain bounded to cited evidence.",
        "",
        "Where in repo:",
        "- server/routes/agi.plan.ts",
        "",
        "Confidence/Uncertainty:",
        "- Uncertainty remains until comparative checks are rerun with the cited references.",
        "",
        "Next Step:",
        "- Run a targeted retrieval and verify the cited paths against codex clone + research evidence.",
        "",
        "Sources: server/routes/agi.plan.ts, external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs, https://arxiv.org/abs/2105.03079",
      ].join("\n"),
    });

    expect(evaluation.pass).toBe(true);
    expect(evaluation.claimEvidenceBindingPass).toBe(true);
    expect(evaluation.repoCitationCount).toBeGreaterThan(0);
    expect(evaluation.codexCloneCitationCount).toBeGreaterThan(0);
    expect(evaluation.webResearchCitationCount).toBeGreaterThan(0);
  });

  it("fails claim-evidence binding when uncertainty text lacks codex/web references", () => {
    const evaluation = evaluateSemanticRepoTechContract({
      question: "Can this uncertain claim be promoted?",
      required: true,
      text: [
        "Direct Answer:",
        "- Promotion should stay blocked.",
        "",
        "Where in repo:",
        "- server/routes/agi.plan.ts",
        "",
        "Confidence/Uncertainty:",
        "- Uncertainty remains high in diagnostic stage.",
        "",
        "Sources: server/routes/agi.plan.ts",
      ].join("\n"),
    });

    expect(evaluation.pass).toBe(false);
    expect(evaluation.claimEvidenceBindingPass).toBe(false);
    expect(evaluation.missingReasons).toContain(
      "claim_evidence_binding_missing:codex_clone_reference",
    );
    expect(evaluation.missingReasons).toContain(
      "claim_evidence_binding_missing:web_research_reference",
    );
  });

  it("builds a deterministic repair surface with next step and sources", () => {
    const repaired = buildSemanticRepoTechContractRepairAnswer({
      question: "Where should we patch next?",
      text: "Partial draft answer.",
      citations: ["server/routes/agi.plan.ts"],
    });

    expect(repaired).toMatch(/Direct Answer:/);
    expect(repaired).toMatch(/Where in repo:/);
    expect(repaired).toMatch(/Confidence\/Uncertainty:/);
    expect(repaired).toMatch(/Next Step:/);
    expect(repaired).toMatch(/Sources:/);
  });
});
