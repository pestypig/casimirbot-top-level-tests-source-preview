import { describe, expect, it } from "vitest";
import {
  getHelixAskIntentProfileById,
  matchHelixAskIntent,
  STRICT_PACKAGES_PROVENANCE_FAIL_REASON,
} from "../server/services/helix-ask/intent-directory";
import { resolveHelixAskFormat } from "../server/services/helix-ask/format";

type IntentCase = {
  question: string;
  hasRepoHints: boolean;
  hasFilePathHints: boolean;
  expectedId: string;
  expectedDomain: "general" | "repo" | "hybrid" | "falsifiable";
  expectedFormat?: "steps" | "compare" | "brief";
  expectStageTags?: boolean;
};

const cases: IntentCase[] = [
  {
    question: "What is epistemology and why does it matter?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "general.conceptual_define_compare",
    expectedDomain: "general",
    expectedFormat: "compare",
  },
  {
    question: "How does this system use the scientific method for verification?",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "hybrid.concept_plus_system_mapping",
    expectedDomain: "hybrid",
    expectedFormat: "compare",
    expectStageTags: true,
  },
  {
    question: "How does the Helix Ask pipeline work in this system?",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.helix_ask_pipeline_explain",
    expectedDomain: "repo",
    expectedFormat: "steps",
    expectStageTags: false,
  },
  {
    question: "How does the Helix Ask pipeline work?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "repo.helix_ask_pipeline_explain",
    expectedDomain: "repo",
    expectedFormat: "steps",
    expectStageTags: false,
  },
  {
    question: "Which module implements helix ask intent directory routing logic?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "repo.helix_ask_routing_explain",
    expectedDomain: "repo",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "How does Helix Ask route intent → topic → format? Cite files.",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.helix_ask_routing_explain",
    expectedDomain: "repo",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question:
      "What is platonic reasoning, and how does this system apply it? Two short paragraphs; second must cite repo files.",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "hybrid.concept_plus_system_mapping",
    expectedDomain: "hybrid",
    expectedFormat: "compare",
    expectStageTags: false,
  },
  {
    question: "Where is the evidence gate computed and what thresholds are enforced? Cite files.",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.helix_ask_gate_explain",
    expectedDomain: "repo",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "This repo throws an error on startup. How do I fix it?",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.repo_debugging_root_cause",
    expectedDomain: "repo",
    expectedFormat: "steps",
    expectStageTags: false,
  },
  {
    question: "Update this repo to add a new API endpoint.",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.repo_change_request",
    expectedDomain: "repo",
    expectedFormat: "steps",
    expectStageTags: false,
  },
  {
    question:
      "Using the system ideology, what is the right stance on verification vs persuasion?",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.ideology_reference",
    expectedDomain: "repo",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "How does Feedback Loop Hygiene affect society?",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.ideology_reference",
    expectedDomain: "repo",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "How is warp bubble viability computed through constraint gates to a certificate?",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "falsifiable.constraints.gr_viability_certificate",
    expectedDomain: "falsifiable",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "What's a warp bubble?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "repo.warp_definition_docs_first",
    expectedDomain: "repo",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "Could warp bubble progress violate mission ethos, and how is that prevented?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "hybrid.warp_ethos_relation",
    expectedDomain: "hybrid",
    expectedFormat: "compare",
    expectStageTags: false,
  },
  {
    question: "What is a Needle Hull Mark 2? How does it relate to the precession of mercury?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "general.conceptual_define_compare",
    expectedDomain: "general",
    expectedFormat: "compare",
  },
  {
    question: "What is the Casimir effect?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "general.conceptual_define_compare",
    expectedDomain: "general",
    expectedFormat: "compare",
  },
  {
    question: "Is the sun conscious under Orch-OR style reasoning?",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "falsifiable.frontier_consciousness_theory_lens",
    expectedDomain: "falsifiable",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "Define the Ford-Roman quantum inequality.",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "general.conceptual_define_compare",
    expectedDomain: "general",
    expectedFormat: "compare",
  },
  {
    question: "Explain the Natario zero-expansion warp bubble.",
    hasRepoHints: false,
    hasFilePathHints: false,
    expectedId: "repo.warp_definition_docs_first",
    expectedDomain: "repo",
    expectedFormat: "brief",
    expectStageTags: false,
  },
  {
    question: "Show the warp congruence math equation and how the codebase maps it.",
    hasRepoHints: true,
    hasFilePathHints: false,
    expectedId: "repo.warp_math_congruence",
    expectedDomain: "repo",
    expectedFormat: "steps",
    expectStageTags: false,
  },
];

