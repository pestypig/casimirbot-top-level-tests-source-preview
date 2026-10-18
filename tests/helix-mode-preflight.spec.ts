import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  initializePipelineState,
  setGlobalPipelineState,
  type EnergyPipelineState,
} from "../server/energy-pipeline";
import { switchOperationalMode } from "../server/helix-core";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.post("/api/helix/pipeline/mode", switchOperationalMode);
  return app;
};

const setState = (patch: Partial<EnergyPipelineState> & Record<string, unknown>) => {
  const state = initializePipelineState() as EnergyPipelineState &
    Record<string, unknown>;
  Object.assign(state, patch);
  setGlobalPipelineState(state as EnergyPipelineState);
};

describe("helix mode transition preflight", () => {
  beforeEach(() => {
    setGlobalPipelineState(initializePipelineState());
  });

  it("keeps requested mode when preflight passes", async () => {
    const app = buildApp();
    setState({ fordRomanCompliance: true, natarioConstraint: true });

    const res = await request(app)
      .post("/api/helix/pipeline/mode")
      .send({ mode: "taxi" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe("taxi");
    expect(res.body.fallbackApplied).toBe(false);
    expect(res.body.preflight?.required).toBe(true);
    expect(res.body.preflight?.ok).toBe(true);
  });

  it("auto-falls back on first hard preflight failure", async () => {
    const app = buildApp();
    setState({ fordRomanCompliance: false, natarioConstraint: false });

    const res = await request(app)
      .post("/api/helix/pipeline/mode")
      .send({ mode: "cruise" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requestedMode).toBe("cruise");
    expect(res.body.mode).toBe("emergency");
    expect(res.body.fallbackApplied).toBe(true);
    expect(res.body.preflight?.ok).toBe(false);
    expect(res.body.preflight?.firstFail).toBe("FordRomanQI");
  });
});

