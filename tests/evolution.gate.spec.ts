import { describe, expect, it } from "vitest";
import { runCongruenceGate } from "../server/services/evolution/congruence-gate";
import { DEFAULT_EVOLUTION_CONFIG } from "../server/services/evolution/config";

const EXPECTED_HARD_ORDER = [
  "CASIMIR_VERIFY_REQUIRED_MISSING",
  "CASIMIR_VERIFY_FAIL",
  "CONTRACT_DRIFT_VOICE",
  "CONTRACT_DRIFT_GO_BOARD",
  "TRACE_SCHEMA_BREAK",
  "API_BREAK_DETECTED",
] as const;

describe("evolution gate", () => {
  it("applies hard fail overrides", () => {
    const result = runCongruenceGate({
      config: DEFAULT_EVOLUTION_CONFIG,
      casimirVerdict: "FAIL",
      indicators: { I: 1, A: 1, P: 1, E: 1, debt: 0 },
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.firstFail?.id).toBe("CASIMIR_VERIFY_FAIL");
  });

  it("fails enforce mode when casimir verdict is missing", () => {
    const result = runCongruenceGate({
      config: DEFAULT_EVOLUTION_CONFIG,
      reportOnly: false,
      indicators: { I: 1, A: 1, P: 1, E: 1, debt: 0 },
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.firstFail?.id).toBe("CASIMIR_VERIFY_REQUIRED_MISSING");
  });

  it("emits deterministic envelope fields", () => {
    const result = runCongruenceGate({
      config: DEFAULT_EVOLUTION_CONFIG,
      reportOnly: true,
      indicators: { I: 1, A: 1, P: 1, E: 1, debt: 0.1 },
    });
    expect(result.verdict).toBe("PASS");
    expect(Array.isArray(result.deltas)).toBe(true);
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(result.firstFail).toBeNull();
  });

  it("keeps hard-fail taxonomy and ordering stable", () => {
    const seen = EXPECTED_HARD_ORDER.map((id) =>
      runCongruenceGate({
        config: DEFAULT_EVOLUTION_CONFIG,
        reportOnly: false,
        casimirVerdict: "PASS",
        indicators: { I: 1, A: 1, P: 1, E: 1, debt: 0 },
        contractDriftVoice: id === "CONTRACT_DRIFT_VOICE",
        contractDriftGoBoard: id === "CONTRACT_DRIFT_GO_BOARD",
        traceSchemaBreak: id === "TRACE_SCHEMA_BREAK",
        apiBreakDetected: id === "API_BREAK_DETECTED",
      }).firstFail?.id,
    );

    expect(
      runCongruenceGate({
        config: DEFAULT_EVOLUTION_CONFIG,
        reportOnly: false,
        indicators: { I: 1, A: 1, P: 1, E: 1, debt: 0 },
      }).firstFail?.id,
    ).toBe(EXPECTED_HARD_ORDER[0]);

    expect(seen).toEqual([
      undefined,
      undefined,
      "CONTRACT_DRIFT_VOICE",
      "CONTRACT_DRIFT_GO_BOARD",
      "TRACE_SCHEMA_BREAK",
      "API_BREAK_DETECTED",
    ]);
  });
});
