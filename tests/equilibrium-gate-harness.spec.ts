import { describe, expect, it } from "vitest";
import { decideCoherenceAction } from "../modules/policies/coherence-governor";
import type { TTelemetrySnapshot } from "@shared/star-telemetry";
import {
  EQUILIBRIUM_DISPERSION_MAX,
  EQUILIBRIUM_HOLD_MS,
  EQUILIBRIUM_R_STAR,
} from "@shared/neuro-config";

type CommitLabel = "A" | "B";

const baseSnapshot = (
  overrides: Partial<TTelemetrySnapshot> = {},
): TTelemetrySnapshot => ({
  session_id: "sim-session",
  session_type: "lab",
  global_coherence: 0.8,
  collapse_pressure: 0.82,
  phase_dispersion: 0.6,
  gamma_sync_z: 0,
  equilibrium_hold_ms: 0,
  energy_budget: 0.6,
  levels: {},
  ...overrides,
});

const resolveEquilibrium = (snapshot: TTelemetrySnapshot): boolean => {
  if (snapshot.equilibrium === true) return true;
  const holdMs =
    typeof snapshot.equilibrium_hold_ms === "number" &&
    Number.isFinite(snapshot.equilibrium_hold_ms)
      ? snapshot.equilibrium_hold_ms
      : 0;
  const gammaSyncZ = snapshot.gamma_sync_z;
  const dispersion = snapshot.phase_dispersion;
  return (
    typeof gammaSyncZ === "number" &&
    Number.isFinite(gammaSyncZ) &&
    typeof dispersion === "number" &&
    Number.isFinite(dispersion) &&
    holdMs >= EQUILIBRIUM_HOLD_MS &&
    gammaSyncZ >= EQUILIBRIUM_R_STAR &&
    dispersion <= EQUILIBRIUM_DISPERSION_MAX
  );
};

const commitLabel = (snapshot: TTelemetrySnapshot): CommitLabel =>
  (snapshot.phase_5min ?? 0) >= 0 ? "A" : "B";

const countFlipFlops = (labels: CommitLabel[]) =>
  labels.reduce((acc, label, idx) => {
    if (idx === 0) return acc;
    return label === labels[idx - 1] ? acc : acc + 1;
  }, 0);

const evaluateStrategy = (
  snapshots: TTelemetrySnapshot[],
  shouldCommit: (snapshot: TTelemetrySnapshot) => boolean,
) => {
  const commits = snapshots
    .map((snapshot, idx) =>
      shouldCommit(snapshot)
        ? {
            step: idx,
            label: commitLabel(snapshot),
            equilibrium: resolveEquilibrium(snapshot),
          }
        : null,
    )
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const labels = commits.map((entry) => entry.label);
  const premature = commits.filter((entry) => !entry.equilibrium).length;
  return {
    commitCount: commits.length,
    premature,
    flipFlops: countFlipFlops(labels),
  };
};

const buildSimulatedSegments = (): TTelemetrySnapshot[] => {
  const unstable = [1, -1, 1, -1, 1, -1, 1, -1].map((phase) =>
    baseSnapshot({
      phase_5min: phase,
      gamma_sync_z: EQUILIBRIUM_R_STAR - 1,
      phase_dispersion: Math.min(1, EQUILIBRIUM_DISPERSION_MAX + 0.25),
      equilibrium_hold_ms: 0,
    }),
  );
  const locking = [1, -1, 1, -1].map((phase) =>
    baseSnapshot({
      phase_5min: phase,
      gamma_sync_z: EQUILIBRIUM_R_STAR + 0.3,
      phase_dispersion: Math.max(0, EQUILIBRIUM_DISPERSION_MAX - 0.08),
      equilibrium_hold_ms: Math.max(0, EQUILIBRIUM_HOLD_MS * 0.4),
    }),
  );
  const stable = Array.from({ length: 6 }, () =>
    baseSnapshot({
      phase_5min: 1,
      gamma_sync_z: EQUILIBRIUM_R_STAR + 1.1,
      phase_dispersion: Math.max(0, EQUILIBRIUM_DISPERSION_MAX - 0.2),
      equilibrium_hold_ms: EQUILIBRIUM_HOLD_MS + 50,
    }),
  );
  const decay = [-1, 1, -1, 1, -1].map((phase) =>
    baseSnapshot({
      phase_5min: phase,
      gamma_sync_z: EQUILIBRIUM_R_STAR - 1.2,
      phase_dispersion: Math.min(1, EQUILIBRIUM_DISPERSION_MAX + 0.3),
      equilibrium_hold_ms: 0,
    }),
  );
  return [...unstable, ...locking, ...stable, ...decay];
};

describe("equilibrium gate harness", () => {
  it("reduces premature commits and flip-flops versus always-commit", () => {
    const snapshots = buildSimulatedSegments();
    const baseline = evaluateStrategy(
      snapshots,
      (snapshot) => (snapshot.collapse_pressure ?? 0) >= 0.7,
    );
    const gated = evaluateStrategy(
      snapshots,
      (snapshot) => decideCoherenceAction(snapshot) === "collapse",
    );

    expect(gated.commitCount).toBeGreaterThan(0);
    expect(baseline.commitCount).toBeGreaterThan(gated.commitCount);
    expect(baseline.premature).toBeGreaterThan(gated.premature);
    expect(baseline.flipFlops).toBeGreaterThan(gated.flipFlops);
  });
});
