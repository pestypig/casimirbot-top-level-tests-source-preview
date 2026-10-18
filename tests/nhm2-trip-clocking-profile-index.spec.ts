import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildNhm2TripClockingDiagnosticContract,
  type Nhm2TripClockingDiagnosticContractV1,
} from "../shared/contracts/nhm2-trip-clocking-diagnostic.v1";
import {
  buildNhm2TripClockingProfileIndexContract,
  isNhm2TripClockingProfileIndexContract,
} from "../shared/contracts/nhm2-trip-clocking-profile-index.v1";
import {
  WARP_MISSION_TIME_COMPARISON_CONTRACT_VERSION,
  type WarpMissionTimeComparisonContractV1,
} from "../shared/contracts/warp-mission-time-comparison.v1";
import {
  WARP_MISSION_TIME_ESTIMATOR_CONTRACT_VERSION,
  type WarpMissionTimeEstimatorContractV1,
} from "../shared/contracts/warp-mission-time-estimator.v1";
import {
  WARP_ROUTE_TIME_WORLDLINE_CONTRACT_VERSION,
  type WarpRouteTimeWorldlineContractV1,
} from "../shared/contracts/warp-route-time-worldline.v1";
import type { WarpWorldlineSourceSurface } from "../shared/contracts/warp-worldline-contract.v1";
import { publishTripClockingProfileIndex } from "../tools/nhm2/publish-trip-clocking-profile-index";

const p995 = "stage1_centerline_alpha_0p995_v1";
const p7000 = "stage1_centerline_alpha_0p7000_v1";
const coordinateSeconds = 137_755_965.9171795;
const coordinateYears = 4.3652231448899625;
const targetDistanceLightYears = 4.365218089591392;

const profileAlpha = (profileId: string): number =>
  profileId === p7000 ? 0.7 : 0.995;

const profileProperSeconds = (profileId: string): number =>
  coordinateSeconds * profileAlpha(profileId);

const profileProperYears = (profileId: string): number =>
  coordinateYears * profileAlpha(profileId);

const sourceSurface = (profileId: string): WarpWorldlineSourceSurface => ({
  surfaceId: "nhm2_metric_local_comoving_transport_cross",
  producer: "tests/nhm2-trip-clocking-profile-index.spec.ts",
  provenanceClass: "solve_backed",
  transportVectorSource: "warp.solveBackedTransportSampleFamily",
  transportVectorField: "shiftVectorField.evaluateShiftVector",
  metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
  metricT00Source: "metric",
  metricFamily: "nhm2_shift_lapse",
  familyAuthorityStatus: "candidate_authoritative_solve_family",
  transportCertificationStatus: "bounded_transport_proof_bearing_gate_admitted",
  metricT00ContractStatus: "ok",
  chartContractStatus: "ok",
  shiftLapseProfileId: profileId,
  shiftLapseTransportPromotionGate: {
    gateId: "nhm2_shift_lapse_transport_promotion_gate/v1",
    status: "pass",
    reason: "fixture",
    shiftLapseProfileId: profileId,
    shiftLapseProfileStage: "controlled_tuning_stage_1",
    shiftLapseProfileLabel: null,
    shiftLapseProfileNote: "fixture",
    familyAuthorityStatus: "candidate_authoritative_solve_family",
    familyTransportCertificationStatus:
      "bounded_transport_proof_bearing_gate_admitted",
    transportCertificationStatus: "bounded_transport_proof_bearing_gate_admitted",
    authoritativeLowExpansionStatus: "pass",
    authoritativeLowExpansionReason: "fixture",
    authoritativeLowExpansionSource: "gr_evolve_brick",
    authoritativeLowExpansionObservable: "brick_native_div_beta",
    divergenceRms: 0,
    divergenceMaxAbs: 0,
    divergenceTolerance: 1e-9,
    thetaKConsistencyStatus: "pass",
    thetaKResidualAbs: 0,
    thetaKTolerance: 1e-9,
    wallSafetyStatus: "pass",
    wallSafetyReason: "fixture",
    betaOverAlphaMax: profileId === p7000 ? 0.01483479440521692 : 2.22e-17,
    betaOutwardOverAlphaWallMax: 0,
    wallHorizonMargin: 1,
    timingStatus: "available",
    timingReason: "fixture",
    centerlineAlpha: profileAlpha(profileId),
    centerlineDtauDt: profileAlpha(profileId),
  },
});

const scalarEstimate = (seconds: number, years: number, meaning: string) => ({
  seconds,
  years,
  units: { primary: "s" as const, secondary: "yr" as const },
  meaning,
});

