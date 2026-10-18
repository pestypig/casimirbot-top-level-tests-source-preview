import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrEvaluation } from "../shared/schema";

const baseState = {
  hull: { Lx_m: 10, Ly_m: 10, Lz_m: 10, wallThickness_m: 1 },
  dutyCycle: 0.1,
  gammaGeo: 2,
  gammaVanDenBroeck: 3,
  qSpoilingFactor: 1,
  phase01: 0.1,
  zeta: 0.9,
};

const {
  mockBuildGrRequestPayload,
  mockEvaluateQiGuardrail,
  mockGetGlobalPipelineState,
  mockResolveBubbleRadiusM,
  mockSetGlobalPipelineState,
  mockUpdateParameters,
  mockRunInitialDataSolve,
  mockBuildGrEvolveBrick,
  mockBuildGrDiagnostics,
  mockRunGrEvaluation,
} = vi.hoisted(() => ({
  mockBuildGrRequestPayload: vi.fn(() => ({ mocked: true })),
  mockEvaluateQiGuardrail: vi.fn(() => ({
    marginRatioRaw: 1,
    marginRatioRawComputed: 1,
    lhs_Jm3: -1,
    bound_Jm3: -1,
    rhoSource: "warp.metric.T00.natario.shift",
  })),
  mockGetGlobalPipelineState: vi.fn(),
  mockResolveBubbleRadiusM: vi.fn((state: any, fallback?: number) => {
    const bubbleRadius = Number(state?.bubble?.R ?? state?.R);
    if (Number.isFinite(bubbleRadius) && bubbleRadius > 0) return bubbleRadius;
    return fallback ?? 1;
  }),
  mockSetGlobalPipelineState: vi.fn(),
  mockUpdateParameters: vi.fn(async (state: any, params: any) => ({
    ...state,
    ...(params ?? {}),
  })),
  mockRunInitialDataSolve: vi.fn(),
  mockBuildGrEvolveBrick: vi.fn(),
  mockBuildGrDiagnostics: vi.fn(() => ({})),
  mockRunGrEvaluation: vi.fn(),
}));

vi.mock("../server/energy-pipeline.js", () => ({
  buildGrRequestPayload: mockBuildGrRequestPayload,
  evaluateQiGuardrail: mockEvaluateQiGuardrail,
  getGlobalPipelineState: mockGetGlobalPipelineState,
  resolveBubbleRadiusM: mockResolveBubbleRadiusM,
  setGlobalPipelineState: mockSetGlobalPipelineState,
  updateParameters: mockUpdateParameters,
}));

vi.mock("../server/gr/evolution/index.js", () => ({
  runInitialDataSolve: mockRunInitialDataSolve,
}));

vi.mock("../server/gr-evolve-brick.js", () => ({
  buildGrEvolveBrick: mockBuildGrEvolveBrick,
  buildGrDiagnostics: mockBuildGrDiagnostics,
}));

vi.mock("../server/gr/gr-evaluation.js", () => ({
  runGrEvaluation: mockRunGrEvaluation,
}));

import { runGrAgentLoop } from "../server/gr/gr-agent-loop";

const makeEvaluation = (pass: boolean): GrEvaluation => ({
  kind: "gr-evaluation",
  updatedAt: Date.now(),
  policy: {
    gate: {
      version: 1,
      source: "default",
      thresholds: { H_rms_max: 1, M_rms_max: 1 },
      policy: { mode: "hard-only", unknownAsFail: true },
    },
    certificate: {
      admissibleStatus: "ADMISSIBLE",
      allowMarginalAsViable: false,
      treatMissingCertificateAsNotCertified: true,
    },
  },
  residuals: {
    H_rms: 0.01,
    M_rms: 0.02,
    H_maxAbs: 0.1,
    M_maxAbs: 0.2,
  },
  gate: {
    status: pass ? "pass" : "fail",
    evaluatedAt: Date.now(),
    thresholds: { H_rms_max: 1, M_rms_max: 1 },
    policy: { mode: "hard-only", unknownAsFail: true },
  },
  constraints: [],
  certificate: {
    status: pass ? "ADMISSIBLE" : "REJECTED",
    admissibleStatus: "ADMISSIBLE",
    hasCertificate: true,
    certificateHash: null,
    certificateId: null,
    integrityOk: true,
  },
  pass,
});

