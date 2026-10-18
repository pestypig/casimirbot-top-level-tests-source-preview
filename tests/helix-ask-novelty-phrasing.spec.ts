import { describe, expect, it } from "vitest";

import {
  applyHelixAskDetailsVariant,
  applyHelixAskSummaryVariant,
  buildHelixAskMechanismSentence,
  buildHelixAskRelationDetailBlock,
  getHelixAskCompareLabels,
  getHelixAskSectionOrder,
  reduceHelixAskScaffoldRepeats,
  resolveHelixAskNoveltyFamily,
} from "../server/services/helix-ask/novelty-phrasing";

describe("helix ask novelty phrasing", () => {
  it("keeps mechanism phrasing deterministic for identical inputs", () => {
    const context = {
      family: "relation" as const,
      prompt: "How does warp relate to mission ethos?",
      seed: 7,
      temperature: 0.2,
      promptFingerprint: "abc123def456",
      intentStrategy: "hybrid_explain",
      topCitationTokenHash: "feedbead1234",
      answerPathKey: "answer:llm|answerContract:rendered",
      relationPacketSignal: "2:3:1",
    };
    const a = buildHelixAskMechanismSentence({
      claimA: "Warp constraints are explicit",
      claimB: "Ethos guardrails shape adoption",
      evidenceTarget: "server/routes/agi.plan.ts",
      context,
    });
    const b = buildHelixAskMechanismSentence({
      claimA: "Warp constraints are explicit",
      claimB: "Ethos guardrails shape adoption",
      evidenceTarget: "server/routes/agi.plan.ts",
      context,
    });
    expect(a).toBe(b);
  });

  it("localizes generic mechanism fallback for CJK prompts", () => {
    const sentence = buildHelixAskMechanismSentence({
      claimA: "输入约束已建立",
      claimB: "输出保持有界",
      evidenceTarget: "server/routes/agi.plan.ts",
      context: {
        family: "other",
        prompt: "什么是阿尔库别雷曲速泡？",
      },
    });
    expect(sentence).toContain("机制：");
    expect(sentence).not.toMatch(/\bMechanism:\b/);
  });

  it("returns valid alternative variants when key anchors change", () => {
    const base = buildHelixAskMechanismSentence({
      claimA: "Route invokes gate",
      claimB: "Output remains bounded",
      evidenceTarget: "server/routes/agi.plan.ts",
      context: {
        family: "repo_technical",
        prompt: "Explain repo mechanism",
        seed: 7,
        temperature: 0.2,
        promptFingerprint: "p0",
        intentStrategy: "repo_walk",
        topCitationTokenHash: "c0",
        answerPathKey: "a0",
      },
    });
    const variants = new Set<string>([base]);
    for (const variantCtx of [
      { seed: 11, temperature: 0.2, promptFingerprint: "p0", intentStrategy: "repo_walk", topCitationTokenHash: "c0", answerPathKey: "a0" },
      { seed: 7, temperature: 0.35, promptFingerprint: "p0", intentStrategy: "repo_walk", topCitationTokenHash: "c0", answerPathKey: "a0" },
      { seed: 7, temperature: 0.2, promptFingerprint: "p1", intentStrategy: "repo_walk", topCitationTokenHash: "c0", answerPathKey: "a0" },
      { seed: 7, temperature: 0.2, promptFingerprint: "p0", intentStrategy: "repo_contract", topCitationTokenHash: "c0", answerPathKey: "a0" },
      { seed: 7, temperature: 0.2, promptFingerprint: "p0", intentStrategy: "repo_walk", topCitationTokenHash: "c1", answerPathKey: "a1" },
    ]) {
      variants.add(
        buildHelixAskMechanismSentence({
          claimA: "Route invokes gate",
          claimB: "Output remains bounded",
          evidenceTarget: "server/routes/agi.plan.ts",
          context: {
            family: "repo_technical",
            prompt: "Explain repo mechanism",
            ...variantCtx,
          },
        }),
      );
    }
    expect(Array.from(variants).every((entry) => /\bMechanism:\s+/.test(entry))).toBe(true);
    expect(variants.size).toBeGreaterThan(1);
  });

  it("uses deterministic section ordering for targeted families", () => {
    const relationOrder = getHelixAskSectionOrder({
      family: "relation",
      prompt: "warp ethos relation",
      seed: 7,
      temperature: 0.2,
    });
    const relationOrderAgain = getHelixAskSectionOrder({
      family: "relation",
      prompt: "warp ethos relation",
      seed: 7,
      temperature: 0.2,
    });
    expect(relationOrderAgain).toEqual(relationOrder);
  });

  it("increases relation section-order diversity across seed/temp/prompt changes", () => {
    const orders = new Set<string>();
    const prompts = [
      "warp ethos relation",
      "show relation chain with governance constraints",
    ];
    for (const prompt of prompts) {
      for (const seed of [7, 11, 13]) {
        for (const temperature of [0.2, 0.35]) {
          orders.add(
            getHelixAskSectionOrder({
              family: "relation",
              prompt,
              seed,
              temperature,
              intentStrategy: "hybrid_explain",
              topCitationTokenHash: "abc123def456",
              answerPathKey: `path:${seed}:${temperature}`,
              relationPacketSignal: "2:3:1",
            }).join("|"),
          );
        }
      }
    }
    expect(orders.size).toBeGreaterThanOrEqual(3);
  });

  it("generates deterministic but diverse relation detail variants", () => {
    const baseContext = {
      family: "relation" as const,
      prompt: "explain warp ethos relation",
      seed: 7,
      temperature: 0.2,
      intentStrategy: "hybrid_explain",
      topCitationTokenHash: "aaaabbbbcccc",
      answerPathKey: "strategy:hybrid_explain|answerContract:rendered",
      relationPacketSignal: "2:4:1",
    };
    const a = buildHelixAskRelationDetailBlock({
      context: baseContext,
      evidenceTarget: "server/routes/agi.plan.ts",
    });
    const b = buildHelixAskRelationDetailBlock({
      context: baseContext,
      evidenceTarget: "server/routes/agi.plan.ts",
    });
    expect(a).toEqual(b);
    const variants = new Set<string>([a.line]);
    for (const seed of [11, 13, 17]) {
      variants.add(
        buildHelixAskRelationDetailBlock({
          context: { ...baseContext, seed, temperature: 0.35, answerPathKey: `path:${seed}` },
          evidenceTarget: "server/routes/agi.plan.ts",
        }).line,
      );
    }
    expect(variants.size).toBeGreaterThan(1);
  });

  it("deduplicates repeated scaffold lines for targeted families only", () => {
    const lines = ["A line.", "A line.", "Mechanism: A -> B", "Mechanism: A -> B", "Unique line."];
    expect(reduceHelixAskScaffoldRepeats(lines, { family: "relation", prompt: "x" })).toEqual([
      "A line.",
      "Mechanism: A -> B",
      "Unique line.",
    ]);
    expect(reduceHelixAskScaffoldRepeats(lines, { family: "other", prompt: "x" })).toEqual(lines);
  });

  it("routes relation and repo_technical families without relaxing other families", () => {
    expect(
      resolveHelixAskNoveltyFamily({
        intentProfileId: "hybrid.warp_ethos_relation",
        intentDomain: "hybrid",
        question: "How does warp relate to ethos?",
      }),
    ).toBe("relation");
    expect(
      resolveHelixAskNoveltyFamily({
        intentProfileId: "repo.warp_definition_docs_first",
        intentDomain: "repo",
        question: "Which file implements this path?",
      }),
    ).toBe("repo_technical");
    expect(
      resolveHelixAskNoveltyFamily({
        intentProfileId: "general.general_how_to_process",
        intentDomain: "general",
        question: "How do I explain this concept?",
      }),
    ).toBe("other");
  });
  it("applies deterministic summary/detail variation for targeted families", () => {
    const context = {
      family: "repo_technical" as const,
      prompt: "Explain route guards",
      seed: 7,
      temperature: 0.2,
      intentStrategy: "repo_walk",
      topCitationTokenHash: "abc",
      answerPathKey: "answer:llm|rendered",
    };
    const summary = "The route applies strict gates before returning an answer.";
    const details = "Validators enforce section contracts and citation hygiene.";
    expect(applyHelixAskSummaryVariant(summary, context)).toBe(
      applyHelixAskSummaryVariant(summary, context),
    );
    expect(applyHelixAskDetailsVariant(details, context)).toBe(
      applyHelixAskDetailsVariant(details, context),
    );
    const changed = applyHelixAskSummaryVariant(summary, { ...context, seed: 11 });
    expect(changed).not.toBe(applyHelixAskSummaryVariant(summary, context));
  });

  it("keeps compare labels deterministic and variant across key changes", () => {
    const context = {
      family: "relation" as const,
      prompt: "How does warp relate to ethos?",
      seed: 7,
      temperature: 0.2,
      relationPacketSignal: "2:3:1",
      answerPathKey: "answer:llm",
    };
    const a = getHelixAskCompareLabels(context);
    const b = getHelixAskCompareLabels(context);
    expect(a).toEqual(b);
    const c = getHelixAskCompareLabels({ ...context, seed: 13, temperature: 0.35 });
    expect(`${c.what}|${c.why}|${c.constraint}`).not.toBe(`${a.what}|${a.why}|${a.constraint}`);
  });

  it("preserves required section lines after dedupe compaction", () => {
    const lines = [
      "Mechanism: A -> B",
      "Mechanism: A -> B",
      "Maturity (exploratory): staged evidence only.",
      "Maturity (exploratory): staged evidence only.",
      "Missing evidence: add linked repo artifacts.",
      "Missing evidence: add linked repo artifacts.",
    ];
    const compact = reduceHelixAskScaffoldRepeats(lines, {
      family: "relation",
      prompt: "relation prompt",
      seed: 7,
    });
    expect(compact.some((line) => line.startsWith("Mechanism:"))).toBe(true);
    expect(compact.some((line) => /^Maturity\b/.test(line))).toBe(true);
    expect(compact.some((line) => /^Missing evidence\b/.test(line))).toBe(true);
  });

});
