import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  makeInformativeWarpWorldlineSamplesForAlpha,
  makeShiftLapseTransportPromotionGateFixture,
  makeShiftLapseWarpInHullProperAccelerationFixture,
  makeShiftLapseWarpWorldlineFixture,
  makeWarpCruiseEnvelopeFixture,
  makeWarpCruiseEnvelopePreflightFixture,
  makeWarpInHullProperAccelerationFixture,
  makeWarpMissionTargetDistanceFixture,
  makeWarpMissionTimeComparisonFixture,
  makeWarpMissionTimeEstimatorFixture,
  makeWarpRouteTimeWorldlineFixture,
  makeWarpWorldlineFixture,
} from "./helpers/warp-worldline-fixture";

const CURRENT_TOKEN = "shift_lapse_transport_certification_not_promoted";
const LEGACY_TOKEN = "reference_only_shift_lapse_family_selected";
const REPO_ROOT = process.cwd();
const SELECTED_SHIFT_LAPSE_PROFILE_ID = "stage1_centerline_alpha_0p995_v1";
const TUNED_CENTERLINE_ALPHA = 0.995;
const SWEEP_PROFILE_SPECS = [
  { profileId: "stage1_centerline_alpha_0p9975_v1", alpha: 0.9975 },
  { profileId: SELECTED_SHIFT_LAPSE_PROFILE_ID, alpha: TUNED_CENTERLINE_ALPHA },
  { profileId: "stage1_centerline_alpha_0p9925_v1", alpha: 0.9925 },
  { profileId: "stage1_centerline_alpha_0p9900_v1", alpha: 0.99 },
] as const;
const BOUNDARY_PROFILE_SPECS = [
  { profileId: "stage1_centerline_alpha_0p9875_v1", alpha: 0.9875 },
  { profileId: "stage1_centerline_alpha_0p9850_v1", alpha: 0.985 },
  { profileId: "stage1_centerline_alpha_0p9825_v1", alpha: 0.9825 },
  { profileId: "stage1_centerline_alpha_0p9800_v1", alpha: 0.98 },
  { profileId: "stage1_centerline_alpha_0p9775_v1", alpha: 0.9775 },
  { profileId: "stage1_centerline_alpha_0p9750_v1", alpha: 0.975 },
  { profileId: "stage1_centerline_alpha_0p9725_v1", alpha: 0.9725 },
  { profileId: "stage1_centerline_alpha_0p9700_v1", alpha: 0.97 },
  { profileId: "stage1_centerline_alpha_0p9675_v1", alpha: 0.9675 },
  { profileId: "stage1_centerline_alpha_0p9650_v1", alpha: 0.965 },
  { profileId: "stage1_centerline_alpha_0p9625_v1", alpha: 0.9625 },
  { profileId: "stage1_centerline_alpha_0p9600_v1", alpha: 0.96 },
  { profileId: "stage1_centerline_alpha_0p9575_v1", alpha: 0.9575 },
  { profileId: "stage1_centerline_alpha_0p9550_v1", alpha: 0.955 },
  { profileId: "stage1_centerline_alpha_0p9525_v1", alpha: 0.9525 },
  { profileId: "stage1_centerline_alpha_0p9500_v1", alpha: 0.95 },
  { profileId: "stage1_centerline_alpha_0p9475_v1", alpha: 0.9475 },
  { profileId: "stage1_centerline_alpha_0p9450_v1", alpha: 0.945 },
  { profileId: "stage1_centerline_alpha_0p9425_v1", alpha: 0.9425 },
  { profileId: "stage1_centerline_alpha_0p9400_v1", alpha: 0.94 },
  { profileId: "stage1_centerline_alpha_0p9375_v1", alpha: 0.9375 },
  { profileId: "stage1_centerline_alpha_0p9350_v1", alpha: 0.935 },
  { profileId: "stage1_centerline_alpha_0p9325_v1", alpha: 0.9325 },
  { profileId: "stage1_centerline_alpha_0p9300_v1", alpha: 0.93 },
  { profileId: "stage1_centerline_alpha_0p9275_v1", alpha: 0.9275 },
  { profileId: "stage1_centerline_alpha_0p9250_v1", alpha: 0.925 },
  { profileId: "stage1_centerline_alpha_0p9225_v1", alpha: 0.9225 },
  { profileId: "stage1_centerline_alpha_0p9200_v1", alpha: 0.92 },
  { profileId: "stage1_centerline_alpha_0p9175_v1", alpha: 0.9175 },
  { profileId: "stage1_centerline_alpha_0p9150_v1", alpha: 0.915 },
  { profileId: "stage1_centerline_alpha_0p9125_v1", alpha: 0.9125 },
  { profileId: "stage1_centerline_alpha_0p9100_v1", alpha: 0.91 },
  { profileId: "stage1_centerline_alpha_0p9075_v1", alpha: 0.9075 },
  { profileId: "stage1_centerline_alpha_0p9050_v1", alpha: 0.905 },
  { profileId: "stage1_centerline_alpha_0p9025_v1", alpha: 0.9025 },
  { profileId: "stage1_centerline_alpha_0p9000_v1", alpha: 0.9 },
  { profileId: "stage1_centerline_alpha_0p8975_v1", alpha: 0.8975 },
  { profileId: "stage1_centerline_alpha_0p8950_v1", alpha: 0.895 },
  { profileId: "stage1_centerline_alpha_0p8925_v1", alpha: 0.8925 },
  { profileId: "stage1_centerline_alpha_0p8900_v1", alpha: 0.89 },
  { profileId: "stage1_centerline_alpha_0p8875_v1", alpha: 0.8875 },
  { profileId: "stage1_centerline_alpha_0p8850_v1", alpha: 0.885 },
  { profileId: "stage1_centerline_alpha_0p8825_v1", alpha: 0.8825 },
  { profileId: "stage1_centerline_alpha_0p8800_v1", alpha: 0.88 },
  { profileId: "stage1_centerline_alpha_0p8775_v1", alpha: 0.8775 },
  { profileId: "stage1_centerline_alpha_0p8750_v1", alpha: 0.875 },
  { profileId: "stage1_centerline_alpha_0p8725_v1", alpha: 0.8725 },
  { profileId: "stage1_centerline_alpha_0p8700_v1", alpha: 0.87 },
  { profileId: "stage1_centerline_alpha_0p8675_v1", alpha: 0.8675 },
  { profileId: "stage1_centerline_alpha_0p8650_v1", alpha: 0.865 },
  { profileId: "stage1_centerline_alpha_0p8625_v1", alpha: 0.8625 },
  { profileId: "stage1_centerline_alpha_0p8600_v1", alpha: 0.86 },
  { profileId: "stage1_centerline_alpha_0p8575_v1", alpha: 0.8575 },
  { profileId: "stage1_centerline_alpha_0p8550_v1", alpha: 0.855 },
  { profileId: "stage1_centerline_alpha_0p8525_v1", alpha: 0.8525 },
  { profileId: "stage1_centerline_alpha_0p8500_v1", alpha: 0.85 },
  { profileId: "stage1_centerline_alpha_0p8475_v1", alpha: 0.8475 },
  { profileId: "stage1_centerline_alpha_0p8450_v1", alpha: 0.845 },
  { profileId: "stage1_centerline_alpha_0p8425_v1", alpha: 0.8425 },
  { profileId: "stage1_centerline_alpha_0p8400_v1", alpha: 0.84 },
  { profileId: "stage1_centerline_alpha_0p8375_v1", alpha: 0.8375 },
  { profileId: "stage1_centerline_alpha_0p8350_v1", alpha: 0.835 },
  { profileId: "stage1_centerline_alpha_0p8325_v1", alpha: 0.8325 },
  { profileId: "stage1_centerline_alpha_0p8300_v1", alpha: 0.83 },
  { profileId: "stage1_centerline_alpha_0p8275_v1", alpha: 0.8275 },
  { profileId: "stage1_centerline_alpha_0p8250_v1", alpha: 0.825 },
  { profileId: "stage1_centerline_alpha_0p8225_v1", alpha: 0.8225 },
  { profileId: "stage1_centerline_alpha_0p8200_v1", alpha: 0.82 },
  { profileId: "stage1_centerline_alpha_0p8175_v1", alpha: 0.8175 },
  { profileId: "stage1_centerline_alpha_0p8150_v1", alpha: 0.815 },
  { profileId: "stage1_centerline_alpha_0p8125_v1", alpha: 0.8125 },
  { profileId: "stage1_centerline_alpha_0p8100_v1", alpha: 0.81 },
  { profileId: "stage1_centerline_alpha_0p8075_v1", alpha: 0.8075 },
  { profileId: "stage1_centerline_alpha_0p8050_v1", alpha: 0.805 },
  { profileId: "stage1_centerline_alpha_0p8025_v1", alpha: 0.8025 },
  { profileId: "stage1_centerline_alpha_0p8000_v1", alpha: 0.8 },
  { profileId: "stage1_centerline_alpha_0p7975_v1", alpha: 0.7975 },
  { profileId: "stage1_centerline_alpha_0p7950_v1", alpha: 0.795 },
  { profileId: "stage1_centerline_alpha_0p7925_v1", alpha: 0.7925 },
  { profileId: "stage1_centerline_alpha_0p7900_v1", alpha: 0.79 },
  { profileId: "stage1_centerline_alpha_0p7875_v1", alpha: 0.7875 },
  { profileId: "stage1_centerline_alpha_0p7850_v1", alpha: 0.785 },
  { profileId: "stage1_centerline_alpha_0p7825_v1", alpha: 0.7825 },
  { profileId: "stage1_centerline_alpha_0p7800_v1", alpha: 0.78 },
  { profileId: "stage1_centerline_alpha_0p7775_v1", alpha: 0.7775 },
  { profileId: "stage1_centerline_alpha_0p7750_v1", alpha: 0.775 },
  { profileId: "stage1_centerline_alpha_0p7725_v1", alpha: 0.7725 },
  { profileId: "stage1_centerline_alpha_0p7700_v1", alpha: 0.77 },
  { profileId: "stage1_centerline_alpha_0p7675_v1", alpha: 0.7675 },
  { profileId: "stage1_centerline_alpha_0p7650_v1", alpha: 0.765 },
  { profileId: "stage1_centerline_alpha_0p7625_v1", alpha: 0.7625 },
  { profileId: "stage1_centerline_alpha_0p7600_v1", alpha: 0.76 },
  { profileId: "stage1_centerline_alpha_0p7575_v1", alpha: 0.7575 },
  { profileId: "stage1_centerline_alpha_0p7550_v1", alpha: 0.755 },
  { profileId: "stage1_centerline_alpha_0p7525_v1", alpha: 0.7525 },
  { profileId: "stage1_centerline_alpha_0p7500_v1", alpha: 0.75 },
  { profileId: "stage1_centerline_alpha_0p7475_v1", alpha: 0.7475 },
  { profileId: "stage1_centerline_alpha_0p7450_v1", alpha: 0.745 },
  { profileId: "stage1_centerline_alpha_0p7425_v1", alpha: 0.7425 },
  { profileId: "stage1_centerline_alpha_0p7400_v1", alpha: 0.74 },
  { profileId: "stage1_centerline_alpha_0p7375_v1", alpha: 0.7375 },
  { profileId: "stage1_centerline_alpha_0p7350_v1", alpha: 0.735 },
  { profileId: "stage1_centerline_alpha_0p7325_v1", alpha: 0.7325 },
  { profileId: "stage1_centerline_alpha_0p7300_v1", alpha: 0.73 },
] as const;

