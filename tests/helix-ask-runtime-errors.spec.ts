import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import * as vm from "node:vm";
import {
  buildPromptResearchRetrievalContract,
  parsePromptResearchContract,
  renderPromptResearchFailClosedAnswer,
} from "../server/services/helix-ask/prompt-research-contract";
import { buildPromptResearchGenerationContract } from "../server/services/helix-ask/generation-contract";
import { buildObligationEvidence } from "../server/services/helix-ask/evidence-contract";
import { explainPrecedenceConflicts, rankPathsByPrecedence } from "../server/services/helix-ask/retrieval-contract";
import {
  buildPromptResearchContractProvenanceTableBlock,
  repairPromptResearchContractAnswer,
  validatePromptResearchContractAnswer,
} from "../server/services/helix-ask/research-validator";
import { isFastModeRuntimeMissingSymbolError } from "../server/services/helix-ask/runtime-errors";
import {
  __testHelixAskReliabilityGuards,
  __testHelixAskDialogueFormatting,
  __testOnlyNonReportGuard,
} from "../server/routes/agi.plan";
import { buildHelixAskEnvelope } from "../server/services/helix-ask/envelope";

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const toBooleanOrNull = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const readHelixAskRouteSource = (): string =>
  fs.readFileSync(path.join(process.cwd(), "server/routes/agi.plan.ts"), "utf8");

const buildHelixAskObjectiveMiniSynthParser = (): (
  raw: string,
  options?: {
    objectiveHints?: Array<{
      objective_id: string;
      objective_label?: string;
      required_slots?: string[];
    }>;
  },
) => unknown => {
  const routeSource = readHelixAskRouteSource();
  const startMarker = "const parseHelixAskObjectiveMiniSynth = (";
  const endMarker = "\nconst applyHelixAskObjectiveMiniSynth = (";
  const startIndex = routeSource.indexOf(startMarker);
  const endIndex = routeSource.indexOf(endMarker, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error("parseHelixAskObjectiveMiniSynth source block was not found");
  }

  const miniSynthSource = routeSource.slice(startIndex, endIndex);
  const wrappedSource = [
    'const collectHelixAskJsonParseCandidates = () => [];',
    `const normalizeHelixAskObjectiveSlotArray = (value) => Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .map((slot) => String(slot ?? "").trim().toLowerCase().replace(/\\s+/g, "-"))
              .filter(Boolean),
          ),
        )
      : [];`,
    'const normalizeHelixAskTurnContractText = (value, max) => String(value ?? "").trim().slice(0, max);',
    'const normalizeSlotId = (value) => String(value ?? "").trim().toLowerCase().replace(/\\s+/g, "-");',
    'const sanitizeHelixAskObjectiveUnknownBlock = ({ block }) => block;',
    miniSynthSource,
    "module.exports = parseHelixAskObjectiveMiniSynth;",
  ].join("\n");

  const transpiled = ts.transpileModule(wrappedSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const sandbox = {
    module: { exports: {} },
    exports: {},
  } as {
    module: { exports: unknown };
    exports: unknown;
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transpiled, sandbox, {
    filename: "parseHelixAskObjectiveMiniSynth.test.js",
  });
  return sandbox.module.exports as (
    raw: string,
    options?: {
      objectiveHints?: Array<{
        objective_id: string;
        objective_label?: string;
        required_slots?: string[];
      }>;
    },
  ) => unknown;
};

const readJsonIfExists = (relPath: string): unknown | null => {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "")) as unknown;
};

const isObjectiveStepTranscriptRow = (value: unknown): value is Record<string, unknown> => {
  const row = asObject(value);
  if (!row) return false;
  return (
    typeof row.objective_id === "string" &&
    typeof row.attempt === "number" &&
    typeof row.verb === "string" &&
    typeof row.prompt_preview === "string" &&
    typeof row.output_preview === "string" &&
    typeof row.decision === "string" &&
    typeof row.decision_reason === "string" &&
    asObject(row.evidence_delta) !== null &&
    asObject(row.validator) !== null
  );
};

const RESEARCH_CONTRACT_PROMPT = `# Warp Paper Deep-Research Prompt v2

## Purpose

Generate a physics-first NHM2 manuscript package for physicists.

## Hard Constraints

1. Preserve this boundary statement verbatim:
"This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim."
2. Use only repo-committed, readable artifacts as authoritative inputs.
3. If a required value or artifact is unavailable, write \`UNKNOWN\` rather than inferring.

## Canonical Precedence Rule

1. docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md
2. docs/audits/research/warp-full-solve-campaign-execution-report-2026-02-24.md
3. external literature

## Required Repo Inputs

- docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md
- docs/does-not-exist.md

Use additional repo files only as needed from those anchors.

## Required Top-Level Structure

### 1. Motivation and Boundary

Must cover:

- why warp-family metrics are studied in principle
- why NHM2 is framed as reduced-order and falsifiable

### 2. Metric Setup

Must include:

- line element and signature conventions
- lapse, shift, and spatial metric notation

## Derivation Appendix Requirements

1. metric / ADM derivations
2. evidence-lane derivation mapping tables

## Provenance Table Requirement

| source_id | equation_trace_id | equation | substitutions (with units) | mapped_entry_ids | mapped_framework_variables | recompute_status | blocker_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Claim Discipline Section

1. what can be said now
2. what cannot be said now

## Fail-Closed Behavior

If any required repo input is missing or unreadable:

- return \`blocked=true\`
- list the missing paths
- set \`stop_reason=Fail-closed\`
- do not complete the manuscript

## Self-Check Before Final Output

1. Boundary statement appears verbatim.
2. Missing values are marked \`UNKNOWN\`.`;

describe("isFastModeRuntimeMissingSymbolError", () => {
  it("detects missing runHelperWithinStageBudget symbol from Node reference errors", () => {
    const error = new ReferenceError("runHelperWithinStageBudget is not defined");
    expect(isFastModeRuntimeMissingSymbolError(error)).toBe(true);
  });

  it("detects missing getAskElapsedMs symbol from Safari-style messages", () => {
    const message = "ReferenceError: Can't find variable: getAskElapsedMs";
    expect(isFastModeRuntimeMissingSymbolError(message)).toBe(true);
  });

  it("detects quoted/function-form missing symbol messages", () => {
    expect(isFastModeRuntimeMissingSymbolError("ReferenceError: 'getAskElapsedMs' is not defined")).toBe(true);
    expect(isFastModeRuntimeMissingSymbolError("ReferenceError: getAskElapsedMs() is not defined")).toBe(true);
  });

  it("ignores unrelated runtime errors", () => {
    const error = new Error("database connection reset");
    expect(isFastModeRuntimeMissingSymbolError(error)).toBe(false);
  });
});


describe("non-report guard ordering for runtime fallback", () => {
  it("strips report scaffolding for non-report runtime fallback context", () => {
    const context = __testOnlyNonReportGuard.resolveNonReportGuardContext(
      "Where is ask route logic?",
    );
    const guarded = __testOnlyNonReportGuard.enforceNonReportModeGuard(
      "Executive summary:\n- Runtime fallback excerpt surfaced.\n\nCoverage map:\n- Grounded: 0\n\nSources: server/routes/agi.plan.ts",
      context.reportModeEnabled,
      context.intentStrategy,
    );

    expect(context.reportModeEnabled).toBe(false);
    expect(context.intentStrategy).not.toBe("constraint_report");
    expect(guarded.text).not.toMatch(/Executive summary:/i);
    expect(guarded.text).toMatch(/Runtime fallback excerpt surfaced/i);
    expect(guarded.hadScaffold).toBe(true);
  });

  it("preserves report scaffolding for explicit report requests", () => {
    const context = __testOnlyNonReportGuard.resolveNonReportGuardContext(
      "Generate a report for helix ask with executive summary and coverage map.",
    );
    const answer = "Executive summary:\n- item\n\nCoverage map:\n- Grounded: 1";
    const guarded = __testOnlyNonReportGuard.enforceNonReportModeGuard(
      answer,
      context.reportModeEnabled,
      context.intentStrategy,
    );

    expect(context.reportModeEnabled).toBe(true);
    expect(guarded.text).toBe(answer);
    expect(guarded.hadScaffold).toBe(false);
  });

  it("rewrites scientific scaffold fallback into user-facing prose in non-report mode", () => {
    const context = __testOnlyNonReportGuard.resolveNonReportGuardContext(
      "What is a warp bubble? How is it solved in the codebase?",
    );
    const scaffold = [
      "Confirmed:",
      "- Retrieved grounded repository anchors: modules/warp/natario-warp.ts, docs/knowledge/warp/warp-bubble.md.",
      "",
      "Reasoned connections (bounded):",
      "- Bounded linkage supported by cited repo evidence (modules/warp/natario-warp.ts and docs/knowledge/warp/warp-bubble.md).",
      "",
      "Next evidence:",
      "- Checked files: modules/warp/natario-warp.ts, modules/warp/warp-module.ts",
      "",
      "Sources: modules/warp/natario-warp.ts, docs/knowledge/warp/warp-bubble.md",
    ].join("\n");
    const guarded = __testOnlyNonReportGuard.enforceNonReportModeGuard(
      scaffold,
      context.reportModeEnabled,
      context.intentStrategy,
    );

    expect(context.reportModeEnabled).toBe(false);
    expect(guarded.hadScaffold).toBe(true);
    expect(guarded.text).not.toMatch(/^Confirmed:/i);
    expect(guarded.text).not.toMatch(/^Reasoned connections \(bounded\):/im);
    expect(guarded.text).not.toMatch(/^Next evidence:/im);
    expect(guarded.text).toMatch(/In practical terms,/i);
    expect(guarded.text).toMatch(/^Sources:/im);
  });

  it("rewrites inline scientific scaffold headings emitted by fallback synthesis", () => {
    const context = __testOnlyNonReportGuard.resolveNonReportGuardContext(
      "What is a warp bubble? How is it solved in the codebase?",
    );
    const inlineScaffold = [
      "Confirmed:",
      "- Retrieved grounded repository anchors: modules/warp/natario-warp.ts, docs/warp-console-architecture.md, docs/knowledge/warp/warp-bubble.md, docs/warp-tree-dag-walk-rules.md. Reasoned connections (bounded):",
      "- Bounded linkage supported by cited repo evidence (modules/warp/natario-warp.ts and docs/warp-console-architecture.md). Next evidence:",
      "- Searched terms: What is a warp bubble?, warp bubble, calculateNatarioWarpBubble",
      "- Checked files: modules/warp/natario-warp.ts, modules/warp/warp-module.ts",
      "Sources: modules/warp/natario-warp.ts, docs/knowledge/warp/warp-bubble.md",
    ].join("\n");
    const guarded = __testOnlyNonReportGuard.enforceNonReportModeGuard(
      inlineScaffold,
      context.reportModeEnabled,
      context.intentStrategy,
    );

    expect(context.reportModeEnabled).toBe(false);
    expect(context.intentStrategy).not.toBe("constraint_report");
    expect(guarded.hadScaffold).toBe(true);
    expect(guarded.text).not.toMatch(/^Confirmed:/i);
    expect(guarded.text).not.toMatch(/Reasoned connections \(bounded\):/i);
    expect(guarded.text).not.toMatch(/Next evidence:/i);
    expect(guarded.text).toMatch(/In practical terms,/i);
    expect(guarded.text).toMatch(/^Sources:/im);
  });

  it("hides visible sources lines for conversational answers while preserving conversational mode", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "The ask route keeps the answer conversational unless the user explicitly asks for report formatting.",
        "",
        "Sources: server/routes/agi.plan.ts, docs/helix-ask-flow.md",
      ].join("\n"),
      question: "How does Helix Ask decide whether to answer conversationally?",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
      citationTokens: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.visibleSources).toBe(false);
    expect(finalized.text).not.toMatch(/^Sources:/im);
    expect(finalized.text).toMatch(/conversational/i);
  });

  it("keeps visible sources lines when the prompt explicitly asks for sources", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText:
        "The route is assembled in server/routes/agi.plan.ts and explained in docs/helix-ask-flow.md.",
      question: "Explain how Helix Ask routes requests with sources.",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
      citationTokens: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.visibleSources).toBe(true);
    expect(finalized.explicitVisibleSourcesRequested).toBe(true);
    expect(finalized.text).toMatch(/^Sources:/im);
  });

  it("preserves coherent conversational answers across soft composer guards", () => {
    const preserve = __testOnlyNonReportGuard.shouldPreserveConversationalAnswer({
      answerSurfaceMode: "conversational",
      answerText:
        "The route keeps the model answer in natural prose and carries provenance separately in metadata when the prompt does not ask for a report.",
      hardComposerGuardTriggered: false,
      promptFamily: "general_overview",
    });

    expect(preserve).toBe(true);
  });

  it("rejects malformed operator-noise answers from conversational preservation", () => {
    const preserve = __testOnlyNonReportGuard.shouldPreserveConversationalAnswer({
      answerSurfaceMode: "conversational",
      answerText:
        "The value of shift vector is at*by*is*looking*mild*norm*of*proves*regime*shift*the^3vector.",
      hardComposerGuardTriggered: false,
      promptFamily: "general_overview",
    });

    expect(preserve).toBe(false);
  });

  it("flattens structured fallback scaffolding in conversational surface mode", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Direct Answer:",
        "- Helix Ask routes prompts through retrieval and synthesis.",
        "",
        "Mechanism Explanation:",
        "- The routing layer decides whether repo grounding is required.",
      ].join("\n"),
      question: "How does Helix Ask route prompts?",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["server/routes/agi.plan.ts"],
      citationTokens: ["server/routes/agi.plan.ts"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).not.toMatch(/^Direct Answer:/im);
    expect(finalized.text).not.toMatch(/^Mechanism Explanation:/im);
    expect(finalized.text).toMatch(/routes prompts through retrieval/i);
    expect(finalized.text).not.toMatch(/In practical terms,/i);
  });

  it("flattens inline report labels and bracketed citations in conversational surface mode", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "The routing policy is documented in. [docs/knowledge/helix-ask-reasoning.md] - Evidence: The pipeline runs retrieval, evidence gates, and synthesis. [docs/knowledge/helix-ask-reasoning.md]",
        "Mechanism: Follow-up prompts stay conversational unless report mode or fail-closed output is required. [server/routes/agi.plan.ts]",
        "Missing evidence: add more direct repo anchors when confidence is weak. [docs/helix-ask-flow.md]",
        "Sources: server/routes/agi.plan.ts, docs/helix-ask-flow.md",
      ].join("\n"),
      question: "How does Helix Ask answer conversationally?",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
      citationTokens: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).not.toMatch(/\[(?:docs|server)\//i);
    expect(finalized.text).not.toMatch(/\bEvidence:/i);
    expect(finalized.text).not.toMatch(/\bMechanism:/i);
    expect(finalized.text).not.toMatch(/\bMissing evidence:/i);
    expect(finalized.text).not.toMatch(/^Sources:/im);
    expect(finalized.text).toMatch(/retrieval, evidence gates, and synthesis/i);
    expect(finalized.text).not.toMatch(/In practical terms,/i);
    expect(finalized.text).not.toMatch(/Remaining gap:/i);
  });

  it("drops planner-anchor scaffold sentences instead of paraphrasing them", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Canonical runtime contract (2026-02-11): warp-mechanics-tree.json: guardrail_congruent.",
        "The shift-vector explanation. is grounded in modules/warp/natario-warp.ts, modules/warp/warp-module.ts.",
        "The shift-vector explanation. is anchored in docs/warp-tree-dag-walk-rules.md.",
        "Primary implementation anchors for shift-vector explanation are modules/warp/natario-warp.ts and modules/warp/warp-module.ts.",
        "Current evidence is incomplete for shift-vector explanation; missing slots: code-path, failure-path.",
      ].join("\n"),
      question: "Why does the mild shift-vector regime matter to the solve?",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: [
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
        "docs/warp-tree-dag-walk-rules.md",
      ],
      citationTokens: [
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
        "docs/warp-tree-dag-walk-rules.md",
      ],
    });

    expect(finalized.text).not.toMatch(/Canonical runtime contract/i);
    expect(finalized.text).not.toMatch(/grounded in/i);
    expect(finalized.text).not.toMatch(/anchored in/i);
    expect(finalized.text).not.toMatch(/Primary implementation anchors/i);
    expect(finalized.text).not.toMatch(/Current evidence is incomplete/i);
    expect(finalized.text).toMatch(/That matters because it tells the solve/i);
    expect(finalized.text).not.toMatch(/Remaining gap: missing/i);
  });

  it("canonicalizes visible sources to a single line when explicitly requested", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Helix Ask routes prompts through retrieval and synthesis. Sources: docs/knowledge/helix-ask-reasoning.md",
        "",
        "Sources: server/routes/agi.plan.ts, docs/helix-ask-flow.md",
      ].join("\n"),
      question: "Explain how Helix Ask routes requests with sources.",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
      citationTokens: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.visibleSources).toBe(true);
    expect(finalized.text.match(/^Sources:/gim)?.length ?? 0).toBe(1);
  });

  it("keeps tree-walk blocks visible only when the prompt explicitly asks for them", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "The answer stays concise.",
        "",
        "Tree Walk: helix.ask",
        "1. Walk: ask route - uses grounded retrieval (server/routes/agi.plan.ts)",
      ].join("\n"),
      question: "Show the tree walk for this Helix Ask answer.",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["server/routes/agi.plan.ts"],
      citationTokens: ["server/routes/agi.plan.ts"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).toMatch(/Tree Walk:/);
    expect(finalized.text).toMatch(/1\.\s+Walk:/);
  });

  it("flattens roadmap planning headings in conversational surface mode", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Repo-Grounded Findings:",
        "- Current repo grounding is anchored in server/routes/agi.plan.ts and server/services/helix-ask/envelope.ts.",
        "",
        "Implementation Roadmap:",
        "1. Start with profiles and paywall in client/src/lib/agi/api.ts.",
        "",
        "Evidence Gaps:",
        "- Missing coverage for translation runtime hooks.",
        "",
        "Next Anchors Needed:",
        "- server/routes/agi.plan.ts",
      ].join("\n"),
      question:
        "Ok please organize my ideas to how they could be implemented in my code base in the future. I want profiles, a paywall, a voice lane, translation, and better retrieval planning.",
      reportModeEnabled: false,
      intentStrategy: "repo_plan",
      allowedPaths: [
        "server/routes/agi.plan.ts",
        "server/services/helix-ask/envelope.ts",
        "client/src/lib/agi/api.ts",
      ],
      citationTokens: [
        "server/routes/agi.plan.ts",
        "server/services/helix-ask/envelope.ts",
        "client/src/lib/agi/api.ts",
      ],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).not.toMatch(/^Repo-Grounded Findings:/im);
    expect(finalized.text).not.toMatch(/^Implementation Roadmap:/im);
    expect(finalized.text).not.toMatch(/^Evidence Gaps:/im);
    expect(finalized.text).not.toMatch(/^Next Anchors Needed:/im);
    expect(finalized.text).not.toMatch(/grounded in|anchored in/i);
    expect(finalized.text).not.toMatch(/server\/routes\/agi\.plan\.ts/i);
    expect(finalized.text).toMatch(/Start with profiles and (?:the )?paywall/i);
    expect(finalized.text).not.toMatch(/Missing coverage for translation runtime hooks/i);
  });

  it("drops inline roadmap scaffold paraphrases from conversational prose", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "In practical terms, the relevant implementation is grounded in client/src/data/hr-presets.ts, server/config/knowledge.ts, scripts/build-code-lattice.ts.",
        "Implementation Roadmap: Primary implementation anchors for the future codebase plan are client/src/data/hr-presets.ts and server/config/knowledge.ts.",
        "Current evidence is incomplete for the future codebase plan; missing slots: failure-path.",
      ].join("\n"),
      question:
        "Ok please organize my ideas to how they could be implemented in my code base in the future. I want profiles, a paywall, a voice lane, translation, and better retrieval planning.",
      reportModeEnabled: false,
      intentStrategy: "repo_plan",
      allowedPaths: [
        "client/src/data/hr-presets.ts",
        "server/config/knowledge.ts",
        "scripts/build-code-lattice.ts",
      ],
      citationTokens: [
        "client/src/data/hr-presets.ts",
        "server/config/knowledge.ts",
        "scripts/build-code-lattice.ts",
      ],
    });

    expect(finalized.text).not.toMatch(/In practical terms,/i);
    expect(finalized.text).not.toMatch(/^Implementation Roadmap:/im);
    expect(finalized.text).not.toMatch(/grounded in/i);
    expect(finalized.text).not.toMatch(/Primary implementation anchors/i);
    expect(finalized.text).not.toMatch(/Current evidence is incomplete/i);
    expect(finalized.text).not.toMatch(/Remaining gap: missing/i);
    expect(finalized.text).toMatch(/Start with profiles and (?:the )?paywall/i);
  });

  it("flattens frontier theory headings in conversational follow-up mode", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Definitions:",
        "- Consciousness: subjective first-person awareness with reportable internal states.",
        "",
        "Baseline:",
        "- Baseline stellar model: thermonuclear plasma dynamics explain observed solar outputs.",
        "",
        "Hypothesis:",
        "- Assumptions: a frontier lens may add explanatory structure beyond baseline plasma dynamics.",
        "- Predictions: lens-specific signatures should appear in observations not captured by baseline-only models.",
        "",
        "Anti-hypothesis:",
        "- Assumptions: baseline stellar physics fully explains current observations without added lens constructs.",
        "- Falsifiers: repeatable signatures emerge that baseline models cannot explain.",
        "",
        "Uncertainty band:",
        "- Diagnostic stage; uncertainty remains broad until direct falsifier evidence is resolved.",
        "",
        "Claim tier:",
        "- diagnostic (frontier hypothesis mode; not certified)",
      ].join("\n"),
      question: "What in the reasoning ladder should we focus on since this is the case?",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["docs/stellar-consciousness-ii.md"],
      citationTokens: ["docs/stellar-consciousness-ii.md"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).not.toMatch(/^Definitions:/im);
    expect(finalized.text).not.toMatch(/^Baseline:/im);
    expect(finalized.text).not.toMatch(/^Hypothesis:/im);
    expect(finalized.text).not.toMatch(/^Anti-hypothesis:/im);
    expect(finalized.text).not.toMatch(/^Claim tier:/im);
    expect(finalized.text).not.toMatch(/One working assumption is/i);
    expect(finalized.text).not.toMatch(/A testable prediction is/i);
    expect(finalized.text).not.toMatch(/Remaining gap:/i);
    expect(finalized.text).not.toMatch(/Current claim tier:/i);
    expect(finalized.text).toMatch(/Consciousness: subjective first-person awareness/i);
    expect(finalized.text).toMatch(/lens-specific signatures should appear/i);
  });

  it("falls back to a conversational roadmap sentence when only roadmap scaffolding survives", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Repo-Grounded Findings:",
        "",
        "Implementation Roadmap:",
        "",
        "Evidence Gaps:",
        "",
        "Next Anchors Needed:",
      ].join("\n"),
      question:
        "Ok please organize my ideas to how they could be implemented in my code base in the future. I want profiles, a paywall, a voice lane, translation, and better retrieval planning.",
      reportModeEnabled: false,
      intentStrategy: "repo_plan",
      allowedPaths: [],
      citationTokens: [],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).not.toMatch(/^Repo-Grounded Findings:/im);
    expect(finalized.text).not.toMatch(/^Implementation Roadmap:/im);
    expect(finalized.text).toMatch(/Start with profiles and (?:the )?paywall/i);
  });

  it("falls back to a conversational frontier follow-up sentence when dry-run headings survive", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Definitions:",
        "",
        "Baseline:",
        "",
        "Hypothesis:",
        "",
        "Anti-hypothesis:",
        "",
        "Claim tier:",
      ].join("\n"),
      question: "What in the reasoning ladder should we focus on since this is the case?",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: [],
      citationTokens: [],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).not.toMatch(/^Baseline:/im);
    expect(finalized.text).toMatch(/Focus on the falsifier step first/i);
  });

  it("restores open-world uncertainty markers for security prompts at the final surface", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText:
        "Treat urgent payment requests as untrusted until you verify them through a separate channel you already control.",
      question: "How can I protect myself from AI-driven financial fraud?",
      reportModeEnabled: false,
      intentStrategy: "general_explain",
      allowedPaths: [],
      citationTokens: [],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).toMatch(/open-world best-effort/i);
    expect(finalized.text).toMatch(/explicit uncertainty/i);
    expect(finalized.text).not.toMatch(/^Sources:/im);
  });

  it("restores ideology narrative anchors at the final surface for narrative-only prompts", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText:
        "Feedback Loop Hygiene helps people slow down before rumor-driven escalation and check whether the public signal is actually verified.",
      question:
        "In plain language, how does Feedback Loop Hygiene affect society in the Ideology tree? Do this in a conversational tone for a non-technical reader, but keep it grounded in repo context. Include one short opening paragraph, a root-to-leaf narrative chain, a concrete real-world example, and one concise takeaway with societal impact. Do not return technical notes mode unless explicitly requested.",
      reportModeEnabled: false,
      intentStrategy: "repo_ideology",
      allowedPaths: ["docs/ethos/ideology.json"],
      citationTokens: ["docs/ethos/ideology.json"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).toMatch(/\bMission Ethos\b/i);
    expect(finalized.text).toMatch(/\bFeedback Loop Hygiene\b/i);
    expect(finalized.text).toMatch(/\bexample\b/i);
    expect(finalized.text).toMatch(/\btakeaway\b/i);
    expect(finalized.text).not.toMatch(/^Technical notes:/im);
  });

  it("preserves visible fail-closed text when a hard stop already occurred", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Assembly blocked: required objective gate failed-closed.",
        "",
        "Open gaps / UNKNOWNs:",
        "UNKNOWN - repo anchor",
        "Why: missing repo evidence.",
      ].join("\n"),
      question: "Why did the route stop here?",
      reportModeEnabled: false,
      intentStrategy: "hybrid_explain",
      allowedPaths: ["server/routes/agi.plan.ts"],
      citationTokens: ["server/routes/agi.plan.ts"],
    });

    expect(finalized.mode).toBe("fail_closed");
    expect(finalized.text).toMatch(/Assembly blocked:/i);
    expect(finalized.text).toMatch(/Open gaps \/ UNKNOWNs:/i);
  });

  it("keeps tree walk, proof, key files, and extension in the envelope sidecar", () => {
    const envelope = buildHelixAskEnvelope({
      answer: "The visible answer stays natural and concise.",
      format: "brief",
      tier: "F3",
      mode: "extended",
      evidenceText: [
        "gate: repo-convergence",
        "status: PASS",
        "certificate: cert:abc123",
        "integrity_ok: true",
        "source: server/routes/agi.plan.ts",
      ].join("\n"),
      traceId: "trace-envelope-sidecar",
      treeWalk: [
        "Tree Walk: helix.ask",
        "1. Walk: ask route - continuity stays in metadata (server/routes/agi.plan.ts)",
      ].join("\n"),
      extensionText: "Additional repo context is preserved in docs/helix-ask-flow.md.",
      extensionCitations: ["docs/helix-ask-flow.md"],
    });

    const titles = (envelope.sections ?? []).map((section) => section.title);
    expect(envelope.answer).toBe("The visible answer stays natural and concise.");
    expect(titles).toEqual(
      expect.arrayContaining(["Tree Walk", "Key files", "Proof"]),
    );
    expect(envelope.extension?.title).toBe("Additional Repo Context");
    expect(envelope.proof?.gate?.status).toBe("PASS");
  });

  it("hides tree walk and key-file artifact blocks when the prompt did not ask for them", () => {
    const finalized = __testOnlyNonReportGuard.finalizeHelixAskAnswerSurface({
      answerText: [
        "Tree Walk",
        "Tree Walk: Mission Ethos Tree (tree-derived; source: docs/ethos/ideology.json)",
        "1. Walk: Mission Ethos - The warp vessel is a vow to return radiance to the Sun.",
        "",
        "Tree Walk: Ethos Knowledge Walk (tree-derived; source: docs/knowledge/ethos/ethos-knowledge-tree.json)",
        "1. Walk: Feedback Loop Hygiene - public decisions stay tied to civic signals.",
        "",
        "Key files",
        "- docs/ethos/ideology.json",
        "",
        "Proof",
        "- docs/knowledge/ethos/ethos-knowledge-tree.json",
      ].join("\n"),
      question:
        "In plain language, how does Feedback Loop Hygiene affect society in the Ideology tree?",
      reportModeEnabled: false,
      intentStrategy: "repo_ideology",
      allowedPaths: ["docs/ethos/ideology.json"],
      citationTokens: ["docs/ethos/ideology.json"],
    });

    expect(finalized.mode).toBe("conversational");
    expect(finalized.text).not.toMatch(/^Tree Walk/im);
    expect(finalized.text).not.toMatch(/^Key files/im);
    expect(finalized.text).not.toMatch(/^Proof/im);
    expect(finalized.text).toMatch(/\bMission Ethos\b/i);
    expect(finalized.text).toMatch(/\bFeedback Loop Hygiene\b/i);
  });
});

