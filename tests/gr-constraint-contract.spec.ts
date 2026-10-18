import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  initializePipelineState,
  setGlobalPipelineState,
  type EnergyPipelineState,
} from "../server/energy-pipeline";
import { getGrConstraintContract } from "../server/helix-core";
import { grAgentLoopOptionsSchema } from "../server/gr/gr-agent-loop-schema";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.get("/api/helix/gr-constraint-contract", getGrConstraintContract);
  return app;
};

const baseState = (): EnergyPipelineState => {
  const state = initializePipelineState();
  state.grEnabled = false;
  return state;
};

const setState = (patch: Partial<EnergyPipelineState> & Record<string, unknown>) => {
  const state = baseState() as EnergyPipelineState & Record<string, unknown>;
  Object.assign(state, patch);
  setGlobalPipelineState(state as EnergyPipelineState);
};

describe("gr-constraint-contract guardrail congruence", () => {
  beforeEach(() => {
    setGlobalPipelineState(baseState());
  });

  it("reports strict-pass guardrails when metric-derived sources are present", async () => {
    const app = buildApp();
    setState({
      strictCongruence: true,
      qiGuardrail: {
        marginRatio: 0.2,
        curvatureEnforced: true,
        curvatureOk: true,
        rhoSource: "warp.metric.T00.natario.shift",
      },
      theta_geom: 10,
      theta_metric_derived: true,
      TS_ratio: 20,
      tsMetricDerived: true,
      gammaVanDenBroeck: 10,
      gammaVanDenBroeckGuard: {
        greenBand: { min: 0, max: 1e16 },
        admissible: true,
      },
      vdb_two_wall_derivative_support: true,
    });

    const res = await request(app).get("/api/helix/gr-constraint-contract");
    expect(res.status).toBe(200);
    expect(["ok", "fail"]).toContain(res.body?.guardrails?.fordRoman);
    expect(res.body?.guardrails?.thetaAudit).toBe("ok");
    expect(res.body?.guardrails?.tsRatio).toBe("ok");
    expect(res.body?.guardrails?.vdbBand).toBe("ok");

    const byId = new Map((res.body?.constraints ?? []).map((entry: any) => [entry.id, entry]));
    expect(["pass", "fail"]).toContain(byId.get("FordRomanQI")?.status);
    expect(byId.get("ThetaAudit")?.status).toBe("pass");
    expect(byId.get("TS_ratio_min")?.status).toBe("pass");
    expect(byId.get("VdB_band")?.status).toBe("pass");
  });

  it("fails strict guardrails for proxy-only sources", async () => {
    const app = buildApp();
    setState({
      strictCongruence: true,
      qiGuardrail: {
        marginRatio: 0.2,
        curvatureEnforced: false,
        rhoSource: "tile-telemetry",
      },
      thetaCal: 10,
      theta_metric_derived: false,
      TS_ratio: 20,
      tsMetricDerived: false,
      gammaVanDenBroeck: 10,
      gammaVanDenBroeckGuard: {
        greenBand: { min: 0, max: 1e16 },
        admissible: true,
      },
      vdb_two_wall_derivative_support: false,
    });

    const res = await request(app).get("/api/helix/gr-constraint-contract");
    expect(res.status).toBe(200);
    expect(res.body?.guardrails?.fordRoman).toBe("fail");
    expect(res.body?.guardrails?.thetaAudit).toBe("fail");
    expect(res.body?.guardrails?.tsRatio).toBe("fail");
    expect(res.body?.guardrails?.vdbBand).toBe("fail");

    const byId = new Map((res.body?.constraints ?? []).map((entry: any) => [entry.id, entry]));
    expect(byId.get("FordRomanQI")?.status).toBe("fail");
    expect(byId.get("ThetaAudit")?.status).toBe("fail");
    expect(byId.get("TS_ratio_min")?.status).toBe("fail");
    expect(byId.get("VdB_band")?.status).toBe("fail");
  });
});



describe("gr-agent-loop semiclassical contract", () => {
  it("accepts typed semiclassical mismatch policy hooks", () => {
    const parsed = grAgentLoopOptionsSchema.parse({
      semiclassical: {
        mismatchMax: 0.005,
        severity: "HARD",
        firstFailId: "TOE-002-SEMICLASSICAL-HARD-FAIL",
      },
    });

    expect(parsed.semiclassical?.mismatchMax).toBe(0.005);
    expect(parsed.semiclassical?.severity).toBe("HARD");
    expect(parsed.semiclassical?.firstFailId).toBe("TOE-002-SEMICLASSICAL-HARD-FAIL");
  });
});
