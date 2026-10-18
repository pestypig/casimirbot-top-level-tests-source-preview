import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildGrEvolveBrick, serializeGrEvolveBrick } from "../server/gr-evolve-brick";

const hashChannel = (data: Float32Array) =>
  `sha256:${crypto.createHash("sha256").update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest("hex")}`;

describe("gr-evolve brick control-family propagation", () => {
  const baseParams = {
    dims: [12, 12, 12] as [number, number, number],
    bounds: {
      min: [-503.5, -132, -86.5] as [number, number, number],
      max: [503.5, 132, 86.5] as [number, number, number],
    },
    dt_s: 0.01,
    steps: 2,
    iterations: 1,
    includeExtra: true,
    unitSystem: "geometric" as const,
  };

  it("emits non-null stress-energy mapping evidence for control refs", () => {
    const brick = buildGrEvolveBrick({
      ...baseParams,
      sourceParams: {
        metricT00: -1,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.alcubierre.analytic",
        warpFieldType: "alcubierre",
      },
    });
    const payload = serializeGrEvolveBrick(brick);
    expect(payload.source).toBe("metric");
    expect(payload.stats.stressEnergy?.mapping).toBeDefined();
    expect(payload.stats.stressEnergy?.mapping?.family_id).toBe("alcubierre_control");
    expect(payload.stats.stressEnergy?.mapping?.metricT00Ref).toBe("warp.metric.T00.alcubierre.analytic");
    expect(payload.stats.stressEnergy?.mapping?.warpFieldType).toBe("alcubierre");
    expect(payload.stats.stressEnergy?.mapping?.source_branch).toBe("metric_t00_ref");
    expect(payload.stats.stressEnergy?.mapping?.shape_function_id).toBe("alcubierre_longitudinal_shell_v1");
  });

  it("diverges control families in theta or K_trace hashes under matched numeric settings", () => {
    const commonParams = {
      ...baseParams,
      sourceParams: {
        metricT00: -1,
        metricT00Source: "metric",
      },
    };
    const alcubierre = buildGrEvolveBrick({
      ...commonParams,
      sourceParams: {
        ...commonParams.sourceParams,
        metricT00Ref: "warp.metric.T00.alcubierre.analytic",
        warpFieldType: "alcubierre",
      },
    });
    const natario = buildGrEvolveBrick({
      ...commonParams,
      sourceParams: {
        ...commonParams.sourceParams,
        metricT00Ref: "warp.metric.T00.natario.shift",
        warpFieldType: "natario",
      },
    });
    const alcTheta = alcubierre.channels.theta?.data;
    const natTheta = natario.channels.theta?.data;
    expect(alcTheta).toBeDefined();
    expect(natTheta).toBeDefined();
    const thetaHashesDiffer =
      alcTheta && natTheta ? hashChannel(alcTheta) !== hashChannel(natTheta) : false;
    const kTraceHashesDiffer = hashChannel(alcubierre.channels.K_trace.data) !== hashChannel(natario.channels.K_trace.data);
    expect(thetaHashesDiffer || kTraceHashesDiffer).toBe(true);
  });
});