describe("helix ask universal answer plan shadow", () => {
  it("parses research-style prompt contracts and detects missing required inputs", () => {
    const contract = parsePromptResearchContract(RESEARCH_CONTRACT_PROMPT);
    expect(contract).not.toBeNull();
    expect(contract?.mode).toBe("research_contract");
    expect(contract?.required_repo_inputs).toEqual(
      expect.arrayContaining([
        "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
        "docs/does-not-exist.md",
      ]),
    );
    expect(contract?.required_top_level_structure.map((section) => section.title)).toEqual(
      expect.arrayContaining(["Motivation and Boundary", "Metric Setup"]),
    );
    expect(contract?.verbatim_constraints).toContain(
      "This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim.",
    );
    expect(contract?.fail_closed_behavior.missing_required_inputs_stop).toBe(true);

    const retrievalContract = buildPromptResearchRetrievalContract(contract);
    expect(retrievalContract?.must_read_paths).toContain(
      "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
    );
    expect(retrievalContract?.missing_required_paths).toContain("docs/does-not-exist.md");
    expect(retrievalContract?.expansion_rule).toBe("anchor_expansion");
  });

  it("derives turn objectives, sections, retrieval must-include, and budget from a research contract", () => {
    const contract = parsePromptResearchContract(RESEARCH_CONTRACT_PROMPT);
    expect(contract).not.toBeNull();
    const question = "Warp Paper Deep-Research Prompt v2";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const turnContract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "test",
      promptResearchContract: contract,
    });
    expect(turnContract.goal).toMatch(/physics-first NHM2 manuscript package/i);
    expect(turnContract.objectives.map((objective) => objective.label)).toEqual(
      expect.arrayContaining(["Motivation and Boundary", "Metric Setup", "Derivation Appendix"]),
    );
    expect(turnContract.answer_format.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "Motivation and Boundary",
        "Metric Setup",
        "Provenance Table",
        "Claim Discipline",
        "Self-Check",
      ]),
    );
    expect(turnContract.prompt_research_contract?.provenance_table_schema).toEqual(
      expect.arrayContaining([
        "source_id",
        "equation_trace_id",
        "equation",
        "substitutions (with units)",
      ]),
    );

    const retrievalContract = buildPromptResearchRetrievalContract(contract);
    const retrievalPlan = __testHelixAskReliabilityGuards.buildHelixAskTurnRetrievalPlan(
      turnContract,
      constraints,
      retrievalContract,
      buildPromptResearchGenerationContract({
        contract,
        answerCap: 4096,
      }),
    );
    expect(retrievalPlan.must_include).toEqual(
      expect.arrayContaining([
        "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
      ]),
    );

    const baseBudget = __testHelixAskReliabilityGuards.computeAnswerTokenBudget({
      verbosity: "brief",
      format: "brief",
      scaffoldTokens: 40,
      evidenceText: "",
      definitionFocus: false,
      composite: false,
      hasRepoEvidence: false,
      hasGeneralEvidence: false,
      maxTokensOverride: null,
      promptResearchContract: null,
    });
    const contractBudget = __testHelixAskReliabilityGuards.computeAnswerTokenBudget({
      verbosity: "brief",
      format: "brief",
      scaffoldTokens: 40,
      evidenceText: "",
      definitionFocus: false,
      composite: false,
      hasRepoEvidence: false,
      hasGeneralEvidence: false,
      maxTokensOverride: null,
      promptResearchContract: contract,
      promptResearchGenerationContract: buildPromptResearchGenerationContract({
        contract,
        answerCap: 4096,
      }),
    });
    expect(contractBudget.base).toBeGreaterThanOrEqual(baseBudget.base);
    expect(contractBudget.boosts).toContain("prompt_research_contract");
    expect(contractBudget.retrievalContextBudget).toBeGreaterThan(0);
    expect(contractBudget.sectionCount).toBeGreaterThan(0);
    expect(contractBudget.sectionOverflowPolicy).toBe("single_pass");
  });

  it("ranks precedence paths first and surfaces precedence conflicts", () => {
    const ranked = rankPathsByPrecedence(
      [
        "docs/secondary.md",
        "docs/first.md",
        "docs/third.md",
      ],
      ["docs/first.md", "docs/third.md"],
    );
    expect(ranked.slice(0, 2)).toEqual(["docs/first.md", "docs/third.md"]);
    expect(
      explainPrecedenceConflicts(
        ["docs/third.md", "docs/first.md"],
        ["docs/first.md", "docs/third.md"],
      ),
    ).toEqual([
      {
        higher_precedence_path: "docs/first.md",
        lower_precedence_path: "docs/third.md",
        note: "Canonical precedence favors docs/first.md over docs/third.md.",
      },
    ]);
  });

  it("builds obligation evidence with precedence-aware claim tiers and snippets", () => {
    const contract = parsePromptResearchContract(RESEARCH_CONTRACT_PROMPT);
    const retrievalContract = buildPromptResearchRetrievalContract(contract);
    const evidence = buildObligationEvidence({
      obligationCoverage: [
        {
          obligation_id: "motivation_boundary",
          status: "covered",
          evidence_refs: [
            "docs/audits/research/warp-full-solve-campaign-execution-report-2026-02-24.md",
            "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
          ],
        },
      ],
      evidenceBlocks: [
        {
          content:
            "The campaign is defined as reduced-order and falsifiable with a fail-closed evidence posture.",
          citations: [
            "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
          ],
        },
      ],
      retrievalContract,
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.claim_tier).toBe("canonical-authoritative");
    expect(evidence[0]?.supporting_repo_paths[0]).toBe(
      "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
    );
    expect(evidence[0]?.supporting_snippets[0]).toMatch(/reduced-order and falsifiable/i);
    expect(evidence[0]?.conflict_markers).toEqual([
      {
        higher_precedence_path:
          "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
        lower_precedence_path:
          "docs/audits/research/warp-full-solve-campaign-execution-report-2026-02-24.md",
        note:
          "Canonical precedence favors docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md over docs/audits/research/warp-full-solve-campaign-execution-report-2026-02-24.md.",
      },
    ]);
  });

  it("orders obligation coverage evidence refs by research precedence paths", () => {
    const coverage = __testHelixAskReliabilityGuards.buildHelixAskTurnContractObligationCoverage({
      obligations: [
        {
          id: "metric_setup",
          label: "Metric Setup",
          kind: "definition",
          required: true,
          required_slots: ["definition"],
          preferred_evidence: ["doc"],
        },
      ],
      coveredSlots: ["definition"],
      allowedCitations: [
        "docs/secondary.md",
        "server/routes/agi.plan.ts",
        "docs/first.md",
      ],
      precedencePaths: ["docs/first.md", "docs/secondary.md"],
    });

    expect(coverage).toHaveLength(1);
    expect(coverage[0]?.evidence_refs.slice(0, 2)).toEqual([
      "docs/first.md",
      "docs/secondary.md",
    ]);
  });

  it("renders prompt-contract fail-closed answers deterministically", () => {
    const text = renderPromptResearchFailClosedAnswer({
      missingPaths: ["docs/does-not-exist.md", "docs/missing-two.md"],
      stopReason: "Fail-closed",
    });
    expect(text).toMatch(/^blocked=true$/m);
    expect(text).toMatch(/^stop_reason=Fail-closed$/m);
    expect(text).toMatch(/^- docs\/does-not-exist\.md$/m);
    expect(text).toMatch(/^- docs\/missing-two\.md$/m);
  });

  it("validates and repairs missing research-contract verbatim constraints and provenance tables", () => {
    const contract = parsePromptResearchContract(RESEARCH_CONTRACT_PROMPT);
    expect(contract).not.toBeNull();
    const answer = [
      "Motivation and Boundary:",
      "- Warp-family metrics are studied as GR thought experiments with bounded governance.",
      "",
      "Metric Setup:",
      "- ADM notation is used in the repo mapping.",
      "",
      "Derivation Appendix:",
      "- metric / ADM derivations",
      "",
      "Claim Discipline:",
      "- what can be said now",
      "",
      "Self-Check:",
      "- Missing values are marked UNKNOWN.",
    ].join("\n");

    const validationBefore = validatePromptResearchContractAnswer(contract, answer);
    expect(validationBefore.fail_reasons).toEqual(
      expect.arrayContaining([
        "research_contract_verbatim_missing",
        "research_contract_provenance_schema_missing",
      ]),
    );
    const repair = repairPromptResearchContractAnswer({
      contract,
      text: answer,
    });
    expect(repair.applied).toBe(true);
    expect(repair.actions).toEqual(
      expect.arrayContaining(["insert_verbatim_constraints", "append_provenance_table"]),
    );
    expect(repair.text).toContain(
      "This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim.",
    );
    expect(repair.text).toMatch(/^Provenance Table:/m);
    expect(repair.text).toContain(buildPromptResearchContractProvenanceTableBlock({
      schema: contract?.provenance_table_schema ?? [],
      unknownMarker: contract?.fail_closed_behavior.unknown_marker ?? "UNKNOWN",
    }));
    expect(repair.validation_after.missing_verbatim_constraints).toHaveLength(0);
    expect(repair.validation_after.missing_provenance_columns).toHaveLength(0);
  });

  it("sectionally composes missing research sections when required by the generation contract", () => {
    const contract = parsePromptResearchContract(RESEARCH_CONTRACT_PROMPT);
    expect(contract).not.toBeNull();
    const answer = [
      "Motivation and Boundary:",
      contract?.verbatim_constraints[0] ?? "",
      "",
      "Claim Discipline:",
      "- what can be said now",
      "",
      "Self-Check:",
      "- Boundary statement appears verbatim.",
      "",
      "Provenance Table:",
      buildPromptResearchContractProvenanceTableBlock({
        schema: contract?.provenance_table_schema ?? [],
        unknownMarker: contract?.fail_closed_behavior.unknown_marker ?? "UNKNOWN",
      }),
    ].join("\n");
    const repair = repairPromptResearchContractAnswer({
      contract,
      text: answer,
      generationContract: {
        mode: "research_contract",
        budget: {
          retrieval_context_budget: 20,
          answer_max_tokens: 4096,
          section_overflow_policy: "sectional_compose",
          section_count: 6,
          appendix_count: 4,
          required_table_count: 1,
        },
        required_section_titles: ["Motivation and Boundary", "Metric Setup"],
        support_section_titles: ["Derivation Appendix", "Claim Discipline", "Self-Check", "Provenance Table"],
        section_overflow_policy: "sectional_compose",
        sectional_compose_required: true,
      },
      planSections: [
        {
          title: "Metric Setup",
          obligation_ids: ["metric_setup"],
        },
      ],
      obligationEvidence: [
        {
          obligation_id: "metric_setup",
          status: "covered",
          supporting_repo_paths: [
            "docs/audits/research/warp-needle-hull-mark2-proof-anchor-index-latest.md",
          ],
          supporting_snippets: [
            "NHM2 uses ADM notation with lapse, shift, and spatial metric mappings anchored in canonical repo artifacts.",
          ],
        },
      ],
    });

    expect(repair.applied).toBe(true);
    expect(repair.actions).toContain("append_sectional_compose_sections");
    expect(repair.text).toMatch(/^Metric Setup:/m);
    expect(repair.text).toMatch(/ADM notation with lapse, shift, and spatial metric mappings/i);
    expect(repair.text).toMatch(/^Derivation Appendix:/m);
    expect(repair.text).toMatch(/UNKNOWN/i);
  });

  it("classifies equation prompts into equation_formalism profile", () => {
    const question = "Explain the equation of the collapse of the wave function.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: true,
      definitionFocus: false,
      queryConstraints: constraints,
    });
    expect(family).toBe("equation_formalism");
  });

  it("treats conceptual codebase definitions as definition_overview, not implementation path asks", () => {
    const question = "What is a warp bubble in this codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus: true,
      queryConstraints: constraints,
    });
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
    });
    expect(family).toBe("definition_overview");
    expect(envelope.prompt_family).toBe("definition_overview");
    expect(envelope.requires_code_floor).toBe(false);
    expect(envelope.allow_retrieval_retry).toBe(false);
    expect(envelope.allow_two_pass).toBe(false);
  });

  it("keeps docs-only explain requests out of implementation code-path family", () => {
    const question = "Summarize what docs/warp-console-architecture.md means in the current doc.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus: false,
      queryConstraints: constraints,
    });
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    expect(family).toBe("mechanism_process");
    expect(envelope.prompt_family).toBe("mechanism_process");
    expect(envelope.requires_code_floor).toBe(false);
  });

  it("marks specific equation asks as lock-required and suppresses pre-lock clarify", () => {
    const question =
      "From shared/collapse-benchmark.ts, quote rho_eff_kg_m3 and kappa_collapse_m2 equations and explain each term.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const intentContract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
      question,
      queryConstraints: constraints,
    });
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "hybrid",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: true,
      definitionFocus: false,
      equationIntentContract: intentContract,
    });
    expect(intentContract.ask_mode).toBe("specific");
    expect(envelope.prompt_family).toBe("equation_formalism");
    expect(envelope.lock_required_for_family).toBe(true);
    expect(envelope.clarify_allowed_pre_lock).toBe(false);
    expect(envelope.requires_code_floor).toBe(true);
    expect(envelope.allow_retrieval_retry).toBe(true);
    expect(envelope.allow_two_pass).toBe(true);
  });

  it("classifies code-path asks into implementation profile", () => {
    const question = "Where in repo is calculateNatarioWarpBubble implemented?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus: false,
      queryConstraints: constraints,
    });
    expect(family).toBe("implementation_code_path");
  });

  it("classifies repo solve-path questions into implementation profile with code floor", () => {
    const question = "How is the warp bubble solved for in this codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus: false,
      queryConstraints: constraints,
    });
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    expect(family).toBe("implementation_code_path");
    expect(envelope.prompt_family).toBe("implementation_code_path");
    expect(envelope.requires_code_floor).toBe(true);
  });

  it("classifies repo-technical identifier prompts into implementation profile", () => {
    const question = "Explain how answer_path is populated and useful for diagnostics.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus: false,
      queryConstraints: constraints,
    });
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    expect(family).toBe("implementation_code_path");
    expect(envelope.prompt_family).toBe("implementation_code_path");
    expect(envelope.requires_code_floor).toBe(true);
  });

  it("treats broad solved-form warp math prompts as warp-math eligible", () => {
    const question = "How is the warp bubble traditionally solved and what is the needle hull mark 2 improvement?";
    expect(__testHelixAskReliabilityGuards.isWarpMathBroadPrompt(question)).toBe(true);
  });

  it("does not treat warp solve-plus-improvement prompts as pure definitions", () => {
    const question =
      "How is the warp bubble traditionally solved and what is the needle hull mark 2 improvement?";
    const definitionFocus = __testHelixAskReliabilityGuards.isDefinitionQuestion(question);
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus,
      queryConstraints: constraints,
    });
    expect(definitionFocus).toBe(false);
    expect(family).toBe("mechanism_process");
  });

  it("classifies needle-hull solve discovery prompts into implementation profile with code floor", () => {
    const question = "Find me the warp bubble solutions for the needle hull mark 2 solve?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus: false,
      queryConstraints: constraints,
    });
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    expect(family).toBe("implementation_code_path");
    expect(envelope.prompt_family).toBe("implementation_code_path");
    expect(envelope.requires_code_floor).toBe(true);
  });

  it("classifies multi-objective planning prompts into roadmap_planning", () => {
    const question =
      "Ok please organize my ideas to how they could be implemented in my code base in the future. I want profiles, a paywall, a voice lane, translation, and better retrieval planning.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const family = __testHelixAskReliabilityGuards.classifyHelixAskAnswerPlanFamily({
      question,
      equationPrompt: false,
      definitionFocus: false,
      queryConstraints: constraints,
    });
    expect(family).toBe("roadmap_planning");
    expect(__testHelixAskReliabilityGuards.isHelixAskRoadmapPlanningQuestion(question)).toBe(true);
  });

  it("does not outer-retry 429/circuit-open after transport layer already handled them", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldRetryHelixAskOuterLlmCall({
        errorCode: "llm_http_429:1200",
        attemptIndex: 0,
        maxAttempts: 2,
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldRetryHelixAskOuterLlmCall({
        errorCode: "llm_http_circuit_open",
        attemptIndex: 0,
        maxAttempts: 2,
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldRetryHelixAskOuterLlmCall({
        errorCode: "llm_http_timeout:15000",
        attemptIndex: 0,
        maxAttempts: 2,
      }),
    ).toBe(true);
  });

  it("preserves repo intent on stage05 transport degradation when repo code evidence remains strong", () => {
    expect(
      __testHelixAskReliabilityGuards.isHelixAskTransportPressureFallbackReason(
        "stage05_llm_http_429",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveRepoIntentOnTransportDegradedCoverage({
        stage05FallbackReason: "stage05_llm_http_429",
        contextFiles: [
          "modules/warp/natario-warp.ts",
          "modules/warp/warp-module.ts",
          "docs/knowledge/warp/warp-bubble.md",
        ],
        retrievalConfidence: 0.58,
        hybridThreshold: 0.6,
        requiresRepoEvidence: true,
        hasRepoHints: true,
        warpMathBroadPrompt: true,
        intentDomain: "repo",
        coveredSlots: ["mechanism", "code_path"],
      }),
    ).toBe(true);
  });

  it("suppresses answer rescue when the first real 429 is provider quota exhaustion", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldSuppressHelixAskAnswerRescueForRateLimit({
        llm_first_rate_limited_source: "provider_429",
        llm_first_rate_limited_kind: "quota",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldSuppressHelixAskAnswerRescueForRateLimit({
        llm_error_provider_text: "You exceeded your current quota. code=insufficient_quota",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldSuppressHelixAskAnswerRescueForRateLimit({
        llm_first_rate_limited_source: "provider_429",
        llm_first_rate_limited_kind: "tokens_per_minute",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldSuppressHelixAskAnswerRescueForRateLimit({
        llm_first_rate_limited_source: "local_cooldown",
      }),
    ).toBe(true);
  });

  it("treats an explicit max_tokens request as a hard answer cap", () => {
    const budget = __testHelixAskReliabilityGuards.computeAnswerTokenBudget({
      verbosity: "extended",
      format: "brief",
      scaffoldTokens: 512,
      evidenceText:
        "docs/knowledge/warp/warp-bubble.md modules/warp/natario-warp.ts modules/warp/warp-module.ts",
      definitionFocus: true,
      composite: false,
      hasRepoEvidence: true,
      hasGeneralEvidence: false,
      evidenceMass: {
        sourceCount: 6,
        independentSourceCount: 4,
        slotCoverageRatio: 1,
        docCoverageRatio: 1,
        retrievalConfidence: 0.9,
        retrievalDocShare: 0.8,
      },
      maxTokensOverride: 256,
    });

    expect(budget.tokens).toBe(256);
    expect(budget.base).toBe(256);
    expect(budget.reason).toBe("request_override");
    expect(budget.boosts).toEqual(["request_override"]);
    expect(budget.override).toBe(true);
  });

  it("separates final answer output budgets from context budgets", () => {
    const standard = __testHelixAskReliabilityGuards.resolveHelixFinalAnswerOutputBudget({
      prompt: "What does the rolling context packet do?",
      compactObservationCount: 1,
    });
    const long = __testHelixAskReliabilityGuards.resolveHelixFinalAnswerOutputBudget({
      prompt:
        "Write a comprehensive README section comparing context windows, rolling session compaction, tool observations, and final answer behavior.",
      compactObservationCount: 8,
      contextEconomyReport: {
        schema: "helix.model_context_economy_report.v1",
        estimated_input_tokens_by_section: {
          user_goal: 200,
          compact_observations: 2200,
        },
        dropped_sections: [],
        selected_observation_refs: [],
        raw_debug_excluded_from_model_context: true,
        raw_span_refs_available: [],
        exact_excerpt_refs_included: [],
        section_char_caps: {},
      },
    });
    const concise = __testHelixAskReliabilityGuards.resolveHelixFinalAnswerOutputBudget({
      prompt: "Keep it short: what does rolling context do?",
      compactObservationCount: 8,
    });

    expect(standard.schema).toBe("helix.final_answer_output_budget.v1");
    expect(standard.mode).toBe("standard");
    expect(long.mode).toBe("long");
    expect(long.max_tokens).toBeGreaterThan(standard.max_tokens);
    expect(long.reasons).toContain("prompt_long_form_cue");
    expect(concise.mode).toBe("concise");
    expect(concise.max_tokens).toBeLessThanOrEqual(standard.max_tokens);
  });

  it("forces direct concept answers for short general definitions with a strong concept match", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldForceHelixAskShortDefinitionConceptAnswer({
        intentDomain: "general",
        conceptAvailable: true,
        conceptDraftAvailable: true,
        ambiguityReason: "short_definition",
        ambiguityShortPrompt: true,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        reportReason: "default",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldForceHelixAskShortDefinitionConceptAnswer({
        intentDomain: "general",
        conceptAvailable: true,
        conceptDraftAvailable: true,
        ambiguityReason: "short_definition",
        ambiguityShortPrompt: true,
        explicitRepoExpectation: true,
        hasFilePathHints: false,
        endpointHintCount: 0,
        reportReason: "default",
      }),
    ).toBe(false);
  });

  it("only uses scientific pre-intent clarify for repo-shaped turns", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldUseScientificPreIntentClarify({
        scientificClarifyEnabled: true,
        requiresRepoEvidence: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        intentDomain: "general",
        isRepoQuestion: false,
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldUseScientificPreIntentClarify({
        scientificClarifyEnabled: true,
        requiresRepoEvidence: true,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        intentDomain: "general",
        isRepoQuestion: false,
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldUseScientificPreIntentClarify({
        scientificClarifyEnabled: true,
        requiresRepoEvidence: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        intentDomain: "repo",
        isRepoQuestion: false,
      }),
    ).toBe(true);
  });

  it("prefers planner LLM in fast mode for repo-grounded turns", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldPreferHelixAskPlannerLlmInFastMode({
        fastQualityMode: true,
        question: "Explain how answer_path is populated and useful for diagnostics.",
        intentDomain: "repo",
        requiresRepoEvidence: true,
        explicitRepoExpectation: true,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreferHelixAskPlannerLlmInFastMode({
        fastQualityMode: true,
        question: "Define entropy.",
        intentDomain: "general",
        requiresRepoEvidence: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(false);
  });

  it("uses risk-triggered two-pass decisions for repo turns with coverage/confidence risk", () => {
    const heuristic = __testHelixAskReliabilityGuards.shouldUseHelixAskRiskTriggeredTwoPass({
      enabled: true,
      allowByPolicy: true,
      question: "How does the helix ask pipeline work?",
      promptIngested: false,
      hasRepoHints: false,
      isRepoQuestion: false,
      requiresRepoEvidence: false,
      format: "brief",
      retrievalConfidence: 0.9,
      hybridThreshold: 0.4,
      slotMissingCount: 0,
      docMissingCount: 0,
    });
    expect(heuristic).toEqual({ use: true, reason: "heuristic_trigger" });

    const risk = __testHelixAskReliabilityGuards.shouldUseHelixAskRiskTriggeredTwoPass({
      enabled: true,
      allowByPolicy: true,
      question: "Need current status.",
      promptIngested: false,
      hasRepoHints: true,
      isRepoQuestion: true,
      requiresRepoEvidence: true,
      format: "steps",
      retrievalConfidence: 0.18,
      hybridThreshold: 0.4,
      slotMissingCount: 1,
      docMissingCount: 0,
    });
    expect(risk).toEqual({ use: true, reason: "risk_trigger" });

    const policyBlocked = __testHelixAskReliabilityGuards.shouldUseHelixAskRiskTriggeredTwoPass({
      enabled: true,
      allowByPolicy: false,
      question: "Need current status.",
      promptIngested: false,
      hasRepoHints: true,
      isRepoQuestion: true,
      requiresRepoEvidence: true,
      format: "steps",
      retrievalConfidence: 0.18,
      hybridThreshold: 0.4,
      slotMissingCount: 1,
      docMissingCount: 0,
    });
    expect(policyBlocked).toEqual({ use: false, reason: "policy" });
  });

  it("overrides retrieval-retry policy in fast mode for repo slot/confidence risk", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldOverrideHelixAskRetrievalRetryPolicy({
        fastQualityMode: true,
        isRepoQuestion: true,
        hasRepoHints: true,
        missingSlotsForRetry: true,
        retrievalConfidence: 0.55,
        hybridThreshold: 0.4,
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldOverrideHelixAskRetrievalRetryPolicy({
        fastQualityMode: true,
        isRepoQuestion: true,
        hasRepoHints: true,
        missingSlotsForRetry: false,
        retrievalConfidence: 0.15,
        hybridThreshold: 0.4,
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldOverrideHelixAskRetrievalRetryPolicy({
        fastQualityMode: false,
        isRepoQuestion: true,
        hasRepoHints: true,
        missingSlotsForRetry: true,
        retrievalConfidence: 0.1,
        hybridThreshold: 0.4,
      }),
    ).toBe(false);
  });

  it("uses the general ambiguity answer floor only for open-world general turns", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldUseGeneralAmbiguityAnswerFloor({
        intentDomain: "general",
        requiresRepoEvidence: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldUseGeneralAmbiguityAnswerFloor({
        intentDomain: "general",
        requiresRepoEvidence: true,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(false);
  });

  it("builds a general ambiguity answer floor that is answer-first and clears text floor", () => {
    const answer = __testHelixAskReliabilityGuards.buildGeneralAmbiguityAnswerFloor({
      question: "What's a good way to summarize evidence?",
      clarifyLine: "Do you mean for a scientific report, a code review, or a general audience?",
    });
    expect(answer).toMatch(/^Best-effort answer for "What's a good way to summarize evidence\?":/);
    expect(answer).toContain("Clarify:");
    expect(answer).toContain("Implication:");
    expect(answer.length).toBeGreaterThanOrEqual(220);
  });

  it("bypasses pre-intent ambiguity clarify for simple composition prompts", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForCompositionalPrompt({
        question: "Say hello in one sentence.",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForCompositionalPrompt({
        question: "What's a clean way to structure a short answer?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForCompositionalPrompt({
        question: "What is a Needle Hull?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(false);
  });

  it("bypasses pre-intent ambiguity clarify for concrete definition targets", () => {
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskConcreteDefinitionTarget(
        "OK what is needle hull mark 2?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskConcreteDefinitionTarget(
        "What are first principles meaning in physics?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskConcreteDefinitionTarget(
        "What does entropy mean in physics?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskConcreteDefinitionTarget("What is this?"),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForDefinitionTarget({
        question: "OK what is needle hull mark 2?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForDefinitionTarget({
        question: "What is entropy?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: true,
        intentDomain: "general",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForGeneralDefinitionTarget({
        question: "What are first principles meaning in physics?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForGeneralDefinitionTarget({
        question: "What does entropy mean in physics?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForGeneralDefinitionTarget({
        question: "What does entropy mean in this codebase?",
        explicitRepoExpectation: true,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForDefinitionTarget({
        question: "What is this?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForDefinitionTarget({
        question: "What is needle hull mark 2?",
        explicitRepoExpectation: true,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(false);
  });

  it("bypasses pre-intent ambiguity clarify for explicit compare targets", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForCompareTarget(
        "Compare Needle Hull Mark 2 and Natario zero expansion.",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBypassHelixAskPreIntentClarifyForCompareTarget(
        "What is the difference between this and that?",
      ),
    ).toBe(false);
  });

  it("flags meta non-answer objective assembly drafts as weak output", () => {
    const metaDraft =
      "This appears to be a prompt or question asking for clarification or definition of a specific topic, but the current draft does not provide a clear answer. It suggests a consideration of focus but lacks concrete information.";
    expect(__testHelixAskReliabilityGuards.isHelixAskMetaNonAnswerDraft(metaDraft)).toBe(true);
    expect(__testHelixAskReliabilityGuards.isHelixAskWeakObjectiveAssemblyDraft(metaDraft)).toBe(
      true,
    );

    const genericNonAnswer =
      "This refers to a specific topic or item that requires clarification or definition. For further details, please refer to the relevant documentation.";
    expect(__testHelixAskReliabilityGuards.isHelixAskGenericNonAnswerDraft(genericNonAnswer)).toBe(
      true,
    );
    expect(
      __testHelixAskReliabilityGuards.isHelixAskWeakObjectiveAssemblyDraft(genericNonAnswer),
    ).toBe(true);

    const directAnswer = "It is an ambiguous reference. Please share what 'this' refers to.";
    expect(__testHelixAskReliabilityGuards.isHelixAskMetaNonAnswerDraft(directAnswer)).toBe(
      false,
    );
    expect(__testHelixAskReliabilityGuards.isHelixAskGenericNonAnswerDraft(directAnswer)).toBe(
      false,
    );
  });

  it("detects deictic questions without anchors and requires clarify-style responses", () => {
    expect(__testHelixAskReliabilityGuards.isHelixAskDeicticQuestionWithoutAnchor("what is this?")).toBe(
      true,
    );
    expect(
      __testHelixAskReliabilityGuards.isHelixAskDeicticQuestionWithoutAnchor("what is this used for?"),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskDeicticQuestionWithoutAnchor("what is this code path?"),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskDeicticClarifyResponse(
        "Please share the exact snippet or context you mean by 'this'.",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskDeicticClarifyResponse(
        "I need one concrete anchor to answer reliably. Do you want a codebase-grounded answer, or a general explanation?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskDeicticClarifyResponse(
        "This refers to a specific topic or item that requires clarification.",
      ),
    ).toBe(false);
  });

  it("keeps open-world definition prompts out of stage0 promotion and ambiguity clarify gate", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    expect(routeSource).toContain("stage0_general_definition_bypass");
    expect(routeSource).toContain("general_definition_ambiguity_gate_bypass");
    expect(routeSource).toContain("!generalDefinitionTargetNoRepoPromote");
    expect(routeSource).toContain("!generalDefinitionAmbiguityGateBypass");
  });

  it("contains final answer validator and phase markers", () => {
    const routeSource = fs.readFileSync(path.join(process.cwd(), "server/routes/agi.plan.ts"), "utf8");
    expect(routeSource).toContain("Final answer validator");
    expect(routeSource).toContain("final_answer_validated");
    expect(routeSource).toContain("finalSurface:deictic_clarify_fallback");
    expect(routeSource).toContain("finalSurface:deictic_clarify_terminal_normalize");
    expect(routeSource).toContain("clarify:deictic_pre_intent_short_circuit");
    expect(routeSource).toContain("forcedAnswer:pre_intent_clarify_deictic");
    expect(routeSource).toContain("deictic_short_circuit");
    expect(routeSource).toContain("deictic_clarify_terminal_profile_applied");
    expect(routeSource).toContain("blocked_mode_clarify_generic_non_answer_detected");
    expect(routeSource).toContain("focus_guard_clarify_required");
    expect(routeSource).toContain("answer_obligations_missing");
    expect(routeSource).toContain("preflight_evidence_missing");
    expect(routeSource).toContain("uncertainty_missing_repo_or_clone_citation");
    expect(routeSource).toContain("uncertainty_missing_codex_clone_baseline");
    expect(routeSource).toContain("final_codex_clone_baseline_required");
    expect(routeSource).toContain("final_codex_clone_citation_count");
    expect(routeSource).toContain("global_terminal_validator_mode");
    expect(routeSource).toContain("final_answer_rejected");
    expect(routeSource).toContain("response_blocked_final_validator");
  });

  it("contains live event summaries for objective mini synth and critic", () => {
    const routeSource = fs.readFileSync(path.join(process.cwd(), "server/routes/agi.plan.ts"), "utf8");
    expect(routeSource).toContain("Objective mini-synth");
    expect(routeSource).toContain("Objective mini-critic");
    expect(routeSource).toContain("objective_count");
    expect(routeSource).toContain("covered_count");
    expect(routeSource).toContain("unresolved_count");
  });

  it("forces repo-grounded mode for repo api lookup under clarify pressure when evidence is strong", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldForceRepoGroundedForRepoApiLookup({
        intentId: "repo.repo_api_lookup",
        arbiterMode: "clarify",
        explicitRepoExpectation: true,
        retrievalConfidence: 0.72,
        repoThreshold: 0.4,
        hasRepoHints: true,
        evidenceGateOk: false,
        mustIncludeOk: false,
        topicMustIncludeOk: true,
        alignmentGateDecision: "PASS",
        openWorldBypassMode: "inactive",
        failClosedReason: null,
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldForceRepoGroundedForRepoApiLookup({
        intentId: "repo.repo_api_lookup",
        arbiterMode: "clarify",
        explicitRepoExpectation: true,
        retrievalConfidence: 0.72,
        repoThreshold: 0.4,
        hasRepoHints: true,
        evidenceGateOk: false,
        mustIncludeOk: false,
        topicMustIncludeOk: true,
        alignmentGateDecision: "FAIL",
        openWorldBypassMode: "inactive",
        failClosedReason: null,
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldForceRepoGroundedForRepoApiLookup({
        intentId: "repo.repo_api_lookup",
        arbiterMode: "clarify",
        explicitRepoExpectation: true,
        retrievalConfidence: 0.25,
        repoThreshold: 0.4,
        hasRepoHints: true,
        evidenceGateOk: true,
        mustIncludeOk: true,
        topicMustIncludeOk: true,
        alignmentGateDecision: "PASS",
        openWorldBypassMode: "inactive",
        failClosedReason: null,
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldForceRepoGroundedForRepoApiLookup({
        intentId: "repo.repo_api_lookup",
        arbiterMode: "clarify",
        explicitRepoExpectation: true,
        retrievalConfidence: 0.72,
        repoThreshold: 0.4,
        hasRepoHints: true,
        evidenceGateOk: false,
        mustIncludeOk: false,
        topicMustIncludeOk: true,
        alignmentGateDecision: "PASS",
        openWorldBypassMode: "inactive",
        failClosedReason: "alignment_gate_fail_repo_required",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldForceRepoGroundedForRepoApiLookup({
        intentId: "repo.repo_api_lookup",
        arbiterMode: "clarify",
        explicitRepoExpectation: true,
        retrievalConfidence: 0.65,
        repoThreshold: 0.4,
        hasRepoHints: true,
        evidenceGateOk: false,
        mustIncludeOk: false,
        topicMustIncludeOk: true,
        alignmentGateDecision: "FAIL",
        openWorldBypassMode: "inactive",
        failClosedReason: "evidence_gate_failed",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldForceRepoGroundedForRepoApiLookup({
        intentId: "repo.repo_api_lookup",
        arbiterMode: "clarify",
        explicitRepoExpectation: true,
        retrievalConfidence: 0.72,
        repoThreshold: 0.4,
        hasRepoHints: true,
        evidenceGateOk: false,
        mustIncludeOk: false,
        topicMustIncludeOk: true,
        alignmentGateDecision: "FAIL",
        openWorldBypassMode: "inactive",
        failClosedReason: "stage05_summary_hard_fail",
      }),
    ).toBe(false);
  });

  it("detects repo-technical cues from internal identifiers and keeps general debug wording open-world", () => {
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskRepoTechnicalCue(
        "Explain how answer_path is populated and useful for diagnostics.",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskRepoTechnicalCue(
        "Where are relation_packet_bridge_count and report_mode_reason computed?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskRepoTechnicalCue(
        "How does deterministic fallback guard relation-mode contract parse failures?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskRepoTechnicalCue(
        "How does goal-zone harness evaluate pass/fail across seeds?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.hasHelixAskRepoTechnicalCue(
        "What is a practical debug payload used for?",
      ),
    ).toBe(false);
  });

  it("adds exact internal identifiers to repo-grounded query hints", () => {
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question: "Explain how answer_path is populated and useful for diagnostics.",
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(
        "Explain how answer_path is populated and useful for diagnostics.",
      ),
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "test",
    });
    expect(contract.query_hints).toEqual(
      expect.arrayContaining(["answer_path", "answer_path implementation"]),
    );
  });

  it("renders simple composition prompts locally", () => {
    expect(
      __testHelixAskReliabilityGuards.renderHelixAskSimpleCompositionalAnswer(
        "Say hello in one sentence.",
      ),
    ).toBe("Hello.");
    expect(
      __testHelixAskReliabilityGuards.renderHelixAskSimpleCompositionalAnswer("Respond with ok"),
    ).toBe("Ok.");
  });

  it("renders short writing-advice prompts locally", () => {
    expect(
      __testHelixAskReliabilityGuards.renderHelixAskSimpleWritingAdviceAnswer(
        "What is a clean way to structure a short answer?",
      ),
    ).toBe(
      "Lead with the direct answer, follow with one sentence that gives the key reason or evidence, and end with a caveat or next step only if it changes the outcome. That keeps the response short, readable, and easy to expand when the reader needs more context.\n\nSources: docs/helix-ask-flow.md, docs/helix-ask-agent-policy.md",
    );
  });

  it("fast-path finalizes hard forced answers that already carry explicit citations", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldFastPathFinalizeHelixAskForcedAnswer({
        shouldShortCircuitAnswer: true,
        fallbackAnswer:
          "Lead with the direct answer.\n\nSources: docs/helix-ask-flow.md, docs/helix-ask-agent-policy.md",
        forcedAnswerIsHard: true,
        forcedRule: "forcedAnswer:simple_composition",
        conceptFastPath: false,
        isIdeologyReferenceIntent: false,
        verbosity: "brief",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldFastPathFinalizeHelixAskForcedAnswer({
        shouldShortCircuitAnswer: true,
        fallbackAnswer: "Lead with the direct answer.",
        forcedAnswerIsHard: true,
        forcedRule: "forcedAnswer:simple_composition",
        conceptFastPath: false,
        isIdeologyReferenceIntent: false,
        verbosity: "brief",
      }),
    ).toBe(false);
  });

  it("treats concept forced answers as hard short-circuit rules", () => {
    expect(
      __testHelixAskReliabilityGuards.isHelixAskHardForcedShortCircuitRule(
        "forcedAnswer:pre_intent_clarify",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskHardForcedShortCircuitRule(
        "forcedAnswer:pre_intent_clarify_deictic",
      ),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskHardForcedShortCircuitRule(
        "forcedAnswer:simple_composition",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskClarifyForcedShortCircuitRule(
        "forcedAnswer:pre_intent_clarify",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskClarifyForcedShortCircuitRule(
        "forcedAnswer:pre_intent_clarify_deictic",
      ),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskHardForcedShortCircuitRule(
        "forcedAnswer:concept_short_definition",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskHardForcedShortCircuitRule("forcedAnswer:concept"),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskHardForcedShortCircuitRule("forcedAnswer:unknown"),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskConceptForcedShortCircuitRule(
        "forcedAnswer:concept_short_definition",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskConceptForcedShortCircuitRule("forcedAnswer:concept"),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isHelixAskConceptForcedShortCircuitRule(
        "forcedAnswer:math_solver",
      ),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:concept_short_definition",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:pre_intent_clarify",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:pre_intent_clarify",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:simple_composition",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:simple_composition",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:helix_pipeline",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:helix_pipeline",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:math_solver",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:concept_short_definition",
      }),
    ).toBe(false);
  });

  it("falls back to a deterministic turn contract when planner JSON is invalid", () => {
    const question =
      "Organize my future Helix Ask ideas into implementation phases for profiles, voice lane, and translation.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const parsed = __testHelixAskReliabilityGuards.parseHelixAskObjectivePlannerPass(
      '{"goal":"x","objectives":[],"grounding_mode":"repo","output_family":"roadmap_planning"}',
    );
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: false,
      plannerSource: "invalid_json_fallback",
      plannerPass: parsed,
    });
    expect(parsed).toBeNull();
    expect(contract.output_family).toBe("roadmap_planning");
    expect(contract.planner.mode).toBe("deterministic");
    expect(contract.planner.valid).toBe(false);
    expect(contract.objectives.length).toBeGreaterThan(1);
    expect(contract.required_slots).toContain("repo-mapping");
    expect(contract.required_slots).toContain("implementation-touchpoints");
    expect(__testHelixAskReliabilityGuards.hashHelixAskTurnContract(contract)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("overrides planner definition family for relation repo-anchor prompts", () => {
    const question = "What is Needle Hull Mark 2 and how does it relate to Mercury precession?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "general",
      requiresRepoEvidence: false,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      plannerMode: "llm",
      plannerValid: true,
      plannerSource: "planner_single_llm",
      plannerPass: {
        goal: question,
        grounding_mode: "open",
        output_family: "definition_overview",
        objectives: [{ label: question }],
      },
    });
    expect(contract.output_family).toBe("mechanism_process");
  });

  it("overrides planner implementation family for docs-viewer summarize prompts with docs-only anchors", () => {
    const question =
      "Summarize this document from the current docs viewer context. Start with one sentence on what this document is for, then key findings and caveats. Document path: /docs/audits/research/granular-tidal-sunquake-source-check-2026-03-25.md";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "llm",
      plannerValid: true,
      plannerSource: "planner_single_llm",
      plannerPass: {
        goal: question,
        grounding_mode: "repo",
        output_family: "implementation_code_path",
        objectives: [{ label: question }],
      },
    });
    expect(contract.output_family).toBe("mechanism_process");
    expect(contract.objectives).toHaveLength(1);
    expect(contract.required_slots).toEqual(
      expect.arrayContaining(["summarize", "document", "findings", "caveats"]),
    );
    expect(contract.required_slots).not.toContain("security-controls");
    expect(contract.required_slots).not.toContain("context-persistence");
  });

  it("builds turn-contract objective support from covered slots", () => {
    const question =
      "Plan future work for profiles, voice lane, and translation in this repo.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    const support = __testHelixAskReliabilityGuards.buildHelixAskTurnContractObjectiveSupport({
      contract,
      coveredSlots: ["repo-mapping", "implementation-touchpoints", "voice-lane"],
    });
    expect(support.length).toBe(contract.objectives.length);
    expect(support.some((entry: { supported: boolean }) => entry.supported)).toBe(true);
  });

  it("tracks objective loop state from retrieval coverage through terminal completion", () => {
    const question =
      "Plan future work for profiles, voice lane, and translation in this repo.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    const initial = __testHelixAskReliabilityGuards.buildHelixAskObjectiveLoopState(contract);
    expect(initial.length).toBe(contract.objectives.length);
    expect(initial.every((state: { status: string }) => state.status === "pending")).toBe(true);

    const withCoverage = __testHelixAskReliabilityGuards.applyHelixAskObjectiveCoverageSnapshot({
      states: initial,
      coveredSlots: contract.required_slots,
      retrievalConfidence: 0.82,
      transitionReason: "test_coverage",
      transitionLog: [],
    });
    expect(
      withCoverage.every(
        (state: { status: string; matched_slots: string[]; required_slots: string[] }) =>
          state.status === "synthesizing" &&
          state.matched_slots.length === state.required_slots.length,
      ),
    ).toBe(true);

    const finalized = __testHelixAskReliabilityGuards.finalizeHelixAskObjectiveLoopState({
      states: withCoverage,
      validationPassed: true,
      failReason: null,
      transitionLog: [],
    });
    const summary = __testHelixAskReliabilityGuards.summarizeHelixAskObjectiveLoopState(finalized);
    expect(finalized.every((state: { status: string }) => state.status === "complete")).toBe(true);
    expect(summary.unresolvedCount).toBe(0);
    expect(summary.completionRate).toBe(1);
  });

  it("marks unresolved objectives as blocked when finalize gate fails", () => {
    const question =
      "Plan future work for profiles, voice lane, and translation in this repo.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    const initial = __testHelixAskReliabilityGuards.buildHelixAskObjectiveLoopState(contract);
    const partialCoverage = __testHelixAskReliabilityGuards.applyHelixAskObjectiveCoverageSnapshot({
      states: initial,
      coveredSlots: [],
      retrievalConfidence: 0.22,
      transitionReason: "test_partial",
      transitionLog: [],
    });
    const finalized = __testHelixAskReliabilityGuards.finalizeHelixAskObjectiveLoopState({
      states: partialCoverage,
      validationPassed: false,
      failReason: "quality_gate_fail",
      transitionLog: [],
    });
    const summary = __testHelixAskReliabilityGuards.summarizeHelixAskObjectiveLoopState(finalized);
    expect(finalized.every((state: { status: string }) => state.status === "blocked")).toBe(true);
    expect(summary.blockedCount).toBe(finalized.length);
    expect(summary.unresolvedCount).toBe(0);
  });

  it("applies scoped objective coverage snapshots without clobbering other objective state", () => {
    const scoped = __testHelixAskReliabilityGuards.applyHelixAskObjectiveCoverageSnapshot({
      states: [
        {
          objective_id: "obj_1",
          objective_label: "objective one",
          required_slots: ["repo-mapping", "mechanism"],
          matched_slots: ["repo-mapping"],
          status: "retrieving",
          attempt: 1,
        },
        {
          objective_id: "obj_2",
          objective_label: "objective two",
          required_slots: ["definition"],
          matched_slots: [],
          status: "pending",
          attempt: 0,
        },
      ],
      coveredSlots: ["mechanism"],
      objectiveIds: ["obj_1"],
      retrievalConfidence: 0.61,
      transitionReason: "scoped_retrieval",
      transitionLog: [],
    });
    const objectiveOne = scoped.find((entry: { objective_id: string }) => entry.objective_id === "obj_1");
    const objectiveTwo = scoped.find((entry: { objective_id: string }) => entry.objective_id === "obj_2");
    expect(objectiveOne?.matched_slots).toEqual(expect.arrayContaining(["repo-mapping", "mechanism"]));
    expect(objectiveOne?.status).toBe("synthesizing");
    expect(objectiveTwo?.matched_slots).toEqual([]);
    expect(objectiveTwo?.status).toBe("pending");
  });

  it("infers objective slots from obligation evidence references", () => {
    const inferred = __testHelixAskReliabilityGuards.inferHelixAskObjectiveSlotsFromObligationCoverage([
      {
        obligation_id: "direct_answer",
        label: "profiles voice lane",
        kind: "direct_answer",
        status: "partial",
        matched_slots: [],
        missing_slots: ["voice-lane"],
        evidence_refs: ["server/routes/voice.ts", "docs/helix-ask-flow.md"],
        doc_refs: ["docs/helix-ask-flow.md"],
        code_refs: ["server/routes/voice.ts"],
      },
      {
        obligation_id: "implementation_roadmap",
        label: "translation",
        kind: "roadmap",
        status: "partial",
        matched_slots: [],
        missing_slots: ["transcription-translation"],
        evidence_refs: ["server/skills/stt.whisper.http.ts", "server/routes/agi.plan.ts"],
        doc_refs: [],
        code_refs: ["server/skills/stt.whisper.http.ts"],
      },
    ]);
    expect(inferred).toEqual(
      expect.arrayContaining([
        "repo-mapping",
        "implementation-touchpoints",
        "code-path",
        "voice-lane",
        "transcription-translation",
        "next-steps",
        "definition",
      ]),
    );
  });

  it("builds objective mini answers and validation summary", () => {
    const miniAnswers = __testHelixAskReliabilityGuards.buildHelixAskObjectiveMiniAnswers({
      states: [
        {
          objective_id: "obj_1",
          objective_label: "profiles voice lane",
          required_slots: ["repo-mapping", "voice-lane"],
          matched_slots: ["repo-mapping"],
          status: "synthesizing",
          attempt: 1,
        },
        {
          objective_id: "obj_2",
          objective_label: "translation objective",
          required_slots: ["transcription-translation", "code-path"],
          matched_slots: [],
          status: "blocked",
          attempt: 2,
          blocked_reason: "missing_required_slots",
        },
      ],
      support: [
        {
          objective: "profiles voice lane",
          supported: false,
          matched_slots: ["repo-mapping"],
        },
      ],
      obligationCoverage: [
        {
          obligation_id: "direct_answer",
          label: "profiles voice lane",
          kind: "direct_answer",
          status: "partial",
          matched_slots: [],
          missing_slots: ["voice-lane"],
          evidence_refs: ["server/routes/voice.ts"],
          doc_refs: [],
          code_refs: ["server/routes/voice.ts"],
        },
        {
          obligation_id: "next_anchors_needed",
          label: "translation objective",
          kind: "implementation",
          status: "missing",
          matched_slots: [],
          missing_slots: ["transcription-translation", "code-path"],
          evidence_refs: ["server/skills/stt.whisper.http.ts"],
          doc_refs: [],
          code_refs: ["server/skills/stt.whisper.http.ts"],
        },
      ],
      objectiveRetrievalSelectedFiles: [
        {
          objective_id: "obj_1",
          pass_index: 1,
          files: ["server/routes/voice.ts"],
        },
      ],
      fallbackEvidenceRefs: ["server/routes/agi.plan.ts"],
    });
    expect(miniAnswers).toHaveLength(2);
    expect(miniAnswers[0].status).toBe("covered");
    expect(miniAnswers[0].evidence_refs).toContain("server/routes/voice.ts");
    expect(miniAnswers[1].status).toBe("blocked");
    const miniValidation =
      __testHelixAskReliabilityGuards.summarizeHelixAskObjectiveMiniValidation(miniAnswers);
    expect(miniValidation.total).toBe(2);
    expect(miniValidation.blocked).toBe(1);
    expect(miniValidation.unresolved).toBe(1);
  });

  it("infers semantic slot hits from objective-local evidence refs", () => {
    const miniAnswers = __testHelixAskReliabilityGuards.buildHelixAskObjectiveMiniAnswers({
      states: [
        {
          objective_id: "obj_voice",
          objective_label: "voice lane objective",
          required_slots: ["repo-mapping", "voice-lane"],
          matched_slots: ["repo-mapping"],
          status: "synthesizing",
          attempt: 1,
        },
        {
          objective_id: "obj_trans",
          objective_label: "translation objective",
          required_slots: ["repo-mapping", "transcription-translation"],
          matched_slots: ["repo-mapping"],
          status: "synthesizing",
          attempt: 1,
        },
      ],
      support: [],
      obligationCoverage: [],
      objectiveRetrievalSelectedFiles: [
        {
          objective_id: "obj_voice",
          pass_index: 1,
          files: ["server/routes/voice.ts", "docs/architecture/voice-bundle-format.md"],
        },
        {
          objective_id: "obj_trans",
          pass_index: 1,
          files: ["server/skills/stt.whisper.http.ts", "client/src/lib/agi/jobs.ts"],
        },
      ],
      fallbackEvidenceRefs: [],
    });
    const byId = new Map(miniAnswers.map((entry: { objective_id: string }) => [entry.objective_id, entry] as const));
    expect(byId.get("obj_voice")?.status).toBe("covered");
    expect(byId.get("obj_voice")?.matched_slots).toEqual(
      expect.arrayContaining(["repo-mapping", "voice-lane"]),
    );
    expect(byId.get("obj_trans")?.status).toBe("covered");
    expect(byId.get("obj_trans")?.matched_slots).toEqual(
      expect.arrayContaining(["repo-mapping", "transcription-translation"]),
    );
  });

  it("infers mechanism from deeper objective evidence while keeping mini evidence concise", () => {
    const miniAnswers = __testHelixAskReliabilityGuards.buildHelixAskObjectiveMiniAnswers({
      states: [
        {
          objective_id: "obj_casimir_es",
          objective_label:
            "que es un casimir tile en full solve congruence? responde en espanol e incluye code paths",
          required_slots: ["mechanism", "code-path", "casimir", "tile"],
          matched_slots: ["code-path", "casimir", "tile"],
          status: "synthesizing",
          attempt: 1,
        },
      ],
      support: [],
      obligationCoverage: [],
      objectiveRetrievalSelectedFiles: [
        {
          objective_id: "obj_casimir_es",
          pass_index: 1,
          files: [
            "docs/guarded-casimir-tile-code-mapped.md",
            "modules/sim_core/static-casimir.ts",
            "server/services/code-lattice/__tests__/resonance.casimir.spec.ts",
            "modules/dynamic/dynamic-casimir.ts",
            "docs/knowledge/physics/casimir-force-energy.md",
            "docs/casimir-tile-roadmap.md",
            "docs/specs/templates/casimir-tile-sem-ellipsometry-paired-run-evidence-template.v1.json",
            "docs/audits/ticket-results/TOE-027-casimir-tiles-resonance-contract.20260218T032655Z.json",
            "server/services/casimir/telemetry.ts",
            "docs/casimir-tile-mechanism.md",
            "docs/casimir-tile-schematic-roadmap.md",
            "docs/knowledge/trees/casimir-tiles-tree.md",
          ],
        },
      ],
      fallbackEvidenceRefs: [],
    });
    expect(miniAnswers).toHaveLength(1);
    expect(miniAnswers[0]?.status).toBe("covered");
    expect(miniAnswers[0]?.matched_slots).toEqual(
      expect.arrayContaining(["mechanism", "code-path", "casimir", "tile"]),
    );
    expect(miniAnswers[0]?.evidence_refs.length).toBe(8);
  });

  it("can disable heuristic slot inference for objective mini answers", () => {
    const miniAnswers = __testHelixAskReliabilityGuards.buildHelixAskObjectiveMiniAnswers({
      states: [
        {
          objective_id: "obj_voice",
          objective_label: "voice lane objective",
          required_slots: ["repo-mapping", "voice-lane"],
          matched_slots: ["repo-mapping"],
          status: "synthesizing",
          attempt: 1,
        },
      ],
      support: [],
      obligationCoverage: [],
      objectiveRetrievalSelectedFiles: [
        {
          objective_id: "obj_voice",
          pass_index: 1,
          files: ["server/routes/voice.ts"],
        },
      ],
      fallbackEvidenceRefs: [],
      enableHeuristicInference: false,
    });
    expect(miniAnswers).toHaveLength(1);
    expect(miniAnswers[0]?.status).toBe("partial");
    expect(miniAnswers[0]?.missing_slots).toEqual(expect.arrayContaining(["voice-lane"]));
  });

  it("builds retrieval context from stage05 cards when selected previews are empty", () => {
    const contextResult = __testHelixAskReliabilityGuards.buildAskContextFromCandidates({
      selected: [],
      stage05Cards: [
        {
          path: "docs/casimir-tile-mechanism.md",
          kind: "doc",
          summary: "Casimir tile mechanism uses coupled constraints and feedback loops.",
          symbolsOrKeys: ["casimir", "mechanism", "feedback"],
          snippets: [
            {
              start: 22,
              end: 24,
              text: "Mechanism: coupled constraints drive pressure feedback.",
            },
          ],
          confidence: 0.84,
          slotHits: ["definition", "mechanism"],
        },
      ],
    });
    expect(contextResult.files).toContain("docs/casimir-tile-mechanism.md");
    expect(contextResult.context).toContain("docs/casimir-tile-mechanism.md");
    expect(contextResult.context).toMatch(/Mechanism/i);
  });

  it("allows exactly one baseline objective retrieval attempt when agent gate is blocked", () => {
    const allowInitialBypass =
      __testHelixAskReliabilityGuards.shouldBypassHelixAskObjectiveScopedRetrievalAgentGate({
        canAgentAct: false,
        objectiveAttempt: 0,
        objectiveHasPriorRetrievalPass: false,
      });
    const denyAfterFirstAttempt =
      __testHelixAskReliabilityGuards.shouldBypassHelixAskObjectiveScopedRetrievalAgentGate({
        canAgentAct: false,
        objectiveAttempt: 1,
        objectiveHasPriorRetrievalPass: false,
      });
    const denyWhenPriorRetrievalExists =
      __testHelixAskReliabilityGuards.shouldBypassHelixAskObjectiveScopedRetrievalAgentGate({
        canAgentAct: false,
        objectiveAttempt: 0,
        objectiveHasPriorRetrievalPass: true,
      });
    const denyWhenAgentCanAct =
      __testHelixAskReliabilityGuards.shouldBypassHelixAskObjectiveScopedRetrievalAgentGate({
        canAgentAct: true,
        objectiveAttempt: 0,
        objectiveHasPriorRetrievalPass: false,
      });
    expect(allowInitialBypass).toBe(true);
    expect(denyAfterFirstAttempt).toBe(false);
    expect(denyWhenPriorRetrievalExists).toBe(false);
    expect(denyWhenAgentCanAct).toBe(false);
  });

  it("selects unresolved objectives without retrieval passes for recovery", () => {
    const targets =
      __testHelixAskReliabilityGuards.collectHelixAskObjectiveScopedRetrievalRecoveryTargets({
        states: [
          {
            objective_id: "obj_1",
            objective_label: "first objective",
            required_slots: ["definition"],
            matched_slots: [],
            status: "pending",
            attempt: 0,
          },
          {
            objective_id: "obj_2",
            objective_label: "second objective",
            required_slots: ["mechanism"],
            matched_slots: [],
            status: "retrieving",
            attempt: 1,
          },
          {
            objective_id: "obj_3",
            objective_label: "third objective",
            required_slots: ["repo-mapping"],
            matched_slots: ["repo-mapping"],
            status: "complete",
            attempt: 1,
          },
        ],
        retrievalQueries: [{ objective_id: "obj_2" }],
        maxObjectives: 4,
      });
    expect(targets.map((entry: { objective_id: string }) => entry.objective_id)).toEqual([
      "obj_1",
    ]);
  });

  it("expands recovery attempt budget for mechanism-like unresolved slots", () => {
    const escalated =
      __testHelixAskReliabilityGuards.computeHelixAskObjectiveScopedRecoveryMaxAttempts({
        missingSlots: ["mechanism", "code-path"],
        routingSalvageEligible: false,
      });
    const baseline =
      __testHelixAskReliabilityGuards.computeHelixAskObjectiveScopedRecoveryMaxAttempts({
        missingSlots: ["definition"],
        routingSalvageEligible: false,
      });
    const salvageEscalated =
      __testHelixAskReliabilityGuards.computeHelixAskObjectiveScopedRecoveryMaxAttempts({
        missingSlots: ["definition"],
        routingSalvageEligible: true,
      });
    expect(escalated).toBe(3);
    expect(baseline).toBe(2);
    expect(salvageEscalated).toBe(3);
  });

  it("builds bounded recovery escalation hints from slots and prior evidence", () => {
    const hints =
      __testHelixAskReliabilityGuards.buildHelixAskObjectiveScopedRecoveryEscalationHints({
        objectiveLabel: "casimir tile mechanism in full solve congruence",
        missingSlots: ["mechanism", "code-path"],
        priorEvidenceRefs: [
          "docs/casimir-tile-mechanism.md",
          "modules/warp/warp-module.ts",
        ],
        maxHints: 6,
    });
    expect(hints.length).toBeLessThanOrEqual(6);
    expect(hints.join(" ").toLowerCase()).toContain("mechanism");
    expect(
      hints.some((entry: string) => /casimir[-_/ ]tile[-_/ ]mechanism/i.test(entry)),
    ).toBe(true);
  });

  it("builds bounded recovery query variants for parallel diversification", () => {
    const variants =
      __testHelixAskReliabilityGuards.buildHelixAskObjectiveScopedRecoveryQueryVariants({
        baseQuestion: "what is a casimir tile in the full solve congruence",
        primaryQueries: [
          "what is a casimir tile in the full solve congruence",
          "casimir tile mechanism",
        ],
        objectiveLabel: "casimir tile in full solve congruence",
        missingSlots: ["mechanism", "code-path"],
        maxQueries: 8,
        maxVariants: 2,
      });
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants.length).toBeLessThanOrEqual(2);
    expect(variants[0]?.length ?? 0).toBeGreaterThan(0);
    if (variants.length > 1) {
      expect(variants[1]).not.toEqual(variants[0]);
    }
  });

  it("collects unresolved objective ids missing scoped retrieval passes", () => {
    const ids =
      __testHelixAskReliabilityGuards.collectHelixAskObjectiveIdsWithoutScopedRetrievalPass({
        states: [
          {
            objective_id: "obj_pending",
            objective_label: "pending objective",
            required_slots: ["mechanism"],
            matched_slots: [],
            status: "pending",
            attempt: 0,
          },
          {
            objective_id: "obj_blocked",
            objective_label: "blocked objective",
            required_slots: ["mechanism"],
            matched_slots: [],
            status: "blocked",
            attempt: 1,
          },
          {
            objective_id: "obj_no_slots",
            objective_label: "no-slot objective",
            required_slots: [],
            matched_slots: [],
            status: "pending",
            attempt: 0,
          },
        ],
        retrievalQueries: [{ objective_id: "obj_blocked" }],
        unresolvedOnly: true,
        maxObjectives: 4,
      });
    expect(ids).toEqual(["obj_pending"]);
  });

  it("forces mini-answer partial coverage when scoped retrieval is missing", () => {
    const enforced =
      __testHelixAskReliabilityGuards.enforceHelixAskObjectiveScopedRetrievalRequirementForMiniAnswers({
        miniAnswers: [
          {
            objective_id: "obj_pending",
            objective_label: "pending objective",
            status: "covered",
            matched_slots: ["definition"],
            missing_slots: [],
            evidence_refs: ["docs/knowledge/warp/warp-bubble.md"],
            summary: "pending objective: covered.",
          },
        ],
        states: [
          {
            objective_id: "obj_pending",
            objective_label: "pending objective",
            required_slots: ["definition", "mechanism"],
            matched_slots: ["definition"],
            status: "pending",
            attempt: 0,
          },
        ],
        retrievalQueries: [],
        maxObjectives: 4,
      });
    expect(enforced.missingObjectiveIds).toEqual(["obj_pending"]);
    expect(enforced.miniAnswers[0]?.status).toBe("partial");
    expect(enforced.miniAnswers[0]?.missing_slots).toEqual(
      expect.arrayContaining(["mechanism"]),
    );
    expect(enforced.miniAnswers[0]?.summary).toMatch(/assembly blocked until objective-scoped retrieval runs/i);
    expect(enforced.miniAnswers[0]?.unknown_block?.why).toMatch(
      /no objective-scoped retrieval pass was recorded/i,
    );
    expect(enforced.miniAnswers[0]?.unknown_block?.what_i_checked).toEqual(
      expect.arrayContaining(["docs/knowledge/warp/warp-bubble.md"]),
    );
    expect(enforced.miniAnswers[0]?.unknown_block?.next_retrieval).toMatch(
      /Run objective-scoped retrieval/i,
    );
  });

  it("downgrades covered mini-answers when objective evidence sufficiency is below covered threshold", () => {
    const enforced =
      __testHelixAskReliabilityGuards.enforceHelixAskObjectiveEvidenceSufficiency({
        miniAnswers: [
          {
            objective_id: "obj_weak",
            objective_label: "weakly evidenced objective",
            status: "covered",
            matched_slots: ["definition"],
            missing_slots: [],
            evidence_refs: ["docs/knowledge/warp/warp-bubble.md"],
            summary: "weak objective marked covered.",
          },
        ],
        states: [
          {
            objective_id: "obj_weak",
            objective_label: "weakly evidenced objective",
            required_slots: ["definition", "mechanism"],
            matched_slots: ["definition"],
            status: "synthesizing",
            attempt: 1,
            retrieval_confidence: 1,
          },
        ],
      });
    expect(enforced.miniAnswers).toHaveLength(1);
    expect(enforced.miniAnswers[0]?.status).toBe("partial");
    expect(enforced.miniAnswers[0]?.missing_slots).toEqual(
      expect.arrayContaining(["evidence"]),
    );
    expect(enforced.scores[0]?.score).toBeLessThan(0.75);
    expect(enforced.terminalizationReasons["obj_weak"]).toBe(
      "objective_oes_below_covered_threshold",
    );
  });

  it("prevents false covered when retrieval confidence is zero and evidence linkage is missing", () => {
    const states = [
      {
        objective_id: "obj_zero",
        objective_label: "zero-confidence objective",
        required_slots: ["definition"],
        matched_slots: ["definition"],
        status: "synthesizing",
        attempt: 1,
        retrieval_confidence: 0,
      },
    ];
    const miniAnswers = __testHelixAskReliabilityGuards.buildHelixAskObjectiveMiniAnswers({
      states,
      support: [],
      obligationCoverage: [],
      fallbackEvidenceRefs: ["server/routes/agi.plan.ts"],
    });

    expect(miniAnswers).toHaveLength(1);
    expect(miniAnswers[0]?.status).toBe("partial");
    expect(miniAnswers[0]?.missing_slots).toEqual(expect.arrayContaining(["evidence"]));
    expect(miniAnswers[0]?.evidence_refs).toEqual(["server/routes/agi.plan.ts"]);
    expect(miniAnswers[0]?.linked_evidence_refs ?? []).toEqual([]);

    const enforced =
      __testHelixAskReliabilityGuards.enforceHelixAskObjectiveEvidenceSufficiency({
        miniAnswers,
        states,
      });

    expect(enforced.miniAnswers[0]?.status).toBe("blocked");
    expect(enforced.scores[0]?.reason).toBe(
      "objective_zero_confidence_missing_evidence_linkage",
    );
    expect(enforced.terminalizationReasons["obj_zero"]).toBe(
      "objective_oes_partial_below_block_threshold",
    );
  });

  it("promotes weak partial mini-answers to blocked when objective evidence sufficiency is very low", () => {
    const enforced =
      __testHelixAskReliabilityGuards.enforceHelixAskObjectiveEvidenceSufficiency({
        miniAnswers: [
          {
            objective_id: "obj_partial",
            objective_label: "partial objective",
            status: "partial",
            matched_slots: [],
            missing_slots: ["definition", "mechanism"],
            evidence_refs: [],
            summary: "partial objective with weak evidence.",
          },
        ],
        states: [
          {
            objective_id: "obj_partial",
            objective_label: "partial objective",
            required_slots: ["definition", "mechanism"],
            matched_slots: [],
            status: "synthesizing",
            attempt: 2,
            retrieval_confidence: 0,
          },
        ],
      });
    expect(enforced.miniAnswers).toHaveLength(1);
    expect(enforced.miniAnswers[0]?.status).toBe("blocked");
    expect(enforced.scores[0]?.score).toBeLessThan(0.5);
    expect(enforced.terminalizationReasons["obj_partial"]).toBe(
      "objective_oes_partial_below_block_threshold",
    );
  });

  it("keeps applyContextAttempt available for late objective recovery passes", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    expect(routeSource).toMatch(/let applyContextAttempt:\s*\(/);
    expect(routeSource).toMatch(/\bapplyContextAttempt\s*=\s*\(/);
  });

  it("parses and applies objective mini critique JSON", () => {
    const critique = __testHelixAskReliabilityGuards.parseHelixAskObjectiveMiniCritique(
      JSON.stringify({
        objectives: [
          {
            objective_id: "obj_voice",
            status: "covered",
            missing_slots: [],
            reason: "voice evidence is sufficient",
          },
        ],
      }),
    );
    expect(critique).not.toBeNull();
    const applied = __testHelixAskReliabilityGuards.applyHelixAskObjectiveMiniCritique({
      miniAnswers: [
        {
          objective_id: "obj_voice",
          objective_label: "voice lane objective",
          status: "partial",
          matched_slots: ["repo-mapping"],
          missing_slots: ["voice-lane"],
          evidence_refs: ["server/routes/voice.ts"],
          summary: "voice lane objective: partially covered.",
        },
      ],
      critique: critique!,
      objectiveStates: [
        {
          objective_id: "obj_voice",
          objective_label: "voice lane objective",
          required_slots: ["repo-mapping", "voice-lane"],
          matched_slots: ["repo-mapping"],
          status: "synthesizing",
          attempt: 1,
        },
      ],
    });
    expect(applied[0]?.status).toBe("covered");
    expect(applied[0]?.missing_slots).toEqual([]);
    expect(applied[0]?.matched_slots).toEqual(
      expect.arrayContaining(["repo-mapping", "voice-lane"]),
    );
  });

  it("parses plain-text single-objective mini synth fallbacks with status, missing slots, and evidence refs", () => {
    const parseMiniSynth = buildHelixAskObjectiveMiniSynthParser();
    const parsed = parseMiniSynth(
      [
        "status: partial",
        "Missing slots: definition and implementation.",
        "Evidence refs: docs/helix-ask-flow.md and server/routes/agi.plan.ts.",
        "This mini synth is intentionally plain text.",
      ].join("\n"),
      {
        objectiveHints: [
          {
            objective_id: "obj_mini_synth",
            required_slots: ["definition", "implementation", "evidence"],
          },
        ],
      },
    );

    const objective = asArray(asObject(parsed)?.objectives)?.[0];
    expect(objective).toBeDefined();
    expect(asObject(objective)?.objective_id).toBe("obj_mini_synth");
    expect(asObject(objective)?.status).toBe("partial");
    expect(asArray(asObject(objective)?.missing_slots)).toEqual(["definition", "implementation"]);
    expect(asArray(asObject(objective)?.matched_slots)).toEqual(["evidence"]);
    expect(asArray(asObject(objective)?.evidence_refs)).toEqual(
      expect.arrayContaining(["docs/helix-ask-flow.md", "server/routes/agi.plan.ts"]),
    );
  });

  it("normalizes complete plain-text mini synth fallbacks into covered objectives", () => {
    const parseMiniSynth = buildHelixAskObjectiveMiniSynthParser();
    const parsed = parseMiniSynth(
      [
        "Complete objective synthesis for the turn.",
        "Missing slots: none.",
        "Evidence refs: docs/helix-ask-flow.md, docs/helix-ask-home-stretch-plan.md.",
      ].join("\n"),
      {
        objectiveHints: [
          {
            objective_id: "obj_mini_synth",
            required_slots: ["definition", "implementation", "evidence"],
          },
        ],
      },
    );

    const objective = asArray(asObject(parsed)?.objectives)?.[0];
    expect(objective).toBeDefined();
    expect(asObject(objective)?.status).toBe("covered");
    expect(asArray(asObject(objective)?.missing_slots)).toEqual([]);
    expect(asArray(asObject(objective)?.matched_slots)).toEqual(
      expect.arrayContaining(["definition", "implementation", "evidence"]),
    );
    expect(asArray(asObject(objective)?.evidence_refs)).toEqual(
      expect.arrayContaining([
        "docs/helix-ask-flow.md",
        "docs/helix-ask-home-stretch-plan.md",
      ]),
    );
  });

  it("keeps the current objective rewrite directive and deterministic mini-synth mode flags in source", () => {
    const routeSource = readHelixAskRouteSource();
    expect(routeSource).toContain(
      "If the current draft contains blocked/unknown scaffolds, rewrite it into a direct covered answer using objective summaries and evidence.",
    );
    expect(routeSource).toContain("objective_mini_synth_mode");
    expect(routeSource).toContain("objective_mini_synth_attempted");
    expect(routeSource).toContain("objective_mini_synth_fail_reason");
    expect(routeSource).toContain("objective_mini_synth_prompt_preview");
    expect(routeSource).toContain("objective_mini_critic_prompt_preview");
    expect(routeSource).toContain('objectiveMiniSynthMode = "none"');
    expect(routeSource).toContain('objectiveMiniSynthMode = "heuristic_fallback"');
    expect(routeSource).toContain('objectiveMiniSynthMode = "llm"');
    expect(routeSource).toContain('reasoning_effort: objectiveMiniSynthMode === "llm" ? "medium" : null');
    expect(routeSource).toContain('schema_valid: objectiveMiniSynthMode === "llm"');
    expect(routeSource).toMatch(/decision:\s*objectiveMiniSynthMode\s*===\s*"llm"/);
    expect(routeSource).toContain('answerPath.push("objectiveMiniSynth:llm")');
    expect(routeSource).toContain('answerPath.push("objectiveMiniSynth:fallback")');
  });

  it("fail-closes deterministic objective assembly when required objectives remain unresolved", () => {
    const assembled = __testHelixAskReliabilityGuards.buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "profiles voice lane",
          status: "partial",
          matched_slots: ["repo-mapping"],
          missing_slots: ["voice-lane"],
          evidence_refs: ["server/routes/voice.ts"],
          summary: "profiles voice lane: partially covered.",
        },
      ],
      currentAnswer: "Main answer body.",
      blockedReason: "objective_assembly_fail_closed_missing_scoped_retrieval",
      missingScopedRetrievalObjectiveIds: ["obj_1"],
    });
    expect(assembled).toMatch(/Assembly blocked: required objective gate failed-closed\./i);
    expect(assembled).toMatch(
      /Reason:\s*missing objective-scoped retrieval for unresolved required objective: profiles voice lane\./i,
    );
    expect(assembled).toMatch(/Open gaps \/ UNKNOWNs:/i);
    expect(assembled).toMatch(/UNKNOWN - profiles voice lane/i);
    expect(assembled).toMatch(
      /Why:\s*required objective unresolved because no objective-scoped retrieval pass was recorded/i,
    );
    expect(assembled).toMatch(/What I checked:\s*server\/routes\/voice\.ts/i);
    expect(assembled).toMatch(/Next retrieval:/i);
    expect(assembled).not.toMatch(/Remaining uncertainty:/i);
    expect(assembled).not.toMatch(/Main answer body\./);
  });

  it("preserves the conversational draft when deterministic objective assembly is only a soft fallback", () => {
    const assembled = __testHelixAskReliabilityGuards.buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "shift vector mild-regime meaning",
          status: "partial",
          matched_slots: ["mechanism"],
          missing_slots: ["solve-connection"],
          evidence_refs: ["server/routes/agi.plan.ts"],
          summary: "shift vector mild-regime meaning: partially covered.",
        },
      ],
      currentAnswer:
        "The norm of the shift vector matters because it tells you how strong the coordinate transport term is inside the solve, so a mild regime means the solver is working in a perturbative, well-controlled transport limit instead of a violently advective one.",
      blockedReason: "objective_assembly_fail_closed_missing_scoped_retrieval",
      missingScopedRetrievalObjectiveIds: ["obj_1"],
      visibleFailClosed: false,
    });

    expect(assembled).toMatch(/coordinate transport term/i);
    expect(assembled).not.toMatch(/Assembly blocked:/i);
    expect(assembled).not.toMatch(/Open gaps \/ UNKNOWNs:/i);
    expect(assembled).not.toMatch(/UNKNOWN -/i);
  });

  it("sanitizes generic scaffold phrasing from UNKNOWN blocks in deterministic assembly", () => {
    const assembled = __testHelixAskReliabilityGuards.buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "first principles meaning in physics",
          status: "partial",
          matched_slots: [],
          missing_slots: ["definition"],
          evidence_refs: [],
          summary: "first principles meaning in physics: partially covered.",
          unknown_block: {
            unknown:
              'For "What are first principles meaning in physics?", start with one concrete claim.',
            why: "core meaning of the concept in its domain context",
            what_i_checked: [],
            next_retrieval: "Sources: open-world best-effort (no repo citations required).",
          },
        },
      ],
      currentAnswer: "",
      blockedReason: "objective_assembly_fail_closed_required_objective_unresolved",
    });
    expect(assembled).toMatch(/Assembly blocked: required objective gate failed-closed\./i);
    expect(assembled).toMatch(/UNKNOWN - first principles meaning in physics/i);
    expect(assembled).toMatch(/Why:\s*required objective unresolved; missing definition/i);
    expect(assembled).toMatch(/What I checked:\s*No objective-local evidence was captured/i);
    expect(assembled).toMatch(/Next retrieval:\s*Run objective-scoped retrieval/i);
    expect(assembled).not.toMatch(/start with one concrete claim/i);
    expect(assembled).not.toMatch(/core meaning of the concept in its domain context/i);
    expect(assembled).not.toMatch(/Sources:\s*open-world best-effort/i);
  });

  it("injects a concrete commonality fallback before fail-closed UNKNOWN blocks", () => {
    const assembled = __testHelixAskReliabilityGuards.buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "electron and solar-system kinematics commonality",
          status: "partial",
          matched_slots: [],
          missing_slots: ["definition"],
          evidence_refs: ["docs/knowledge/physics/physics-foundations-tree.json"],
          summary: "electron and solar-system kinematics commonality: partially covered.",
        },
      ],
      currentAnswer: "",
      blockedReason: "objective_assembly_fail_closed_required_objective_unresolved",
      question: "What is the electron and kinematics of the solar system have in common?",
    });
    expect(assembled).toMatch(/dynamical systems/i);
    expect(assembled).toMatch(/equations of motion|conservation laws/i);
    expect(assembled).toMatch(/Assembly blocked: required objective gate failed-closed\./i);
    expect(assembled).toMatch(/Open gaps \/ UNKNOWNs:/i);
    expect(assembled).toMatch(/UNKNOWN - electron and solar-system kinematics commonality/i);
    expect(assembled).toMatch(/Sources:\s*docs\/knowledge\/physics\/physics-foundations-tree\.json/i);
  });

  it("keeps current answer unchanged for single covered objective deterministic assembly", () => {
    const assembled = __testHelixAskReliabilityGuards.buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "warp bubble definition",
          status: "covered",
          matched_slots: ["definition"],
          missing_slots: [],
          evidence_refs: ["docs/knowledge/warp/warp-bubble.md"],
          summary: "warp bubble definition: covered.",
        },
      ],
      currentAnswer: "A warp bubble is a GR metric construction around a localized region.",
    });
    expect(assembled).toBe(
      "A warp bubble is a GR metric construction around a localized region.",
    );
  });

  it("scrubs objective checkpoint scaffold artifacts from final text while preserving sources", () => {
    const cleaned =
      __testHelixAskReliabilityGuards.stripHelixAskObjectiveCheckpointArtifacts(
        "A warp bubble is a spacetime concept. Objective checkpoints: 1. What is a warp bubble?\nstatus=covered\nmissing=none\nevidence=definition\nsummary=covered\nSources: docs/knowledge/warp/warp-bubble.md",
      );
    expect(cleaned).not.toMatch(/Objective checkpoints:/i);
    expect(cleaned).not.toMatch(/\bstatus=/i);
    expect(cleaned).toMatch(/Sources:\s*docs\/knowledge\/warp\/warp-bubble\.md/i);
  });

  it("splits multi-clause objectives without synthesizing plan placeholders", () => {
    const question =
      "What is a warp bubble and how does it get a full solve like in the case of the Needle Hull Mark 2?";
    const fragments =
      __testHelixAskReliabilityGuards.extractHelixAskTurnObjectiveFragments(question);
    expect(fragments.length).toBeGreaterThanOrEqual(2);
    expect(fragments.some((entry: string) => /^Plan for /i.test(entry))).toBe(false);
    expect(fragments[0].toLowerCase()).toContain("what is a warp bubble");
    expect(fragments[1].toLowerCase()).toContain("how does it get a full solve");
  });

  it("keeps malformed commonality prompts as a single objective fragment", () => {
    const question = "What is the electron and kinematics of the solar system have in common?";
    const fragments =
      __testHelixAskReliabilityGuards.extractHelixAskTurnObjectiveFragments(question);
    expect(fragments).toHaveLength(1);
    expect(fragments[0].toLowerCase()).toContain("have in common");
  });

  it("preserves the primary objective when include-list tails split into multiple fragments", () => {
    const question =
      "give the casimir tile mechanism in full solve congruence, include exact repo code paths and explicit open gaps only";
    const fragments =
      __testHelixAskReliabilityGuards.extractHelixAskTurnObjectiveFragments(question);
    expect(fragments.length).toBeGreaterThanOrEqual(3);
    expect(fragments[0].toLowerCase()).toContain("casimir tile mechanism");
    expect(fragments.some((entry: string) => /exact repo code paths/i.test(entry))).toBe(true);
    expect(fragments.some((entry: string) => /explicit open gaps only/i.test(entry))).toBe(true);
  });

  it("keeps mechanism slot on the primary objective for include-list prompts", () => {
    const question =
      "give the casimir tile mechanism in full solve congruence, include exact repo code paths and explicit open gaps only";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "hybrid",
      requiresRepoEvidence: false,
      queryConstraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    expect(contract.objectives.length).toBeGreaterThan(0);
    expect(contract.objectives[0]?.required_slots).toContain("mechanism");
  });

  it("does not inject literal-term slots for open-world definition objectives", () => {
    const question = "What is a warp bubble?";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "general",
      requiresRepoEvidence: false,
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    expect(contract.objectives.length).toBeGreaterThan(0);
    const slots = contract.objectives[0].required_slots;
    expect(slots).toContain("definition");
    expect(slots).not.toContain("warp");
    expect(slots).not.toContain("bubble");
  });

  it("keeps lexical slots available for repo-anchored definition objectives", () => {
    const question = "What is a warp bubble in docs/knowledge/warp/warp-bubble.md?";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    expect(contract.objectives.length).toBeGreaterThan(0);
    const slots = contract.objectives[0].required_slots;
    expect(slots).toContain("definition");
    expect(slots).toContain("warp");
  });

  it("adds answer obligations and per-obligation coverage to the shadow plan", () => {
    const question =
      "What is a warp bubble and how does it get a full solve like in the case of the Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    const support = __testHelixAskReliabilityGuards.buildHelixAskTurnContractObjectiveSupport({
      contract,
      coveredSlots: ["definition", "mechanism", "equation"],
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFileCount: 3,
      turnContract: contract,
      slotCoverageRatio: 0.75,
      slotMissing: ["code_path"],
      objectiveSupport: support,
    });
    expect(plan.turn_contract.obligations.length).toBeGreaterThanOrEqual(3);
    expect(plan.evidence_pack.obligation_coverage.length).toBe(plan.turn_contract.obligations.length);
    expect(
      plan.evidence_pack.obligation_coverage.some(
        (coverage: { status: string; missing_slots: string[] }) =>
          coverage.status !== "covered" && coverage.missing_slots.length > 0,
      ),
    ).toBe(true);
    expect(
      plan.sections.some(
        (section: { obligation_ids?: string[]; coverage_status?: string }) =>
          Array.isArray(section.obligation_ids) &&
          section.obligation_ids.length > 0 &&
          Boolean(section.coverage_status),
      ),
    ).toBe(true);
  });

  it("stores evidence-backed blocks on the shadow plan", () => {
    const question =
      "What is a warp bubble and how does it get a full solve like in the case of the Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
        "docs/audits/research/needle-hull-mark2/README.md",
      ],
      contextFileCount: 4,
      slotCoverageRatio: 0.75,
      slotMissing: ["code_path"],
      evidenceText:
        "docs/knowledge/warp/warp-bubble.md defines a warp bubble as a modeled spacetime region driven by a shift vector field.\n\nmodules/warp/warp-module.ts orchestrates the runtime solve while modules/warp/natario-warp.ts computes the Natario warp field and congruence diagnostics.",
      evidenceSections: [
        {
          id: "definition",
          label: "Definition evidence",
          content:
            "docs/knowledge/warp/warp-bubble.md defines a warp bubble as a modeled spacetime region driven by a shift vector field.",
        },
        {
          id: "repo",
          label: "Repo evidence",
          content:
            "modules/warp/warp-module.ts orchestrates the runtime solve while modules/warp/natario-warp.ts computes the Natario warp field and congruence diagnostics.",
        },
      ],
    });
    expect(plan.evidence_pack.evidence_blocks.length).toBeGreaterThan(0);
    expect(
      plan.evidence_pack.evidence_blocks.some((block: { content: string }) =>
        /modeled spacetime region|shift vector field/i.test(block.content),
      ),
    ).toBe(true);
  });

  it("supplements low-signal evidence packet content with file-backed snippets", () => {
    const tempRoot = fs.mkdtempSync(path.join(process.cwd(), ".tmp-helix-ask-evidence-"));
    const docPath = path.join(tempRoot, "warp-bubble.md");
    const codePath = path.join(tempRoot, "natario-warp.ts");
    try {
      fs.writeFileSync(
        docPath,
        [
          "# Warp Bubble",
          "",
          "A warp bubble is modeled as a spacetime region driven by a shift vector field with expansion guardrails.",
          "",
          "Needle Hull Mark 2 keeps the full-solve campaign bounded by reduced-order solve gates.",
        ].join("\n"),
      );
      fs.writeFileSync(
        codePath,
        [
          "/**",
          " * Needle Hull Mark 2 runtime path computes the warp field and congruence diagnostics.",
          " */",
          "export function computeNatarioWarpField() {",
          "  return null;",
          "}",
        ].join("\n"),
      );
      const question =
        "What is a warp bubble and how does it get a full solve like in the case of the Needle Hull Mark 2?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
        question,
        intentDomain: "repo",
        queryConstraints: constraints,
        equationPrompt: false,
        definitionFocus: false,
        allowedCitations: [docPath, codePath],
        contextFileCount: 2,
        slotCoverageRatio: 0.75,
        slotMissing: ["code_path"],
        evidenceText:
          "Repo evidence:\nmd score=30.000 symbol=stage0 file=docs/warp-canonical-runtime-overview.md.",
        evidenceSections: [
          {
            id: "repo",
            label: "Repo evidence",
            content:
              "md score=30.000 symbol=stage0 file=docs/warp-canonical-runtime-overview.md.",
          },
        ],
      });
      const blocks = plan.evidence_pack.evidence_blocks as Array<{
        content: string;
        citations?: string[];
      }>;
      const contents = blocks.map((block) => block.content);
      expect(contents.some((content) => /spacetime region|shift vector field/i.test(content))).toBe(true);
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(
        blocks.some((block) =>
          (block.citations ?? []).some((citation) => /warp-bubble\.md$|natario-warp\.ts$/i.test(citation)),
        ),
      ).toBe(true);
      expect(contents.some((content) => /score=30\.000|symbol=stage0/i.test(content))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("ignores low-signal canonical evidence text when building grounded briefs", () => {
    const question = "Explain how answer_path is populated and useful for diagnostics.";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
      contextFileCount: 2,
      slotCoverageRatio: 0.75,
      slotMissing: ["mechanism"],
      evidenceText: "20260220T011753Z 20260220T011753Z.json...",
      evidenceSections: [
        {
          id: "repo",
          label: "Repo evidence",
          content: "20260220T011753Z 20260220T011753Z.json...",
        },
        {
          id: "repo-impl",
          label: "Implementation evidence",
          content:
            "The answer_path field is populated in server/routes/agi.plan.ts as the request moves through routing, fallback, and finalization stages.",
        },
      ],
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText:
        "The answer_path field is populated in server/routes/agi.plan.ts as the request moves through routing, fallback, and finalization stages.",
      evidenceText: "20260220T011753Z 20260220T011753Z.json...",
      envelope: __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
        question,
        intentDomain: "repo",
        requiresRepoEvidence: true,
        queryConstraints,
        equationPrompt: false,
        definitionFocus: false,
        equationIntentContract: null,
      }),
    });
    expect(brief.short_answer_seed).toMatch(/answer_path/i);
    expect(brief.short_answer_seed).toMatch(/server\/routes\/agi\.plan\.ts/i);
    expect(brief.short_answer_seed).not.toMatch(/20260220T011753Z|json\.\.\./i);
    expect(brief.evidence_digest_claims.join(" ")).not.toMatch(/20260220T011753Z|json\.\.\./i);
  });

  it("preserves uncovered objective clauses even when planner sections stay generic", () => {
    const question =
      "What is a warp bubble and how does it get a full solve like in the case of the Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "llm",
      plannerValid: true,
      plannerSource: "test",
      plannerPass: {
        goal: question,
        output_family: "mechanism_process",
        prompt_specificity: "mid",
        grounding_mode: "repo",
        objectives: [
          {
            label: "What is a warp bubble?",
            required_slots: ["definition"],
            query_hints: [],
          },
          {
            label: "How does it get a full solve like in the case of the Needle Hull Mark 2?",
            required_slots: ["mechanism", "code_path"],
            query_hints: [],
          },
        ],
        sections: [
          {
            id: "mechanism",
            title: "Mechanism Explanation",
            required: true,
            must_answer: ["Explain the mechanism."],
            required_slots: ["mechanism"],
            preferred_evidence: ["doc"],
            kind: "mechanism",
          },
          {
            id: "constraints",
            title: "Constraints",
            required: true,
            must_answer: ["List relevant constraints."],
            required_slots: ["definition"],
            preferred_evidence: ["doc"],
            kind: "repo",
          },
        ],
        required_slots: ["definition", "mechanism", "code_path"],
        query_hints: [],
        clarify_question: null,
      } as any,
    });
    expect(
      contract.obligations.some((obligation: { label: string }) =>
        /Needle Hull Mark 2|full solve/i.test(obligation.label),
      ),
    ).toBe(true);
  });

  it("adds modules to repo retrieval plan for implementation asks", () => {
    const question = "How is the warp bubble solved for in this codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    const retrievalPlan = __testHelixAskReliabilityGuards.buildHelixAskTurnRetrievalPlan(
      contract,
      constraints,
    );
    expect(contract.output_family).toBe("implementation_code_path");
    expect(retrievalPlan.must_include).toContain("modules/**");
    expect(retrievalPlan.must_include).toContain("server/**");
    expect(retrievalPlan.must_include).toContain("docs/**");
  });

  it("builds a shadow answer plan and validates equation section structure", () => {
    const question = "Explain the equation of the collapse of the wave function.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const intentContract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
      question,
      queryConstraints: constraints,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "hybrid",
      queryConstraints: constraints,
      equationPrompt: true,
      definitionFocus: false,
      equationIntentContract: intentContract,
      requiredOutputs: intentContract.required_outputs,
      selectorPrimaryKey: "docs/dp_collapse_derivation.md:L5",
      selectorLocked: true,
      selectorFamily: "collapse",
      allowedCitations: ["docs/dp_collapse_derivation.md", "server/services/mixer/collapse.ts"],
      contextFileCount: 2,
      lockIdSeed: "ask:test",
    });
    const rendered = [
      "Primary Topic: collapse",
      "",
      "Primary Equation (Verified):",
      "- [docs/dp_collapse_derivation.md:L5] tau = hbar / DeltaE",
      "",
      "Mechanism Explanation:",
      "1. Derived relation in collapse family.",
      "",
      "Sources: docs/dp_collapse_derivation.md, server/services/mixer/collapse.ts",
    ].join("\n");
    const validation = __testHelixAskReliabilityGuards.validateHelixAskAnswerPlanShadow({
      plan,
      renderedText: rendered,
    });
    expect(plan.prompt_family).toBe("equation_formalism");
    expect(plan.prompt_specificity).toBe("mid");
    expect(validation.schema_valid).toBe(true);
    expect(validation.family_format_accuracy).toBe(1);
    expect(validation.fail_reasons).toEqual([]);
  });

  it("detects anchor-integrity and debug-leak violations", () => {
    const question = "What is a warp bubble?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: ["docs/knowledge/warp/warp-bubble.md"],
      contextFileCount: 1,
      lockIdSeed: "ask:warp",
    });
    const rendered = [
      "Definition: A warp bubble is a modeled spacetime region in this repo.",
      "Why it matters: It bounds shift-field behavior.",
      "Key terms: Natario, expansion scalar.",
      "traceId=ask:abc123",
      "Sources: docs/knowledge/warp/warp-bubble.md, modules/warp/natario-warp.ts",
    ].join("\n");
    const validation = __testHelixAskReliabilityGuards.validateHelixAskAnswerPlanShadow({
      plan,
      renderedText: rendered,
    });
    expect(validation.fail_reasons).toContain("anchor_integrity_violation");
    expect(validation.fail_reasons).toContain("debug_leak");
    expect(validation.anchor_integrity_violations).toContain("modules/warp/natario-warp.ts");
    expect(validation.debug_leak_hits).toContain("trace_id_debug");
  });

  it("rejects placeholder-only obligation sections", () => {
    const question =
      "What is a warp bubble and how does it get a full solve like in the case of the Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      slotCoverageRatio: 0.5,
      slotMissing: ["code_path"],
    });
    const rendered = [
      "Direct Answer:",
      "- Plan for What is a warp bubble.",
      "",
      "How It Works:",
      "- Notes: See modules/warp/natario-warp.ts for the implementation.",
      "",
      "Sources: docs/knowledge/warp/warp-bubble.md, modules/warp/natario-warp.ts",
    ].join("\n");
    const validation = __testHelixAskReliabilityGuards.validateHelixAskAnswerPlanShadow({
      plan,
      renderedText: rendered,
    });
    expect(validation.fail_reasons).toContain("placeholder_section");
    expect(validation.placeholder_section_count).toBeGreaterThan(0);
  });

  it("accepts composer-v2 five-section contract as complete for non-equation family validation", () => {
    const question = "How is the warp bubble solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-shadow-compat",
    });
    expect(plan.prompt_family).toBe("implementation_code_path");
    const rendered = [
      "Short answer:",
      "- Warp bubble is grounded in docs and implemented in modules.",
      "",
      "Conceptual baseline:",
      "- Baseline context is separated from proof claims.",
      "",
      "How repo solves it:",
      "- Runtime solve path is implemented in modules/warp/warp-module.ts and modules/warp/natario-warp.ts.",
      "",
      "Evidence + proof anchors:",
      "- Anchor: docs/knowledge/warp/warp-bubble.md",
      "",
      "Uncertainty / open gaps:",
      "- Some lower-level derivation details remain open. (uncertainty: partial evidence window)",
      "",
      "Sources: docs/knowledge/warp/warp-bubble.md, modules/warp/warp-module.ts, modules/warp/natario-warp.ts",
    ].join("\n");
    const validation = __testHelixAskReliabilityGuards.validateHelixAskAnswerPlanShadow({
      plan,
      renderedText: rendered,
    });
    expect(validation.fail_reasons).not.toContain("required_sections_missing");
    expect(validation.family_format_accuracy).toBe(1);
  });

  it("builds deterministic family degrade output for mechanism prompts", () => {
    const question = "How does the collapse benchmark pipeline work in this codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: ["server/services/mixer/collapse.ts"],
      contextFileCount: 1,
      lockIdSeed: "ask:mechanism",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText: "Collapse benchmark flow computes strategy outputs from bounded evidence.",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("mechanism_process");
    expect(degraded).toMatch(/^Mechanism Explanation:/m);
    expect(degraded).toMatch(/^Inputs\/Outputs:/m);
    expect(degraded).toMatch(/^Constraints:/m);
    expect(degraded).toMatch(/^Sources:/m);
  });

  it("suppresses code-snippet leakage in mechanism degrade output", () => {
    const question = "How do we solve for the warp bubble in the code base. Like Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:mechanism-code-snippet",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText:
        "; const resolveAlcubierreWallThickness = (params: NatarioWarpParams, R: number, sigma?: number) => const wall = (params.warpGeometry as any)?.wallThickness_m ??",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("mechanism_process");
    expect(degraded).toMatch(/^(?:Direct Answer|Mechanism Explanation):/m);
    expect(degraded).toMatch(/grounded|warp-bubble|Needle Hull Mark 2/i);
    expect(degraded).not.toMatch(/resolveAlcubierreWallThickness/i);
    expect(degraded).not.toMatch(/\bparams:\s*NatarioWarpParams/i);
  });

  it("suppresses numeric stub mechanism sentence and uses deterministic fallback", () => {
    const question = "How do we solve for the warp bubble in the code base. Like Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:mechanism-numeric-stub",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText: "1.",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("mechanism_process");
    expect(degraded).toMatch(/^(?:Direct Answer|Mechanism Explanation):/m);
    expect(degraded).toMatch(/grounded|warp-bubble|Needle Hull Mark 2/i);
    expect(degraded).not.toMatch(/^1\.\s*1\./m);
  });

  it("suppresses citation-only mechanism sentence and uses deterministic fallback", () => {
    const question = "How do we solve for the warp bubble in the code base. Like Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:mechanism-citation-stub",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText: "1. [docs/knowledge/warp/warp-bubble.md] 1. [docs/knowledge/warp/warp-bubble.md]",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("mechanism_process");
    expect(degraded).toMatch(/^(?:Direct Answer|Mechanism Explanation):/m);
    expect(degraded).toMatch(/grounded|warp-bubble|Needle Hull Mark 2/i);
    expect(degraded).not.toMatch(/^\s*1\.\s*\[docs\/knowledge\/warp\/warp-bubble\.md\]/im);
  });

  it("suppresses markdown section-fragment mechanism sentence and uses deterministic fallback", () => {
    const question = "How do we solve for the warp bubble in the code base. Like Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:mechanism-section-fragment",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText: "## Inputs - Base tree JSON files (with inline congruence metadata).",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("mechanism_process");
    expect(degraded).toMatch(/^(?:Direct Answer|Mechanism Explanation):/m);
    expect(degraded).toMatch(/grounded|warp-bubble|Needle Hull Mark 2/i);
    expect(degraded).not.toMatch(/## Inputs - Base tree JSON files/i);
  });

  it("suppresses internal scaffold/reason leakage in definition degrade output", () => {
    const question = "What is a warp bubble and how is it solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: ["docs/knowledge/warp/warp-bubble.md"],
      contextFileCount: 1,
      lockIdSeed: "ask:warp-definition",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText:
        "Confirmed: Retrieved grounded repository anchors: modules/warp/natario-warp.ts, docs/knowledge/warp/warp-bubble.md. Reasoned connections (bounded): Bounded linkage supported by cited repo evidence. Next evidence: search docs headings.",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("definition_overview");
    expect(degraded).toMatch(/^Definition:/m);
    expect(degraded).toMatch(/^(?:How it is solved in codebase|Repo anchors):/m);
    expect(degraded).toMatch(/^(?:Why it matters|Open Gaps):/m);
    expect(degraded).toMatch(/^Sources:/m);
    expect(degraded).toMatch(/Current evidence is incomplete/i);
    expect(degraded).not.toMatch(/required sections missing/i);
    expect(degraded).not.toMatch(/degrade path/i);
    expect(degraded).not.toMatch(/prompt=/i);
    expect(degraded).not.toMatch(/retrieved grounded repository anchors/i);
    const validation = __testHelixAskReliabilityGuards.validateHelixAskAnswerPlanShadow({
      plan,
      renderedText: degraded,
    });
    expect(validation.fail_reasons).not.toContain("required_sections_missing");
    expect(validation.family_format_accuracy).toBe(1);
  });

  it("routes definition-plus-relation repo-anchor prompts to mechanism family", () => {
    const question = "What is Needle Hull Mark 2 and how does it relate to Mercury precession?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: [],
      contextFileCount: 0,
      lockIdSeed: "ask:definition-relation-repo-anchor",
    });
    expect(plan.prompt_family).toBe("mechanism_process");
  });

  it("replaces low-signal bounded-linkage definition sentence with deterministic summary", () => {
    const question = "What is a warp bubble and how is it solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:warp-definition-low-signal",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText:
        "In practical terms, Bounded linkage supported by cited repo evidence (modules/warp/natario-warp.ts and docs/warp-console-architecture.md).",
      reason: "required_sections_missing",
    });
    expect(degraded).toMatch(/^Definition:/m);
    expect(degraded).toMatch(/In this codebase, warp bubble is grounded in/i);
    expect(degraded).not.toMatch(/Bounded linkage supported by cited repo evidence/i);
  });

  it("adds role-aware code-path bullets in definition degrade output", () => {
    const question = "What is a warp bubble and how is it solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:warp-definition-role-aware",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText:
        "In practical terms, Bounded linkage supported by cited repo evidence (modules/warp/natario-warp.ts and docs/warp-console-architecture.md).",
      reason: "required_sections_missing",
    });
    expect(degraded).toMatch(/^(?:How it is solved in codebase|Repo anchors):/m);
    expect(degraded).toMatch(/modules\/warp\/natario-warp\.ts/i);
    expect(degraded).toMatch(/modules\/warp\/warp-module\.ts/i);
    expect(degraded).not.toMatch(/This response preserves grounded evidence/i);
  });

  it("filters next-step checked-files scaffold from definition sentence", () => {
    const question = "What is a warp bubble and how is it solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:warp-definition-next-step",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText:
        "Next step: Checked files: modules/warp/natario-warp.ts, docs/warp-console-architecture.md, docs/knowledge/warp/warp-bubble.md, modules/warp/warp-module.ts.",
      reason: "required_sections_missing",
    });
    expect(degraded).toMatch(/^Definition:/m);
    expect(degraded).toMatch(/In this codebase, warp bubble is grounded in/i);
    expect(degraded).not.toMatch(/Next step:\s*Checked files:/i);
  });

  it("suppresses mojibake/jsdoc fragments in general-overview degrade output", () => {
    const question = "We solve for the warp bubble in the code base.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:warp-general-overview",
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText:
        "/** * NatÃ¡rio Zero-Expansion Warp Bubble Implementation * Based on \"Needle Hull\" and \"Geometry-Amplified Dynamic Casimir Effect\" papers * Implements sector-strobed Casimir lattice for warp field generation.",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("general_overview");
    expect(degraded).toMatch(/^Summary:/m);
    expect(degraded).toMatch(/^Evidence:/m);
    expect(degraded).toMatch(/This repo-grounded summary is anchored in/i);
    expect(degraded).not.toMatch(/\/\*\*/);
    expect(degraded).not.toMatch(/NatÃ/i);
    expect(degraded).not.toMatch(/Based on .* papers/i);
  });

  it("builds partial-roadmap degrade output for roadmap planning prompts", () => {
    const question =
      "Organize my Helix Ask future plans for profiles, paywall, voice lane, translation, and retrieval upgrades.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "heuristic_bootstrap",
    });
    const support = __testHelixAskReliabilityGuards.buildHelixAskTurnContractObjectiveSupport({
      contract,
      coveredSlots: ["repo-mapping", "implementation-touchpoints", "voice-lane"],
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/helix-ask-flow.md",
        "server/routes/agi.plan.ts",
        "client/src/components/HelixSettingsDialogContent.tsx",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:roadmap-planning",
      turnContract: contract,
      slotCoverageRatio: 0.5,
      slotMissing: ["billing-credits", "transcription-translation"],
      connectedHintPathCount: 1,
      retrievalConfidence: 0.42,
      evidenceGap: true,
      objectiveSupport: support,
    });
    const degraded = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText: "Repo-grounded summary prepared from current in-family evidence.",
      reason: "required_sections_missing",
    });
    expect(plan.prompt_family).toBe("roadmap_planning");
    expect(__testHelixAskReliabilityGuards.shouldApplyHelixAskComposerV2ForPlan(plan)).toBe(false);
    expect(degraded).toMatch(/^Repo-Grounded Findings:/m);
    expect(degraded).toMatch(/^Implementation Roadmap:/m);
    expect(degraded).toMatch(/^Evidence Gaps:/m);
    expect(degraded).toMatch(/^Next Anchors Needed:/m);
    expect(degraded).toMatch(/^Sources:/m);
    const validation = __testHelixAskReliabilityGuards.validateHelixAskAnswerPlanShadow({
      plan,
      renderedText: degraded,
    });
    expect(validation.fail_reasons).not.toContain("required_sections_missing");
    expect(validation.family_format_accuracy).toBe(1);
  });

  it("runs composer v2 for required-sections and hard-guard soft reasons", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldRunHelixAskComposerV2ForSoftReason(
        true,
        "required_sections_missing",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldRunHelixAskComposerV2ForSoftReason(
        true,
        "composer_hard_guard",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldRunHelixAskComposerV2ForSoftReason(
        false,
        "required_sections_missing",
      ),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldRunHelixAskComposerV2ForSoftReason(
        true,
        "other_reason",
      ),
    ).toBe(false);
  });

  it("uses citation snippet fallback in composer v2 brief when canonical evidence is thin", () => {
    const question = "How do we solve for the warp bubble in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-citation-snippet-fallback",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText:
        "Context sources\nmodules/warp/natario-warp.ts\ndocs/knowledge/warp/warp-bubble.md",
      evidenceText: "",
      envelope,
    });
    expect(brief.evidence_handoff_blocks.length).toBeGreaterThanOrEqual(2);
    expect(
      brief.evidence_handoff_source === "citation_snippets" ||
        brief.evidence_handoff_source === "evidence_text_plus_citation_snippets" ||
        brief.evidence_handoff_source === "evidence_text",
    ).toBe(true);
    expect(brief.evidence_digest_source).toBe("citation_snippet_fallback");
    const handoffText = brief.evidence_handoff_blocks.join(" ");
    expect(handoffText).toMatch(/warp-bubble|natario-warp|warp/i);
  });

  it("prefers topic-relevant warp anchors over generic UI paths in deterministic grounded brief", () => {
    const question = "How is the warp bubble solved for in this codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "server/energy-pipeline.ts",
        "docs/alcubierre-alignment.md",
        "client/src/lib/docs/docViewer.ts",
        "modules/warp/natario-warp.ts",
        "docs/knowledge/warp/warp-bubble.md",
      ],
      contextFileCount: 5,
      lockIdSeed: "ask:composer-v2-warp-anchor-priority",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      evidenceText: "",
      envelope,
    });
    expect(brief.short_answer_seed).toContain("modules/warp/natario-warp.ts");
    expect(brief.short_answer_seed).not.toContain("client/src/lib/docs/docViewer.ts");
    expect(brief.short_answer_seed).not.toMatch(/\bwarp bubble for\b/i);
  });

  it("renders family-specific implementation fallback instead of five-section shell when composer degrades", () => {
    const question = "Find me the warp bubble solutions for the needle hull mark 2 solve?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/natario-zero-expansion.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
        "scripts/warp-full-solve-single-runner.ts",
        "shared/hull-basis.ts",
      ],
      contextFileCount: 5,
      lockIdSeed: "ask:composer-v2-implementation-family-fallback",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText:
        "modules/warp/natario-warp.ts computes Natario warp-bubble fields and congruence diagnostics. modules/warp/warp-module.ts orchestrates warp module flow and runtime solve wiring.",
      evidenceText:
        "docs/knowledge/warp/natario-zero-expansion.md documents the zero-expansion / needle-hull theory anchor for this solve family.\nmodules/warp/natario-warp.ts computes Natario warp-bubble fields and congruence diagnostics.\nmodules/warp/warp-module.ts orchestrates warp module flow and runtime solve wiring.\nscripts/warp-full-solve-single-runner.ts runs the full-solve campaign around the core warp module.",
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2DeterministicFallbackAnswer({
      plan,
      question,
      brief,
      existingText: brief.evidence_handoff_blocks.join("\n"),
      reason: "llm_unavailable:test",
      verbosity: "normal",
    });
    expect(rendered).toMatch(/^Where in repo:/m);
    expect(rendered).toMatch(/^Call chain:/m);
    expect(rendered).toMatch(/^What to change safely:/m);
    expect(rendered).toMatch(/modules\/warp\/natario-warp\.ts:\s+computes Natario warp-bubble fields and congruence diagnostics\./i);
    expect(rendered).toMatch(/docs\/knowledge\/warp\/natario-zero-expansion\.md/i);
    expect(rendered).not.toMatch(/^Short answer:/m);
  });

  it("keeps composer-v2 deterministic fallback conversational when natural surface is preferred", () => {
    const question =
      "The text proves the regime is mild by looking at the norm of the shift vector. Why is this important to the solve it belongs to?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/shift-vector-expansion-scalar.md",
        "docs/knowledge/warp/natario-zero-expansion.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFileCount: 4,
      lockIdSeed: "ask:composer-v2-natural-surface-fallback",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText:
        "The mild-shift regime matters because it keeps the shift contribution small enough that the solver stays in the intended reduced-order branch while the Natario warp solve remains numerically well behaved.",
      evidenceText:
        "docs/knowledge/warp/shift-vector-expansion-scalar.md explains that the norm of the shift vector is used as the regime check for whether the expansion remains mild.\nWhen that norm stays mild, the solve can stay in the reduced-order branch instead of escalating into a stronger nonlinear regime.\nmodules/warp/natario-warp.ts computes Natario warp-bubble fields and congruence diagnostics.\nmodules/warp/warp-module.ts orchestrates warp module flow and runtime solve wiring.",
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2DeterministicFallbackAnswer({
      plan,
      question,
      brief,
      existingText:
        "The mild-shift regime matters because it keeps the shift contribution small enough that the solver stays in the intended reduced-order branch while the Natario warp solve remains numerically well behaved.",
      reason: "required_sections_missing:test",
      verbosity: "normal",
      preferNaturalSurface: true,
    });
    expect(rendered).not.toMatch(/^Where in repo:/m);
    expect(rendered).not.toMatch(/^Call chain:/m);
    expect(rendered).not.toMatch(/^Sources:/m);
    expect(rendered).not.toMatch(/grounded in/i);
    expect(rendered).not.toMatch(/anchored in/i);
    expect(rendered).not.toMatch(/Primary implementation anchors/i);
    expect(rendered).not.toMatch(/Current evidence is incomplete/i);
    expect(rendered).not.toMatch(/Remaining gap: missing/i);
    expect(rendered).toMatch(/mild-shift regime matters/i);
    expect(rendered).toMatch(/reduced-order branch|numerically well behaved/i);
  });

  it("rejects repo_grounded and reasoned_inference claims when citations are missing", () => {
    const question = "How does the warp pipeline work in this codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-missing-citations",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Mechanism is grounded in docs/knowledge/warp/warp-bubble.md.",
      envelope,
    });
    const raw = JSON.stringify({
      claims: [
        { section: "short_answer", class: "repo_grounded", text: "Repo uses Natario flow." },
        { section: "conceptual_baseline", class: "baseline_common", text: "Conceptual baseline of shift-field control." },
        { section: "how_repo_solves_it", class: "repo_grounded", text: "Solver runs through module wiring." },
        { section: "evidence_proof_anchors", class: "reasoned_inference", text: "Evidence likely supports this.", uncertainty_marker: "likely" },
        { section: "uncertainty_open_gaps", class: "reasoned_inference", text: "Some details may be incomplete.", uncertainty_marker: "incomplete anchors" },
      ],
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: raw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(false);
    expect(materialized.post_link_fail_reasons).toContain("grounded_claim_missing_citations");
  });

  it("rejects baseline_common claims outside Conceptual baseline section", () => {
    const question = "Explain the warp bubble mechanism.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: ["docs/knowledge/warp/warp-bubble.md", "modules/warp/natario-warp.ts"],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-baseline-lane",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp bubble is modeled in docs/knowledge/warp/warp-bubble.md.",
      envelope,
    });
    const raw = JSON.stringify({
      claims: [
        { section: "short_answer", class: "baseline_common", text: "General baseline incorrectly placed." },
        { section: "conceptual_baseline", class: "baseline_common", text: "Conceptual lane is valid here." },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repo path resolves in natario module.",
          citations: ["modules/warp/natario-warp.ts"],
        },
        {
          section: "evidence_proof_anchors",
          class: "repo_grounded",
          text: "Primary anchor in docs.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some model assumptions may remain unresolved.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "may remain unresolved",
        },
      ],
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: raw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(false);
    expect(materialized.post_link_fail_reasons).toContain("baseline_common_outside_conceptual_baseline");
  });

  it("renders fixed 5-section contract for valid non-equation composer v2 output", () => {
    const question = "How do we solve for the warp bubble in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-fixed-sections",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp bubble solve path is grounded in docs and module implementations.",
      envelope,
    });
    const raw = JSON.stringify({
      claims: [
        {
          section: "short_answer",
          class: "repo_grounded",
          text: "The repository solves warp flow through Natario module orchestration.",
          citations: ["modules/warp/warp-module.ts"],
        },
        {
          section: "conceptual_baseline",
          class: "baseline_common",
          text: "Conceptually this separates model assumptions from implementation checkpoints.",
        },
        {
          section: "conceptual_baseline",
          class: "baseline_common",
          text: "Baseline context stays uncited to avoid mixing proof and framing.",
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Core calculations execute in Natario warp routines.",
          citations: ["modules/warp/natario-warp.ts"],
        },
        {
          section: "evidence_proof_anchors",
          class: "repo_grounded",
          text: "Definition and constraints are anchored in warp knowledge docs.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some derivation details may require line-level anchors.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "may require line-level anchors",
        },
      ],
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: raw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(true);
    expect(materialized.rendered_text).toMatch(/^Short answer:/m);
    expect(materialized.rendered_text).toMatch(/^Conceptual baseline:/m);
    expect(materialized.rendered_text).toMatch(/^How repo solves it:/m);
    expect(materialized.rendered_text).toMatch(/^Evidence \+ proof anchors:/m);
    expect(materialized.rendered_text).toMatch(/^Uncertainty \/ open gaps:/m);
    expect(materialized.rendered_text).toMatch(/^Sources:/m);
  });

  it("renders deterministic 5-section shape when composer v2 claims are empty", () => {
    const question = "What is a warp bubble and how is it solved in this repo?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-deterministic-fallback-shape",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp bubble implementation is grounded in docs and modules.",
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2FiveSectionAnswer({
      claims: [],
      brief,
      verbosity: "normal",
    });
    expect(rendered).toMatch(/^Short answer:/m);
    expect(rendered).toMatch(/^Conceptual baseline:/m);
    expect(rendered).toMatch(/^How repo solves it:/m);
    expect(rendered).toMatch(/^Evidence \+ proof anchors:/m);
    expect(rendered).toMatch(/^Uncertainty \/ open gaps:/m);
    expect(rendered).toMatch(/^Sources:/m);
  });

  it("accepts fenced JSON composer v2 payloads with wrapper text", () => {
    const question = "How is warp solved in this repo?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-fenced-json",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp solve is anchored in docs and module code.",
      envelope,
    });
    const fencedRaw = [
      "Here is the strict JSON payload:",
      "```json",
      JSON.stringify({
        claims: [
          {
            section: "short_answer",
            class: "repo_grounded",
            text: "Warp solve is grounded in repo modules.",
            citations: ["modules/warp/natario-warp.ts"],
          },
          {
            section: "conceptual_baseline",
            class: "baseline_common",
            text: "Baseline context remains uncited conceptual framing.",
          },
          {
            section: "how_repo_solves_it",
            class: "repo_grounded",
            text: "Natario module computes the main solve path.",
            citations: ["modules/warp/natario-warp.ts"],
          },
          {
            section: "evidence_proof_anchors",
            class: "repo_grounded",
            text: "Definition anchor is present in warp bubble docs.",
            citations: ["docs/knowledge/warp/warp-bubble.md"],
          },
          {
            section: "uncertainty_open_gaps",
            class: "reasoned_inference",
            text: "Line-level detail may still require narrower anchors.",
            citations: ["docs/knowledge/warp/warp-bubble.md"],
            uncertainty_marker: "may require narrower anchors",
          },
        ],
      }),
      "```",
    ].join("\n");
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: fencedRaw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(true);
    expect(materialized.rendered_text).toMatch(/^How repo solves it:/m);
  });

  it("coerces aliased claim structures into valid composer v2 payloads", () => {
    const question = "Explain warp mechanism in repo terms.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-coerce-alias",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp mechanism is anchored in docs and module code.",
      envelope,
    });
    const aliasedRaw = JSON.stringify({
      data: {
        claims: [
          {
            heading: "Short answer",
            kind: "grounded",
            content: "Warp mechanism is implemented in natario module.",
            sources: ["modules/warp/natario-warp.ts"],
          },
          {
            heading: "Conceptual baseline",
            kind: "baseline",
            content: "Conceptual framing remains separate from strict repo proof.",
          },
          {
            heading: "How repo solves it",
            kind: "grounded",
            content: "Core solve path is executed in modules/warp/natario-warp.ts.",
          },
          {
            heading: "Evidence + proof anchors",
            kind: "grounded",
            content: "Anchor docs include docs/knowledge/warp/warp-bubble.md.",
          },
          {
            heading: "Uncertainty / open gaps",
            kind: "inference",
            content: "Some assumptions may remain unresolved.",
            uncertainty: "may remain unresolved",
            sources: ["docs/knowledge/warp/warp-bubble.md"],
          },
        ],
      },
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: aliasedRaw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(true);
    expect(materialized.pre_link_fail_reasons).toContain("schema_coerced");
    expect(materialized.rendered_text).toMatch(/^Evidence \+ proof anchors:/m);
  });

  it("projects sectioned plaintext into composer v2 claims when JSON parsing fails", () => {
    const question = "How does the warp solve path work?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-plaintext-projection",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp solve path is grounded in repo evidence.",
      envelope,
    });
    const plaintextRaw = [
      "Short answer:",
      "- Warp solve path is implemented in modules/warp/natario-warp.ts",
      "",
      "Conceptual baseline:",
      "- Conceptually this separates baseline context from proof claims.",
      "",
      "How repo solves it:",
      "- Runtime solve wiring uses modules/warp/natario-warp.ts and docs/knowledge/warp/warp-bubble.md",
      "",
      "Evidence + proof anchors:",
      "- docs/knowledge/warp/warp-bubble.md",
      "",
      "Uncertainty / open gaps:",
      "- Some derivation details may remain incomplete in this turn.",
    ].join("\n");
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: plaintextRaw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(true);
    expect(materialized.pre_link_fail_reasons).toContain("plaintext_projection");
    expect(materialized.rendered_text).toMatch(/^Uncertainty \/ open gaps:/m);
  });

  it("filters low-signal composer v2 seed sentences for projection recovery", () => {
    expect(
      __testHelixAskReliabilityGuards.isLowSignalHelixAskComposerV2SeedSentence(
        "Notes: See modules/warp/warp-module.ts and modules/warp/natario-warp.ts for the implementation.",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isLowSignalHelixAskComposerV2SeedSentence(
        "; const resolveAlcubierreWallThickness = (params: NatarioWarpParams, R: number, sigma?: number) => const wall = (params.warpGeometry as any)?.wallThickness_m ??",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isLowSignalHelixAskComposerV2SeedSentence(
        "Evidence is limited in current retrieval; claims are bounded to available artifacts and may be incomplete.",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isLowSignalHelixAskComposerV2SeedSentence(
        "Convergence snapshot unknown unknown diagnostic debrief unknown -> unknown -> -10.1%",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isLowSignalHelixAskComposerV2SeedSentence(
        "Capsule guards Dialogue: 0 | Evidence: 0 Focus: pass | Anchor: pass Retry: not applied (not_needed)",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isLowSignalHelixAskComposerV2SeedSentence(
        "20260220T011753Z 20260220T011753Z.json...",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isLowSignalHelixAskComposerV2SeedSentence(
        "In this repository, warp bubble is grounded in docs/knowledge/warp/warp-bubble.md and implemented through modules/warp/natario-warp.ts.",
      ),
    ).toBe(false);
  });

  it("drops scaffold placeholders instead of rewriting them into bounded-uncertainty lines for structured deterministic answers", () => {
    const rewritten = __testHelixAskReliabilityGuards.rewriteUnsupportedScaffoldToBoundedUncertainty(
      [
        "Direct Answer:",
        "",
        "Answer grounded in retrieved evidence.",
        "",
        "Where in repo:",
        "- server/routes/agi.plan.ts",
      ].join("\n"),
    );
    expect(rewritten).toMatch(/^Direct Answer:/m);
    expect(rewritten).toMatch(/^Where in repo:/m);
    expect(rewritten).not.toMatch(/Answer grounded in retrieved evidence/i);
    expect(rewritten).not.toMatch(/Evidence is limited in current retrieval/i);
  });

  it("flags retrieval-healthy projection fallback as composer regression", () => {
    const regression = __testHelixAskReliabilityGuards.evaluateHelixAskComposerV2ProjectionRegression({
      promptFamily: "recommendation_decision",
      composerApplied: true,
      composerBestAttemptStage: "projection",
      composerFallbackReason: "observe_projection",
      stage05Used: true,
      stage05CardCount: 8,
      stage05SummaryHardFail: false,
      stage05FallbackReason: null,
      slotCoverageRatio: 1,
      slotCoverageMissing: [],
      llmInvokeAttempted: true,
      llmProviderCalled: true,
      llmHttpStatus: 200,
      llmErrorCode: null,
    });
    expect(regression.triggered).toBe(true);
    expect(regression.hard).toBe(true);
    expect(regression.mode).toBe("projection");
    expect(regression.retrieval_healthy).toBe(true);
    expect(regression.llm_healthy).toBe(true);
  });

  it("does not flag projection regression when stage05 slot coverage is incomplete", () => {
    const regression = __testHelixAskReliabilityGuards.evaluateHelixAskComposerV2ProjectionRegression({
      promptFamily: "recommendation_decision",
      composerApplied: true,
      composerBestAttemptStage: "projection",
      composerFallbackReason: "observe_projection",
      stage05Used: true,
      stage05CardCount: 8,
      stage05SummaryHardFail: false,
      stage05FallbackReason: null,
      slotCoverageRatio: 0.75,
      slotCoverageMissing: ["code_path"],
      llmInvokeAttempted: true,
      llmProviderCalled: true,
      llmHttpStatus: 200,
      llmErrorCode: null,
    });
    expect(regression.triggered).toBe(false);
    expect(regression.retrieval_healthy).toBe(false);
  });

  it("does not flag projection regression when retrieval confidence is below guard threshold", () => {
    const regression = __testHelixAskReliabilityGuards.evaluateHelixAskComposerV2ProjectionRegression({
      promptFamily: "recommendation_decision",
      composerApplied: true,
      composerBestAttemptStage: "projection",
      composerFallbackReason: "observe_projection",
      stage05Used: true,
      stage05CardCount: 8,
      stage05SummaryHardFail: false,
      stage05FallbackReason: null,
      slotCoverageRatio: 1,
      slotCoverageMissing: [],
      llmInvokeAttempted: true,
      llmProviderCalled: true,
      llmHttpStatus: 200,
      llmErrorCode: null,
      retrievalConfidence: 0.93,
    });
    expect(regression.triggered).toBe(false);
    expect(regression.retrieval_healthy).toBe(false);
    expect(regression.reasons).toContain("retrieval_confidence_low");
  });

  it("does not flag projection regression when stage05 is budget-capped with weak connectivity", () => {
    const regression = __testHelixAskReliabilityGuards.evaluateHelixAskComposerV2ProjectionRegression({
      promptFamily: "recommendation_decision",
      composerApplied: true,
      composerBestAttemptStage: "projection",
      composerFallbackReason: "observe_projection",
      stage05Used: true,
      stage05CardCount: 8,
      stage05SummaryHardFail: false,
      stage05FallbackReason: null,
      slotCoverageRatio: 1,
      slotCoverageMissing: [],
      llmInvokeAttempted: true,
      llmProviderCalled: true,
      llmHttpStatus: 200,
      llmErrorCode: null,
      retrievalConfidence: 1,
      stage05BudgetCapped: true,
      stage05ConnectivityAddedCount: 1,
    });
    expect(regression.triggered).toBe(false);
    expect(regression.retrieval_healthy).toBe(false);
    expect(regression.reasons).toContain("stage05_connectivity_low_when_capped");
  });

  it("flags projection regression with transport-degraded llm as non-hard", () => {
    const regression = __testHelixAskReliabilityGuards.evaluateHelixAskComposerV2ProjectionRegression({
      promptFamily: "recommendation_decision",
      composerApplied: true,
      composerBestAttemptStage: "projection",
      composerFallbackReason: "observe_projection",
      stage05Used: true,
      stage05CardCount: 8,
      stage05SummaryHardFail: false,
      stage05FallbackReason: null,
      slotCoverageRatio: 1,
      slotCoverageMissing: [],
      llmInvokeAttempted: true,
      llmProviderCalled: true,
      llmHttpStatus: 429,
      llmErrorCode: "llm_http_429",
      retrievalConfidence: 1,
      stage05BudgetCapped: false,
    });
    expect(regression.triggered).toBe(true);
    expect(regression.hard).toBe(false);
    expect(regression.llm_healthy).toBe(false);
  });

  it("linker rejects composer v2 code-noise and single-char spill claims", () => {
    const question = "How is the warp bubble solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-linker-spill-guard",
    });
    const linked = __testHelixAskReliabilityGuards.linkHelixAskComposerV2Claims({
      expansion: {
        claims: [
          {
            section: "short_answer",
            class: "repo_grounded",
            text: "const resolveAlcubierreWallThickness = (params: NatarioWarpParams, R: number, sigma?: number) => const wall = (params.warpGeometry as any)?.wallThickness_m ??",
            citations: ["modules/warp/natario-warp.ts"],
          },
          {
            section: "how_repo_solves_it",
            class: "repo_grounded",
            text: "c o n s t r a i n e d i n t e r a c t i o n d y n a m i c s m e c h a n i s m",
            citations: ["modules/warp/warp-module.ts"],
          },
          {
            section: "conceptual_baseline",
            class: "baseline_common",
            text: "Conceptual baseline separates framing from repo-proof claims.",
          },
          {
            section: "evidence_proof_anchors",
            class: "repo_grounded",
            text: "Primary anchor: docs/knowledge/warp/warp-bubble.md",
            citations: ["docs/knowledge/warp/warp-bubble.md"],
          },
          {
            section: "uncertainty_open_gaps",
            class: "reasoned_inference",
            text: "Some derivation details may remain open in this turn.",
            citations: ["docs/knowledge/warp/warp-bubble.md"],
            uncertainty_marker: "partial evidence window",
          },
        ],
      },
      allowedCitations: plan.evidence_pack.allowed_citations,
      allowCitationFallback: true,
    });
    expect(linked.ok).toBe(false);
    expect(linked.failReasons).toContain("claim_code_noise");
    expect(linked.failReasons).toContain("claim_single_char_spill");
  });

  it("projection recovery prefers grounded brief short-answer seed over code-like existing text", () => {
    const question = "How do we solve for the warp bubble in the code base. Like Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-projection-seed-filter",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      envelope,
    });
    const projectedClaims =
      __testHelixAskReliabilityGuards.buildHelixAskComposerV2DeterministicProjectionClaims({
        brief,
        existingText:
          "; const resolveAlcubierreWallThickness = (params: NatarioWarpParams, R: number, sigma?: number) => const wall = (params.warpGeometry as any)?.wallThickness_m ??",
        allowedCitations: plan.evidence_pack.allowed_citations,
      });
    const shortAnswerClaim = projectedClaims.find((claim) => claim.section === "short_answer");
    expect(shortAnswerClaim?.text ?? "").toMatch(
      /^(?:In this repository,|Primary anchor in this turn is |Anchor:\s+|docs\/|modules\/)/i,
    );
    expect(shortAnswerClaim?.text ?? "").not.toMatch(/resolveAlcubierreWallThickness/i);
    expect(shortAnswerClaim?.text ?? "").not.toMatch(/Evidence is limited in current retrieval/i);
  });

  it("builds composer v2 brief evidence digest from canonical evidence text", () => {
    const question = "How do we solve the warp bubble in this repo?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-evidence-digest",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      evidenceText:
        "Needle Hull Mark 2 solve path is computed in modules/warp/natario-warp.ts and orchestrated in modules/warp/warp-module.ts. The model constraints are documented in docs/knowledge/warp/warp-bubble.md.",
      envelope,
    });
    expect(brief.evidence_digest_source).toBe("canonical_evidence");
    expect(brief.evidence_digest_claims.length).toBeGreaterThan(0);
    expect(brief.evidence_digest_claims.join(" ")).toMatch(/Needle Hull Mark 2|modules\/warp\/natario-warp\.ts/i);
    expect(brief.evidence_handoff_blocks.length).toBeGreaterThan(0);
    expect(brief.evidence_handoff_chars).toBeGreaterThan(0);
  });

  it("filters live-style scaffold noise from composer v2 retrieval handoff blocks", () => {
    const question = "How do we solve for the warp bubble in the code base. Like Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-handoff-noise-filter",
    });
    const noisyEvidence = [
      "Mechanism is grounded in docs/knowledge/warp/warp-bubble.md and executed through modules/warp/warp-module.ts and modules/warp/natario-warp.ts.",
      "Evidence: Doc: warp bubble Heading: Overview --- id: warp-bubble aliases: [\"warp bubble\", \"warp field bubble\"] scope: repo-specific definition of a warp bubble model intentHints: [\"define\", \"what is\", \"explain\"] topicTags: [\"warp\", \"physics\"] mustIncludeFiles: [\"modules/warp/warp-module.ts\"] (see docs/knowledge/warp/warp-bubble.md)",
      "",
      "Tree Walk",
      "Chain scaffold: root_to_leaf | continuity: fallback FAIL_NODE_MISSING_EQUATION_REF",
      "1. Role:anchor: Warp Mechanics Tree - A walkable map of warp geometry, proxies, and control levers. (docs/knowledge/warp/warp-mechanics-tree.json)",
      "",
      "Reasoning event log",
      "[07:53:13.869] tool=event | seq=30 | dur=0ms | text=Helix Ask: Coverage slots - ok",
      "[07:53:14.791] tool=event | seq=46 | dur=0ms | text=Helix Ask: LLM answer - start",
      "",
      "Convergence snapshot",
      "unknown",
      "unknown",
      "diagnostic",
      "debrief",
      "",
      "Context sources",
      "modules/warp/natario-warp.ts",
      "docs/knowledge/warp/warp-bubble.md",
    ].join("\n");
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      evidenceText: noisyEvidence,
      envelope,
    });
    const handoffJoined = brief.evidence_handoff_blocks.join(" ");
    expect(handoffJoined).toMatch(/modules\/warp\/natario-warp\.ts|docs\/knowledge\/warp\/warp-bubble\.md/i);
    expect(handoffJoined).not.toMatch(/aliases:\s*\[|mustIncludeFiles:/i);
    expect(handoffJoined).not.toMatch(/Tree Walk|Reasoning event log|Convergence snapshot|Context sources/i);
    expect(handoffJoined).not.toMatch(/\[\d{2}:\d{2}:\d{2}\.\d+\]\s+tool=/i);
  });

  it("keeps composer v2 handoff untruncated for moderate multi-block evidence", () => {
    const question = "How does the warp solve path work?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-handoff-not-truncated",
    });
    const evidenceText = [
      "Needle Hull Mark 2 solve path is computed in modules/warp/natario-warp.ts with implementation orchestration in modules/warp/warp-module.ts.",
      "",
      "Model constraints and guardrail expectations are documented in docs/knowledge/warp/warp-bubble.md and cross-checked against runtime behavior.",
      "",
      "The repository pipeline keeps claims bounded to anchored files while exposing open gaps explicitly when derivation details are partial.",
    ].join("\n");
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      evidenceText,
      envelope,
    });
    expect(brief.evidence_handoff_blocks.length).toBeGreaterThanOrEqual(2);
    expect(brief.evidence_handoff_truncated).toBe(false);
    expect(brief.evidence_handoff_chars).toBeGreaterThan(160);
  });

  it("includes evidence digest claims in composer v2 expand prompt", () => {
    const question = "How do we solve the warp bubble in this repo?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-expand-digest",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      evidenceText:
        "Primary solve path executes in modules/warp/natario-warp.ts while assumptions are documented in docs/knowledge/warp/warp-bubble.md.",
      envelope,
    });
    const prompt = __testHelixAskReliabilityGuards.buildHelixAskComposerV2ExpandPrompt({
      plan,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(prompt).toMatch(/evidence_digest_claims:/i);
    expect(prompt).toMatch(/evidence_handoff_blocks/i);
    expect(prompt).toMatch(/modules\/warp\/natario-warp\.ts/i);
    expect(prompt).toMatch(/Visible answer format plan:/i);
  });

  it("builds prompt-shaped answer-plan sections from planner format guidance", () => {
    const question = "How is the warp bubble traditionally solved and what is the needle hull mark 2 improvement?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const turnContract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
      plannerMode: "llm",
      plannerValid: true,
      plannerSource: "unit_test",
      plannerPass: {
        goal: "Explain the traditional warp solve and the Needle Hull Mark 2 improvement in repo terms.",
        grounding_mode: "repo",
        output_family: "mechanism_process",
        verbosity: "extended",
        objectives: [
          { label: "Explain the traditional warp-bubble solve path.", required_slots: ["definition", "mechanism"] },
          { label: "Explain the Needle Hull Mark 2 improvement.", required_slots: ["mechanism", "code_path"] },
        ],
        sections: [
          {
            id: "direct_answer",
            title: "Direct Answer",
            required: true,
            must_answer: ["State the high-level answer first."],
            required_slots: ["definition"],
            preferred_evidence: ["doc", "code"],
            kind: "answer",
          },
          {
            id: "traditional_solve",
            title: "Traditional Solve",
            required: true,
            must_answer: ["Explain the traditional warp-bubble solve path."],
            required_slots: ["mechanism"],
            preferred_evidence: ["doc", "code"],
            kind: "mechanism",
          },
          {
            id: "needle_hull_mark_2",
            title: "Needle Hull Mark 2 Improvement",
            required: true,
            must_answer: ["Explain the Needle Hull Mark 2 improvement."],
            required_slots: ["mechanism", "code_path"],
            preferred_evidence: ["code", "doc"],
            kind: "comparison",
          },
          {
            id: "implementation_in_repo",
            title: "Implementation In Repo",
            required: true,
            must_answer: ["Map the strongest repo implementation anchors."],
            required_slots: ["code_path"],
            preferred_evidence: ["code", "runtime"],
            kind: "repo",
          },
        ],
      },
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "docs/knowledge/warp/natario-zero-expansion.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 4,
      lockIdSeed: "ask:planner-shaped-format",
      turnContract,
    });
    expect(plan.target_verbosity).toBe("extended");
    expect(plan.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "Direct Answer",
        "Traditional Solve",
        "Needle Hull Mark 2 Improvement",
        "Implementation In Repo",
        "Open Gaps",
        "Sources",
      ]),
    );
  });

  it("renders planned answer sections instead of the legacy five-section shell for dynamic plans", () => {
    const question = "How is the warp bubble traditionally solved and what is the needle hull mark 2 improvement?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const turnContract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
      plannerMode: "llm",
      plannerValid: true,
      plannerSource: "unit_test",
      plannerPass: {
        goal: "Explain traditional solve and the Needle Hull Mark 2 improvement in repo terms.",
        grounding_mode: "repo",
        output_family: "mechanism_process",
        verbosity: "extended",
        objectives: [
          { label: "Traditional solve path", required_slots: ["definition", "mechanism"] },
          { label: "Needle Hull Mark 2 improvement", required_slots: ["mechanism", "code_path"] },
        ],
        sections: [
          { id: "direct_answer", title: "Direct Answer", required: true, required_slots: ["definition"], kind: "answer" },
          { id: "traditional_solve", title: "Traditional Solve", required: true, required_slots: ["mechanism"], kind: "mechanism" },
          { id: "needle_hull_mark_2", title: "Needle Hull Mark 2 Improvement", required: true, required_slots: ["mechanism", "code_path"], kind: "comparison" },
          { id: "implementation_in_repo", title: "Implementation In Repo", required: true, required_slots: ["code_path"], kind: "repo" },
        ],
      },
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "docs/knowledge/warp/natario-zero-expansion.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 4,
      lockIdSeed: "ask:planned-render",
      turnContract,
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText:
        "Traditional solve path is documented in docs/knowledge/warp/warp-bubble.md while modules/warp/warp-module.ts and modules/warp/natario-warp.ts carry the active implementation. Needle Hull Mark 2 improvement is anchored in docs/knowledge/warp/natario-zero-expansion.md.",
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2PlannedAnswer({
      plan,
      brief,
      verbosity: "brief",
      claims: [
        {
          section: "short_answer",
          class: "repo_grounded",
          text: "Traditional warp-bubble solve is documented in docs/knowledge/warp/warp-bubble.md and implemented through modules/warp/warp-module.ts and modules/warp/natario-warp.ts.",
          citations: ["docs/knowledge/warp/warp-bubble.md", "modules/warp/warp-module.ts", "modules/warp/natario-warp.ts"],
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repository solve path runs through modules/warp/warp-module.ts and modules/warp/natario-warp.ts with constraints grounded in docs/knowledge/warp/warp-bubble.md.",
          citations: ["modules/warp/warp-module.ts", "modules/warp/natario-warp.ts", "docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "evidence_proof_anchors",
          class: "repo_grounded",
          text: "Needle Hull Mark 2 improvement is anchored in docs/knowledge/warp/natario-zero-expansion.md.",
          citations: ["docs/knowledge/warp/natario-zero-expansion.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some parameter-level detail may still need narrower anchors.",
          citations: ["docs/knowledge/warp/natario-zero-expansion.md"],
          uncertainty_marker: "partial evidence window",
        },
      ],
    });
    expect(rendered).toMatch(/^Direct Answer:/m);
    expect(rendered).toMatch(/^Traditional Solve:/m);
    expect(rendered).toMatch(/^Needle Hull Mark 2 Improvement:/m);
    expect(rendered).toMatch(/^Implementation In Repo:/m);
    expect(rendered).toMatch(/^Open Gaps:/m);
    expect(rendered).not.toMatch(/^Short answer:/m);
  });

  it("renders evidence-derived planned fallback lines when claims are empty", () => {
    const question =
      "What is a warp bubble and how does it get a full solve like in the case of the Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      turnContract: null,
      equationIntentContract: null,
    });
    const evidenceText = [
      "docs/knowledge/warp/warp-bubble.md defines a warp bubble as a modeled spacetime region driven by a shift vector field.",
      "modules/warp/warp-module.ts orchestrates the runtime solve while modules/warp/natario-warp.ts computes the Natario warp field and congruence diagnostics.",
      "docs/audits/research/needle-hull-mark2/README.md describes Needle Hull Mark 2 as the current full-solve campaign with falsifiable reduced-order solve gates.",
    ].join("\n\n");
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
        "docs/audits/research/needle-hull-mark2/README.md",
      ],
      contextFileCount: 4,
      slotCoverageRatio: 0.75,
      slotMissing: ["code_path"],
      evidenceText,
      evidenceSections: [
        {
          id: "definition",
          label: "Definition evidence",
          content:
            "docs/knowledge/warp/warp-bubble.md defines a warp bubble as a modeled spacetime region driven by a shift vector field.",
        },
        {
          id: "repo",
          label: "Repo evidence",
          content:
            "modules/warp/warp-module.ts orchestrates the runtime solve while modules/warp/natario-warp.ts computes the Natario warp field and congruence diagnostics.",
        },
        {
          id: "needle_hull_mark2",
          label: "Needle Hull Mark 2 evidence",
          content:
            "docs/audits/research/needle-hull-mark2/README.md describes Needle Hull Mark 2 as the current full-solve campaign with falsifiable reduced-order solve gates.",
        },
      ],
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      evidenceText,
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2PlannedAnswer({
      plan,
      brief,
      verbosity: "extended",
      claims: [],
    });
    expect(rendered).not.toMatch(/^- Plan for /m);
    expect(rendered).not.toMatch(/^- Notes: See /m);
    expect(rendered).toMatch(/modeled spacetime region|shift vector field/i);
    expect(rendered).toMatch(/orchestrates the runtime solve|computes the Natario warp field/i);
    expect(rendered).toMatch(/Needle Hull Mark 2|full-solve campaign/i);
  });

  it("projection recovery uses evidence digest when existing text is low signal", () => {
    const question = "How do we solve for the warp bubble in the code base. Like Needle Hull Mark 2?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-projection-digest",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      evidenceText:
        "Needle Hull Mark 2 solve path is computed in modules/warp/natario-warp.ts and orchestrated in modules/warp/warp-module.ts.",
      envelope,
    });
    const projectedClaims =
      __testHelixAskReliabilityGuards.buildHelixAskComposerV2DeterministicProjectionClaims({
        brief,
        existingText:
          "; const resolveAlcubierreWallThickness = (params: NatarioWarpParams, R: number, sigma?: number) => const wall = (params.warpGeometry as any)?.wallThickness_m ??",
        allowedCitations: plan.evidence_pack.allowed_citations,
      });
    const shortAnswerClaim = projectedClaims.find((claim) => claim.section === "short_answer");
    const solveClaim = projectedClaims.find((claim) => claim.section === "how_repo_solves_it");
    expect(shortAnswerClaim?.text ?? "").toMatch(/Needle Hull Mark 2|modules\/warp\/natario-warp\.ts/i);
    expect(shortAnswerClaim?.text ?? "").not.toMatch(/resolveAlcubierreWallThickness/i);
    expect(solveClaim?.text ?? "").toMatch(/modules\/warp\/(?:natario-warp|warp-module)\.ts/i);
  });

  it("projection recovery rejects path-bullet short-answer seeds when breaker fallback text is noisy", () => {
    const question = "How is the warp bubble solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
        "docs/warp-tree-dag-walk-rules.md",
      ],
      contextFileCount: 4,
      lockIdSeed: "ask:composer-v2-path-bullet-seed",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      envelope,
    });
    const projectedClaims =
      __testHelixAskReliabilityGuards.buildHelixAskComposerV2DeterministicProjectionClaims({
        brief,
        existingText:
          "docs/warp-tree-dag-walk-rules.md: - Base tree JSON files (with inline congruence metadata).",
        allowedCitations: plan.evidence_pack.allowed_citations,
      });
    const shortAnswerClaim = projectedClaims.find((claim) => claim.section === "short_answer");
    expect(shortAnswerClaim?.text ?? "").not.toMatch(/^docs\/[^\n]+:\s*-/i);
    expect(shortAnswerClaim?.text ?? "").toMatch(/repository|repo|codebase|warp/i);
  });

  it("composer v2 renderer dedupes section lines even when claims differ by citations only", () => {
    const question = "How is warp solved in this repo?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "modules/warp/natario-warp.ts",
        "docs/knowledge/warp/warp-bubble.md",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-dedupe-render",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2FiveSectionAnswer({
      brief,
      verbosity: "normal",
      claims: [
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repository solve path runs through modules/warp/natario-warp.ts.",
          citations: ["modules/warp/natario-warp.ts"],
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repository solve path runs through modules/warp/natario-warp.ts.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Constraint assumptions are documented in repository docs.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some derivation-level detail remains open.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "partial evidence window",
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some derivation-level detail remains open.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "",
        },
      ],
    });
    expect(rendered.match(/Repository solve path runs through modules\/warp\/natario-warp\.ts\./g)?.length ?? 0).toBe(1);
    expect(rendered.match(/Some derivation-level detail remains open\./g)?.length ?? 0).toBe(1);
  });

  it("projection recovery avoids low-signal path-prefixed claims across short/repo sections", () => {
    const question = "How is the warp bubble solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
        "docs/warp-tree-dag-walk-rules.md",
      ],
      contextFileCount: 4,
      lockIdSeed: "ask:composer-v2-avoid-path-prefix-noise",
    });
    const noisyEvidence = [
      "docs/warp-tree-dag-walk-rules.md: - Base tree JSON files (with inline congruence metadata).",
      "Repository solve path runs through modules/warp/warp-module.ts and modules/warp/natario-warp.ts with constraints grounded in docs/knowledge/warp/warp-bubble.md.",
    ].join("\n");
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: noisyEvidence,
      evidenceText: noisyEvidence,
      envelope,
    });
    const projectedClaims =
      __testHelixAskReliabilityGuards.buildHelixAskComposerV2DeterministicProjectionClaims({
        brief,
        existingText: noisyEvidence,
        allowedCitations: plan.evidence_pack.allowed_citations,
      });
    const shortAnswer = projectedClaims.find((claim) => claim.section === "short_answer");
    const repoSolveClaims = projectedClaims.filter((claim) => claim.section === "how_repo_solves_it");
    expect(shortAnswer?.text ?? "").not.toMatch(/^docs\/[^\n]+:\s*[-*#]/i);
    expect(shortAnswer?.text ?? "").toMatch(/repository|repo|codebase|warp/i);
    for (const claim of repoSolveClaims) {
      expect(claim.text).not.toMatch(/^docs\/[^\n]+:\s*[-*#]/i);
      expect(claim.text).not.toMatch(/derivation-level detail remains open|narrower anchors/i);
    }
  });

  it("composer v2 renderer canonical-dedupes equivalent lines with punctuation/marker variance", () => {
    const question = "How is warp solved in this repo?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "modules/warp/natario-warp.ts",
        "docs/knowledge/warp/warp-bubble.md",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-canonical-dedupe",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2FiveSectionAnswer({
      brief,
      verbosity: "normal",
      claims: [
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repository solve path runs through modules/warp/natario-warp.ts",
          citations: ["modules/warp/natario-warp.ts"],
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repository solve path runs through modules/warp/natario-warp.ts.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Open gap remains for parameter calibration",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "partial evidence window",
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Open gap remains for parameter calibration.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "",
        },
      ],
    });
    const howRepoBlock = rendered.match(
      /How repo solves it:\n([\s\S]*?)\n\nEvidence \+ proof anchors:/,
    )?.[1] ?? "";
    const uncertaintyBlock = rendered.match(
      /Uncertainty \/ open gaps:\n([\s\S]*?)\n\nSources:/,
    )?.[1] ?? "";
    expect(howRepoBlock.match(/Repository solve path runs through modules\/warp\/natario-warp\.ts\./g)?.length ?? 0).toBe(1);
    expect(uncertaintyBlock.match(/Open gap remains for parameter calibration\./g)?.length ?? 0).toBe(1);
    expect(uncertaintyBlock.match(/\(uncertainty: partial evidence window\)/g)?.length ?? 0).toBe(1);
  });

  it("renderer keeps uncertainty-only language out of how-repo section under sparse projection", () => {
    const question = "How is the warp bubble solved in the codebase?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/warp-module.ts",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "ask:composer-v2-uncertainty-leak-guard",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      envelope,
    });
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskComposerV2FiveSectionAnswer({
      brief,
      verbosity: "extended",
      claims: [
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repository solve path runs through modules/warp/warp-module.ts and modules/warp/natario-warp.ts with constraints grounded in docs/knowledge/warp/warp-bubble.md.",
          citations: ["modules/warp/warp-module.ts", "modules/warp/natario-warp.ts", "docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Some derivation-level detail remains open until narrower anchors are requested.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some derivation-level detail remains open until narrower anchors are requested.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "partial evidence window",
        },
      ],
    });
    const howRepoBlock = rendered.match(
      /How repo solves it:\n([\s\S]*?)\n\nEvidence \+ proof anchors:/,
    )?.[1] ?? "";
    const uncertaintyBlock = rendered.match(
      /Uncertainty \/ open gaps:\n([\s\S]*?)\n\nSources:/,
    )?.[1] ?? "";
    expect(howRepoBlock).not.toMatch(/derivation-level detail remains open|narrower anchors/i);
    expect(uncertaintyBlock).toMatch(/derivation-level detail remains open|narrower anchors/i);
  });

  it("keeps bare repo paths in composer v2 claim prose instead of stripping sentence meaning", () => {
    const question = "How is warp solved in this repo?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
      ],
      contextFileCount: 2,
      lockIdSeed: "ask:composer-v2-keep-path-prose",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "",
      envelope,
    });
    const raw = JSON.stringify({
      claims: [
        {
          section: "short_answer",
          class: "repo_grounded",
          text: "Solve path runs through modules/warp/natario-warp.ts with constraints in docs/knowledge/warp/warp-bubble.md.",
          citations: ["modules/warp/natario-warp.ts"],
        },
        {
          section: "conceptual_baseline",
          class: "baseline_common",
          text: "Conceptual framing remains separate from proof claims.",
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Runtime path uses modules/warp/natario-warp.ts and docs/knowledge/warp/warp-bubble.md.",
          citations: ["modules/warp/natario-warp.ts", "docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "evidence_proof_anchors",
          class: "repo_grounded",
          text: "Primary anchors include docs/knowledge/warp/warp-bubble.md.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some details may remain unresolved.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "may remain unresolved",
        },
      ],
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: raw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(true);
    expect(materialized.rendered_text).toMatch(/modules\/warp\/natario-warp\.ts/i);
    expect(materialized.rendered_text).toMatch(/docs\/knowledge\/warp\/warp-bubble\.md/i);
    expect(materialized.rendered_text).not.toMatch(/runs through and with constraints grounded in \./i);
  });

  it("enforces minimum normal verbosity for composer v2 and expands conceptual section detail", () => {
    expect(__testHelixAskReliabilityGuards.resolveHelixAskComposerV2Verbosity("brief")).toBe("normal");
    const question = "Define warp bubble in this repo.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: true,
      allowedCitations: ["docs/knowledge/warp/warp-bubble.md"],
      contextFileCount: 1,
      lockIdSeed: "ask:composer-v2-min-verbosity",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp bubble definition is anchored in docs.",
      envelope,
    });
    const raw = JSON.stringify({
      claims: [
        {
          section: "short_answer",
          class: "repo_grounded",
          text: "Warp bubble definition is repo-grounded.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "conceptual_baseline",
          class: "baseline_common",
          text: "Conceptual baseline remains separated from proof claims.",
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Documentation drives the baseline solve framing.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "evidence_proof_anchors",
          class: "repo_grounded",
          text: "Anchor docs support the described mechanism.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some assumptions may remain unresolved.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "may remain unresolved",
        },
      ],
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: raw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: __testHelixAskReliabilityGuards.resolveHelixAskComposerV2Verbosity("brief"),
    });
    expect(materialized.ok).toBe(true);
    expect(materialized.rendered_text).toMatch(/Conceptual baseline:\n(?:- .+\n){2,}/m);
  });

  it("invalid composer v2 output still yields deterministic failure state for legacy fallback", () => {
    const question = "How does warp bubble solve work?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: ["docs/knowledge/warp/warp-bubble.md"],
      contextFileCount: 1,
      lockIdSeed: "ask:composer-v2-invalid-json",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Warp bubble solve path is documented in repo anchors.",
      envelope,
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: "not-json-output",
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(false);
    expect(materialized.fallback_reason).toBeTruthy();
    expect(materialized.expand_ok && materialized.link_ok).toBe(false);
  });

  it("blocks debug/scaffold leakage claims from composer v2 output", () => {
    const question = "Explain the warp mechanism in repo terms.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const envelope = __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints: constraints,
      equationPrompt: false,
      definitionFocus: false,
      allowedCitations: ["docs/knowledge/warp/warp-bubble.md"],
      contextFileCount: 1,
      lockIdSeed: "ask:composer-v2-debug-leak",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText: "Mechanism is grounded in docs/knowledge/warp/warp-bubble.md.",
      envelope,
    });
    const raw = JSON.stringify({
      claims: [
        {
          section: "short_answer",
          class: "repo_grounded",
          text: "traceId=ask:abc123 should not appear",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "conceptual_baseline",
          class: "baseline_common",
          text: "Conceptual lane remains uncited.",
        },
        {
          section: "how_repo_solves_it",
          class: "repo_grounded",
          text: "Repo solve anchor.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "evidence_proof_anchors",
          class: "repo_grounded",
          text: "Evidence anchor.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
        },
        {
          section: "uncertainty_open_gaps",
          class: "reasoned_inference",
          text: "Some details may remain open.",
          citations: ["docs/knowledge/warp/warp-bubble.md"],
          uncertainty_marker: "may remain open",
        },
      ],
    });
    const materialized = __testHelixAskReliabilityGuards.materializeHelixAskComposerV2Output({
      rawExpansion: raw,
      brief,
      allowedCitations: plan.evidence_pack.allowed_citations,
      verbosity: "normal",
    });
    expect(materialized.ok).toBe(false);
    expect(materialized.post_link_fail_reasons).toContain("debug_leak_claim");
  });

  it("produces deterministic lock hash for equivalent selection state", () => {
    const seed = {
      selectorLocked: true,
      selectorPrimaryKey: "docs/dp_collapse_derivation.md:L5",
      intentContractHash: "intent-hash-1",
    };
    const hashA = __testHelixAskReliabilityGuards.computeEquationSelectionLockHash(seed);
    const hashB = __testHelixAskReliabilityGuards.computeEquationSelectionLockHash(seed);
    const hashC = __testHelixAskReliabilityGuards.computeEquationSelectionLockHash({
      ...seed,
      selectorPrimaryKey: "docs/dp_collapse_derivation.md:L23",
    });
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });

  it("downgrades verified equation label when integrity guard fails", () => {
    const verified = [
      "Primary Topic: collapse",
      "",
      "Primary Equation (Verified):",
      "- [docs/dp_collapse_derivation.md:L5] tau = hbar / DeltaE",
      "",
      "Mechanism Explanation:",
      "1. Derived relation in collapse family.",
      "",
      "Sources: docs/dp_collapse_derivation.md",
    ].join("\n");
    const downgraded =
      __testHelixAskReliabilityGuards.downgradeRenderedPrimaryEquationToTentative({
        answer: verified,
        reason: "code_path_slot_missing",
      });
    expect(downgraded).toMatch(/^Primary Equation \(Tentative\):/m);
    expect(downgraded).toMatch(/Uncertainty: verified label downgraded/i);
  });

  it("passes verified integrity when lock, anchor, and citation constraints are satisfied", () => {
    const answer = [
      "Primary Topic: collapse",
      "",
      "Primary Equation (Verified):",
      "- [docs/dp_collapse_derivation.md:L5] tau = hbar / DeltaE",
      "",
      "Mechanism Explanation:",
      "1. Derived relation in collapse family.",
      "",
      "Sources: docs/dp_collapse_derivation.md",
    ].join("\n");
    const integrity = __testHelixAskReliabilityGuards.evaluateRenderedEquationVerifiedIntegrity({
      answer,
      selectorAuthorityLock: true,
      selectorPrimaryKey: "docs/dp_collapse_derivation.md:L5",
      allowedCitations: ["docs/dp_collapse_derivation.md"],
      stage05MissingSlots: [],
    });
    expect(integrity.pass).toBe(true);
    expect(integrity.reason).toBeNull();
  });

  it("fails verified integrity when code_path evidence is missing", () => {
    const answer = [
      "Primary Topic: collapse",
      "",
      "Primary Equation (Verified):",
      "- [docs/dp_collapse_derivation.md:L5] tau = hbar / DeltaE",
      "",
      "Mechanism Explanation:",
      "1. Derived relation in collapse family.",
      "",
      "Sources: docs/dp_collapse_derivation.md",
    ].join("\n");
    const integrity = __testHelixAskReliabilityGuards.evaluateRenderedEquationVerifiedIntegrity({
      answer,
      selectorAuthorityLock: true,
      selectorPrimaryKey: "docs/dp_collapse_derivation.md:L5",
      allowedCitations: ["docs/dp_collapse_derivation.md"],
      stage05MissingSlots: ["code_path"],
    });
    expect(integrity.pass).toBe(false);
    expect(integrity.reason).toBe("code_path_slot_missing");
  });
});

