import { describe, expect, test } from "vitest";
import { generateLocalResponse } from "../client/src/lib/llm/local-generator";
import type { RankedChunk } from "../client/src/lib/rag/local-rag";
import { performance } from "perf_hooks";
import { randomUUID } from "crypto";
import { resolveLumaGenerationProvenance, withLumaGenerationProvenance } from "../server/services/luma";

const baseChunk = (overrides: Partial<RankedChunk["chunk"]>, score: number): RankedChunk => {
  const chunk: RankedChunk["chunk"] = {
    chunkId: overrides.chunkId ?? randomUUID(),
    docId: overrides.docId ?? "doc-1",
    offset: overrides.offset ?? 0,
    text: overrides.text ?? "Colored noise balances collapse strength across frequency bands.",
    createdAt: overrides.createdAt ?? Date.now(),
    page: overrides.page,
    sectionPath: overrides.sectionPath,
    title: overrides.title ?? "Review 2025 Section 1.6",
    url: overrides.url ?? "review-2025.html#1.6",
    meta: overrides.meta,
    embed: overrides.embed,
  };
  return { score, chunk };
};

describe("local LLM generator", () => {
  test("deterministic when T <= 0.1 with identical prompts", () => {
    const ranked: RankedChunk[] = [
      baseChunk(
        {
          chunkId: "c1",
          text: "Noise spectrum S(ω) weights collapse bands while dissipation caps energy rise.",
        },
        0.42,
      ),
    ];
    const prompts = [
      "Explain how S(ω) limits energy.",
      "Describe rc and noise damping.",
      "Summarize dissipative CSL energy bounds.",
    ];
    for (const prompt of prompts) {
      const first = generateLocalResponse({
        prompt,
        ranked,
        seed: 0x1a2b3c4d,
        temperature: 0.05,
        topP: 0.8,
        maxTokens: 128,
        grammar: { suffix: "References:" },
      });
      const repeat = generateLocalResponse({
        prompt,
        ranked,
        seed: 0x1a2b3c4d,
        temperature: 0.05,
        topP: 0.8,
        maxTokens: 128,
        grammar: { suffix: "References:" },
      });
      expect(repeat.output).toBe(first.output);
    }
  });

  test("emits references aligned with ranked chunks", () => {
    const ranked: RankedChunk[] = [
      baseChunk(
        {
          chunkId: "c1",
          title: "Toroš et al. 2017 — Dissipative CSL",
          url: "toros-2017.html",
          text: "Dissipative CSL introduces band-limited S(ω) with a built-in energy sink.",
        },
        0.51,
      ),
      baseChunk(
        {
          chunkId: "c2",
          title: "Review 2025 — Section 1.7",
          url: "review-2025.html#1.7",
          text: "Correlation length rc smears localization to avoid runaway heating.",
        },
        0.39,
      ),
    ];
    const result = generateLocalResponse({
      prompt: "Compare dCSL to Helix rc control.",
      ranked,
      seed: 112233,
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 160,
      grammar: { suffix: "References:" },
    });
    expect(result.output).toMatch(/\[1]/);
    expect(result.output).toContain("Toroš");
    expect(result.output).toContain("Review 2025");
  });

  test("abstains when all candidates are below threshold", () => {
    const ranked: RankedChunk[] = [
      baseChunk(
        {
          chunkId: "weak1",
          text: "Peripheral mention of tuning heuristics with no energy guarantees.",
        },
        0.02,
      ),
    ];
    const result = generateLocalResponse({
      prompt: "Do microtubules violate conservation?",
      ranked,
      seed: 9981,
      temperature: 0.4,
      topP: 0.95,
      maxTokens: 120,
      grammar: { suffix: "References:" },
    });
    expect(result.output.startsWith("Insufficient evidence")).toBe(true);
  });

  test("latex blocks retain balanced delimiters", () => {
    const ranked: RankedChunk[] = [
      baseChunk(
        {
          chunkId: "latex",
          text: "Spectral density $$S(ω) = S_0 e^{-ω^2/ω_c^2}$$ keeps finite power.",
        },
        0.61,
      ),
    ];
    const result = generateLocalResponse({
      prompt: "Write the spectral density expression.",
      ranked,
      seed: 778899,
      temperature: 0.2,
      topP: 0.85,
      maxTokens: 140,
      grammar: { suffix: "References:" },
    });
    const matches = result.output.match(/\$\$(.*?)\$\$/g);
    expect(matches).toBeTruthy();
    expect(matches?.every((block) => block.startsWith("$$") && block.endsWith("$$"))).toBe(true);
  });

  test("generation stays within latency and throughput budgets", () => {
    const ranked: RankedChunk[] = [
      baseChunk(
        {
          chunkId: "perf",
          text: "Helix maintains ≥10 tokens/s locally; dissipative control ensures bounded compute.",
        },
        0.77,
      ),
    ];
    const start = performance.now();
    const result = generateLocalResponse({
      prompt: "State the local throughput assumptions.",
      ranked,
      seed: 0xfeedbeef,
      temperature: 0.25,
      topP: 0.92,
      maxTokens: 256,
      grammar: { suffix: "References:" },
    });
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(1_200);
    const tokensPerSecond = (result.usage.completion / Math.max(elapsedMs, 1)) * 1000;
    expect(tokensPerSecond).toBeGreaterThanOrEqual(10);
  });
});


describe("luma generation provenance metadata", () => {
  test("missing or synthetic provenance resolves to diagnostic non-certifying", () => {
    const missing = resolveLumaGenerationProvenance();
    expect(missing.maturity).toBe("diagnostic");
    expect(missing.claim_tier).toBe("diagnostic");
    expect(missing.certifying).toBe(false);

    const synthetic = resolveLumaGenerationProvenance({ provenance_class: "synthetic", maturity: "certifying", certifying: true });
    expect(synthetic.provenance_class).toBe("synthetic");
    expect(synthetic.maturity).toBe("diagnostic");
    expect(synthetic.certifying).toBe(false);
  });

  test("metadata enrichment is additive and deterministic", () => {
    const base = { essence_id: "id-1", model: "sd15-lcm" };
    const first = withLumaGenerationProvenance(base, {
      provenance_class: "measured",
      maturity: "certifying",
      certifying: true,
    });
    const repeat = withLumaGenerationProvenance(base, {
      provenance_class: "measured",
      maturity: "certifying",
      certifying: true,
    });

    expect(first).toEqual(repeat);
    expect(first.essence_id).toBe("id-1");
    expect(first.provenance.maturity).toBe("certifying");
    expect(first.provenance.certifying).toBe(true);
  });
});
