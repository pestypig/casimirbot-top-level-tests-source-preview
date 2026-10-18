import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const claimMap = () =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), "docs/research/nhm2-literature-claim-map.v1.json"),
      "utf8",
    ),
  ) as {
    claimPolicy?: Record<string, unknown>;
    sources?: Array<{
      sourceId: string;
      title: string;
      url: string;
      claimSupport?: string[];
      nonSupport?: string[];
    }>;
    formulaClaims?: Array<{
      formulaStatus?: string;
      predictiveLanguageAllowed?: boolean;
      requiredControls?: string[];
      literatureRefs?: string[];
      artifactRefs?: string[];
    }>;
  };

describe("nhm2 tile-effective counterpart literature boundary", () => {
  it("requires every external source to include non-support boundaries", () => {
    for (const source of claimMap().sources ?? []) {
      expect(source.nonSupport?.length, source.sourceId).toBeGreaterThan(0);
    }
  });

  it("does not allow external sources to validate NHM2", () => {
    const serialized = JSON.stringify(claimMap().sources ?? []).toLowerCase();
    expect(serialized).not.toMatch(/validates_nhm2|proves_nhm2|transport_validated|warp_validated/);
  });

  it("keeps QEI sources as guardrails, not proof of source availability", () => {
    const qeiSources = (claimMap().sources ?? []).filter((source) =>
      /qei|quantum|negative_energy|ford|fewster|roman|pfenning/.test(
        `${source.sourceId} ${source.title}`.toLowerCase(),
      ),
    );
    expect(qeiSources.length).toBeGreaterThan(0);
    for (const source of qeiSources) {
      expect(source.claimSupport?.some((entry) => /guardrail|context|constraint|bound/.test(entry))).toBe(true);
      expect(source.nonSupport?.some((entry) => /does_not_validate/.test(entry))).toBe(true);
    }
  });

  it("keeps holography sources context-only", () => {
    const holographySources = (claimMap().sources ?? []).filter((source) =>
      /ads_cft|ryu|entanglement|wedge|holographic/.test(source.sourceId),
    );
    expect(holographySources.length).toBeGreaterThan(0);
    for (const source of holographySources) {
      expect(source.claimSupport?.some((entry) => /context|duality|holographic|entropy|reconstruction/.test(entry))).toBe(true);
      expect(source.nonSupport?.some((entry) => /does_not_validate/.test(entry))).toBe(true);
    }
  });

  it("requires experimental-math formula claims to remain non-predictive", () => {
    expect(claimMap().claimPolicy?.noPredictiveLanguageFromExperimentalMathOnly).toBe(true);
    for (const formula of claimMap().formulaClaims ?? []) {
      expect(formula.formulaStatus).toMatch(/hypothesis|derived|numerically_checked|literature_backed|artifact_backed/);
      if (formula.formulaStatus === "hypothesis" || formula.formulaStatus === "numerically_checked") {
        expect(formula.predictiveLanguageAllowed).toBe(false);
      }
      expect(Array.isArray(formula.requiredControls)).toBe(true);
      expect(Array.isArray(formula.literatureRefs)).toBe(true);
      expect(Array.isArray(formula.artifactRefs)).toBe(true);
    }
  });
});
