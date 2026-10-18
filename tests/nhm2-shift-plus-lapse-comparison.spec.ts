import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildShiftPlusLapseComparisonPayload } from "../scripts/warp-shift-plus-lapse-comparison";

const findQuantity = (section: any, quantityId: string) =>
  section?.quantities?.find(
    (quantity: any) => quantity.quantityId === quantityId,
  );

describe("nhm2 shift-plus-lapse comparison companion", () => {
  it("builds a baseline vs generalized comparison artifact with explicit case identities", async () => {
    const payload = await buildShiftPlusLapseComparisonPayload();

    expect(payload.comparisonId).toBe(
      "nhm2_unit_lapse_vs_mild_shift_plus_lapse",
    );
    expect(payload.baselineCase).toEqual(
      expect.objectContaining({
        caseId: "nhm2_unit_lapse_baseline",
        scenarioId: "unit_lapse_nhm2_baseline",
        branch: expect.objectContaining({
          metricT00Ref: "warp.metric.T00.natario_sdf.shift",
          warpFieldType: "natario_sdf",
        }),
      }),
    );
    expect(payload.generalizedCase).toEqual(
      expect.objectContaining({
        caseId: "nhm2_shift_plus_lapse_mild_reference",
        scenarioId: "mild_cabin_gravity_reference",
        authoritativeStatus: "candidate_authoritative_solve_family",
        diagnosticContractAuthoritativeStatus: "reference_only",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus:
          "bounded_transport_fail_closed_reference_only",
        branch: expect.objectContaining({
          metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
          warpFieldType: "nhm2_shift_lapse",
        }),
      }),
    );
  });

  it("preserves precision contexts and flags cross-case source mismatches on mild cabin quantities", async () => {
    const payload = await buildShiftPlusLapseComparisonPayload();
    const splitPerDay = findQuantity(
      payload.cabinGravityComparison,
      "cabin_clock_split_per_day_s",
    );
    const alphaGradient = findQuantity(
      payload.cabinGravityComparison,
      "alphaGradientVec_m_inv",
    );

    expect(payload.baselinePrecisionContext).toEqual(
      expect.objectContaining({
        brickNumericType: "float32",
        channelPrecisionPolicy: "brick_float32_direct",
        underResolutionDetected: false,
      }),
    );
    expect(payload.generalizedPrecisionContext).toEqual(
      expect.objectContaining({
        brickNumericType: "float32",
        companionNumericType: "float64_analytic",
        mildLapseFidelityStatus: "mixed_source_prefer_analytic_for_underflow",
        wallSafetySource: "brick_float32_direct",
      }),
    );
    expect(splitPerDay).toEqual(
      expect.objectContaining({
        units: "s/day",
        baselineSourceKind: "brick_float32_direct",
        generalizedSourceKind: "analytic_lapse_summary_companion",
        sourceKind: "mixed_source_prefer_analytic_for_underflow",
        crossCaseSourceMismatch: true,
      }),
    );
    expect(alphaGradient).toEqual(
      expect.objectContaining({
        units: "1/m",
        baselineSourceKind: "brick_float32_direct",
        generalizedSourceKind: "analytic_lapse_summary_companion",
        crossCaseSourceMismatch: true,
      }),
    );
    expect(payload.provenanceWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantityId: "cabin_clock_split_per_day_s" }),
        expect.objectContaining({ quantityId: "alphaGradientVec_m_inv" }),
      ]),
    );
  });

  it("keeps cabin gravity and wall safety in separate sections and preserves proof hierarchy", async () => {
    const payload = await buildShiftPlusLapseComparisonPayload();
    const wallMargin = findQuantity(
      payload.wallSafetyComparison,
      "wallHorizonMargin",
    );
    const bulkRatio = findQuantity(
      payload.wallSafetyComparison,
      "betaOverAlphaMax",
    );
    const gravitySI = findQuantity(
      payload.cabinGravityComparison,
      "cabin_gravity_gradient_si",
    );

    expect(payload.cabinGravityComparison?.sectionRole).toBe(
      "diagnostic_comparison",
    );
    expect(payload.wallSafetyComparison?.sectionRole).toBe(
      "diagnostic_comparison",
    );
    expect(gravitySI?.units).toBe("m/s^2");
    expect(wallMargin).toEqual(
      expect.objectContaining({
        units: "dimensionless",
        baselineSourceKind: "brick_float32_direct",
        generalizedSourceKind: "brick_float32_direct",
        crossCaseSourceMismatch: false,
      }),
    );
    expect(bulkRatio?.crossCaseSourceMismatch).toBe(false);
    expect(payload.proofPolicyComparison).toEqual(
      expect.objectContaining({
        authoritativeProofSurface: "lane_a_eulerian_comoving_theta_minus_trk",
        baselineBranchStatus: "unit_lapse_baseline_unchanged",
        generalizedBranchStatus:
          "candidate_authoritative_family_transport_gate_controlled_not_claimed_here",
        generalizedFamilyAuthorityStatus:
          "candidate_authoritative_solve_family",
        generalizedTransportCertificationStatus:
          "bounded_transport_fail_closed_reference_only",
        laneAUnchanged: true,
      }),
    );
    expect(payload.proofPolicy.disclaimer).toEqual(
      expect.arrayContaining([
        "Lane A remains authoritative.",
        "nhm2_shift_lapse is a candidate authoritative solve family in provenance/model-selection.",
        "Proof-bearing bounded transport admission for nhm2_shift_lapse remains separately controlled by the authoritative shift-lapse transport-promotion gate and is not claimed by this comparison.",
      ]),
    );
    expect(payload.comparisonSummary?.crossCaseSourceMismatchCount).toBe(5);
    expect(payload.comparisonSummary?.wallSafetySourceParity).toBe(true);
  });

  it("does not overstate analytic fallback in the nested baseline direct-pipeline cabin block", async () => {
    const payload = await buildShiftPlusLapseComparisonPayload();
    const baselineDetails =
      payload.baselineCase?.cabinObservables?.directPipelineCabinObservables
        ?.details;
    const generalizedDetails = payload.generalizedCase?.cabinObservables?.details;

    expect(baselineDetails).toEqual(
      expect.objectContaining({
        source: "unresolved_gravity_gradient",
        gravityGradientSource: "unavailable",
        usedAnalyticGradientCompanion: false,
      }),
    );
    expect(baselineDetails?.analyticCompanionSamples).toEqual(
      expect.objectContaining({
        centerline_alpha: null,
        top_alpha: null,
        bottom_alpha: null,
        eulerian_accel_geom: null,
      }),
    );
    expect(generalizedDetails).toEqual(
      expect.objectContaining({
        source: "analytic_lapse_summary_fallback",
        gravityGradientSource: "analytic_lapse_summary_companion",
        usedAnalyticGradientCompanion: true,
      }),
    );
  });

  it("keeps the published latest artifact aligned with the comparison contract", () => {
    const artifactPath = path.join(
      process.cwd(),
      "artifacts",
      "research",
      "full-solve",
      "nhm2-shift-plus-lapse-comparison-latest.json",
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const splitPerDay = findQuantity(
      artifact.cabinGravityComparison,
      "cabin_clock_split_per_day_s",
    );

    expect(artifact.comparisonId).toBe(
      "nhm2_unit_lapse_vs_mild_shift_plus_lapse",
    );
    expect(artifact.baselineCase?.branch?.metricT00Ref).toBe(
      "warp.metric.T00.natario_sdf.shift",
    );
    expect(artifact.generalizedCase?.branch?.metricT00Ref).toBe(
      "warp.metric.T00.nhm2.shift_lapse",
    );
    expect(artifact.comparisonSummary?.proofHierarchyUnchanged).toBe(true);
    expect(artifact.comparisonSummary?.crossCaseSourceMismatchCount).toBe(5);
    expect(splitPerDay).toEqual(
      expect.objectContaining({
        units: "s/day",
        sourceKind: "mixed_source_prefer_analytic_for_underflow",
      }),
    );
    expect(
      artifact.baselineCase?.cabinObservables?.directPipelineCabinObservables
        ?.details,
    ).toEqual(
      expect.objectContaining({
        source: "unresolved_gravity_gradient",
        gravityGradientSource: "unavailable",
        usedAnalyticGradientCompanion: false,
      }),
    );
  });
});
