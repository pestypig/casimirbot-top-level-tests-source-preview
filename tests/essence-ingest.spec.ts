import crypto from "node:crypto";
import sharp from "sharp";
import type { RequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { essenceRouter } from "../server/routes/essence";
import { getEnvelope, resetEnvelopeStore } from "../server/services/essence/store";
import {
  __flushIngestJobsForTest,
  __resetIngestJobQueueForTest,
} from "../server/services/essence/ingest-jobs";

type MockFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

vi.mock("multer", () => {
  const multer = () => ({
    single:
      () =>
      (req: any, _res: any, cb: (err?: unknown) => void): void => {
        if (req.__mockFile) {
          req.file = req.__mockFile;
          cb();
          return;
        }
        cb(new Error("file_required"));
      },
  });
  (multer as any).memoryStorage = () => ({});
  return { default: multer };
});

const getIngestHandler = (): RequestHandler => {
  const stack = (essenceRouter as any).stack as Array<{ route?: { path: string; stack: Array<{ handle: RequestHandler }> } }>;
  const layer = stack.find((entry) => entry.route?.path === "/ingest");
  if (!layer?.route?.stack?.[0]?.handle) {
    throw new Error("ingest route handler not found");
  }
  return layer.route.stack[0].handle;
};

const getFetchHandler = (): RequestHandler => {
  const stack = (essenceRouter as any).stack as Array<{
    route?: { path: string; stack: Array<{ handle: RequestHandler }>; methods: Record<string, boolean> };
  }>;
  const layer = stack.find(
    (entry) => entry.route?.methods?.get && String(entry.route?.path).startsWith("/:id"),
  );
  if (!layer?.route?.stack?.[0]?.handle) {
    throw new Error("fetch route handler not found");
  }
  return layer.route.stack[0].handle;
};

const createMockResponse = () => {
  return {
    statusCode: 200,
    payload: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.payload = body;
      return this;
    },
  };
};

