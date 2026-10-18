import { describe, it, expect } from "vitest";
import { makeChunks } from "../client/src/lib/rag/ingest";
import { hashEmbed } from "../client/src/lib/embeddings/hash-embed";
import { deriveSectionPath } from "../client/src/lib/rag/section-path";

describe("Ingestion determinism", () => {
  const markdown =
    "\u00A71.6 Noise budgets\n\nThis is a paragraph about S(\u03C9) and r_c.\n\nNext para with more details.";

  it("produces deterministic chunk boundaries and offsets", () => {
    const chunks = makeChunks(markdown, 40, 10);
    expect(chunks[0].offset).toBe(0);
    expect(deriveSectionPath(chunks[0].lines)).toMatch(/^\u00A71\.6/);
  });

  it("generates deterministic unicode-aware embeddings", () => {
    const sample = "\u00E5ngstr\u00F6m \u03B1\u03B2\u03B3";
    const left = hashEmbed(sample, 256, [3, 5], { keepDiacritics: true });
    const right = hashEmbed(sample, 256, [3, 5], { keepDiacritics: true });
    expect(Array.from(left)).toEqual(Array.from(right));
  });
});
