import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { evaluateLiteratureClaimMap } from "../tools/nhm2/validate-reference-run";

describe("nhm2 literature claim map", () => {
  it("bounds every external support claim with non-support entries", () => {
    const map = JSON.parse(
      readFileSync("docs/research/nhm2-literature-claim-map.v1.json", "utf8"),
    ) as {
      sources: Array<{
        sourceId: string;
        url: string;
        claimSupport: string[];
        nonSupport: string[];
      }>;
    };

    for (const source of map.sources) {
      if (source.claimSupport.length > 0) {
        expect(source.nonSupport.length, source.sourceId).toBeGreaterThan(0);
      }
      expect(
        /^(https:\/\/arxiv\.org\/abs\/|https:\/\/doi\.org\/|https:\/\/journals\.aps\.org\/)/.test(
          source.url,
        ),
        source.sourceId,
      ).toBe(true);
      const joined = [...source.claimSupport, ...source.nonSupport].join(" ");
      expect(joined).not.toMatch(
        /validates_nhm2|proves_nhm2|transport_validated|warp_validated/,
      );
      const qeiSource =
        source.sourceId.toLowerCase().includes("qei") ||
        source.sourceId.toLowerCase().includes("quantum_inequality") ||
        source.claimSupport.some((entry) => /qei|negative_energy/.test(entry));
      if (qeiSource) {
        expect(source.nonSupport, source.sourceId).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/does_not_validate_.*tile_source|does_not_validate_tile_effective_source|does_not_validate_strobed_tile_source/),
          ]),
        );
      }
    }
    expect(evaluateLiteratureClaimMap(map).state).toBe("pass");
  });
});
