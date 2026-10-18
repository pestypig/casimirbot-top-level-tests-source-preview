import { describe, expect, it } from "vitest";
import { canTransitionObjectiveStatus } from "../shared/mission-objective-contract";
import { foldObjectiveState } from "../server/services/mission-overwatch/objective-state";

describe("mission objective state", () => {
  it("enforces deterministic status transitions", () => {
    expect(canTransitionObjectiveStatus("open", "in_progress")).toBe(true);
    expect(canTransitionObjectiveStatus("resolved", "open")).toBe(false);
  });

  it("folds objective/gap updates deterministically", () => {
    const objectives = new Map();
    const gaps = new Map();
    const event = {
      missionId: "m1",
      ts: "2026-02-24T00:00:00.000Z",
      objectiveId: "obj-1",
      objectiveTitle: "Stabilize voice path",
      objectiveStatus: "open" as const,
      gapId: "gap-1",
      gapSummary: "Suppression reason missing",
      gapSeverity: "high" as const,
    };
    foldObjectiveState(objectives as any, gaps as any, event);
    foldObjectiveState(objectives as any, gaps as any, event);
    expect(objectives.get("obj-1")).toMatchObject({ status: "open" });
    expect(gaps.get("gap-1")).toMatchObject({ severity: "high" });
  });
});
