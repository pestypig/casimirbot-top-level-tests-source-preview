import { describe, expect, it } from "vitest";
import { normalizeTerm } from "../client/src/lib/code-index/atlas";
import { rankDeterministic } from "../client/src/lib/code-index/ranker";
import type { RankedSymbol } from "../client/src/lib/code-index/ranker";
import type { SymbolRec } from "../client/src/lib/code-index/types";

const makeRankedSymbol = (chunkId: string, score = 1): RankedSymbol => {
  const baseSymbol: SymbolRec = {
    path: chunkId.split("#")[0],
    lang: "ts",
    symbol: "S",
    kind: "function",
    signature: undefined,
    aliases: [],
    doc: "",
    text: "",
    chunkId,
    byteStart: 0,
    byteEnd: 0,
    imports: [],
    calls: [],
    uses: [],
    commit: "workspace",
    createdAt: 0,
  };
  return {
    symbol: baseSymbol,
    score,
    hits: { symbol: [], doc: [], text: [], imports: [] },
    components: { symbol: 0, text: 0, cosine: 0, imports: 0 },
  };
};

describe("Normalization", () => {
  it("maps omega/rc aliases to canonical", () => {
    expect(normalizeTerm("omega_T")).toBe("Ω_T");
    expect(normalizeTerm("ω_T")).toBe("Ω_T");
    expect(normalizeTerm("r_c")).toBe("r_c");
    expect(normalizeTerm("corrLen")).toBe("r_c");
  });
});

describe("Ranking determinism", () => {
  it("ties resolve by chunkId", () => {
    const first = makeRankedSymbol("a.ts#S@0-10", 1);
    const second = makeRankedSymbol("b.ts#S@0-10", 1);
    const ordered = rankDeterministic("S", [second, first]);
    expect(ordered.map((entry) => entry.symbol.chunkId)).toEqual(["a.ts#S@0-10", "b.ts#S@0-10"]);
  });
});
