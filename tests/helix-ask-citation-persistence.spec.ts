import { describe, expect, it } from "vitest";

import {
  applyCitationContractSourcesPolicy,
  applyCitationPersistenceGuard,
  applyOpenWorldSourcesPolicy,
  applyQualityFloorSourcesPolicy,
} from "../server/services/helix-ask/surface/citation-persistence";
import {
  OPEN_WORLD_SOURCES_MARKER_TEXT,
  sanitizeSourcesLine,
  shouldAppendOpenWorldSourcesMarker,
} from "../server/services/helix-ask/surface/sources-policy";

describe("helix ask sources policy helpers", () => {
  it("filters sources lines down to allowed paths and tokens", () => {
    const sanitized = sanitizeSourcesLine(
      [
        "Answer body.",
        "",
        "Sources: server/routes/agi.plan.ts, docs/missing.md, gate:certificate.hash",
      ].join("\n"),
      ["server/routes/agi.plan.ts"],
      ["gate:certificate.hash"],
    );

    expect(sanitized).toContain("Sources: server/routes/agi.plan.ts, gate:certificate.hash");
    expect(sanitized).not.toContain("docs/missing.md");
  });

  it("preserves allowlisted repo and https citations while dropping unsupported paths", () => {
    const sanitized = sanitizeSourcesLine(
      [
        "Answer body.",
        "",
        "Sources: server/routes/agi.plan.ts, https://example.com/reference.pdf, docs/missing.md",
      ].join("\n"),
      ["server/routes/agi.plan.ts"],
      ["https://example.com/reference.pdf"],
    );

    expect(sanitized).toContain(
      "Sources: server/routes/agi.plan.ts, https://example.com/reference.pdf",
    );
    expect(sanitized).not.toContain("docs/missing.md");
  });

  it("preserves allowlisted DOI and arXiv citations in sources lines", () => {
    const sanitized = sanitizeSourcesLine(
      [
        "Answer body.",
        "",
        "Sources: 10.48550/arXiv.2303.08896, arXiv:2309.11495, docs/missing.md",
      ].join("\n"),
      [],
      ["10.48550/arXiv.2303.08896", "arXiv:2309.11495"],
    );

    expect(sanitized).toContain("Sources: 10.48550/arXiv.2303.08896, arXiv:2309.11495");
    expect(sanitized).not.toContain("docs/missing.md");
  });

  it("preserves the open-world marker during sanitization", () => {
    const sanitized = sanitizeSourcesLine(
      `Open-world answer.\n\n${OPEN_WORLD_SOURCES_MARKER_TEXT}`,
      [],
      [],
    );

    expect(sanitized).toContain(OPEN_WORLD_SOURCES_MARKER_TEXT);
  });

  it("skips appending the open-world marker when tree-walk citations already exist", () => {
    expect(
      shouldAppendOpenWorldSourcesMarker({
        answerText: "Open-world answer.",
        treeWalkBlock: "Tree Walk:\n- server/routes/agi.plan.ts",
      }),
    ).toBe(false);
  });
});

describe("helix ask citation persistence helpers", () => {
  it("applies the citation persistence guard and appends grounded sources when needed", () => {
    const answerPath: string[] = [];
    const debugPayload: Record<string, unknown> = {};

    const result = applyCitationPersistenceGuard({
      cleaned: "Grounded answer body.",
      citationLinkingRequired: true,
      allowedPaths: ["server/routes/agi.plan.ts"],
      citationTokens: ["server/routes/agi.plan.ts"],
      answerPath,
      debugPayload,
    });

    expect(result.cleaned).toContain("Sources: server/routes/agi.plan.ts");
    expect(result.citationPersistenceOk).toBe(true);
    expect(answerPath).toContain("citationPersistence:append_sources");
    expect(debugPayload.citation_persistence_guard_applied).toBe(true);
    expect(debugPayload.citation_persistence_ok).toBe(true);
  });

  it("suppresses repo-style source append for non-repo quality-floor cases", () => {
    const answerPath: string[] = [];
    const debugPayload: Record<string, unknown> = {};

    const cleaned = applyQualityFloorSourcesPolicy({
      cleaned: "Open-world answer body.",
      repoStyleSourceAppendAllowed: false,
      finalCitationTokens: ["server/routes/agi.plan.ts"],
      answerPath,
      debugPayload,
    });

    expect(cleaned).toBe("Open-world answer body.");
    expect(answerPath).toContain("qualityFloor:append_sources_skipped_non_repo");
    expect(debugPayload.citation_append_suppressed).toBe(true);
    expect(debugPayload.citation_append_suppressed_reason).toBe("open_world_or_security_non_repo");
  });

  it("applies contract sources when citation linking requires a visible sources line", () => {
    const answerPath: string[] = [];
    const debugPayload: Record<string, unknown> = {};

    const cleaned = applyCitationContractSourcesPolicy({
      cleaned: "Equation answer.",
      citationLinkingRequired: true,
      contractCitationTokens: ["shared/schema.ts"],
      answerPath,
      debugPayload,
    });

    expect(cleaned).toContain("Sources: shared/schema.ts");
    expect(answerPath).toContain("citationContract:append_sources");
    expect(debugPayload.citation_contract_applied).toBe(true);
  });

  it("adds the open-world sources marker during citation suppression", () => {
    const answerPath: string[] = [];

    const cleaned = applyOpenWorldSourcesPolicy({
      cleaned: "General guidance only.",
      suppressGeneralCitations: true,
      preserveForcedAnswerAcrossFinalizer: false,
      securityOpenWorldPrompt: false,
      baseQuestion: "How should I think about this generally?",
      treeWalkBlock: null,
      answerPath,
      stripRepoCitationsForOpenWorldBypass: (value) => value,
      rewriteOpenWorldBestEffortAnswer: (value) => value,
    });

    expect(cleaned).toContain(OPEN_WORLD_SOURCES_MARKER_TEXT);
    expect(answerPath).toContain("citationScrub:open_world_sources_marker");
  });

  it("does not append open-world sources marker for forced clarify preservation", () => {
    const answerPath: string[] = [];
    const cleaned = applyOpenWorldSourcesPolicy({
      cleaned: `Quick check: what object, file, or concept does "this" refer to?\n\n${OPEN_WORLD_SOURCES_MARKER_TEXT}`,
      suppressGeneralCitations: true,
      preserveForcedAnswerAcrossFinalizer: true,
      securityOpenWorldPrompt: false,
      baseQuestion: "ok what is this used for?",
      treeWalkBlock: null,
      answerPath,
      stripRepoCitationsForOpenWorldBypass: (value) =>
        value
          .split(/\r?\n/)
          .filter((line) => !/^\s*Sources:\s*/i.test(line.trim()))
          .join("\n")
          .trim(),
      rewriteOpenWorldBestEffortAnswer: (value) => value,
    });

    expect(cleaned).not.toContain("Sources: open-world best-effort");
    expect(answerPath).toContain("citationScrub:open_world_sources_marker_skipped_forced_clarify");
    expect(answerPath).toContain("citationScrub:skipped_forced_clarify");
  });
});
