import express from "express";
import type { Router } from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDbClient } from "../server/db/client";

const envSnapshot = {
  DATABASE_URL: process.env.DATABASE_URL,
  ENABLE_ESSENCE: process.env.ENABLE_ESSENCE,
  ENABLE_AGI: process.env.ENABLE_AGI,
  ENABLE_TRACE_API: process.env.ENABLE_TRACE_API,
  ENABLE_PERSONA_UI: process.env.ENABLE_PERSONA_UI,
  LLM_POLICY: process.env.LLM_POLICY,
  LLM_RUNTIME: process.env.LLM_RUNTIME,
  ENABLE_LLM_LOCAL_SPAWN: process.env.ENABLE_LLM_LOCAL_SPAWN,
  LLM_LOCAL_CMD: process.env.LLM_LOCAL_CMD,
  LLM_HTTP_BASE: process.env.LLM_HTTP_BASE,
};

describe("Persona wiring in AGI plan/execute", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";
  let planRouter: Router;
  let traceRouter: Router;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://persona-ui-tests";
    process.env.ENABLE_ESSENCE = "1";
    process.env.ENABLE_AGI = "1";
    process.env.ENABLE_TRACE_API = "1";
    process.env.ENABLE_PERSONA_UI = "1";
    process.env.LLM_POLICY = "stub";
    delete process.env.LLM_RUNTIME;
    process.env.ENABLE_LLM_LOCAL_SPAWN = "0";
    delete process.env.LLM_LOCAL_CMD;
    delete process.env.LLM_HTTP_BASE;

    const planModule = await import("../server/routes/agi.plan");
    const traceModule = await import("../server/routes/agi.trace");
    planRouter = planModule.planRouter;
    traceRouter = traceModule.traceRouter;

    const app = express();
    app.use(express.json());
    app.use("/api/agi/trace", traceRouter);
    app.use("/api/agi", planRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await resetDbClient();
    if (envSnapshot.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
    if (envSnapshot.ENABLE_ESSENCE === undefined) delete process.env.ENABLE_ESSENCE;
    else process.env.ENABLE_ESSENCE = envSnapshot.ENABLE_ESSENCE;
    if (envSnapshot.ENABLE_AGI === undefined) delete process.env.ENABLE_AGI;
    else process.env.ENABLE_AGI = envSnapshot.ENABLE_AGI;
    if (envSnapshot.ENABLE_TRACE_API === undefined) delete process.env.ENABLE_TRACE_API;
    else process.env.ENABLE_TRACE_API = envSnapshot.ENABLE_TRACE_API;
    if (envSnapshot.ENABLE_PERSONA_UI === undefined) delete process.env.ENABLE_PERSONA_UI;
    else process.env.ENABLE_PERSONA_UI = envSnapshot.ENABLE_PERSONA_UI;
    if (envSnapshot.LLM_POLICY === undefined) delete process.env.LLM_POLICY;
    else process.env.LLM_POLICY = envSnapshot.LLM_POLICY;
    if (envSnapshot.LLM_RUNTIME === undefined) delete process.env.LLM_RUNTIME;
    else process.env.LLM_RUNTIME = envSnapshot.LLM_RUNTIME;
    if (envSnapshot.ENABLE_LLM_LOCAL_SPAWN === undefined)
      delete process.env.ENABLE_LLM_LOCAL_SPAWN;
    else process.env.ENABLE_LLM_LOCAL_SPAWN = envSnapshot.ENABLE_LLM_LOCAL_SPAWN;
    if (envSnapshot.LLM_LOCAL_CMD === undefined) delete process.env.LLM_LOCAL_CMD;
    else process.env.LLM_LOCAL_CMD = envSnapshot.LLM_LOCAL_CMD;
    if (envSnapshot.LLM_HTTP_BASE === undefined) delete process.env.LLM_HTTP_BASE;
    else process.env.LLM_HTTP_BASE = envSnapshot.LLM_HTTP_BASE;
  });

  it("echoes personaId through plan, execute, and trace lookups", async () => {
    const personaId = "persona:test-user";
    const planResponse = await fetch(`${baseUrl}/api/agi/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Summarize release plan", personaId }),
    });
    expect(planResponse.status).toBe(200);
    const planned = (await planResponse.json()) as { traceId: string; personaId: string; task_trace?: { persona_id?: string } };
    expect(planned.personaId).toBe(personaId);
    expect(planned.task_trace?.persona_id).toBe(personaId);

    const execResponse = await fetch(`${baseUrl}/api/agi/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId: planned.traceId }),
    });
    expect(execResponse.status).toBe(200);
    const executed = (await execResponse.json()) as { task_trace?: { persona_id?: string } };
    expect(executed.task_trace?.persona_id).toBe(personaId);

    const traceResponse = await fetch(`${baseUrl}/api/agi/trace/${planned.traceId}`);
    expect(traceResponse.status).toBe(200);
    const tracePayload = (await traceResponse.json()) as { persona_id?: string };
    expect(tracePayload.persona_id).toBe(personaId);
  }, 20000);
});
