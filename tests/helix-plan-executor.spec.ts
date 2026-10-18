import { beforeEach, describe, expect, it } from "vitest";
import { HELIX_PLAN_VERSION } from "../shared/helix-plan";
import {
  executeHelixPlan,
  getHelixPlanState,
  resetHelixPlanState,
} from "../client/src/lib/helix-plan-executor";

describe("helix plan executor", () => {
  beforeEach(() => {
    resetHelixPlanState();
  });

  it("applies rc and T adjustments", async () => {
    const plan = {
      version: HELIX_PLAN_VERSION,
      actions: [
        { op: "set_rc" as const, rc: 0.42 },
        { op: "set_T" as const, T: 0.31 },
      ],
    };

    const record = await executeHelixPlan("plan-rc-T", plan);

    expect(record.results.map((result) => result.status)).toEqual(["applied", "applied"]);

    const state = getHelixPlanState();
    expect(state.rc).toBeCloseTo(0.42, 5);
    expect(state.T).toBeCloseTo(0.31, 5);
  });

  it("merges absolute and relative peak updates", async () => {
    const setPeaksPlan = {
      version: HELIX_PLAN_VERSION,
      actions: [
        {
          op: "set_peaks" as const,
          mode: "absolute" as const,
          peaks: [
            { f: 6400, q: 4, gain: 0.2 },
            { f: 12800, q: 5, gain: 0.12 },
          ],
        },
      ],
    };

    await executeHelixPlan("plan-peaks-absolute", setPeaksPlan);

    const relativePlan = {
      version: HELIX_PLAN_VERSION,
      actions: [
        {
          op: "set_peaks" as const,
          mode: "relative" as const,
          peaks: [
            { f: 6410, q: 5, gain: 0.25 },
            { f: 15000, q: 4, gain: 0.14 },
          ],
        },
      ],
    };

    const record = await executeHelixPlan("plan-peaks-relative", relativePlan);
    expect(record.results[0]?.status).toBe("applied");

    const state = getHelixPlanState();
    expect(state.peaks).toHaveLength(3);
    const updated = state.peaks.find((peak) => Math.abs(peak.f - 6410) < 1);
    const added = state.peaks.find((peak) => Math.abs(peak.f - 15000) < 1);
    expect(updated?.gain).toBeGreaterThan(0.23);
    expect(updated?.q).toBeCloseTo(5, 3);
    expect(added?.gain).toBeCloseTo(0.14, 3);
  });

  it("skips duplicate plan ids", async () => {
    const plan = {
      version: HELIX_PLAN_VERSION,
      actions: [{ op: "set_rc" as const, rc: 0.5 }],
    };

    await executeHelixPlan("duplicate-plan", plan);
    const duplicate = await executeHelixPlan("duplicate-plan", plan);

    expect(duplicate.results.every((result) => result.status === "skipped")).toBe(true);
  });

  it("skips move_bubble when drive sync is unavailable", async () => {
    const plan = {
      version: HELIX_PLAN_VERSION,
      actions: [{ op: "move_bubble" as const, dx: 0.2, dy: 0.1, speed: 0.3, confirm: false }],
    };

    const record = await executeHelixPlan("plan-bubble", plan);
    expect(record.results[0]?.status).toBe("skipped");
    expect(record.results[0]?.detail).toMatch(/unavailable/i);
  });
});