const routeTime = (profileId: string): WarpRouteTimeWorldlineContractV1 =>
  ({
    generatedAt: profileId === p7000 ? "2026-04-25T00:00:00.000Z" : "2026-04-22T00:00:00.000Z",
    contractVersion: WARP_ROUTE_TIME_WORLDLINE_CONTRACT_VERSION,
    sourceSurface: sourceSurface(profileId),
    descriptorScheduleSummary: {
      quantityId: "bounded_local_transport_descriptor_norm",
      quantityMeaning: "fixture",
      quantityUnits: "dimensionless",
      representative: 0.014,
      min: 0,
      max: profileId === p7000 ? 0.01483479440521692 : 2.22e-17,
      spread: 0.01483479440521692,
    },
  }) as WarpRouteTimeWorldlineContractV1;

const estimator = (profileId: string): WarpMissionTimeEstimatorContractV1 =>
  ({
    generatedAt: profileId === p7000 ? "2026-04-25T00:00:00.000Z" : "2026-04-22T00:00:00.000Z",
    contractVersion: WARP_MISSION_TIME_ESTIMATOR_CONTRACT_VERSION,
    sourceSurface: sourceSurface(profileId),
    targetName: "Alpha Centauri A",
    targetDistance: {
      meters: 41_298_199_626_475_464,
      parsecs: 1.338383500408207,
      lightYears: targetDistanceLightYears,
      epochMs: 1_763_696_773_601,
      snapshotPath: "server/_generated/local-rest.json",
      selectionRule: "fixture",
    },
    coordinateTimeEstimate: scalarEstimate(
      coordinateSeconds,
      coordinateYears,
      "coordinate fixture",
    ),
    properTimeEstimate: scalarEstimate(
      profileProperSeconds(profileId),
      profileProperYears(profileId),
      "proper fixture",
    ),
  }) as WarpMissionTimeEstimatorContractV1;

const comparison = (profileId: string): WarpMissionTimeComparisonContractV1 =>
  ({
    generatedAt: profileId === p7000 ? "2026-04-24T00:00:00.000Z" : "2026-04-22T00:00:00.000Z",
    contractVersion: WARP_MISSION_TIME_COMPARISON_CONTRACT_VERSION,
    sourceSurface: sourceSurface(profileId),
    targetName: "Alpha Centauri A",
    warpCoordinateTimeEstimate: scalarEstimate(
      coordinateSeconds,
      coordinateYears,
      "coordinate fixture",
    ),
    warpProperTimeEstimate: scalarEstimate(
      profileProperSeconds(profileId),
      profileProperYears(profileId),
      "proper fixture",
    ),
    comparisonMetrics: {
      properMinusCoordinate_seconds: profileProperSeconds(profileId) - coordinateSeconds,
      properVsCoordinate_ratio: profileAlpha(profileId),
      properMinusClassical_seconds: profileProperSeconds(profileId) - coordinateSeconds,
      properVsClassical_ratio: profileAlpha(profileId),
      coordinateMinusClassical_seconds: 0,
      coordinateVsClassical_ratio: 1,
      interpretationStatus: "bounded_relativistic_differential_detected",
      differentialToleranceSeconds: 0.0001377559659171795,
    },
  }) as WarpMissionTimeComparisonContractV1;

const diagnostic = (profileId: string): Nhm2TripClockingDiagnosticContractV1 => {
  const artifact = buildNhm2TripClockingDiagnosticContract({
    routeTimeWorldline: routeTime(profileId),
    missionTimeEstimator: estimator(profileId),
    missionTimeComparison: comparison(profileId),
    expectedSelectedProfileId: profileId,
    generatedAt: "2026-06-15T00:00:00.000Z",
  });
  if (!artifact) throw new Error(`failed to build ${profileId}`);
  return artifact;
};

