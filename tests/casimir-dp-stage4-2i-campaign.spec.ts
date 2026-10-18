import { describe, expect, it } from "vitest";
import {
  runCasimirDpBoundaryBranchInteractionStage4_2I,
} from "../scripts/research/run-casimir-dp-boundary-branch-interaction-stage4-2i";

describe("Casimir-DP Stage-4.2I campaign", () => {
  it("replays immutable Stage-4.2H and all fail-closed synthetic cases", async () => {
    const result = await runCasimirDpBoundaryBranchInteractionStage4_2I({
      generatedAt: "2026-08-05T16:00:00.000Z",
      runId:
        "casimir-dp-boundary-branch-interaction-stage4-2i-v1-20260805T160000000Z",
      writeArtifacts: false,
    });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.immutable_stage4_2h.recovered).toBe(true);
    expect(
      result.report.nominal_synthetic_result.outcome.diagnostic_gate,
    ).toBe("pass");
    expect(
      result.report.nominal_synthetic_result.outcome
        .interaction_resolved_in_synthetic_case,
    ).toBe(false);
    expect(result.report.adversarial_cases).toHaveLength(5);
    expect(
      result.report.adversarial_cases.every((row) => row.gate === "pass"),
    ).toBe(true);
    expect(result.report.observable_bridge_edges_added).toBe(0);
    expect(result.report.final_gates.measured_evidence).toBe("not_ready");
    expect(result.report.final_gates.collapse_identification).toBe("blocked");
    expect(result.receipt.downstream_verification.status).toBe(
      "pending_external_verification",
    );
  });
});
