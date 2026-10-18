import { describe, expect, it } from "vitest";
import { CasimirClient } from "../sdk/src/client";
import { RuntimeTelemetry } from "../sdk/src/runtime";

describe("sdk integration runtime contract", () => {
  it("normalizes missing runtime envelope metadata to diagnostic non-certifying", async () => {
    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          runId: "run-1",
          verdict: "PASS",
          pass: true,
          deltas: [],
          artifacts: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const client = new CasimirClient({
      baseUrl: "http://localhost:5173",
      fetch: fetchMock,
    });

    const result = await client.runAdapter({});

    expect(result.metadata).toEqual({
      claim_tier: "diagnostic",
      provenance: "diagnostic",
      certifying: false,
    });
  });

  it("preserves provided runtime envelope metadata", async () => {
    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          runId: "run-2",
          verdict: "PASS",
          pass: true,
          deltas: [],
          artifacts: [],
          metadata: {
            claim_tier: "certified",
            provenance: "measured",
            certifying: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const client = new CasimirClient({
      baseUrl: "http://localhost:5173",
      fetch: fetchMock,
    });

    const result = await client.runAdapter({});

    expect(result.metadata).toEqual({
      claim_tier: "certified",
      provenance: "measured",
      certifying: true,
    });
  });

  it("runtime helper normalizes metadata fallback and unknown claim tiers", () => {
    const runtime = new RuntimeTelemetry();
    expect(runtime.normalizeResponseEnvelopeMetadata(undefined)).toEqual({
      claim_tier: "diagnostic",
      provenance: "diagnostic",
      certifying: false,
    });
    expect(
      runtime.normalizeResponseEnvelopeMetadata({
        claim_tier: "unsupported",
        provenance: "",
        certifying: true,
      }),
    ).toEqual({
      claim_tier: "diagnostic",
      provenance: "diagnostic",
      certifying: true,
    });
  });
});
