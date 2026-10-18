import { describe, expect, it } from "vitest";
import { buildDeterministicToolExecutionReceipt } from "../server/routes/agi.plan";

describe("tool execution receipt contracts", () => {
  it("emits deterministic receipt shape for tool output path", () => {
    const receipt = buildDeterministicToolExecutionReceipt({
      tool: "halobank.time.compute",
      mode: "verify",
      requestPayload: {
        question: "time/place tide gravity check",
        timestamp: "2025-03-01T12:00:00Z",
        place: { lat: 40.7128, lon: -74.006 },
      },
      actionOutput: {
        ok: true,
        requestId: "volatile-id",
        timestamp: "volatile-ts",
        comparison: { dDuration_s: 60, dGravExposure_ns: 0.12 },
      },
    });

    expect(receipt).toMatchObject({
      schema_version: "tool_execution_receipt.v1",
      deterministic: true,
      tool: "halobank.time.compute",
      mode: "verify",
      status: "ok",
      fail_reason: "NONE",
    });
    expect(receipt.input_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.output_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.receipt_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("replays identical plan input with stable deterministic outputs", () => {
    const requestPayload = {
      question: "time/place tide gravity check",
      timestamp: "2025-03-01T12:00:00Z",
      place: { lat: 40.7128, lon: -74.006 },
    };
    const actionOutput = {
      ok: true,
      requestId: "request-one",
      generatedAt: "2026-01-01T00:00:00Z",
      comparison: { dDuration_s: 60, dGravExposure_ns: 0.12 },
    };

    const one = buildDeterministicToolExecutionReceipt({
      tool: "halobank.time.compute",
      mode: "verify",
      requestPayload,
      actionOutput,
    });
    const two = buildDeterministicToolExecutionReceipt({
      tool: "halobank.time.compute",
      mode: "verify",
      requestPayload,
      actionOutput: {
        ...actionOutput,
        requestId: "request-two",
        generatedAt: "2026-01-01T00:00:10Z",
      },
    });

    expect(one.input_hash).toBe(two.input_hash);
    expect(one.output_hash).toBe(two.output_hash);
    expect(one.receipt_hash).toBe(two.receipt_hash);
  });

  it("maps missing/invalid receipts to deterministic fail reasons", () => {
    const missing = buildDeterministicToolExecutionReceipt({
      tool: "halobank.time.compute",
      mode: "verify",
      requestPayload: { question: "x" },
      actionOutput: null,
    });
    const invalid = buildDeterministicToolExecutionReceipt({
      tool: "halobank.time.compute",
      mode: "verify",
      requestPayload: { question: "x" },
      actionOutput: "bad-output",
    });
    const malformed = buildDeterministicToolExecutionReceipt({
      tool: "halobank.time.compute",
      mode: "verify",
      requestPayload: { question: "x" },
      actionOutput: { receipt: { token: "missing-ok-flag" } },
    });

    expect(missing.status).toBe("failed");
    expect(missing.fail_reason).toBe("TOOL_RECEIPT_MISSING");
    expect(invalid.status).toBe("failed");
    expect(invalid.fail_reason).toBe("TOOL_RECEIPT_INVALID");
    expect(malformed.status).toBe("failed");
    expect(malformed.fail_reason).toBe("TOOL_RECEIPT_INVALID");
  });
});
