import { describe, expect, it } from "vitest";
import {
  buildWarpInHullProperAccelerationContractFromState,
  calculateEnergyPipeline,
  initializePipelineState,
  setGlobalPipelineState,
} from "../server/energy-pipeline";
import { buildGrDiagnostics, buildGrEvolveBrick } from "../server/gr-evolve-brick";
import {
  buildWarpInHullProperAccelerationContract,
  isCertifiedWarpInHullProperAccelerationContract,
} from "../shared/contracts/warp-in-hull-proper-acceleration.v1";
import {
  makeShiftLapseTransportPromotionGateFixture,
  makeShiftLapseWarpInHullProperAccelerationFixture,
  makeWarpInHullProperAccelerationFixture,
} from "./helpers/warp-worldline-fixture";

const buildHullBounds = (state: ReturnType<typeof initializePipelineState>) => {
  const hull = state.hull ?? {
    Lx_m: 1007,
    Ly_m: 264,
    Lz_m: 173,
  };
  return {
    min: [-hull.Lx_m / 2, -hull.Ly_m / 2, -hull.Lz_m / 2] as [number, number, number],
    max: [hull.Lx_m / 2, hull.Ly_m / 2, hull.Lz_m / 2] as [number, number, number],
  };
};

describe("warp in-hull proper-acceleration contract", () => {
  it("builds a deterministic certified direct-brick contract fixture", () => {
    const first = makeWarpInHullProperAccelerationFixture();
    const second = makeWarpInHullProperAccelerationFixture();

    expect(second).toEqual(first);
    expect(first.status).toBe("bounded_in_hull_profile_certified");
    expect(first.observerFamily).toBe("eulerian_comoving_cabin");
    expect(first.accelerationQuantityId).toBe(
      "experienced_proper_acceleration_magnitude",
    );
    expect(first.sampleCount).toBe(7);
    expect(first.samplingGeometry.ordering).toEqual([
      "cabin_center",
      "cabin_fore",
      "cabin_aft",
      "cabin_port",
      "cabin_starboard",
      "cabin_dorsal",
      "cabin_ventral",
    ]);
    expect(first.profileSummary.representativeSampleId).toBe("cabin_center");
    expect(first.profileSummary.max_mps2).toBeGreaterThanOrEqual(
      first.profileSummary.min_mps2,
    );
    expect(first.fallbackUsed).toBe(false);
    expect(isCertifiedWarpInHullProperAccelerationContract(first)).toBe(true);
  });

  it("preserves an honest certified zero-profile case when the bounded solve path is constant-lapse", () => {
    const contract = makeWarpInHullProperAccelerationFixture({ zeroProfile: true });

    expect(contract.resolutionAdequacy.status).toBe(
      "adequate_constant_lapse_zero_profile",
    );
    expect(contract.profileSummary.interpretation).toBe(
      "observer_defined_zero_profile_in_constant_lapse_regime",
    );
    expect(contract.profileSummary.max_mps2).toBe(0);
    expect(contract.profileSummary.max_g).toBe(0);
    expect(contract.fallbackUsed).toBe(false);
    expect(isCertifiedWarpInHullProperAccelerationContract(contract)).toBe(true);
  });

  it("rejects fallback-backed or forged certified contracts", () => {
    const contract = makeWarpInHullProperAccelerationFixture();

    expect(
      buildWarpInHullProperAccelerationContract({
        sourceSurface: contract.sourceSurface,
        chart: contract.chart,
        samplingGeometry: contract.samplingGeometry,
        sampleSummaries: contract.sampleSummaries,
        resolutionAdequacy: {
          ...contract.resolutionAdequacy,
          status: "adequate_constant_lapse_zero_profile",
          allSampleMagnitudesZero: false,
          expectedZeroProfileByModel: false,
        },
      }),
    ).toBeNull();
    expect(
      isCertifiedWarpInHullProperAccelerationContract({
        ...contract,
        fallbackUsed: true,
      }),
    ).toBe(false);
    expect(
      isCertifiedWarpInHullProperAccelerationContract({
        ...contract,
        sourceSurface: {
          ...contract.sourceSurface,
          provenanceClass: "proxy",
        },
      }),
    ).toBe(false);
  });

  it("emits a certified direct-brick zero-profile contract from the current NHM2 solve-backed natario state", async () => {
    const state = await calculateEnergyPipeline(initializePipelineState());
    const contract = await buildWarpInHullProperAccelerationContractFromState(state);

    expect(contract).not.toBeNull();
    expect(contract?.certified).toBe(true);
    expect(contract?.fallbackUsed).toBe(false);
    expect(contract?.observerFamily).toBe("eulerian_comoving_cabin");
    expect(contract?.resolutionAdequacy.status).toBe(
      "adequate_constant_lapse_zero_profile",
    );
    expect(contract?.profileSummary.max_mps2).toBe(0);
    expect(contract?.profileSummary.max_g).toBe(0);
    expect(
      contract?.sampleSummaries.map((entry) => entry.sampleId),
    ).toEqual([
      "cabin_center",
      "cabin_fore",
      "cabin_aft",
      "cabin_port",
      "cabin_starboard",
      "cabin_dorsal",
      "cabin_ventral",
    ]);
    expect(isCertifiedWarpInHullProperAccelerationContract(contract)).toBe(true);
  });

  it("accepts a gate-admitted nhm2_shift_lapse in-hull contract without relabeling it as baseline", () => {
    const contract = makeShiftLapseWarpInHullProperAccelerationFixture();

    expect(contract.sourceSurface.metricFamily).toBe("nhm2_shift_lapse");
    expect(contract.sourceSurface.familyAuthorityStatus).toBe(
      "candidate_authoritative_solve_family",
    );
    expect(contract.sourceSurface.transportCertificationStatus).toBe(
      "bounded_transport_proof_bearing_gate_admitted",
    );
    expect(contract.sourceSurface.shiftLapseTransportPromotionGate?.status).toBe("pass");
    expect(isCertifiedWarpInHullProperAccelerationContract(contract)).toBe(true);
  });

  it("builds a certified direct-brick selected-family in-hull contract from the live gate-admitted shift-lapse solve", async () => {
    const state = initializePipelineState();
    state.warpFieldType = "nhm2_shift_lapse";
    state.dynamicConfig = {
      ...(state.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
      shiftLapseProfileId: "stage1_centerline_alpha_0p995_v1",
    };
    (state as any).warp = {
      ...((state as any).warp ?? {}),
      metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
      metricT00Source: "metric",
    };

    let refreshed = await calculateEnergyPipeline(state);
    setGlobalPipelineState(refreshed);
    // This contract only needs direct-brick provenance, not a full default 128^3 brick.
    const brick = buildGrEvolveBrick({
      dims: [24, 24, 24],
      bounds: buildHullBounds(refreshed),
      useInitialData: true,
      initialIterations: 0,
      initialTolerance: 0,
      steps: 0,
      iterations: 0,
      sourceParams: {
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        metricT00Source: "metric",
        warpFieldType: "nhm2_shift_lapse",
      },
    });
    refreshed.grEnabled = true;
    refreshed.gr = buildGrDiagnostics(brick, {
      metricAdapter: (refreshed as any)?.warp?.metricAdapter ?? null,
    });
    setGlobalPipelineState(refreshed);
    refreshed = await calculateEnergyPipeline(refreshed);

    const contract = await buildWarpInHullProperAccelerationContractFromState(refreshed);

    expect(contract).not.toBeNull();
    expect(contract?.certified).toBe(true);
    expect(contract?.sourceSurface.metricFamily).toBe("nhm2_shift_lapse");
    expect(contract?.sourceSurface.familyAuthorityStatus).toBe(
      "candidate_authoritative_solve_family",
    );
    expect(contract?.sourceSurface.transportCertificationStatus).toBe(
      "bounded_transport_proof_bearing_gate_admitted",
    );
    expect(contract?.sourceSurface.shiftLapseProfileId).toBe(
      "stage1_centerline_alpha_0p995_v1",
    );
    expect(contract?.sourceSurface.shiftLapseTransportPromotionGate?.status).toBe("pass");
    expect(contract?.sourceSurface.shiftLapseTransportPromotionGate?.shiftLapseProfileId).toBe(
      "stage1_centerline_alpha_0p995_v1",
    );
    expect(contract?.resolutionAdequacy.status).toBe("adequate_direct_brick_profile");
    expect(isCertifiedWarpInHullProperAccelerationContract(contract)).toBe(true);
  });

  it("rejects a shift-lapse in-hull contract when the promotion gate is not pass", () => {
    const gate = makeShiftLapseTransportPromotionGateFixture({
      status: "fail",
      reason: "wall_beta_over_alpha_threshold_failed",
      transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
      wallSafetyStatus: "fail",
      wallSafetyReason: "wall_beta_over_alpha_threshold_failed",
    });
    const contract = makeShiftLapseWarpInHullProperAccelerationFixture({ gate });

    expect(
      isCertifiedWarpInHullProperAccelerationContract({
        ...contract,
        sourceSurface: {
          ...contract.sourceSurface,
          shiftLapseTransportPromotionGate: gate,
          transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
        },
      }),
    ).toBe(false);
  });
});
