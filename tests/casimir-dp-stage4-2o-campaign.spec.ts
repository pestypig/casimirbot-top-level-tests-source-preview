import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCasimirDpPublicDataComponentValidationStage4_2O } from "../scripts/research/run-casimir-dp-public-data-component-validation-stage4-2o";

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

describe("Casimir-DP Stage-4.2O campaign", () => {
  it("replays immutable upstream evidence and emits content-addressed component evidence", async () => {
    const result = await runCasimirDpPublicDataComponentValidationStage4_2O({ writeArtifacts: false });
    const config = await readFile("configs/research/casimir-dp-public-data-component-validation-stage4-2o.v1.json");
    const fixture = await readFile("configs/research/fixtures/casimir-dp-stage4-2o.public-data.v1.json");
    const upstream = await readFile("docs/research/casimir-dp-material-thermal-ordinary-null-stage4-2n-campaign-receipt.json");

    expect(result.report.upstream_integrity).toBe(true);
    expect(result.report.fixture_integrity).toBe(true);
    expect(result.report.readiness.component_replay).toBe("pass");
    expect(result.receipt.config_sha256).toBe(sha(config));
    expect(result.receipt.fixture_sha256).toBe(sha(fixture));
    expect(result.receipt.upstream_stage4_2n_campaign_receipt_sha256).toBe(sha(upstream));
    expect(result.receipt.report_json_sha256).toBe(sha(JSON.stringify(result.report, null, 2) + "\n"));
    expect(result.receipt.cross_apparatus_covariance_fusion).toBe(false);
    expect(result.receipt.observable_bridge_edges_added).toBe(0);
    expect(result.receipt.promotion_allowed).toBe(false);
  });
});
