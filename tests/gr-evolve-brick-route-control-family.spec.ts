import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { getGrEvolveBrick } from "../server/helix-core";

const hashBase64Float32 = (base64: string) => {
  const bytes = Buffer.from(base64, "base64");
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
};

const parseRawHeader = (body: Buffer) => {
  const headerLength = body.readUInt32LE(0);
  const headerStart = 4;
  const headerEnd = headerStart + headerLength;
  return JSON.parse(body.subarray(headerStart, headerEnd).toString("utf8"));
};

const createApp = () => {
  const app = express();
  app.get("/api/helix/gr-evolve-brick", getGrEvolveBrick);
  return app;
};

describe("gr-evolve-brick route control-family propagation", () => {
  const commonQuery =
    "quality=low&dims=8,8,8&initialIterations=1&initialTolerance=1e-3&format=json&dt_s=0.01&steps=2&iterations=1&metricT00=-1&metricT00Source=metric";

  it("keeps source + stress-energy mapping evidence in JSON responses for control refs", async () => {
    const app = createApp();
    const response = await request(app)
      .get(
        `/api/helix/gr-evolve-brick?${commonQuery}&metricT00Ref=warp.metric.T00.alcubierre.analytic&warpFieldType=alcubierre`,
      )
      .expect(200);

    const mapping = response.body?.stats?.stressEnergy?.mapping;
    expect(response.body?.source).toBe("metric");
    expect(mapping?.family_id).toBe("alcubierre_control");
    expect(mapping?.metricT00Ref).toBe("warp.metric.T00.alcubierre.analytic");
    expect(mapping?.warpFieldType).toBe("alcubierre");
    expect(mapping?.source_branch).toBe("metric_t00_ref");
    expect(mapping?.shape_function_id).toBe("alcubierre_longitudinal_shell_v1");
  });

  it("preserves source + mapping parity in raw header output", async () => {
    const app = createApp();
    const response = await request(app)
      .get(
          `/api/helix/gr-evolve-brick?quality=low&dims=8,8,8&initialIterations=1&initialTolerance=1e-3&format=raw&dt_s=0.01&steps=2&iterations=1&metricT00=-1&metricT00Source=metric&metricT00Ref=warp.metric.T00.natario.shift&warpFieldType=natario`,
      )
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const header = parseRawHeader(response.body);
    expect(header?.source).toBe("metric");
    expect(header?.stats?.stressEnergy?.mapping?.family_id).toBe("natario_control");
    expect(header?.stats?.stressEnergy?.mapping?.metricT00Ref).toBe(
      "warp.metric.T00.natario.shift",
    );
    expect(header?.stats?.stressEnergy?.mapping?.warpFieldType).toBe("natario");
    expect(header?.stats?.stressEnergy?.mapping?.source_branch).toBe("metric_t00_ref");
    expect(header?.stats?.stressEnergy?.mapping?.shape_function_id).toBe("natario_shift_shell_v1");
  });

  it("keeps route-level control evidence explicit even when downstream hashes collide", async () => {
    const app = createApp();
    const [alcubierre, natario] = await Promise.all([
      request(app)
        .get(
          `/api/helix/gr-evolve-brick?${commonQuery}&metricT00Ref=warp.metric.T00.alcubierre.analytic&warpFieldType=alcubierre`,
        )
        .expect(200),
      request(app)
        .get(
          `/api/helix/gr-evolve-brick?${commonQuery}&metricT00Ref=warp.metric.T00.natario.shift&warpFieldType=natario`,
        )
        .expect(200),
    ]);

    const alcThetaHash = hashBase64Float32(alcubierre.body.channels.theta.data);
    const natThetaHash = hashBase64Float32(natario.body.channels.theta.data);
    const alcKTraceHash = hashBase64Float32(alcubierre.body.channels.K_trace.data);
    const natKTraceHash = hashBase64Float32(natario.body.channels.K_trace.data);
    expect(alcubierre.body?.stats?.stressEnergy?.mapping?.family_id).toBe("alcubierre_control");
    expect(natario.body?.stats?.stressEnergy?.mapping?.family_id).toBe("natario_control");
    expect(alcubierre.body?.stats?.stressEnergy?.mapping?.source_branch).toBe("metric_t00_ref");
    expect(natario.body?.stats?.stressEnergy?.mapping?.source_branch).toBe("metric_t00_ref");
    expect(alcThetaHash.length).toBeGreaterThan(0);
    expect(natThetaHash.length).toBeGreaterThan(0);
    expect(alcKTraceHash.length).toBeGreaterThan(0);
    expect(natKTraceHash.length).toBeGreaterThan(0);
  });
});
