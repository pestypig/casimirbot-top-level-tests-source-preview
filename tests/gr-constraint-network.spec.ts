import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunInitialDataSolve = vi.fn();
const mockBuildBssnRhs = vi.fn(() => ({ mock: true }));
const mockEvolveBssn = vi.fn(() => ({}));
const mockComputeBssnConstraints = vi.fn();

vi.mock("../server/gr/evolution/index.js", () => ({
  runInitialDataSolve: (...args: unknown[]) => mockRunInitialDataSolve(...args),
  buildBssnRhs: (...args: unknown[]) => mockBuildBssnRhs(...args),
  evolveBssn: (...args: unknown[]) => mockEvolveBssn(...args),
  computeBssnConstraints: (...args: unknown[]) =>
    mockComputeBssnConstraints(...args),
}));

import { runGrConstraintNetwork4d } from "../server/gr/gr-constraint-network";

type ConstraintFields = {
  H: Float32Array;
  Mx: Float32Array;
  My: Float32Array;
  Mz: Float32Array;
};

const makeConstraints = (h: number, m: number): ConstraintFields => ({
  H: new Float32Array([h, h]),
  Mx: new Float32Array([m, m]),
  My: new Float32Array([0, 0]),
  Mz: new Float32Array([0, 0]),
});

const makeInitial = (status: "CERTIFIED" | "NOT_CERTIFIED") => ({
  grid: {
    dims: [2, 2, 2] as [number, number, number],
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    spacing: [1, 1, 1] as [number, number, number],
  },
  state: {},
  constraints: makeConstraints(0.01, 0.001),
  solver: {
    status,
    iterations: 2,
    residual: 0.01,
    tolerance: 0,
    converged: status === "CERTIFIED",
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gr constraint network 4d", () => {
  it("records series and summarizes peak/final metrics", () => {
    mockRunInitialDataSolve.mockReturnValueOnce(makeInitial("CERTIFIED"));
    mockComputeBssnConstraints
      .mockReturnValueOnce(makeConstraints(0.03, 0.002))
      .mockReturnValueOnce(makeConstraints(0.02, 0.0015));

    const result = runGrConstraintNetwork4d({
      steps: 2,
      dt_s: 0.1,
      thresholds: {
        H_rms_max: 1,
        M_rms_max: 1,
        H_maxAbs_max: 1,
        M_maxAbs_max: 1,
      },
    });

    expect(result.series.length).toBe(3);
    expect(result.summary.max.H_rms).toBeCloseTo(0.03, 6);
    expect(result.summary.final.H_rms).toBeCloseTo(0.02, 6);
    expect(result.summary.trend.H_rms).toBeCloseTo(0.005, 6);
    expect(result.pass).toBe(true);
  });

  it("can omit the series when includeSeries is false", () => {
    mockRunInitialDataSolve.mockReturnValueOnce(makeInitial("CERTIFIED"));
    mockComputeBssnConstraints.mockReturnValueOnce(makeConstraints(0.02, 0.001));

    const result = runGrConstraintNetwork4d({
      steps: 1,
      includeSeries: false,
      thresholds: {
        H_rms_max: 1,
        M_rms_max: 1,
        H_maxAbs_max: 1,
        M_maxAbs_max: 1,
      },
    });

    expect(result.series.length).toBe(0);
  });

  it("fails when initial data is not certified", () => {
    mockRunInitialDataSolve.mockReturnValueOnce(makeInitial("NOT_CERTIFIED"));

    const result = runGrConstraintNetwork4d({
      steps: 0,
      thresholds: {
        H_rms_max: 1,
        M_rms_max: 1,
        H_maxAbs_max: 1,
        M_maxAbs_max: 1,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.notes?.[0]).toContain("Initial data solve");
  });
});