describe("helix ask reliability guards", () => {
  it("overrides clarify for grounded repo-required evidence under alignment fail", () => {
    const shouldOverride =
      __testHelixAskReliabilityGuards.shouldOverrideClarifyForGroundedEvidence(
        {
          alignmentGateDecision: "FAIL",
          openWorldBypassMode: "off",
          atlasRequirementFailed: false,
          requiresRepoEvidence: true,
          evidenceGateOk: true,
          mustIncludeOk: true,
          viabilityMustIncludeOk: true,
          topicMustIncludeOk: true,
          retrievalConfidence: 0.9,
          repoThreshold: 0.6,
          hasRepoHints: true,
          hasFilePathHints: true,
          contextFileCount: 2,
        },
      );
    expect(shouldOverride).toBe(true);
  });

  it("does not override clarify when evidence is weak", () => {
    const shouldOverride =
      __testHelixAskReliabilityGuards.shouldOverrideClarifyForGroundedEvidence(
        {
          alignmentGateDecision: "FAIL",
          openWorldBypassMode: "off",
          atlasRequirementFailed: false,
          requiresRepoEvidence: true,
          evidenceGateOk: false,
          mustIncludeOk: true,
          viabilityMustIncludeOk: true,
          topicMustIncludeOk: true,
          retrievalConfidence: 0.4,
          repoThreshold: 0.6,
          hasRepoHints: false,
          hasFilePathHints: false,
          contextFileCount: 0,
        },
      );
    expect(shouldOverride).toBe(false);
  });

  it("does not override clarify for open-world requests", () => {
    const shouldOverride =
      __testHelixAskReliabilityGuards.shouldOverrideClarifyForGroundedEvidence(
        {
          alignmentGateDecision: "FAIL",
          openWorldBypassMode: "off",
          atlasRequirementFailed: false,
          requiresRepoEvidence: false,
          evidenceGateOk: true,
          mustIncludeOk: true,
          viabilityMustIncludeOk: true,
          topicMustIncludeOk: true,
          retrievalConfidence: 0.95,
          repoThreshold: 0.6,
          hasRepoHints: true,
          hasFilePathHints: true,
          contextFileCount: 2,
        },
      );
    expect(shouldOverride).toBe(false);
  });

  it("builds deterministic repo runtime fallback from evidence", () => {
    const fallback =
      __testHelixAskReliabilityGuards.buildDeterministicRepoRuntimeFallback({
        question: "What is a warp bubble Natario solve?",
        format: "brief",
        definitionFocus: true,
        docBlocks: [
          {
            path: "docs/knowledge/warp/warp-bubble.md",
            block:
              "docs/knowledge/warp/warp-bubble.md\nDefinition: In this repo, a warp bubble is a modeled spacetime region defined by a shift vector field and expansion constraints.",
          },
        ],
        codeAlignment: null,
        evidenceText:
          "Definition: In this repo, a warp bubble is a modeled spacetime region.\nSources: docs/knowledge/warp/warp-bubble.md",
        anchorFiles: ["docs/knowledge/warp/warp-bubble.md"],
      });
    expect(fallback).toBeTruthy();
    expect(fallback).not.toMatch(/Runtime fallback: Unable to complete a repo-grounded LLM pass/i);
    expect(fallback).toMatch(/docs\/knowledge\/warp\/warp-bubble\.md/i);
  });

  it("direct-uses deterministic repo runtime fallback for repo definition answers", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText:
          "Definition:\n- In this repo, a warp bubble is a modeled spacetime region.\n\nSources: docs/knowledge/warp/warp-bubble.md",
        promptFamily: "definition_overview",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: false,
      });
    expect(directUse).toBe(true);
  });

  it("does not direct-use deterministic repo runtime fallback for composited repo answers", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText:
          "Definition:\n- In this repo, a warp bubble is a modeled spacetime region.\n\nSources: docs/knowledge/warp/warp-bubble.md",
        promptFamily: "definition_overview",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: true,
      });
    expect(directUse).toBe(false);
  });

  it("direct-uses deterministic repo runtime fallback for implementation answers when family sections are present", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText: [
          "Where in repo:",
          "- modules/warp/warp-module.ts",
          "",
          "Call chain:",
          "- modules/warp/warp-module.ts -> modules/warp/natario-warp.ts",
          "",
          "Sources: modules/warp/warp-module.ts, modules/warp/natario-warp.ts",
        ].join("\n"),
        promptFamily: "implementation_code_path",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: false,
      });
    expect(directUse).toBe(true);
  });

  it("direct-uses deterministic repo runtime fallback for roadmap answers when roadmap sections are present", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText: [
          "Repo-Grounded Findings:",
          "- Current repo grounding is anchored in server/routes/agi.plan.ts.",
          "",
          "Implementation Roadmap:",
          "1. Add profiles.",
          "",
          "Evidence Gaps:",
          "- Need tighter section-level grounding on unresolved mechanisms.",
          "",
          "Next Anchors Needed:",
          "- docs/helix-ask-readiness-debug-loop.md",
          "",
          "Sources: server/routes/agi.plan.ts",
        ].join("\n"),
        promptFamily: "roadmap_planning",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: false,
      });
    expect(directUse).toBe(true);
  });

  it("does not direct-use deterministic roadmap fallback when required roadmap sections are missing", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText: [
          "Repo-Grounded Findings:",
          "- Current repo grounding is anchored in server/routes/agi.plan.ts.",
          "",
          "Implementation Roadmap:",
          "1. Add profiles.",
          "",
          "Sources: server/routes/agi.plan.ts",
        ].join("\n"),
        promptFamily: "roadmap_planning",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: false,
      });
    expect(directUse).toBe(false);
  });

  it("direct-uses deterministic repo runtime fallback for troubleshooting answers when family sections are present", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText: [
          "Symptoms:",
          "- Current failure surface is bounded to server/routes/agi.plan.ts in this turn.",
          "",
          "Most likely causes:",
          "- The failing runtime path most likely crosses server/routes/agi.plan.ts.",
          "",
          "Checks:",
          "- Inspect server/routes/agi.plan.ts against the exact startup error.",
          "",
          "Fixes:",
          "- Start with server/routes/agi.plan.ts and narrow the failing call path.",
          "",
          "Sources: server/routes/agi.plan.ts",
        ].join("\n"),
        promptFamily: "troubleshooting_diagnosis",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: false,
      });
    expect(directUse).toBe(true);
  });

  it("direct-uses deterministic repo runtime fallback for recommendation answers when family sections are present", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText: [
          "Decision:",
          "- Start from server/routes/agi.plan.ts before widening the requested change.",
          "",
          "Rationale:",
          "- Current grounding is strongest in server/routes/agi.plan.ts.",
          "",
          "Constraints:",
          "- Preserve grounding to locked evidence only.",
          "",
          "Risks:",
          "- Missing coverage for repo mapping can misplace the change surface.",
          "",
          "Fallback plan:",
          "- Retry with explicit route/module anchors near server/routes/agi.plan.ts.",
          "",
          "Sources: server/routes/agi.plan.ts",
        ].join("\n"),
        promptFamily: "recommendation_decision",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: false,
      });
    expect(directUse).toBe(true);
  });

  it("does not direct-use deterministic repo runtime fallback for implementation answers with missing family sections", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRepoRuntimeFallback({
        fallbackText: "Implementation path remains bounded to modules/warp/warp-module.ts.\n\nSources: modules/warp/warp-module.ts",
        promptFamily: "implementation_code_path",
        repoGrounded: true,
        relationIntentActive: false,
        forceLlmProbe: false,
        compositeEnabled: false,
      });
    expect(directUse).toBe(false);
  });

  it("builds troubleshooting family deterministic fallback without an explicit turn contract", () => {
    const question = "This repo throws an error on startup. How do I fix it?";
    const fallback =
      __testHelixAskReliabilityGuards.buildDeterministicFamilyRepoRuntimeFallback({
        question,
        family: "troubleshooting_diagnosis",
        intentDomain: "repo",
        queryConstraints: __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question),
        equationPrompt: false,
        definitionFocus: false,
        equationIntentContract: null,
        selectorPrimaryKey: null,
        selectorLocked: false,
        selectorFamily: null,
        lockIdSeed: "ask:troubleshooting-family-direct",
        allowedCitations: [
          "server/routes/agi.plan.ts",
          "docs/helix-ask-flow.md",
        ],
        contextFiles: [
          "server/routes/agi.plan.ts",
          "docs/helix-ask-flow.md",
        ],
        turnContract: null,
        slotCoverageRatio: 0.6667,
        slotMissing: ["mechanism"],
        connectedHintPathCount: 0,
        retrievalConfidence: 0.9,
        objectiveSupport: [],
        existingText:
          "Repository solve details are grounded in server/routes/agi.plan.ts. Sources: server/routes/agi.plan.ts",
      });
    expect(fallback).toBeTruthy();
    expect(fallback).toMatch(/^Symptoms:/m);
    expect(fallback).toMatch(/^Most likely causes:/m);
    expect(fallback).toMatch(/^Fixes:/m);
    expect(fallback).toMatch(/^Sources:/m);
    expect(fallback).not.toMatch(/^Short answer:/m);
  });

  it("builds implementation-family deterministic fallback for repo-technical identifier prompts", () => {
    const question = "Explain how answer_path is populated and useful for diagnostics.";
    const fallback =
      __testHelixAskReliabilityGuards.buildDeterministicFamilyRepoRuntimeFallback({
        question,
        family: "implementation_code_path",
        intentDomain: "repo",
        queryConstraints: __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question),
        equationPrompt: false,
        definitionFocus: false,
        equationIntentContract: null,
        selectorPrimaryKey: null,
        selectorLocked: false,
        selectorFamily: null,
        lockIdSeed: "ask:repo-technical-implementation-direct",
        allowedCitations: [
          "server/routes/agi.plan.ts",
          "docs/helix-ask-flow.md",
        ],
        contextFiles: [
          "server/routes/agi.plan.ts",
          "docs/helix-ask-flow.md",
        ],
        turnContract: null,
        slotCoverageRatio: 0.75,
        slotMissing: ["failure-modes"],
        connectedHintPathCount: 0,
        retrievalConfidence: 0.9,
        objectiveSupport: [],
        existingText:
          "The answer_path field is populated in server/routes/agi.plan.ts as the request moves through routing, fallback, and finalization stages. Sources: server/routes/agi.plan.ts",
      });
    expect(fallback).toBeTruthy();
    expect(fallback).toMatch(/^Where in repo:/m);
    expect(fallback).toMatch(/^Call chain:/m);
    expect(fallback).toMatch(/answer_path/i);
    expect(fallback).toMatch(/server\/routes\/agi\.plan\.ts/i);
    expect(fallback).not.toMatch(/Evidence is limited in current retrieval/i);
    expect(fallback).toMatch(/^Sources:/m);
  });

  it("renders symbol-aware planned implementation fallback entries for repo-technical identifier prompts", () => {
    const question = "Explain how answer_path is populated and useful for diagnostics.";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const turnContract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "test",
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints,
      equationPrompt: false,
      definitionFocus: false,
      equationIntentContract: null,
      selectorPrimaryKey: null,
      selectorLocked: false,
      selectorFamily: null,
      lockIdSeed: "ask:repo-technical-planned-fallback",
      allowedCitations: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
      contextFileCount: 2,
      turnContract,
      evidenceText:
        "The answer_path field is populated in server/routes/agi.plan.ts as the request moves through routing, fallback, and finalization stages. Sources: server/routes/agi.plan.ts",
    });
    const brief = __testHelixAskReliabilityGuards.buildHelixAskComposerV2GroundedBrief({
      plan,
      question,
      existingText:
        "The answer_path field is populated in server/routes/agi.plan.ts as the request moves through routing, fallback, and finalization stages. Sources: server/routes/agi.plan.ts",
      evidenceText:
        "The answer_path field is populated in server/routes/agi.plan.ts as the request moves through routing, fallback, and finalization stages. Sources: server/routes/agi.plan.ts",
      envelope: __testHelixAskReliabilityGuards.buildHelixAskIntentPolicyEnvelope({
        question,
        intentDomain: "repo",
        requiresRepoEvidence: true,
        queryConstraints,
        equationPrompt: false,
        definitionFocus: false,
        equationIntentContract: null,
      }),
    });
    const callChainSection = plan.sections.find((section) => section.title === "Call chain");
    expect(callChainSection).toBeTruthy();
    const entries = __testHelixAskReliabilityGuards.buildHelixAskPlannedSectionFallbackLines({
      plan,
      section: callChainSection!,
      brief,
    });
    const rendered = entries.map((entry) => entry.text).join("\n");
    expect(rendered).toMatch(/answer_path/i);
    expect(rendered).toMatch(/server\/routes\/agi\.plan\.ts/i);
    expect(rendered).not.toMatch(/Evidence is limited in current retrieval/i);
  });

  it("builds definition family deterministic fallback without an explicit turn contract", () => {
    const question = "What is a warp bubble in this codebase?";
    const fallback =
      __testHelixAskReliabilityGuards.buildDeterministicFamilyRepoRuntimeFallback({
        question,
        family: "definition_overview",
        intentDomain: "repo",
        queryConstraints: __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question),
        equationPrompt: false,
        definitionFocus: true,
        equationIntentContract: null,
        selectorPrimaryKey: null,
        selectorLocked: false,
        selectorFamily: null,
        lockIdSeed: "ask:definition-family-direct",
        allowedCitations: [
          "docs/knowledge/warp/warp-bubble.md",
          "modules/warp/warp-module.ts",
          "modules/warp/natario-warp.ts",
        ],
        contextFiles: [
          "docs/knowledge/warp/warp-bubble.md",
          "modules/warp/warp-module.ts",
          "modules/warp/natario-warp.ts",
        ],
        turnContract: null,
        slotCoverageRatio: 0.5,
        slotMissing: ["repo-mapping"],
        connectedHintPathCount: 0,
        retrievalConfidence: 0.7,
        objectiveSupport: [],
        existingText:
          "Repository solve details are grounded in docs/knowledge/warp/warp-bubble.md. Sources: docs/knowledge/warp/warp-bubble.md",
      });
    expect(fallback).toBeTruthy();
    expect(fallback).toMatch(/^Definition:/m);
    expect(fallback).toMatch(/^(?:How it is solved in codebase|Implementation In Repo|Repo anchors):/m);
    expect(fallback).toMatch(/^Sources:/m);
    expect(fallback).not.toMatch(/^Short answer:/m);
  });

  it("uses repo anchors sections for repo-grounded definition obligations", () => {
    const question = "What is a warp bubble in this codebase?";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const turnContract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "test",
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "definition-repo-anchors",
      turnContract,
      slotCoverageRatio: 0.5,
      slotMissing: ["repo-mapping"],
      connectedHintPathCount: 12,
      retrievalConfidence: 0.8,
      evidenceGap: true,
      objectiveSupport: [],
    });
    const sectionTitles = plan.sections.map((section) => section.title);
    expect(sectionTitles).toContain("Definition");
    expect(sectionTitles).toContain("Repo anchors");
    expect(sectionTitles).not.toContain("Why it matters");
    expect(sectionTitles).not.toContain("Key terms");
  });

  it("direct-uses deterministic relation packet answers when dual-domain relation evidence is ready", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRelationPacketAnswer({
        relationQuestionFastPath: true,
        relationPacketPresent: true,
        relationDualDomainOk: true,
        forceLlmProbe: false,
        controllerPrimaryPreferred: false,
      });
    expect(directUse).toBe(true);
  });

  it("does not direct-use deterministic relation packet answers when force probe is enabled", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRelationPacketAnswer({
        relationQuestionFastPath: true,
        relationPacketPresent: true,
        relationDualDomainOk: true,
        forceLlmProbe: true,
        controllerPrimaryPreferred: false,
      });
    expect(directUse).toBe(false);
  });

  it("does not direct-use deterministic relation packet answers when controller-primary mode is preferred", () => {
    const directUse =
      __testHelixAskReliabilityGuards.shouldDirectUseDeterministicRelationPacketAnswer({
        relationQuestionFastPath: true,
        relationPacketPresent: true,
        relationDualDomainOk: true,
        forceLlmProbe: false,
        controllerPrimaryPreferred: true,
      });
    expect(directUse).toBe(false);
  });

  it("does not apply term-prior general arbiter lock for relation-heuristic prompts", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldApplyTermPriorGeneralArbiterLock({
        termPriorGeneralRouteLock: true,
        termPriorRepoOverrideApplied: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        relationHeuristicPrompt: true,
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldApplyTermPriorGeneralArbiterLock({
        termPriorGeneralRouteLock: true,
        termPriorRepoOverrideApplied: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        relationHeuristicPrompt: false,
      }),
    ).toBe(true);
  });

  it("does not apply term-prior physics-relation general route for relation-heuristic prompts", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldApplyTermPriorPhysicsRelationGeneralRoute({
        termPriorApplied: true,
        termPriorPreferGeneralRouting: true,
        termPriorRelationCue: true,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        relationHeuristicPrompt: true,
        initialIntentProfileId: "general.conceptual_define_compare",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldApplyTermPriorPhysicsRelationGeneralRoute({
        termPriorApplied: true,
        termPriorPreferGeneralRouting: true,
        termPriorRelationCue: true,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        relationHeuristicPrompt: false,
        initialIntentProfileId: "general.conceptual_define_compare",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldApplyTermPriorPhysicsRelationGeneralRoute({
        termPriorApplied: true,
        termPriorPreferGeneralRouting: true,
        termPriorRelationCue: true,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        relationHeuristicPrompt: false,
        initialIntentProfileId: "repo.warp_definition_docs_first",
      }),
    ).toBe(false);
  });

  it("preserves deterministic direct answers across composer when no llm call occurred", () => {
    const preserve =
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskDeterministicAnswerAcrossComposer({
        llmInvoked: false,
        answerPath: [
          "intent:repo.warp_definition_docs_first",
          "answer:repo_runtime_deterministic_direct",
        ],
      });
    expect(preserve).toBe(true);
  });

  it("blocks deterministic preserve at composer unless the answer is hard-forced", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldBlockHelixAskDeterministicPreserveAcrossComposer({
        preserveDeterministicCandidate: true,
        preserveForcedAnswer: false,
        answerPath: [],
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldBlockHelixAskDeterministicPreserveAcrossComposer({
        preserveDeterministicCandidate: true,
        preserveForcedAnswer: true,
        answerPath: [],
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldBlockHelixAskDeterministicPreserveAcrossComposer({
        preserveDeterministicCandidate: false,
        preserveForcedAnswer: false,
        answerPath: [],
      }),
    ).toBe(false);
  });

  it("does not block deterministic preserve for hard-contract frontier/relation answers", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldBlockHelixAskDeterministicPreserveAcrossComposer({
        preserveDeterministicCandidate: true,
        preserveForcedAnswer: false,
        answerPath: ["frontier:final_contract_enforced"],
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.shouldBlockHelixAskDeterministicPreserveAcrossComposer({
        preserveDeterministicCandidate: true,
        preserveForcedAnswer: false,
        answerPath: ["relationFallback:deterministic_guard"],
      }),
    ).toBe(false);
  });

  it("escalates observe-mode soft guard to enforce for known-bad composer states", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldEscalateHelixAskComposerSoftGuardObserve({
        softSectionGuardFailureObserved: true,
        familyFormatAccuracy: 0.5,
        minAccuracy: 0.8,
        failReasons: ["required_sections_missing"],
        gateMode: "observe",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldEscalateHelixAskComposerSoftGuardObserve({
        softSectionGuardFailureObserved: true,
        familyFormatAccuracy: 0.95,
        minAccuracy: 0.8,
        failReasons: ["debug_leak"],
        gateMode: "observe",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldEscalateHelixAskComposerSoftGuardObserve({
        softSectionGuardFailureObserved: true,
        familyFormatAccuracy: 0.95,
        minAccuracy: 0.8,
        failReasons: [],
        gateMode: "observe",
      }),
    ).toBe(false);
  });

  it("preserves frontier deterministic contracts across composer after quality floor enforcement", () => {
    const preserve =
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskDeterministicAnswerAcrossComposer({
        llmInvoked: true,
        answerPath: [
          "intent:falsifiable.frontier_consciousness_theory_lens",
          "qualityFloor:frontier_contract",
        ],
      });
    expect(preserve).toBe(true);
  });

  it("pins deterministic repo and frontier answers before finalize cleanup", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldPinHelixAskDeterministicAnswerPreFinalize({
        deterministicRepoRuntimeFallbackUsed: true,
        answerPath: [],
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPinHelixAskDeterministicAnswerPreFinalize({
        deterministicRepoRuntimeFallbackUsed: false,
        answerPath: ["qualityFloor:frontier_contract"],
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.shouldPinHelixAskDeterministicAnswerPreFinalize({
        deterministicRepoRuntimeFallbackUsed: false,
        answerPath: [],
      }),
    ).toBe(false);
  });

  it("renders definition-overview family fallback without forcing implementation framing for codebase definitions", () => {
    const question = "What is a warp bubble in this codebase?";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const turnContract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "test",
    });
    const plan = __testHelixAskReliabilityGuards.buildHelixAskAnswerPlanShadow({
      question,
      intentDomain: "repo",
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFileCount: 3,
      lockIdSeed: "definition-family-fallback",
      turnContract,
      slotCoverageRatio: 0.5,
      slotMissing: ["repo-mapping"],
      connectedHintPathCount: 12,
      retrievalConfidence: 0.8,
      evidenceGap: true,
      objectiveSupport: [],
    });
    const rendered = __testHelixAskReliabilityGuards.buildHelixAskUniversalFamilyDegradeAnswer({
      plan,
      question,
      existingText:
        "In this repo, a warp bubble is a modeled spacetime region defined by a shift vector field and expansion constraints.",
      reason: "test",
    });
    expect(rendered).toMatch(/^Definition:/m);
    expect(rendered).not.toMatch(/^How it is solved in codebase:/m);
  });

  it("keeps family-aware direct repo fallback for definition_overview even when validation is conservative", () => {
    const question = "What is a warp bubble in this codebase?";
    const queryConstraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const turnContract = __testHelixAskReliabilityGuards.buildHelixAskTurnContract({
      question,
      intentDomain: "repo",
      requiresRepoEvidence: true,
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
      plannerMode: "deterministic",
      plannerValid: true,
      plannerSource: "test",
    });
    const rendered = __testHelixAskReliabilityGuards.buildDeterministicFamilyRepoRuntimeFallback({
      question,
      family: "definition_overview",
      intentDomain: "repo",
      queryConstraints,
      equationPrompt: false,
      definitionFocus: true,
      equationIntentContract: null,
      selectorPrimaryKey: null,
      selectorLocked: false,
      selectorFamily: null,
      lockIdSeed: "definition-direct-family-fallback",
      allowedCitations: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      contextFiles: [
        "docs/knowledge/warp/warp-bubble.md",
        "modules/warp/natario-warp.ts",
        "modules/warp/warp-module.ts",
      ],
      turnContract,
      slotCoverageRatio: 0.5,
      slotMissing: ["repo-mapping"],
      connectedHintPathCount: 12,
      retrievalConfidence: 0.8,
      objectiveSupport: [],
      existingText:
        "In this repo, a warp bubble is a modeled spacetime region defined by a shift vector field and expansion constraints.",
    });
    expect(rendered).toMatch(/^Definition:/m);
    expect(rendered).toMatch(/warp bubble is grounded in/i);
  });

  it("does not fall back to the legacy base deterministic repo renderer for definition_overview", () => {
    expect(
      __testHelixAskReliabilityGuards.selectDeterministicRepoRuntimeFallbackCandidate({
        promptFamily: "definition_overview",
        familyFallback: null,
        baseFallback: "How it is solved in codebase:\n\nWhy it matters:",
      }),
    ).toBeNull();
    expect(
      __testHelixAskReliabilityGuards.selectDeterministicRepoRuntimeFallbackCandidate({
        promptFamily: "definition_overview",
        familyFallback: "Definition:\n- warp bubble is grounded in docs/knowledge/warp/warp-bubble.md.",
        baseFallback: "How it is solved in codebase:\n\nWhy it matters:",
      }),
    ).toMatch(/^Definition:/);
  });

  it("preserves structured deterministic definition sections during noise stripping", () => {
    const raw = [
      "Definition:",
      "- In this codebase, warp bubble is grounded in docs/knowledge/warp/warp-bubble.md, with primary implementation surfaces in modules/warp/natario-warp.ts and modules/warp/warp-module.ts. [modules/warp/natario-warp.ts]",
      "",
      "Why it matters:",
      "- It provides a repo-grounded definition with explicit scope for follow-up mechanism or equation asks. [docs/knowledge/warp/warp-bubble.md]",
      "",
      "Key terms:",
      "- warp",
      "- bubble",
      "",
      "Repo anchors:",
      "- modules/warp/natario-warp.ts",
      "",
      "Sources: modules/warp/natario-warp.ts, modules/warp/warp-module.ts",
    ].join("\n");

    const cleaned =
      __testHelixAskReliabilityGuards.stripDeterministicNoiseArtifacts(raw);

    expect(cleaned).toMatch(/^Definition:/m);
    expect(cleaned).toMatch(/^- In this codebase, warp bubble is grounded in /m);
    expect(cleaned).toMatch(/^Why it matters:/m);
    expect(cleaned).toMatch(/^- It provides a repo-grounded definition/m);
    expect(cleaned).toMatch(/^Key terms:/m);
    expect(cleaned).toMatch(/^- warp$/m);
    expect(cleaned).toMatch(/^- bubble$/m);
    expect(cleaned).toMatch(/^Repo anchors:/m);
  });

  it("does not preserve deterministic answers across composer after llm invocation", () => {
    const preserve =
      __testHelixAskReliabilityGuards.shouldPreserveHelixAskDeterministicAnswerAcrossComposer({
        llmInvoked: true,
        answerPath: [
          "intent:hybrid.warp_ethos_relation",
          "answerContract:relation_packet_pre_llm",
        ],
    });
    expect(preserve).toBe(false);
  });

  it("restores deterministic platonic answers when platonic rewriting diverges", () => {
    expect(
      __testHelixAskReliabilityGuards.shouldRestoreHelixAskDeterministicPlatonicAnswer({
        preserveDeterministicPlatonicAnswer: true,
        ungatedReasoningAnswer:
          "Definition:\n- In this codebase, warp bubble is grounded in docs/knowledge/warp/warp-bubble.md.",
        platonicAnswer:
          "In this codebase, warp bubble is grounded in docs/knowledge/warp/warp-bubble.md. Definition:",
      }),
    ).toBe(true);

    expect(
      __testHelixAskReliabilityGuards.shouldRestoreHelixAskDeterministicPlatonicAnswer({
        preserveDeterministicPlatonicAnswer: false,
        ungatedReasoningAnswer: "Definition:\n- grounded.",
        platonicAnswer: "Flattened text.",
      }),
    ).toBe(false);
  });

  it("preserves pinned deterministic answer sections during generic cleanup", () => {
    const raw = [
      "Definition:",
      "- In this codebase, warp bubble is grounded in modules/warp/natario-warp.ts, with primary implementation surfaces in modules/warp/natario-warp.ts and modules/warp/warp-module.ts. [modules/warp/natario-warp.ts]",
      "",
      "Why it matters:",
      "- It provides a repo-grounded definition with explicit scope for follow-up mechanism or equation asks. [modules/warp/natario-warp.ts]",
      "",
      "Key terms:",
      "- warp",
      "- bubble",
      "",
      "Repo anchors:",
      "- modules/warp/natario-warp.ts",
      "",
      "Sources: modules/warp/natario-warp.ts, modules/warp/warp-module.ts",
    ].join("\n");

    const cleaned =
      __testHelixAskReliabilityGuards.sanitizePinnedHelixAskDeterministicAnswer(raw);

    expect(cleaned).toMatch(/^Definition:/m);
    expect(cleaned).toMatch(/^- In this codebase, warp bubble is grounded in /m);
    expect(cleaned).toMatch(/^Why it matters:/m);
    expect(cleaned).toMatch(/^- It provides a repo-grounded definition/m);
    expect(cleaned).toMatch(/^Key terms:/m);
    expect(cleaned).toMatch(/^- warp$/m);
    expect(cleaned).toMatch(/^- bubble$/m);
    expect(cleaned).toMatch(/^Repo anchors:/m);
    expect(cleaned).toMatch(/^Sources: modules\/warp\/natario-warp\.ts/m);
  });

  it("restores pinned deterministic answers after platonic finalize without flattening sections", () => {
    const raw = [
      "Definition:",
      "- In this codebase, warp bubble is grounded in modules/warp/natario-warp.ts, with primary implementation surfaces in modules/warp/natario-warp.ts and modules/warp/warp-module.ts.",
      "",
      "Repo anchors:",
      "- modules/warp/natario-warp.ts",
      "- modules/warp/warp-module.ts",
      "- server/energy-pipeline.ts",
      "",
      "Open Gaps:",
      "- Current evidence is incomplete for mechanism and failure-path coverage in this turn.",
      "",
      "Sources: modules/warp/natario-warp.ts, modules/warp/warp-module.ts, server/energy-pipeline.ts",
    ].join("\n");

    const cleaned =
      __testHelixAskReliabilityGuards.finalizePinnedHelixAskDeterministicAnswer({
        answer: raw,
        allowedSourcePaths: [
          "modules/warp/natario-warp.ts",
          "modules/warp/warp-module.ts",
          "server/energy-pipeline.ts",
        ],
        citationTokens: [
          "modules/warp/natario-warp.ts",
          "modules/warp/warp-module.ts",
          "server/energy-pipeline.ts",
        ],
      });

    expect(cleaned).toMatch(/^Definition:/m);
    expect(cleaned).toMatch(/^Repo anchors:/m);
    expect(cleaned).toMatch(/^Open Gaps:/m);
    expect(cleaned).toMatch(/^Sources: modules\/warp\/natario-warp\.ts/m);
    expect(cleaned).not.toMatch(/^In this codebase, warp bubble is grounded.*Definition:/m);
  });

  it("preserves open-world sources marker during deterministic finalize sanitization", () => {
    const raw = [
      "For uncertain open-world asks, summarize what is known and what remains unknown.",
      "",
      "Sources: open-world best-effort (no repo citations required).",
    ].join("\n");

    const cleaned =
      __testHelixAskReliabilityGuards.finalizePinnedHelixAskDeterministicAnswer({
        answer: raw,
        allowedSourcePaths: [],
        citationTokens: [],
      });

    expect(cleaned).toMatch(/^Sources: open-world best-effort \(no repo citations required\)\.$/m);
  });

  it("skips late citation relinking for pinned structured deterministic answers", () => {
    const skip =
      __testHelixAskReliabilityGuards.shouldSkipCitationRelinkingForStructuredDeterministicAnswer({
        deterministicAnswerPinnedPreFinalize: true,
        answerPath: [
          "answer:repo_runtime_deterministic_direct",
          "platonic:deterministic_restore_final",
        ],
        text: [
          "Definition:",
          "- In this codebase, warp bubble is grounded in modules/warp/natario-warp.ts.",
          "",
          "Repo anchors:",
          "- modules/warp/natario-warp.ts",
          "",
          "Open Gaps:",
          "- mechanism",
          "",
          "Sources: modules/warp/natario-warp.ts",
        ].join("\n"),
      });

    expect(skip).toBe(true);
  });

  it("preserves structured deterministic headings during final answer formatting", () => {
    const raw = [
      "Definition:",
      "- In this codebase, warp bubble is grounded in docs/knowledge/warp/warp-bubble.md.",
      "",
      "Repo anchors:",
      "- modules/warp/natario-warp.ts",
      "",
      "Sources: docs/knowledge/warp/warp-bubble.md, modules/warp/natario-warp.ts",
    ].join("\n");

    const formatted = __testHelixAskReliabilityGuards.formatHelixAskAnswer(raw);

    expect(formatted).toMatch(/^Definition:/m);
    expect(formatted).toMatch(/^Repo anchors:/m);
    expect(formatted).toMatch(/^Sources:/m);
  });

  it("disables stage05 llm summary in single-llm mode", () => {
    const policy = __testHelixAskReliabilityGuards.resolveStage05SummaryPolicy({
      singleLlm: true,
      llmFirstEnabled: true,
      summaryRequired: true,
      hardFailOnSummaryError: true,
    });
    expect(policy).toEqual({
      llmFirst: false,
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });
  });

  it("keeps stage05 llm summary enabled when single-llm mode is off", () => {
    const policy = __testHelixAskReliabilityGuards.resolveStage05SummaryPolicy({
      singleLlm: false,
      llmFirstEnabled: true,
      summaryRequired: true,
      hardFailOnSummaryError: true,
    });
    expect(policy).toEqual({
      llmFirst: true,
      summaryRequired: true,
      hardFailOnSummaryError: true,
    });
  });

  it("scrubs local cooldown llm errors when no llm invocation occurred", () => {
    const debugPayload: Record<string, unknown> = {
      llm_invoke_attempted: false,
      llm_error_code: "llm_http_429:109",
      llm_error_class: "rate_limited",
      llm_error_rate_limit_source: "local_cooldown",
      llm_first_rate_limited_source: "local_cooldown",
      llm_first_local_429_stage: "turn_start",
    };
    __testHelixAskReliabilityGuards.scrubSkippedLlmTransportErrors(
      debugPayload as {
        llm_invoke_attempted?: boolean;
        llm_error_code?: string | null;
        llm_error_rate_limit_source?: string | null;
        llm_first_rate_limited_source?: string | null;
      },
    );
    expect(debugPayload.llm_error_code).toBeUndefined();
    expect(debugPayload.llm_error_rate_limit_source).toBeUndefined();
    expect(debugPayload.llm_transport_state_suppressed).toBe("llm_http_429:109");
    expect(debugPayload.llm_transport_state_suppressed_reason).toBe(
      "no_llm_invocation_local_cooldown",
    );
  });

  it("does not scrub llm errors when an llm invocation occurred", () => {
    const debugPayload: Record<string, unknown> = {
      llm_invoke_attempted: true,
      llm_error_code: "llm_http_429",
      llm_error_rate_limit_source: "provider_429",
    };
    __testHelixAskReliabilityGuards.scrubSkippedLlmTransportErrors(
      debugPayload as {
        llm_invoke_attempted?: boolean;
        llm_error_code?: string | null;
        llm_error_rate_limit_source?: string | null;
        llm_first_rate_limited_source?: string | null;
      },
    );
    expect(debugPayload.llm_error_code).toBe("llm_http_429");
    expect(debugPayload.llm_transport_state_suppressed).toBeUndefined();
  });

  it("uses anchor files as confirmed evidence in single-LLM short fallback", () => {
    const fallback =
      __testHelixAskReliabilityGuards.buildSingleLlmShortAnswerFallback({
        question: "Explain the congruence of the warp bubble solution?",
        definitionFocus: false,
        docBlocks: [],
        codeAlignment: null,
        evidenceText: "Sources: modules/warp/natario-warp.ts",
        anchorFiles: ["modules/warp/natario-warp.ts", "docs/knowledge/warp/warp-bubble.md"],
        searchedTerms: ["warp bubble", "congruence"],
        searchedFiles: ["modules/warp/natario-warp.ts"],
        headingSeedSlots: [
          {
            id: "heading_warp",
            label: "Natário-Casimir Warp Bubble Operations Runbook",
            required: false,
            source: "heading",
            surfaces: [],
          },
        ],
        requiresRepoEvidence: true,
      }) ?? "";
    expect(fallback).toMatch(/^Confirmed:/i);
    expect(fallback).toMatch(/Retrieved grounded repository anchors:/i);
    expect(fallback).toMatch(/modules\/warp\/natario-warp\.ts/i);
    expect(fallback).not.toContain("�");
  });

  it("filters stage0 score/symbol/file metadata noise from deterministic fallback output", () => {
    const fallback =
      __testHelixAskReliabilityGuards.buildDeterministicRepoRuntimeFallback({
        question: "Define warp solve in full congruence.",
        format: "brief",
        definitionFocus: true,
        docBlocks: [
          {
            path: "docs/warp-geometry-congruence-report.md",
            block:
              "docs/warp-geometry-congruence-report.md\nDefinition: Warp solve in this repo is a constrained metric + guardrail solve pipeline.",
          },
        ],
        codeAlignment: null,
        evidenceText: [
          "Stage-0 candidate: docs/warp-canonical-runtime-overview.md",
          "score=30.000 | symbol=stage0 | file=docs/warp-canonical-runtime-overview.md",
          "Definition: Warp solve in this repo is a constrained metric + guardrail solve pipeline.",
          "Sources: docs/warp-geometry-congruence-report.md",
        ].join("\n"),
        anchorFiles: ["docs/warp-geometry-congruence-report.md"],
      }) ?? "";

    expect(fallback).toBeTruthy();
    expect(fallback).not.toMatch(/score=\d/i);
    expect(fallback).not.toMatch(/\bsymbol=/i);
    expect(fallback).not.toMatch(/\bfile=/i);
  });

  it("filters heading-index scaffold noise from deterministic fallback output", () => {
    const fallback =
      __testHelixAskReliabilityGuards.buildDeterministicRepoRuntimeFallback({
        question: "Explain the congruence of the warp bubble solution.",
        format: "brief",
        definitionFocus: true,
        docBlocks: [
          {
            path: "modules/warp/natario-warp.ts",
            block:
              "Goals & invariants Components 1 Physics engine 2 Tools 3 Runtime. The Natario zero-expansion model defines the warp bubble congruence guardrails.",
          },
        ],
        codeAlignment: null,
        evidenceText: [
          "Goals & invariants Components 1 Physics engine 2 Tools 3 Runtime.",
          "Mechanism: Goals & invariants Components 1 Physics engine 2 Tools -> constrained interaction dynamics -> Goals & invariants Components 1 Physics engine 2 Tools.",
          "The Natario zero-expansion model defines the warp bubble congruence guardrails and expansion constraints.",
          "Sources: modules/warp/natario-warp.ts",
        ].join("\n"),
        anchorFiles: ["modules/warp/natario-warp.ts"],
      }) ?? "";

    expect(fallback).toBeTruthy();
    expect(fallback).not.toMatch(/Goals\s*&\s*invariants/i);
    expect(fallback).not.toMatch(/Components\s+1/i);
    expect(fallback).not.toMatch(/In practice,\s+coupled constraints and feedback loops/i);
    expect(fallback).toMatch(/Natario zero-expansion model defines/i);
  });

  it("builds evidence packet v2 with canonical retrieval and coverage snapshot", () => {
    const packet = __testHelixAskReliabilityGuards.buildHelixAskEvidencePacketV2({
      route: "repo",
      question: "What is a warp bubble Natario solve?",
      intentId: "repo.warp_definition_docs_first",
      intentDomain: "repo",
      contextFiles: ["docs/knowledge/warp/warp-bubble.md"],
      contextText:
        "Definition docs: docs/knowledge/warp/warp-bubble.md\nSources: docs/knowledge/warp/warp-bubble.md",
      docBlocks: [
        {
          path: "docs/knowledge/warp/warp-bubble.md",
          block:
            "docs/knowledge/warp/warp-bubble.md\nDefinition: In this repo, a warp bubble model is represented with Natario-compatible shift and guardrail checks.",
        },
      ],
      retrievalConfidence: 0.91,
      retrievalDocShare: 0.88,
      slotCoverage: { ratio: 0.75, missingSlots: ["warp_equation_anchor"] },
      docCoverage: { ratio: 1, missingSlots: [] },
      channelContributions: { atlas: { hits: 4, used: true } },
      sections: [
        {
          id: "repo",
          label: "Repo evidence",
          content:
            "Definition: docs/knowledge/warp/warp-bubble.md describes the repo-specific warp bubble abstraction.\nSources: docs/knowledge/warp/warp-bubble.md",
        },
        {
          id: "constraint",
          label: "Constraint evidence",
          content: "Constraint path: server/routes/agi.plan.ts",
        },
      ],
      preferredEvidenceText:
        "Definition: docs/knowledge/warp/warp-bubble.md describes the repo-specific warp bubble abstraction.\nSources: docs/knowledge/warp/warp-bubble.md",
    });

    expect(packet.version).toBe("repo_atlas_evidence_packet_v2");
    expect(packet.route).toBe("repo");
    expect(packet.sections.map((section) => section.id)).toEqual(["repo", "constraint"]);
    expect(packet.evidenceText).toContain("warp-bubble.md");
    expect(packet.evidenceCardsText).toMatch(/Repo evidence:/);
    expect(packet.contextFiles).toContain("docs/knowledge/warp/warp-bubble.md");
    expect(packet.sources).toContain("docs/knowledge/warp/warp-bubble.md");
    expect(packet.coverage.slotMissing).toEqual(["warp_equation_anchor"]);
    expect(packet.retrieval.confidence).toBeGreaterThan(0.8);
  });

  it("does not require equation-quote contract for broad congruence definitions", () => {
    const question = "Okay, define what a warp solve is in full congruence.";
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question,
      answer:
        "A warp solve is the repo's constrained solve flow for metric + guardrail checks. [docs/warp-geometry-congruence-report.md]",
      allowedCitations: ["docs/warp-geometry-congruence-report.md"],
    });

    expect(__testHelixAskReliabilityGuards.isWarpMathBroadPrompt(question)).toBe(true);
    expect(__testHelixAskReliabilityGuards.isEquationQuotePrompt(question)).toBe(false);
    expect(contract.required).toBe(false);
    expect(contract.ok).toBe(true);
    expect(contract.reason).toBe("not_required");
  });

  it("requires equation-quote contract for explicit equation requests", () => {
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "Show one warp congruence equation from docs and explain it.",
      answer: "Warp congruence is discussed in the report. [docs/warp-geometry-congruence-report.md]",
      allowedCitations: ["docs/warp-geometry-congruence-report.md"],
    });

    expect(__testHelixAskReliabilityGuards.isEquationQuotePrompt("show one equation from docs")).toBe(true);
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(false);
    expect(contract.reason === "equation_missing" || contract.reason === "equation_and_citation_missing").toBe(true);
  });

  it("treats explain-equation prompts as soft equation quote requests", () => {
    const question = "explain equation of the collapse of the wave function?";
    expect(__testHelixAskReliabilityGuards.isEquationQuotePrompt(question)).toBe(true);
    expect(__testHelixAskReliabilityGuards.isEquationStrictQuotePrompt(question)).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationStrictQuotePrompt(
        "show exact equation line for collapse and cite it",
      ),
    ).toBe(true);
  });

  it("builds a sourced soft fallback message for collapse equation prompts", () => {
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(
      "explain equation of the collapse of the wave function?",
    );
    const message = __testHelixAskReliabilityGuards.buildEquationSoftFallbackMessage({
      question: "explain equation of the collapse of the wave function?",
      citationHints: ["server/services/mixer/collapse.ts", "shared/dp-collapse.ts"],
      queryConstraints: constraints,
    });
    expect(
      /^Exact equation line|couldn't verify a verbatim wave-function-collapse equation line|grounded equation candidates|Primary Topic:\s*collapse|Primary Equation \((?:Tentative|Verified)\)/i.test(
        message,
      ),
    ).toBe(true);
    expect(message).toMatch(/server\/services\/mixer\/collapse\.ts|shared\/dp-collapse\.ts/i);
    expect(message).toMatch(/Sources:/i);
  });

  it("builds progressive equation candidates when near-miss evidence includes concrete equations", () => {
    const relPath = ".tmp-stage05-tests/collapse-soft-fallback-candidates.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "collapse notes",
        "psi = Pm psi0 / sqrt(prob)",
        "rho_hat = sum_k p_k |k><k|",
      ].join("\n"),
      "utf8",
    );
    try {
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(
        "explain equation of the collapse of the wave function?",
      );
      const message = __testHelixAskReliabilityGuards.buildEquationSoftFallbackMessage({
        question: "explain equation of the collapse of the wave function?",
        citationHints: [relPath],
        queryConstraints: constraints,
      });
      expect(
        /grounded equation candidates|^Exact equation line|Primary Topic:\s*collapse|Primary Equation \((?:Tentative|Verified)\)/i.test(
          message,
        ),
      ).toBe(true);
      expect(message).toContain(relPath);
      expect(message).toMatch(/\bpsi\s*=/i);
      expect(message).toMatch(/Sources:/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("flags degenerate equation fallback text for generic bypass", () => {
    const question = "explain equation of the collapse of the wave function?";
    const draft =
      "Claim-first explanation:\n1. [server/services/mixer/collapse.ts] Grounded equation candidates were retrieved, but no exact canonical line was verifiable in this turn.";
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question,
      answer: draft,
      allowedCitations: ["server/services/mixer/collapse.ts"],
    });
    const shouldBypass = __testHelixAskReliabilityGuards.shouldApplyEquationGenericBypass({
      question,
      draftAnswer: draft,
      contract,
      stage05Cards: [],
      stage05CoverageSatisfied: false,
      strictRequired: false,
    });
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(false);
    expect(shouldBypass).toBe(true);
  });

  it("does not trigger generic bypass for a valid cited equation answer", () => {
    const question = "show exact equation line for collapse and cite it";
    const draft = [
      "Exact equation line (shared/dp-collapse.ts:L42):",
      "psi' = Pm psi / sqrt(<psi|Pm|psi>)",
      "Meaning: the post-measurement state is the normalized projection onto the measured subspace.",
      "Sources: shared/dp-collapse.ts",
    ].join("\n");
    const contract = {
      required: true,
      ok: true,
      answerHasEquation: true,
      citationMatched: true,
      matchedNeedle: true,
      matchedCitations: ["shared/dp-collapse.ts"],
      reason: "ok",
      questionNeedles: ["psi"],
    } as const;
    const shouldBypass = __testHelixAskReliabilityGuards.shouldApplyEquationGenericBypass({
      question,
      draftAnswer: draft,
      contract,
      stage05Cards: [],
      stage05CoverageSatisfied: true,
      strictRequired: true,
    });
    expect(shouldBypass).toBe(false);
  });

  it("builds claim-first equation backing with primary and support equations for broad prompts", () => {
    const primaryPath = ".tmp-stage05-tests/equation-claim-backing-primary.md";
    const supportPath = ".tmp-stage05-tests/equation-claim-backing-support.ts";
    const primaryFullPath = path.join(process.cwd(), primaryPath);
    const supportFullPath = path.join(process.cwd(), supportPath);
    fs.mkdirSync(path.dirname(primaryFullPath), { recursive: true });
    fs.writeFileSync(
      primaryFullPath,
      [
        "Dynamic Casimir relation",
        "omega_casimir_out = omega_casimir_in + delta_omega",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      supportFullPath,
      [
        "export const stress = true;",
        "casimir_power = omega_casimir_out * hbar",
      ].join("\n"),
      "utf8",
    );
    try {
      const question =
        "Show one equation from .tmp-stage05-tests/equation-claim-backing-primary.md and explain how it feeds into outputs.";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer:
          "Dynamic Casimir modulation feeds a downstream energy computation path in this system.",
        answerContract: {
          summary: "Casimir modulation affects output energy terms.",
          claims: [
            { text: "Dynamic Casimir modulation changes modeled output frequency." },
            { text: "The output feed is computed in code paths tied to Casimir modules." },
          ],
          sources: [primaryPath, supportPath],
        },
        evidenceText: `Sources: ${primaryPath}, ${supportPath}`,
        docBlocks: [{ path: primaryPath, block: "omega_casimir_out = omega_casimir_in + delta_omega" }],
        codeAlignment: {
          spans: [
            {
              filePath: supportPath,
              symbol: "stress",
              span: "L2",
              snippet: "casimir_power = omega_casimir_out * hbar",
              isTest: false,
            },
          ],
          symbols: [],
          resolved: [supportPath],
        },
        allowedCitations: [primaryPath, supportPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.mode).toBe("equation_claim_backing");
      expect(result?.text).toMatch(/Primary Topic:/i);
      expect(result?.text).toMatch(/Primary Equation \(Verified\):/i);
      expect(result?.text).toMatch(/Mechanism Explanation:/i);
      expect(result?.supportSelectedCount ?? 0).toBeGreaterThanOrEqual(1);
      expect(result?.candidateTotal ?? 0).toBeGreaterThan(0);
      expect(result?.candidateRejectedTotal ?? 0).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result?.candidateRejectedReasons)).toBe(true);
      expect(result?.text).toMatch(/Term-to-implementation mapping/i);
    } finally {
      fs.rmSync(primaryFullPath, { force: true });
      fs.rmSync(supportFullPath, { force: true });
    }
  });

  it("scans stage-0.5 card paths for equation backing even when citation hints are empty", () => {
    const relPath = ".tmp-stage05-tests/stage05-path-scan-equation.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export const collapseModel = true;",
        "psi = Pm psi0 / sqrt(prob)",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer:
          "Claim-first explanation:\n1. [server/services/mixer/collapse.ts] Grounded equation candidates were retrieved.",
        answerContract: null,
        evidenceText: "",
        docBlocks: [],
        codeAlignment: null,
        stage05Cards: [
          {
            path: relPath,
            kind: "code",
            summary: "Collapse update implementation.",
            symbolsOrKeys: ["collapseModel"],
            snippets: [
              {
                start: 1,
                end: 1,
                text: "export const collapseModel = true;",
              },
            ],
            confidence: 0.92,
            slotHits: ["equation", "code_path"],
          },
        ],
        allowedCitations: [],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.tentative).toBe(true);
      expect(result?.primarySelected).toMatch(new RegExp(`^${relPath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:L\\d+$`));
      expect(result?.text).toMatch(/\bpsi\s*=/i);
      expect(result?.text).toMatch(/Primary Equation \(Tentative\):/i);
      expect(result?.primaryClass).toBe("implementation_assignment");
      expect(result?.text).toMatch(/Mechanism Explanation:/i);
      expect(result?.text).not.toMatch(/Grounded equation candidates were retrieved/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("prioritizes explicit symbol-targeted collapse equations for specific prompts", () => {
    const relPath = "shared/collapse-benchmark.ts";
    const fullPath = path.join(process.cwd(), relPath);
    const fileLines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    const snippetText = fileLines.slice(559, 572).join("\n");
    const question =
      "From shared/collapse-benchmark.ts, quote the exact equation lines computing rho_eff_kg_m3 and kappa_collapse_m2 around lines 570-571, then explain each symbol.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
      question,
      draftAnswer: "",
      answerContract: null,
      evidenceText: `Sources: ${relPath}`,
      docBlocks: [{ path: relPath, block: snippetText }],
      codeAlignment: null,
      stage05Cards: [
        {
          path: relPath,
          summary: "Collapse diagnostics equations",
          slotHits: ["equation", "code_path"],
          confidence: 0.9,
          snippets: [{ start: 560, end: 572, text: snippetText }],
        },
      ],
      allowedCitations: [relPath],
      queryConstraints: constraints,
      strictPrompt: false,
      explicitPathOnlyExtraction: false,
    });
    expect(result).toBeTruthy();
    expect(result?.primarySelected).toMatch(/shared\/collapse-benchmark\.ts:L(627|628)/);
    expect(result?.text).toMatch(/rho_eff_kg_m3|kappa_collapse_m2/i);
  });

  it("keeps strict equation prompts as exact-line plus explanation in claim-backing mode", () => {
    const relPath = ".tmp-stage05-tests/equation-claim-backing-strict.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "Strict relation",
        "psi = Pm psi0 / sqrt(prob)",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "show exact equation line for collapse and cite it";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Collapse behavior is tied to projection and probability normalization.",
        answerContract: {
          summary: "Collapse uses projection-normalized state updates.",
          claims: [{ text: "Collapse picks a projected state with normalized probability." }],
          sources: [relPath],
        },
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "psi = Pm psi0 / sqrt(prob)" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: true,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.tentative).toBe(false);
      expect(result?.text).toMatch(/Primary Equation \(Verified\):/i);
      expect(result?.text).toMatch(/^Exact equation line \(.+?:L\d+\):/m);
      expect(result?.text).toMatch(/Mechanism Explanation:/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("returns claim-first tentative backing when no exact equation line is verifiable", () => {
    const relPath = ".tmp-stage05-tests/equation-claim-backing-tentative.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "Collapse narrative",
        "No explicit math equation on this line.",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Wave-function collapse transitions from superposition to a measured outcome.",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "Collapse narrative without direct equation." }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.tentative).toBe(true);
      expect(result?.text).toMatch(/Primary Topic:\s*collapse/i);
      expect(result?.text).toMatch(/Primary Equation \(Tentative\):/i);
      expect(result?.text).toMatch(/Mechanism Explanation:/i);
      expect(result?.text).not.toMatch(/Please provide module\/path\/symbol/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("adds consensus baseline and repo support/challenge lines in mechanism sections", () => {
    const relPath = ".tmp-stage05-tests/equation-claim-backing-mechanism-frame.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export function collapseUpdate(psi0: number, Pm: number, prob: number) {",
        "  psi = Pm psi0 / sqrt(prob);",
        "  return psi;",
        "}",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Collapse chooses a projected state and normalizes by probability.",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "psi = Pm psi0 / sqrt(prob)" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.text).toMatch(/General-reference baseline:/i);
      expect(result?.text).toMatch(/Repo-grounded support:/i);
      expect(result?.text).toMatch(/Challenge status:/i);
      expect(result?.text).toMatch(/Term-to-implementation mapping:/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("dedupes mechanism lines and strips section-heading echoes from claim bodies", () => {
    const relPath = ".tmp-stage05-tests/equation-claim-backing-dedupe.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export function collapseUpdate(psi0: number, Pm: number, prob: number) {",
        "  const psi = (Pm * psi0) / Math.sqrt(Math.max(1e-30, prob));",
        "  return psi;",
        "}",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const draftAnswer = [
        "Primary Topic: collapse",
        "Primary Equation (Tentative):",
        "- [shared/dp-collapse.ts:L280] volume = (4 / 3) * PI * r * r * r",
        "Mechanism Explanation:",
        "1. General-reference baseline: Pr(m) = ||Pm psi||^2 and psi' = (Pm psi) / sqrt(<psi|Pm|psi>) describe measurement projection and normalization.",
        "2. General-reference baseline: Pr(m) = ||Pm psi||^2 and psi' = (Pm psi) / sqrt(<psi|Pm|psi>) describe measurement projection and normalization.",
      ].join("\n");
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer,
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "const psi = (Pm * psi0) / Math.sqrt(Math.max(1e-30, prob));" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      const mechanismSection =
        (result?.text.match(/Mechanism Explanation:\n([\s\S]*?)(?:\n\n(?:Related Cross-Topic Evidence|Rejected Candidates|Sources):|$)/i)?.[1] ??
          "") + "";
      const numberedLines = mechanismSection
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d+\.\s+/.test(line));
      expect(numberedLines.length).toBeGreaterThan(0);
      expect(numberedLines.length).toBeLessThanOrEqual(4);
      expect(mechanismSection).not.toMatch(/Primary Equation\s*\(/i);
      expect(mechanismSection).not.toMatch(/Mechanism Explanation\s*:/i);
      const baselineCount = (mechanismSection.match(/general-reference baseline:/gi) ?? []).length;
      expect(baselineCount).toBe(1);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("hard-locks dominant family so cross-topic equations cannot become primary", () => {
    const relPath = ".tmp-stage05-tests/warp-cross-topic-equation.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "Warp relation",
        "ds^2 = -(alpha^2 - beta_i beta^i) dt^2 + 2 beta_i dx^i dt + gamma_ij dx^i dx^j",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "The system computes collapse updates from probability-projection rules.",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "ds^2 = -(alpha^2 - beta_i beta^i) dt^2" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.dominantFamily).toBe("collapse");
      expect(result?.primarySelected).toBeNull();
      expect(result?.tentative).toBe(true);
      expect(result?.text).toMatch(/Primary Equation \(Tentative\):/i);
      expect(result?.text).not.toMatch(/Primary Equation \(Verified\):[\s\S]*ds\^2/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("promotes in-family implementation equations as tentative primary when canonical lines are unavailable", () => {
    const relPath = ".tmp-stage05-tests/collapse-implementation-equation.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export function collapseDiagnostics(psi0: number, Pm: number, prob: number) {",
        "  const psi_next = (Pm * psi0) / Math.sqrt(Math.max(1e-30, prob));",
        "  return psi_next;",
        "}",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Collapse diagnostics use a probability-normalized psi update relation.",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "const psi_next = (Pm * psi0) / Math.sqrt(Math.max(1e-30, prob))" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.primarySelected).toMatch(
        new RegExp(`^${relPath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:L\\d+$`),
      );
      expect(result?.primaryClass).toBe("implementation_assignment");
      expect(result?.tentative).toBe(true);
      expect(result?.text).toMatch(/Primary Equation \(Tentative\):/i);
      expect(result?.text).toMatch(/psi_next/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rejects non-math implementation assignments as primary equation candidates", () => {
    const relPath = ".tmp-stage05-tests/collapse-non-math-assignment.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export function normalizeContent(artifact: { contentType?: string }) {",
        "  const contentType = artifact.contentType ?? \"text/plain; charset=utf-8\";",
        "  return contentType;",
        "}",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Collapse explanation should avoid non-math string assignments as equation anchors.",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "const contentType = artifact.contentType ?? \"text/plain; charset=utf-8\"" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.primarySelected).toBeNull();
      expect(result?.tentative).toBe(true);
      expect(result?.text).not.toMatch(/contentType\s*[:=]/i);
      expect(result?.candidateRejectedTotal ?? 0).toBeGreaterThanOrEqual(0);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rejects trace/table equation rows from primary selection and records rejection reasons", () => {
    const tracePath = ".tmp-stage05-tests/trace-equation-table.md";
    const collapsePath = ".tmp-stage05-tests/collapse-equation.ts";
    const traceFullPath = path.join(process.cwd(), tracePath);
    const collapseFullPath = path.join(process.cwd(), collapsePath);
    fs.mkdirSync(path.dirname(traceFullPath), { recursive: true });
    fs.writeFileSync(
      traceFullPath,
      [
        "| SRC-062 | EQT-062-01 | Eq. (3) TLS fit form |",
        "| SRC-063 | EQT-063-01 | Eq. (4) filling factor |",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      collapseFullPath,
      [
        "export const collapseOp = true;",
        "psi = Pm psi0 / sqrt(prob)",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Collapse updates normalize projected states by probability.",
        answerContract: null,
        evidenceText: `Sources: ${tracePath}, ${collapsePath}`,
        docBlocks: [
          { path: tracePath, block: "| SRC-062 | EQT-062-01 | Eq. (3) TLS fit form |" },
          { path: collapsePath, block: "psi = Pm psi0 / sqrt(prob)" },
        ],
        codeAlignment: null,
        allowedCitations: [tracePath, collapsePath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.primarySelected).toMatch(new RegExp(`^${collapsePath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:L\\d+$`));
      expect(result?.text).not.toMatch(/\| SRC-062 \|/i);
      expect(result?.text).not.toMatch(/\| EQT-062-01 \|/i);
      if ((result?.rejectedReasons ?? []).length > 0) {
        expect(result?.rejectedReasons ?? []).toContain("metadata_trace");
      }
    } finally {
      fs.rmSync(traceFullPath, { force: true });
      fs.rmSync(collapseFullPath, { force: true });
    }
  });

  it("rejects generic geometry equations as primary for wave-collapse prompts", () => {
    const volumePath = ".tmp-stage05-tests/collapse-generic-geometry.ts";
    const psiPath = ".tmp-stage05-tests/collapse-psi-equation.ts";
    const volumeFullPath = path.join(process.cwd(), volumePath);
    const psiFullPath = path.join(process.cwd(), psiPath);
    fs.mkdirSync(path.dirname(volumeFullPath), { recursive: true });
    fs.writeFileSync(
      volumeFullPath,
      [
        "export const volumeOfSphere = (r: number) => {",
        "  const volume = (4 / 3) * PI * r * r * r;",
        "  return volume;",
        "};",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      psiFullPath,
      [
        "export function collapseUpdate(psi0: number, Pm: number, prob: number) {",
        "  const psi = (Pm * psi0) / Math.sqrt(Math.max(1e-30, prob));",
        "  return psi;",
        "}",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "explain equation of the collapse of the wave function?";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Collapse uses projection and probability-normalized state update.",
        answerContract: null,
        evidenceText: `Sources: ${volumePath}, ${psiPath}`,
        docBlocks: [
          { path: volumePath, block: "const volume = (4 / 3) * PI * r * r * r;" },
          { path: psiPath, block: "const psi = (Pm * psi0) / Math.sqrt(prob);" },
        ],
        codeAlignment: null,
        allowedCitations: [volumePath, psiPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.text).toMatch(/Primary Topic:\s*collapse/i);
      expect(result?.primarySelected ?? "").toContain(psiPath);
      expect(result?.text).toMatch(/\bpsi\b/i);
      expect(result?.text).not.toMatch(/\bvolume\s*=\s*\(4\s*\/\s*3\)/i);
      expect(result?.candidateRejectedTotal ?? 0).toBeGreaterThanOrEqual(0);
    } finally {
      fs.rmSync(volumeFullPath, { force: true });
      fs.rmSync(psiFullPath, { force: true });
    }
  });

  it("filters checklist/config false positives and prefers domain-math lines", () => {
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "docs/warp-roadmap.md",
        line: "- [ ] theta_geom = true and set",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "docs/collapse-benchmark-backend-roadmap.md",
        line: "session_id={ID}&session_type={TYPE}&dt_ms=50&r_c_m=0",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "configs/graph-resolvers.json",
        line: "path = \"docs/warp-geometry-congruence-report.md\"",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "cli/collapse-bench.ts",
        line: "const manifestPath = path.resolve(args.manifest ?? \"datasets/benchmarks/collapse-benchmark.fixture.json\");",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "server/services/mixer/collapse.ts",
        line: "const msg = \"equation path a/b + c/d\";",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "modules/dynamic/stress-energy-equations.ts",
        line: "T00 = rho + p",
      }),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "server/energy-pipeline.ts",
        line: "(state as any).gammaVanDenBroeck_mass = state.gammaVanDenBroeck; // pipeline value",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "server/energy-pipeline.ts",
        line: "gammaVanDenBroeck_mass = state.gammaVanDenBroeck",
      }),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationExactLineEligible({
        path: "modules/dynamic/stress-energy-equations.ts",
        line: "// ---------- Stressâ€“energy tensor (perfect-fluid proxy, w = âˆ’1) ----------",
      }),
    ).toBe(false);
  });

  it("treats TS assertion property assignments as tentative implementation evidence", () => {
    const relPath = ".tmp-stage05-tests/phase-ts-assert-assignment.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export function syncPhase(state: { gamma?: number; gammaOut?: number }) {",
        "  (state as any).gammaOut = state.gamma;",
        "  return state;",
        "}",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "Provide one equation-like relation used by phase scheduler or energy pipeline and explain its role.";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Phase updates are propagated through state assignments in the pipeline.",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "(state as any).gammaOut = state.gamma;" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.primaryClass).toBeNull();
      expect(result?.primarySelected).toBeNull();
      expect(result?.tentative).toBe(true);
      expect(result?.text).toMatch(/Primary Equation \(Tentative\):/i);
      expect(result?.text).not.toMatch(/Primary Equation \(Verified\):/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rejects mojibake comment equations from primary selection", () => {
    const relPath = ".tmp-stage05-tests/mojibake-comment-equation.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export function stressEnergyFromDensity(rho: number) {",
        "  // T00 = Ï ; Tij = âˆ’Ï Î´ij",
        "  return rho;",
        "}",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = "Give one scientifically relevant equation grounded in repo evidence and explain what each term does in the system.";
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "Stress-energy relations are used as physics constraints in implementation.",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "// T00 = Ï ; Tij = âˆ’Ï Î´ij" }],
        codeAlignment: null,
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
      });
      expect(result).toBeTruthy();
      expect(result?.primarySelected).toBeNull();
      expect(
        (result?.rejectedReasons ?? []).some((reason) =>
          ["comment_mojibake_equation", "mojibake_non_math_equation", "mojibake_generic_equation"].includes(reason),
        ),
      ).toBe(true);
      expect(result?.text).toMatch(/Primary Equation \(Tentative\):/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rescues explicit-path equation requests by scanning the requested file", () => {
    const relPath = ".tmp-stage05-tests/explicit-equation-rescue.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "# Congruence note",
        "Intermediate text",
        "ds^2 = -alpha^2 dt^2 + gamma_ij (dx^i - beta^i dt)(dx^j - beta^j dt)",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "Show one warp congruence equation from docs and explain it.",
        explicitPaths: [relPath],
        allowedCitations: [relPath],
      });
      expect(rescue).toBeTruthy();
      expect(rescue?.path).toBe(relPath);
      expect(rescue?.equation).toMatch(/ds\^2/i);
      const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
        question: "Show one warp congruence equation from docs and explain it.",
        answer: rescue?.answer ?? "",
        allowedCitations: [relPath],
      });
      expect(contract.required).toBe(true);
      expect(contract.ok).toBe(true);
      expect(contract.reason).toBe("ok");
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rescues non-explicit equation requests by scanning allowed citation files", () => {
    const relPath = ".tmp-stage05-tests/general-equation-rescue.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "# Warp congruence context",
        "alpha note",
        "ds^2 = -(alpha^2 - beta_i beta^i) dt^2 + 2 beta_i dx^i dt + gamma_ij dx^i dx^j",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "Can you show one warp congruence equation and explain it with citation?",
        explicitPaths: [],
        allowedCitations: [relPath],
      });
      expect(rescue).toBeTruthy();
      expect(rescue?.path).toBe(relPath);
      expect(rescue?.equation).toMatch(/ds\^2/i);
      const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
        question: "Can you show one warp congruence equation and explain it with citation?",
        answer: rescue?.answer ?? "",
        allowedCitations: [relPath],
      });
      expect(contract.required).toBe(true);
      expect(contract.ok).toBe(true);
      expect(contract.reason).toBe("ok");
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rescues broad equation requests when equation files are beyond early citation positions", () => {
    const tempDir = path.join(process.cwd(), ".tmp-stage05-tests");
    fs.mkdirSync(tempDir, { recursive: true });
    const noisePaths: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      const rel = `.tmp-stage05-tests/noise-${i}.md`;
      const full = path.join(process.cwd(), rel);
      fs.writeFileSync(full, `# noise ${i}\nThis file has prose but no equation line.\n`, "utf8");
      noisePaths.push(rel);
    }
    const targetRel = ".tmp-stage05-tests/warp-geometry-equation-target.md";
    const targetFull = path.join(process.cwd(), targetRel);
    fs.writeFileSync(
      targetFull,
      [
        "# Warp congruence target",
        "K_ij = (1 / (2 alpha)) (D_i beta_j + D_j beta_i - d_t gamma_ij)",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "What equation defines warp congruence in this codebase? Cite the file and equation.",
        explicitPaths: [],
        allowedCitations: [...noisePaths, targetRel],
      });
      expect(rescue).toBeTruthy();
      expect(rescue?.path).toBe(targetRel);
      expect(rescue?.equation).toMatch(/K_ij\s*=/i);
      const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
        question: "What equation defines warp congruence in this codebase? Cite the file and equation.",
        answer: rescue?.answer ?? "",
        allowedCitations: [...noisePaths, targetRel],
      });
      expect(contract.required).toBe(true);
      expect(contract.ok).toBe(true);
      expect(contract.reason).toBe("ok");
    } finally {
      for (const rel of [...noisePaths, targetRel]) {
        fs.rmSync(path.join(process.cwd(), rel), { force: true });
      }
    }
  });

  it("rescues equation quote from a live-like warp citation pack", () => {
    const allowed = [
      "docs/knowledge/warp/natario-zero-expansion.md",
      "modules/warp/natario-warp.ts",
      "docs/knowledge/warp/warp-bubble.md",
      "docs/warp-geometry-comparison.md",
      "docs/warp-geometry-congruence-state-of-the-art.md",
      "docs/knowledge/warp/warp-mechanics-tree.json",
      "docs/knowledge/physics/math-maturity-stages.md",
      "docs/alcubierre-alignment.md",
    ];
    const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
      question: "What equation defines warp congruence in this codebase? Cite the file and equation.",
      explicitPaths: [],
      allowedCitations: allowed,
    });
    expect(rescue).toBeTruthy();
    expect(allowed.includes(rescue?.path ?? "")).toBe(true);
    expect(rescue?.equation).toMatch(/=/);
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "What equation defines warp congruence in this codebase? Cite the file and equation.",
      answer: rescue?.answer ?? "",
      allowedCitations: allowed,
    });
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(true);
    expect(contract.reason).toBe("ok");
  });

  it("prefers mathematical equation lines over prose note lines with incidental assignments", () => {
    const relPath = ".tmp-stage05-tests/equation-vs-notes.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "Notes: warpFieldType=\"natario\" and mode=\"calibrated\" for the current run.",
        "Additional descriptive text that should not be selected as equation evidence.",
        "ds^2 = -(alpha^2 - beta_i beta^i) dt^2 + 2 beta_i dx^i dt + gamma_ij dx^i dx^j",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "Show one warp congruence equation and cite it.",
        explicitPaths: [],
        allowedCitations: [relPath],
      });
      expect(rescue).toBeTruthy();
      expect(rescue?.equation).toMatch(/ds\^2/i);
      expect(rescue?.equation?.toLowerCase().includes("notes:")).toBe(false);
      const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
        question: "Show one warp congruence equation and cite it.",
        answer: rescue?.answer ?? "",
        allowedCitations: [relPath],
      });
      expect(contract.required).toBe(true);
      expect(contract.ok).toBe(true);
      expect(contract.reason).toBe("ok");
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("extracts concise equation fragment when a line mixes prose and equation", () => {
    const relPath = ".tmp-stage05-tests/equation-fragment-inline.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "Important congruence sign note: since beta^i = -X^i, the ADM formula K_ij = 1/2 (d_i beta_j + d_j beta_i - d_t gamma_ij) with d_t gamma = 0 equals minus Natario's K_ij.",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "What equation defines warp congruence in this codebase? Cite the file and equation.",
        explicitPaths: [],
        allowedCitations: [relPath],
      });
      expect(rescue).toBeTruthy();
      expect(rescue?.path).toBe(relPath);
      expect(rescue?.equation).toMatch(/^K_ij\s*=/i);
      expect(rescue?.equation?.toLowerCase().startsWith("important congruence sign note")).toBe(false);
      const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
        question: "What equation defines warp congruence in this codebase? Cite the file and equation.",
        answer: rescue?.answer ?? "",
        allowedCitations: [relPath],
      });
      expect(contract.required).toBe(true);
      expect(contract.ok).toBe(true);
      expect(contract.reason).toBe("ok");
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("does not rescue config-like boolean assignment lines as equations", () => {
    const relPath = ".tmp-stage05-tests/equation-boolean-assignment.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "theta_geom=true and set",
        "theta_metric=false",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "Can you show one equation used in warp congruence and explain what it means",
        explicitPaths: [],
        allowedCitations: [relPath],
      });
      expect(rescue).toBeNull();
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rejects generic geometry equations for wave-function collapse prompts", () => {
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "explain equation of the collapse of the wave function?",
      answer:
        "Exact equation line (shared/collapse-benchmark.ts:L566): V_c = (4/3) pi r_c^3\nSources: shared/collapse-benchmark.ts",
      allowedCitations: ["shared/collapse-benchmark.ts"],
    });
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(false);
    expect(contract.reason).toBe("equation_relevance_missing");
    expect(contract.equationRelevanceReason).toBe("generic_geometry_mismatch");
  });

  it("rejects stress-energy comment equations for wave-function collapse prompts", () => {
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "explain equation of the collapse of the wave function?",
      answer:
        "Exact equation line (modules/dynamic/stress-energy-equations.ts:L175): // T00 = rho ; Tij = -rho delta_ij\nSources: modules/dynamic/stress-energy-equations.ts",
      allowedCitations: ["modules/dynamic/stress-energy-equations.ts"],
    });
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(false);
    expect(contract.reason).toBe("equation_relevance_missing");
  });

  it("does not report equation relevance when no equation is present", () => {
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "explain equation of the collapse of the wave function?",
      answer: "I cannot find an equation yet. Sources: server/services/mixer/collapse.ts",
      allowedCitations: ["server/services/mixer/collapse.ts"],
    });
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(false);
    expect(contract.reason).toBe("equation_missing");
    expect(contract.equationRelevanceRequired).toBe(false);
    expect(contract.equationRelevanceReason).toBe("not_required");
  });

  it("does not rescue generic geometry equations for wave-function collapse requests", () => {
    const relPath = ".tmp-stage05-tests/collapse-generic-geometry.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "Collapse benchmark note.",
        "V_c = (4/3) pi r_c^3",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "what's the equation of the collapse of the wave function?",
        explicitPaths: [],
        allowedCitations: [relPath],
      });
      expect(rescue).toBeNull();
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rescues wave-function equations when collapse-domain signals are present", () => {
    const relPath = ".tmp-stage05-tests/collapse-wave-equation.md";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "Quantum collapse relation",
        "psi = Pm psi0 / sqrt(prob)",
      ].join("\n"),
      "utf8",
    );
    try {
      const rescue = __testHelixAskReliabilityGuards.buildExplicitPathEquationContractRescue({
        question: "what's the equation of the collapse of the wave function?",
        explicitPaths: [],
        allowedCitations: [relPath],
      });
      expect(rescue).not.toBeNull();
      expect(rescue?.equation).toMatch(/psi/i);
      const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
        question: "what's the equation of the collapse of the wave function?",
        answer: rescue?.answer ?? "",
        allowedCitations: [relPath],
      });
      expect(contract.ok).toBe(true);
      expect(contract.reason).toBe("ok");
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("applies collapse-domain lock and suppresses warp-family paths for wave-function prompts", () => {
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(
      "what's the equation of the collapse of the wave function?",
    );
    expect(constraints.collapseDomainLock).toBe(true);
    expect(constraints.hardExcludeWarpFamily).toBe(true);
    const constrainedPaths = __testHelixAskReliabilityGuards.applyQueryConstraintsToPathList(
      [
        "modules/warp/natario-warp.ts",
        "docs/warp-geometry-congruence-report.md",
        "server/services/mixer/collapse.ts",
        "shared/dp-collapse.ts",
      ],
      constraints,
    );
    expect(constrainedPaths).toContain("server/services/mixer/collapse.ts");
    expect(constrainedPaths).toContain("shared/dp-collapse.ts");
    expect(constrainedPaths.some((entry) => /warp|natario/i.test(entry))).toBe(false);
  });

  it("honors explicit negative warp constraints in prompts", () => {
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(
      "Show one equation for collapse and explain it, but do not use warp or natario files.",
    );
    expect(constraints.hardExcludeWarpFamily).toBe(true);
    const constrainedPaths = __testHelixAskReliabilityGuards.applyQueryConstraintsToPathList(
      [
        "modules/warp/natario-warp.ts",
        "server/services/mixer/collapse.ts",
      ],
      constraints,
    );
    expect(constrainedPaths).toEqual(["server/services/mixer/collapse.ts"]);
  });

  it("treats 'what equation describes' prompts as equation-quote requests", () => {
    expect(
      __testHelixAskReliabilityGuards.isEquationQuotePrompt(
        "what equation describes dynamic Casimir modulation in this codebase?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isEquationQuotePrompt(
        "what equation is used for polytrope behavior in this codebase?",
      ),
    ).toBe(true);
  });

  it("applies tokamak domain preferences and equation-noise exclusions", () => {
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(
      "show a core tokamak stability equation from this repo and explain where it is used.",
    );
    expect(constraints.hardExcludeWarpFamily).toBe(true);
    const constrainedPaths = __testHelixAskReliabilityGuards.applyQueryConstraintsToPathList(
      [
        "tests/helix-ask-stage05-content.spec.ts",
        "modules/warp/natario-warp.ts",
        "server/services/physics/tokamak-stability-proxies.ts",
      ],
      constraints,
    );
    expect(constrainedPaths).toContain("server/services/physics/tokamak-stability-proxies.ts");
    expect(constrainedPaths).not.toContain("tests/helix-ask-stage05-content.spec.ts");
    expect(constrainedPaths).not.toContain("modules/warp/natario-warp.ts");
  });

  it("demotes test-fixture paths for tokamak equation ranking", () => {
    const question = "show a core tokamak stability equation from this repo and explain where it is used";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const tokens = ["tokamak", "stability", "equation", "repo", "used"];
    const rankedTokamak =
      __testHelixAskReliabilityGuards.rankEquationNearMissPath(
        "server/services/physics/tokamak-stability-proxies.ts",
        constraints,
        tokens,
        0,
      );
    const rankedFixture =
      __testHelixAskReliabilityGuards.rankEquationNearMissPath(
        "tests/helix-ask-stage05-content.spec.ts",
        constraints,
        tokens,
        0,
      );
    expect(rankedTokamak).toBeGreaterThan(rankedFixture);
  });

  it("rejects non-physics attribute assignments for tokamak equation prompts", () => {
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "show a core tokamak stability equation from this repo and explain where it is used",
      answer:
        "Exact equation line (docs/knowledge/dag-node-schema.md:L19): rel=\"depends-on\"\nSources: docs/knowledge/dag-node-schema.md",
      allowedCitations: ["docs/knowledge/dag-node-schema.md"],
    });
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(false);
    expect(contract.reason).toBe("equation_relevance_missing");
  });

  it("accepts tokamak-stability equations with tokamak-domain signals", () => {
    const contract = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "show a core tokamak stability equation from this repo and explain where it is used",
      answer:
        "Exact equation line (server/services/physics/tokamak-stability-proxies.ts:L88): beta_p = 2*mu0*P/B_theta^2\nSources: server/services/physics/tokamak-stability-proxies.ts",
      allowedCitations: ["server/services/physics/tokamak-stability-proxies.ts"],
    });
    expect(contract.required).toBe(true);
    expect(contract.ok).toBe(true);
    expect(contract.reason).toBe("ok");
  });

  it("builds strict-mode relaxed fallback text for tokamak equation prompts", () => {
    const question = "show a core tokamak stability equation from this repo and explain where it is used";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const fallback = __testHelixAskReliabilityGuards.buildEquationSoftFallbackMessage({
      question,
      citationHints: [],
      queryConstraints: constraints,
    });
    expect(fallback.trim().length).toBeGreaterThan(0);
    expect(fallback).toMatch(/tokamak|stability/i);
  });

  it("keeps allowed fallback example paths during citation scrub", () => {
    const text =
      "I couldn't verify an exact equation quote with a matching file citation from current evidence. " +
      "Please provide module/path/symbol (for example: [server/services/physics/tokamak-stability-proxies.ts] or [shared/tokamak-stability-proxies.ts]) and retry.";
    const scrubbed = __testHelixAskDialogueFormatting.scrubUnsupportedPaths(text, [
      "server/services/physics/tokamak-stability-proxies.ts",
      "shared/tokamak-stability-proxies.ts",
    ]);
    expect(scrubbed.removed).toHaveLength(0);
    expect(scrubbed.text).toContain("[server/services/physics/tokamak-stability-proxies.ts]");
    expect(scrubbed.text).toContain("[shared/tokamak-stability-proxies.ts]");
  });

  it("keeps extensionless path variants when allowlist contains file extensions", () => {
    const text =
      "Closest grounded files: server/services/mixer/collapse and shared/dp-collapse.";
    const scrubbed = __testHelixAskDialogueFormatting.scrubUnsupportedPaths(text, [
      "server/services/mixer/collapse.ts",
      "shared/dp-collapse.ts",
    ]);
    expect(scrubbed.removed).toHaveLength(0);
    expect(scrubbed.text).toContain("server/services/mixer/collapse");
    expect(scrubbed.text).toContain("shared/dp-collapse");
  });

  it("removes dangling extension-bracket fragments after unsupported citation scrub", () => {
    const text =
      "Claim-first explanation:\n1. [server/services/mixer/collapse.ts] Grounded equation candidates were retrieved.";
    const scrubbed = __testHelixAskDialogueFormatting.scrubUnsupportedPaths(text, [
      "shared/dp-collapse.ts",
    ]);
    expect(scrubbed.removed).toContain("server/services/mixer/collapse.ts");
    expect(scrubbed.text).not.toContain("ts]");
    expect(scrubbed.text).toContain("Grounded equation candidates were retrieved.");
  });

  it("prefers polytrope domain paths over ethos docs for equation ranking", () => {
    const question = "what equation is used for polytrope behavior in this codebase";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const tokens = ["equation", "polytrope", "codebase", "behavior"];
    const rankedPolytrope =
      __testHelixAskReliabilityGuards.rankEquationNearMissPath(
        "client/src/physics/polytrope.ts",
        constraints,
        tokens,
        0,
      );
    const rankedEthos =
      __testHelixAskReliabilityGuards.rankEquationNearMissPath(
        "docs/ethos/ideology-telemetry-schema.json",
        constraints,
        tokens,
        0,
      );
    expect(rankedPolytrope).toBeGreaterThan(rankedEthos);
  });

  it("applies collapse-domain affinity and anti-warp penalties in equation scoring", () => {
    const tokens = ["collapse", "wave", "function", "equation"];
    const collapseAffinity =
      __testHelixAskReliabilityGuards.scoreEquationDomainPathAffinity(
        "server/services/mixer/collapse.ts",
        tokens,
      );
    const warpAffinity =
      __testHelixAskReliabilityGuards.scoreEquationDomainPathAffinity(
        "modules/warp/natario-warp.ts",
        tokens,
      );
    expect(collapseAffinity).toBeGreaterThan(warpAffinity);
  });

  it("enforces explicit anchor priority for equation quote contracts", () => {
    const base = __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
      question: "Show one equation and cite it.",
      answer:
        "Exact equation line (modules/dynamic/natario-metric.ts:L63): g_ij = diag(1/a^2, 1/b^2, 1/c^2)\nSources: modules/dynamic/natario-metric.ts",
      allowedCitations: ["modules/dynamic/natario-metric.ts", "shared/schema.ts"],
    });
    expect(base.ok).toBe(true);
    const prioritized = __testHelixAskReliabilityGuards.applyEquationAnchorPriority(base, [
      "shared/schema.ts",
    ]);
    expect(prioritized.ok).toBe(false);
    expect(prioritized.reason).toBe("citation_missing");
    const anchored = __testHelixAskReliabilityGuards.applyEquationAnchorPriority(
      __testHelixAskReliabilityGuards.evaluateEquationQuoteContract({
        question: "Show one equation and cite it.",
        answer:
          "Exact equation line (shared/schema.ts:L654): S = |∫ g(t) rho_neg(t) dt| / qi_limit\nSources: shared/schema.ts",
        allowedCitations: ["shared/schema.ts"],
      }),
      ["shared/schema.ts"],
    );
    expect(anchored.ok).toBe(true);
  });

  it("scores evidence mass higher when source diversity and coverage are strong", () => {
    const rich = __testHelixAskReliabilityGuards.computeHelixAskEvidenceMassScore({
      sourceCount: 10,
      independentSourceCount: 6,
      slotCoverageRatio: 0.92,
      docCoverageRatio: 0.88,
      retrievalConfidence: 0.9,
      retrievalDocShare: 0.7,
    });
    const thin = __testHelixAskReliabilityGuards.computeHelixAskEvidenceMassScore({
      sourceCount: 1,
      independentSourceCount: 1,
      slotCoverageRatio: 0.2,
      docCoverageRatio: 0.15,
      retrievalConfidence: 0.25,
      retrievalDocShare: 0.1,
    });
    expect(rich.score).toBeGreaterThan(thin.score);
    expect(rich.band).toBe("rich");
    expect(thin.band).toBe("thin");
  });

  it("moves unsupported contract claims into uncertainty when grounding is enforced", () => {
    const grounded = __testHelixAskReliabilityGuards.applyHelixAskClaimGroundingGate({
      contract: {
        summary: "Repo answer summary.",
        claims: [
          {
            text: "Supported claim from route logic.",
            evidence: ["server/routes/agi.plan.ts"],
          },
          {
            text: "Ungrounded claim with no evidence mapping.",
          },
        ],
        sources: ["server/routes/agi.plan.ts"],
      },
      allowedCitations: ["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"],
      evidenceText:
        "Sources: server/routes/agi.plan.ts\nRoute pipeline and citation repair behavior are defined in this file.",
      enforce: true,
    });

    expect(grounded.groundedCount).toBe(1);
    expect(grounded.unsupportedCount).toBe(1);
    expect(grounded.contract.claims?.length).toBe(1);
    expect(grounded.contract.claims?.[0]?.evidence).toContain("server/routes/agi.plan.ts");
    expect(grounded.contract.uncertainty ?? "").toMatch(/Unsupported claims moved to uncertainty/i);
  });
});

