import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  CASIMIR_GATE_RECEIPT_SCHEMA,
  buildCasimirGateReceipt,
} from "../apps/desktop/scripts/casimir-gate-receipt-lib.mjs";

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const validResponse = Buffer.from(JSON.stringify({
  verdict: "PASS",
  pass: true,
  certificate: { certificateHash: "a".repeat(64), integrityOk: true },
}));
const validTrace = Buffer.from('{"trace":"one"}\n{"trace":"two"}\n');

describe("desktop Casimir gate receipt", () => {
  it("sanitizes and hash-binds PASS plus non-empty JSONL evidence", () => {
    const receipt = buildCasimirGateReceipt({
      responseBytes: validResponse,
      traceBytes: validTrace,
      generatedAt: "2026-08-11T12:00:00.000Z",
    });
    expect(receipt).toEqual({
      schema: CASIMIR_GATE_RECEIPT_SCHEMA,
      generatedAt: "2026-08-11T12:00:00.000Z",
      verdict: "PASS",
      pass: true,
      firstFail: null,
      certificate: { certificateHash: "a".repeat(64), integrity: "OK" },
      traceExport: { recordCount: 2, sha256: sha256(validTrace) },
      adapterResponseSha256: sha256(validResponse),
    });
    expect(JSON.stringify(receipt)).not.toContain("trace\":\"one");
  });

  it.each([
    ["empty trace", Buffer.from("")],
    ["malformed trace", Buffer.from('{"ok":true}\nnot-json\n')],
  ])("rejects %s evidence", (_label, traceBytes) => {
    expect(() => buildCasimirGateReceipt({
      responseBytes: validResponse,
      traceBytes,
    })).toThrow("training-trace");
  });

  it("rejects a non-SHA-256 certificate even when PASS is asserted", () => {
    const responseBytes = Buffer.from(JSON.stringify({
      verdict: "PASS",
      pass: true,
      certificate: { certificateHash: "short", integrityOk: true },
    }));
    expect(() => buildCasimirGateReceipt({
      responseBytes,
      traceBytes: validTrace,
    })).toThrow("certificate=present");
  });

  it("keeps raw adapter and trace evidence ephemeral in the public workflow", async () => {
    const workflowSource = await readFile(
      path.resolve(".github/workflows/desktop-release.yml"),
      "utf8",
    );
    const workflow = parse(workflowSource);
    const uploadSteps = workflow.jobs["build-verify"].steps.filter(
      (step: { uses?: string }) => step.uses?.startsWith("actions/upload-artifact@"),
    );
    const actionSteps = Object.values(workflow.jobs).flatMap(
      (job) => (job as { steps: Array<{ uses?: string }> }).steps,
    ).filter((step) => step.uses?.startsWith("actions/"));

    expect(workflowSource).toContain(
      "& npm.cmd @casimirArgs 1> artifacts/desktop-release-casimir-response.json",
    );
    expect(workflowSource).not.toContain("Tee-Object");
    expect(JSON.stringify(uploadSteps)).not.toContain(
      "desktop-release-casimir-response.json",
    );
    expect(JSON.stringify(uploadSteps)).not.toContain(
      "desktop-release-training-trace.jsonl",
    );
    expect(actionSteps.length).toBeGreaterThan(0);
    for (const step of actionSteps) {
      expect(step.uses).toMatch(/^actions\/[a-z-]+@[a-f0-9]{40}$/u);
    }
  });
});
