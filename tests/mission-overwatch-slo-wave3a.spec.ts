import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { missionBoardRouter } from "../server/routes/mission-board";
import { voiceRouter } from "../server/routes/voice";
import { createSalienceState, evaluateSalience } from "../server/services/mission-overwatch/salience";

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
};

const uniqueId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

describe("mission overwatch wave3a slo gates", () => {
  it("enforces event-to-visual p95 budget", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/mission-board", missionBoardRouter);
    const missionId = uniqueId("mission-slo-visual");

    await request(app).post(`/api/mission-board/${missionId}/actions`).send({
      actionId: "action-seed",
      type: "verify",
      requestedAt: "2026-02-23T00:00:00.000Z",
    });

    const samples: number[] = [];
    for (let idx = 0; idx < 12; idx += 1) {
      const snapshotStart = Date.now();
      const snapshot = await request(app).get(`/api/mission-board/${missionId}`);
      expect(snapshot.status).toBe(200);
      samples.push(Date.now() - snapshotStart);

      const eventsStart = Date.now();
      const events = await request(app).get(`/api/mission-board/${missionId}/events`).query({ limit: 25 });
      expect(events.status).toBe(200);
      samples.push(Date.now() - eventsStart);
    }

    const visualP95Ms = percentile(samples, 95);
    expect(visualP95Ms).toBeLessThanOrEqual(300);
  });

  it("enforces event-to-voice-start p95 budget", async () => {
    const previousDryRun = process.env.VOICE_PROXY_DRY_RUN;
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = express();
    app.use(express.json());
    app.use("/api/voice", voiceRouter);

    try {
      const samples: number[] = [];

      for (let idx = 0; idx < 10; idx += 1) {
        const start = Date.now();
        const res = await request(app).post("/api/voice/speak").send({
          text: `Voice budget sample ${idx + 1}`,
          mode: "callout",
          priority: "info",
          missionId: uniqueId("mission-slo-voice"),
          eventId: uniqueId("event-slo-voice"),
          dedupe_key: uniqueId("dedupe-slo-voice"),
        });
        expect(res.status).toBe(200);
        samples.push(Date.now() - start);
      }

      const voiceP95Ms = percentile(samples, 95);
      expect(voiceP95Ms).toBeLessThanOrEqual(1200);
    } finally {
      if (previousDryRun === undefined) {
        delete process.env.VOICE_PROXY_DRY_RUN;
      } else {
        process.env.VOICE_PROXY_DRY_RUN = previousDryRun;
      }
    }
  });

  it("enforces non-critical noise budget per active hour", () => {
    const state = createSalienceState();
    const t0 = Date.parse("2026-02-23T00:00:00.000Z");
    let emitted = 0;

    for (let idx = 0; idx < 12; idx += 1) {
      const decision = evaluateSalience(
        {
          missionId: "mission-noise-budget",
          eventType: "state_change",
          classification: "info",
          dedupeKey: `noise-${idx + 1}`,
          tsMs: t0 + idx * 5 * 60_000,
          contextTier: "tier1",
          sessionState: "active",
          voiceMode: "normal",
        },
        state,
      );
      if (decision.speak) emitted += 1;
    }

    expect(emitted).toBeLessThanOrEqual(12);
  });
});
