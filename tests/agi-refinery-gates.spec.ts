import { describe, expect, it } from "vitest";
import { evaluateTrajectoryGates } from "../server/services/agi/refinery-gates";
import type { AgiTrajectory } from "../shared/agi-refinery";

const makeTrajectory = (
  overrides: Partial<AgiTrajectory> & {
    meta?: Partial<NonNullable<AgiTrajectory["meta"]>>;
    y?: AgiTrajectory["y"];
  } = {},
): AgiTrajectory => {
  const base: AgiTrajectory = {
    id: "trace-1",
    createdAt: new Date().toISOString(),
    x: "ack",
    q: [],
    E: [
      {
        kind: "doc",
        path: "docs/README.md",
      },
    ],
    y: {
      summary: "ack",
      text: "ack",
      citations: ["docs/README.md"],
    },
    meta: {
      testsRun: false,
      testsOk: true,
    },
  };
  return {
    ...base,
    ...overrides,
    meta: {
      ...base.meta,
      ...overrides.meta,
    },
    y: overrides.y ?? base.y,
  };
};

const findGate = (report: ReturnType<typeof evaluateTrajectoryGates>, name: string) =>
  report.gates.find((gate) => gate.name === name);

describe("refinery gates", () => {
  it("fails tests gate when tests are required but missing", () => {
    const report = evaluateTrajectoryGates(
      makeTrajectory({
        meta: {
          testsRequired: true,
          testsRun: false,
          testsOk: true,
        },
      }),
    );
    expect(report.accepted).toBe(false);
    expect(findGate(report, "tests")?.pass).toBe(false);
  });

  it("fails contract gate when contract is required and not satisfied", () => {
    const report = evaluateTrajectoryGates(
      makeTrajectory({
        meta: {
          contractRequired: true,
          contractOk: false,
          testsRequired: false,
        },
      }),
    );
    expect(report.accepted).toBe(false);
    expect(findGate(report, "contract")?.pass).toBe(false);
  });

  it("fails constraints gate when constraints are required and missing", () => {
    const report = evaluateTrajectoryGates(
      makeTrajectory({
        meta: {
          constraintRequired: true,
          constraintOk: false,
          testsRequired: false,
        },
      }),
    );
    expect(report.accepted).toBe(false);
    expect(findGate(report, "constraints")?.pass).toBe(false);
  });

  it("fails budget gate when token budget is exceeded", () => {
    const report = evaluateTrajectoryGates(
      makeTrajectory({
        meta: {
          tokens: 1_000_000,
          durationMs: 1000,
          testsRequired: false,
        },
      }),
    );
    expect(report.accepted).toBe(false);
    expect(findGate(report, "budget")?.pass).toBe(false);
  });

  it("flags PII without handling but allows handled redaction", () => {
    const unhandled = evaluateTrajectoryGates(
      makeTrajectory({
        y: {
          summary: "contact me at user@example.com",
          text: "contact me at user@example.com",
          citations: ["docs/README.md"],
        },
      }),
    );
    expect(findGate(unhandled, "safety")?.pass).toBe(false);

    const handled = evaluateTrajectoryGates(
      makeTrajectory({
        y: {
          summary: "redacted: user@example.com",
          text: "redacted: user@example.com",
          citations: ["docs/README.md"],
        },
      }),
    );
    expect(findGate(handled, "safety")?.pass).toBe(true);
  });
});
