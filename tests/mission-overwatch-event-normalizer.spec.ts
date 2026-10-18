import { describe, expect, it } from "vitest";
import { normalizeMissionEvent } from "../server/services/mission-overwatch/event-normalizer";

describe("mission overwatch event normalizer", () => {
  it("produces deterministic eventId for identical events", () => {
    const raw = {
      missionId: "mission-normalizer-1",
      source: "tool" as const,
      eventType: "state_change",
      classification: "info" as const,
      text: "Planner entered retrieval stage",
      ts: "2026-02-22T00:00:00.000Z",
      entityRefs: ["entity-b", "entity-a"],
      evidenceRefs: ["trace-2", "trace-1"],
    };

    const first = normalizeMissionEvent(raw);
    const second = normalizeMissionEvent(raw);

    expect(first.eventId).toBe(second.eventId);
    expect(first.entityRefs).toEqual(["entity-a", "entity-b"]);
    expect(first.evidenceRefs).toEqual(["trace-1", "trace-2"]);
  });

  it("changes eventId when normalized payload meaningfully differs", () => {
    const base = {
      missionId: "mission-normalizer-2",
      source: "tool" as const,
      eventType: "state_change",
      ts: "2026-02-22T00:01:00.000Z",
      classification: "info" as const,
    };

    const first = normalizeMissionEvent({
      ...base,
      text: "Evidence gate passed",
      evidenceRefs: ["trace:gate-pass"],
    });
    const second = normalizeMissionEvent({
      ...base,
      text: "Evidence gate failed",
      evidenceRefs: ["trace:gate-fail"],
    });

    expect(first.eventId).not.toBe(second.eventId);
  });

  it("honors caller-provided eventId", () => {
    const normalized = normalizeMissionEvent({
      eventId: "provided-event-id",
      missionId: "mission-normalizer-3",
      text: "Provided ID should be preserved",
      ts: "2026-02-22T00:02:00.000Z",
    });

    expect(normalized.eventId).toBe("provided-event-id");
  });
});
