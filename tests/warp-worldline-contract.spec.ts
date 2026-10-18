import { describe, expect, it } from "vitest";
import {
  buildWarpWorldlineContractFromState,
  calculateEnergyPipeline,
  initializePipelineState,
} from "../server/energy-pipeline";
import {
  analyzeWarpWorldlineTransportVariation,
  isCertifiedWarpWorldlineContract,
} from "../shared/contracts/warp-worldline-contract.v1";
import { buildWarpCruiseEnvelopePreflightContractFromWorldline } from "../shared/contracts/warp-cruise-envelope-preflight.v1";
import {
  makeFlatWarpWorldlineSamples,
  makeInformativeWarpWorldlineSamples,
} from "./helpers/warp-worldline-fixture";

const makeSolveBackedTransportSampleFamily = () => ({
  familyId: "nhm2_centerline_shell_cross" as const,
  description:
    "Deterministic bounded local-comoving shell-cross family with centerline and shell-proximal probes.",
  representativeSampleId: "centerline_center" as const,
  ordering: [
    "centerline_aft",
    "centerline_center",
    "centerline_fore",
    "shell_aft",
    "shell_fore",
    "shell_port",
    "shell_starboard",
    "shell_dorsal",
    "shell_ventral",
  ] as const,
  axes: {
    centerline: [1, 0, 0] as [number, number, number],
    portStarboard: [0, 1, 0] as [number, number, number],
    dorsalVentral: [0, 0, 1] as [number, number, number],
  },
  offsets_m: {
    centerline: 2.5,
    shellLongitudinal: 4.9,
    shellTransverse: 1.3,
    shellVertical: 0.9,
    shellClearance: 0.1,
  },
  samples: makeInformativeWarpWorldlineSamples().map((sample) => ({
    sampleId: sample.sampleId,
    sampleRole: sample.sampleRole,
    sourceModel: sample.sourceModel,
    transportProvenance: sample.transportProvenance,
    coordinateTime_s: 0 as const,
    position_m: sample.position_m,
    betaCoord: sample.betaCoord,
  })),
});

const makeShiftLapseAuthoritativeGr = (overrides?: {
  divergenceRms?: number;
  wallHorizonMargin?: number;
  betaOutwardOverAlphaWallMax?: number;
  thetaMean?: number | null;
  kTraceMean?: number | null;
}) => ({
  meta: { status: "CERTIFIED" },
  solver: { health: { status: "CERTIFIED" } },
  divBeta: {
    rms: overrides?.divergenceRms ?? 1e-4,
    maxAbs: 2e-4,
    source: "gr_evolve_brick",
  },
  theta: {
    mean: overrides?.thetaMean ?? 0,
  },
  kTrace: {
    mean: overrides?.kTraceMean ?? 0,
  },
  gauge: {
    betaOverAlphaMax: 0.2,
    betaOutwardOverAlphaWallMax: overrides?.betaOutwardOverAlphaWallMax ?? 0.15,
    wallHorizonMargin: overrides?.wallHorizonMargin ?? 0.4,
  },
});

