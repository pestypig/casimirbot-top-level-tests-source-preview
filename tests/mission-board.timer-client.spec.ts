import { describe, expect, it } from "vitest";
import { isTimerCalloutEligible, type MissionBoardEvent } from "../client/src/lib/mission-overwatch";

describe("mission timer callout eligibility", () => {
  it("allows near-due running timer updates", () => {
    const event: MissionBoardEvent = {
      eventId: "evt-1",
      missionId: "m1",
      type: "timer_update",
      classification: "warn",
      text: "Timer running",
      ts: "2026-02-24T05:59:20.000Z",
      evidenceRefs: [],
      timerId: "t1",
      timerKind: "countdown",
      timerStatus: "running",
      timerDueTs: "2026-02-24T06:00:00.000Z",
    };
    expect(isTimerCalloutEligible(event, Date.parse("2026-02-24T05:59:10.000Z"))).toBe(true);
  });
});
