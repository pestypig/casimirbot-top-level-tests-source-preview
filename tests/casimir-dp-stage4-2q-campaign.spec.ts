import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCasimirDpSuperconductingBoundaryControlStage4_2Q } from "../scripts/research/run-casimir-dp-superconducting-boundary-control-stage4-2q";

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

describe("Casimir-DP Stage-4.2Q campaign", () => {
  it("binds immutable upstream evidence and emits content-addressed fail-closed evidence", async () => {
    const result = await runCasimirDpSuperconductingBoundaryControlStage4_2Q({ writeArtifacts: false });
    const config = await readFile("configs/research/casimir-dp-superconducting-boundary-control-stage4-2q.v1.json");
    const fixture = await readFile("configs/research/fixtures/casimir-dp-stage4-2q.superconducting.synthetic.v1.json");
    expect(result.report.upstream_integrity).toBe(true);
    expect(result.report.fixture_integrity).toBe(true);
    expect(result.receipt.config_sha256).toBe(sha(config));
    expect(result.receipt.fixture_sha256).toBe(sha(fixture));
    expect(result.receipt.report_json_sha256).toBe(sha(JSON.stringify(result.report, null, 2) + "\n"));
    expect(result.receipt.software_pipeline).toBe("pass");
    expect(result.receipt.synthetic_control_value).toBe("bounded_candidate_found");
    expect(result.receipt.measured_evidence).toBe("not_ready");
    expect(result.receipt.collapse_identification).toBe("blocked");
    expect(result.receipt.frozen_diosi_law_modified).toBe(false);
    expect(result.receipt.collapse_bridge_edges_added).toBe(0);
    expect(result.receipt.promotion_allowed).toBe(false);
  });
});
