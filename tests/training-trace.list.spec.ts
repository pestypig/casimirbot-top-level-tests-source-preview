import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { trainingTraceRouter } from "../server/routes/training-trace";
import {
  __resetTrainingTraceStore,
  getTrainingTraceById,
  recordTrainingTrace,
} from "../server/services/observability/training-trace-store";

describe("training trace list/get", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/agi", trainingTraceRouter);

  beforeEach(() => {
    __resetTrainingTraceStore();
  });

  it("returns newly written trace rows in list and get", async () => {
    const written = recordTrainingTrace({
      traceId: "trace:list:get:1",
      source: { system: "evolution", component: "gate", tool: "evolution.gate" },
      pass: true,
      notes: ["source=evolution.gate"],
    });

    const listRes = await request(app).get("/api/agi/training-trace?limit=10");
    expect(listRes.status).toBe(200);
    expect(listRes.body.traces.some((row: { id: string }) => row.id === written.id)).toBe(true);

    const getRes = await request(app).get(`/api/agi/training-trace/${written.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.trace.id).toBe(written.id);
    expect(getTrainingTraceById(written.id)?.id).toBe(written.id);
  });

  it("filters by typed source with note fallback", async () => {
    recordTrainingTrace({
      traceId: "typed-source",
      source: { system: "evolution", component: "gate", tool: "evolution.gate" },
      pass: true,
      notes: ["source=evolution.gate"],
    });
    recordTrainingTrace({
      traceId: "note-only-source",
      pass: true,
      notes: ["source=evolution.gate"],
    });
    recordTrainingTrace({
      traceId: "other-source",
      source: { system: "agi", component: "adapter", tool: "adapter.run" },
      pass: true,
      notes: ["source=adapter.run"],
    });

    const filtered = await request(app).get(
      "/api/agi/training-trace?limit=20&source=evolution.gate",
    );
    expect(filtered.status).toBe(200);
    const traceIds = filtered.body.traces.map((row: { traceId: string }) => row.traceId);
    expect(traceIds).toContain("typed-source");
    expect(traceIds).toContain("note-only-source");
    expect(traceIds).not.toContain("other-source");
  });
});
