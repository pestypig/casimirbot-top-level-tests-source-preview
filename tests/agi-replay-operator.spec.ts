import { describe, it, expect, vi, beforeEach } from "vitest";

const getTrainingTraceExport = vi.fn();
const recordTrainingTrace = vi.fn();
const evaluateTrajectoryGates = vi.fn();
const collectRefinerySummary = vi.fn();

vi.mock("../server/services/observability/training-trace-store", () => ({
  getTrainingTraceExport,
  recordTrainingTrace,
}));

vi.mock("../server/services/agi/refinery-gates", () => ({
  evaluateTrajectoryGates,
}));

vi.mock("../server/services/agi/refinery-summary", () => ({
  collectRefinerySummary,
}));

describe("agi replay operator surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectRefinerySummary.mockReturnValue({
      total: 3,
      accepted: 2,
      acceptanceRate: 2 / 3,
      avgTokens: 120,
    });
  });

  it("parses legacy and operator options", async () => {
    const { parseArgs } = await import("../scripts/agi-replay");
    const parsed = parseArgs([
      "--limit",
      "20",
      "--tenant",
      "tenant-1",
      "--force",
      "--no-emit",
      "--from-seq",
      "7",
      "--from-trace",
      "trace-7",
      "--step",
      "--stop-on-first-fail",
      "--stop-on-verdict",
      "fail",
      "--speed",
      "3",
    ]);

    expect(parsed).toMatchObject({
      limit: 20,
      tenantId: "tenant-1",
      force: true,
      emit: false,
      fromSeq: 7,
      fromTraceId: "trace-7",
      step: true,
      stopOnFirstFail: true,
      stopOnVerdict: "fail",
      speed: 3,
    });
  });

  it("replays deterministically by sequence and emits nav delta diffs", async () => {
    getTrainingTraceExport.mockReturnValue([
      {
        kind: "training-trace",
        version: 1,
        id: "30",
        seq: 30,
        ts: "2024-01-01T00:00:30.000Z",
        traceId: "movement-1",
        pass: true,
        deltas: [],
        payload: {
          kind: "movement_episode",
          data: {
            episodeId: "ep-1",
            primitivePath: ["sense"],
            provenanceClass: "robotics.demonstration",
            sensorChannelCoverage: ["camera.rgb"],
            certificateRefs: ["cert-1"],
            metrics: { optimism: 0.8, entropy: 0.2 },
            events: [{ phase: "compare", ts: "2024-01-01T00:00:30.000Z", predictedDelta: 0.2, actualDelta: 0.35 }],
          },
        },
      },
      {
        kind: "training-trace",
        version: 1,
        id: "10",
        seq: 10,
        ts: "2024-01-01T00:00:10.000Z",
        traceId: "traj-1",
        pass: true,
        deltas: [],
        payload: {
          kind: "trajectory",
          data: { id: "traj-1", traceId: "traj-1", E: [] },
        },
      },
      {
        kind: "training-trace",
        version: 1,
        id: "20",
        seq: 20,
        ts: "2024-01-01T00:00:20.000Z",
        traceId: "traj-2",
        pass: true,
        deltas: [],
        payload: {
          kind: "trajectory",
          data: { id: "traj-2", traceId: "traj-2", E: [] },
        },
      },
    ]);

    evaluateTrajectoryGates
      .mockReturnValueOnce({ accepted: true, createdAt: "2024-01-01T00:00:11.000Z", gates: [] })
      .mockReturnValueOnce({ accepted: false, createdAt: "2024-01-01T00:00:21.000Z", gates: [] });

    const { runReplay } = await import("../scripts/agi-replay");
    const result = runReplay({ emit: false, stopOnVerdict: "fail", speed: 4, fromSeq: 10 });

    expect(evaluateTrajectoryGates).toHaveBeenCalledTimes(2);
    expect(evaluateTrajectoryGates.mock.calls[0]?.[0]?.traceId).toBe("traj-1");
    expect(evaluateTrajectoryGates.mock.calls[1]?.[0]?.traceId).toBe("traj-2");
    expect((result as { stopReason: string }).stopReason).toBe("verdict");

    const nav = (result as { navDeltaDiff: Array<{ navDeltaDiff: number; seq: number }> }).navDeltaDiff;
    expect(nav).toHaveLength(1);
    expect(nav[0]?.seq).toBe(30);
    expect(nav[0]?.navDeltaDiff).toBeCloseTo(0.15, 8);
  });
});