const withFailToken = <T extends { falsifierConditions: string[] }>(
  contract: T,
  token: string,
): T => ({
  ...contract,
  falsifierConditions: [
    ...contract.falsifierConditions.filter(
      (entry) => entry !== CURRENT_TOKEN && entry !== LEGACY_TOKEN,
    ),
    token,
  ],
});

const makeCurrentWorldlineContract = () =>
  withFailToken(makeWarpWorldlineFixture(), CURRENT_TOKEN);

const makeLegacyWorldlineContract = () =>
  withFailToken(makeWarpWorldlineFixture(), LEGACY_TOKEN);

const makeCurrentInHullContract = () =>
  withFailToken(makeWarpInHullProperAccelerationFixture(), CURRENT_TOKEN);

const makeLegacyInHullContract = () =>
  withFailToken(makeWarpInHullProperAccelerationFixture(), LEGACY_TOKEN);

const makeFreshPipelineState = () => {
  const warpWorldline = makeCurrentWorldlineContract();
  const warpCruiseEnvelopePreflight =
    makeWarpCruiseEnvelopePreflightFixture(warpWorldline);
  const warpRouteTimeWorldline = makeWarpRouteTimeWorldlineFixture(
    warpWorldline,
    warpCruiseEnvelopePreflight,
  );
  const targetDistance = makeWarpMissionTargetDistanceFixture();
  const warpMissionTimeEstimator = makeWarpMissionTimeEstimatorFixture({
    worldline: warpWorldline,
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    targetDistance,
  });
  const warpMissionTimeComparison = makeWarpMissionTimeComparisonFixture({
    missionTimeEstimator: warpMissionTimeEstimator,
  });
  const warpCruiseEnvelope = makeWarpCruiseEnvelopeFixture({
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    missionTimeEstimator: warpMissionTimeEstimator,
    missionTimeComparison: warpMissionTimeComparison,
  });
  const warpInHullProperAcceleration = makeCurrentInHullContract();
  return {
    warpWorldline,
    warpCruiseEnvelopePreflight,
    warpRouteTimeWorldline,
    warpMissionTimeEstimator,
    warpMissionTimeComparison,
    warpCruiseEnvelope,
    warpInHullProperAcceleration,
    targetDistance,
  };
};

const makeShiftLapsePipelineState = () => {
  const warpWorldline = makeShiftLapseWarpWorldlineFixture();
  const warpCruiseEnvelopePreflight =
    makeWarpCruiseEnvelopePreflightFixture(warpWorldline);
  const warpRouteTimeWorldline = makeWarpRouteTimeWorldlineFixture(
    warpWorldline,
    warpCruiseEnvelopePreflight,
  );
  const targetDistance = makeWarpMissionTargetDistanceFixture();
  const warpMissionTimeEstimator = makeWarpMissionTimeEstimatorFixture({
    worldline: warpWorldline,
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    targetDistance,
  });
  const warpMissionTimeComparison = makeWarpMissionTimeComparisonFixture({
    missionTimeEstimator: warpMissionTimeEstimator,
  });
  const warpCruiseEnvelope = makeWarpCruiseEnvelopeFixture({
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    missionTimeEstimator: warpMissionTimeEstimator,
    missionTimeComparison: warpMissionTimeComparison,
  });
  const warpInHullProperAcceleration =
    makeShiftLapseWarpInHullProperAccelerationFixture();
  return {
    warpWorldline,
    warpCruiseEnvelopePreflight,
    warpRouteTimeWorldline,
    warpMissionTimeEstimator,
    warpMissionTimeComparison,
    warpCruiseEnvelope,
    warpInHullProperAcceleration,
    targetDistance,
  };
};

const makeShiftLapseTunedTimingPipelineState = () => {
  const gate = makeShiftLapseTransportPromotionGateFixture({
    centerlineAlpha: TUNED_CENTERLINE_ALPHA,
    centerlineDtauDt: TUNED_CENTERLINE_ALPHA,
    shiftLapseProfileId: SELECTED_SHIFT_LAPSE_PROFILE_ID,
    shiftLapseProfileStage: "controlled_tuning_stage_1",
    shiftLapseProfileNote:
      "Controlled stage-1 NHM2 shift+lapse tuning profile with centerline alpha reduced to 0.995 while the mild gradient is preserved.",
  });
  const warpWorldline = makeShiftLapseWarpWorldlineFixture(
    makeInformativeWarpWorldlineSamplesForAlpha(TUNED_CENTERLINE_ALPHA),
    gate,
  );
  const warpCruiseEnvelopePreflight =
    makeWarpCruiseEnvelopePreflightFixture(warpWorldline);
  const warpRouteTimeWorldline = makeWarpRouteTimeWorldlineFixture(
    warpWorldline,
    warpCruiseEnvelopePreflight,
  );
  const targetDistance = makeWarpMissionTargetDistanceFixture();
  const warpMissionTimeEstimator = makeWarpMissionTimeEstimatorFixture({
    worldline: warpWorldline,
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    targetDistance,
  });
  const warpMissionTimeComparison = makeWarpMissionTimeComparisonFixture({
    missionTimeEstimator: warpMissionTimeEstimator,
  });
  const warpCruiseEnvelope = makeWarpCruiseEnvelopeFixture({
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    missionTimeEstimator: warpMissionTimeEstimator,
    missionTimeComparison: warpMissionTimeComparison,
  });
  const warpInHullProperAcceleration = makeShiftLapseWarpInHullProperAccelerationFixture({
    gate,
  });
  return {
    warpWorldline,
    warpCruiseEnvelopePreflight,
    warpRouteTimeWorldline,
    warpMissionTimeEstimator,
    warpMissionTimeComparison,
    warpCruiseEnvelope,
    warpInHullProperAcceleration,
    targetDistance,
  };
};

const makeShiftLapseSweepTimingPipelineState = (args: {
  profileId: string;
  alpha: number;
  gateStatus?: "pass" | "fail" | "missing";
  transportCertificationStatus?:
    | "bounded_transport_proof_bearing_gate_admitted"
    | "bounded_transport_fail_closed_reference_only";
  authoritativeLowExpansionStatus?: "pass" | "fail" | "missing";
  wallSafetyStatus?: "pass" | "fail" | "missing";
  promotionGateReason?: string;
  wallSafetyReason?: string;
}) => {
  const gateStatus = args.gateStatus ?? "pass";
  const transportCertificationStatus =
    args.transportCertificationStatus ??
    (gateStatus === "pass"
      ? "bounded_transport_proof_bearing_gate_admitted"
      : "bounded_transport_fail_closed_reference_only");
  const gate = makeShiftLapseTransportPromotionGateFixture({
    status: gateStatus,
    reason:
      args.promotionGateReason ??
      (gateStatus === "pass"
        ? "shift_lapse_transport_promotion_gate_pass"
        : "shift_lapse_transport_promotion_gate_not_pass"),
    transportCertificationStatus,
    authoritativeLowExpansionStatus: args.authoritativeLowExpansionStatus ?? "pass",
    wallSafetyStatus: args.wallSafetyStatus ?? "pass",
    wallSafetyReason:
      args.wallSafetyReason ??
      ((args.wallSafetyStatus ?? "pass") === "pass"
        ? "wall_safety_guardrail_ok"
        : "wall_safety_guardrail_not_satisfied"),
    centerlineAlpha: args.alpha,
    centerlineDtauDt: args.alpha,
    shiftLapseProfileId: args.profileId,
    shiftLapseProfileStage: "controlled_tuning_stage_1",
    shiftLapseProfileLabel: `Synthetic sweep profile ${args.profileId}`,
    shiftLapseProfileNote: `Synthetic selected-family robustness-sweep fixture for ${args.profileId}.`,
  });
  const warpWorldline = makeShiftLapseWarpWorldlineFixture(
    makeInformativeWarpWorldlineSamplesForAlpha(args.alpha),
    gate,
  );
  const warpCruiseEnvelopePreflight =
    makeWarpCruiseEnvelopePreflightFixture(warpWorldline);
  const warpRouteTimeWorldline = makeWarpRouteTimeWorldlineFixture(
    warpWorldline,
    warpCruiseEnvelopePreflight,
  );
  const targetDistance = makeWarpMissionTargetDistanceFixture();
  const warpMissionTimeEstimator = makeWarpMissionTimeEstimatorFixture({
    worldline: warpWorldline,
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    targetDistance,
  });
  const warpMissionTimeComparison = makeWarpMissionTimeComparisonFixture({
    missionTimeEstimator: warpMissionTimeEstimator,
  });
  const warpCruiseEnvelope = makeWarpCruiseEnvelopeFixture({
    preflight: warpCruiseEnvelopePreflight,
    routeTime: warpRouteTimeWorldline,
    missionTimeEstimator: warpMissionTimeEstimator,
    missionTimeComparison: warpMissionTimeComparison,
  });
  const warpInHullProperAcceleration = makeShiftLapseWarpInHullProperAccelerationFixture({
    gate,
  });
  warpWorldline.sourceSurface.transportCertificationStatus = transportCertificationStatus;
  (warpCruiseEnvelopePreflight as any).sourceSurface.transportCertificationStatus =
    transportCertificationStatus;
  (warpRouteTimeWorldline as any).sourceSurface.transportCertificationStatus =
    transportCertificationStatus;
  (warpMissionTimeEstimator as any).sourceSurface.transportCertificationStatus =
    transportCertificationStatus;
  (warpMissionTimeComparison as any).sourceSurface.transportCertificationStatus =
    transportCertificationStatus;
  (warpCruiseEnvelope as any).sourceSurface.transportCertificationStatus =
    transportCertificationStatus;
  warpInHullProperAcceleration.sourceSurface.transportCertificationStatus =
    transportCertificationStatus;
  return {
    warpWorldline,
    warpCruiseEnvelopePreflight,
    warpRouteTimeWorldline,
    warpMissionTimeEstimator,
    warpMissionTimeComparison,
    warpCruiseEnvelope,
    warpInHullProperAcceleration,
    targetDistance,
  };
};

const readJsonFile = <T>(absolutePath: string): T =>
  JSON.parse(fs.readFileSync(absolutePath, "utf8")) as T;

