import { describe, expect, it } from "vitest";
import { createSalienceState, evaluateSalience } from "../server/services/mission-overwatch/salience";

import { buildMicroDebrief } from "../server/services/mission-overwatch/micro-debrief";

describe("mission overwatch salience", () => {
  it("emits first event and suppresses duplicate during cooldown", () => {
    const state = createSalienceState();
    const tsMs = Date.parse("2026-02-22T00:00:00.000Z");
    const base = {
      missionId: "mission-a",
      eventType: "state_change",
      classification: "warn" as const,
      dedupeKey: "evt-1",
    };

    const first = evaluateSalience({ ...base, tsMs }, state);
    const second = evaluateSalience({ ...base, tsMs: tsMs + 1_000 }, state);

    expect(first).toMatchObject({
      speak: true,
      reason: "emit",
      dedupeKey: "evt-1",
      priority: "warn",
      cooldownMs: 30_000,
    });
    expect(second).toMatchObject({
      speak: false,
      reason: "dedupe_cooldown",
      dedupeKey: "evt-1",
      priority: "warn",
      cooldownMs: 30_000,
    });
  });

  it("rate-limits third non-critical callout in mission window", () => {
    const state = createSalienceState();
    const t0 = Date.parse("2026-02-22T00:01:00.000Z");

    const first = evaluateSalience(
      {
        missionId: "mission-b",
        eventType: "state_change",
        classification: "info",
        dedupeKey: "evt-1",
        tsMs: t0,
      },
      state,
    );
    const second = evaluateSalience(
      {
        missionId: "mission-b",
        eventType: "state_change",
        classification: "info",
        dedupeKey: "evt-2",
        tsMs: t0 + 500,
      },
      state,
    );
    const third = evaluateSalience(
      {
        missionId: "mission-b",
        eventType: "state_change",
        classification: "info",
        dedupeKey: "evt-3",
        tsMs: t0 + 1_000,
      },
      state,
    );

    expect(first.reason).toBe("emit");
    expect(second.reason).toBe("emit");
    expect(third).toMatchObject({
      speak: false,
      reason: "mission_rate_limited",
      priority: "info",
      cooldownMs: 60_000,
    });
  });

  it("allows critical/action callouts to bypass mission cap", () => {
    const state = createSalienceState();
    const t0 = Date.parse("2026-02-22T00:02:00.000Z");

    evaluateSalience(
      {
        missionId: "mission-c",
        eventType: "state_change",
        classification: "warn",
        dedupeKey: "evt-1",
        tsMs: t0,
      },
      state,
    );
    evaluateSalience(
      {
        missionId: "mission-c",
        eventType: "state_change",
        classification: "warn",
        dedupeKey: "evt-2",
        tsMs: t0 + 1000,
      },
      state,
    );

    const critical = evaluateSalience(
      {
        missionId: "mission-c",
        eventType: "threat_update",
        classification: "critical",
        dedupeKey: "evt-3",
        tsMs: t0 + 2000,
      },
      state,
    );

    expect(critical).toMatchObject({
      speak: true,
      reason: "emit",
      priority: "critical",
      cooldownMs: 10_000,
    });
  });

  it("returns deterministic reason under repeated overload events", () => {
    const state = createSalienceState();
    const t0 = Date.parse("2026-02-22T00:04:00.000Z");

    const first = evaluateSalience(
      {
        missionId: "mission-overload",
        eventType: "state_change",
        classification: "warn",
        dedupeKey: "evt-a",
        tsMs: t0,
      },
      state,
    );
    const second = evaluateSalience(
      {
        missionId: "mission-overload",
        eventType: "state_change",
        classification: "warn",
        dedupeKey: "evt-b",
        tsMs: t0 + 100,
      },
      state,
    );
    const third = evaluateSalience(
      {
        missionId: "mission-overload",
        eventType: "state_change",
        classification: "warn",
        dedupeKey: "evt-c",
        tsMs: t0 + 200,
      },
      state,
    );

    expect(first.reason).toBe("emit");
    expect(second.reason).toBe("emit");
    expect(third.reason).toBe("mission_rate_limited");
  });

  it("falls back to composed dedupe key when explicit key is absent", () => {
    const state = createSalienceState();
    const t0 = Date.parse("2026-02-22T00:03:00.000Z");

    const decision = evaluateSalience(
      {
        missionId: "mission-d",
        eventType: "timer_update",
        classification: "action",
        entityId: "entity-1",
        riskId: "risk-1",
        timerId: "timer-1",
        tsMs: t0,
      },
      state,
    );

    expect(decision.dedupeKey).toBe("timer_update:entity-1:risk-1:timer-1");
    expect(decision.speak).toBe(true);
  });
});


  it("suppresses when context tier is 0 or session inactive", () => {
    const state = createSalienceState();
    const tier0 = evaluateSalience({
      missionId: "mission-tier",
      eventType: "context_signal",
      classification: "critical",
      dedupeKey: "tier0",
      contextTier: "tier0",
    }, state);
    expect(tier0.reason).toBe("context_ineligible");

    const inactive = evaluateSalience({
      missionId: "mission-tier",
      eventType: "context_signal",
      classification: "critical",
      dedupeKey: "inactive",
      contextTier: "tier1",
      sessionState: "idle",
    }, state);
    expect(inactive.reason).toBe("context_ineligible");
  });


describe("micro debrief closure", () => {
  it("keeps debrief open while awaiting operator acknowledgment", () => {
    const debrief = buildMicroDebrief({
      missionId: "mission-pending",
      trigger: {
        eventId: "evt-pending",
        missionId: "mission-pending",
        source: "telemetry",
        eventType: "action_required",
        classification: "action",
        text: "Operator action required",
        ts: "2026-02-24T06:00:00.000Z",
        evidenceRefs: [],
      },
      advice: "Proceed",
      outcomeStatus: "pending_operator_ack",
    });
    expect(debrief.closureStatus).toBe("open");
  });

  it("marks debrief closed when outcome is provided", () => {
    const debrief = buildMicroDebrief({
      missionId: "mission-z",
      trigger: {
        eventId: "evt-z",
        missionId: "mission-z",
        source: "telemetry",
        eventType: "action_required",
        classification: "action",
        text: "Operator act",
        ts: "2026-02-24T06:05:00.000Z",
        evidenceRefs: [],
      },
      advice: "Proceed",
      operatorAction: "ACK",
      outcomeStatus: "resolved",
      derivedFromEventIds: ["evt-z", "ack-z"],
    });
    expect(debrief.closureStatus).toBe("closed");
    expect(debrief.derivedFromEventIds).toEqual(["evt-z", "ack-z"]);
  });
});
