import { describe, expect, it } from "vitest";

import { evaluateObserverConsistency } from "../tools/nhm2/validate-reference-run";

describe("nhm2 observer consistency gate", () => {
  it("blocks full-loop observer pass when detailed observer artifact fails", () => {
    const gate = evaluateObserverConsistency({
      fullLoopObserverSection: {
        state: "pass",
        artifactRefs: [{ artifactId: "nhm2_observer_audit", status: "pass" }],
      },
      detailedObserverArtifact: {
        status: "fail",
        reasonCodes: ["observer_condition_failed", "surrogate_model_limited"],
        metric_required: {
          conditions: {
            dec: { status: "fail", robustMin: -58267450.989558905 },
          },
        },
        tile_effective: {
          conditions: {
            dec: { status: "fail", robustMin: -58267450.989558905 },
          },
        },
      },
    });

    expect(gate.state).toBe("fail");
    expect(gate.reasonCodes).toContain("full_loop_observer_pass_detailed_fail");
    expect(gate.reasonCodes).toContain("metric_required_dec_detailed_fail");
    expect(gate.reasonCodes).toContain("tile_effective_dec_detailed_fail");
  });

  it("labels public latest read failures as publication surface problems", () => {
    const gate = evaluateObserverConsistency({
      fullLoopObserverSection: { state: "review", artifactRefs: [] },
      detailedObserverArtifact: { status: "review", reasonCodes: [] },
      publicLatestReadable: false,
      localLatestReadable: true,
    });

    expect(gate.reasonCodes).toContain("artifact_publication_surface_unreliable");
    expect(gate.reasonCodes).not.toContain("local_artifact_empty");
  });
});
