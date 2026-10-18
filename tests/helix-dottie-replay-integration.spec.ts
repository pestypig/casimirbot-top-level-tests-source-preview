import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { missionBoardRouter } from "../server/routes/mission-board";
import { resetVoiceRouteState, voiceRouter } from "../server/routes/voice";
import { createSalienceState, evaluateSalience } from "../server/services/mission-overwatch/salience";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mission-board", missionBoardRouter);
  app.use("/api/voice", voiceRouter);
  return app;
};

describe("helix dottie replay-grade integration", () => {
  beforeEach(() => {
    process.env.TTS_BASE_URL = "";
    process.env.VOICE_PROXY_DRY_RUN = "1";
    resetVoiceRouteState();
  });

  it("replays ask->salience->voice->board->ack->debrief deterministically", async () => {
    const app = buildApp();
    const missionId = `mission-replay-${Date.now()}`;
    const triggerTs = "2026-02-24T12:00:00.000Z";
    const ackTs = "2026-02-24T12:00:15.000Z";

    const contextEvent = await request(app).post(`/api/mission-board/${missionId}/context-events`).send({
      eventId: "evt-integration-1",
      eventType: "action_required",
      classification: "action",
      text: "Operator must verify repository evidence alignment",
      ts: triggerTs,
      tier: "tier1",
      sessionState: "active",
      traceId: "trace-integration-1",
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
    });
    expect(contextEvent.status).toBe(200);

    const salience = evaluateSalience(
      {
        missionId,
        eventType: "action_required",
        classification: "action",
        dedupeKey: "evt-integration-1",
        tsMs: Date.parse(triggerTs),
      },
      createSalienceState(),
    );
    expect(salience.speak).toBe(true);

    const paritySuppressed = await request(app).post("/api/voice/speak").send({
      text: "Confirmed fix now",
      missionId,
      eventId: "evt-integration-1",
      priority: "action",
      textCertainty: "reasoned",
      voiceCertainty: "confirmed",
      deterministic: true,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      repoAttributed: true,
    });
    expect(paritySuppressed.status).toBe(200);
    expect(paritySuppressed.body.suppressed).toBe(true);
    expect(paritySuppressed.body.reason).toBe("contract_violation");

    const spoken = await request(app).post("/api/voice/speak").send({
      text: "Reasoned next action: verify lane now",
      missionId,
      eventId: "evt-integration-2",
      priority: "action",
      textCertainty: "reasoned",
      voiceCertainty: "reasoned",
      deterministic: true,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      repoAttributed: true,
    });
    expect(spoken.status).toBe(200);
    expect(spoken.body.ok).toBe(true);
    expect(spoken.body.suppressed).toBeUndefined();

    const ack = await request(app).post(`/api/mission-board/${missionId}/ack`).send({
      eventId: "evt-integration-1",
      ackRefId: "ack-link-1",
      actorId: "operator-integration",
      ts: ackTs,
    });
    expect(ack.status).toBe(200);
    expect(ack.body.receipt.ackRefId).toBe("ack-link-1");
    expect(ack.body.metrics.trigger_to_debrief_closed_ms).toBe(15000);

    const events = await request(app).get(`/api/mission-board/${missionId}/events`).query({ limit: 50 });
    expect(events.status).toBe(200);
    const debrief = events.body.events.find((event: { type: string; ackRefId?: string; metrics?: { trigger_to_debrief_closed_ms?: number } }) =>
      event.type === "debrief",
    );
    expect(debrief.ackRefId).toBe("ack-link-1");
    expect(debrief.metrics.trigger_to_debrief_closed_ms).toBe(15000);
  });
});
