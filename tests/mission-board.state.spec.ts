import { describe, expect, it } from "vitest";
import { foldMissionSnapshot } from "../server/routes/mission-board";

type MissionBoardEvent = {
  eventId: string;
  missionId: string;
  type: "state_change" | "threat_update" | "timer_update" | "action_required" | "debrief";
  classification: "info" | "warn" | "critical" | "action";
  text: string;
  ts: string;
  fromState?: string;
  toState?: string;
  evidenceRefs: string[];
};

describe("mission board state", () => {
  it("folds event stream into deterministic mission snapshot", () => {
    const missionId = "mission-state-1";
    const events: MissionBoardEvent[] = [
      {
        eventId: "evt-1",
        missionId,
        type: "state_change",
        classification: "info",
        text: "Phase advanced to plan",
        ts: "2026-02-22T00:00:00.000Z",
        fromState: "observe",
        toState: "plan",
        evidenceRefs: [],
      },
      {
        eventId: "evt-2",
        missionId,
        type: "state_change",
        classification: "info",
        text: "Phase advanced to execute",
        ts: "2026-02-22T00:01:00.000Z",
        fromState: "verify",
        toState: "execute",
        evidenceRefs: [],
      },
      {
        eventId: "evt-3",
        missionId,
        type: "threat_update",
        classification: "critical",
        text: "Critical threat detected",
        ts: "2026-02-22T00:02:00.000Z",
        evidenceRefs: ["trace:threat-1"],
      },
      {
        eventId: "evt-4",
        missionId,
        type: "state_change",
        classification: "warn",
        text: "Status blocked",
        ts: "2026-02-22T00:03:00.000Z",
        fromState: "degraded",
        toState: "blocked",
        evidenceRefs: [],
      },
    ];

    const first = foldMissionSnapshot(events, missionId);
    const second = foldMissionSnapshot(events, missionId);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      missionId,
      phase: "execute",
      status: "blocked",
      unresolvedCritical: 1,
      updatedAt: "2026-02-22T00:03:00.000Z",
    });
  });

  it("forces phase to debrief when debrief event is present", () => {
    const missionId = "mission-state-2";
    const events: MissionBoardEvent[] = [
      {
        eventId: "evt-1",
        missionId,
        type: "state_change",
        classification: "info",
        text: "Phase execute",
        ts: "2026-02-22T01:00:00.000Z",
        toState: "execute",
        evidenceRefs: [],
      },
      {
        eventId: "evt-2",
        missionId,
        type: "debrief",
        classification: "info",
        text: "Mission debrief created",
        ts: "2026-02-22T01:01:00.000Z",
        evidenceRefs: ["evt-1"],
      },
    ];

    const snapshot = foldMissionSnapshot(events, missionId);

    expect(snapshot.phase).toBe("debrief");
    expect(snapshot.status).toBe("active");
    expect(snapshot.unresolvedCritical).toBe(0);
    expect(snapshot.updatedAt).toBe("2026-02-22T01:01:00.000Z");
  });

  it("clears unresolved critical count when ack references critical event", () => {
    const missionId = "mission-state-3";
    const events: MissionBoardEvent[] = [
      {
        eventId: "action-critical-1",
        missionId,
        type: "action_required",
        classification: "critical",
        text: "Escalation required",
        ts: "2026-02-22T02:00:00.000Z",
        evidenceRefs: [],
      },
      {
        eventId: "ack:action-critical-1:1700",
        missionId,
        type: "state_change",
        classification: "info",
        text: "Acknowledged escalation",
        ts: "2026-02-22T02:00:05.000Z",
        fromState: "pending",
        toState: "active",
        evidenceRefs: ["action-critical-1"],
      },
    ];

    const snapshot = foldMissionSnapshot(events, missionId);
    expect(snapshot.unresolvedCritical).toBe(0);
    expect(snapshot.status).toBe("active");
  });
});
