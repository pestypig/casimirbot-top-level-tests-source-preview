import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runCalculatorMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    decisionClass: "candidate_pass_found",
    congruentSolvePass: true,
    marginRatioRaw: 0.33,
    marginRatioRawComputed: 0.33,
    outPath: "artifacts/research/full-solve/g4-calculator-2026-03-01.json",
  })),
);

vi.mock("../scripts/warp-full-solve-calculator.js", () => ({
  runWarpFullSolveCalculator: (...args: unknown[]) => runCalculatorMock(...args),
}));

import { warpViabilityRouter } from "../server/routes/warp-viability";

describe("warp-full-solve calculator route", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/physics/warp", warpViabilityRouter);
    return app;
  };

  beforeEach(() => {
    runCalculatorMock.mockClear();
  });

  it("GET /calculator returns deterministic calculator payload without persisting artifacts", async () => {
    const app = buildApp();
    const response = await request(app).get("/api/physics/warp/calculator").expect(200);

    expect(response.body?.ok).toBe(true);
    expect(response.body?.decisionClass).toBe("candidate_pass_found");
    expect(runCalculatorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        writeOutput: false,
      }),
    );
  });

  it("POST /calculator forwards deterministic input payload and persist flag", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/physics/warp/calculator")
      .send({
        persist: true,
        outPath: "artifacts/research/full-solve/custom-calculator.json",
        injectCurvatureSignals: false,
        inputPayload: {
          label: "api-profile",
          params: {
            warpFieldType: "natario",
            gammaGeo: 2,
          },
        },
      })
      .expect(200);

    expect(response.body?.ok).toBe(true);
    expect(runCalculatorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        writeOutput: true,
        injectCurvatureSignals: false,
        inputPayload: expect.objectContaining({
          label: "api-profile",
        }),
      }),
    );
  });

  it("POST /calculator rejects outPath outside artifacts root when persist=true", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/physics/warp/calculator")
      .send({
        persist: true,
        outPath: "../outside-root.json",
      })
      .expect(400);

    expect(response.body?.error).toBe("invalid_out_path");
    expect(runCalculatorMock).not.toHaveBeenCalled();
  });
});
