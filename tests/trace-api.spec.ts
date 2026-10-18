import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRouter } from "../server/routes/agi.plan";
import { traceRouter } from "../server/routes/agi.trace";
import { trainingTraceRouter } from "../server/routes/training-trace";
import { resetDbClient } from "../server/db/client";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://trace-api-tests";
process.env.ENABLE_ESSENCE = process.env.ENABLE_ESSENCE ?? "1";

const traceSuite =
  process.env.ENABLE_AGI === "1" && process.env.ENABLE_TRACE_API === "1" ? describe : describe.skip;

traceSuite("AGI trace API", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
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
  });

  it("returns stored traces and 404 for unknown ids", async () => {
    const planResponse = await fetch(`${baseUrl}/api/agi/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Summarize README status" }),
    });
    expect(planResponse.status).toBe(200);
    const planned = (await planResponse.json()) as { traceId: string };
    expect(planned.traceId).toBeDefined();

    const executeResponse = await fetch(`${baseUrl}/api/agi/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId: planned.traceId }),
    });
    expect(executeResponse.status).toBe(200);
    const executed = (await executeResponse.json()) as { steps: Array<{ ok: boolean }> };
    expect(Array.isArray(executed.steps)).toBe(true);
    expect(executed.steps.length).toBeGreaterThan(0);

    const traceResponse = await fetch(`${baseUrl}/api/agi/trace/${planned.traceId}`);
    expect(traceResponse.status).toBe(200);
    const tracePayload = (await traceResponse.json()) as { steps?: unknown[] };
    expect(Array.isArray(tracePayload.steps)).toBe(true);
    expect((tracePayload.steps ?? []).length).toBeGreaterThan(0);

    const missingResponse = await fetch(`${baseUrl}/api/agi/trace/trace-missing`);
    expect(missingResponse.status).toBe(404);
  });

  it("stores and returns prediction_vs_observation ledger traces", async () => {
    const createResponse = await fetch(`${baseUrl}/api/agi/training-trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "toe-005-trace",
        pass: true,
        signal: {
          kind: "casimir_verification",
          ladder: { tier: "diagnostic" },
        },
        predictionObservationLedger: {
          kind: "prediction_vs_observation",
          version: 1,
          entries: [
            {
              metric: "thetaCal",
              prediction: 0.023,
              observation: 0.019,
              delta: -0.004,
              absoluteError: 0.004,
              relativeError: 0.173913,
              confidence: 0.82,
              uncertainty: {
                predictionStdDev: 0.003,
                observationStdDev: 0.002,
                combinedStdDev: 0.0036,
              },
              trend: {
                window: "last_32",
                sampleCount: 32,
                drift: -0.0009,
                bias: -0.0012,
                mae: 0.0031,
                rmse: 0.0036,
              },
              gateTuning: {
                thresholdKey: "theta_max",
                trendMetric: "bias",
                adjustmentHint: "tighten_if_bias_persists",
              },
            },
          ],
          trendRollup: {
            window: "last_32",
            sampleCount: 32,
            drift: -0.0009,
            bias: -0.0012,
            mae: 0.0031,
            rmse: 0.0036,
          },
        },
      }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as {
      trace: { id: string; predictionObservationLedger?: { kind?: string; entries?: unknown[] } };
    };
    expect(created.trace.predictionObservationLedger?.kind).toBe("prediction_vs_observation");
    expect(Array.isArray(created.trace.predictionObservationLedger?.entries)).toBe(true);

    const readResponse = await fetch(`${baseUrl}/api/agi/training-trace/${created.trace.id}`);
    expect(readResponse.status).toBe(200);
    const readPayload = (await readResponse.json()) as {
      trace?: { predictionObservationLedger?: { trendRollup?: { bias?: number } } };
    };
    expect(readPayload.trace?.predictionObservationLedger?.trendRollup?.bias).toBeCloseTo(-0.0012);
  });

});
