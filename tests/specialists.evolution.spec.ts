import { describe, it, expect } from "vitest";
import { evolutionVerifierHandler } from "../server/specialists/verifiers/evolution.verify";

const baseProblem = {
  id: "demo-problem",
  persona_id: "persona:test",
  goal: "test evolution verifier",
  context: {},
};

describe("evolution.verify", () => {
  it("passes a norm-preserving rotation", async () => {
    const evalProblem = {
      id: "vec.ok",
      family: "vector" as const,
      state0: { kind: "vec2" as const, v: [3, 4] as [number, number] },
      rule: { type: "vector.rotate" as const, theta_deg: 90 },
      steps_required: 1,
    };
    const steps = [
      {
        input: { kind: "vec2" as const, v: [3, 4] as [number, number] },
        output: { kind: "vec2" as const, v: [-4, 3] as [number, number] },
        op_desc: "rotate 90 deg",
      },
    ];
    const result = await evolutionVerifierHandler({
      problem: baseProblem,
      solver_output: {
        summary: "rotated",
        data: { problem: evalProblem, steps },
        artifacts: [],
        essence_ids: [],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.metrics?.score ?? 0).toBeGreaterThan(0.9);
  });

  it("fails when ledger mass drops", async () => {
    const evalProblem = {
      id: "ledger.bad",
      family: "ledger" as const,
      state0: { kind: "ledger" as const, accounts: [{ id: "a", bal: 2 }, { id: "b", bal: 1 }] },
      rule: { type: "ledger.transfer" as const, allow_negative: false },
      steps_required: 1,
    };
    const steps = [
      {
        input: { kind: "ledger" as const, accounts: [{ id: "a", bal: 2 }, { id: "b", bal: 1 }] },
        output: { kind: "ledger" as const, accounts: [{ id: "a", bal: 2 }, { id: "b", bal: 0 }] },
        op_desc: "lost value",
      },
    ];
    const result = await evolutionVerifierHandler({
      problem: baseProblem,
      solver_output: {
        summary: "oops",
        data: { problem: evalProblem, steps },
        artifacts: [],
        essence_ids: [],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.metrics?.score ?? 1).toBeLessThan(0.7);
  });
});
