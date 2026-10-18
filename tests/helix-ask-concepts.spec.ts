import { describe, expect, it } from "vitest";
import {
  findConceptMatch,
  listConceptCandidates,
  renderConceptAnswer,
  renderShortConceptDefinition,
} from "../server/services/helix-ask/concepts";

describe("Helix Ask concept candidates", () => {
  it("returns the top concept match for known concepts", () => {
    const candidates = listConceptCandidates("What is epistemology?", 3);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].card.id).toBe("epistemology");
  });

  it("matches 'how does ... affect ...' concept queries", () => {
    const candidates = listConceptCandidates("How does Feedback Loop Hygiene affect society?", 3);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].card.id).toBe("feedback-loop-hygiene");
  });

  it("maps needle hull Natario questions to the Natario warp concept", () => {
    const match = findConceptMatch("Is the needle hull a Natario solution?");
    expect(match).not.toBeNull();
    expect(match?.card.id).toBe("natario-zero-expansion");
    expect(match?.card.aliases).toContain("needle hull");
    expect(match?.card.mustIncludeFiles).toContain("docs/needle-hull-mainframe.md");
  });

  it("renders short alias definitions without the conversational question scaffold", () => {
    const match = findConceptMatch("Whats a Needle Hull ?");
    const rendered = renderShortConceptDefinition(match);
    expect(rendered).toMatch(/Needle Hull/i);
    expect(rendered).toMatch(/Natario-family warp bubble profile|Natario zero-expansion model/i);
    expect(rendered).not.toMatch(/In practice, it is easiest to test by asking:/i);
    expect(rendered).not.toMatch(/natario-zero-expansion means/i);
  });

  it("keeps conversational concept answers alias-aware", () => {
    const match = findConceptMatch("Whats a Needle Hull ?");
    const rendered = renderConceptAnswer(match);
    expect(rendered).toMatch(/^In plain language, Needle Hull means/i);
    expect(rendered).not.toMatch(/natario-zero-expansion means/i);
    expect(rendered).toMatch(/A useful verification question is:/i);
  });


  it("applies conservative concept provenance defaults when frontmatter is missing", () => {
    const match = findConceptMatch("What is epistemology?");
    expect(match).not.toBeNull();
    expect(match?.card.provenance_class).toBe("inferred");
    expect(match?.card.claim_tier).toBe("diagnostic");
    expect(match?.card.certifying).toBe(false);
    expect(match?.card.provenanceDeclared).toBe(false);
  });

  it("returns an empty list for unknown terms", () => {
    const candidates = listConceptCandidates("What is zorbglax?", 3);
    expect(candidates.length).toBe(0);
  });

  it("limits ideology intent matching to ideology concepts", () => {
    const ideologyMatch = findConceptMatch(
      "How does Feedback Loop Hygiene affect society?",
      { intentId: "repo.ideology_reference" },
    );
    expect(ideologyMatch?.card.id).toBe("feedback-loop-hygiene");
    const nonIdeologyMatch = findConceptMatch(
      "What is epistemology?",
      { intentId: "repo.ideology_reference" },
    );
    expect(nonIdeologyMatch).toBeNull();
  });
});
