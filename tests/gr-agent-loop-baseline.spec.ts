import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateGrConstraintGateFromMetrics } from "../server/gr/constraint-evaluator";

type BaselineRun = {
  id: string;
  label?: string;
  metrics: {
    H_rms: number;
    M_rms: number;
    H_maxAbs: number;
    M_maxAbs: number;
  };
};

type BaselineDataset = {
  version: number;
  description?: string;
  runs: BaselineRun[];
};

const baselinePath = path.resolve(
  process.cwd(),
  "tests/fixtures/gr-agent-loop-baseline.json",
);

const loadBaseline = (): BaselineDataset => {
  const raw = fs.readFileSync(baselinePath, "utf8");
  const parsed = JSON.parse(raw) as BaselineDataset;
  if (!parsed || !Array.isArray(parsed.runs)) {
    throw new Error("Invalid baseline dataset format.");
  }
  return parsed;
};

describe("gr agent loop baseline gate", () => {
  it("keeps canonical runs gate-green", () => {
    const dataset = loadBaseline();
    for (const run of dataset.runs) {
      const evaluation = evaluateGrConstraintGateFromMetrics(run.metrics);
      expect(evaluation.gate.status, run.id).toBe("pass");
      const hardFailures = evaluation.constraints.filter(
        (entry) => entry.severity === "HARD" && entry.status !== "pass",
      );
      expect(hardFailures, run.id).toEqual([]);
    }
  });
});
