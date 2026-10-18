import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createAppWithRouter = async (opts?: { knowledgeEnabled?: string }) => {
  vi.resetModules();
  if (opts?.knowledgeEnabled !== undefined) {
    process.env.ENABLE_KNOWLEDGE_PROJECTS = opts.knowledgeEnabled;
  } else {
    delete process.env.ENABLE_KNOWLEDGE_PROJECTS;
  }

  const { knowledgeRouter } = await import("../server/routes/knowledge");
  const traceStore = await import("../server/services/observability/training-trace-store");
  const app = express();
  app.use(express.json());
  app.use("/api/knowledge", knowledgeRouter);
  return {
    app,
    ...traceStore,
  };
};

describe("knowledge promotion route", () => {
  beforeEach(() => {
    delete process.env.AGI_TENANT_REQUIRED;
    delete process.env.ENABLE_KNOWLEDGE_PROJECTS;
  });

  it("rejects forged client PASS payload without evidenceRef", async () => {
    const { app, __resetTrainingTraceStore } = await createAppWithRouter();
    __resetTrainingTraceStore();

    const res = await request(app).post("/api/knowledge/projects/promote").send({
      claimTier: "certified",
      casimirVerdict: "PASS",
      certificateHash: "forged",
      certificateIntegrityOk: true,
      enforceCertifiedOnly: true,
    });

    expect(res.status).toBe(409);
    expect(res.body?.rejection?.code).toBe("KNOWLEDGE_PROMOTION_MISSING_EVIDENCE_REF");
  });

  it("rejects unknown evidenceRef with typed code", async () => {
    const { app, __resetTrainingTraceStore } = await createAppWithRouter();
    __resetTrainingTraceStore();

    const res = await request(app).post("/api/knowledge/projects/promote").send({
      claimTier: "certified",
      evidenceRef: "unknown-trace-id",
      enforceCertifiedOnly: true,
    });

    expect(res.status).toBe(409);
    expect(res.body?.rejection?.code).toBe("KNOWLEDGE_PROMOTION_UNRESOLVED_EVIDENCE_REF");
  });

  it("rejects cross-tenant evidenceRef deterministically", async () => {
    process.env.AGI_TENANT_REQUIRED = "1";
    const { app, __resetTrainingTraceStore, recordTrainingTrace } = await createAppWithRouter();
    __resetTrainingTraceStore();

    const trace = recordTrainingTrace({
      traceId: "knowledge-promotion-pass",
      tenantId: "tenant-a",
      source: { system: "agi", component: "adapter", tool: "adapter.run", version: "1" },
      pass: true,
      deltas: [],
      certificate: {
        certificateHash: "cert:ok",
        certificateId: "cert:ok:id",
        integrityOk: true,
      },
    });

    const res = await request(app)
      .post("/api/knowledge/projects/promote")
      .set("X-Tenant-Id", "tenant-b")
      .send({
        claimTier: "certified",
        evidenceRef: trace.id,
        enforceCertifiedOnly: true,
      });

    expect(res.status).toBe(409);
    expect(res.body?.rejection?.code).toBe("KNOWLEDGE_PROMOTION_EVIDENCE_TENANT_FORBIDDEN");
  });

  it("rejects forged local trace lacking trusted provenance", async () => {
    const { app, __resetTrainingTraceStore, recordTrainingTrace } = await createAppWithRouter();
    __resetTrainingTraceStore();

    const trace = recordTrainingTrace({
      traceId: "knowledge-promotion-untrusted-source",
      pass: true,
      source: { system: "manual", component: "ingest", tool: "training-trace.post", version: "1" },
      deltas: [],
      certificate: {
        certificateHash: "cert:ok",
        certificateId: "cert:ok:id",
        integrityOk: true,
      },
    });

    const res = await request(app).post("/api/knowledge/projects/promote").send({
      claimTier: "certified",
      evidenceRef: trace.id,
      enforceCertifiedOnly: true,
    });

    expect(res.status).toBe(409);
    expect(res.body?.rejection?.code).toBe("KNOWLEDGE_PROMOTION_UNTRUSTED_EVIDENCE_PROVENANCE");
  });

  it("accepts only when resolved trusted evidence satisfies gate conditions", async () => {
    const { app, __resetTrainingTraceStore, recordTrainingTrace } = await createAppWithRouter();
    __resetTrainingTraceStore();

    const trace = recordTrainingTrace({
      traceId: "knowledge-promotion-pass",
      source: { system: "agi", component: "adapter", tool: "adapter.run", version: "1" },
      pass: true,
      deltas: [],
      certificate: {
        certificateHash: "cert:ok",
        certificateId: "cert:ok:id",
        integrityOk: true,
      },
    });

    const res = await request(app).post("/api/knowledge/projects/promote").send({
      claimTier: "certified",
      evidenceRef: trace.id,
      casimirVerdict: "FAIL",
      certificateHash: "forged",
      certificateIntegrityOk: false,
      enforceCertifiedOnly: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      promotion: {
        status: "promoted",
        claimTier: "certified",
        evidenceRef: trace.id,
      },
    });
  });

  it("returns report-only non-promoted response when gate fails", async () => {
    const { app, __resetTrainingTraceStore, recordTrainingTrace } = await createAppWithRouter();
    __resetTrainingTraceStore();

    const trace = recordTrainingTrace({
      traceId: "knowledge-promotion-fail",
      source: { system: "agi", component: "adapter", tool: "adapter.run", version: "1" },
      pass: false,
      deltas: [],
      certificate: {
        certificateHash: "cert:bad",
        certificateId: "cert:bad:id",
        integrityOk: true,
      },
    });

    const res = await request(app).post("/api/knowledge/projects/promote").send({
      claimTier: "certified",
      evidenceRef: trace.id,
      enforceCertifiedOnly: false,
    });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      ok: false,
      mode: "report-only",
      promotion: {
        status: "not-promoted",
      },
    });
    expect(res.body?.rejection?.code).toBe("KNOWLEDGE_PROMOTION_MISSING_CASIMIR_VERIFICATION");
  });

  it("fails closed when knowledge subsystem is disabled", async () => {
    const { app, __resetTrainingTraceStore } = await createAppWithRouter({ knowledgeEnabled: "0" });
    __resetTrainingTraceStore();

    const res = await request(app).post("/api/knowledge/projects/promote").send({
      claimTier: "certified",
      evidenceRef: "any-trace",
      enforceCertifiedOnly: true,
    });

    expect(res.status).toBe(409);
    expect(res.body?.rejection?.code).toBe("KNOWLEDGE_PROMOTION_POLICY_DISABLED");
  });
});
