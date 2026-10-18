import { describe, expect, it } from "vitest";
import {
  buildSampleRow,
  splitIntoWindows,
  pseudoRandomSeries,
  type SampleRow,
} from "../scripts/noisegen/extract-4bar.ts";

describe("extract-4bar scaffolding", () => {
  it("splits bars into consecutive 4-bar windows", () => {
    const windows = splitIntoWindows(12);
    expect(windows).toHaveLength(3);
    expect(windows[0]).toEqual({ startBar: 1, endBar: 5 });
    expect(windows[1]).toEqual({ startBar: 5, endBar: 9 });
    expect(windows[2]).toEqual({ startBar: 9, endBar: 13 });
  });

  it("produces deterministic feature vectors per window seed", () => {
    const reference = pseudoRandomSeries("demo:seed", 5, 0.6);
    const again = pseudoRandomSeries("demo:seed", 5, 0.6);
    expect(again).toEqual(reference);
  });

  it("builds stable sample rows for identical inputs", () => {
    const rowA: SampleRow = buildSampleRow("demo-track", { startBar: 1, endBar: 5 }, 120, "4/4", 0);
    const rowB: SampleRow = buildSampleRow("demo-track", { startBar: 1, endBar: 5 }, 120, "4/4", 0);
    expect(rowB).toEqual(rowA);
  });
});
