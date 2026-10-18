import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { resetVoiceRouteState, voiceRouter } from "../server/routes/voice";

const app = () => {
  const e = express();
  e.use(express.json());
  e.use("/api/voice", voiceRouter);
  return e;
};

afterEach(() => {
  resetVoiceRouteState();
  process.env.VOICE_PROXY_DRY_RUN = "1";
  process.env.VOICE_PROVIDER_MODE = "allow_remote";
  process.env.VOICE_MANAGED_PROVIDERS_ENABLED = "0";
  process.env.VOICE_LOCAL_ONLY_MISSION_MODE = "1";
});

describe("voice offline-core ownership gates", () => {
  it("keeps mission-critical synthesis path available in local-only mode", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_MANAGED_PROVIDERS_ENABLED = "0";
    process.env.VOICE_LOCAL_ONLY_MISSION_MODE = "1";

    const res = await request(app()).post("/api/voice/speak").send({
      text: "Critical local callout",
      priority: "critical",
      provider: "remote-provider",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects non-critical managed provider usage when disabled", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_MANAGED_PROVIDERS_ENABLED = "0";

    const res = await request(app()).post("/api/voice/speak").send({
      text: "Warn update",
      priority: "warn",
      provider: "remote-provider",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("voice_provider_not_allowed");
  });
});


it("keeps offline-core outcomes unchanged when production lane env is set", async () => {
  process.env.TRAIN_JOB_TYPE = "tts_prod_train";
  process.env.VOICE_PROXY_DRY_RUN = "1";
  process.env.VOICE_MANAGED_PROVIDERS_ENABLED = "0";

  const res = await request(app()).post("/api/voice/speak").send({
    text: "Warn update",
    priority: "warn",
    provider: "remote-provider",
  });

  expect(res.status).toBe(403);
  expect(res.body.error).toBe("voice_provider_not_allowed");
});


it("keeps offline-core outcomes unchanged when nemo production lane env is set", async () => {
  process.env.TRAIN_JOB_TYPE = "tts_prod_train_nemo";
  process.env.VOICE_PROXY_DRY_RUN = "1";
  process.env.VOICE_MANAGED_PROVIDERS_ENABLED = "0";

  const res = await request(app()).post("/api/voice/speak").send({
    text: "Warn update",
    priority: "warn",
    provider: "remote-provider",
  });

  expect(res.status).toBe(403);
  expect(res.body.error).toBe("voice_provider_not_allowed");
});