describe("warp worldline contract", () => {
  it("emits a solve-backed transport sample family for nhm2_shift_lapse from live pipeline state", async () => {
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

    const refreshed = await calculateEnergyPipeline(state);
    const sampleFamily = (refreshed as any)?.warp?.solveBackedTransportSampleFamily ?? null;

    expect((refreshed as any)?.warp?.metricAdapter?.family).toBe("nhm2_shift_lapse");
    expect((refreshed as any)?.warp?.metricAdapter?.lapseSummary?.shiftLapseProfileId).toBe(
      "stage1_centerline_alpha_0p995_v1",
    );
    expect((refreshed as any)?.warp?.metricAdapter?.lapseSummary?.alphaCenterline).toBeCloseTo(
      0.995,
      12,
    );
    expect((refreshed as any)?.shiftLapseTransportPromotionGate?.shiftLapseProfileId).toBe(
      "stage1_centerline_alpha_0p995_v1",
    );
    expect((refreshed as any)?.shiftLapseTransportPromotionGate?.centerlineDtauDt).toBeCloseTo(
      0.995,
      12,
    );
    expect(sampleFamily).not.toBeNull();
    expect(sampleFamily.familyId).toBe("nhm2_centerline_shell_cross");
    expect(sampleFamily.representativeSampleId).toBe("centerline_center");
    expect(Array.isArray(sampleFamily.samples)).toBe(true);
    expect(sampleFamily.samples).toHaveLength(9);
  });

  it("builds a deterministic bounded solve-backed NHM2 worldline when the authoritative metric contract is closed", () => {
    const state = initializePipelineState();
    state.driveDir = [1, 0, 0];
    (state as any).warp = {
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario_sdf.shift",
      metricT00Contract: {
        status: "ok",
        family: "natario_sdf",
        observer: "eulerian_n",
        normalization: "si_stress",
        unitSystem: "SI",
      },
      metricAdapter: {
        family: "natario_sdf",
        chart: {
          label: "comoving_cartesian",
          coordinateMap: "comoving_cartesian: x' = x - x_s(t), t = t",
          contractStatus: "ok",
        },
        alpha: 1,
        gammaDiag: [1, 1, 1],
      },
      solveBackedTransportSampleFamily: makeSolveBackedTransportSampleFamily(),
    };

    const first = buildWarpWorldlineContractFromState(state);
    const second = buildWarpWorldlineContractFromState(state);

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first?.certified).toBe(true);
    expect(first?.sourceSurface.provenanceClass).toBe("solve_backed");
    expect(first?.sampleGeometry.familyId).toBe("nhm2_centerline_shell_cross");
    expect(first?.samples.map((entry) => entry.sampleId)).toEqual([
      "centerline_aft",
      "centerline_center",
      "centerline_fore",
      "shell_aft",
      "shell_fore",
      "shell_port",
      "shell_starboard",
      "shell_dorsal",
      "shell_ventral",
    ]);
    expect(first?.representativeSampleId).toBe("centerline_center");
    expect(first?.sampleCount).toBe(9);
    expect(first?.dtau_dt.representative ?? 0).toBeGreaterThan(0);
    expect(first?.normalizationResidual.maxAbs ?? 1).toBeLessThanOrEqual(1e-9);
    expect(first?.transportVariation.transportVariationStatus).toBe(
      "descriptor_and_dtau_varied",
    );
    expect(first?.sampleFamilyAdequacy).toBe("adequate_for_bounded_cruise_preflight");
    expect(first?.eligibleNextProducts).toEqual(["bounded_cruise_envelope_preflight"]);
    expect(isCertifiedWarpWorldlineContract(first)).toBe(true);
    const preflight = buildWarpCruiseEnvelopePreflightContractFromWorldline(first);
    expect(preflight?.status).toBe("bounded_preflight_ready");
    expect(preflight?.preflightQuantityId).toBe("bounded_local_transport_descriptor_norm");
  });

  it("fails closed for nhm2_shift_lapse when the transport-promotion gate is missing", () => {
    const state = initializePipelineState();
    (state as any).warp = {
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
      metricT00Contract: {
        status: "ok",
        family: "nhm2_shift_lapse",
        observer: "eulerian_n",
        normalization: "si_stress",
        unitSystem: "SI",
      },
      metricAdapter: {
        family: "nhm2_shift_lapse",
        chart: {
          label: "comoving_cartesian",
          coordinateMap: "comoving_cartesian: x' = x - x_s(t), t = t",
          contractStatus: "ok",
        },
        alpha: 1,
        gammaDiag: [1, 1, 1],
      },
      solveBackedTransportSampleFamily: makeSolveBackedTransportSampleFamily(),
    };
    state.warpFieldType = "nhm2_shift_lapse";
    state.dynamicConfig = {
      ...(state.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
    };

    expect(buildWarpWorldlineContractFromState(state)).toBeNull();
  });

  it("admits nhm2_shift_lapse when the authoritative transport-promotion gate passes", () => {
    const state = initializePipelineState();
    (state as any).warp = {
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
      metricT00Contract: {
        status: "ok",
        family: "nhm2_shift_lapse",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
        observer: "eulerian_n",
        normalization: "si_stress",
        unitSystem: "SI",
      },
      metricAdapter: {
        family: "nhm2_shift_lapse",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
        chart: {
          label: "comoving_cartesian",
          coordinateMap: "comoving_cartesian: x' = x - x_s(t), t = t",
          contractStatus: "ok",
        },
        alpha: 1,
        gammaDiag: [1, 1, 1],
        lapseSummary: {
          alphaCenterline: 1,
        },
      },
      solveBackedTransportSampleFamily: makeSolveBackedTransportSampleFamily(),
    };
    state.warpFieldType = "nhm2_shift_lapse";
    state.dynamicConfig = {
      ...(state.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
    };
    (state as any).gr = makeShiftLapseAuthoritativeGr();

    const contract = buildWarpWorldlineContractFromState(state);

    expect(contract).not.toBeNull();
    expect(contract?.sourceSurface.metricFamily).toBe("nhm2_shift_lapse");
    expect(contract?.sourceSurface.familyAuthorityStatus).toBe(
      "candidate_authoritative_solve_family",
    );
    expect(contract?.sourceSurface.transportCertificationStatus).toBe(
      "bounded_transport_proof_bearing_gate_admitted",
    );
    expect(contract?.sourceSurface.shiftLapseTransportPromotionGate?.status).toBe("pass");
    expect(
      contract?.sourceSurface.shiftLapseTransportPromotionGate?.authoritativeLowExpansionStatus,
    ).toBe("pass");
    expect(contract?.sourceSurface.shiftLapseTransportPromotionGate?.wallSafetyStatus).toBe(
      "pass",
    );
    const preflight = buildWarpCruiseEnvelopePreflightContractFromWorldline(contract);
    expect(preflight?.status).toBe("bounded_preflight_ready");
  });

  it("keeps nhm2_shift_lapse fail-closed when the wall-safety sub-gate fails", () => {
    const state = initializePipelineState();
    (state as any).warp = {
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
      metricT00Contract: {
        status: "ok",
        family: "nhm2_shift_lapse",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
        observer: "eulerian_n",
        normalization: "si_stress",
        unitSystem: "SI",
      },
      metricAdapter: {
        family: "nhm2_shift_lapse",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
        chart: {
          label: "comoving_cartesian",
          coordinateMap: "comoving_cartesian: x' = x - x_s(t), t = t",
          contractStatus: "ok",
        },
        alpha: 1,
        gammaDiag: [1, 1, 1],
      },
      solveBackedTransportSampleFamily: makeSolveBackedTransportSampleFamily(),
    };
    state.warpFieldType = "nhm2_shift_lapse";
    state.dynamicConfig = {
      ...(state.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
    };
    (state as any).gr = makeShiftLapseAuthoritativeGr({
      betaOutwardOverAlphaWallMax: 1.05,
    });

    expect(buildWarpWorldlineContractFromState(state)).toBeNull();
  });

  it("fails closed when the authoritative metric contract is not closed", () => {
    const state = initializePipelineState();
    (state as any).warp = {
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario.shift",
      metricT00Contract: {
        status: "unknown",
        family: "natario",
        observer: "eulerian_n",
        normalization: "si_stress",
        unitSystem: "SI",
      },
      metricAdapter: {
        family: "natario",
        chart: {
          label: "comoving_cartesian",
          coordinateMap: "comoving_cartesian: x' = x - x_s(t), t = t",
          contractStatus: "unknown",
        },
        alpha: 1,
        gammaDiag: [1, 1, 1],
      },
      solveBackedTransportSampleFamily: makeSolveBackedTransportSampleFamily(),
    };

    expect(buildWarpWorldlineContractFromState(state)).toBeNull();
  });

  it("fails closed when only amplitude-style transport scalars exist without solve-backed transport samples", () => {
    const state = initializePipelineState();
    (state as any).beta_avg = 0.25;
    (state as any).warp = {
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario.shift",
      metricT00Contract: {
        status: "ok",
        family: "natario",
        observer: "eulerian_n",
        normalization: "si_stress",
        unitSystem: "SI",
      },
      metricAdapter: {
        family: "natario",
        chart: {
          label: "comoving_cartesian",
          coordinateMap: "comoving_cartesian: x' = x - x_s(t), t = t",
          contractStatus: "ok",
        },
        alpha: 1,
        gammaDiag: [1, 1, 1],
      },
      betaAvg: 0.25,
      natarioShiftAmplitude: 0.25,
      shiftVectorField: { amplitude: 0.25 },
    };

    expect(buildWarpWorldlineContractFromState(state)).toBeNull();
  });

  it("rejects forged partial contracts that set certified=true without the strict provenance fields", () => {
    expect(
      isCertifiedWarpWorldlineContract({
        contractVersion: "warp_worldline_contract/v1",
        status: "bounded_solve_backed",
        certified: true,
        samples: [{ dtau_dt: 1 }],
        normalizationResidual: { maxAbs: 0 },
      }),
    ).toBe(false);
  });

  it("detects a numerically flat bounded sample family when all solve-backed descriptors are constant", () => {
    const analysis = analyzeWarpWorldlineTransportVariation(makeFlatWarpWorldlineSamples());
    expect(analysis).not.toBeNull();
    expect(analysis?.transportVariation.transportVariationStatus).toBe("numerically_flat");
    expect(analysis?.transportInformativenessStatus).toBe("structurally_valid_but_flat");
    expect(analysis?.sampleFamilyAdequacy).toBe("insufficiently_differentiated");
    expect(analysis?.eligibleNextProducts).toEqual([]);
  });

  it("detects an informative bounded sample family when shell-cross solve-backed variation is present", () => {
    const analysis = analyzeWarpWorldlineTransportVariation(
      makeInformativeWarpWorldlineSamples(),
    );
    expect(analysis).not.toBeNull();
    expect(analysis?.transportVariation.transportVariationStatus).toBe(
      "descriptor_and_dtau_varied",
    );
    expect(analysis?.transportInformativenessStatus).toBe(
      "descriptor_informative_local_only",
    );
    expect(analysis?.sampleFamilyAdequacy).toBe("adequate_for_bounded_cruise_preflight");
    expect(analysis?.eligibleNextProducts).toEqual(["bounded_cruise_envelope_preflight"]);
  });
});