describe("helix ask dialogue formatting", () => {
  it("front-loads higher-score ranked candidates instead of preserving stage0 insertion order", () => {
    const byPath = new Map(
      [
        {
          filePath: "docs/knowledge/physics/dynamic-casimir-effect.md",
          preview: "doc_a",
          score: 12,
          rrfScore: 0,
        },
        {
          filePath: "docs/knowledge/physics/casimir-index.md",
          preview: "doc_b",
          score: 9,
          rrfScore: 0,
        },
        {
          filePath: "modules/dynamic/dynamic-casimir.ts",
          preview: "code_high",
          score: 98,
          rrfScore: 0,
        },
      ].map((entry) => [entry.filePath, entry]),
    ) as any;
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "How is dynamic Casimir solved in this codebase?",
      stage0Paths: [
        "docs/knowledge/physics/dynamic-casimir-effect.md",
        "docs/knowledge/physics/casimir-index.md",
      ],
      byPath,
      maxFiles: 8,
      retrievalScope: "standard",
      intentDomain: "repo",
    });

    expect(seeded.paths[0]).toBe("modules/dynamic/dynamic-casimir.ts");
    expect(seeded.paths.slice(0, 3)).toEqual(
      expect.arrayContaining([
        "modules/dynamic/dynamic-casimir.ts",
        "docs/knowledge/physics/dynamic-casimir-effect.md",
      ]),
    );
  });

  it("keeps explicit seed paths in the front of ranked stage05 input ordering", () => {
    const byPath = new Map(
      [
        {
          filePath: "docs/knowledge/physics/dynamic-casimir-effect.md",
          preview: "doc",
          score: 40,
          rrfScore: 0,
        },
        {
          filePath: "modules/dynamic/dynamic-casimir.ts",
          preview: "code",
          score: 45,
          rrfScore: 0,
        },
      ].map((entry) => [entry.filePath, entry]),
    ) as any;
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "Where is collapse logic in this codebase?",
      stage0Paths: ["docs/knowledge/physics/dynamic-casimir-effect.md"],
      byPath,
      seedPaths: ["server/services/mixer/collapse.ts"],
      maxFiles: 8,
      retrievalScope: "standard",
      intentDomain: "repo",
    });

    expect(seeded.paths[0]).toBe("server/services/mixer/collapse.ts");
  });

  it("augments sparse stage0 seed with ranked candidates and code support", () => {
    const byPath = new Map(
      [
        {
          filePath: "docs/knowledge/physics/dynamic-casimir-effect.md",
          preview: "doc",
          score: 44,
          rrfScore: 0,
        },
        {
          filePath: "server/energy-pipeline.ts",
          preview: "code",
          score: 41,
          rrfScore: 0,
        },
        {
          filePath: "modules/dynamic/dynamic-casimir.ts",
          preview: "code2",
          score: 40,
          rrfScore: 0,
        },
      ].map((entry) => [entry.filePath, entry]),
    ) as any;
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "How is dynamic Casimir solved in the codebase?",
      stage0Paths: ["docs/knowledge/physics/dynamic-casimir-effect.md"],
      byPath,
      maxFiles: 12,
      retrievalScope: "standard",
      intentDomain: "hybrid",
    });

    expect(seeded.paths.length).toBeGreaterThan(1);
    expect(seeded.paths).toContain("docs/knowledge/physics/dynamic-casimir-effect.md");
    expect(seeded.paths.some((entry: string) => /\.ts$/i.test(entry))).toBe(true);
    expect(seeded.paths).toContain("server/energy-pipeline.ts");
    expect(seeded.wideAddedCount).toBe(0);
  });

  it("allows stage0.5 seeding from ranked retrieval even when stage0 path set is empty", () => {
    const byPath = new Map(
      [
        {
          filePath: "docs/knowledge/physics/dynamic-casimir-effect.md",
          preview: "doc",
          score: 30,
          rrfScore: 0,
        },
        {
          filePath: "modules/dynamic/dynamic-casimir.ts",
          preview: "code",
          score: 32,
          rrfScore: 0,
        },
      ].map((entry) => [entry.filePath, entry]),
    ) as any;
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "How is dynamic Casimir solved in the codebase?",
      stage0Paths: [],
      byPath,
      maxFiles: 8,
      retrievalScope: "standard",
      intentDomain: "repo",
    });

    expect(seeded.paths.length).toBeGreaterThan(0);
    expect(seeded.paths).toContain("modules/dynamic/dynamic-casimir.ts");
  });

  it("accepts explicit seed paths when stage0 and ranked candidates are sparse", () => {
    const byPath = new Map<string, any>();
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "Where is collapse logic in this codebase?",
      stage0Paths: [],
      byPath,
      seedPaths: ["server/services/mixer/collapse.ts"],
      maxFiles: 8,
      retrievalScope: "standard",
      intentDomain: "repo",
    });

    expect(seeded.paths.length).toBeGreaterThan(0);
    expect(seeded.paths).toContain("server/services/mixer/collapse.ts");
  });

  it("keeps at least one code path when stage0 list is long and docs-first", () => {
    const stage0Paths = Array.from({ length: 64 }, (_, index) =>
      `docs/knowledge/physics/doc-${index + 1}.md`,
    );
    stage0Paths.push("modules/dynamic/dynamic-casimir.ts");
    const byPath = new Map(
      stage0Paths.map((filePath, index) => [
        filePath,
        { filePath, preview: filePath, score: 200 - index, rrfScore: 0 },
      ]),
    ) as any;
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "How is dynamic Casimir solved in this codebase?",
      stage0Paths,
      byPath,
      maxFiles: 12,
      retrievalScope: "standard",
      intentDomain: "repo",
    });

    expect(seeded.paths.length).toBe(48);
    expect(seeded.paths.some((entry: string) => /\.ts$/i.test(entry))).toBe(true);
    expect(seeded.paths).toContain("modules/dynamic/dynamic-casimir.ts");
  });

  it("adds extra stage05 input paths in wide retrieval scope", () => {
    const byPath = new Map(
      [
        {
          filePath: "docs/knowledge/warp/warp-bubble.md",
          preview: "doc",
          score: 40,
          rrfScore: 0,
        },
      ].map((entry) => [entry.filePath, entry]),
    ) as any;
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "How is the warp bubble solved in the codebase?",
      stage0Paths: ["docs/knowledge/warp/warp-bubble.md"],
      byPath,
      maxFiles: 8,
      retrievalScope: "wide",
      intentDomain: "repo",
    });

    expect(seeded.paths.length).toBeGreaterThan(1);
    expect(seeded.wideAddedCount).toBeGreaterThan(0);
  });

  it("drops index-only generated artifacts from stage05 path seeds", () => {
    const byPath = new Map(
      [
        {
          filePath: "server/_generated/code-lattice.json",
          preview: "generated noise",
          score: 99,
          rrfScore: 0,
        },
        {
          filePath: "docs/knowledge/warp/warp-bubble.md",
          preview: "doc",
          score: 30,
          rrfScore: 0,
        },
      ].map((entry) => [entry.filePath, entry]),
    ) as any;
    const seeded = __testHelixAskDialogueFormatting.buildStage05InputPaths({
      question: "How is the warp bubble solved in this codebase?",
      stage0Paths: ["server/_generated/code-lattice.json", "docs/knowledge/warp/warp-bubble.md"],
      byPath,
      maxFiles: 8,
      retrievalScope: "wide",
      intentDomain: "repo",
    });

    expect(seeded.paths).toContain("docs/knowledge/warp/warp-bubble.md");
    expect(seeded.paths).not.toContain("server/_generated/code-lattice.json");
  });

  it("keeps wide expansion focused on signal paths over generated artifacts", () => {
    const wide = __testHelixAskDialogueFormatting.collectWideStage05PathCandidates({
      question: "How is stage05 connectivity retrieval ranked in this system?",
      existingPaths: ["server/routes/agi.plan.ts"],
      limit: 32,
    });

    expect(wide.candidates.length).toBeGreaterThan(0);
    expect(
      wide.candidates.some((entry) =>
        /(^|\/)(?:server\/_generated\/|server_generated\/)/i.test(entry.path),
      ),
    ).toBe(false);
  });

  it("normalizes bundled quoted question lists to the primary question", () => {
    const normalized = __testHelixAskDialogueFormatting.normalizeBundledQuestion(
      "Question: How does dynamic Casimir modulation feed into the system's physics outputs?','Can you show one equation used in warp congruence and explain what it means",
    );
    expect(normalized).toBe("How does dynamic Casimir modulation feed into the system's physics outputs?");
  });

  it("normalizes malformed commonality grammar into a valid commonality question", () => {
    const normalized = __testHelixAskDialogueFormatting.normalizeBundledQuestion(
      "What is the electron and kinematics of the solar system have in common?",
    );
    expect(normalized).toBe(
      "What do the electron and kinematics of the solar system have in common?",
    );
  });

  it("extracts and normalizes question lines from prompt wrappers", () => {
    const extracted = __testHelixAskDialogueFormatting.extractQuestionFromPrompt(
      [
        "System: test",
        "Question: How does dynamic Casimir modulation feed into the system's physics outputs?','Can you show one equation used in warp congruence and explain what it means",
        "FINAL:",
      ].join("\n"),
    );
    expect(extracted).toBe("How does dynamic Casimir modulation feed into the system's physics outputs?");
  });

  it("resolves prompt-only asks to a usable base question", () => {
    const resolved = __testHelixAskDialogueFormatting.resolveHelixAskQuestionText({
      question: "",
      prompt: "In this codebase, explain equation of the collapse of the wave function.",
    });
    expect(resolved).toBe("In this codebase, explain equation of the collapse of the wave function");
  });

  it("prefers explicit question input over prompt fallback", () => {
    const resolved = __testHelixAskDialogueFormatting.resolveHelixAskQuestionText({
      question: "What equation is used in shared/dp-collapse.ts?",
      prompt: "In this codebase, explain collapse.",
    });
    expect(resolved).toBe("What equation is used in shared/dp-collapse.ts?");
  });

  it("filters malformed checked-file summaries and low-signal heading hints", () => {
    const hints = __testHelixAskDialogueFormatting.buildNextEvidenceHints({
      question: "Explain dynamic Casimir modulation outputs.",
      includeSearchSummary: true,
      searchedTerms: ["dynamic casimir", " outputs  ", "docs headings"],
      searchedFiles: [" ,,, ", " shared/schema.ts,,", "docs/knowledge/physics/dynamic-casimir-effect.md"],
      headingSeedSlots: [
        { id: "seed_num", label: "3.", required: false, source: "heading", surfaces: [] },
        {
          id: "seed_good",
          label: "Dynamic Casimir Effects (DCE)",
          required: false,
          source: "heading",
          surfaces: [],
        },
      ],
      limit: 4,
    });

    expect(hints.some((entry) => /Checked files:\s*,/i.test(entry))).toBe(false);
    expect(hints.some((entry) => /Search docs headings for \"3\.\"/i.test(entry))).toBe(false);
    expect(
      hints.some((entry) => /dynamic-casimir-effect\.md/i.test(entry) || /Dynamic Casimir Effects/i.test(entry)),
    ).toBe(true);
  });

  it("drops malformed checked-files bullets from scientific voice rewrite", () => {
    const rewritten = __testHelixAskDialogueFormatting.rewriteConversationScientificVoice([
      "Confirmed:",
      "- Dynamic Casimir modulation affects output envelopes.",
      "",
      "Reasoned connections (bounded):",
      "- Modulation changes boundary conditions that feed measured spectra.",
      "",
      "Next evidence:",
      "- Checked files: ,,,",
      "- Search docs headings for \"3.\"",
      "- Check docs/knowledge/physics/dynamic-casimir-effect.md for \"Outputs\".",
    ].join("\n"));

    expect(rewritten).not.toMatch(/Checked files:\s*,/i);
    expect(rewritten).not.toMatch(/Search docs headings for \"3\.\"/i);
    expect(rewritten).toMatch(/dynamic-casimir-effect\.md/i);
  });

  it("enforces open-world uncertainty markers after stripping sources", () => {
    const raw = [
      "Short answer:",
      "- Keep alerts simple and monitor suspicious transfers.",
      "",
      "Sources: docs/knowledge/ethos/no-bypass-guardrail.md",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.ensureOpenWorldBypassUncertainty(
      __testHelixAskDialogueFormatting.stripRepoCitationsForOpenWorldBypass(raw),
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/explicit uncertainty/i);
    expect(guarded).not.toMatch(/^Sources:/im);
  });

  it("rewrites repo-shaped open-world answers into source-free best-effort text", () => {
    const raw = [
      "Direct Answer:",
      "- In this repository, this is grounded in docs/knowledge/security-hull-guard-tree.json.",
      "",
      "Constraints:",
      "- Evidence: Sources: docs/knowledge/security-hull-guard-tree.json",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "How can I protect myself from AI-driven financial fraud?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/Practical steps:/i);
    expect(guarded).not.toMatch(/^Sources:/im);
    expect(guarded).not.toMatch(/docs\/knowledge/i);
  });

  it("strips objective scaffold residue but preserves explicit UNKNOWN blocks in open-world rewrites", () => {
    const raw = [
      "Definition:",
      "- In this codebase, are first principles is grounded in docs/knowledge/trees/paper-ingestion-runtime-tree.md.",
      "Open Gaps:",
      "- Current evidence is incomplete for this turn; missing slots: mechanism, failure-path.",
      "Remaining uncertainty: What are first principles meaning in physics? (missing: first, principles).",
      "Open gaps / UNKNOWNs:",
      "UNKNOWN - What are first principles meaning in physics?",
      "Why: missing first, principles",
      "Next retrieval: Run scoped retrieval for \"What are first principles meaning in physics?\" targeting slots: first, principles.",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "What are first principles meaning in physics?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/first principles/i);
    expect(guarded).not.toMatch(/in this codebase/i);
    expect(guarded).toMatch(/open gaps/i);
    expect(guarded).toMatch(/unknown\s*-/i);
    expect(guarded).toMatch(/next retrieval/i);
  });

  it("strips additional repo context appendix lines during open-world rewrite", () => {
    const raw = [
      "I couldn't confirm this against repo-grounded evidence, so this is an open-world best-effort answer with explicit uncertainty.",
      "Additional Repo Context",
      "Additional repo context:",
      "- Code: Span: L19-L23 ## Core files.",
      "- Definition: Section: Paper Ingestion Runtime Tree Span: L10-L10.",
      "- Evidence: Section: Casimir Tiles Tree Span: L10-L10.",
      "(see docs/knowledge/trees/paper-ingestion-runtime-tree.md)",
      "In physics, \"first principles\" means deriving conclusions from fundamental laws.",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "What are first principles meaning in physics?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/first principles/i);
    expect(guarded).not.toMatch(/Additional Repo Context/i);
    expect(guarded).not.toMatch(/Additional repo context:/i);
    expect(guarded).not.toMatch(/Paper Ingestion Runtime Tree/i);
    expect(guarded).not.toMatch(/Casimir Tiles Tree/i);
  });

  it("uses commonality fallback for open-world 'have in common' prompts", () => {
    const raw = [
      "Definition:",
      "- In this codebase, this concept is grounded in docs/knowledge/physics/math-tree.json.",
      "Open gaps / UNKNOWNs:",
      "UNKNOWN - what is the electron and kinematics of the solar system have in common?",
      "Next retrieval: Run scoped retrieval ...",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "What is the electron and kinematics of the solar system have in common?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/dynamical systems/i);
    expect(guarded).toMatch(/equations of motion|conservation laws/i);
    expect(guarded).not.toMatch(/core meaning of the concept/i);
  });

  it("uses a non-generic conceptual fallback for 'and why does it matter' prompts", () => {
    const raw = [
      "Definition:",
      "- In this codebase, epistemology is grounded in docs/knowledge/trees/physics-foundations-tree.json.",
      "Open gaps / UNKNOWNs:",
      "UNKNOWN - what is epistemology and why does it matter?",
      "Next retrieval: Run scoped retrieval ...",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "What is epistemology and why does it matter?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/branch of philosophy|knowledge|evidence/i);
    expect(guarded).toMatch(/it matters/i);
    expect(guarded).not.toMatch(/core meaning of the concept/i);
  });

  it("replaces generic core-meaning sentence with conceptual fallback in open-world rewrite", () => {
    const raw = [
      "I couldn't confirm this against repo-grounded evidence, so this is an open-world best-effort answer with explicit uncertainty.",
      "\"epistemology and why does it matter\" refers to the core meaning of the concept in its domain context.",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "What is epistemology and why does it matter?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/epistemology/i);
    expect(guarded).toMatch(/knowledge|evidence|justified belief/i);
    expect(guarded).not.toMatch(/core meaning of the concept/i);
  });

  it("strips objective leakage tails from open-world commonality answers", () => {
    const raw = [
      "I couldn't confirm this against repo-grounded evidence, so this is an open-world best-effort answer with explicit uncertainty.",
      "They are both dynamical systems described by equations of motion and conservation laws.",
      "Atomic outputs are diagnostic/reduced-order only and non-certifying for ask-time narration. (missing: kinematics, solar).",
      "\" targeting slots: kinematics, solar.",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "What is the electron and kinematics of the solar system have in common?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/dynamical systems/i);
    expect(guarded).not.toMatch(/Atomic outputs are diagnostic\/reduced-order/i);
    expect(guarded).not.toMatch(/\(\s*missing\s*:/i);
    expect(guarded).not.toMatch(/targeting slots?\s*:/i);
  });

  it("preserves structured UNKNOWN blocks and removes scaffolded open-world template lines", () => {
    const raw = [
      "For \"What are first principles meaning in physics?\", start with one concrete claim, one strongest supporting piece of evidence, and one uncertainty line so the reader can separate fact from assumption.",
      "Open gaps / UNKNOWNs:",
      "UNKNOWN - first principles meaning in physics",
      "Why: missing definition evidence in this turn.",
      "What I checked: docs/knowledge/physics/math-tree.json, docs/knowledge/physics/physics-foundations-tree.json.",
      "Next retrieval: run a scoped retrieval for first principles + governing equations.",
    ].join("\n");
    const guarded = __testHelixAskDialogueFormatting.rewriteOpenWorldBestEffortAnswer(
      raw,
      "What are first principles meaning in physics?",
    );
    expect(guarded).toMatch(/open-world best-effort/i);
    expect(guarded).toMatch(/UNKNOWN - first principles meaning in physics/i);
    expect(guarded).toMatch(/Why:\s*missing definition evidence/i);
    expect(guarded).toMatch(/What I checked:/i);
    expect(guarded).toMatch(/Next retrieval:/i);
    expect(guarded).not.toMatch(/start with one concrete claim/i);
    expect(guarded).not.toMatch(/core meaning of the concept/i);
  });

  it("contains suppression marker for repo context envelope extension in general open-world mode", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    const terminalFinalizeSource = fs.readFileSync(
      path.join(process.cwd(), "server/services/helix-ask/surface/terminal-finalize.ts"),
      "utf8",
    );
    expect(routeSource).toContain("answerExtension:suppressed_general_open_world");
    expect(routeSource).toContain("answer_extension_suppressed");
    expect(routeSource).toContain("answer_envelope_repo_context_suppressed");
    expect(routeSource).toContain("treeWalk: suppressRepoContextEnvelope ? undefined : treeWalkBlock || undefined");
  });

  it("contains objective-loop primary composer guard markers to suppress family degrade", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    expect(routeSource).toMatch(
      /const objectiveLoopPrimaryComposerGuard =\s*computeObjectiveLoopPrimaryActive\(\)\s*\|\|/,
    );
    expect(routeSource).not.toMatch(
      /const objectiveLoopPrimaryComposerGuard =\s*objectiveLoopEnabled &&/,
    );
    expect(routeSource).toContain("composerSoftEnforce:skip_objective_loop_primary");
    expect(routeSource).toContain(
      "composerSoftEnforce:retrofit_skip_general_open_world_family_degrade",
    );
    expect(routeSource).toContain("objective_loop_primary_skip_family_degrade");
    expect(routeSource).toContain("composerV2:guard_skipped_objective_loop_primary");
    expect(routeSource).toContain("composer_family_degrade_suppressed");
    expect(routeSource).toContain("objective_loop_primary_composer_guard");
  });

  it("contains post-composer open-world repo-leak guard markers", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    expect(routeSource).toContain("open_world_general_repo_leak_detected");
    expect(routeSource).toContain("openWorldBypass:post_composer_repo_leak_guard");
    expect(routeSource).toContain("finalClean:open_world_objective_tail_scrub");
    expect(routeSource).toContain("open_world_objective_tail_scrub_applied");
  });

  it("contains routing salvage and objective assembly rescue markers", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    expect(routeSource).toContain("routing_salvage_applied");
    expect(routeSource).toContain("routing_salvage_reason");
    expect(routeSource).toContain("routing_salvage_retrieval_added_count");
    expect(routeSource).toContain("general_definition_repo_anchor");
    expect(routeSource).toContain("general_definition_commonality");
    expect(routeSource).toContain("routing_salvage_commonality_cue");
    expect(routeSource).toContain("routing_salvage_commonality_objective_cue");
    expect(routeSource).toContain("routingSalvage:commonality_pre_unknown_terminal");
    expect(routeSource).toContain("objective_assembly_rescue_attempted");
    expect(routeSource).toContain("objective_assembly_rescue_success");
    expect(routeSource).toContain("objective_assembly_rescue_fail_reason");
    expect(routeSource).toContain("objective_mini_critic_prompt_preview");
    expect(routeSource).toContain("objective_assembly_prompt_preview");
    expect(routeSource).toContain("objective_assembly_rescue_prompt_preview");
    expect(routeSource).toContain("objectiveAssembly:llm_rescue");
  });

  it("contains objective recovery retryability and terminal-validator markers", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    const terminalFinalizeSource = fs.readFileSync(
      path.join(process.cwd(), "server/services/helix-ask/surface/terminal-finalize.ts"),
      "utf8",
    );
    const finalContractLockSource = fs.readFileSync(
      path.join(process.cwd(), "server/services/helix-ask/surface/final-contract-locks.ts"),
      "utf8",
    );
    const terminalConsistencySource = fs.readFileSync(
      path.join(process.cwd(), "server/services/helix-ask/surface/terminal-consistency.ts"),
      "utf8",
    );
    expect(routeSource).toContain("parallel_variant_applied");
    expect(routeSource).toContain("objective_scoped_retrieval_recovery_parallel_variant_count");
    expect(routeSource).toContain("objective_scoped_retrieval_recovery_parallel_applied_count");
    expect(routeSource).toContain("Objective gate consistency");
    expect(routeSource).toContain("objective_gate_consistency_blocked");
    expect(terminalFinalizeSource).toContain("global_terminal_validator_applied");
    expect(terminalFinalizeSource).toContain("globalTerminalValidator:rewrite");
    expect(routeSource).toContain("global_terminal_validator_required_sections");
    expect(routeSource).toContain("final_mode_gate_consistency_blocked");
    expect(routeSource).toContain("objective_obligations_missing");
    expect(routeSource).toContain("answer_obligations_missing");
    expect(terminalConsistencySource).toContain("frontier_required_headings_missing");
    expect(routeSource).toContain("buildDeterministicFrontierDryRunContract()");
    expect(finalContractLockSource).toContain("frontier:terminal_heading_repair");
    expect(finalContractLockSource).toContain("frontier_terminal_heading_repair_applied");
    expect(routeSource).toContain("roadmap_repo_grounded_findings_missing");
    expect(routeSource).toContain("roadmap_implementation_roadmap_missing");
    expect(routeSource).toContain("objectivePrimaryQueries");
    expect(routeSource).toContain("const objectiveVariantOutcomes = await Promise.allSettled(");
    expect(routeSource).toContain("objectiveVariantQueries.map((variantQueries) =>");
  });

  it("contains reasoning sidebar debug markers and event-clock formatter", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    expect(routeSource).toContain("buildHelixAskReasoningSidebarFromDebug");
    expect(routeSource).toContain("attachHelixAskReasoningSidebarToDebug");
    expect(routeSource).toContain("reasoning_sidebar_enabled");
    expect(routeSource).toContain("reasoning_sidebar_markdown");
    expect(routeSource).toContain("reasoning_sidebar_event_count");
    expect(routeSource).toContain("## Event Clock");
  });

  it("contains objective plain-reasoning telemetry markers", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "server/routes/agi.plan.ts"),
      "utf8",
    );
    expect(routeSource).toContain("objective_coverage_unresolved_count");
    expect(routeSource).toContain("objective_reasoning_trace");
    expect(routeSource).toContain("objective_telemetry_used");
    expect(routeSource).toContain("Objective Reasoning");
    expect(routeSource).toContain("buildHelixAskObjectivePlainReasoningTrace");
  });

  it("enforces ideology narrative anchors for social prompts", () => {
    const guarded = __testHelixAskDialogueFormatting.enforceIdeologyNarrativeContracts(
      "Short answer: civic policy should be cautious.",
      "In plain language, how does Feedback Loop Hygiene affect society in the Ideology tree? Include a concrete example and a concise takeaway.",
    );
    expect(guarded).toMatch(/Mission Ethos/i);
    expect(guarded).toMatch(/Feedback Loop Hygiene/i);
    expect(guarded).toMatch(/\bexample\b/i);
    expect(guarded).toMatch(/\btakeaway\b/i);
  });

  it("forces deterministic ideology narrative mode for explicit narrative-only prompts", () => {
    const guarded = __testHelixAskDialogueFormatting.shouldForceIdeologyNarrativeDeterministic(
      "How does Feedback Loop Hygiene affect society? Answer in the new default narrative style only. If you are about to output a Technical notes compare/report format, switch to a plain-language narrative first.",
    );
    expect(guarded).toBe(true);
  });

  it("uses compare/no-stage-tags for hybrid fallback profile", () => {
    const profile = __testHelixAskDialogueFormatting.resolveFallbackIntentProfile("hybrid");
    expect(profile.formatPolicy).toBe("compare");
    expect(profile.stageTags).toBe("never");
  });

  it("strips timestamped tool timeline tails from inline answer text", () => {
    const raw =
      "I couldn't verify a verbatim wave-function-collapse equation line in the current repository evidence. server/services/mixer/collapse.ts. " +
      "[20:41:18.422] tool=progress | seq=36 | dur=25607ms | text=Helix Ask: Retrieval code-first - done";
    const cleaned = __testHelixAskDialogueFormatting.stripTelemetryLeakArtifacts(raw);
    expect(cleaned.detected).toBe(true);
    expect(cleaned.text).toMatch(/server\/services\/mixer\/collapse\.ts\.$/i);
    expect(cleaned.text).not.toMatch(/\[20:41:18\.422\]/);
    expect(cleaned.text).not.toMatch(/tool=progress/i);
  });

  it("strips standalone timestamped tool event lines from final text", () => {
    const raw = [
      "Closest grounded files: server/services/mixer/collapse.ts, shared/dp-collapse.ts.",
      "[20:41:18.422] tool=event | seq=37 | dur=25607ms | text=Helix Ask: Retrieval code-first - done",
      "tool=progress | seq=58 | dur=0ms | text=Helix Ask: LLM equation quote repair - start",
      "Sources: server/services/mixer/collapse.ts, shared/dp-collapse.ts",
    ].join("\n");
    const cleaned = __testHelixAskDialogueFormatting.stripTelemetryLeakArtifacts(raw);
    expect(cleaned.detected).toBe(true);
    expect(cleaned.text).toContain("Closest grounded files:");
    expect(cleaned.text).toContain("Sources:");
    expect(cleaned.text).not.toMatch(/tool=event/i);
    expect(cleaned.text).not.toMatch(/tool=progress/i);
  });

  it("removes dangling extension fragments left after cleanup", () => {
    const raw =
      "I couldn't verify a verbatim wave-function-collapse equation line in the current repository evidence. ts.";
    const cleaned = __testHelixAskDialogueFormatting.cleanDanglingFileExtensionFragments(raw);
    expect(cleaned).toBe(
      "I couldn't verify a verbatim wave-function-collapse equation line in the current repository evidence.",
    );
  });

  it("removes orphan extension bracket residue in numbered lines", () => {
    const raw =
      "Claim-first explanation:\n1. ts] Grounded equation candidates were retrieved.\n2. md] Additional context pending.";
    const cleaned = __testHelixAskDialogueFormatting.cleanDanglingFileExtensionFragments(raw);
    expect(cleaned).not.toContain("ts]");
    expect(cleaned).not.toContain("md]");
    expect(cleaned).toContain("1. Grounded equation candidates were retrieved.");
  });

  it("removes orphan dotted extension residue after partial path cleanup", () => {
    const raw = [
      "Claim-first explanation:",
      "1. .ts] Grounded equation candidates were retrieved.",
      "2. Current repository evidence maps to implementation operators. .md]",
      "3. Candidate tail from scrub: .ts",
      "4. Bracket orphan: [.ts]",
    ].join("\n");
    const cleaned = __testHelixAskDialogueFormatting.cleanDanglingFileExtensionFragments(raw);
    expect(cleaned).not.toContain(".ts]");
    expect(cleaned).not.toContain(".md]");
    expect(cleaned).not.toContain(" .ts");
    expect(cleaned).not.toContain("[.ts]");
    expect(cleaned).toContain("Grounded equation candidates were retrieved.");
  });

  it("preserves valid file citations ending in .ts inside brackets", () => {
    const raw =
      "Claim-first explanation: 1. [server/services/mixer/collapse.ts] Grounded equation candidates were retrieved.";
    const cleaned = __testHelixAskDialogueFormatting.cleanDanglingFileExtensionFragments(raw);
    expect(cleaned).toContain("[server/services/mixer/collapse.ts]");
    expect(cleaned).toContain("Grounded equation candidates were retrieved.");
  });

  it("preserves allowed line-anchored citations during unsupported-path scrub", () => {
    const raw = [
      "Exact equation line (server/services/mixer/collapse.ts:L42):",
      "- [server/services/mixer/collapse.ts:L42] psi = Pm psi0 / sqrt(prob)",
      "Sources: server/services/mixer/collapse.ts",
    ].join("\n");
    const scrubbed = __testHelixAskDialogueFormatting.scrubUnsupportedPaths(raw, [
      "server/services/mixer/collapse.ts",
    ]);
    expect(scrubbed.removed).toEqual([]);
    expect(scrubbed.text).toMatch(/server\/services\/mixer\/collapse\.ts:L42/i);
    expect(scrubbed.text).toMatch(/\bpsi\s*=/i);
  });
});

describe("equation plus mechanism mode helpers", () => {
  it("detects direct equation-of prompts as equation quote requests", () => {
    expect(
      __testHelixAskReliabilityGuards.isEquationQuotePrompt(
        "what's the equation of the collapse of the wave function?",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isEquationQuotePrompt(
        "equation_of_the_collapse_of_the_wave_function",
      ),
    ).toBe(true);
  });

  it("detects mixed equation + explanation prompts", () => {
    expect(
      __testHelixAskReliabilityGuards.isEquationPlusMechanismPrompt(
        "How does dynamic Casimir modulation feed into the system's physics outputs? Can you show one equation used in warp congruence and explain what it means",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isEquationPlusMechanismPrompt(
        "Show one equation used in warp congruence.",
      ),
    ).toBe(false);
    expect(
      __testHelixAskReliabilityGuards.isEquationBlendPrompt(
        "what's the equation of the collapse of the wave function?",
      ),
    ).toBe(true);
  });

  it("detects explicit quote-only equation prompts", () => {
    expect(
      __testHelixAskReliabilityGuards.isEquationQuoteOnlyPrompt(
        "Give the exact equation line only for warp congruence, no explanation.",
      ),
    ).toBe(true);
    expect(
      __testHelixAskReliabilityGuards.isEquationBlendPrompt(
        "Give the exact equation line only for warp congruence, no explanation.",
      ),
    ).toBe(false);
  });

  it("flags equation-anchor-only answers as too short for mechanism mode", () => {
    const anchorOnly =
      "Exact equation line (docs/warp-geometry-congruence-report.md:L399): K_ij = 1/2 (d_i beta_j + d_j beta_i)\nSources: docs/warp-geometry-congruence-report.md";
    const expanded =
      "Exact equation line (docs/warp-geometry-congruence-report.md:L399): K_ij = 1/2 (d_i beta_j + d_j beta_i).\n" +
      "This means extrinsic curvature is computed from shift-vector spatial derivatives.\n" +
      "Mechanism: shift-vector gradient -> K_ij tensor update -> downstream congruence diagnostics.\n" +
      "In the system, this is used by warp geometry/congruence analysis paths to interpret solve outputs.\n" +
      "Sources: docs/warp-geometry-congruence-report.md, modules/warp/warp-module.ts";
    expect(__testHelixAskReliabilityGuards.isEquationAnchorOnlyAnswer(anchorOnly)).toBe(true);
    expect(__testHelixAskReliabilityGuards.isEquationAnchorOnlyAnswer(expanded)).toBe(false);
  });
});

describe("equation selector continuity contract", () => {
  it("builds a stable intent contract hash for the same inputs", () => {
    const question =
      "From shared/collapse-benchmark.ts, quote rho_eff_kg_m3 and kappa_collapse_m2 around lines 570-571 and explain.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(
      question,
      ["shared/collapse-benchmark.ts"],
    );
    const contract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
      question,
      queryConstraints: constraints,
      explicitPaths: ["shared/collapse-benchmark.ts"],
    });
    const hash = __testHelixAskReliabilityGuards.hashHelixAskIntentContract(contract);
    const stability = __testHelixAskReliabilityGuards.assertHelixAskIntentContractStable({
      expectedHash: hash,
      current: contract,
    });
    expect(stability.stable).toBe(true);
    expect(stability.currentHash).toBe(hash);
  });

  it("uses no-substitution mode for specific prompts when symbol match is missing", () => {
    const relPath = ".tmp-stage05-tests/specific-no-substitution.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "export const collapseDiagnostics = true;",
        "volume = (4 / 3) * PI * r * r * r",
      ].join("\n"),
      "utf8",
    );
    try {
      const question = `From ${relPath}, quote exact equation lines for rho_eff_kg_m3 and kappa_collapse_m2 around lines 1-3.`;
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question, [
        relPath,
      ]);
      const contract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
        question,
        queryConstraints: constraints,
        explicitPaths: [relPath],
      });
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "volume = (4 / 3) * PI * r * r * r" }],
        codeAlignment: null,
        stage05Cards: [
          {
            path: relPath,
            summary: "Specific-path collapse equation test",
            slotHits: ["equation", "code_path"],
            confidence: 0.9,
            snippets: [{ start: 1, end: 3, text: fs.readFileSync(fullPath, "utf8") }],
          },
        ],
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
        intentContract: contract,
      });
      expect(result).toBeTruthy();
      expect(result?.primarySelected).toBeNull();
      expect(result?.reason).toBe("specific_no_symbol_match");
      expect(result?.text).toMatch(/No verified symbol-match in explicit path/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("rehydrates truncated stage05 equation snippets from source line anchors", () => {
    const relPath = ".tmp-stage05-tests/source-rehydrate-collapse.ts";
    const fullPath = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(
      fullPath,
      [
        "const E_G_J = HBAR / tau_for_E;",
        "const rho_eff_kg_m3 = E_G_J / (Math.max(1e-30, C2 * V_c_m3));",
        "const kappa_collapse_m2 = kappa_body(rho_eff_kg_m3);",
      ].join("\n"),
      "utf8",
    );
    try {
      const question =
        `From ${relPath}, quote exact equation lines computing rho_eff_kg_m3 and kappa_collapse_m2.`;
      const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question, [
        relPath,
      ]);
      const contract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
        question,
        queryConstraints: constraints,
        explicitPaths: [relPath],
      });
      const result = __testHelixAskReliabilityGuards.buildEquationClaimBackingAssembly({
        question,
        draftAnswer: "",
        answerContract: null,
        evidenceText: `Sources: ${relPath}`,
        docBlocks: [{ path: relPath, block: "rho_eff_kg_m3 = E_G_J / (Math" }],
        codeAlignment: null,
        stage05Cards: [
          {
            path: relPath,
            summary: "Truncated stage05 snippet rehydrate test",
            slotHits: ["equation", "code_path"],
            confidence: 0.9,
            snippets: [{ start: 2, end: 2, text: "rho_eff_kg_m3 = E_G_J / (Math" }],
          },
        ],
        allowedCitations: [relPath],
        queryConstraints: constraints,
        strictPrompt: false,
        explicitPathOnlyExtraction: false,
        intentContract: contract,
      });
      expect(result).toBeTruthy();
      expect(result?.text).toMatch(/rho_eff_kg_m3\s*=\s*E_G_J\s*\/\s*\(Math\.max/i);
      expect(result?.text).not.toMatch(/rho_eff_kg_m3\s*=\s*E_G_J\s*\/\s*\(Math\s*(?:\n|$)/i);
    } finally {
      fs.rmSync(fullPath, { force: true });
    }
  });

  it("asserts renderer primary key parity with selector primary key", () => {
    const text = [
      "Primary Topic: collapse",
      "",
      "Primary Equation (Tentative):",
      "- [shared/dp-collapse.ts:L280] volume = (4 / 3) * PI * r * r * r",
      "",
      "Mechanism Explanation:",
      "1. baseline",
    ].join("\n");
    const parity = __testHelixAskReliabilityGuards.assertRenderedPrimaryMatchesSelection({
      selectorPrimaryKey: "shared/dp-collapse.ts:L280",
      renderedText: text,
    });
    const mismatch = __testHelixAskReliabilityGuards.assertRenderedPrimaryMatchesSelection({
      selectorPrimaryKey: "shared/dp-collapse.ts:L570",
      renderedText: text,
    });
    expect(parity.match).toBe(true);
    expect(parity.rendererPrimaryKey).toBe("shared/dp-collapse.ts:L280");
    expect(mismatch.match).toBe(false);
  });

  it("suppresses ambiguity taxonomy when equation selector authority lock is active", () => {
    const applyWithoutLock =
      __testHelixAskReliabilityGuards.resolveAmbiguityAppliedForFallbackTaxonomy({
        ambiguityApplied: true,
        equationSelectorAuthorityLock: false,
      });
    const applyWithLock =
      __testHelixAskReliabilityGuards.resolveAmbiguityAppliedForFallbackTaxonomy({
        ambiguityApplied: true,
        equationSelectorAuthorityLock: true,
      });
    const noAmbiguity =
      __testHelixAskReliabilityGuards.resolveAmbiguityAppliedForFallbackTaxonomy({
        ambiguityApplied: false,
        equationSelectorAuthorityLock: false,
      });
    expect(applyWithoutLock).toBe(true);
    expect(applyWithLock).toBe(false);
    expect(noAmbiguity).toBe(false);
  });

  it("blocks single-LLM scaffold fallback when deterministic runtime fallback is pinned", () => {
    const allowed =
      __testHelixAskReliabilityGuards.shouldAllowSingleLlmScaffoldFallback({
        deterministicRepoRuntimeFallbackUsed: false,
      });
    const blocked =
      __testHelixAskReliabilityGuards.shouldAllowSingleLlmScaffoldFallback({
        deterministicRepoRuntimeFallbackUsed: true,
      });
    expect(allowed).toBe(true);
    expect(blocked).toBe(false);
  });

  it("builds unified degrade answers with fixed sections", () => {
    const question = "explain equation of the collapse of the wave function?";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
      question,
      queryConstraints: constraints,
    });
    const text = __testHelixAskReliabilityGuards.buildEquationUnifiedDegradeAnswer({
      question,
      contract,
      candidates: [],
      reason: "test_unresolved",
    });
    expect(text).toMatch(/Primary Topic:/i);
    expect(text).toMatch(/Primary Equation \(Tentative\):/i);
    expect(text).toMatch(/Mechanism Explanation:/i);
    expect(text).toMatch(/Rejected Candidates \(Why\):/i);
    expect(text).toMatch(/Sources:/i);
  });

  it("filters wave-collapse degrade candidates toward wave-semantic lines", () => {
    const question = "Explain the equation of the collapse of the wave function in this codebase.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
      question,
      queryConstraints: constraints,
    });
    const text = __testHelixAskReliabilityGuards.buildEquationUnifiedDegradeAnswer({
      question,
      contract,
      reason: "test_wave_semantic_filter",
      candidates: [
        {
          path: "shared/collapse-benchmark.ts",
          line: 306,
          equation: "tau_ms = tau_ceiling_ms - instability * (tau_ceiling_ms - tau_floor_ms)",
          score: 92,
          semanticFit: { required: true, score: 28, ok: false, reason: "weak_domain_signal" },
          equationClass: "implementation_assignment",
          derivationLevel: "implementation",
          domainFamily: "collapse",
          sourceReliability: 0.9,
          rhsMathSignal: true,
          stringLiteralSignal: false,
          rejectionReason: null,
          source: "scan",
        },
        {
          path: "docs/DP_COLLAPSE_DERIVATION.md",
          line: 23,
          equation: "psi' = (Pm psi) / sqrt(<psi|Pm|psi>)",
          score: 88,
          semanticFit: { required: true, score: 86, ok: true, reason: "ok" },
          equationClass: "derived_relation",
          derivationLevel: "derived",
          domainFamily: "collapse",
          sourceReliability: 0.7,
          rhsMathSignal: true,
          stringLiteralSignal: false,
          rejectionReason: null,
          source: "scan",
        },
      ],
    });
    expect(text).toContain("[docs/DP_COLLAPSE_DERIVATION.md:L23]");
    expect(text).not.toContain("tau_ms = tau_ceiling_ms");
  });

  it("keeps unified degrade sources clean when unanchored candidates appear", () => {
    const question = "Explain the congruence equation of the warp bubble solution.";
    const constraints = __testHelixAskReliabilityGuards.deriveHelixAskQueryConstraints(question);
    const contract = __testHelixAskReliabilityGuards.buildHelixAskIntentContract({
      question,
      queryConstraints: constraints,
    });
    const text = __testHelixAskReliabilityGuards.buildEquationUnifiedDegradeAnswer({
      question,
      contract,
      reason: "test_anchor_cleanup",
      candidates: [
        {
          path: "",
          line: 0,
          equation: "X^x = v_s f(r_s) and X^y = X^z = 0",
          score: 86,
          semanticFit: { required: true, score: 64, ok: true, reason: "ok" },
          equationClass: "derived_relation",
          derivationLevel: "derived",
          domainFamily: "warp",
          sourceReliability: 0.5,
          rhsMathSignal: true,
          stringLiteralSignal: false,
          rejectionReason: null,
          source: "scan",
        },
        {
          path: "docs/warp-console-architecture.md",
          line: 180,
          equation: "beta^x = -v_s f(r_s)",
          score: 84,
          semanticFit: { required: true, score: 74, ok: true, reason: "ok" },
          equationClass: "derived_relation",
          derivationLevel: "derived",
          domainFamily: "warp",
          sourceReliability: 0.65,
          rhsMathSignal: true,
          stringLiteralSignal: false,
          rejectionReason: null,
          source: "scan",
        },
      ],
    });
    expect(text).toContain("Sources: docs/warp-console-architecture.md");
    expect(text).not.toMatch(/Sources:\s*,/);
    expect(text).not.toContain(",,");
  });
});

