import { describe, expect, it } from "vitest";
import {
  detectExperimentalMathRisk,
  evaluateUncertaintyResearchContract,
  extractResearchCitations,
  isApprovedResearchCitation,
  selectResearchCitationFallback,
} from "../server/services/helix-ask/surface/research-citation-policy";

describe("helix ask research citation policy", () => {
  it("extracts path, DOI, and arXiv research citations", () => {
    const citations = extractResearchCitations(
      [
        "Sources:",
        "- external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs",
        "- 10.48550/arXiv.2303.08896",
        "- arXiv:2309.11495",
      ].join("\n"),
    );

    expect(citations).toContain(
      "external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs",
    );
    expect(citations).toContain("10.48550/arXiv.2303.08896");
    expect(citations).toContain("arXiv:2309.11495");
  });

  it("recognizes approved citations from codex clone and registry papers", () => {
    expect(
      isApprovedResearchCitation(
        "external/openai-codex/codex-rs/app-server/src/codex_message_processor.rs",
      ),
    ).toBe(true);
    expect(isApprovedResearchCitation("https://arxiv.org/abs/2005.11401")).toBe(true);
    expect(isApprovedResearchCitation("https://example.com/not-approved")).toBe(false);
  });

  it("fails the uncertainty research contract when required evidence is missing", () => {
    const evaluation = evaluateUncertaintyResearchContract({
      question: "Can we trust this uncertain claim?",
      text: "Confidence/Uncertainty: unresolved.",
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "repo",
      claimTier: "reportable",
    });

    expect(evaluation.required).toBe(true);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.missingReasons).toContain(
      "uncertainty_research_contract_missing:approved_research_citation",
    );
    expect(evaluation.missingReasons).toContain(
      "uncertainty_research_contract_missing:foundational_reference",
    );
    expect(evaluation.missingReasons).toContain(
      "uncertainty_research_contract_missing:verification_reference",
    );
    expect(evaluation.missingReasons).toContain(
      "uncertainty_research_contract_missing:codex_clone_reference",
    );
    expect(evaluation.missingReasons).toContain(
      "claim_evidence_binding_missing:codex_clone_reference",
    );
    expect(evaluation.missingReasons).toContain(
      "uncertainty_research_contract_missing:uncertainty_estimation_reference",
    );
  });

  it("passes diagnostic tier when codex plus foundational/verification citations are present", () => {
    const evaluation = evaluateUncertaintyResearchContract({
      question: "How should this uncertain answer be bounded?",
      text: [
        "Confidence/Uncertainty: bounded to current evidence.",
        "",
        "Sources: external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs, https://arxiv.org/abs/2005.11401, https://arxiv.org/abs/2309.11495",
      ].join("\n"),
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "repo",
      claimTier: "diagnostic",
    });

    expect(evaluation.required).toBe(true);
    expect(evaluation.pass).toBe(true);
    expect(evaluation.claimTier).toBe("diagnostic");
    expect(evaluation.foundationalCount).toBeGreaterThan(0);
    expect(evaluation.verificationCount).toBeGreaterThan(0);
    expect(evaluation.codexReferenceCount).toBeGreaterThan(0);
    expect(evaluation.claimEvidenceBindingPass).toBe(true);
  });

  it("fails reportable tier when uncertainty-estimation citation is missing", () => {
    const evaluation = evaluateUncertaintyResearchContract({
      question: "Can this reportable claim be promoted safely?",
      text: [
        "Confidence/Uncertainty: bounded to current evidence.",
        "",
        "Sources: external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs, https://arxiv.org/abs/2005.11401, https://arxiv.org/abs/2309.11495",
      ].join("\n"),
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "repo",
      claimTier: "reportable",
    });

    expect(evaluation.required).toBe(true);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.requiredUncertaintyEstimation).toBe(true);
    expect(evaluation.missingReasons).toContain(
      "uncertainty_research_contract_missing:uncertainty_estimation_reference",
    );
  });

  it("passes reportable tier when uncertainty-estimation citation is present", () => {
    const evaluation = evaluateUncertaintyResearchContract({
      question: "Can this reportable claim be promoted safely?",
      text: [
        "Confidence/Uncertainty: bounded to current evidence.",
        "",
        "Sources: external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs, https://arxiv.org/abs/2005.11401, https://arxiv.org/abs/2309.11495, https://arxiv.org/abs/2302.09664",
      ].join("\n"),
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "repo",
      claimTier: "reportable",
    });

    expect(evaluation.required).toBe(true);
    expect(evaluation.pass).toBe(true);
    expect(evaluation.uncertaintyEstimationCount).toBeGreaterThan(0);
  });

  it("treats experimental math prompts as risk that requires research backing", () => {
    const risk = detectExperimentalMathRisk({
      question: "Is this experimental Alcubierre tensor derivation valid?",
      text: "Frontier hypothesis mode only.",
      intentDomain: "physics",
    });
    expect(risk.isRisk).toBe(true);

    const evaluation = evaluateUncertaintyResearchContract({
      question: "Is this experimental Alcubierre tensor derivation valid?",
      text: "Frontier hypothesis mode only.",
      requireResearchOnUncertainty: false,
      uncertaintySignal: false,
      intentDomain: "physics",
    });
    expect(evaluation.required).toBe(true);
    expect(evaluation.missingReasons).toContain("experimental_math_without_research_pair");
  });

  it("does not mark non-math diagnostic repo prompts as experimental math risk", () => {
    const risk = detectExperimentalMathRisk({
      question: "What is helix ask used for?",
      text: "Confidence/Uncertainty: diagnostic stage only for this repo answer.",
      intentDomain: "hybrid",
    });
    expect(risk.isRisk).toBe(false);
    expect(risk.signals).toEqual([]);
  });

  it("requires constraint+proposal evidence binding for experimental math uncertainty claims", () => {
    const missingConstraint = evaluateUncertaintyResearchContract({
      question: "Is this experimental warp metric ready for promotion?",
      text: [
        "Confidence/Uncertainty: diagnostic stage only.",
        "",
        "Sources: external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs, https://arxiv.org/abs/2102.06824",
      ].join("\n"),
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "physics",
      claimTier: "diagnostic",
    });
    expect(missingConstraint.claimEvidenceBindingPass).toBe(false);
    expect(missingConstraint.missingReasons).toContain(
      "claim_evidence_binding_missing:warp_constraint_reference",
    );

    const completePair = evaluateUncertaintyResearchContract({
      question: "Is this experimental warp metric ready for promotion?",
      text: [
        "Confidence/Uncertainty: diagnostic stage only.",
        "",
        "Sources: external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs, https://arxiv.org/abs/2102.06824, https://arxiv.org/abs/2105.03079",
      ].join("\n"),
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "physics",
      claimTier: "diagnostic",
    });
    expect(completePair.claimEvidenceBindingPass).toBe(true);
    expect(completePair.constraintReferenceCount).toBeGreaterThan(0);
    expect(completePair.proposalReferenceCount).toBeGreaterThan(0);
  });

  it("selects fallback citations with codex + foundational + verification coverage", () => {
    const fallback = selectResearchCitationFallback({
      existingCitations: ["server/routes/agi.plan.ts"],
      limit: 6,
      claimTier: "reportable",
    });

    expect(
      fallback.some((entry) =>
        entry.includes("external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs"),
      ),
    ).toBe(true);
    expect(
      fallback.some(
        (entry) =>
          entry.includes("arxiv.org/abs/2005.11401") ||
          entry.includes("arxiv.org/abs/gr-qc/0009013") ||
          entry.includes("arxiv.org/abs/2102.06824") ||
          entry.includes("arxiv.org/abs/2006.07125"),
      ),
    ).toBe(true);
    expect(
      fallback.some(
        (entry) =>
          entry.includes("arxiv.org/abs/2303.08896") ||
          entry.includes("arxiv.org/abs/2302.09664") ||
          entry.includes("arxiv.org/abs/2309.11495") ||
          entry.includes("arxiv.org/abs/gr-qc/9702026") ||
          entry.includes("arxiv.org/abs/2105.03079"),
      ),
    ).toBe(true);
  });
});
