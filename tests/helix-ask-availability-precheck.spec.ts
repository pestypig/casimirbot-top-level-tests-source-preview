import { describe, expect, it } from "vitest";
import {
  precheckHelixAskAvailability,
  probeHelixAskAvailability,
} from "../scripts/helix-ask-availability-precheck";

describe("helix ask availability precheck", () => {
  it("passes when /api/agi/ask responds with status 200", async () => {
    const fetchOk: typeof fetch = (async () =>
      new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const probe = await probeHelixAskAvailability({
      baseUrl: "http://127.0.0.1:5173",
      fetchImpl: fetchOk,
    });
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe(200);

    await expect(
      precheckHelixAskAvailability({
        baseUrl: "http://127.0.0.1:5173",
        fetchImpl: fetchOk,
      }),
    ).resolves.toBeUndefined();
  });



  it("treats deterministic runtime fallback as serviceable when status is 200", async () => {
    const fetchFallback: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          text: "Mechanism: evidence A -> constrained dynamics -> outcome B.\n\nMaturity (exploratory): bounded fallback.\n\nSources: server/routes/agi.plan.ts",
          fail_reason: "GENERIC_COLLAPSE",
          debug: { fallback_reason: "runtime_unavailable_deterministic_fallback" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as typeof fetch;

    const probe = await probeHelixAskAvailability({
      baseUrl: "http://127.0.0.1:5173",
      fetchImpl: fetchFallback,
    });
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe(200);

    await expect(
      precheckHelixAskAvailability({
        baseUrl: "http://127.0.0.1:5173",
        fetchImpl: fetchFallback,
      }),
    ).resolves.toBeUndefined();
  });

  it("fails fast with clear reason when /api/agi/ask is unavailable", async () => {
    const fetchUnavailable: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          fail_reason: "helix_ask_temporarily_unavailable",
          debug: { last_error: "Cannot access 'selectedMove' before initialization" },
        }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      )) as typeof fetch;

    const probe = await probeHelixAskAvailability({
      baseUrl: "http://127.0.0.1:5173",
      fetchImpl: fetchUnavailable,
    });
    expect(probe.ok).toBe(false);
    expect(probe.status).toBe(503);
    expect(probe.failReason).toBe("helix_ask_temporarily_unavailable");

    await expect(
      precheckHelixAskAvailability({
        baseUrl: "http://127.0.0.1:5173",
        label: "campaign precheck",
        fetchImpl: fetchUnavailable,
      }),
    ).rejects.toThrow(
      /campaign precheck: Helix Ask unavailable \(status=503, reason=helix_ask_temporarily_unavailable\)/,
    );
  });
});
