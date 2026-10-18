import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runVisualOrchestratorMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    runId: "warp-visual-2026-03-18T00-00-00-000Z",
    panelCount: 2,
    captures: [],
    solveCongruence: {
      source: "requested_payload",
      checked: 2,
      matched: 2,
      mismatched: 0,
      missing: 0,
      matchRatio: 1,
      mismatches: [],
    },
  })),
);

vi.mock("../server/services/warp/visual-orchestrator", () => ({
  runWarpVisualOrchestrator: (...args: unknown[]) =>
    runVisualOrchestratorMock(...args),
}));

import { warpViabilityRouter } from "../server/routes/warp-viability";

describe("warp visual orchestrator route", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/physics/warp", warpViabilityRouter);
    return app;
  };

  beforeEach(() => {
    runVisualOrchestratorMock.mockReset();
    runVisualOrchestratorMock.mockResolvedValue({
      ok: true,
      runId: "warp-visual-2026-03-18T00-00-00-000Z",
      panelCount: 2,
      captures: [],
      solveCongruence: {
        source: "requested_payload",
        checked: 2,
        matched: 2,
        mismatched: 0,
        missing: 0,
        matchRatio: 1,
        mismatches: [],
      },
    });
  });

  it("POST /visual-orchestrator/run forwards payload to orchestration service", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/physics/warp/visual-orchestrator/run")
      .send({
        solveInput: { warpFieldType: "natario_sdf", gap_nm: 8 },
        panels: ["alcubierre-viewer", "time-dilation-lattice"],
        writeArtifacts: true,
        continueOnPanelError: true,
      })
      .expect(200);

    expect(response.body?.ok).toBe(true);
    expect(runVisualOrchestratorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
        solveInput: expect.objectContaining({
          warpFieldType: "natario_sdf",
          gap_nm: 8,
        }),
        panels: ["alcubierre-viewer", "time-dilation-lattice"],
        writeArtifacts: true,
        continueOnPanelError: true,
      }),
    );
  });

  it("returns 400 when request payload violates schema", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/physics/warp/visual-orchestrator/run")
      .send({
        panels: [],
      })
      .expect(400);

    expect(response.body?.error).toBe("invalid_request");
    expect(runVisualOrchestratorMock).not.toHaveBeenCalled();
  });

  it("maps invalid outDir domain errors to 400", async () => {
    runVisualOrchestratorMock.mockRejectedValueOnce(new Error("invalid_out_dir"));
    const app = buildApp();
    const response = await request(app)
      .post("/api/physics/warp/visual-orchestrator/run")
      .send({
        solveInput: { gap_nm: 8 },
        outDir: "../outside",
      })
      .expect(400);

    expect(response.body?.error).toBe("invalid_out_dir");
  });
});