describe("POST /api/essence/ingest", () => {
  const handler = getIngestHandler();

  beforeEach(async () => {
    await resetEnvelopeStore();
    __resetIngestJobQueueForTest();
  });

  it("persists real multipart uploads with envelopes and hashes", async () => {
    const buffer = Buffer.from("Alpha ingestion path", "utf8");
    const req: any = {
      body: { creator_id: "tester", visibility: "private", license: "CC0" },
      auth: { sub: "tester" },
      __mockFile: {
        buffer,
        mimetype: "audio/wav",
        originalname: "alpha.txt",
      } satisfies MockFile,
    };
    const res = createMockResponse();

    await handler(req, res as any, () => undefined);

    expect(res.statusCode).toBe(200);
    expect(res.payload?.essence_id).toMatch(/[a-f0-9-]{36}/i);
    expect(res.payload?.uri).toMatch(/^storage:\/\/(fs|s3)\//);
    expect(res.payload?.hash?.length).toBe(64);

    await __flushIngestJobsForTest();
    const envelope = await getEnvelope(res.payload.essence_id);
    expect(envelope).toBeTruthy();
    if (!envelope) {
      return;
    }
    const expectedHash = crypto.createHash("sha256").update(buffer).digest("hex");
    expect(envelope.header.source.original_hash.value).toBe(expectedHash);
    expect(envelope.header.source.uri).toBe(res.payload.uri);
    expect(envelope.header.source.creator_id).toBe("tester");
    expect(envelope.features?.audio?.fingerprint).toBe(expectedHash);
    expect(envelope.features?.text?.transcript).toMatch(/Alpha ingestion path/i);
    expect(envelope.embeddings?.length).toBeGreaterThanOrEqual(1);
  });

  it("isolates identical uploads between different creators", async () => {
    const fetchHandler = getFetchHandler();
    const shared = Buffer.from("shared ingest payload", "utf8");

    const alphaReq: any = {
      body: { creator_id: "alpha", visibility: "private" },
      auth: { sub: "alpha" },
      __mockFile: {
        buffer: shared,
        mimetype: "text/plain",
        originalname: "shared.txt",
      } satisfies MockFile,
    };
    const alphaRes = createMockResponse();
    await handler(alphaReq, alphaRes as any, () => undefined);

    const betaReq: any = {
      body: { creator_id: "beta", visibility: "private" },
      auth: { sub: "beta" },
      __mockFile: {
        buffer: shared,
        mimetype: "text/plain",
        originalname: "shared.txt",
      } satisfies MockFile,
    };
    const betaRes = createMockResponse();
    await handler(betaReq, betaRes as any, () => undefined);

    expect(alphaRes.payload?.dedup).toBeUndefined();
    expect(betaRes.payload?.dedup).toBeUndefined();
    expect(betaRes.payload?.essence_id).not.toBe(alphaRes.payload?.essence_id);

    await __flushIngestJobsForTest();

    const alphaFetch = createMockResponse();
    await fetchHandler(
      { params: { id: alphaRes.payload.essence_id }, auth: { sub: "alpha" } } as any,
      alphaFetch as any,
      () => undefined,
    );
    expect(alphaFetch.statusCode).toBe(200);

    const betaFetch = createMockResponse();
    await fetchHandler(
      { params: { id: alphaRes.payload.essence_id }, auth: { sub: "beta" } } as any,
      betaFetch as any,
      () => undefined,
    );
    expect(betaFetch.statusCode).toBe(403);
    expect(betaFetch.payload?.error).toBe("forbidden");
  });

  it("enriches text uploads with embeddings and summaries", async () => {
    const buffer = Buffer.from(
      "Beta textual enrichment data about warp safety domains and hull integrity.",
      "utf8",
    );
    const req: any = {
      body: { creator_id: "scribe", visibility: "private" },
      auth: { sub: "scribe" },
      __mockFile: {
        buffer,
        mimetype: "text/plain",
        originalname: "warp-notes.txt",
      } satisfies MockFile,
    };
    const res = createMockResponse();
    await handler(req, res as any, () => undefined);
    await __flushIngestJobsForTest();
    const envelope = await getEnvelope(res.payload.essence_id);
    expect(envelope?.features?.text?.summary).toMatch(/warp safety domains/i);
    const hasTextEmbedding =
      envelope?.embeddings?.some((entry) => entry.space === "ingest/text-hash-32") ?? false;
    expect(hasTextEmbedding).toBe(true);
  });

  it("accepts PDF uploads by default", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "utf8");
    const req: any = {
      body: { creator_id: "paperbot", visibility: "private" },
      auth: { sub: "paperbot" },
      __mockFile: {
        buffer: pdfBuffer,
        mimetype: "application/pdf",
        originalname: "paper.pdf",
      } satisfies MockFile,
    };
    const res = createMockResponse();

    await handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(res.payload?.essence_id).toMatch(/[a-f0-9-]{36}/i);

    await __flushIngestJobsForTest();
    const envelope = await getEnvelope(res.payload.essence_id);
    expect(envelope?.header.source.mime).toBe("application/pdf");
    expect(envelope?.header.modality).toBe("text");
  });

  it("adds captions and tags for image uploads", async () => {
    const req: any = {
      body: { creator_id: "artist", visibility: "private" },
      auth: { sub: "artist" },
      __mockFile: {
        buffer: await sharp({
          create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 },
          },
        }).png().toBuffer(),
        mimetype: "image/png",
        originalname: "nebula-map.png",
      } satisfies MockFile,
    };
    const res = createMockResponse();
    await handler(req, res as any, () => undefined);
    await __flushIngestJobsForTest();
    const envelope = await getEnvelope(res.payload.essence_id);
    expect(envelope?.features?.image?.width).toBeGreaterThan(0);
    expect(envelope?.features?.text?.caption).toMatch(/image/i);
    expect((envelope?.features?.text?.tags ?? []).length).toBeGreaterThan(0);
  });
});
