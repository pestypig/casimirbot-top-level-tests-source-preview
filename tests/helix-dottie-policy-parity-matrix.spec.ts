import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { shouldEmitContextCallout } from "../client/src/lib/mission-overwatch";
import { createSalienceState, evaluateSalience } from "../server/services/mission-overwatch/salience";
import { voiceRouter } from "../server/routes/voice";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/voice", voiceRouter);
  return app;
};

describe("helix dottie policy parity matrix", () => {
  it("matches client/server/router eligibility decisions", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();
    const matrix = [
      { tier: "tier0", sessionState: "active", voiceMode: "normal", classification: "warn", expectSpeak: false },
      { tier: "tier1", sessionState: "idle", voiceMode: "normal", classification: "warn", expectSpeak: false },
      { tier: "tier1", sessionState: "active", voiceMode: "off", classification: "critical", expectSpeak: false },
      { tier: "tier1", sessionState: "active", voiceMode: "critical_only", classification: "warn", expectSpeak: false },
      { tier: "tier1", sessionState: "active", voiceMode: "critical_only", classification: "critical", expectSpeak: true },
      { tier: "tier1", sessionState: "active", voiceMode: "normal", classification: "warn", expectSpeak: true },
    ] as const;

    for (const [index, row] of matrix.entries()) {
      const client = shouldEmitContextCallout({
        controls: { tier: row.tier, voiceMode: row.voiceMode, muteWhileTyping: false },
        sessionState: row.sessionState,
        classification: row.classification,
        isUserTyping: false,
      });

      const salience = evaluateSalience(
        {
          missionId: `matrix-${index}`,
          eventType: "state_change",
          classification: row.classification,
          contextTier: row.tier,
          sessionState: row.sessionState,
          voiceMode: row.voiceMode,
          tsMs: 1700000000000 + index,
        },
        createSalienceState(),
      ).speak;

      const resp = await request(app).post("/api/voice/speak").send({
        text: `matrix-${index}`,
        mode: "callout",
        priority: row.classification,
        contextTier: row.tier,
        sessionState: row.sessionState,
        voiceMode: row.voiceMode,
        repoAttributed: false,
      });
      const routerSpeak = resp.body?.suppressed !== true;

      expect(client).toBe(row.expectSpeak);
      expect(salience).toBe(row.expectSpeak);
      expect(routerSpeak).toBe(row.expectSpeak);
    }
  });
});
