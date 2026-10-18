import { describe, expect, it } from "vitest";
import {
  evaluateEquationBenchmarkCase,
  parseEquationAnswer,
} from "../scripts/lib/helix-ask-equation-benchmark";

describe("helix ask equation benchmark evaluator", () => {
  it("parses sectioned equation answer structure", () => {
    const parsed = parseEquationAnswer(
      [
        "Primary Topic: collapse",
        "Primary Equation (Tentative):",
        "- [shared/dp-collapse.ts:L280] psi_next = (Pm * psi0) / sqrt(prob)",
        "Mechanism Explanation:",
        "1. Collapse update projects state and normalizes by probability.",
        "Sources: shared/dp-collapse.ts, server/services/mixer/collapse.ts",
      ].join("\n"),
    );
    expect(parsed.primaryTopic).toBe("collapse");
    expect(parsed.primaryEquationMode).toBe("tentative");
    expect(parsed.primaryEquationBlock).toContain("psi_next");
    expect(parsed.sectionsPresent).toContain("Primary Topic");
    expect(parsed.sectionsPresent).toContain("Mechanism Explanation");
    expect(parsed.sourcePaths).toContain("shared/dp-collapse.ts");
  });

  it("scores preferred equation/source matches and rejects forbidden anchors", () => {
    const good = evaluateEquationBenchmarkCase(
      [
        "Primary Topic: collapse",
        "Primary Equation (Tentative):",
        "- [shared/dp-collapse.ts:L280] psi_next = (Pm * psi0) / sqrt(prob)",
        "Mechanism Explanation:",
        "1. This maps measurement projection and normalization into runtime state updates.",
        "Sources: shared/dp-collapse.ts, server/services/mixer/collapse.ts",
      ].join("\n"),
      {
        primaryTopic: "collapse",
        preferredEquationPatterns: ["psi|collapse|measurement"],
        preferredSourcePaths: ["shared/dp-collapse.ts"],
        forbiddenEquationPatterns: ["volume\\s*=\\s*\\(4\\s*/\\s*3\\)"],
        minMechanismChars: 80,
        passThreshold: 65,
      },
    );
    expect(good.pass).toBe(true);
    expect(good.score).toBeGreaterThanOrEqual(65);

    const bad = evaluateEquationBenchmarkCase(
      [
        "Primary Topic: collapse",
        "Primary Equation (Tentative):",
        "- [shared/dp-collapse.ts:L280] volume = (4 / 3) * PI * r * r * r",
        "Mechanism Explanation:",
        "1. Short.",
        "Sources: shared/dp-collapse.ts",
      ].join("\n"),
      {
        primaryTopic: "collapse",
        preferredEquationPatterns: ["\\bpsi\\b"],
        forbiddenEquationPatterns: ["volume\\s*=\\s*\\(4\\s*/\\s*3\\)"],
        minMechanismChars: 80,
      },
    );
    expect(bad.pass).toBe(false);
    expect(bad.failures).toContain("forbidden_equation_pattern_hit");
    expect(bad.failures).toContain("preferred_equation_pattern_missing");
  });

  it("enforces mechanism consensus frame when required", () => {
    const withFrame = evaluateEquationBenchmarkCase(
      [
        "Primary Topic: collapse",
        "Primary Equation (Tentative):",
        "- [shared/dp-collapse.ts:L280] psi_next = (Pm * psi0) / sqrt(prob)",
        "Mechanism Explanation:",
        "1. General-reference baseline: Pr(m) = ||Pm psi||^2 and psi' = (Pm psi) / sqrt(<psi|Pm|psi>).",
        "2. Repo-grounded support: [shared/dp-collapse.ts:L280] provides implementation-level normalization linkage.",
        "3. Challenge status: canonical postulate coverage remains partial in current retrieval.",
        "Sources: shared/dp-collapse.ts",
      ].join("\n"),
      {
        primaryTopic: "collapse",
        requireConsensusFrame: true,
        requiredMechanismPatterns: ["baseline", "support", "challenge"],
        minMechanismChars: 120,
        passThreshold: 65,
      },
    );
    expect(withFrame.pass).toBe(true);
    expect(withFrame.failures).not.toContain("consensus_frame_missing");
    expect(withFrame.details.mechanismPatternScore).toBeGreaterThan(0);

    const withoutFrame = evaluateEquationBenchmarkCase(
      [
        "Primary Topic: collapse",
        "Primary Equation (Tentative):",
        "- [shared/dp-collapse.ts:L280] psi_next = (Pm * psi0) / sqrt(prob)",
        "Mechanism Explanation:",
        "1. This maps measurement projection and normalization into runtime state updates.",
        "Sources: shared/dp-collapse.ts",
      ].join("\n"),
      {
        primaryTopic: "collapse",
        requireConsensusFrame: true,
        requiredMechanismPatterns: ["baseline", "support", "challenge"],
        minMechanismChars: 80,
        passThreshold: 65,
      },
    );
    expect(withoutFrame.pass).toBe(false);
    expect(withoutFrame.failures).toContain("consensus_frame_missing");
    expect(withoutFrame.failures).toContain("required_mechanism_pattern_missing");
  });
});
