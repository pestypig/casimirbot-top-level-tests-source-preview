import { describe, expect, it } from "vitest";
import {
  buildHelixAskTopicProfile,
  inferHelixAskTopicTags,
  pathMatchesAny,
  topicMustIncludeSatisfied,
} from "../server/services/helix-ask/topic";

describe("Helix Ask topic routing", () => {
  it("tags helix ask prompts", () => {
    const tags = inferHelixAskTopicTags("How does the Helix Ask pipeline work in this system?");
    expect(tags).toContain("helix_ask");
  });

  it("tags platonic reasoning as concepts", () => {
    const tags = inferHelixAskTopicTags("What is platonic reasoning?");
    expect(tags).toContain("concepts");
  });

  it("tags wavefunction prompts as concepts", () => {
    const tags = inferHelixAskTopicTags("Explain the uncertainty principle and wavefunction.");
    expect(tags).toContain("concepts");
  });

  it("tags evidence gate prompts as helix ask", () => {
    const tags = inferHelixAskTopicTags(
      "Where is the evidence gate computed and what thresholds are enforced? Cite files.",
    );
    expect(tags).toContain("helix_ask");
  });

  it("builds core allowlist for helix ask", () => {
    const profile = buildHelixAskTopicProfile(["helix_ask"]);
    expect(profile).not.toBeNull();
    expect(profile?.allowlistTiers.length).toBeGreaterThan(0);
    expect(profile?.mustIncludePaths.length).toBeGreaterThan(0);
  });

  it("requires helix ask core evidence when configured", () => {
    const profile = buildHelixAskTopicProfile(["helix_ask"]);
    expect(
      topicMustIncludeSatisfied(["server/services/helix-ask/format.ts"], profile),
    ).toBe(true);
    expect(topicMustIncludeSatisfied(["server/energy-pipeline.ts"], profile)).toBe(false);
  });

  it("anchors ideology prompts to the ideology tree", () => {
    const tags = inferHelixAskTopicTags(
      "Using the system ideology, what does the ethos say about verification vs persuasion?",
    );
    expect(tags).toContain("ideology");
    const profile = buildHelixAskTopicProfile(["ideology"]);
    expect(profile).not.toBeNull();
    expect(
      topicMustIncludeSatisfied(["docs/ethos/ideology.json"], profile),
    ).toBe(true);
    expect(topicMustIncludeSatisfied(["server/routes/agi.plan.ts"], profile)).toBe(false);
  });

  it("anchors sun-ledger prompts to ledger core files", () => {
    const tags = inferHelixAskTopicTags(
      "What does it mean to tend the Sun ledger in this system?",
    );
    expect(tags).toContain("ledger");
    const profile = buildHelixAskTopicProfile(["ledger"]);
    expect(profile).not.toBeNull();
    expect(topicMustIncludeSatisfied(["docs/ethos/ideology.json"], profile)).toBe(true);
    expect(
      topicMustIncludeSatisfied(["shared/theory/curvature-collapse-theory-badges.ts"], profile),
    ).toBe(true);
    expect(topicMustIncludeSatisfied(["server/energy-pipeline.ts"], profile)).toBe(false);
  });

  it("anchors star prompts to star-hydrostatic sources", () => {
    const tags = inferHelixAskTopicTags(
      "How does the star hydrostatic panel compute the stellar ledger?",
    );
    expect(tags).toContain("star");
    const profile = buildHelixAskTopicProfile(["star"]);
    expect(profile).not.toBeNull();
    expect(
      topicMustIncludeSatisfied(["client/src/pages/star-hydrostatic-panel.tsx"], profile),
    ).toBe(true);
    expect(
      topicMustIncludeSatisfied(["docs/knowledge/potato-threshold.md"], profile),
    ).toBe(true);
    expect(topicMustIncludeSatisfied(["modules/warp/warp-core.ts"], profile)).toBe(false);
  });

  it("tags kappa proxy prompts as ledger", () => {
    const tags = inferHelixAskTopicTags(
      "Compare kappa_drive vs kappa_body in the curvature ledger.",
    );
    expect(tags).toContain("ledger");
  });

  it("tags potato threshold prompts as star", () => {
    const tags = inferHelixAskTopicTags(
      "Explain the potato threshold in the star hydrostatic panel.",
    );
    expect(tags).toContain("star");
  });

  it("boosts warp docs for warp prompts", () => {
    const profile = buildHelixAskTopicProfile(["warp"]);
    expect(profile).not.toBeNull();
    expect(
      pathMatchesAny("docs/warp-console-architecture.md", profile?.boostPaths),
    ).toBe(true);
    expect(
      pathMatchesAny("docs/knowledge/warp/warp-bubble.md", profile?.boostPaths),
    ).toBe(true);
  });

  it("does not satisfy warp must-include with test files", () => {
    const profile = buildHelixAskTopicProfile(["warp"]);
    expect(profile).not.toBeNull();
    expect(
      topicMustIncludeSatisfied(["modules/warp/warp-module.test.ts"], profile),
    ).toBe(false);
    expect(
      topicMustIncludeSatisfied(["modules/warp/warp-module.ts"], profile),
    ).toBe(true);
  });

  it("tags save-the-sun prompts as star", () => {
    const tags = inferHelixAskTopicTags(
      "Give a staged plan to save the Sun during the red giant phase.",
    );
    expect(tags).toContain("star");
  });

  it("tags casimir prompts as physics", () => {
    const tags = inferHelixAskTopicTags("What is the Casimir effect?");
    expect(tags).toContain("physics");
  });

  it("tags ui prompts as ui", () => {
    const tags = inferHelixAskTopicTags("Map the UI components for the Helix desktop panels.");
    expect(tags).toContain("ui");
  });


  it("adds UI-components routing metadata for ui-tagged profiles", () => {
    const profile = buildHelixAskTopicProfile(["ui"]);
    expect(profile?.routingMetadata).toEqual({
      provenance_class: "inferred",
      claim_tier: "diagnostic",
      certifying: false,
    });
  });

  it("keeps non-ui profiles backward compatible without routing metadata", () => {
    const profile = buildHelixAskTopicProfile(["warp"]);
    expect(profile?.routingMetadata).toBeUndefined();
  });
  it("tags moral-ladder prompts as moral_ladder_pack", () => {
    const tags = inferHelixAskTopicTags(
      "Show me the moral-ladder-pack routing and provenance expectations.",
    );
    expect(tags).toContain("moral_ladder_pack");
  });

  it("adds moral-ladder routing metadata with conservative defaults", () => {
    const profile = buildHelixAskTopicProfile(["moral_ladder_pack"]);
    expect(profile?.routingMetadata).toEqual({
      provenance_class: "inferred",
      claim_tier: "diagnostic",
      certifying: false,
    });
    expect(topicMustIncludeSatisfied(["docs/moral-ladder-pack/overview.md"], profile)).toBe(true);
  });


  it("tags simulation prompts as simulation", () => {
    const tags = inferHelixAskTopicTags("How do the simulation systems stream results into the app?");
    expect(tags).toContain("simulation");
  });

  it("tags uncertainty mechanics prompts as uncertainty", () => {
    const tags = inferHelixAskTopicTags("Walk the uncertainty mechanics tree and its anchors.");
    expect(tags).toContain("uncertainty");
  });

  it("tags knowledge ingestion prompts as knowledge", () => {
    const tags = inferHelixAskTopicTags("Describe the knowledge ingestion and RAG pipeline.");
    expect(tags).toContain("knowledge");
  });

  it("tags ops prompts as ops", () => {
    const tags = inferHelixAskTopicTags("What CI and deployment runbooks exist for releases?");
    expect(tags).toContain("ops");
  });

  it("tags hardware telemetry prompts as hardware", () => {
    const tags = inferHelixAskTopicTags("Show the hardware telemetry flow into the panels.");
    expect(tags).toContain("hardware");
  });

  it("tags llm runtime prompts as llm", () => {
    const tags = inferHelixAskTopicTags("Explain the local LLM worker and tokenizer guardrails.");
    expect(tags).toContain("llm");
  });

  it("tags debate prompts as debate", () => {
    const tags = inferHelixAskTopicTags("Walk the debate referee loop and telemetry.");
    expect(tags).toContain("debate");
  });

  it("tags specialists prompts as specialists", () => {
    const tags = inferHelixAskTopicTags("List the specialists solvers and verifiers.");
    expect(tags).toContain("specialists");
  });

  it("tags security prompts as security", () => {
    const tags = inferHelixAskTopicTags("What does the hull guardrail enforce in HULL_MODE?");
    expect(tags).toContain("security");
  });

  it("tags skills prompts as skills", () => {
    const tags = inferHelixAskTopicTags("Where is the tool registry and skills catalog defined?");
    expect(tags).toContain("skills");
  });

  it("tags console telemetry prompts as console", () => {
    const tags = inferHelixAskTopicTags("How does console telemetry get captured and summarized?");
    expect(tags).toContain("console");
  });

  it("tags materials prompts as materials", () => {
    const tags = inferHelixAskTopicTags("Summarize the needle hull materials stack.");
    expect(tags).toContain("materials");
  });

  it("tags environment prompts as environment", () => {
    const tags = inferHelixAskTopicTags("Describe the environment model and environment tags.");
    expect(tags).toContain("environment");
  });

  it("tags sdk prompts as sdk", () => {
    const tags = inferHelixAskTopicTags("Show the TypeScript SDK client and runtime helpers.");
    expect(tags).toContain("sdk");
  });

  it("tags packages prompts as packages", () => {
    const tags = inferHelixAskTopicTags("How does create-casimir-verifier package scaffold work?");
    expect(tags).toContain("packages");
  });

  it("tags external prompts as external", () => {
    const tags = inferHelixAskTopicTags("List the external dependencies like llama.cpp and sunpy.");
    expect(tags).toContain("external");
  });
});
