import { describe, expect, it, vi } from "vitest";

import { scrubSkippedLlmTransportErrors } from "../server/services/helix-ask/surface/response-debug-scrub";
import { buildCleanFinalResponsePayload } from "../server/services/helix-ask/surface/response-tail-cleanup";

describe("helix ask response debug scrub", () => {
  it("suppresses local cooldown transport state when no llm invocation occurred", () => {
    const debugPayload: Record<string, unknown> = {
      llm_error_code: "llm_http_429:1",
      llm_error_rate_limit_source: "local_cooldown",
      llm_error_message: "rate limited",
    };

    scrubSkippedLlmTransportErrors(debugPayload);

    expect(debugPayload.llm_transport_state_suppressed).toBe("llm_http_429:1");
    expect(debugPayload.llm_transport_state_suppressed_reason).toBe("no_llm_invocation_local_cooldown");
    expect(debugPayload.llm_error_code).toBeUndefined();
    expect(debugPayload.llm_error_message).toBe("rate limited");
  });

  it("leaves unrelated transport errors intact", () => {
    const debugPayload: Record<string, unknown> = {
      llm_error_code: "llm_http_500",
      llm_error_message: "server error",
    };

    scrubSkippedLlmTransportErrors(debugPayload);

    expect(debugPayload.llm_transport_state_suppressed).toBeUndefined();
    expect(debugPayload.llm_error_code).toBe("llm_http_500");
  });
});

describe("helix ask response tail cleanup", () => {
  it("scrubs skipped transport errors before building the final payload", () => {
    const attachContextCapsuleToResult = vi.fn();

    const payload = buildCleanFinalResponsePayload({
      result: { ok: true, text: "answer" },
      debugPayload: {
        llm_error_code: "llm_http_circuit_open",
        llm_error_message: "circuit open",
      },
      finalText: "answer",
      attachContextCapsuleToResult,
    });

    expect(payload).toEqual({
      ok: true,
      text: "answer",
      debug: {
        llm_error_message: "circuit open",
        llm_transport_state_suppressed: "llm_http_circuit_open",
        llm_transport_state_suppressed_reason: "no_llm_invocation_circuit_open",
      },
    });
    expect(attachContextCapsuleToResult).toHaveBeenCalledWith(payload, "answer");
  });
});
