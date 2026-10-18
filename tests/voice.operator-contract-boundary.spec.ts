import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const buildApp = async () => {
  const { voiceRouter, resetVoiceRouteState } = await import("../server/routes/voice");
  const app = express();
  app.use(express.json());
  app.use("/api/voice", voiceRouter);
  return { app, resetVoiceRouteState };
};

const expectSuppressionShape = (body: Record<string, unknown>, expectedReason: string) => {
  expect(body.suppressed).toBe(true);
  expect(body.reason).toBe(expectedReason);
  expect(body.suppression_reason).toBe(expectedReason);
  expect(body).not.toHaveProperty("suppressionReason");
};

describe("voice operator contract boundary", () => {
  afterEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.unmock("../server/services/helix-ask/operator-contract-v1");
    delete process.env.VOICE_PROXY_DRY_RUN;
  });

  it("emits as usual when operator contract payload validates", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const { app, resetVoiceRouteState } = await buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Operator contract valid boundary",
      mode: "callout",
      priority: "action",
      missionId: "mission-contract-valid",
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      deterministic: true,
      traceId: "trace-contract-valid",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suppressed ?? false).toBe(false);
    expect(res.body.provider).toBe("dry-run");
    resetVoiceRouteState();
  });

  it("uses normalized suppression keys for context ineligible", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const { app, resetVoiceRouteState } = await buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Context ineligible boundary",
      mode: "callout",
      priority: "info",
      contextTier: "tier0",
      traceId: "trace-context-ineligible",
    });

    expect(res.status).toBe(200);
    expectSuppressionShape(res.body, "voice_context_ineligible");
    resetVoiceRouteState();
  });

  it("uses normalized suppression keys for parity disallow", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const { app, resetVoiceRouteState } = await buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Parity disallow boundary",
      mode: "callout",
      priority: "warn",
      textCertainty: "hypothesis",
      voiceCertainty: "confirmed",
      deterministic: true,
      traceId: "trace-parity-disallow",
    });

    expect(res.status).toBe(200);
    expectSuppressionShape(res.body, "contract_violation");
    resetVoiceRouteState();
  });

  it("uses normalized suppression keys for contract validation failures", async () => {
    vi.doMock("../server/services/helix-ask/operator-contract-v1", async () => {
      const actual = await vi.importActual<typeof import("../server/services/helix-ask/operator-contract-v1")>(
        "../server/services/helix-ask/operator-contract-v1",
      );
      return {
        ...actual,
        validateOperatorCalloutV1: () => ({
          ok: false as const,
          errors: [
            {
              code: "INVALID_FIELD_VALUE" as const,
              path: "voice.certainty",
              message: "mocked failure",
            },
          ],
        }),
      };
    });

    process.env.VOICE_PROXY_DRY_RUN = "1";
    const { app, resetVoiceRouteState } = await buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Operator contract invalid boundary",
      mode: "callout",
      priority: "action",
      missionId: "mission-contract-invalid",
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      deterministic: true,
      traceId: "trace-contract-invalid",
    });

    expect(res.status).toBe(200);
    expectSuppressionShape(res.body, "contract_violation");
    expect(res.body.debug).toEqual({
      validator_failed: true,
      validator_error_count: 1,
      first_validator_error_code: "INVALID_FIELD_VALUE",
      first_validator_error_path: "voice.certainty",
    });
    resetVoiceRouteState();
  });

  it("uses normalized suppression keys for dedupe suppression", async () => {
    vi.doMock("../server/services/helix-ask/operator-contract-v1", async () => {
      const actual = await vi.importActual<typeof import("../server/services/helix-ask/operator-contract-v1")>(
        "../server/services/helix-ask/operator-contract-v1",
      );
      return {
        ...actual,
        validateOperatorCalloutV1: () => ({ ok: true as const, errors: [] }),
      };
    });

    process.env.VOICE_PROXY_DRY_RUN = "1";
    const { app, resetVoiceRouteState } = await buildApp();

    const payload = {
      text: "Dedupe suppression boundary",
      mode: "callout",
      priority: "action",
      missionId: "mission-dedupe-boundary",
      dedupe_key: "dedupe-boundary-key",
      deterministic: true,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      traceId: "trace-dedupe-boundary",
    };

    const first = await request(app).post("/api/voice/speak").send(payload);
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/voice/speak").send(payload);
    expect(second.status).toBe(200);
    expectSuppressionShape(second.body, "dedupe_cooldown");
    resetVoiceRouteState();
  });
});
