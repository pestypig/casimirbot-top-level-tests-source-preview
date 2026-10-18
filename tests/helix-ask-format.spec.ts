import { describe, expect, it } from "vitest";
import { enforceHelixAskAnswerFormat, hasReportScaffolding, stripNonReportScaffolding } from "../server/services/helix-ask/format";

describe("Helix Ask format compliance", () => {
  it("collapses bullet-only answers into paragraphs for compare", () => {
    const raw = [
      "- Definition: Epistemology is the study of knowledge",
      "- Key questions: What counts as knowledge?",
      "- Notes: It contrasts empirical and rational standards.",
      "In practice, epistemology evaluates belief reliability.",
    ].join("\n");
    const formatted = enforceHelixAskAnswerFormat(raw, "compare", "What is epistemology?");
    expect(formatted).not.toMatch(/^\s*[-*]\s+/m);
    expect(formatted).toContain("Definition:");
    expect(formatted).toContain("In practice");
  });

  it("drops trailing bullet lists when paragraphs already exist", () => {
    const raw = [
      "Epistemology studies knowledge and justification.",
      "",
      "- Definition: Epistemology is the study of knowledge.",
      "- Key questions: What counts as knowledge?",
      "- Notes: It contrasts empirical and rational standards.",
      "In practice, epistemology evaluates belief reliability.",
    ].join("\n");
    const formatted = enforceHelixAskAnswerFormat(raw, "compare", "What is epistemology?");
    expect(formatted).toContain("Epistemology studies knowledge");
    expect(formatted).not.toMatch(/^\s*[-*]\s+/m);
  });

  it("keeps list content when only non-list paragraph is In practice", () => {
    const raw = [
      "- Definition: Epistemology is the study of knowledge.",
      "- Key questions: What counts as knowledge?",
      "- Notes: It contrasts empirical and rational standards.",
      "In practice, epistemology evaluates belief reliability.",
    ].join("\n");
    const formatted = enforceHelixAskAnswerFormat(raw, "compare", "What is epistemology?");
    expect(formatted).toContain("Definition:");
    expect(formatted).toContain("In practice");
    expect(formatted).not.toMatch(/^\s*[-*]\s+/m);
  });


  it("detects report scaffolding markers before stripping", () => {
    const raw = ["Executive summary:", "Coverage map: warp, ethos", "Body line."].join("\n");
    expect(hasReportScaffolding(raw)).toBe(true);
    expect(hasReportScaffolding("Body line only.")).toBe(false);
  });

  it("strips report scaffolding markers from non-report outputs", () => {
    const raw = [
      "Executive summary:",
      "Coverage map: warp, ethos",
      "Warp bubble viability is constrained by measurable gates.",
      "In practice, governance links claims to falsifiable checks.",
    ].join("\n\n");
    const cleaned = stripNonReportScaffolding(raw);
    expect(cleaned).not.toMatch(/Executive summary:/i);
    expect(cleaned).not.toMatch(/Coverage map:/i);
    expect(cleaned).toMatch(/Warp bubble viability is constrained/i);
  });
});
