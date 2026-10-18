import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildStage05EvidenceCards } from "../server/services/helix-ask/stage0-content";

const TEST_ROOT = path.join(process.cwd(), ".tmp-stage05-tests");

const writeTestFile = (relativePath: string, content: string | Buffer): string => {
  const repoRelativePath = path.posix.join(".tmp-stage05-tests", relativePath.replace(/\\/g, "/"));
  const absPath = path.join(process.cwd(), repoRelativePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return repoRelativePath.replace(/\\/g, "/");
};

afterEach(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("helix ask stage0.5 content lane", () => {
  it("returns deterministic empty telemetry when candidates are missing", async () => {
    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "warp bubble",
      filePaths: [],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
    });

    expect(result.cards).toEqual([]);
    expect(result.telemetry.used).toBe(false);
    expect(result.telemetry.fallback_reason).toBe("stage05_no_candidates");
  });

  it("extracts mixed file kinds into citation-ready cards", async () => {
    const paths = [
      writeTestFile(
        "server/services/helix-ask/mock-stage05.ts",
        [
          "export function solveWarpBubble(alpha: number): number {",
          "  return alpha * 2;",
          "}",
          "export const describeBubble = (name: string) => `bubble:${name}`;",
        ].join("\n"),
      ),
      writeTestFile(
        "docs/knowledge/warp/mock-stage05.md",
        [
          "# Warp Bubble",
          "## Mechanics",
          "A warp bubble contracts spacetime in front and expands behind.",
        ].join("\n"),
      ),
      writeTestFile(
        "configs/mock-stage05.yaml",
        [
          "warp:",
          "  bubble:",
          "    enabled: true",
          "    max_velocity: 2.5",
        ].join("\n"),
      ),
      writeTestFile("data/mock-stage05.csv", "name,energy\nbubble,42\n"),
      writeTestFile("assets/mock-stage05.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x10])),
    ];

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "how does warp bubble config work in the repo",
      filePaths: paths,
      commit: "abc123",
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.cards.length).toBeGreaterThanOrEqual(4);
    expect(result.telemetry.used).toBe(true);
    expect(result.telemetry.card_count).toBe(result.cards.length);
    expect(result.telemetry.kind_counts.code).toBeGreaterThan(0);
    expect(result.telemetry.kind_counts.doc).toBeGreaterThan(0);
    expect(result.telemetry.kind_counts.config).toBeGreaterThan(0);
    expect(result.telemetry.kind_counts.data).toBeGreaterThan(0);
    expect(result.telemetry.kind_counts.binary).toBeGreaterThan(0);
    expect(result.cards.some((card) => card.path.includes("mock-stage05.ts"))).toBe(true);
  });

  it("applies llm-first summary patches when helper succeeds", async () => {
    const filePath = writeTestFile(
      "server/services/helix-ask/mock-stage05-summary.ts",
      ["export function warpCard(): string {", "  return 'card';", "}"].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "stage05 llm patch",
      filePaths: [filePath],
      commit: "def456",
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 800,
      binaryMetadataOnly: true,
      summaryRequired: false,
      hardFailOnSummaryError: false,
      summarizeWithLlm: async () => ({
        summaries: {
          [filePath]: {
            summary: "LLM patched summary for warp card extraction.",
            symbolsOrKeys: ["warpCard"],
            confidence: 0.88,
          },
        },
      }),
    });

    expect(result.cards.length).toBe(1);
    expect(result.telemetry.llm_used).toBe(true);
    expect(result.cards[0]?.summary).toContain("LLM patched summary");
    expect(result.cards[0]?.symbolsOrKeys).toContain("warpCard");
  });

  it("hard-fails when summaries are required and llm summarizer is unavailable", async () => {
    const filePath = writeTestFile(
      "server/services/helix-ask/mock-stage05-hard-fail.ts",
      ["export function failCase(): string {", "  return 'x';", "}"].join("\n"),
    );
    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "how does fail case work",
      filePaths: [filePath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      summaryRequired: true,
      hardFailOnSummaryError: true,
    });
    expect(result.cards).toEqual([]);
    expect(result.telemetry.summary_hard_fail).toBe(true);
    expect(result.telemetry.summary_fail_reason).toBe("stage05_llm_unavailable");
    expect(result.telemetry.slot_coverage).not.toBeNull();
    expect(result.telemetry.slot_coverage?.missing.length ?? 0).toBeGreaterThan(0);
  });

  it("fails open with deterministic cards on stage05 llm runtime summary errors", async () => {
    const docPath = writeTestFile(
      "docs/knowledge/warp/mock-stage05-runtime-fail-open.md",
      [
        "# Warp bubble solve overview",
        "Mechanism summary for how warp solve flow is described in docs.",
      ].join("\n"),
    );
    const codePath = writeTestFile(
      "modules/warp/mock-stage05-runtime-fail-open.ts",
      [
        "export function solveWarpRuntime(alpha: number): number {",
        "  return alpha * 4;",
        "}",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "How is the warp bubble solved in the codebase?",
      filePaths: [docPath, codePath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 800,
      binaryMetadataOnly: true,
      intentDomain: "repo",
      summaryRequired: true,
      hardFailOnSummaryError: true,
      summarizeWithLlm: async () => {
        throw new Error("llm_http_429");
      },
    });

    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.telemetry.summary_hard_fail).toBe(true);
    expect(result.telemetry.summary_fail_reason).toBe("stage05_llm_http_429");
    expect(result.telemetry.fallback_reason).toBe("stage05_llm_http_429");
    expect(result.telemetry.llm_error_code).toBe("llm_http_429");
    expect(result.telemetry.llm_error_class).toBe("rate_limited");
    expect(result.telemetry.slot_coverage?.required ?? []).toEqual(
      expect.arrayContaining(["definition", "mechanism", "code_path"]),
    );
    expect((result.telemetry.slot_coverage?.present?.length ?? 0)).toBeGreaterThan(0);
  });

  it("accepts partial llm summary coverage when at least one card is summarized", async () => {
    const codePath = writeTestFile(
      "server/services/helix-ask/mock-stage05-partial.ts",
      ["export function partialCard(): string {", "  return 'ok';", "}"].join("\n"),
    );
    const docPath = writeTestFile(
      "docs/knowledge/warp/mock-stage05-partial.md",
      ["# Partial card", "## Overview", "Explains partial summary behavior."].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "what is this and where is the code path",
      filePaths: [codePath, docPath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      summaryRequired: true,
      hardFailOnSummaryError: true,
      summarizeWithLlm: async () => ({
        summaries: {
          [`./${codePath}:`]: {
            summary: "Partial LLM summary anchored to the primary code path.",
            symbolsOrKeys: ["partialCard"],
            confidence: 0.86,
            slotHits: ["definition", "code_path"],
          },
        },
      }),
    });

    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.telemetry.summary_hard_fail).toBe(false);
    expect(result.telemetry.llm_used).toBe(true);
    expect(result.telemetry.summary_fail_reason).toBeNull();
  });

  it("forces equation slot coverage for broad warp-math quote prompts", async () => {
    const docPath = writeTestFile(
      "docs/warp-geometry-congruence-report.md",
      [
        "# Warp Geometry Congruence Report",
        "If you set X^x = v_s f(r_s) and X^y = X^z = 0, you reproduce Alcubierre's ds^2 form.",
      ].join("\n"),
    );
    const codePath = writeTestFile(
      "modules/warp/natario-warp.ts",
      [
        "export function natarioCongruenceEquation(vs: number, rs: number): string {",
        "  return `X^x = v_s f(r_s)`;",
        "}",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "Can you quote the Natario to Alcubierre congruence equation from the codebase and cite the file?",
      filePaths: [docPath, codePath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      summaryRequired: true,
      hardFailOnSummaryError: true,
    });

    expect(result.telemetry.slot_plan?.slots).toContain("equation");
    expect(result.telemetry.slot_plan?.required).toContain("equation");
    expect(result.telemetry.slot_plan?.required).toContain("code_path");
  });

  it("does not hard-require code_path for conceptual equation-of prompts without repo path cues", async () => {
    const docPath = writeTestFile(
      "docs/knowledge/physics/collapse-equation.md",
      [
        "# Collapse notes",
        "S = |∫ g(t) ρ_neg(t) dt| / qi_limit",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "what's the equation of the collapse of the wave function?",
      filePaths: [docPath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      intentDomain: "hybrid",
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.telemetry.slot_plan?.required).toContain("equation");
    expect(result.telemetry.slot_plan?.required ?? []).not.toContain("code_path");
  });

  it("prioritizes conceptual slots for relation prompts without implementation cues", async () => {
    const docPath = writeTestFile(
      "docs/knowledge/warp/ethos-relation-concept.md",
      [
        "# Warp and Ethos",
        "## Mechanism",
        "Mission ethos constrains warp viability claims to measurable checkpoints.",
        "This relation links stewardship commitments with reproducible evidence.",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "How does mission ethos relate to warp viability?",
      filePaths: [docPath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      intentDomain: "hybrid",
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.telemetry.slot_plan?.required ?? []).toEqual(
      expect.arrayContaining(["definition", "mechanism"]),
    );
    expect(result.telemetry.slot_plan?.required ?? []).not.toContain("code_path");
    expect(result.telemetry.slot_coverage?.missing ?? []).not.toContain("code_path");
    expect(result.telemetry.slot_coverage?.ratio).toBe(1);
  });

  it("keeps code_path required for relation prompts with explicit implementation cues", async () => {
    const docPath = writeTestFile(
      "docs/knowledge/warp/ethos-relation-implementation.md",
      [
        "# Warp and Ethos Implementation",
        "## Mechanism",
        "Stewardship controls are wired into viability checkpoints.",
      ].join("\n"),
    );
    const codePath = writeTestFile(
      "server/services/helix-ask/relation-implementation-cue.ts",
      [
        "export function mapEthosToWarpGate(policy: string): string {",
        "  return `gate:${policy}`;",
        "}",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "How does mission ethos relate to warp viability in the repo module path?",
      filePaths: [docPath, codePath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      intentDomain: "hybrid",
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.telemetry.slot_plan?.required ?? []).toContain("code_path");
  });

  it("keeps equation slot coverage when llm summaries omit equation slot hits", async () => {
    const docPath = writeTestFile(
      "docs/warp-geometry-congruence-bridge.md",
      [
        "# Congruence Bridge",
        "Natario form to Alcubierre form: ds^2 = -dt^2 + (dx - v_s f(r_s)dt)^2 + dy^2 + dz^2.",
      ].join("\n"),
    );
    const codePath = writeTestFile(
      "modules/warp/natario-equation-bridge.ts",
      [
        "export const natarioEquation = (vs: number, f: number) => `X^x = ${vs} * ${f}`;",
        "export const alcubierreMetric = \"ds^2 = -dt^2 + (dx - v_s f(r_s)dt)^2 + dy^2 + dz^2\";",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "Quote the warp congruence equation and show code path.",
      filePaths: [docPath, codePath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 800,
      binaryMetadataOnly: true,
      summaryRequired: true,
      hardFailOnSummaryError: true,
      summarizeWithLlm: async () => ({
        summaries: {
          [docPath]: {
            summary: "Doc card covering congruence context and source path.",
            symbolsOrKeys: ["congruence"],
            slotHits: ["definition", "code_path"],
            confidence: 0.7,
          },
          [codePath]: {
            summary: "Code card with metric helper and path mapping.",
            symbolsOrKeys: ["natarioEquation", "alcubierreMetric"],
            slotHits: ["definition", "code_path"],
            confidence: 0.72,
          },
        },
      }),
    });

    expect(result.telemetry.summary_hard_fail).toBe(false);
    expect(result.telemetry.slot_coverage?.missing ?? []).not.toContain("equation");
    expect(result.cards.some((card) => (card.slotHits ?? []).includes("equation"))).toBe(true);
  });

  it("does not infer mechanism slot from the word show", async () => {
    const codePath = writeTestFile(
      "modules/warp/show-signal-boundary.ts",
      [
        "export const metricEq = \"equation = warp\";",
        "export function pathHint(): string { return 'modules/warp/show-signal-boundary.ts'; }",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "Show code path evidence for warp equation.",
      filePaths: [codePath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.telemetry.slot_plan?.required ?? []).not.toContain("mechanism");
    expect(result.telemetry.slot_plan?.required ?? []).toContain("code_path");
    expect(result.telemetry.slot_plan?.required ?? []).toContain("equation");
  });

  it("does not count doc-only cards as code_path coverage for repo intents", async () => {
    const docPath = writeTestFile(
      "docs/knowledge/warp/doc-only-code-path.md",
      [
        "# Repo notes",
        "This document references module paths but does not include executable code.",
        "See modules/warp/natario-warp.ts for implementation details.",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "Where is the code path for the warp definition?",
      filePaths: [docPath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      intentDomain: "repo",
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.telemetry.slot_plan?.required ?? []).toContain("code_path");
    expect(result.telemetry.slot_coverage?.missing ?? []).toContain("code_path");
  });

  it("does not hard-require code_path for equation-focused repo prompts without explicit path cues", async () => {
    const docPath = writeTestFile(
      "docs/knowledge/warp/soft-code-path-gap.md",
      [
        "# Warp congruence equation",
        "ds^2 = -c^2 dt^2 + a^2(dx^2 + dy^2 + dz^2)",
        "This section explains congruence implications for warp metrics.",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "Show one equation used in warp congruence and explain what it means.",
      filePaths: [docPath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 800,
      binaryMetadataOnly: true,
      intentDomain: "repo",
      summaryRequired: true,
      hardFailOnSummaryError: true,
      summarizeWithLlm: async () => ({
        summaries: {
          [docPath]: {
            summary:
              "Warp congruence equation anchor: ds^2 = -c^2 dt^2 + a^2(dx^2 + dy^2 + dz^2).",
            symbolsOrKeys: ["warp congruence equation"],
            slotHits: ["definition", "equation"],
            confidence: 0.87,
          },
        },
      }),
    });

    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.telemetry.summary_hard_fail).toBe(false);
    expect(result.telemetry.summary_fail_reason).toBeNull();
    expect(result.telemetry.fallback_reason).toBeNull();
    expect(result.telemetry.slot_plan?.required ?? []).not.toContain("code_path");
    expect(result.telemetry.slot_coverage?.missing ?? []).not.toContain("code_path");
  });

  it("hard-fails hybrid physics prompts without doc+code diversity", async () => {
    const codePath = writeTestFile(
      "modules/warp/hybrid-diversity-code-only.ts",
      [
        "export function solveHybridWarp(alpha: number): number {",
        "  return alpha * 3;",
        "}",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: true,
      query: "How does warp physics congruence solve work in this system?",
      filePaths: [codePath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 800,
      binaryMetadataOnly: true,
      intentDomain: "hybrid",
      summaryRequired: true,
      hardFailOnSummaryError: true,
      summarizeWithLlm: async () => ({
        summaries: {
          [codePath]: {
            summary: "Code path for hybrid warp congruence solve.",
            symbolsOrKeys: ["solveHybridWarp"],
            slotHits: ["definition", "code_path"],
            confidence: 0.91,
          },
        },
      }),
    });

    expect(result.cards).toEqual([]);
    expect(result.telemetry.summary_hard_fail).toBe(true);
    expect(result.telemetry.summary_fail_reason).toContain("stage05_hybrid_diversity_missing:doc");
  });

  it("forces a code candidate into the extraction window when code_path is required", async () => {
    const docPaths = [
      writeTestFile(
        "docs/knowledge/physics/dce-a.md",
        "# Dynamic Casimir\nDynamic Casimir modulation and outputs in physics systems.",
      ),
      writeTestFile(
        "docs/knowledge/physics/dce-b.md",
        "# Modulation\nHow dynamic Casimir modulation affects reported outputs.",
      ),
      writeTestFile(
        "docs/knowledge/physics/dce-c.md",
        "# Outputs\nSystem physics outputs and dynamic Casimir notes.",
      ),
      writeTestFile(
        "docs/knowledge/physics/dce-d.md",
        "# Evidence\nDynamic Casimir modulation overview.",
      ),
    ];
    const codePath = writeTestFile(
      "modules/physics/dce-compute.ts",
      [
        "export function computeDceOutput(x: number): number {",
        "  return x * 0.5;",
        "}",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "How does dynamic Casimir modulation feed into the system's physics outputs?",
      filePaths: [...docPaths, codePath],
      maxFiles: 3,
      maxCards: 3,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      intentDomain: "hybrid",
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.telemetry.file_count).toBe(3);
    expect(result.cards.some((card) => card.kind === "code")).toBe(true);
  });

  it("prefers equation-bearing content over roadmap-like path matches during preselection", async () => {
    const roadmapPath = writeTestFile(
      "docs/collapse/collapse-equation-roadmap.md",
      [
        "# Collapse Equation Roadmap",
        "- task: map milestones for equation reporting",
        "- checklist: gather files and ownership",
        "- phase: pending implementation notes",
      ].join("\n"),
    );
    const equationPath = writeTestFile(
      "docs/quantum/measurement-notes.md",
      [
        "# Measurement notes",
        "Wave-function collapse relation: p(x) = |psi(x)|^2.",
        "Normalization condition: integral p(x) dx = 1.",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "explain equation of the collapse of the wave function",
      filePaths: [roadmapPath, equationPath],
      maxFiles: 1,
      maxCards: 1,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      intentDomain: "hybrid",
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.telemetry.file_count).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.path).toBe(equationPath);
    expect(result.cards[0]?.snippets.some((snippet) => snippet.text.includes("="))).toBe(true);
  });

  it("adds taxonomy metadata to stage-0.5 cards for equation-oriented content", async () => {
    const equationPath = writeTestFile(
      "modules/dynamic/collapse-equation-metadata.ts",
      [
        "export const collapseEnabled = true;",
        "psi = Pm psi0 / sqrt(prob)",
      ].join("\n"),
    );

    const result = await buildStage05EvidenceCards({
      enabled: true,
      llmFirst: false,
      query: "explain equation of the collapse of the wave function",
      filePaths: [equationPath],
      maxFiles: 12,
      maxCards: 8,
      maxExtractChars: 24_000,
      maxSnippetChars: 320,
      timeoutMs: 500,
      binaryMetadataOnly: true,
      intentDomain: "hybrid",
      summaryRequired: false,
      hardFailOnSummaryError: false,
    });

    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards[0]?.equationClass).toBeDefined();
    expect(result.cards[0]?.domainFamily).toBeDefined();
    expect(result.cards[0]?.derivationLevel).toBeDefined();
    expect(Array.isArray(result.cards[0]?.constantsDetected)).toBe(true);
    expect(Array.isArray(result.cards[0]?.symbolRoles)).toBe(true);
  });

});
