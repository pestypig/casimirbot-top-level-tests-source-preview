import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportStage4VerificationTrace,
  parseStage4VerificationTraceArgs,
  resolveStage4TrainingTraceUrl,
  validateStage4VerificationJsonl,
} from "../scripts/research/export-casimir-dp-stage4-verification-trace";

const runId = "adapter-run-stage4-001";
const traceId = "casimir-dp-stage4-trace-001";

const makeTrace = () => ({
  kind: "training-trace",
  version: 1,
  id: runId,
  seq: 17,
  ts: "2026-07-25T15:30:00.000Z",
  traceId,
  source: {
    system: "constraint-pack",
    component: "adapter",
    tool: "repo-convergence",
    version: "1",
  },
  signal: {
    kind: "repo-certified",
  },
  pass: true,
  deltas: [],
  certificate: {
    status: "GREEN",
    certificateHash:
      "6e84f965957f63aad452981d2ede72e62f706d32e0a5b6b469899884e12a4e45",
    integrityOk: true,
  },
});

const makeResponse = () => ({ trace: makeTrace() });

describe("Stage-4 verification training-trace export", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "casimir-dp-stage4-trace-export-"),
    );
  });

  afterEach(async () => {
    const resolved = path.resolve(tempDir);
    expect(resolved.startsWith(path.resolve(os.tmpdir()))).toBe(true);
    await rm(resolved, { recursive: true, force: true });
  });

  it("writes exactly one compact trace object plus newline and rereads it", async () => {
    const responsePath = path.join(tempDir, "response.json");
    const outputPath = path.join(tempDir, "nested", "trace.jsonl");
    await writeFile(responsePath, JSON.stringify(makeResponse()), "utf8");

    const result = await exportStage4VerificationTrace({
      inputResponsePath: responsePath,
      runId,
      expectedTraceId: traceId,
      outputPath,
    });

    const output = await readFile(outputPath);
    const expected = Buffer.from(`${JSON.stringify(makeTrace())}\n`, "utf8");
    expect(output.equals(expected)).toBe(true);
    expect(result).toMatchObject({
      endpoint: null,
      runId,
      traceId,
      outputPath: path.resolve(outputPath),
      bytes: expected.byteLength,
      lineCount: 1,
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(validateStage4VerificationJsonl(output, { runId, traceId })).toEqual(
      makeTrace(),
    );
  });

  it("fetches only the requested run endpoint and verifies both identities", async () => {
    const outputPath = path.join(tempDir, "trace.jsonl");
    const fetchImpl = vi.fn<
      [input: string | URL, init?: RequestInit],
      Promise<Response>
    >(
      async (_input, _init) =>
        new Response(JSON.stringify(makeResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const result = await exportStage4VerificationTrace({
      url: "https://example.test",
      runId,
      expectedTraceId: traceId,
      outputPath,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://example.test/api/agi/training-trace/${runId}`,
    );
    expect(result.endpoint).toBe(
      `https://example.test/api/agi/training-trace/${runId}`,
    );
  });

  it.each([
    {
      label: "run id",
      mutate: (payload: ReturnType<typeof makeResponse>) => {
        payload.trace.id = "wrong-run";
      },
      error: /runId mismatch/,
    },
    {
      label: "trace id",
      mutate: (payload: ReturnType<typeof makeResponse>) => {
        payload.trace.traceId = "wrong-trace";
      },
      error: /traceId mismatch/,
    },
  ])("fails closed on a mismatched $label", async ({ mutate, error }) => {
    const responsePath = path.join(tempDir, "response.json");
    const outputPath = path.join(tempDir, "trace.jsonl");
    const payload = makeResponse();
    mutate(payload);
    await writeFile(responsePath, JSON.stringify(payload), "utf8");

    await expect(
      exportStage4VerificationTrace({
        inputResponsePath: responsePath,
        runId,
        expectedTraceId: traceId,
        outputPath,
      }),
    ).rejects.toThrow(error);
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects raw and escaped NUL content before creating output", async () => {
    const rawNulPath = path.join(tempDir, "raw-nul.json");
    const escapedNulPath = path.join(tempDir, "escaped-nul.json");
    const outputPath = path.join(tempDir, "trace.jsonl");
    const raw = Buffer.from(JSON.stringify(makeResponse()), "utf8");
    const insertion = raw.indexOf(Buffer.from(traceId, "utf8"));
    const withNul = Buffer.concat([
      raw.subarray(0, insertion),
      Buffer.from([0]),
      raw.subarray(insertion),
    ]);
    await writeFile(rawNulPath, withNul);

    await expect(
      exportStage4VerificationTrace({
        inputResponsePath: rawNulPath,
        runId,
        expectedTraceId: traceId,
        outputPath,
      }),
    ).rejects.toThrow(/NUL byte/);

    const escapedPayload = makeResponse();
    (escapedPayload.trace as typeof escapedPayload.trace & { note: string }).note =
      "bad\0value";
    await writeFile(escapedNulPath, JSON.stringify(escapedPayload), "utf8");
    await expect(
      exportStage4VerificationTrace({
        inputResponsePath: escapedNulPath,
        runId,
        expectedTraceId: traceId,
        outputPath,
      }),
    ).rejects.toThrow(/NUL character/);
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses exclusive creation and never overwrites an existing artifact", async () => {
    const responsePath = path.join(tempDir, "response.json");
    const outputPath = path.join(tempDir, "trace.jsonl");
    await writeFile(responsePath, JSON.stringify(makeResponse()), "utf8");
    await writeFile(outputPath, "prior-artifact\n", "utf8");

    await expect(
      exportStage4VerificationTrace({
        inputResponsePath: responsePath,
        runId,
        expectedTraceId: traceId,
        outputPath,
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(outputPath, "utf8")).toBe("prior-artifact\n");
  });

  it.each([
    {
      label: "failed verdict",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        trace.pass = false;
      },
      error: /pass=true/,
    },
    {
      label: "first failure on a passing trace",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        (trace as typeof trace & { firstFail: object }).firstFail = {
          id: "UNEXPECTED",
        };
      },
      error: /must not contain a firstFail/,
    },
    {
      label: "missing certificate",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        delete (trace as Partial<typeof trace>).certificate;
      },
      error: /must contain a certificate/,
    },
    {
      label: "invalid certificate hash",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        trace.certificate.certificateHash = "abc123";
      },
      error: /certificateHash must be a lowercase SHA-256/,
    },
    {
      label: "failed certificate integrity",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        trace.certificate.integrityOk = false;
      },
      error: /integrityOk must be true/,
    },
    {
      label: "non-green certificate",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        trace.certificate.status = "RED";
      },
      error: /status must be GREEN/,
    },
    {
      label: "wrong constraint-pack source",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        trace.source.tool = "other-pack";
      },
      error: /repo-convergence constraint-pack adapter record/,
    },
    {
      label: "wrong certification signal",
      mutate: (trace: ReturnType<typeof makeTrace>) => {
        trace.signal.kind = "diagnostic";
      },
      error: /signal.kind=repo-certified/,
    },
  ])("rejects $label", async ({ mutate, error }) => {
    const responsePath = path.join(tempDir, "response.json");
    const outputPath = path.join(tempDir, "trace.jsonl");
    const payload = makeResponse();
    mutate(payload.trace);
    await writeFile(responsePath, JSON.stringify(payload), "utf8");

    await expect(
      exportStage4VerificationTrace({
        inputResponsePath: responsePath,
        runId,
        expectedTraceId: traceId,
        outputPath,
      }),
    ).rejects.toThrow(error);
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects multi-line, blank-line, non-compact, and unterminated JSONL", () => {
    const compact = JSON.stringify(makeTrace());
    const expected = { runId, traceId };
    expect(() =>
      validateStage4VerificationJsonl(
        Buffer.from(`${compact}\n${compact}\n`),
        expected,
      ),
    ).toThrow(/exactly one non-empty line/);
    expect(() =>
      validateStage4VerificationJsonl(Buffer.from(`${compact}\n\n`), expected),
    ).toThrow(/blank trailing line/);
    expect(() =>
      validateStage4VerificationJsonl(
        Buffer.from(`${JSON.stringify(makeTrace(), null, 2)}\n`),
        expected,
      ),
    ).toThrow();
    expect(() =>
      validateStage4VerificationJsonl(Buffer.from(compact), expected),
    ).toThrow(/exactly one newline/);
  });

  it("parses the required CLI identity and output arguments", () => {
    expect(
      parseStage4VerificationTraceArgs([
        "--url",
        "https://example.test/api/agi/training-trace",
        "--run-id",
        runId,
        "--expected-trace-id",
        traceId,
        "--output",
        "artifacts/stage4-trace.jsonl",
        "--input-response",
        "response.json",
      ]),
    ).toEqual({
      url: "https://example.test/api/agi/training-trace",
      runId,
      expectedTraceId: traceId,
      outputPath: "artifacts/stage4-trace.jsonl",
      inputResponsePath: "response.json",
    });
    expect(
      resolveStage4TrainingTraceUrl(
        "https://example.test/api/agi/training-trace?limit=2",
        "run/id",
      ),
    ).toBe("https://example.test/api/agi/training-trace/run%2Fid");
  });
});
