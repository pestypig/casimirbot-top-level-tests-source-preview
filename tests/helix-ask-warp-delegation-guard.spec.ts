import { describe, expect, it } from "vitest";
import { buildHelixAskMathAnswer, solveHelixAskMathQuestion } from "../server/services/helix-ask/math";

describe("helix ask warp delegation guard", () => {
  it("physically viable asks require certificate path", async () => {
    const out = await solveHelixAskMathQuestion("is this physically viable?");
    expect(out?.reason).toBe("warp_delegation_required");
  });

  it("no certificate returns not certified response", () => {
    const msg = buildHelixAskMathAnswer({ ok: false, reason: "warp_delegation_required" } as any);
    expect(msg).toContain("NOT_CERTIFIED");
    expect(msg).toContain("FordRomanQI");
  });
});
