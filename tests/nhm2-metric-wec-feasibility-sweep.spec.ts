import { describe, expect, it } from "vitest";

import {
  buildNhm2MetricWecFeasibilityArtifact,
  renderNhm2MetricWecFeasibilityMarkdown,
} from "../scripts/warp-york-control-family-proof-pack";

type Entry = Parameters<typeof buildNhm2MetricWecFeasibilityArtifact>[0]["entries"][number];

const makeEntry = (overrides: Partial<Entry>): Entry => ({
  shiftLapseProfileId: "stage1_centerline_alpha_0p995_v1",
  centerlineAlpha: 0.995,
  observerStatus: "fail",
  metricWecStatus: "fail",
  metricWecEulerianMin: -10,
  metricWecRobustMin: -10,
  metricDecStatus: "fail",
  metricDecEulerianMin: -20,
  metricDecRobustMin: -30,
  tileWecStatus: "fail",
  tileWecEulerianMin: -30,
  tileWecRobustMin: -30,
  observerMetricPrimaryDriver: "wec",
  observerTilePrimaryDriver: "wec",
  metricPrimaryBlockingMode: "eulerian_native",
  tilePrimaryBlockingMode: "eulerian_native",
  observerMetricEmissionAdmissionStatus: "admitted",
  observerMetricT0iAdmissionStatus: "derivable_same_chart_from_existing_state",
  observerMetricOffDiagonalTijAdmissionStatus:
    "derivable_same_chart_from_existing_state",
  modelTermRouteId: "einstein_tensor_geometry_fd4_v1",
  modelTermRouteAdmission: "admitted",
  modelTermDecision: "admit",
  supportFieldRouteAdmissionStatus: "fail",
  fullEinsteinTensorRouteAdmissionStatus: "pass",
  independentCrossCheckStatus: "pass",
  closurePathSelected: "full_einstein_tensor",
  closurePathSupportFieldInterpretation: "non_blocking",
  closurePathSemanticConsistencyStatus: "pass",
  closurePathSemanticConsistencyNote:
    "Selected full_einstein_tensor path is internally consistent with a passing Einstein-route admission; support-field route remains tracked as non-blocking on this path.",
  closurePathInvarianceStatus: "pass",
  closurePathInvarianceNote:
    "Einstein-path invariance checks: independentCrossCheck=pass, finiteDifferenceConvergence=pass, einsteinT00Comparability=pass.",
  recommendedPatchClass: "einstein_semantic_closure_patch",
  closurePathBlockerCodes: [],
  closurePathNonBlockingCodes: ["support_field_route_not_admitted"],
  semanticBlockerSupportFieldRouteNotAdmitted: true,
  ...overrides,
});

describe("nhm2 metric WEC feasibility artifact", () => {
  it("classifies local non-viability when all tested profiles keep metric WEC negative", () => {
    const artifact = buildNhm2MetricWecFeasibilityArtifact({
      entries: [
        makeEntry({
          shiftLapseProfileId: "stage1_centerline_alpha_0p995_v1",
          centerlineAlpha: 0.995,
          metricWecEulerianMin: -58_267_450.98,
          metricWecRobustMin: -58_267_450.98,
        }),
        makeEntry({
          shiftLapseProfileId: "stage1_centerline_alpha_0p9925_v1",
          centerlineAlpha: 0.9925,
          metricWecEulerianMin: -52_000_000,
          metricWecRobustMin: -52_000_000,
        }),
      ],
    });

    expect(artifact.artifactType).toBe("nhm2_metric_wec_feasibility/v1");
    expect(artifact.feasibilityStatus).toBe("local_neighborhood_non_viable");
    expect(artifact.diagnosisClass).toBe("all_tested_profiles_wec_negative");
    expect(artifact.bestMetricWecProfileId).toBe("stage1_centerline_alpha_0p9925_v1");
    expect(artifact.bestMetricWecRobustProfileId).toBe("stage1_centerline_alpha_0p9925_v1");
    expect(artifact.allProfilesMetricWecFail).toBe(true);
    expect(artifact.semanticConsistencyStatus).toBe("pass");
    expect(artifact.invarianceStatus).toBe("pass");
    expect(artifact.recommendedPatchClass).toBe("einstein_semantic_closure_patch");
    expect(artifact.citationRefs.length).toBeGreaterThan(3);
    expect(artifact.checksum).toMatch(/^[a-f0-9]{64}$/);

    const markdown = renderNhm2MetricWecFeasibilityMarkdown(artifact);
    expect(markdown).toContain("NHM2 Metric WEC Feasibility");
    expect(markdown).toContain("supportFieldRouteNotAdmitted");
    expect(markdown).toContain("closurePathSemanticConsistency");
    expect(markdown).toContain("recommendedPatchClass");
    expect(markdown).toContain("local_neighborhood_non_viable");
  });

  it("flags candidate-found mode when a tested profile reaches non-negative metric WEC", () => {
    const artifact = buildNhm2MetricWecFeasibilityArtifact({
      entries: [
        makeEntry({
          shiftLapseProfileId: "stage1_centerline_alpha_0p995_v1",
          metricWecStatus: "fail",
          metricWecEulerianMin: -1,
        }),
        makeEntry({
          shiftLapseProfileId: "stage1_centerline_alpha_0p9975_v1",
          metricWecStatus: "pass",
          metricWecEulerianMin: 0.02,
          metricDecStatus: "pass",
          metricDecEulerianMin: 0.01,
        }),
      ],
    });

    expect(artifact.feasibilityStatus).toBe("candidate_found_needs_followup");
    expect(artifact.diagnosisClass).toBe("wec_nonnegative_candidate_found");
    expect(artifact.bestMetricWecProfileId).toBe("stage1_centerline_alpha_0p9975_v1");
    expect(artifact.bestMetricWecEulerianMin).toBe(0.02);
    expect(artifact.allProfilesMetricWecFail).toBe(false);
  });

  it("marks semantic consistency/invariance failures when selected closure path and checks diverge", () => {
    const artifact = buildNhm2MetricWecFeasibilityArtifact({
      entries: [
        makeEntry({
          closurePathSelected: "full_einstein_tensor",
          fullEinsteinTensorRouteAdmissionStatus: "fail",
          independentCrossCheckStatus: "fail",
          closurePathSupportFieldInterpretation: "blocking",
          closurePathSemanticConsistencyStatus: "fail",
          closurePathSemanticConsistencyNote:
            "Selected full_einstein_tensor path is not yet consistent with Einstein-route admission.",
          closurePathInvarianceStatus: "fail",
          closurePathInvarianceNote:
            "Einstein-path invariance checks: independentCrossCheck=fail, finiteDifferenceConvergence=unknown, einsteinT00Comparability=unknown.",
          recommendedPatchClass: "evidence_disambiguation_patch",
        }),
      ],
    });

    expect(artifact.semanticConsistencyStatus).toBe("fail");
    expect(artifact.invarianceStatus).toBe("fail");
    expect(artifact.recommendedPatchClass).toBe("evidence_disambiguation_patch");
    expect(artifact.semanticConsistencyNote).toContain("inconsistency");
    expect(artifact.invarianceNote).toContain("failed");
  });
});