const makeInitial = (status: "CERTIFIED" | "NOT_CERTIFIED") => {
  const grid = {
    dims: [2, 2, 2] as [number, number, number],
    spacing: [1, 1, 1] as [number, number, number],
    bounds: {
      min: [-1, -1, -1] as [number, number, number],
      max: [1, 1, 1] as [number, number, number],
    },
  };
  return {
    grid,
    state: { grid } as any,
    matter: null,
    constraints: {} as any,
    solver: {
      status,
      iterations: 1,
      residual: 0.001,
      tolerance: 0,
      converged: status === "CERTIFIED",
      reason: status === "CERTIFIED" ? "converged" : "max-iterations",
    },
  } as any;
};

const makeEvolve = () =>
  ({
    dt_s: 0.01,
    stats: {
      steps: 1,
      H_rms: 0.01,
      M_rms: 0.02,
      cfl: 0.1,
    },
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetGlobalPipelineState.mockReturnValue({ ...baseState });
  mockRunInitialDataSolve.mockReturnValue(makeInitial("CERTIFIED"));
  mockBuildGrEvolveBrick.mockReturnValue(makeEvolve());
  mockRunGrEvaluation.mockResolvedValue({
    evaluation: makeEvaluation(true),
    certificate: {} as any,
    integrityOk: true,
  });
});

describe("gr agent loop gate", () => {
  it("accepts when evaluation passes and initial is certified", async () => {
    const initial = makeInitial("CERTIFIED");
    mockRunInitialDataSolve.mockReturnValueOnce(initial);
    const result = await runGrAgentLoop({
      maxIterations: 1,
      proposals: [{ label: "baseline", params: {} }],
      commitAccepted: false,
    });
    expect(result.accepted).toBe(true);
    expect(result.state).toBe("accepted");
    expect(result.acceptedIteration).toBe(0);
    expect(result.attempts[0]?.accepted).toBe(true);
    expect(mockBuildGrEvolveBrick).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: initial.state,
        matter: initial.matter,
      }),
    );
  });

  it("keeps invariants enabled in ci fast-path for applicability diagnostics", async () => {
    await runGrAgentLoop({
      maxIterations: 1,
      proposals: [{ label: "baseline", params: {} }],
      commitAccepted: false,
      ciFastPath: true,
    });
    expect(mockBuildGrEvolveBrick).toHaveBeenCalledWith(
      expect.objectContaining({
        includeExtra: true,
        includeMatter: false,
        includeKij: false,
        includeInvariants: true,
      }),
    );
    expect(mockRunGrEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        useDiagnosticsSnapshot: true,
      }),
    );
  });

  it("rejects when evaluation fails", async () => {
    mockRunGrEvaluation.mockResolvedValueOnce({
      evaluation: makeEvaluation(false),
      certificate: {} as any,
      integrityOk: true,
    });
    const result = await runGrAgentLoop({
      maxIterations: 1,
      proposals: [{ label: "baseline", params: {} }],
      commitAccepted: false,
    });
    expect(result.accepted).toBe(false);
    expect(result.state).toBe("rejected");
    expect(result.acceptedIteration).toBeUndefined();
    expect(result.attempts[0]?.accepted).toBe(false);
  });

  it("rejects when initial solve is not certified", async () => {
    mockRunInitialDataSolve.mockReturnValueOnce(makeInitial("NOT_CERTIFIED"));
    const result = await runGrAgentLoop({
      maxIterations: 1,
      proposals: [{ label: "baseline", params: {} }],
      commitAccepted: false,
    });
    expect(result.accepted).toBe(false);
    expect(result.state).toBe("rejected");
    expect(result.acceptedIteration).toBeUndefined();
    expect(result.attempts[0]?.accepted).toBe(false);
  });
});
