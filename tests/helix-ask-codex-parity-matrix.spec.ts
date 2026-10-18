import { describe, expect, it } from "vitest";

import { __testCapsuleGrounding, __testHelixAskReliabilityGuards } from "../server/routes/agi.plan";
import { evaluateUncertaintyResearchContract } from "../server/services/helix-ask/surface/research-citation-policy";
import * as fs from "node:fs";
import * as path from "node:path";

type ParityCase = {
  label: string;
  question: string;
  answer: string;
  answerPath: string[];
  finalValidated: boolean;
  expectedClass: "clarify" | "direct";
  expectedFinalizationDetail: "response_ready" | "response_blocked_final_validator";
};

const classifyAnswer = (question: string, answer: string): "clarify" | "direct" => {
  const deictic = __testHelixAskReliabilityGuards.isHelixAskDeicticQuestionWithoutAnchor(question);
  const clarify = __testHelixAskReliabilityGuards.isHelixAskDeicticClarifyResponse(answer);
  if (deictic && clarify) return "clarify";
  return "direct";
};

const deriveFinalizationDetail = (validated: boolean): "response_ready" | "response_blocked_final_validator" =>
  validated ? "response_ready" : "response_blocked_final_validator";

const readHelixAskRouteSource = (): string =>
  fs.readFileSync(path.join(process.cwd(), "server/routes/agi.plan.ts"), "utf8");

describe("helix ask codex parity matrix", () => {
  it("keeps deictic clarify responses anchor-safe and blocks stale capsule greetings", () => {
    const clarifier = __testCapsuleGrounding.buildCapsuleTargetedClarifier("what is this used for?", [
      "hello",
      "assist",
      "today",
      "unknown",
    ]);
    expect(clarifier.toLowerCase()).not.toContain('"hello"');
    expect(__testHelixAskReliabilityGuards.isHelixAskDeicticQuestionWithoutAnchor("what is this used for?")).toBe(
      true,
    );
    expect(__testHelixAskReliabilityGuards.isHelixAskDeicticClarifyResponse(clarifier)).toBe(true);
  });

  it("detects typo-variant deictic prompts as clarify-required", () => {
    expect(
      __testHelixAskReliabilityGuards.isHelixAskDeicticQuestionWithoutAnchor(
        "Whats is this used for?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskDeicticQuestionWithoutAnchor(
        "ok whats this used for?",
      ),
    ).toBe(true);
  });

  it("enforces codex-clone baseline for uncertainty-sensitive repo claims", () => {
    const missingCodex = evaluateUncertaintyResearchContract({
      question: "Can this uncertain repo claim be trusted?",
      text: [
        "Confidence/Uncertainty: bounded to current evidence.",
        "",
        "Sources: server/routes/agi.plan.ts, https://arxiv.org/abs/2005.11401, https://arxiv.org/abs/2309.11495",
      ].join("\n"),
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "repo",
      claimTier: "diagnostic",
    });
    expect(missingCodex.pass).toBe(false);
    expect(missingCodex.missingReasons).toContain("uncertainty_research_contract_missing:codex_clone_reference");

    const withCodex = evaluateUncertaintyResearchContract({
      question: "Can this uncertain repo claim be trusted?",
      text: [
        "Confidence/Uncertainty: bounded to current evidence.",
        "",
        "Sources: server/routes/agi.plan.ts, external/openai-codex/codex-rs/app-server-protocol/src/protocol/v2.rs, https://arxiv.org/abs/2005.11401, https://arxiv.org/abs/2309.11495",
      ].join("\n"),
      requireResearchOnUncertainty: true,
      uncertaintySignal: true,
      intentDomain: "repo",
      claimTier: "diagnostic",
    });
    expect(withCodex.pass).toBe(true);
    expect(withCodex.codexReferenceCount).toBeGreaterThan(0);
  });

  it("replays codex-parity matrix for answer class, answer-path marker, and finalization detail", () => {
    const cases: ParityCase[] = [
      {
        label: "deictic clarify fallback",
        question: "what is this used for?",
        answer: 'Quick check: what object, file, or concept does "this" refer to?',
        answerPath: ["finalSurface:deictic_clarify_fallback"],
        finalValidated: true,
        expectedClass: "clarify",
        expectedFinalizationDetail: "response_ready",
      },
      {
        label: "direct answer path",
        question: "What is buildCapsuleTargetedClarifier used for in server/routes/agi.plan.ts?",
        answer: "It generates a short clarifying prompt when capsule constraints indicate ambiguous user intent.",
        answerPath: ["answer:llm", "finalSurface:claim_basis_line"],
        finalValidated: true,
        expectedClass: "direct",
        expectedFinalizationDetail: "response_ready",
      },
    ];

    for (const testCase of cases) {
      const answerClass = classifyAnswer(testCase.question, testCase.answer);
      expect(answerClass, testCase.label).toBe(testCase.expectedClass);

      if (testCase.expectedClass === "clarify") {
        expect(testCase.answerPath, testCase.label).toContain("finalSurface:deictic_clarify_fallback");
      } else {
        expect(testCase.answerPath.some((entry) => entry.startsWith("answer:")), testCase.label).toBe(true);
      }

      const finalizationDetail = deriveFinalizationDetail(testCase.finalValidated);
      expect(finalizationDetail, testCase.label).toBe(testCase.expectedFinalizationDetail);
    }
  });

  it("keeps final validator log before finalization log in route source", () => {
    const source = readHelixAskRouteSource();
    const validatorIdx = source.indexOf('logEvent(\n      "Final answer validator"');
    const finalizationIdx = source.indexOf('logEvent(\n      "Finalization"');
    expect(validatorIdx).toBeGreaterThan(-1);
    expect(finalizationIdx).toBeGreaterThan(-1);
    expect(validatorIdx).toBeLessThan(finalizationIdx);
    expect(source).toContain("response_blocked_final_validator");
    expect(source).toContain("uncertainty_missing_codex_clone_baseline");
  });

  it("requires explicit research intent before enforcing codex/arxiv uncertainty citations", () => {
    const source = readHelixAskRouteSource();
    expect(source).toContain("const finalModeGateResearchRequested =");
    expect(source).toContain("const finalSurfaceResearchRequested =");
    expect(source).toContain("finalSurfaceRepoOrHybrid && finalSurfaceResearchRequested");
    expect(source).not.toContain("const finalSurfaceRequireResearchOnUncertainty = finalSurfaceRepoOrHybrid;");
  });

  it("keeps terminal non-report scrub active before final response send", () => {
    const source = readHelixAskRouteSource();
    expect(source).toContain("finalSurface:terminal_non_report_scrub");
    expect(source).toContain("stripHelixAskSecondaryArtifactBlocks(responsePayload.text)");
    expect(source).toContain("stripHelixAskVisibleSourcesLines(");
  });

  it("treats obligations-only misses as soft-final-validation and avoids non-deictic clarify forcing", () => {
    const source = readHelixAskRouteSource();
    expect(source).toContain("const finalValidationOnlyObligationsMissing =");
    expect(source).toContain("finalValidationReasons.every((reason) => reason === \"answer_obligations_missing\")");
    expect(source).toContain("objectiveConsistencyBlocked &&");
    expect(source).toContain("deicticQuestionWithoutAnchor &&");
    expect(source).toContain("final_answer_validator_soft_pass");
    expect(source).toContain("!answerPath.includes(\"finalSurface:final_answer_validator_fallback\")");
  });
});
