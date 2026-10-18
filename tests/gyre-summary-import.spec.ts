import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importStarSimGyreSummary } from "../server/modules/starsim/external/gyre-summary-import";

const summaryPath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "starsim-solar-reference",
  "solar-gyre-summary.fixture.json",
);

describe("GYRE summary import", () => {
  it("imports a GYRE summary fixture", () => {
    const summary = importStarSimGyreSummary({ enabled: true, summaryPath });
    expect(summary.objectId).toBe("Sun");
    expect(summary.modeCount).toBe(32);
  });

  it("rejects missing mode summary hash for reproduced mode", () => {
    expect(() =>
      importStarSimGyreSummary({
        enabled: true,
        summaryPath: join(
          process.cwd(),
          "tests",
          "fixtures",
          "starsim-solar-reference",
          "solar-gyre-summary-no-hash.fixture.json",
        ),
        requireSummaryHash: true,
      }),
    ).toThrow(/hash/);
  });

  it("reports not_available when disabled", () => {
    const summary = importStarSimGyreSummary({ enabled: false });
    expect(summary.source).toBe("not_available");
  });
});
