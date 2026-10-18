import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getGlobalPipelineState,
  initializePipelineState,
  setGlobalPipelineState,
  type EnergyPipelineState,
} from "../server/energy-pipeline";
import { getLatticeProbe } from "../server/helix-core";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.get("/api/helix/lattice-probe", getLatticeProbe);
  return app;
};

const baseState = (): EnergyPipelineState => {
  const state = initializePipelineState();
  // Keep probe payload minimal for test speed.
  state.grEnabled = false;
  return state;
};

const setState = (patch: Partial<EnergyPipelineState> & Record<string, unknown>) => {
  const state = baseState() as EnergyPipelineState & Record<string, unknown>;
  Object.assign(state, patch);
  setGlobalPipelineState(state as EnergyPipelineState);
};

const runProbe = async (app: express.Express) =>
  request(app).get(
    "/api/helix/lattice-probe?includeLines=0&includeNodes=0&grEnabled=0&div=1",
  );

describe("lattice probe guardrails (strict congruence)", () => {
  beforeEach(() => {
    setGlobalPipelineState(baseState());
  });

  it("fails hard guardrails in strict mode when metric-derived sources are missing", async () => {
    const app = buildApp();
    setState({
      strictCongruence: true,
      TS_ratio: 12,
      tsMetricDerived: false,
      theta_audit: 1e3,
      theta_metric_derived: false,
      qiGuardrail: {
        marginRatio: 0.5,
        curvatureEnforced: false,
        rhoSource: "tile-telemetry",
      },
      gammaVanDenBroeck: 10,
      gammaVanDenBroeckGuard: {
        limit: 1e16,
        greenBand: { min: 0, max: 1e16 },
        pocketRadius_m: 1e-6,
        pocketThickness_m: 1e-6,
        planckMargin: 1e6,
        admissible: true,
        reason: "test",
      },
      vdb_two_wall_derivative_support: false,
    });

    const res = await runProbe(app);
    expect(res.status).toBe(200);
    expect(res.body?.activation?.guardrails?.fordRoman).toBe("fail");
    expect(res.body?.activation?.guardrails?.thetaAudit).toBe("fail");
    expect(res.body?.activation?.guardrails?.tsRatio).toBe("fail");
    expect(res.body?.activation?.guardrails?.vdbBand).toBe("fail");
  });

  it("reports proxy guardrails in relaxed mode for non-metric sources", async () => {
    const app = buildApp();
    setState({
      strictCongruence: false,
      TS_ratio: 12,
      tsMetricDerived: false,
      theta_audit: 1e3,
      theta_metric_derived: false,
      qiGuardrail: {
        marginRatio: 0.5,
        curvatureEnforced: false,
        rhoSource: "tile-telemetry",
      },
      gammaVanDenBroeck: 10,
      gammaVanDenBroeckGuard: {
        limit: 1e16,
        greenBand: { min: 0, max: 1e16 },
        pocketRadius_m: 1e-6,
        pocketThickness_m: 1e-6,
        planckMargin: 1e6,
        admissible: true,
        reason: "test",
      },
      vdb_two_wall_derivative_support: false,
    });

    const res = await runProbe(app);
    expect(res.status).toBe(200);
    expect(res.body?.activation?.guardrails?.fordRoman).toBe("proxy");
    expect(res.body?.activation?.guardrails?.thetaAudit).toBe("proxy");
    expect(res.body?.activation?.guardrails?.tsRatio).toBe("proxy");
    expect(res.body?.activation?.guardrails?.vdbBand).toBe("proxy");
  });

  it("passes strict guardrails when metric-derived sources and derivatives are present", async () => {
    const app = buildApp();
    setState({
      strictCongruence: true,
      TS_ratio: 25,
      tsMetricDerived: true,
      theta_audit: 10,
      theta_metric_derived: true,
      qiGuardrail: {
        marginRatio: 0.2,
        curvatureEnforced: true,
        curvatureOk: true,
        rhoSource: "warp.metric.T00.natario.shift",
      },
      gammaVanDenBroeck: 10,
      gammaVanDenBroeckGuard: {
        limit: 1e16,
        greenBand: { min: 0, max: 1e16 },
        pocketRadius_m: 1e-6,
        pocketThickness_m: 1e-6,
        planckMargin: 1e6,
        admissible: true,
        reason: "test",
      },
      vdb_two_wall_derivative_support: true,
    });

    const res = await runProbe(app);
    expect(res.status).toBe(200);
    expect(res.body?.activation?.guardrails?.fordRoman).toBe("ok");
    expect(res.body?.activation?.guardrails?.thetaAudit).toBe("ok");
    expect(res.body?.activation?.guardrails?.tsRatio).toBe("ok");
    expect(res.body?.activation?.guardrails?.vdbBand).toBe("ok");
    expect(res.body?.activation?.guardrails?.hardPass).toBe(true);
  });

  it("honors VdB derivative requirement only when gammaVdB exceeds 1", async () => {
    const app = buildApp();
    setState({
      strictCongruence: true,
      TS_ratio: 25,
      tsMetricDerived: true,
      theta_audit: 10,
      theta_metric_derived: true,
      qiGuardrail: {
        marginRatio: 0.2,
        curvatureEnforced: false,
        rhoSource: "warp.metric.T00.natario.shift",
      },
      gammaVanDenBroeck: 1,
      gammaVanDenBroeckGuard: {
        limit: 1e16,
        greenBand: { min: 0, max: 1e16 },
        pocketRadius_m: 1e-6,
        pocketThickness_m: 1e-6,
        planckMargin: 1e6,
        admissible: true,
        reason: "test",
      },
      vdb_two_wall_derivative_support: false,
    });

    const res = await runProbe(app);
    expect(res.status).toBe(200);
    expect(res.body?.activation?.guardrails?.vdbBand).toBe("ok");
  });

  it("blocks legacy FordRoman boolean fallback in strict mode", async () => {
    const app = buildApp();
    setState({
      strictCongruence: true,
      TS_ratio: 25,
      tsMetricDerived: true,
      theta_audit: 10,
      theta_metric_derived: true,
      qiGuardrail: undefined,
      fordRomanCompliance: true,
      gammaVanDenBroeck: 1,
      gammaVanDenBroeckGuard: {
        limit: 1e16,
        greenBand: { min: 0, max: 1e16 },
        pocketRadius_m: 1e-6,
        pocketThickness_m: 1e-6,
        planckMargin: 1e6,
        admissible: true,
        reason: "test",
      },
      vdb_two_wall_derivative_support: true,
    });

    const res = await runProbe(app);
    expect(res.status).toBe(200);
    expect(res.body?.activation?.guardrails?.fordRoman).toBe("fail");
  });
});