describe("nhm2_trip_clocking_profile_index/v1", () => {
  it("indexes 0p995 and 0p7000 as separate profile-scoped diagnostics", () => {
    const index = buildNhm2TripClockingProfileIndexContract({
      profiles: [
        {
          diagnostic: diagnostic(p995),
          diagnosticRef: "artifacts/trip-clocking/0p995.json",
          sourceRefs: {
            routeTimeWorldline: "route-0p995.json",
            missionTimeEstimator: "estimator-0p995.json",
            missionTimeComparison: "comparison-0p995.json",
          },
        },
        {
          diagnostic: diagnostic(p7000),
          diagnosticRef: "artifacts/trip-clocking/0p7000.json",
          sourceRefs: {
            routeTimeWorldline: "route-0p7000.json",
            missionTimeEstimator: "estimator-0p7000.json",
            missionTimeComparison: "comparison-0p7000.json",
          },
        },
      ],
      generatedAt: "2026-06-15T00:00:00.000Z",
    });

    expect(index?.profileCount).toBe(2);
    expect(index?.latestAliasPolicy.mixedProfileLatestForbidden).toBe(true);
    expect(index?.claimBoundary.profileComparisonDoesNotPromoteLowerAlpha).toBe(
      true,
    );
    expect(isNhm2TripClockingProfileIndexContract(index)).toBe(true);

    const byProfile = new Map(index?.profiles.map((profile) => [profile.profileId, profile]));
    expect(byProfile.get(p995)?.role).toBe("canonical_whitepaper_anchor");
    expect(byProfile.get(p995)?.oneWay.shipYoungerByDays).toBeCloseTo(7.971989, 6);
    expect(byProfile.get(p7000)?.role).toBe("frontier_clocking_target");
    expect(byProfile.get(p7000)?.oneWay.shipYoungerByDays).toBeCloseTo(478.319326, 6);
  });

  it("rejects duplicate profiles so lower-alpha rows cannot overwrite the anchor", () => {
    const index = buildNhm2TripClockingProfileIndexContract({
      profiles: [
        {
          diagnostic: diagnostic(p995),
          diagnosticRef: "a.json",
          sourceRefs: {
            routeTimeWorldline: "route-a.json",
            missionTimeEstimator: "estimator-a.json",
            missionTimeComparison: "comparison-a.json",
          },
        },
        {
          diagnostic: diagnostic(p995),
          diagnosticRef: "b.json",
          sourceRefs: {
            routeTimeWorldline: "route-b.json",
            missionTimeEstimator: "estimator-b.json",
            missionTimeComparison: "comparison-b.json",
          },
        },
      ],
    });

    expect(index).toBeNull();
  });

  it("publishes per-profile diagnostics and a top-level index without using latest aliases", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nhm2-trip-index-"));
    const baseDir = "artifacts/research/full-solve/selected-family/nhm2-shift-lapse";
    const absoluteBaseDir = join(repoRoot, baseDir);

    try {
      mkdirSync(absoluteBaseDir, { recursive: true });
      for (const profileId of [p995, p7000]) {
        writeFileSync(
          join(absoluteBaseDir, `nhm2-route-time-worldline-${profileId}.json`),
          JSON.stringify(routeTime(profileId), null, 2),
          "utf8",
        );
        writeFileSync(
          join(absoluteBaseDir, `nhm2-mission-time-estimator-${profileId}.json`),
          JSON.stringify(estimator(profileId), null, 2),
          "utf8",
        );
        writeFileSync(
          join(absoluteBaseDir, `nhm2-mission-time-comparison-${profileId}.json`),
          JSON.stringify(comparison(profileId), null, 2),
          "utf8",
        );
      }
      writeFileSync(
        join(absoluteBaseDir, "nhm2-mission-time-estimator-latest.json"),
        JSON.stringify(estimator(p7000), null, 2),
        "utf8",
      );

      const index = publishTripClockingProfileIndex({
        repoRoot,
        baseDir,
        profiles: [p995, p7000],
        generatedAt: "2026-06-15T00:00:00.000Z",
      });

      expect(index.profileCount).toBe(2);
      expect(index.latestAliasPolicy.mixedProfileLatestForbidden).toBe(true);
      expect(
        index.profiles.every((profile) => !Object.values(profile.sourceRefs).some((path) => path.includes("latest"))),
      ).toBe(true);
      expect(index.profiles.map((profile) => profile.diagnosticRef)).toEqual(
        expect.arrayContaining([
          `${baseDir}/trip-clocking/${p995}/nhm2-trip-clocking-diagnostic.json`,
          `${baseDir}/trip-clocking/${p7000}/nhm2-trip-clocking-diagnostic.json`,
        ]),
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("does not emit forbidden route, speed, or viability claims", () => {
    const index = buildNhm2TripClockingProfileIndexContract({
      profiles: [
        {
          diagnostic: diagnostic(p995),
          diagnosticRef: "artifacts/trip-clocking/0p995.json",
          sourceRefs: {
            routeTimeWorldline: "route-0p995.json",
            missionTimeEstimator: "estimator-0p995.json",
            missionTimeComparison: "comparison-0p995.json",
          },
        },
      ],
    });
    const text = JSON.stringify(index);

    expect(text).not.toMatch(/\bcertified speed\b/i);
    expect(text).not.toMatch(/\btrue ETA\b/i);
    expect(text).not.toMatch(/\bphysical warp trip\b/i);
  });
});
