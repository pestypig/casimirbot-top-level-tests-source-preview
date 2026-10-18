import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const ORIGINAL_STORE = process.env.MISSION_BOARD_STORE;
const ORIGINAL_USE_INMEM = process.env.USE_INMEM_MISSION_BOARD_STORE;
const ORIGINAL_STRICT = process.env.MISSION_BOARD_STORE_STRICT;

const missionId = "mission-persistence-1";

const resetDb = async (): Promise<void> => {
  const { resetDbClient } = await import("../server/db/client");
  await resetDbClient();
};

const buildApp = async () => {
  const { missionBoardRouter } = await import("../server/routes/mission-board");
  const app = express();
  app.use(express.json());
  app.use("/api/mission-board", missionBoardRouter);
  return app;
};

describe("mission board persistence", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.DATABASE_URL = "pg-mem://mission-board-persistence";
    process.env.MISSION_BOARD_STORE = "db";
    delete process.env.USE_INMEM_MISSION_BOARD_STORE;
    delete process.env.MISSION_BOARD_STORE_STRICT;
    vi.resetModules();
  });

  afterEach(async () => {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
    process.env.MISSION_BOARD_STORE = ORIGINAL_STORE;
    process.env.USE_INMEM_MISSION_BOARD_STORE = ORIGINAL_USE_INMEM;
    process.env.MISSION_BOARD_STORE_STRICT = ORIGINAL_STRICT;
    vi.resetModules();
    await resetDb();
  });

  it("writes actions and acknowledgments to mission_board_events table", async () => {
    const app = await buildApp();

    await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "persist-action-1",
      type: "ESCALATE_TO_COMMAND",
      requestedAt: "2026-02-22T03:00:00.000Z",
    });

    await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventId: "persist-context-1",
      eventType: "context_session_started",
      classification: "info",
      text: "Context active",
      ts: "2026-02-22T03:00:02.000Z",
      tier: "tier1",
      sessionState: "active",
      traceId: "trace-persist-1",
    });

    await request(app).post(`/api/mission-board/${missionId}/ack`).send({
      eventId: "persist-action-1",
      actorId: "operator-persist",
      ts: "2026-02-22T03:00:05.000Z",
    });

    const { ensureDatabase, getPool } = await import("../server/db/client");
    await ensureDatabase();
    const pool = getPool();
    const { rows } = await pool.query<{
      id: string;
      mission_id: string;
      type: string;
      classification: string;
      payload: { traceId?: string; contextTier?: string; sessionState?: string } | string;
    }>(
      `SELECT id, mission_id, type, classification, payload
       FROM mission_board_events
       WHERE mission_id = $1
       ORDER BY event_ts ASC, id ASC`,
      [missionId],
    );

    expect(rows.map((row) => row.id)).toEqual([
      "persist-action-1",
      "persist-context-1",
      `ack:persist-action-1:${Date.parse("2026-02-22T03:00:05.000Z")}`,
      `debrief:closure:persist-action-1:${Date.parse("2026-02-22T03:00:05.000Z")}`,
    ]);
    expect(rows.map((row) => row.type)).toEqual(["action_required", "state_change", "state_change", "debrief"]);
    expect(rows.map((row) => row.classification)).toEqual(["critical", "info", "info", "info"]);
    expect(new Set(rows.map((row) => row.mission_id))).toEqual(new Set([missionId]));
  });

  it("replays snapshot from persisted events after store reset", async () => {
    const app = await buildApp();

    await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "persist-action-2",
      type: "ESCALATE_TO_COMMAND",
      requestedAt: "2026-02-22T03:10:00.000Z",
    });

    const { __resetMissionBoardStoreForTest } = await import(
      "../server/services/mission-overwatch/mission-board-store"
    );
    __resetMissionBoardStoreForTest();

    const replaySnapshot = await request(app).get(`/api/mission-board/${missionId}`);
    expect(replaySnapshot.status).toBe(200);
    expect(replaySnapshot.body.snapshot).toMatchObject({
      missionId,
      unresolvedCritical: 1,
      status: "degraded",
    });

    const replayEvents = await request(app)
      .get(`/api/mission-board/${missionId}/events`)
      .query({ limit: 10 });
    expect(replayEvents.status).toBe(200);
    expect(replayEvents.body.events).toHaveLength(1);
    expect(replayEvents.body.events[0]).toMatchObject({
      eventId: "persist-action-2",
      type: "action_required",
      classification: "critical",
    });
  });

  it("fails fast when strict persistence is enabled and db init fails", async () => {
    process.env.DATABASE_URL = "postgres://base/invalid";
    process.env.MISSION_BOARD_STORE = "db";
    process.env.MISSION_BOARD_STORE_STRICT = "1";
    vi.resetModules();
    const app = await buildApp();

    const res = await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "strict-fail-action",
      type: "ESCALATE_TO_COMMAND",
      requestedAt: "2026-02-22T03:30:00.000Z",
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("mission_board_unavailable");
  });

  it("falls back to memory when strict persistence is disabled", async () => {
    process.env.DATABASE_URL = "postgres://base/invalid";
    process.env.MISSION_BOARD_STORE = "db";
    delete process.env.MISSION_BOARD_STORE_STRICT;
    vi.resetModules();
    const app = await buildApp();

    const res = await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "fallback-action",
      type: "ESCALATE_TO_COMMAND",
      requestedAt: "2026-02-22T03:31:00.000Z",
    });

    expect(res.status).toBe(200);
    expect(res.body.receipt.actionId).toBe("fallback-action");
  });

  it("persists context linkage metadata in db payload", async () => {
    const app = await buildApp();
    await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventId: "persist-context-meta",
      eventType: "context_session_started",
      classification: "info",
      text: "Context linked",
      ts: "2026-02-22T03:20:00.000Z",
      tier: "tier1",
      sessionState: "active",
      traceId: "trace-meta-1",
      objectiveId: "obj-meta-1",
      objectiveTitle: "Persist objective metadata",
      objectiveStatus: "open",
      gapId: "gap-meta-1",
      gapSummary: "Persist gap metadata",
      gapSeverity: "medium",
    });

    const { ensureDatabase, getPool } = await import("../server/db/client");
    await ensureDatabase();
    const pool = getPool();
    const persisted = await pool.query<{ payload: unknown }>(
      `SELECT payload
       FROM mission_board_events
       WHERE mission_id = $1 AND id = $2`,
      [missionId, "persist-context-meta"],
    );
    expect(persisted.rowCount).toBe(1);
    const payloadRaw = persisted.rows[0]?.payload;
    const payload =
      typeof payloadRaw === "string" ? (JSON.parse(payloadRaw) as Record<string, unknown>) : (payloadRaw as Record<string, unknown>);
    expect(payload.traceId).toBe("trace-meta-1");
    expect(payload.contextTier).toBe("tier1");
    expect(payload.sessionState).toBe("active");
    expect(payload.objectiveId).toBe("obj-meta-1");
    expect(payload.objectiveTitle).toBe("Persist objective metadata");
    expect(payload.objectiveStatus).toBe("open");
    expect(payload.gapId).toBe("gap-meta-1");
    expect(payload.gapSummary).toBe("Persist gap metadata");
    expect(payload.gapSeverity).toBe("medium");

    const events = await request(app).get(`/api/mission-board/${missionId}/events`).query({ limit: 20 });
    expect(events.status).toBe(200);
    const row = (
      events.body.events as Array<{
        eventId: string;
        traceId?: string;
        contextTier?: string;
        sessionState?: string;
        objectiveId?: string;
        objectiveTitle?: string;
        objectiveStatus?: string;
        gapId?: string;
        gapSummary?: string;
        gapSeverity?: string;
      }>
    ).find((e) => e.eventId === "persist-context-meta");
    expect(row?.traceId).toBe("trace-meta-1");
    expect(row?.contextTier).toBe("tier1");
    expect(row?.sessionState).toBe("active");
    expect(row?.objectiveId).toBe("obj-meta-1");
    expect(row?.objectiveTitle).toBe("Persist objective metadata");
    expect(row?.objectiveStatus).toBe("open");
    expect(row?.gapId).toBe("gap-meta-1");
    expect(row?.gapSummary).toBe("Persist gap metadata");
    expect(row?.gapSeverity).toBe("medium");
  });

});
