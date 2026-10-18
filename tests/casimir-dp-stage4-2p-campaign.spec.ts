import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCasimirDpProperTimeWorldlineClosureStage4_2P } from "../scripts/research/run-casimir-dp-proper-time-worldline-closure-stage4-2p";

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

describe("Casimir-DP Stage-4.2P campaign", () => {
  it("binds immutable Stage-4.2O evidence and emits content-addressed fail-closed evidence", async () => {
    const result = await runCasimirDpProperTimeWorldlineClosureStage4_2P({ writeArtifacts: false });
    const config = await readFile("configs/research/casimir-dp-proper-time-worldline-closure-stage4-2p.v1.json");
    const upstream = await readFile("docs/research/casimir-dp-public-data-component-validation-stage4-2o-campaign-receipt.json");
    expect(result.report.upstream_integrity).toBe(true);
    expect(result.receipt.config_sha256).toBe(sha(config));
    expect(result.receipt.upstream_stage4_2o_campaign_receipt_sha256).toBe(sha(upstream));
    expect(result.receipt.report_json_sha256).toBe(sha(JSON.stringify(result.report, null, 2) + "\n"));
    expect(result.receipt.software_closure).toBe("pass");
    expect(result.receipt.phase_gate).toBe("pass");
    expect(result.receipt.measured_evidence).toBe("not_ready");
    expect(result.receipt.collapse_identification).toBe("blocked");
    expect(result.receipt.frozen_diosi_law_modified).toBe(false);
    expect(result.receipt.observable_bridge_edges_added).toBe(0);
    expect(result.receipt.promotion_allowed).toBe(false);
  });
});
