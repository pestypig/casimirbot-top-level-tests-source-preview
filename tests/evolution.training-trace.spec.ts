import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetTrainingTraceStore,
  getTrainingTraces,
  recordEvolutionTrace,
} from "../server/services/observability/training-trace-store";
import { trainingTraceSchema } from "../shared/schema";

describe("evolution training trace integration", () => {
  beforeEach(() => {
    __resetTrainingTraceStore();
  });

  it("records additive PASS trace rows for evolution runs", () => {
    recordEvolutionTrace({
      traceId: "evolution:test:pass",
      pass: true,
      verdict: "PASS",
      score: 88,
      artifacts: [{ kind: "evolution-gate-mode", ref: "report-only" }],
    });
    const traces = getTrainingTraces({ limit: 50 });
    const found = traces.find((row) => row.traceId === "evolution:test:pass");
    expect(found).toBeTruthy();
    expect(found?.source?.tool).toBe("evolution.gate");
    expect(found?.notes).toContain("source=evolution.gate");
    expect(trainingTraceSchema.safeParse(found).success).toBe(true);
  });

  it("records schema-valid FAIL firstFail constraint", () => {
    recordEvolutionTrace({
      traceId: "evolution:test:fail",
      pass: false,
      verdict: "FAIL",
      firstFail: {
        id: "TRACE_SCHEMA_BREAK",
        severity: "HARD",
        status: "fail",
        value: 1,
        limit: "0",
      },
      score: 61,
      artifacts: [{ kind: "evolution-gate-mode", ref: "enforce" }],
    });

    const traces = getTrainingTraces({ limit: 50 });
    const found = traces.find((row) => row.traceId === "evolution:test:fail");
    expect(found?.pass).toBe(false);
    expect(found?.firstFail?.id).toBe("TRACE_SCHEMA_BREAK");
    expect(found?.firstFail?.value).toBe(1);
    expect(found?.firstFail?.limit).toBe("0");
    expect(trainingTraceSchema.safeParse(found).success).toBe(true);
  });
});
