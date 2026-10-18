import { describe, expect, it } from "vitest";

import { __testCapsuleGrounding } from "../server/routes/agi.plan";

describe("helix ask capsule grounding relevance", () => {
  it("filters stale mission terms and paths on clear topic prompts", () => {
    const bundle = {
      mustKeepTerms: [
        "mission ethos",
        "stewardship ledger",
        "quantum inequality",
        "negative energy density",
      ],
      preferredEvidencePaths: [
        "docs/BUSINESS_MODEL.md",
        "docs/knowledge/physics/ford-roman-quantum-inequality.md",
        "docs/knowledge/physics/negative-energy-interpretation.md",
      ],
    };

    const terms = __testCapsuleGrounding.resolveCapsuleMustKeepTerms(
      bundle,
      false,
      "Explain quantum inequality bounds on negative energy density.",
    );
    const paths = __testCapsuleGrounding.resolveCapsulePreferredEvidencePaths(
      bundle,
      false,
      "Explain quantum inequality bounds on negative energy density.",
    );

    expect(terms.length).toBeGreaterThan(0);
    expect(terms.some((entry) => /quantum|negative/.test(entry))).toBe(true);
    expect(terms.some((entry) => /mission|ledger/.test(entry))).toBe(false);

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((entry) => /ford-roman|negative-energy/i.test(entry))).toBe(true);
    expect(paths.some((entry) => /business_model/i.test(entry))).toBe(false);
  });

  it("keeps capsule fallback anchors for ambiguous follow-ups", () => {
    const bundle = {
      mustKeepTerms: ["negative energy density", "quantum inequality"],
      preferredEvidencePaths: ["docs/knowledge/physics/ford-roman-quantum-inequality.md"],
    };

    const terms = __testCapsuleGrounding.resolveCapsuleMustKeepTerms(
      bundle,
      false,
      "where does that come from?",
    );
    const paths = __testCapsuleGrounding.resolveCapsulePreferredEvidencePaths(
      bundle,
      false,
      "where does that come from?",
    );

    expect(terms.length).toBeGreaterThan(0);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("drops stale anchors when topic shift is explicit", () => {
    const bundle = {
      mustKeepTerms: ["negative energy density", "quantum inequality"],
      preferredEvidencePaths: ["docs/knowledge/physics/ford-roman-quantum-inequality.md"],
    };

    const terms = __testCapsuleGrounding.resolveCapsuleMustKeepTerms(
      bundle,
      true,
      "Switch topics to indoor gardening basics.",
    );
    const paths = __testCapsuleGrounding.resolveCapsulePreferredEvidencePaths(
      bundle,
      true,
      "Switch topics to indoor gardening basics.",
    );

    expect(terms).toEqual([]);
    expect(paths).toEqual([]);
  });

  it("does not inject mission soft-signal query hints into generic physics prompts", () => {
    const queries = __testCapsuleGrounding.buildHelixAskSearchQueries(
      "Define a quantum inequality in physics.",
      ["physics"],
    );

    const normalized = queries.map((entry) => entry.toLowerCase());
    expect(normalized.some((entry) => entry.includes("mission overwatch intent context"))).toBe(false);
    expect(normalized.some((entry) => entry.includes("docs/business_model.md"))).toBe(false);
  });

  it("keeps mission soft-signal hints for explicit mission prompts", () => {
    const queries = __testCapsuleGrounding.buildHelixAskSearchQueries(
      "How does mission overwatch voice callout policy work?",
      ["helix_ask"],
    );

    const normalized = queries.map((entry) => entry.toLowerCase());
    const softSignalEnabled = String(process.env.HELIX_ASK_DOTTIE_SOFT_SIGNAL ?? "1").trim() !== "0";
    if (softSignalEnabled) {
      expect(normalized).toContain("mission overwatch intent context");
      expect(normalized).toContain("docs/business_model.md");
      return;
    }
    expect(normalized.some((entry) => entry.includes("mission overwatch intent context"))).toBe(false);
    expect(normalized.some((entry) => entry.includes("docs/business_model.md"))).toBe(false);
  });

  it("does not anchor clarify prompts to stale greeting capsule seeds", () => {
    const clarifier = __testCapsuleGrounding.buildCapsuleTargetedClarifier("what is this used for?", [
      "hello",
      "assist",
      "today",
      "unknown",
    ]);

    expect(clarifier.toLowerCase()).not.toContain('"hello"');
    expect(clarifier.toLowerCase()).toContain("object, file, or concept");
  });

  it("keeps meaningful capsule seeds when they are relevant", () => {
    const clarifier = __testCapsuleGrounding.buildCapsuleTargetedClarifier(
      "what is this used for?",
      ["paper ingestion runtime tree", "hello"],
    );

    expect(clarifier).toContain('"paper ingestion runtime tree"');
  });
});
