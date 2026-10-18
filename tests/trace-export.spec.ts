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
  ENABLE_TRACE_EXPORT: process.env.ENABLE_TRACE_EXPORT,
  LLM_POLICY: process.env.LLM_POLICY,
  LLM_RUNTIME: process.env.LLM_RUNTIME,
  ENABLE_LLM_LOCAL_SPAWN: process.env.ENABLE_LLM_LOCAL_SPAWN,
  LLM_LOCAL_CMD: process.env.LLM_LOCAL_CMD,
  LLM_HTTP_BASE: process.env.LLM_HTTP_BASE,
};

describe("trace export route", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";
  let planRouter: Router;
  let traceRouter: Router;
  let trainingTraceRouter: Router;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://trace-export-tests";
    process.env.ENABLE_ESSENCE = "1";
    process.env.ENABLE_AGI = "1";
    process.env.ENABLE_TRACE_API = "1";
    process.env.LLM_POLICY = "stub";
    delete process.env.LLM_RUNTIME;
    process.env.ENABLE_LLM_LOCAL_SPAWN = "0";
    delete process.env.LLM_LOCAL_CMD;
    delete process.env.LLM_HTTP_BASE;

    const planModule = await import("../server/routes/agi.plan");
    const traceModule = await import("../server/routes/agi.trace");
    const trainingTraceModule = await import("../server/routes/training-trace");
    planRouter = planModule.planRouter;
    traceRouter = traceModule.traceRouter;
    trainingTraceRouter = trainingTraceModule.trainingTraceRouter;

    const app = express();
    app.use(express.json());
    app.use("/api/agi/trace", traceRouter);
    app.use("/api/agi", planRouter);
    app.use("/api/agi", trainingTraceRouter);
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
    if (envSnapshot.ENABLE_TRACE_EXPORT === undefined) delete process.env.ENABLE_TRACE_EXPORT;
    else process.env.ENABLE_TRACE_EXPORT = envSnapshot.ENABLE_TRACE_EXPORT;
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

  const planAndExecute = async (): Promise<string> => {
    const planResponse = await fetch(`${baseUrl}/api/agi/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "summarize local README" }),
    });
    expect(planResponse.status).toBe(200);
    const planned = (await planResponse.json()) as { traceId: string };
    const executeResponse = await fetch(`${baseUrl}/api/agi/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId: planned.traceId }),
    });
    expect(executeResponse.status).toBe(200);
    return planned.traceId;
  };

  it("exports plan + manifest when enabled", async () => {
    process.env.ENABLE_TRACE_EXPORT = "1";
    const traceId = await planAndExecute();
    const response = await fetch(`${baseUrl}/api/agi/trace/${traceId}/export`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      version: string;
      plan: unknown[];
      tool_manifest: unknown[];
      knowledge_context: unknown[];
    };
    expect(payload.version).toBe("essence-trace-export/1.0");
    expect(Array.isArray(payload.plan)).toBe(true);
    expect(Array.isArray(payload.tool_manifest)).toBe(true);
    expect(Array.isArray(payload.knowledge_context)).toBe(true);
  }, 20000);

  it("returns 404 when export gate is disabled", async () => {
    process.env.ENABLE_TRACE_EXPORT = "0";
    const traceId = await planAndExecute();
    const response = await fetch(`${baseUrl}/api/agi/trace/${traceId}/export`);
    expect(response.status).toBe(404);
  }, 20000);

  it("exports prediction_vs_observation ledger via jsonl", async () => {
    const createResponse = await fetch(`${baseUrl}/api/agi/training-trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "toe-005-export",
        tenantId: "toe-005",
        pass: true,
        predictionObservationLedger: {
          kind: "prediction_vs_observation",
          version: 1,
          entries: [
            {
              metric: "ford_roman_margin",
              prediction: [0.14, 0.13],
              observation: [0.12, 0.11],
              delta: -0.02,
              absoluteError: 0.02,
              confidence: 0.76,
              trend: {
                window: "last_16",
                sampleCount: 16,
                drift: -0.0011,
                bias: -0.002,
              },
              gateTuning: {
                thresholdKey: "ford_roman_k",
                trendMetric: "drift",
                adjustmentHint: "monitor_negative_drift",
              },
            },
          ],
        },
      }),
    });
    expect(createResponse.status).toBe(200);

    const exportResponse = await fetch(`${baseUrl}/api/agi/training-trace/export?limit=50&tenantId=toe-005`);
    expect(exportResponse.status).toBe(200);
    const raw = await exportResponse.text();
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const decoded = lines.map((line) => JSON.parse(line) as {
      traceId?: string;
      predictionObservationLedger?: { kind?: string; entries?: Array<{ gateTuning?: { trendMetric?: string } }> };
    });
    const match = decoded.find((entry) => entry.traceId === "toe-005-export");
    expect(match?.predictionObservationLedger?.kind).toBe("prediction_vs_observation");
    expect(match?.predictionObservationLedger?.entries?.[0]?.gateTuning?.trendMetric).toBe("drift");
  });

  it("exports calibration metadata via jsonl", async () => {
    const createResponse = await fetch(`${baseUrl}/api/agi/training-trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "toe-005-calibration",
        tenantId: "toe-005",
        pass: true,
        calibration: {
          actuator_id: "joint-a1",
          can_id: "0x101",
          firmware_version: "fw-1.2.3",
          control_mode: "position",
          zero_offset: 0.0125,
          imu_profile: "imu-baseline-v1",
        },
      }),
    });
    expect(createResponse.status).toBe(200);
    const exportResponse = await fetch(`${baseUrl}/api/agi/training-trace/export?limit=50&tenantId=toe-005`);
    expect(exportResponse.status).toBe(200);
    const raw = await exportResponse.text();
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const decoded = lines.map((line) => JSON.parse(line) as {
      traceId?: string;
      calibration?: { actuator_id?: string; can_id?: string; imu_profile?: string; zero_offset?: number };
    });
    const match = decoded.find((entry) => entry.traceId === "toe-005-calibration");
    expect(match?.calibration?.actuator_id).toBe("joint-a1");
    expect(match?.calibration?.can_id).toBe("0x101");
    expect(match?.calibration?.imu_profile).toBe("imu-baseline-v1");
    expect(match?.calibration?.zero_offset).toBe(0.0125);
  });

  it("rejects malformed calibration packets with deterministic reason", async () => {
    const createResponse = await fetch(`${baseUrl}/api/agi/training-trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "toe-005-calibration-malformed",
        tenantId: "toe-005",
        pass: true,
        calibration: {
          actuator_id: "joint-a1",
          can_id: "0x101",
          firmware_version: "fw-1.2.3",
          // control_mode omitted on purpose
          zero_offset: 0.0125,
          imu_profile: "imu-baseline-v1",
        },
      }),
    });
    expect(createResponse.status).toBe(400);
    const payload = (await createResponse.json()) as { error?: string; reason?: string };
    expect(payload.error).toBe("invalid-training-trace");
    expect(payload.reason).toBe("MALFORMED_CALIBRATION_PACKET");
  });

  it("exports HIL evidence packet via jsonl", async () => {
    const createResponse = await fetch(`${baseUrl}/api/agi/training-trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "toe-005-hil-v2",
        tenantId: "toe-005",
        pass: true,
        hil_packet: {
          run_id: "hil-run-001",
          hardware_profile: "agibot-x1-desktop-rig-a",
          preflight_status: "PASS",
          estop_liveness_result: "PASS",
          calibration_ref: "calibration:joint-a1:fw-1.2.3",
          safety_gate_outcome: "PASS",
        },
      }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { trace?: { hil_packet?: { run_id?: string } } };
    expect(created.trace?.hil_packet?.run_id).toBe("hil-run-001");

    const exportResponse = await fetch(`${baseUrl}/api/agi/training-trace/export?limit=50&tenantId=toe-005`);
    expect(exportResponse.status).toBe(200);
    const raw = await exportResponse.text();
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const decoded = lines.map((line) => JSON.parse(line) as {
      traceId?: string;
      hil_packet?: { run_id?: string; hardware_profile?: string; safety_gate_outcome?: string };
    });
    const match = decoded.filter((entry) => entry.traceId === "toe-005-hil-v2").at(-1);
    expect(match?.hil_packet?.run_id).toBe("hil-run-001");
    expect(match?.hil_packet?.hardware_profile).toBe("agibot-x1-desktop-rig-a");
    expect(match?.hil_packet?.safety_gate_outcome).toBe("PASS");
  });


});