describe("Helix Ask intent routing", () => {
  for (const entry of cases) {
    it(`routes: ${entry.expectedId}`, () => {
      const match = matchHelixAskIntent({
        question: entry.question,
        hasRepoHints: entry.hasRepoHints,
        hasFilePathHints: entry.hasFilePathHints,
      });
      expect(match.profile.id).toBe(entry.expectedId);
      expect(match.profile.domain).toBe(entry.expectedDomain);
      if (entry.expectedFormat) {
        const resolved = resolveHelixAskFormat(entry.question, match.profile, false);
        expect(resolved.format).toBe(entry.expectedFormat);
        if (typeof entry.expectStageTags === "boolean") {
          expect(resolved.stageTags).toBe(entry.expectStageTags);
        }
      }
    });
  }

  it("forces repo hints when cite-file phrasing is used", () => {
    const question = "Where is the evidence gate computed and what thresholds are enforced? Cite files.";
    const hasFilePathHints = false;
    const hasRepoHints = /cite files?/i.test(question);
    const match = matchHelixAskIntent({ question, hasRepoHints, hasFilePathHints });
    expect(match.profile.domain).toBe("repo");
  });


  it("does not infer repo change intent from generic writing prompt terms", () => {
    const question = "How can I improve class relationships in my essay?";
    const match = matchHelixAskIntent({
      question,
      hasRepoHints: false,
      hasFilePathHints: false,
    });
    expect(match.profile.id).not.toBe("repo.repo_change_request");
  });

  it("does not infer repo change intent from generic API design wording", () => {
    const question = "How to improve API design principles?";
    const match = matchHelixAskIntent({
      question,
      hasRepoHints: false,
      hasFilePathHints: false,
    });
    expect(match.profile.id).not.toBe("repo.repo_change_request");
  });

  it("keeps helix ask routing internals prompt on repo routing explain intent", () => {
    const question = "Which module implements helix ask intent directory routing logic?";
    const match = matchHelixAskIntent({
      question,
      hasRepoHints: false,
      hasFilePathHints: false,
    });
    expect(match.profile.id).toBe("repo.helix_ask_routing_explain");
  });

  it("does not route non-ethos relation prompts to warp+ethos relation intent", () => {
    const question = "How does a warp bubble relate to Mercury precession?";
    const match = matchHelixAskIntent({
      question,
      hasRepoHints: false,
      hasFilePathHints: false,
    });
    expect(match.profile.id).not.toBe("hybrid.warp_ethos_relation");
  });

  it("keeps repo routing behavior while exposing additive packages provenance contract", () => {
    const question = "Where is the packages API route and module path?";
    const match = matchHelixAskIntent({
      question,
      hasRepoHints: true,
      hasFilePathHints: false,
    });
    expect(match.profile.id).toBe("repo.repo_api_lookup");
    expect(match.profile.evidencePolicy.allowedEvidenceKinds).toContain("packages_retrieval");
    expect(match.profile.retrievalProvenance).toEqual({
      provenance_class: "inferred",
      claim_tier: "diagnostic",
      certifying: false,
    });
    expect(match.profile.strictProvenanceFailReason).toBe(STRICT_PACKAGES_PROVENANCE_FAIL_REASON);
  });

  it("prefers general routing for multilingual conceptual warp prompts without repo cues", () => {
    const question = "What is a warp bubble?";
    const match = matchHelixAskIntent({
      question,
      hasRepoHints: false,
      hasFilePathHints: false,
      preferGeneralWhenNoRepoHints: true,
    });
    expect(match.profile.id).toBe("general.conceptual_define_compare");
    expect(match.profile.domain).toBe("general");
  });

  it("prefers general routing for multilingual Helix Ask workflow prompts without repo cues", () => {
    const question = "Explain how Helix Ask helps a research workflow.";
    const match = matchHelixAskIntent({
      question,
      hasRepoHints: false,
      hasFilePathHints: false,
      preferGeneralWhenNoRepoHints: true,
    });
    expect(match.profile.id).toBe("general.conceptual_define_compare");
    expect(match.profile.domain).toBe("general");
  });

  it("keeps warp mechanism 'solved in codebase' prompts in brief format", () => {
    const profile = getHelixAskIntentProfileById("repo.warp_math_congruence");
    expect(profile).toBeTruthy();
    const resolved = resolveHelixAskFormat(
      "How is the warp bubble solved in the codebase?",
      profile,
      false,
    );
    expect(resolved.format).toBe("brief");
    expect(resolved.stageTags).toBe(false);
  });
});