const makeShiftLapseProfileSweepEntryFixture = (args: {
  profileId: string;
  alpha: number;
  rootSegment?: "sweep" | "boundary-sweep";
  transportCertificationStatus?:
    | "bounded_transport_proof_bearing_gate_admitted"
    | "bounded_transport_fail_closed_reference_only";
  promotionGateStatus?: "pass" | "fail" | "missing";
  promotionGateReason?: string;
  authoritativeLowExpansionStatus?: "pass" | "fail" | "missing";
  authoritativeLowExpansionReason?: string;
  wallSafetyStatus?: "pass" | "fail" | "missing";
  wallSafetyReason?: string;
  divergenceRms?: number;
  divergenceMaxAbs?: number;
  divergenceTolerance?: number;
  thetaKConsistencyStatus?: "pass" | "fail" | "unknown";
  thetaKResidualAbs?: number;
  thetaKTolerance?: number;
  betaOverAlphaMax?: number;
  betaOutwardOverAlphaWallMax?: number;
  wallHorizonMargin?: number;
  missionTimeInterpretationStatus?: string;
  properMinusCoordinateSeconds?: number;
  boundedTimingDifferentialDetected?: boolean;
}) => {
  const rootSegment = args.rootSegment ?? "sweep";
  return {
  shiftLapseProfileId: args.profileId,
  shiftLapseProfileStage: "controlled_tuning_stage_1",
  shiftLapseProfileNote: `Synthetic selected-family robustness-sweep fixture for ${args.profileId}.`,
  publicationCommand: `npm run warp:full-solve:nhm2-shift-lapse:publish-selected-transport -- --shift-lapse-profile-id ${args.profileId}`,
  artifactRoot: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}`,
  auditRoot: `docs/audits/research/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}`,
  transportResultLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-shift-lapse-transport-result-latest.json`,
  transportResultLatestMdPath: `docs/audits/research/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/warp-nhm2-shift-lapse-transport-result-latest.md`,
  selectedBundleArtifacts: {
    worldlineLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-warp-worldline-proof-latest.json`,
    cruiseEnvelopePreflightLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-cruise-envelope-preflight-latest.json`,
    routeTimeWorldlineLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-route-time-worldline-latest.json`,
    missionTimeEstimatorLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-mission-time-estimator-latest.json`,
    missionTimeComparisonLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-mission-time-comparison-latest.json`,
    shiftVsLapseDecompositionLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-shift-vs-lapse-decomposition-latest.json`,
    cruiseEnvelopeLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-cruise-envelope-latest.json`,
    inHullProperAccelerationLatestJsonPath: `artifacts/research/full-solve/selected-family/nhm2-shift-lapse/${rootSegment}/${args.profileId}/nhm2-in-hull-proper-acceleration-latest.json`,
  },
  transportCertificationStatus:
    args.transportCertificationStatus ?? "bounded_transport_proof_bearing_gate_admitted",
  promotionGateStatus: args.promotionGateStatus ?? "pass",
  promotionGateReason:
    args.promotionGateReason ?? "shift_lapse_transport_promotion_gate_pass",
  authoritativeLowExpansionStatus: args.authoritativeLowExpansionStatus ?? "pass",
  authoritativeLowExpansionReason:
    args.authoritativeLowExpansionReason ?? "authoritative_low_expansion_ok",
  authoritativeLowExpansionSource: "gr_evolve_brick",
  wallSafetyStatus: args.wallSafetyStatus ?? "pass",
  wallSafetyReason: args.wallSafetyReason ?? "wall_safety_guardrail_ok",
  divergenceRms: args.divergenceRms ?? 1e-4,
  divergenceMaxAbs: args.divergenceMaxAbs ?? 2e-4,
  divergenceTolerance: args.divergenceTolerance ?? 1e-3,
  thetaKConsistencyStatus: args.thetaKConsistencyStatus ?? "pass",
  thetaKResidualAbs: args.thetaKResidualAbs ?? 1e-4,
  thetaKTolerance: args.thetaKTolerance ?? 1e-3,
  betaOverAlphaMax: args.betaOverAlphaMax ?? 0.2,
  betaOutwardOverAlphaWallMax: args.betaOutwardOverAlphaWallMax ?? 0.15,
  wallHorizonMargin: args.wallHorizonMargin ?? 0.4,
  centerlineAlpha: args.alpha,
  centerlineDtauDt: args.alpha,
  missionTimeInterpretationStatus:
    args.missionTimeInterpretationStatus ?? "bounded_relativistic_differential_detected",
  properMinusCoordinate_seconds:
    args.properMinusCoordinateSeconds ??
    -25_000_000 * (1 + Math.abs(1 - args.alpha)),
  properMinusClassical_seconds:
    args.properMinusCoordinateSeconds ??
    -25_000_000 * (1 + Math.abs(1 - args.alpha)),
  boundedTimingDifferentialDetected: args.boundedTimingDifferentialDetected ?? true,
  measuredResultSummary: `Synthetic bounded timing differential summary for ${args.profileId}.`,
  };
};

const expectGateAdmittedTransportSurface = (
  artifactPath: string,
  metricT00Ref: string,
  shiftLapseProfileId?: string,
) => {
  const artifact = readJsonFile<Record<string, any>>(artifactPath);
  const sourceSurface = (artifact.sourceSurface ?? artifact) as Record<string, any>;
  expect(sourceSurface.metricT00Ref).toBe(metricT00Ref);
  expect(sourceSurface.transportCertificationStatus).toBe(
    "bounded_transport_proof_bearing_gate_admitted",
  );
  expect(sourceSurface.shiftLapseTransportPromotionGate?.status).toBe("pass");
  if (shiftLapseProfileId) {
    expect(sourceSurface.shiftLapseProfileId).toBe(shiftLapseProfileId);
    expect(sourceSurface.shiftLapseTransportPromotionGate?.shiftLapseProfileId).toBe(
      shiftLapseProfileId,
    );
  }
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.doUnmock("../server/energy-pipeline.ts");
  vi.doUnmock("../server/gr-evolve-brick.ts");
});

describe("bounded-stack latest publication", () => {
  it("refreshes a stale certified worldline payload before writing latest outputs", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warp-worldline-publish-"));

    const freshState = makeFreshPipelineState();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ warpWorldline: makeLegacyWorldlineContract() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async () => freshState),
      setGlobalPipelineState: vi.fn(),
      resolveCommittedLocalRestMissionTargetDistanceContract: vi.fn(
        () => freshState.targetDistance,
      ),
    }));

    const { publishNhm2WarpWorldlineProofLatest } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );

    const outJsonPath = path.join(
      tempDir,
      "artifacts/research/full-solve/nhm2-warp-worldline-proof-2099-01-01.json",
    );
    const latestJsonPath = path.join(
      tempDir,
      "artifacts/research/full-solve/nhm2-warp-worldline-proof-latest.json",
    );
    const outMdPath = path.join(
      tempDir,
      "docs/audits/research/warp-nhm2-warp-worldline-proof-2099-01-01.md",
    );
    const latestMdPath = path.join(
      tempDir,
      "docs/audits/research/warp-nhm2-warp-worldline-proof-latest.md",
    );

    await publishNhm2WarpWorldlineProofLatest({
      baseUrl: "http://example.test",
      outJsonPath,
      latestJsonPath,
      outMdPath,
      latestMdPath,
      publishDownstream: false,
      updateProofPackLatest: false,
      publicationLockPath: path.join(
        tempDir,
        "artifacts/research/full-solve/warp-worldline-publication.lock",
      ),
    });

    const latestJson = fs.readFileSync(latestJsonPath, "utf8");
    const latestMd = fs.readFileSync(latestMdPath, "utf8");

    expect(latestJson).toContain(CURRENT_TOKEN);
    expect(latestJson).not.toContain(LEGACY_TOKEN);
    expect(latestMd).toContain(CURRENT_TOKEN);
    expect(latestMd).not.toContain(LEGACY_TOKEN);
    expect(latestJson).toContain('"metricT00Ref": "warp.metric.T00.natario_sdf.shift"');
  });

  it("refreshes a stale certified in-hull payload before writing latest outputs", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warp-inhull-publish-"));

    const freshState = makeFreshPipelineState();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            warpInHullProperAcceleration: makeLegacyInHullContract(),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async () => freshState),
      setGlobalPipelineState: vi.fn(),
    }));

    const { publishNhm2InHullProperAccelerationLatest } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );

    const outJsonPath = path.join(
      tempDir,
      "artifacts/research/full-solve/nhm2-in-hull-proper-acceleration-2099-01-01.json",
    );
    const latestJsonPath = path.join(
      tempDir,
      "artifacts/research/full-solve/nhm2-in-hull-proper-acceleration-latest.json",
    );
    const outMdPath = path.join(
      tempDir,
      "docs/audits/research/warp-nhm2-in-hull-proper-acceleration-2099-01-01.md",
    );
    const latestMdPath = path.join(
      tempDir,
      "docs/audits/research/warp-nhm2-in-hull-proper-acceleration-latest.md",
    );

    await publishNhm2InHullProperAccelerationLatest({
      baseUrl: "http://example.test",
      outJsonPath,
      latestJsonPath,
      outMdPath,
      latestMdPath,
      updateProofPackLatest: false,
      publicationLockPath: path.join(
        tempDir,
        "artifacts/research/full-solve/warp-inhull-publication.lock",
      ),
    });

    const latestJson = fs.readFileSync(latestJsonPath, "utf8");
    const latestMd = fs.readFileSync(latestMdPath, "utf8");

    expect(latestJson).toContain(CURRENT_TOKEN);
    expect(latestJson).not.toContain(LEGACY_TOKEN);
    expect(latestMd).toContain(CURRENT_TOKEN);
    expect(latestMd).not.toContain(LEGACY_TOKEN);
    expect(latestJson).toContain('"metricT00Ref": "warp.metric.T00.natario_sdf.shift"');
  });

  it("publishes a dedicated selected-family shift-lapse bounded stack and timing summary without changing canonical latest aliases", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "warp-shift-lapse-selected-transport-"),
    );
    const shiftLapseState = makeShiftLapseTunedTimingPipelineState();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(makeFreshPipelineState()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async () => shiftLapseState),
      setGlobalPipelineState: vi.fn(),
      resolveCommittedLocalRestMissionTargetDistanceContract: vi.fn(
        () => shiftLapseState.targetDistance,
      ),
    }));

    const canonicalWorldlineLatestPath = path.join(
      REPO_ROOT,
      "artifacts/research/full-solve/nhm2-warp-worldline-proof-latest.json",
    );
    const canonicalWorldlineBefore = fs.readFileSync(canonicalWorldlineLatestPath, "utf8");
    const { publishNhm2ShiftLapseSelectedTransportBundle } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const selectedArtifactRoot = path.join(
      tempDir,
      "artifacts/research/full-solve/selected-family/nhm2-shift-lapse",
    );
    const selectedAuditRoot = path.join(
      tempDir,
      "docs/audits/research/selected-family/nhm2-shift-lapse",
    );

    const published = await publishNhm2ShiftLapseSelectedTransportBundle({
      baseUrl: "http://example.test",
      artifactRootDir: selectedArtifactRoot,
      auditRootDir: selectedAuditRoot,
      publicationLockPath: path.join(
        tempDir,
        "artifacts/research/full-solve/selected-family/nhm2-shift-lapse/publication.lock",
      ),
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [requestUrl] of fetchMock.mock.calls) {
      const requestText = String(requestUrl ?? "");
      expect(requestText).toContain("warpFieldType=nhm2_shift_lapse");
      expect(requestText).toContain("metricT00Ref=warp.metric.T00.nhm2.shift_lapse");
      expect(requestText).toContain(
        `shiftLapseProfileId=${SELECTED_SHIFT_LAPSE_PROFILE_ID}`,
      );
      expect(requestText).toContain("requireCongruentSolve=1");
      expect(requestText).toContain("requireNhm2CongruentFullSolve=1");
    }
    expect(published.boundedStack.proofSurfaceManifest).toBeUndefined();

    const selectedMetricRef = "warp.metric.T00.nhm2.shift_lapse";
    expectGateAdmittedTransportSurface(
      path.join(
        selectedArtifactRoot,
        "nhm2-warp-worldline-proof-latest.json",
      ),
      selectedMetricRef,
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expectGateAdmittedTransportSurface(
      path.join(
        selectedArtifactRoot,
        "nhm2-cruise-envelope-preflight-latest.json",
      ),
      selectedMetricRef,
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expectGateAdmittedTransportSurface(
      path.join(
        selectedArtifactRoot,
        "nhm2-route-time-worldline-latest.json",
      ),
      selectedMetricRef,
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expectGateAdmittedTransportSurface(
      path.join(
        selectedArtifactRoot,
        "nhm2-mission-time-estimator-latest.json",
      ),
      selectedMetricRef,
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expectGateAdmittedTransportSurface(
      path.join(
        selectedArtifactRoot,
        "nhm2-mission-time-comparison-latest.json",
      ),
      selectedMetricRef,
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expectGateAdmittedTransportSurface(
      path.join(
        selectedArtifactRoot,
        "nhm2-cruise-envelope-latest.json",
      ),
      selectedMetricRef,
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expectGateAdmittedTransportSurface(
      path.join(
        selectedArtifactRoot,
        "nhm2-in-hull-proper-acceleration-latest.json",
      ),
      selectedMetricRef,
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );

    const selectedMissionComparisonJson = readJsonFile<Record<string, any>>(
      path.join(
        selectedArtifactRoot,
        "nhm2-mission-time-comparison-latest.json",
      ),
    );
    expect(
      selectedMissionComparisonJson.comparisonMetrics?.interpretationStatus,
    ).toBe("bounded_relativistic_differential_detected");
    expect(
      selectedMissionComparisonJson.sourceSurface?.shiftLapseProfileId,
    ).toBe(SELECTED_SHIFT_LAPSE_PROFILE_ID);

    const tempMissionComparison = fs.readFileSync(
      path.join(
        selectedAuditRoot,
        "warp-nhm2-mission-time-comparison-latest.md",
      ),
      "utf8",
    );
    expect(tempMissionComparison).toContain("| transportCertificationStatus | bounded_transport_proof_bearing_gate_admitted |");
    expect(tempMissionComparison).toContain(
      `| shiftLapseCenterlineDtauDt | ${TUNED_CENTERLINE_ALPHA} |`,
    );

    const selectedResultJson = readJsonFile<Record<string, any>>(
      path.join(
        selectedArtifactRoot,
        "nhm2-shift-lapse-transport-result-latest.json",
      ),
    );
    expect(selectedResultJson.selectedFamily.metricT00Ref).toBe(selectedMetricRef);
    expect(selectedResultJson.selectedFamily.shiftLapseProfileId).toBe(
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expect(selectedResultJson.transportCertificationStatus).toBe(
      "bounded_transport_proof_bearing_gate_admitted",
    );
    expect(selectedResultJson.promotionGateStatus).toBe("pass");
    expect(selectedResultJson.authoritativeLowExpansionStatus).toBe("pass");
    expect(selectedResultJson.wallSafetyStatus).toBe("pass");
    expect(selectedResultJson.centerlineAlpha).toBe(TUNED_CENTERLINE_ALPHA);
    expect(selectedResultJson.centerlineDtauDt).toBe(TUNED_CENTERLINE_ALPHA);
    expect(selectedResultJson.missionTimeInterpretationStatus).toBe(
      "bounded_relativistic_differential_detected",
    );
    expect(selectedResultJson.shiftVsLapseApproximationStatus).toBe(
      "approximate",
    );
    expect(selectedResultJson.boundedTimingDifferentialDetected).toBe(true);
    expect(String(selectedResultJson.measuredResultSummary)).toContain(
      "bounded timing differential",
    );
    expect(String(selectedResultJson.measuredResultSummary)).not.toMatch(/speed|ETA/i);
    expect(
      selectedResultJson.selectedBundleArtifacts
        ?.shiftVsLapseDecompositionLatestJsonPath,
    ).toContain("nhm2-shift-vs-lapse-decomposition-latest.json");

    const selectedDecompositionJson = readJsonFile<Record<string, any>>(
      path.join(
        selectedArtifactRoot,
        "nhm2-shift-vs-lapse-decomposition-latest.json",
      ),
    );
    expect(["pass", "review"]).toContain(selectedDecompositionJson.status);
    expect(selectedDecompositionJson.profile?.shiftLapseProfileId).toBe(
      SELECTED_SHIFT_LAPSE_PROFILE_ID,
    );
    expect(selectedDecompositionJson.lapseDial?.projectionSource).toBe(
      "centerline_dtau_dt",
    );
    expect(selectedResultJson.shiftVsLapseDecompositionStatus).toBe(
      selectedDecompositionJson.status,
    );
    expect(selectedResultJson.shiftTransportContribution_seconds).toBeCloseTo(
      selectedDecompositionJson.decomposition
        ?.fixedShiftFamilyTransportContributionSeconds,
    );
    expect(selectedResultJson.lapseClockRateContribution_seconds).toBeCloseTo(
      selectedDecompositionJson.decomposition
        ?.lapseProfileClockRateContributionSeconds,
    );
    expect(selectedResultJson.shiftVsLapseResidual_seconds).toBeCloseTo(
      selectedDecompositionJson.decomposition
        ?.residualUnexplainedContributionSeconds,
    );
    expect(selectedResultJson.lapseDialTrackedFraction).toBeCloseTo(
      selectedDecompositionJson.decomposition?.lapseDialTrackedFraction,
    );
    expect(
      selectedDecompositionJson.decomposition
        ?.lapseProfileClockRateContributionSeconds,
    ).toBeLessThan(0);
    expect(
      Math.abs(
        Number(
          selectedDecompositionJson.decomposition
            ?.residualUnexplainedContributionSeconds,
        ),
      ),
    ).toBeGreaterThanOrEqual(0);
    if (selectedDecompositionJson.status === "review") {
      expect(selectedDecompositionJson.reasonCodes).toContain(
        "residual_exceeds_tolerance",
      );
    }

    const selectedResultMd = fs.readFileSync(
      path.join(
        selectedAuditRoot,
        "warp-nhm2-shift-lapse-transport-result-latest.md",
      ),
      "utf8",
    );
    expect(selectedResultMd).toContain("bounded_relativistic_differential_detected");
    expect(selectedResultMd).toContain(String(TUNED_CENTERLINE_ALPHA));
    expect(selectedResultMd).toContain(SELECTED_SHIFT_LAPSE_PROFILE_ID);
    expect(selectedResultMd).toContain(
      "npm run warp:full-solve:nhm2-shift-lapse:publish-selected-transport",
    );
    expect(selectedResultMd).toContain("shiftVsLapseDecomposition");

    const selectedDecompositionMd = fs.readFileSync(
      path.join(
        selectedAuditRoot,
        "warp-nhm2-shift-vs-lapse-decomposition-latest.md",
      ),
      "utf8",
    );
    expect(selectedDecompositionMd).toContain("approximate");
    expect(selectedDecompositionMd).toContain(
      "fixedShiftFamilyTransportContributionSeconds",
    );
    expect(selectedDecompositionMd).toContain(
      "lapseProfileClockRateContributionSeconds",
    );

    const canonicalWorldlineAfter = fs.readFileSync(canonicalWorldlineLatestPath, "utf8");
    expect(canonicalWorldlineAfter).toBe(canonicalWorldlineBefore);
    expect(canonicalWorldlineAfter).toContain(
      '"metricT00Ref": "warp.metric.T00.natario_sdf.shift"',
    );
  });

  it("publishes a selected-family robustness sweep in a dedicated namespace without changing canonical latest aliases", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "warp-shift-lapse-selected-sweep-"),
    );
    const stateByProfile = new Map(
      SWEEP_PROFILE_SPECS.map((spec) => [
        spec.profileId,
        makeShiftLapseSweepTimingPipelineState({
          profileId: spec.profileId,
          alpha: spec.alpha,
        }),
      ]),
    );
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(makeFreshPipelineState()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async (state: Record<string, any>) => {
        const profileId = String(
          state?.dynamicConfig?.shiftLapseProfileId ?? SELECTED_SHIFT_LAPSE_PROFILE_ID,
        );
        return (
          stateByProfile.get(profileId) ??
          makeShiftLapseSweepTimingPipelineState({
            profileId,
            alpha: TUNED_CENTERLINE_ALPHA,
          })
        );
      }),
      setGlobalPipelineState: vi.fn(),
      resolveCommittedLocalRestMissionTargetDistanceContract: vi.fn(() =>
        makeWarpMissionTargetDistanceFixture(),
      ),
    }));

    const canonicalWorldlineLatestPath = path.join(
      REPO_ROOT,
      "artifacts/research/full-solve/nhm2-warp-worldline-proof-latest.json",
    );
    const canonicalWorldlineBefore = fs.readFileSync(canonicalWorldlineLatestPath, "utf8");
    const { publishNhm2ShiftLapseProfileSweep } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const selectedSweepArtifactRoot = path.join(
      tempDir,
      "artifacts/research/full-solve/selected-family/nhm2-shift-lapse/sweep",
    );
    const selectedSweepAuditRoot = path.join(
      tempDir,
      "docs/audits/research/selected-family/nhm2-shift-lapse/sweep",
    );

    const published = await publishNhm2ShiftLapseProfileSweep({
      baseUrl: "http://example.test",
      artifactRootDir: selectedSweepArtifactRoot,
      auditRootDir: selectedSweepAuditRoot,
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const profile of SWEEP_PROFILE_SPECS) {
      const profileArtifactDir = path.join(selectedSweepArtifactRoot, profile.profileId);
      expectGateAdmittedTransportSurface(
        path.join(profileArtifactDir, "nhm2-warp-worldline-proof-latest.json"),
        "warp.metric.T00.nhm2.shift_lapse",
        profile.profileId,
      );
      const profileResultJson = readJsonFile<Record<string, any>>(
        path.join(profileArtifactDir, "nhm2-shift-lapse-transport-result-latest.json"),
      );
      expect(profileResultJson.selectedFamily.shiftLapseProfileId).toBe(profile.profileId);
      expect(profileResultJson.centerlineAlpha).toBe(profile.alpha);
      expect(profileResultJson.centerlineDtauDt).toBe(profile.alpha);
    }

    const sweepResultJson = readJsonFile<Record<string, any>>(
      published.sweepArtifact.latestJsonPath,
    );
    expect(sweepResultJson.sweepProfileIds).toEqual(
      SWEEP_PROFILE_SPECS.map((entry) => entry.profileId),
    );
    expect(sweepResultJson.canonicalBaselineLatestAliasesChanged).toBe(false);
    expect(sweepResultJson.firstProfileWithBoundedTimingDifferential).toBe(
      "stage1_centerline_alpha_0p9975_v1",
    );
    expect(sweepResultJson.strongestProfileKeepingAllGatesPassing).toBe(
      "stage1_centerline_alpha_0p9900_v1",
    );
    expect(sweepResultJson.firstGateFailure).toBeNull();
    expect(sweepResultJson.robustnessStatus).toBe("robust_over_tested_bracket");
    expect(sweepResultJson.scalingStatus).toBe("monotonic");
    expect(String(sweepResultJson.robustnessSummary)).not.toMatch(/speed|ETA/i);

    const sweepResultMd = fs.readFileSync(published.sweepArtifact.latestMdPath, "utf8");
    for (const profile of SWEEP_PROFILE_SPECS) {
      expect(sweepResultMd).toContain(profile.profileId);
    }
    expect(sweepResultMd).toContain("robust_over_tested_bracket");
    expect(sweepResultMd).toContain(String(sweepResultJson.robustnessSummary));

    const canonicalWorldlineAfter = fs.readFileSync(canonicalWorldlineLatestPath, "utf8");
    expect(canonicalWorldlineAfter).toBe(canonicalWorldlineBefore);
    expect(canonicalWorldlineAfter).toContain(
      '"metricT00Ref": "warp.metric.T00.natario_sdf.shift"',
    );
  });

  it("reports the first stronger gate failure honestly in the sweep summary", async () => {
    const { buildNhm2ShiftLapseProfileSweepArtifact } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const artifact = buildNhm2ShiftLapseProfileSweepArtifact({
      entries: [
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9975_v1",
          alpha: 0.9975,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: SELECTED_SHIFT_LAPSE_PROFILE_ID,
          alpha: TUNED_CENTERLINE_ALPHA,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9900_v1",
          alpha: 0.99,
          transportCertificationStatus:
            "bounded_transport_fail_closed_reference_only",
          wallSafetyStatus: "fail",
          wallSafetyReason: "wall_safety_guardrail_not_satisfied",
        }),
      ],
    });

    expect(artifact.firstGateFailure).toEqual({
      shiftLapseProfileId: "stage1_centerline_alpha_0p9900_v1",
      failedGate: "wall_safety",
      failureReason: "wall_safety_guardrail_not_satisfied",
    });
    expect(artifact.robustnessStatus).toBe(
      "threshold_limited_over_tested_bracket",
    );
    expect(String(artifact.robustnessSummary)).toContain("threshold-like");
    expect(String(artifact.robustnessSummary)).not.toMatch(/speed|ETA/i);
  });

  it("publishes a stronger-side boundary sweep into its own namespace without touching canonical latest aliases", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warp-boundary-sweep-"));
    const stateByProfile = new Map(
      BOUNDARY_PROFILE_SPECS.map((spec) => [
        spec.profileId,
        makeShiftLapseSweepTimingPipelineState({
          profileId: spec.profileId,
          alpha: spec.alpha,
        }),
      ]),
    );
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(makeFreshPipelineState()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async (state: Record<string, any>) => {
        const profileId = String(
          state?.dynamicConfig?.shiftLapseProfileId ?? SELECTED_SHIFT_LAPSE_PROFILE_ID,
        );
        return (
          stateByProfile.get(profileId) ??
          makeShiftLapseSweepTimingPipelineState({
            profileId,
            alpha: TUNED_CENTERLINE_ALPHA,
          })
        );
      }),
      setGlobalPipelineState: vi.fn(),
      resolveCommittedLocalRestMissionTargetDistanceContract: vi.fn(() =>
        makeWarpMissionTargetDistanceFixture(),
      ),
    }));

    const canonicalWorldlineLatestPath = path.join(
      REPO_ROOT,
      "artifacts/research/full-solve/nhm2-warp-worldline-proof-latest.json",
    );
    const canonicalWorldlineBefore = fs.readFileSync(canonicalWorldlineLatestPath, "utf8");
    const { publishNhm2ShiftLapseBoundarySweep } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const boundaryArtifactRoot = path.join(
      tempDir,
      "artifacts/research/full-solve/selected-family/nhm2-shift-lapse/boundary-sweep",
    );
    const boundaryAuditRoot = path.join(
      tempDir,
      "docs/audits/research/selected-family/nhm2-shift-lapse/boundary-sweep",
    );

    const published = await publishNhm2ShiftLapseBoundarySweep({
      baseUrl: "http://example.test",
      artifactRootDir: boundaryArtifactRoot,
      auditRootDir: boundaryAuditRoot,
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const profile of BOUNDARY_PROFILE_SPECS) {
      const profileArtifactDir = path.join(boundaryArtifactRoot, profile.profileId);
      expectGateAdmittedTransportSurface(
        path.join(profileArtifactDir, "nhm2-warp-worldline-proof-latest.json"),
        "warp.metric.T00.nhm2.shift_lapse",
        profile.profileId,
      );
    }

    const boundaryResultJson = readJsonFile<Record<string, any>>(
      published.boundaryArtifact.latestJsonPath,
    );
    expect(boundaryResultJson.boundaryProfileIds).toEqual(
      BOUNDARY_PROFILE_SPECS.map((entry) => entry.profileId),
    );
    expect(boundaryResultJson.testedStrongerBracketStopProfileId).toBe(
      "stage1_centerline_alpha_0p7300_v1",
    );
    expect(boundaryResultJson.testedStrongerBracketStopCenterlineAlpha).toBe(0.73);
    expect(boundaryResultJson.strongestProfileKeepingAllGatesPassing).toBe(
      "stage1_centerline_alpha_0p7300_v1",
    );
    expect(boundaryResultJson.firstGateFailure).toBeNull();
    expect(boundaryResultJson.firstFailedGate).toBeNull();
    expect(boundaryResultJson.failureBoundaryStatus).toBe(
      "no_failure_reached_within_tested_stronger_bracket",
    );
    expect(boundaryResultJson.marginFromReferenceProfile.toShiftLapseProfileId).toBe(
      "stage1_centerline_alpha_0p7300_v1",
    );
    expect(boundaryResultJson.marginFromReferenceProfile.deltaCenterlineAlpha).toBeCloseTo(
      0.265,
      12,
    );
    expect(boundaryResultJson.scalingStatusWithinPassingRegion).toBe("monotonic");
    expect(boundaryResultJson.timingDifferentialTrend).toBe(
      "growing_monotonically_within_tested_bracket",
    );
    expect(boundaryResultJson.lowExpansionUsageTrend).toBe(
      "flat_within_tested_bracket",
    );
    expect(boundaryResultJson.wallSafetyUsageTrend).toBe(
      "flat_within_tested_bracket",
    );
    expect(boundaryResultJson.lowExpansionDivergenceUsage).toBeCloseTo(0.1, 12);
    expect(boundaryResultJson.lowExpansionThetaKUsage).toBeCloseTo(0.1, 12);
    expect(boundaryResultJson.lowExpansionWorstUsage).toBeCloseTo(0.1, 12);
    expect(boundaryResultJson.lowExpansionWorstMargin).toBeCloseTo(0.0009, 12);
    expect(boundaryResultJson.wallSafetyBetaUsage).toBeCloseTo(0.2, 12);
    expect(boundaryResultJson.wallSafetyBetaMargin).toBeCloseTo(0.8, 12);
    expect(boundaryResultJson.wallSafetyHorizonMargin).toBeCloseTo(0.4, 12);
    expect(boundaryResultJson.wallSafetyWorstUsage).toBeCloseTo(0.2, 12);
    expect(boundaryResultJson.wallSafetyWorstMargin).toBeCloseTo(0.4, 12);
    expect(boundaryResultJson.lowExpansionHeadroomTrend).toBe(
      "flat_within_tested_bracket",
    );
    expect(boundaryResultJson.wallSafetyHeadroomTrend).toBe(
      "flat_within_tested_bracket",
    );
    expect(boundaryResultJson.mostLikelyFirstFailureGate).toBe(
      "unresolved_within_tested_bracket",
    );
    expect(String(boundaryResultJson.effectVsHeadroomInterpretation)).toContain(
      "low-expansion threshold usage remains flat",
    );
    expect(String(boundaryResultJson.effectVsHeadroomInterpretation)).toContain(
      "wall-safety threshold usage remains flat",
    );
    expect(String(boundaryResultJson.boundarySummary)).not.toMatch(/speed|ETA/i);
    expect(String(boundaryResultJson.effectVsHeadroomInterpretation)).not.toMatch(
      /speed|ETA/i,
    );

    const boundaryResultMd = fs.readFileSync(published.boundaryArtifact.latestMdPath, "utf8");
    for (const profile of BOUNDARY_PROFILE_SPECS) {
      expect(boundaryResultMd).toContain(profile.profileId);
    }
    expect(boundaryResultMd).toContain("no_failure_reached_within_tested_stronger_bracket");
    expect(boundaryResultMd).toContain("boundary-sweep");
    expect(boundaryResultMd).toContain("stage1_centerline_alpha_0p7300_v1");
    expect(boundaryResultMd).toContain("Trend Summary");
    expect(boundaryResultMd).toContain("Threshold Usage Summary");
    expect(boundaryResultMd).toContain("unresolved_within_tested_bracket");

    const canonicalWorldlineAfter = fs.readFileSync(canonicalWorldlineLatestPath, "utf8");
    expect(canonicalWorldlineAfter).toBe(canonicalWorldlineBefore);
    expect(canonicalWorldlineAfter).toContain(
      '"metricT00Ref": "warp.metric.T00.natario_sdf.shift"',
    );
  });

  it("stops the stronger-side boundary publication at the first real gate failure", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "warp-boundary-sweep-first-failure-"),
    );
    const makeWallSafetyFailState = (profileId: string, alpha: number) => {
      const failingState = makeShiftLapseSweepTimingPipelineState({
        profileId,
        alpha,
      }) as Record<string, any>;
      const sourceSurfaces = [
        failingState.warpWorldline?.sourceSurface,
        failingState.warpCruiseEnvelopePreflight?.sourceSurface,
        failingState.warpRouteTimeWorldline?.sourceSurface,
        failingState.warpMissionTimeEstimator?.sourceSurface,
        failingState.warpMissionTimeComparison?.sourceSurface,
        failingState.warpCruiseEnvelope?.sourceSurface,
        failingState.warpInHullProperAcceleration?.sourceSurface,
      ].filter((entry): entry is Record<string, any> => Boolean(entry));
      for (const sourceSurface of sourceSurfaces) {
        sourceSurface.transportCertificationStatus =
          "bounded_transport_fail_closed_reference_only";
        const gate = sourceSurface.shiftLapseTransportPromotionGate;
        if (gate && typeof gate === "object") {
          gate.status = "fail";
          gate.reason = "wall_safety_guardrail_not_satisfied";
          gate.transportCertificationStatus =
            "bounded_transport_fail_closed_reference_only";
          gate.wallSafetyStatus = "fail";
          gate.wallSafetyReason = "wall_safety_guardrail_not_satisfied";
        }
      }
      const rootGate = {
        ...(failingState.shiftLapseTransportPromotionGate ?? {}),
        status: "fail",
        reason: "wall_safety_guardrail_not_satisfied",
        transportCertificationStatus:
          "bounded_transport_fail_closed_reference_only",
        wallSafetyStatus: "fail",
        wallSafetyReason: "wall_safety_guardrail_not_satisfied",
        authoritativeLowExpansionStatus: "pass",
        authoritativeLowExpansionSource: "gr_evolve_brick",
        centerlineAlpha: alpha,
        centerlineDtauDt: alpha,
        shiftLapseProfileId: profileId,
        shiftLapseProfileStage: "controlled_tuning_stage_1",
        shiftLapseProfileLabel: `Synthetic sweep profile ${profileId}`,
        shiftLapseProfileNote: `Synthetic selected-family robustness-sweep fixture for ${profileId}.`,
      };
      failingState.shiftLapseTransportPromotionGate = rootGate;
      return failingState;
    };
    const stateByProfile = new Map(
      BOUNDARY_PROFILE_SPECS.map((spec) => {
        const failingState =
          spec.profileId === "stage1_centerline_alpha_0p9825_v1"
            ? makeWallSafetyFailState(spec.profileId, spec.alpha)
            : makeShiftLapseSweepTimingPipelineState({
                profileId: spec.profileId,
                alpha: spec.alpha,
              });
        return [spec.profileId, failingState];
      }),
    );
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(makeFreshPipelineState()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async (state: Record<string, any>) => {
        const profileId = String(
          state?.dynamicConfig?.shiftLapseProfileId ?? SELECTED_SHIFT_LAPSE_PROFILE_ID,
        );
        return (
          stateByProfile.get(profileId) ??
          makeShiftLapseSweepTimingPipelineState({
            profileId,
            alpha: TUNED_CENTERLINE_ALPHA,
          })
        );
      }),
      setGlobalPipelineState: vi.fn(),
      resolveCommittedLocalRestMissionTargetDistanceContract: vi.fn(() =>
        makeWarpMissionTargetDistanceFixture(),
      ),
    }));

    const { publishNhm2ShiftLapseBoundarySweep } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const boundaryArtifactRoot = path.join(
      tempDir,
      "artifacts/research/full-solve/selected-family/nhm2-shift-lapse/boundary-sweep",
    );
    const boundaryAuditRoot = path.join(
      tempDir,
      "docs/audits/research/selected-family/nhm2-shift-lapse/boundary-sweep",
    );

    const published = await publishNhm2ShiftLapseBoundarySweep({
      baseUrl: "http://example.test",
      artifactRootDir: boundaryArtifactRoot,
      auditRootDir: boundaryAuditRoot,
    });

    const boundaryResultJson = readJsonFile<Record<string, any>>(
      published.boundaryArtifact.latestJsonPath,
    );
    expect(boundaryResultJson.boundaryProfileIds).toEqual([
      "stage1_centerline_alpha_0p9875_v1",
      "stage1_centerline_alpha_0p9850_v1",
      "stage1_centerline_alpha_0p9825_v1",
    ]);
    expect(boundaryResultJson.testedStrongerBracketStopProfileId).toBe(
      "stage1_centerline_alpha_0p9825_v1",
    );
    expect(boundaryResultJson.strongestProfileKeepingAllGatesPassing).toBe(
      "stage1_centerline_alpha_0p9850_v1",
    );
    expect(boundaryResultJson.firstGateFailure).toBe(
      "stage1_centerline_alpha_0p9825_v1",
    );
    expect(boundaryResultJson.firstFailedGate).toBe("wall_safety");
    expect(boundaryResultJson.firstGateFailureReason).toBe(
      "wall_safety_guardrail_not_satisfied",
    );

    expect(
      fs.existsSync(
        path.join(
          boundaryArtifactRoot,
          "stage1_centerline_alpha_0p9800_v1",
          "nhm2-warp-worldline-proof-latest.json",
        ),
      ),
    ).toBe(false);
  });

  it("publishes a selected-family envelope suite with direct GR perturbation cases and explicit mixed outcomes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warp-envelope-suite-"));
    const cloneState = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const stateByProfile = new Map(
      [...SWEEP_PROFILE_SPECS, ...BOUNDARY_PROFILE_SPECS].map((spec) => [
        spec.profileId,
        makeShiftLapseSweepTimingPipelineState({
          profileId: spec.profileId,
          alpha: spec.alpha,
        }),
      ]),
    );
    const defaultSelectedState = makeShiftLapseSweepTimingPipelineState({
      profileId: SELECTED_SHIFT_LAPSE_PROFILE_ID,
      alpha: TUNED_CENTERLINE_ALPHA,
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(makeFreshPipelineState()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const applyGateFromDiagnostics = (
      state: Record<string, any>,
      gr: Record<string, any>,
    ) => {
      const divBetaRms = Number(gr?.divBeta?.rms ?? 0);
      const betaUsage = Math.max(
        Number(gr?.gauge?.betaOverAlphaMax ?? 0),
        Number(gr?.gauge?.betaOutwardOverAlphaWallMax ?? 0),
      );
      const wallHorizonMargin = Number(gr?.gauge?.wallHorizonMargin ?? 0);
      const lowExpansionStatus = divBetaRms <= 1e-3 ? "pass" : "fail";
      const wallSafetyStatus =
        betaUsage <= 1 && wallHorizonMargin > 0 ? "pass" : "fail";
      const gateStatus =
        lowExpansionStatus === "pass" && wallSafetyStatus === "pass"
          ? "pass"
          : "fail";
      const transportCertificationStatus =
        gateStatus === "pass"
          ? "bounded_transport_proof_bearing_gate_admitted"
          : "bounded_transport_fail_closed_reference_only";
      const reason =
        lowExpansionStatus !== "pass"
          ? "brick_native_divergence_constraint_failed"
          : wallSafetyStatus !== "pass"
            ? "wall_safety_guardrail_not_satisfied"
            : "shift_lapse_transport_promotion_gate_pass";
      const gate = {
        ...(state.shiftLapseTransportPromotionGate ?? {}),
        status: gateStatus,
        reason,
        transportCertificationStatus,
        authoritativeLowExpansionStatus: lowExpansionStatus,
        authoritativeLowExpansionSource: "gr_evolve_brick",
        divergenceRms: divBetaRms,
        divergenceMaxAbs: Number(gr?.divBeta?.maxAbs ?? divBetaRms * 2),
        divergenceTolerance: 1e-3,
        thetaKConsistencyStatus: lowExpansionStatus === "pass" ? "pass" : "fail",
        thetaKResidualAbs: divBetaRms,
        thetaKTolerance: 1e-3,
        wallSafetyStatus,
        wallSafetyReason:
          wallSafetyStatus === "pass"
            ? "wall_safety_guardrail_ok"
            : "wall_safety_guardrail_not_satisfied",
        betaOverAlphaMax: Number(gr?.gauge?.betaOverAlphaMax ?? 0),
        betaOutwardOverAlphaWallMax: Number(
          gr?.gauge?.betaOutwardOverAlphaWallMax ?? 0,
        ),
        wallHorizonMargin,
      };
      state.shiftLapseTransportPromotionGate = gate;
      const sourceSurfaces = [
        state.warpWorldline?.sourceSurface,
        state.warpCruiseEnvelopePreflight?.sourceSurface,
        state.warpRouteTimeWorldline?.sourceSurface,
        state.warpMissionTimeEstimator?.sourceSurface,
        state.warpMissionTimeComparison?.sourceSurface,
        state.warpCruiseEnvelope?.sourceSurface,
        state.warpInHullProperAcceleration?.sourceSurface,
      ].filter((entry): entry is Record<string, any> => Boolean(entry));
      for (const sourceSurface of sourceSurfaces) {
        sourceSurface.transportCertificationStatus = transportCertificationStatus;
        sourceSurface.shiftLapseTransportPromotionGate = {
          ...(sourceSurface.shiftLapseTransportPromotionGate ?? {}),
          ...gate,
        };
      }
    };
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async (state: Record<string, any>) => {
        const profileId = String(
          state?.dynamicConfig?.shiftLapseProfileId ?? SELECTED_SHIFT_LAPSE_PROFILE_ID,
        );
        const nextState = cloneState(
          stateByProfile.get(profileId) ?? defaultSelectedState,
        ) as Record<string, any>;
        if (state?.gr) {
          nextState.gr = state.gr;
          applyGateFromDiagnostics(nextState, state.gr as Record<string, any>);
        }
        return nextState;
      }),
      setGlobalPipelineState: vi.fn(),
      resolveCommittedLocalRestMissionTargetDistanceContract: vi.fn(() =>
        makeWarpMissionTargetDistanceFixture(),
      ),
    }));
    vi.doMock("../server/gr-evolve-brick.ts", () => ({
      buildGrEvolveBrick: vi.fn((input: Record<string, any>) => ({
        dims: input?.dims ?? [96, 96, 96],
        boundary: input?.boundary ?? { mode: "clamp" },
      })),
      buildGrDiagnostics: vi.fn((brick: Record<string, any>) => {
        const dim = Number(brick?.dims?.[0] ?? 96);
        const boundaryMode = String(brick?.boundary?.mode ?? "clamp");
        const betaUsage =
          boundaryMode === "outflow" ? 1.2 : boundaryMode === "sommerfeld" ? 0.7 : 0.2;
        const wallHorizonMargin =
          boundaryMode === "outflow" ? -0.05 : boundaryMode === "sommerfeld" ? 0.25 : 0.4;
        const divBetaRms = boundaryMode === "outflow" ? 2e-3 : 2e-4;
        const solverStatus = dim === 64 ? "NOT_CERTIFIED" : "CERTIFIED";
        const totalClampFraction = dim === 64 ? 0.012 : 0.002;
        return {
          grid: { dims: brick.dims, voxelSize_m: [1, 1, 1] },
          solver: {
            health: {
              status: solverStatus,
              reasons:
                solverStatus === "NOT_CERTIFIED" ? ["clamp fraction high"] : [],
              alphaClampFraction: totalClampFraction / 2,
              kClampFraction: totalClampFraction / 2,
              totalClampFraction,
              maxAlphaBeforeClamp: dim === 64 ? 2.1 : 1.2,
              maxKBeforeClamp: dim === 64 ? 2.05 : 1.1,
            },
          },
          gauge: {
            betaOverAlphaMax: betaUsage,
            betaOutwardOverAlphaWallMax: betaUsage,
            wallHorizonMargin,
          },
          divBeta: {
            rms: divBetaRms,
            maxAbs: divBetaRms * 2,
            source: "gr_evolve_brick",
          },
        };
      }),
    }));

    const {
      publishNhm2ShiftLapseEnvelopeSuite,
    } = await import("../scripts/warp-york-control-family-proof-pack");
    const {
      isNhm2EnvelopePerturbationArtifact,
    } = await import("../shared/contracts/nhm2-envelope-perturbation-suite.v1");

    const published = await publishNhm2ShiftLapseEnvelopeSuite({
      baseUrl: "http://example.test",
      selectedFamilyArtifactRootDir: path.join(
        tempDir,
        "artifacts/research/full-solve/selected-family/nhm2-shift-lapse",
      ),
      selectedFamilyAuditRootDir: path.join(
        tempDir,
        "docs/audits/research/selected-family/nhm2-shift-lapse",
      ),
      artifactRootDir: path.join(
        tempDir,
        "artifacts/research/full-solve/selected-family/nhm2-shift-lapse/envelope",
      ),
      auditRootDir: path.join(
        tempDir,
        "docs/audits/research/selected-family/nhm2-shift-lapse/envelope",
      ),
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    expect(
      isNhm2EnvelopePerturbationArtifact(published.envelopeArtifact.artifact),
    ).toBe(true);
    expect(published.envelopeArtifact.artifact.suiteOrder).toEqual([
      "resolution_sensitivity",
      "boundary_condition_sensitivity",
      "local_lapse_profile_perturbations",
      "stronger_boundary_lapse_perturbations",
    ]);

    const resolutionSuite = published.envelopeArtifact.artifact.suites.find(
      (entry) => entry.suiteId === "resolution_sensitivity",
    );
    expect(resolutionSuite?.caseCount).toBe(3);
    expect(
      resolutionSuite?.cases.find((entry) => entry.caseId === "resolution_064")?.status,
    ).toBe("review");

    const boundarySuite = published.envelopeArtifact.artifact.suites.find(
      (entry) => entry.suiteId === "boundary_condition_sensitivity",
    );
    expect(
      boundarySuite?.cases.find((entry) => entry.caseId === "boundary_outflow")?.status,
    ).toBe("fail");
    expect(
      boundarySuite?.cases.find((entry) => entry.caseId === "boundary_outflow")?.reasonCodes,
    ).toContain("negative_result_preserved");

    const localProfileSuite = published.envelopeArtifact.artifact.suites.find(
      (entry) => entry.suiteId === "local_lapse_profile_perturbations",
    );
    expect(localProfileSuite?.caseOrder).toContain(
      `profile_${SELECTED_SHIFT_LAPSE_PROFILE_ID}`,
    );

    const envelopeMarkdown = fs.readFileSync(
      published.envelopeArtifact.latestMdPath,
      "utf8",
    );
    expect(envelopeMarkdown).toContain("Resolution Sensitivity");
    expect(envelopeMarkdown).toContain("Boundary-Condition Sensitivity");
    expect(envelopeMarkdown).toContain("Stronger-Boundary Lapse Perturbations");
  });

  it("publishes reuse-mode envelope evidence without crashing when selected-bundle child artifacts are missing", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warp-envelope-reuse-"));
    const cloneState = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const defaultSelectedState = makeShiftLapseSweepTimingPipelineState({
      profileId: SELECTED_SHIFT_LAPSE_PROFILE_ID,
      alpha: TUNED_CENTERLINE_ALPHA,
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(makeFreshPipelineState()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const applyGateFromDiagnostics = (
      state: Record<string, any>,
      gr: Record<string, any>,
    ) => {
      const divBetaRms = Number(gr?.divBeta?.rms ?? 0);
      const betaUsage = Math.max(
        Number(gr?.gauge?.betaOverAlphaMax ?? 0),
        Number(gr?.gauge?.betaOutwardOverAlphaWallMax ?? 0),
      );
      const wallHorizonMargin = Number(gr?.gauge?.wallHorizonMargin ?? 0);
      const lowExpansionStatus = divBetaRms <= 1e-3 ? "pass" : "fail";
      const wallSafetyStatus =
        betaUsage <= 1 && wallHorizonMargin > 0 ? "pass" : "fail";
      const gateStatus =
        lowExpansionStatus === "pass" && wallSafetyStatus === "pass"
          ? "pass"
          : "fail";
      const transportCertificationStatus =
        gateStatus === "pass"
          ? "bounded_transport_proof_bearing_gate_admitted"
          : "bounded_transport_fail_closed_reference_only";
      const reason =
        lowExpansionStatus !== "pass"
          ? "brick_native_divergence_constraint_failed"
          : wallSafetyStatus !== "pass"
            ? "wall_safety_guardrail_not_satisfied"
            : "shift_lapse_transport_promotion_gate_pass";
      state.shiftLapseTransportPromotionGate = {
        ...(state.shiftLapseTransportPromotionGate ?? {}),
        status: gateStatus,
        reason,
        transportCertificationStatus,
        authoritativeLowExpansionStatus: lowExpansionStatus,
        authoritativeLowExpansionSource: "gr_evolve_brick",
        divergenceRms: divBetaRms,
        divergenceMaxAbs: Number(gr?.divBeta?.maxAbs ?? divBetaRms * 2),
        divergenceTolerance: 1e-3,
        thetaKConsistencyStatus: lowExpansionStatus === "pass" ? "pass" : "fail",
        thetaKResidualAbs: divBetaRms,
        thetaKTolerance: 1e-3,
        wallSafetyStatus,
        wallSafetyReason:
          wallSafetyStatus === "pass"
            ? "wall_safety_guardrail_ok"
            : "wall_safety_guardrail_not_satisfied",
        betaOverAlphaMax: Number(gr?.gauge?.betaOverAlphaMax ?? 0),
        betaOutwardOverAlphaWallMax: Number(
          gr?.gauge?.betaOutwardOverAlphaWallMax ?? 0,
        ),
        wallHorizonMargin,
      };
    };
    vi.doMock("../server/energy-pipeline.ts", () => ({
      initializePipelineState: vi.fn(() => ({})),
      getGlobalPipelineState: vi.fn(() => ({})),
      calculateEnergyPipeline: vi.fn(async (state: Record<string, any>) => {
        const nextState = cloneState(defaultSelectedState) as Record<string, any>;
        if (state?.gr) {
          nextState.gr = state.gr;
          applyGateFromDiagnostics(nextState, state.gr as Record<string, any>);
        }
        return nextState;
      }),
      setGlobalPipelineState: vi.fn(),
      resolveCommittedLocalRestMissionTargetDistanceContract: vi.fn(() =>
        makeWarpMissionTargetDistanceFixture(),
      ),
    }));
    vi.doMock("../server/gr-evolve-brick.ts", () => ({
      buildGrEvolveBrick: vi.fn((input: Record<string, any>) => ({
        dims: input?.dims ?? [96, 96, 96],
        boundary: input?.boundary ?? { mode: "clamp" },
      })),
      buildGrDiagnostics: vi.fn((brick: Record<string, any>) => ({
        grid: { dims: brick.dims, voxelSize_m: [1, 1, 1] },
        solver: {
          health: {
            status: "CERTIFIED",
            reasons: [],
            alphaClampFraction: 0.001,
            kClampFraction: 0.001,
            totalClampFraction: 0.002,
            maxAlphaBeforeClamp: 1.1,
            maxKBeforeClamp: 1.05,
          },
        },
        gauge: {
          betaOverAlphaMax: 0.2,
          betaOutwardOverAlphaWallMax: 0.2,
          wallHorizonMargin: 0.4,
        },
        divBeta: {
          rms: 2e-4,
          maxAbs: 4e-4,
          source: "gr_evolve_brick",
        },
      })),
    }));

    const {
      buildNhm2ShiftLapseProfileSweepArtifact,
      buildNhm2ShiftLapseBoundarySweepArtifact,
      publishNhm2ShiftLapseEnvelopeSuite,
    } = await import("../scripts/warp-york-control-family-proof-pack");

    const selectedFamilyArtifactRootDir = path.join(
      tempDir,
      "artifacts/research/full-solve/selected-family/nhm2-shift-lapse",
    );
    const selectedFamilyAuditRootDir = path.join(
      tempDir,
      "docs/audits/research/selected-family/nhm2-shift-lapse",
    );
    const selectedEntryFixture = makeShiftLapseProfileSweepEntryFixture({
      profileId: SELECTED_SHIFT_LAPSE_PROFILE_ID,
      alpha: TUNED_CENTERLINE_ALPHA,
    });
    const boundaryEntryFixture = makeShiftLapseProfileSweepEntryFixture({
      profileId: SELECTED_SHIFT_LAPSE_PROFILE_ID,
      alpha: TUNED_CENTERLINE_ALPHA,
      rootSegment: "boundary-sweep",
    });
    const rebaseEntryPaths = <
      T extends ReturnType<typeof makeShiftLapseProfileSweepEntryFixture>,
    >(
      entry: T,
      rootSegment: "sweep" | "boundary-sweep",
    ): T => ({
      ...entry,
      artifactRoot: path.join(selectedFamilyArtifactRootDir, rootSegment, entry.shiftLapseProfileId),
      auditRoot: path.join(selectedFamilyAuditRootDir, rootSegment, entry.shiftLapseProfileId),
      transportResultLatestJsonPath: path.join(
        selectedFamilyArtifactRootDir,
        rootSegment,
        entry.shiftLapseProfileId,
        "nhm2-shift-lapse-transport-result-latest.json",
      ),
      transportResultLatestMdPath: path.join(
        selectedFamilyAuditRootDir,
        rootSegment,
        entry.shiftLapseProfileId,
        "warp-nhm2-shift-lapse-transport-result-latest.md",
      ),
      selectedBundleArtifacts: {
        worldlineLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-warp-worldline-proof-latest.json",
        ),
        cruiseEnvelopePreflightLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-cruise-envelope-preflight-latest.json",
        ),
        routeTimeWorldlineLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-route-time-worldline-latest.json",
        ),
        missionTimeEstimatorLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-mission-time-estimator-latest.json",
        ),
        missionTimeComparisonLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-mission-time-comparison-latest.json",
        ),
        shiftVsLapseDecompositionLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-shift-vs-lapse-decomposition-latest.json",
        ),
        cruiseEnvelopeLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-cruise-envelope-latest.json",
        ),
        inHullProperAccelerationLatestJsonPath: path.join(
          selectedFamilyArtifactRootDir,
          rootSegment,
          entry.shiftLapseProfileId,
          "nhm2-in-hull-proper-acceleration-latest.json",
        ),
      },
    });
    const selectedEntry = rebaseEntryPaths(selectedEntryFixture, "sweep");
    const boundaryEntry = rebaseEntryPaths(boundaryEntryFixture, "boundary-sweep");

    const transportLatestJsonPath = path.join(
      selectedFamilyArtifactRootDir,
      "nhm2-shift-lapse-transport-result-latest.json",
    );
    const transportLatestMdPath = path.join(
      selectedFamilyAuditRootDir,
      "warp-nhm2-shift-lapse-transport-result-latest.md",
    );
    fs.mkdirSync(path.dirname(transportLatestJsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(transportLatestMdPath), { recursive: true });
    fs.writeFileSync(
      transportLatestJsonPath,
      `${JSON.stringify(
        {
          artifactType: "nhm2_shift_lapse_transport_result/v1",
          selectedBundleArtifacts: selectedEntry.selectedBundleArtifacts,
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(transportLatestMdPath, "# transport\n");

    const sweepLatestJsonPath = path.join(
      selectedFamilyArtifactRootDir,
      "sweep",
      "nhm2-shift-lapse-profile-sweep-latest.json",
    );
    const sweepLatestMdPath = path.join(
      selectedFamilyAuditRootDir,
      "sweep",
      "warp-nhm2-shift-lapse-profile-sweep-latest.md",
    );
    fs.mkdirSync(path.dirname(sweepLatestJsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(sweepLatestMdPath), { recursive: true });
    fs.writeFileSync(
      sweepLatestJsonPath,
      `${JSON.stringify(
        buildNhm2ShiftLapseProfileSweepArtifact({
          entries: [selectedEntry],
        }),
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(sweepLatestMdPath, "# sweep\n");

    const boundaryLatestJsonPath = path.join(
      selectedFamilyArtifactRootDir,
      "boundary-sweep",
      "nhm2-shift-lapse-boundary-sweep-latest.json",
    );
    const boundaryLatestMdPath = path.join(
      selectedFamilyAuditRootDir,
      "boundary-sweep",
      "warp-nhm2-shift-lapse-boundary-sweep-latest.md",
    );
    fs.mkdirSync(path.dirname(boundaryLatestJsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(boundaryLatestMdPath), { recursive: true });
    fs.writeFileSync(
      boundaryLatestJsonPath,
      `${JSON.stringify(
        buildNhm2ShiftLapseBoundarySweepArtifact({
          entries: [boundaryEntry],
        }),
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(boundaryLatestMdPath, "# boundary\n");

    const published = await publishNhm2ShiftLapseEnvelopeSuite({
      baseUrl: "http://example.test",
      selectedFamilyArtifactRootDir,
      selectedFamilyAuditRootDir,
      artifactRootDir: path.join(
        tempDir,
        "artifacts/research/full-solve/selected-family/nhm2-shift-lapse/envelope",
      ),
      auditRootDir: path.join(
        tempDir,
        "docs/audits/research/selected-family/nhm2-shift-lapse/envelope",
      ),
      reuseExistingSelectedArtifacts: true,
    });

    const localProfileSuite = published.envelopeArtifact.artifact.suites.find(
      (entry) => entry.suiteId === "local_lapse_profile_perturbations",
    );
    const reusedCase = localProfileSuite?.cases.find(
      (entry) => entry.caseId === `profile_${SELECTED_SHIFT_LAPSE_PROFILE_ID}`,
    );
    expect(reusedCase?.lowExpansion.status).toBe("pass");
    expect(reusedCase?.wallSafety.status).toBe("pass");
    expect(reusedCase?.missionTime.source).toBe("selected_bundle_contracts_reused");
    expect(reusedCase?.status).toBe("review");
    expect(reusedCase?.reasonCodes).toContain("mission_time_reused_from_selected_bundle");
    expect(reusedCase?.artifactRefs.worldlineLatestJsonPath).toBe(
      selectedEntry.selectedBundleArtifacts.worldlineLatestJsonPath,
    );
    expect(fs.existsSync(published.envelopeArtifact.latestJsonPath)).toBe(true);
    expect(fs.existsSync(published.envelopeArtifact.latestMdPath)).toBe(true);
  });

  it("reports a wall-safety first failure honestly in the boundary summary", async () => {
    const { buildNhm2ShiftLapseBoundarySweepArtifact } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const artifact = buildNhm2ShiftLapseBoundarySweepArtifact({
      entries: [
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9875_v1",
          alpha: 0.9875,
          rootSegment: "boundary-sweep",
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9850_v1",
          alpha: 0.985,
          rootSegment: "boundary-sweep",
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9825_v1",
          alpha: 0.9825,
          rootSegment: "boundary-sweep",
          transportCertificationStatus:
            "bounded_transport_fail_closed_reference_only",
          promotionGateStatus: "fail",
          promotionGateReason: "wall_safety_guardrail_not_satisfied",
          wallSafetyStatus: "fail",
          wallSafetyReason: "wall_safety_guardrail_not_satisfied",
        }),
      ],
    });

    expect(artifact.strongestProfileKeepingAllGatesPassing).toBe(
      "stage1_centerline_alpha_0p9850_v1",
    );
    expect(artifact.firstGateFailure).toBe("stage1_centerline_alpha_0p9825_v1");
    expect(artifact.firstFailedGate).toBe("wall_safety");
    expect(artifact.firstGateFailureReason).toBe(
      "wall_safety_guardrail_not_satisfied",
    );
    expect(artifact.failureBoundaryStatus).toBe(
      "first_failure_reached_within_tested_stronger_bracket",
    );
    expect(artifact.marginFromReferenceProfile.deltaCenterlineAlpha).toBeCloseTo(
      0.0125,
      12,
    );
    expect(artifact.marginFromStrongestPassingProfile.deltaCenterlineAlpha).toBeCloseTo(
      0.0025,
      12,
    );
    expect(String(artifact.boundarySummary)).toContain("first gate failure");
    expect(String(artifact.boundarySummary)).not.toMatch(/speed|ETA/i);
  });

  it("classifies flat headroom trends honestly when the passing stronger-side bracket stays constant", async () => {
    const { buildNhm2ShiftLapseBoundarySweepArtifact } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const artifact = buildNhm2ShiftLapseBoundarySweepArtifact({
      entries: [
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9875_v1",
          alpha: 0.9875,
          rootSegment: "boundary-sweep",
          divergenceRms: 0,
          divergenceMaxAbs: 0,
          thetaKResidualAbs: 0,
          betaOutwardOverAlphaWallMax: 2.2e-17,
          wallHorizonMargin: 1,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9850_v1",
          alpha: 0.985,
          rootSegment: "boundary-sweep",
          divergenceRms: 0,
          divergenceMaxAbs: 0,
          thetaKResidualAbs: 0,
          betaOutwardOverAlphaWallMax: 2.2e-17,
          wallHorizonMargin: 1,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9825_v1",
          alpha: 0.9825,
          rootSegment: "boundary-sweep",
          divergenceRms: 0,
          divergenceMaxAbs: 0,
          thetaKResidualAbs: 0,
          betaOutwardOverAlphaWallMax: 2.2e-17,
          wallHorizonMargin: 1,
        }),
      ],
    });

    expect(artifact.timingDifferentialTrend).toBe(
      "growing_monotonically_within_tested_bracket",
    );
    expect(artifact.lowExpansionUsageTrend).toBe("flat_within_tested_bracket");
    expect(artifact.wallSafetyUsageTrend).toBe("flat_within_tested_bracket");
    expect(artifact.lowExpansionDivergenceUsage).toBeCloseTo(0, 12);
    expect(artifact.lowExpansionThetaKUsage).toBeCloseTo(0, 12);
    expect(artifact.lowExpansionWorstUsage).toBeCloseTo(0, 12);
    expect(artifact.lowExpansionWorstMargin).toBeCloseTo(0.001, 12);
    expect(artifact.wallSafetyBetaUsage).toBeCloseTo(0.2, 12);
    expect(artifact.wallSafetyBetaMargin).toBeCloseTo(0.8, 12);
    expect(artifact.wallSafetyHorizonMargin).toBeCloseTo(1, 12);
    expect(artifact.wallSafetyWorstUsage).toBeCloseTo(0.2, 12);
    expect(artifact.wallSafetyWorstMargin).toBeCloseTo(0.8, 12);
    expect(artifact.lowExpansionHeadroomTrend).toBe("flat_within_tested_bracket");
    expect(artifact.wallSafetyHeadroomTrend).toBe("flat_within_tested_bracket");
    expect(artifact.mostLikelyFirstFailureGate).toBe(
      "unresolved_within_tested_bracket",
    );
    expect(String(artifact.effectVsHeadroomInterpretation)).toContain(
      "low-expansion threshold usage remains flat",
    );
    expect(String(artifact.effectVsHeadroomInterpretation)).toContain(
      "wall-safety threshold usage remains flat",
    );
    expect(String(artifact.effectVsHeadroomInterpretation)).not.toMatch(/speed|ETA/i);
  });

  it("identifies wall-safety as the likely first failure gate when wall headroom shrinks first", async () => {
    const { buildNhm2ShiftLapseBoundarySweepArtifact } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const artifact = buildNhm2ShiftLapseBoundarySweepArtifact({
      entries: [
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9875_v1",
          alpha: 0.9875,
          rootSegment: "boundary-sweep",
          divergenceRms: 0,
          divergenceMaxAbs: 0,
          thetaKResidualAbs: 0,
          betaOutwardOverAlphaWallMax: 0.10,
          wallHorizonMargin: 0.60,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9850_v1",
          alpha: 0.985,
          rootSegment: "boundary-sweep",
          divergenceRms: 0,
          divergenceMaxAbs: 0,
          thetaKResidualAbs: 0,
          betaOutwardOverAlphaWallMax: 0.18,
          wallHorizonMargin: 0.52,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9825_v1",
          alpha: 0.9825,
          rootSegment: "boundary-sweep",
          divergenceRms: 0,
          divergenceMaxAbs: 0,
          thetaKResidualAbs: 0,
          betaOutwardOverAlphaWallMax: 0.26,
          wallHorizonMargin: 0.44,
        }),
      ],
    });

    expect(artifact.lowExpansionUsageTrend).toBe("flat_within_tested_bracket");
    expect(artifact.wallSafetyUsageTrend).toBe(
      "increasing_within_tested_bracket",
    );
    expect(artifact.wallSafetyBetaUsage).toBeCloseTo(0.26, 12);
    expect(artifact.wallSafetyWorstMargin).toBeCloseTo(0.44, 12);
    expect(artifact.lowExpansionHeadroomTrend).toBe("flat_within_tested_bracket");
    expect(artifact.wallSafetyHeadroomTrend).toBe("shrinking_within_tested_bracket");
    expect(artifact.mostLikelyFirstFailureGate).toBe("wall_safety");
    expect(String(artifact.effectVsHeadroomInterpretation)).toContain(
      "wall-safety threshold usage increases",
    );
    expect(String(artifact.effectVsHeadroomInterpretation)).not.toMatch(/speed|ETA/i);
  });

  it("identifies authoritative low-expansion as the likely first failure gate when divergence headroom shrinks first", async () => {
    const { buildNhm2ShiftLapseBoundarySweepArtifact } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const artifact = buildNhm2ShiftLapseBoundarySweepArtifact({
      entries: [
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9875_v1",
          alpha: 0.9875,
          rootSegment: "boundary-sweep",
          divergenceRms: 1e-4,
          divergenceMaxAbs: 2e-4,
          thetaKResidualAbs: 1e-4,
          betaOutwardOverAlphaWallMax: 0.15,
          wallHorizonMargin: 0.4,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9850_v1",
          alpha: 0.985,
          rootSegment: "boundary-sweep",
          divergenceRms: 3e-4,
          divergenceMaxAbs: 4e-4,
          thetaKResidualAbs: 3e-4,
          betaOutwardOverAlphaWallMax: 0.15,
          wallHorizonMargin: 0.4,
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9825_v1",
          alpha: 0.9825,
          rootSegment: "boundary-sweep",
          divergenceRms: 5e-4,
          divergenceMaxAbs: 6e-4,
          thetaKResidualAbs: 5e-4,
          betaOutwardOverAlphaWallMax: 0.15,
          wallHorizonMargin: 0.4,
        }),
      ],
    });

    expect(artifact.lowExpansionUsageTrend).toBe(
      "increasing_within_tested_bracket",
    );
    expect(artifact.wallSafetyUsageTrend).toBe("flat_within_tested_bracket");
    expect(artifact.lowExpansionDivergenceUsage).toBeCloseTo(0.5, 12);
    expect(artifact.lowExpansionThetaKUsage).toBeCloseTo(0.5, 12);
    expect(artifact.lowExpansionWorstUsage).toBeCloseTo(0.5, 12);
    expect(artifact.lowExpansionWorstMargin).toBeCloseTo(0.0005, 12);
    expect(artifact.lowExpansionHeadroomTrend).toBe(
      "shrinking_within_tested_bracket",
    );
    expect(artifact.wallSafetyHeadroomTrend).toBe("flat_within_tested_bracket");
    expect(artifact.mostLikelyFirstFailureGate).toBe(
      "authoritative_low_expansion",
    );
    expect(String(artifact.effectVsHeadroomInterpretation)).toContain(
      "low-expansion threshold usage increases",
    );
    expect(String(artifact.effectVsHeadroomInterpretation)).not.toMatch(/speed|ETA/i);
  });

  it("reports an authoritative low-expansion first failure honestly in the boundary summary", async () => {
    const { buildNhm2ShiftLapseBoundarySweepArtifact } = await import(
      "../scripts/warp-york-control-family-proof-pack"
    );
    const artifact = buildNhm2ShiftLapseBoundarySweepArtifact({
      entries: [
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9875_v1",
          alpha: 0.9875,
          rootSegment: "boundary-sweep",
        }),
        makeShiftLapseProfileSweepEntryFixture({
          profileId: "stage1_centerline_alpha_0p9850_v1",
          alpha: 0.985,
          rootSegment: "boundary-sweep",
          transportCertificationStatus:
            "bounded_transport_fail_closed_reference_only",
          promotionGateStatus: "fail",
          promotionGateReason: "brick_native_divergence_constraint_failed",
          authoritativeLowExpansionStatus: "fail",
          authoritativeLowExpansionReason: "brick_native_divergence_constraint_failed",
        }),
      ],
    });

    expect(artifact.firstGateFailure).toBe("stage1_centerline_alpha_0p9850_v1");
    expect(artifact.firstFailedGate).toBe("authoritative_low_expansion");
    expect(artifact.firstGateFailureReason).toBe(
      "brick_native_divergence_constraint_failed",
    );
    expect(artifact.failureBoundaryStatus).toBe(
      "first_failure_reached_within_tested_stronger_bracket",
    );
    expect(artifact.marginFromStrongestPassingProfile.toShiftLapseProfileId).toBe(
      "stage1_centerline_alpha_0p9850_v1",
    );
    expect(String(artifact.boundarySummary)).toContain(
      "authoritative_low_expansion",
    );
    expect(String(artifact.boundarySummary)).not.toMatch(/speed|ETA/i);
  });
});
