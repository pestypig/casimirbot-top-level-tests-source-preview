import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { missionBoardRouter } from "../server/routes/mission-board";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mission-board", missionBoardRouter);
  return app;
};

const uniqueMissionId = () => `mission-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

describe("mission board routes", () => {
  it("returns default snapshot for a new mission", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).get(`/api/mission-board/${missionId}`);

    expect(res.status).toBe(200);
    expect(res.body.snapshot).toMatchObject({
      missionId,
      phase: "observe",
      status: "active",
      unresolvedCritical: 0,
    });
  });

  it("records action events and exposes deterministic cursor pagination", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "action-b",
      type: "verify",
      requestedAt: "2026-02-22T00:00:02.000Z",
    });
    await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "action-a",
      type: "retrieve",
      requestedAt: "2026-02-22T00:00:01.000Z",
    });
    await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "action-c",
      type: "execute",
      requestedAt: "2026-02-22T00:00:03.000Z",
    });

    const page1 = await request(app).get(`/api/mission-board/${missionId}/events`).query({
      limit: 2,
      cursor: 0,
    });
    expect(page1.status).toBe(200);
    expect(page1.body.cursor).toBe(0);
    expect(page1.body.nextCursor).toBe(2);
    expect(page1.body.events.map((event: { eventId: string }) => event.eventId)).toEqual([
      "action-a",
      "action-b",
    ]);

    const page2 = await request(app).get(`/api/mission-board/${missionId}/events`).query({
      limit: 2,
      cursor: page1.body.nextCursor,
    });
    expect(page2.status).toBe(200);
    expect(page2.body.cursor).toBe(2);
    expect(page2.body.nextCursor).toBeNull();
    expect(page2.body.events.map((event: { eventId: string }) => event.eventId)).toEqual(["action-c"]);
  });

  it("surfaces critical escalation action in mission snapshot", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "action-escalate",
      type: "ESCALATE_TO_COMMAND",
      status: "accepted",
      requestedAt: "2026-02-22T00:10:00.000Z",
    });

    expect(res.status).toBe(200);
    expect(res.body.receipt.actionId).toBe("action-escalate");
    expect(res.body.snapshot.status).toBe("degraded");
    expect(res.body.snapshot.unresolvedCritical).toBe(1);
  });

  it("records acknowledgments as state_change events", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "action-ack-target",
      type: "verify",
      requestedAt: "2026-02-22T00:20:00.000Z",
    });

    const ack = await request(app).post(`/api/mission-board/${missionId}/ack`).send({
      eventId: "action-ack-target",
      ackRefId: "ack-ref-1",
      actorId: "operator-1",
      note: "Acknowledged and proceeding",
      ts: "2026-02-22T00:20:05.000Z",
    });

    expect(ack.status).toBe(200);
    expect(ack.body.receipt).toMatchObject({
      missionId,
      eventId: "action-ack-target",
      ackRefId: "ack-ref-1",
      actorId: "operator-1",
    });
    expect(ack.body.snapshot.status).toBe("active");
    expect(ack.body.snapshot.phase).toBe("observe");
    expect(ack.body.metrics.trigger_to_debrief_closed_ms).toBe(5000);

    const events = await request(app).get(`/api/mission-board/${missionId}/events`).query({ limit: 20 });
    expect(events.status).toBe(200);
    const ackEvent = (events.body.events as Array<{ text: string; type: string; evidenceRefs: string[] }>).find(
      (event) => event.text.includes("Acknowledged and proceeding"),
    );
    expect(ackEvent?.type).toBe("state_change");
    expect(ackEvent?.evidenceRefs).toContain("action-ack-target");

    const debriefEvent = (events.body.events as Array<{ eventId: string; type: string; derivedFromEventId?: string; ackRefId?: string }>).find(
      (event) => event.eventId.startsWith("debrief:closure:"),
    );
    expect(debriefEvent?.type).toBe("debrief");
    expect(debriefEvent?.derivedFromEventId).toBe("action-ack-target");
    expect(debriefEvent?.ackRefId).toBe("ack-ref-1");
  });

  it("acknowledgment clears unresolved critical count for referenced critical event", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const criticalAction = await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "action-critical-target",
      type: "ESCALATE_TO_COMMAND",
      requestedAt: "2026-02-22T00:30:00.000Z",
    });
    expect(criticalAction.status).toBe(200);
    expect(criticalAction.body.snapshot.unresolvedCritical).toBe(1);
    expect(criticalAction.body.snapshot.status).toBe("degraded");

    const ack = await request(app).post(`/api/mission-board/${missionId}/ack`).send({
      eventId: "action-critical-target",
      actorId: "operator-2",
      ts: "2026-02-22T00:30:10.000Z",
    });
    expect(ack.status).toBe(200);
    expect(ack.body.snapshot.unresolvedCritical).toBe(0);
    expect(ack.body.snapshot.status).toBe("active");
    expect(ack.body.snapshot.phase).toBe("observe");
    expect(ack.body.metrics.trigger_to_debrief_closed_ms).toBe(10000);
  });

  it("meets lightweight snapshot/events latency budget", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const snapshotStart = Date.now();
    const snapshot = await request(app).get(`/api/mission-board/${missionId}`);
    const snapshotLatencyMs = Date.now() - snapshotStart;

    const eventsStart = Date.now();
    const events = await request(app).get(`/api/mission-board/${missionId}/events`).query({ limit: 10 });
    const eventsLatencyMs = Date.now() - eventsStart;

    expect(snapshot.status).toBe(200);
    expect(events.status).toBe(200);
    expect(snapshotLatencyMs).toBeLessThan(250);
    expect(eventsLatencyMs).toBeLessThan(250);
  });


  it("accepts additive context event ingestion with trace parity", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventType: "context_session_started",
      classification: "info",
      text: "Operator started explicit context session",
      tier: "tier1",
      sessionState: "active",
      traceId: "trace-123",
      evidenceRefs: ["ctx:screen"],
      ts: "2026-02-24T06:01:00.000Z",
      certaintyClass: "confirmed",
      failReason: "context_source_verified",
      suppressionReason: "critical_only_policy",
      lastVerifiedAt: "2026-02-24T06:00:59.000Z",
    });

    expect(res.status).toBe(200);
    expect(res.body.traceId).toBe("trace-123");
    expect(res.body.event.text).toContain("context:tier1/active");

    const events = await request(app).get(`/api/mission-board/${missionId}/events`).query({ limit: 10 });
    expect(events.status).toBe(200);
    const contextEvent = (events.body.events as Array<{
      text: string;
      traceId?: string;
      contextTier?: string;
      sessionState?: string;
      certaintyClass?: string;
      failReason?: string;
      suppressionReason?: string;
      lastVerifiedAt?: string;
    }>).find((event) => event.text.includes("context:tier1/active"));
    expect(contextEvent).toBeTruthy();
    expect(contextEvent?.traceId).toBe("trace-123");
    expect(contextEvent?.contextTier).toBe("tier1");
    expect(contextEvent?.sessionState).toBe("active");
    expect(contextEvent?.certaintyClass).toBe("confirmed");
    expect(contextEvent?.failReason).toBe("context_source_verified");
    expect(contextEvent?.suppressionReason).toBe("critical_only_policy");
    expect(contextEvent?.lastVerifiedAt).toBe("2026-02-24T06:00:59.000Z");
  });

  it("returns the latest bounded event page when tail projection is requested", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();
    for (let index = 1; index <= 3; index += 1) {
      await request(app).post(`/api/mission-board/${missionId}/actions`).send({
        actionId: `tail-event-${index}`,
        type: "verify",
        requestedAt: `2026-02-24T06:00:0${index}.000Z`,
      });
    }

    const events = await request(app)
      .get(`/api/mission-board/${missionId}/events`)
      .query({ limit: 2, tail: 1 });
    expect(events.status).toBe(200);
    expect(events.body.events.map((event: { eventId: string }) => event.eventId)).toEqual([
      "tail-event-2",
      "tail-event-3",
    ]);
    expect(events.body.cursor).toBe(1);
    expect(events.body.nextCursor).toBeNull();
  });

  it("projects objective/gap fields from context-events into snapshot", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventId: "objective-gap-1",
      eventType: "objective_update",
      classification: "action",
      text: "Objective updated with unresolved gap",
      tier: "tier1",
      sessionState: "active",
      ts: "2026-02-24T06:05:00.000Z",
      traceId: "trace-objective-gap-1",
      objectiveId: "obj-1",
      objectiveTitle: "Stabilize objective-first loop",
      objectiveStatus: "in_progress",
      gapId: "gap-1",
      gapSummary: "Suppression reason not visible in UI",
      gapSeverity: "high",
    });

    expect(res.status).toBe(200);
    expect(res.body.event.objectiveId).toBe("obj-1");
    expect(res.body.event.gapId).toBe("gap-1");

    const snapshot = await request(app).get(`/api/mission-board/${missionId}`);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.snapshot.objectives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectiveId: "obj-1",
          title: "Stabilize objective-first loop",
          status: "in_progress",
        }),
      ]),
    );
    expect(snapshot.body.snapshot.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gapId: "gap-1",
          objectiveId: "obj-1",
          severity: "high",
        }),
      ]),
    );

    const events = await request(app).get(`/api/mission-board/${missionId}/events`).query({ limit: 10 });
    expect(events.status).toBe(200);
    const objectiveEvent = (events.body.events as Array<{ eventId: string; objectiveId?: string; gapId?: string }>).find(
      (event) => event.eventId === "objective-gap-1",
    );
    expect(objectiveEvent?.objectiveId).toBe("obj-1");
    expect(objectiveEvent?.gapId).toBe("gap-1");
  });


  it("accepts tier1 non-active context event without ts", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventType: "context_session_started",
      classification: "info",
      text: "Tier1 requesting context",
      tier: "tier1",
      sessionState: "requesting",
      traceId: "trace-tier1-requesting",
    });

    expect(res.status).toBe(200);
    expect(res.body.event.contextTier).toBe("tier1");
    expect(res.body.event.sessionState).toBe("requesting");
  });

  it("accepts tier0 active context event without ts", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventType: "context_session_started",
      classification: "info",
      text: "Tier0 active context",
      tier: "tier0",
      sessionState: "active",
      traceId: "trace-tier0-active",
    });

    expect(res.status).toBe(200);
    expect(res.body.event.contextTier).toBe("tier0");
    expect(res.body.event.sessionState).toBe("active");
  });

  it("rejects tier1 active context event without deterministic ts", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventType: "context_session_started",
      classification: "info",
      text: "Operator started explicit context session",
      tier: "tier1",
      sessionState: "active",
      traceId: "trace-123",
      evidenceRefs: ["ctx:screen"],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("mission_board_invalid_request");
    expect(res.body.details?.reason).toBe("missing_tier1_ts");
  });

  it("returns deterministic invalid request envelope", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      type: "unsupported-action",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("mission_board_invalid_request");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.details).toBeTruthy();
  });

  it("accepts timer_update with deterministic timer fields", async () => {
    const app = buildApp();
    const missionId = uniqueMissionId();

    const res = await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventType: "timer_update",
      classification: "warn",
      text: "Ingress timer updated",
      tier: "tier1",
      sessionState: "active",
      ts: "2026-02-24T06:00:10.000Z",
      timer: {
        timerId: "timer-1",
        timerKind: "stale_window",
        status: "running",
        dueTs: "2026-02-24T06:00:00.000Z",
        derivedFromEventId: "event-root",
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.event.timerId).toBe("timer-1");
    expect(res.body.event.timerKind).toBe("stale_window");
    expect(res.body.event.derivedFromEventId).toBe("event-root");
  });

});
