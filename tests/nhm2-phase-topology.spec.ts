import { describe, expect, it } from "vitest";
import { analyzeNhm2PhaseTopology } from "../server/energy/phase-topology.ts";
import { applyNhm2PhaseTopologyGate } from "../server/energy/phase-topology-gate.ts";
import { smoothSectorPhaseAngles } from "../server/energy/phase-scheduler.ts";

const makeSchedule = (phi_deg_by_sector: number[], overrides: Record<string, unknown> = {}) => ({
  N: phi_deg_by_sector.length,
  sectorPeriod_ms: 10,
  phase01: 0,
  phi_deg_by_sector,
  negSectors: [0],
  posSectors: [Math.max(0, phi_deg_by_sector.length - 1)],
  sampler: "gaussian",
  tau_s_ms: 2,
  weights: new Array(phi_deg_by_sector.length).fill(1),
  ...overrides,
});

const hull = {
  Lx_m: 2,
  Ly_m: 2,
  Lz_m: 2,
};

describe("NHM2 phase topology audit", () => {
  it("does not mutate QI, metric T00, or phase schedule source fields", () => {
    const schedule = makeSchedule(new Array(16).fill(45));
    const state = {
      qiGuardrail: { status: "ok", marginRatio: 0.1 },
      warp: { metricT00: -1.23 },
      phaseSchedule: structuredClone(schedule),
    };
    const before = structuredClone(state);

    const result = analyzeNhm2PhaseTopology({ schedule, hull, nowMs: 1000 });

    expect(result.artifact.claimScope).toBe("strobe_pattern_diagnostic_not_metric_source");
    expect(result.artifact.claimLimit.metricSourceAdmitted).toBe(false);
    expect(result.artifact.claimLimit.energyTransportAdmitted).toBe(false);
    expect(result.artifact.claimLimit.signalTransportAdmitted).toBe(false);
    expect(result.artifact.claimLimit.strobePatternDiagnosticAdmitted).toBe(true);
    expect(state.qiGuardrail).toEqual(before.qiGuardrail);
    expect(state.warp.metricT00).toEqual(before.warp.metricT00);
    expect(state.phaseSchedule).toEqual(before.phaseSchedule);
  });

  it("carries primary research references and analogy limitations", () => {
    const schedule = makeSchedule(new Array(16).fill(45));
    const result = analyzeNhm2PhaseTopology({ schedule, hull, nowMs: 1000 });

    expect(result.artifact.researchBasis.phaseSingularityRefs)
      .toContain("https://arxiv.org/abs/2509.17675");
    expect(result.artifact.researchBasis.qiGuardrailRefs)
      .toContain("https://arxiv.org/abs/gr-qc/9711030");
    expect(result.artifact.researchBasis.casimirContextRefs)
      .toContain("https://arxiv.org/abs/1006.4790");
    expect(result.artifact.researchBasis.claimLimitations.join(" "))
      .toContain("diagnostic analogy");
  });

  it("flags hard sector phase seams", () => {
    const schedule = makeSchedule(
      Array.from({ length: 24 }, (_, index) => (index % 2 === 0 ? 0 : 180)),
    );
    const result = analyzeNhm2PhaseTopology({ schedule, hull, nowMs: 1000 });

    expect(result.artifact.reasonCodes).toContain("hard_phase_seam_review");
    expect(result.artifact.seams.maxSectorPhaseJump_rad)
      .toBe(result.artifact.defects.maxSeamJump_rad);
    expect(["review", "fail"]).toContain(result.artifact.status);
  });

  it("labels superluminal sector-front speed as pattern-only", () => {
    const schedule = makeSchedule(new Array(16).fill(45), {
      sectorPeriod_ms: 1e-9,
    });
    const result = analyzeNhm2PhaseTopology({ schedule, hull, nowMs: 1000 });

    expect(result.artifact.velocities.superluminalPatternObserved).toBe(true);
    expect(result.artifact.velocities.transportInterpretation)
      .toBe("pattern_only_no_energy_or_signal_claim");
    expect(result.artifact.status).not.toBe("fail");
    expect(result.artifact.claimLimit.energyTransportAdmitted).toBe(false);
  });

  it("smoothing reduces maximum seam jump", () => {
    const raw = makeSchedule(
      Array.from({ length: 24 }, (_, index) => (index % 2 === 0 ? 0 : 180)),
    );
    const smooth = {
      ...raw,
      phi_deg_by_sector: smoothSectorPhaseAngles(raw.phi_deg_by_sector, 2),
    };

    const a = analyzeNhm2PhaseTopology({ schedule: raw, hull, nowMs: 1000 });
    const b = analyzeNhm2PhaseTopology({ schedule: smooth, hull, nowMs: 1000 });

    expect(b.artifact.defects.maxSeamJump_rad)
      .toBeLessThan(a.artifact.defects.maxSeamJump_rad);
  });

  it("uses same-charge tracking to classify creations and annihilations", () => {
    const schedule = makeSchedule(new Array(16).fill(45), { phase01: 0.02 });
    const previous = {
      nowMs: 1000,
      phase01: 0,
      defects: [
        {
          id: "prev-q1",
          charge: 1 as const,
          theta01: 0.5,
          phi01: 0.5,
          amplitude: 0,
          confidence: 1,
        },
      ],
    };
    const result = analyzeNhm2PhaseTopology({
      schedule,
      hull,
      nowMs: 1100,
      previous,
    });

    expect(result.artifact.defects.creationCount).toBe(result.artifact.defects.count);
    expect(result.artifact.defects.annihilationCount).toBe(previous.defects.length);
    expect(result.artifact.phaseSpace.speedCounts)
      .toHaveLength(result.artifact.phaseSpace.speedBins_mps.length);
  });

  it("strict gate downgrades topology claims without mutating QI or stress-energy fields", () => {
    const schedule = makeSchedule(new Array(16).fill(45));
    const artifact = analyzeNhm2PhaseTopology({ schedule, hull, nowMs: 1000 }).artifact;
    const state: {
      overallStatus: "NOMINAL" | "WARNING" | "CRITICAL";
      nhm2PhaseTopology: typeof artifact;
      topologyGuardrail?: {
        status: "fail";
        reason: string;
      };
      qiGuardrail: { status: string; marginRatio: number };
      warp: {
        metricT00: number;
        tileEffectiveStressEnergy: { T00: number };
      };
    } = {
      overallStatus: "NOMINAL" as const,
      nhm2PhaseTopology: {
        ...artifact,
        status: "fail" as const,
      },
      qiGuardrail: { status: "ok", marginRatio: 0.2 },
      warp: {
        metricT00: -1,
        tileEffectiveStressEnergy: { T00: -2 },
      },
    };
    const before = structuredClone(state);

    applyNhm2PhaseTopologyGate(state, true);

    expect(state.overallStatus).toBe("WARNING");
    expect(state.topologyGuardrail?.status).toBe("fail");
    expect(state.qiGuardrail).toEqual(before.qiGuardrail);
    expect(state.warp.metricT00).toBe(before.warp.metricT00);
    expect(state.warp.tileEffectiveStressEnergy).toEqual(before.warp.tileEffectiveStressEnergy);
  });
});