describe("objective loop primary transcript contract", () => {
  it("preserves a general non-hard lane objective-loop signal in debug payloads", () => {
    const payload = readJsonIfExists("artifacts/example-B_general.json");
    if (!payload) return;
    const debug = asObject(asObject(payload)?.debug) ?? {};

    expect(toStringOrNull(debug.intent_domain)).toBe("general");
    expect(toBooleanOrNull(debug.agent_loop_enabled)).toBe(true);

    const primaryRate = toFiniteNumber(debug.objective_loop_primary_rate);
    const primaryGuard = toBooleanOrNull(debug.objective_loop_primary_composer_guard);
    const compatibleSingleLlm = toBooleanOrNull(debug.single_llm);

    if (primaryRate !== null) {
      expect(primaryRate).toBeGreaterThanOrEqual(0);
      expect(primaryRate).toBeLessThanOrEqual(1);
    }

    expect(
      primaryRate !== null || primaryGuard === true || compatibleSingleLlm === true,
    ).toBe(true);
  });

  it("accepts objective step transcript arrays when present and validates per-item schema", () => {
    const payload = readJsonIfExists("artifacts/debugloop-general_life.json");
    if (!payload) return;
    const debug = asObject(asObject(payload)?.debug) ?? {};
    const rawTranscripts = debug.objective_step_transcripts;

    if (rawTranscripts == null) return;
    expect(Array.isArray(rawTranscripts)).toBe(true);

    const transcriptRows = rawTranscripts as unknown[];
    if (transcriptRows.length === 0) return;

    for (const row of transcriptRows) {
      expect(isObjectiveStepTranscriptRow(row)).toBe(true);
      if (!isObjectiveStepTranscriptRow(row)) continue;

      expect(typeof row.started_at === "string" || row.started_at == null).toBe(true);
      expect(typeof row.ended_at === "string" || row.ended_at == null).toBe(true);
      expect(typeof row.llm_model === "string" || row.llm_model == null).toBe(true);
      expect(typeof row.reasoning_effort === "string" || row.reasoning_effort == null).toBe(true);
      expect(typeof row.schema_name === "string" || row.schema_name == null).toBe(true);
      expect(typeof row.schema_valid === "boolean" || row.schema_valid == null).toBe(true);
    }
  });

  it("keeps unresolved required objectives fail-closed behind unknown blocks in fixtures", () => {
    const payload = readJsonIfExists("artifacts/helix-ask-final-resolution/2026-03-24T002058Z/fail-case.json");
    if (!payload) return;
    const debug = asObject(asObject(payload)?.debug) ?? {};

    expect(toStringOrNull(debug.objective_assembly_blocked_reason)).toBe(
      "objective_assembly_unresolved_requires_unknown_blocks",
    );
    expect(toBooleanOrNull(debug.objective_finalize_gate_passed)).toBe(false);
    expect(toStringOrNull(debug.objective_finalize_gate_mode)).toBe("unknown_terminal");
    expect(toFiniteNumber(debug.objective_unknown_block_count)).toBeGreaterThan(0);
    expect(toFiniteNumber(debug.objective_unresolved_without_unknown_block_count)).toBe(0);

    const coverageUnresolvedCount = toFiniteNumber(debug.objective_coverage_unresolved_count);
    if (coverageUnresolvedCount != null) {
      expect(coverageUnresolvedCount).toBeGreaterThan(0);
    }

    const objectiveReasoningTrace = asArray(debug.objective_reasoning_trace);
    if (objectiveReasoningTrace && objectiveReasoningTrace.length > 0) {
      const first = asObject(objectiveReasoningTrace[0]);
      expect(first).not.toBeNull();
      if (first) {
        expect(typeof first.objective_id).toBe("string");
        expect(typeof first.final_status).toBe("string");
        expect(typeof first.plain_reasoning).toBe("string");
        expect(asObject(first.used_telemetry)).not.toBeNull();
      }
    }

    const telemetryUsed = asObject(debug.objective_telemetry_used);
    if (telemetryUsed) {
      expect(toStringOrNull(telemetryUsed.version)).toBe("v1");
      const telemetryCoverageUnresolved = toFiniteNumber(
        telemetryUsed.objective_coverage_unresolved_count,
      );
      if (telemetryCoverageUnresolved != null) {
        expect(telemetryCoverageUnresolved).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
