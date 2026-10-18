import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCasimirDpMaterialThermalOrdinaryNullStage4_2N } from "../scripts/research/run-casimir-dp-material-thermal-ordinary-null-stage4-2n";

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

describe("Casimir-DP Stage-4.2N campaign", () => {
  it("replays the immutable upstream and emits content-addressed synthetic evidence", async () => {
    const result = await runCasimirDpMaterialThermalOrdinaryNullStage4_2N({ writeArtifacts: false });
    const config = await readFile("configs/research/casimir-dp-material-thermal-ordinary-null-stage4-2n.v1.json");
    const fixture = await readFile("configs/research/fixtures/casimir-dp-stage4-2n.synthetic.v1.json");
    const upstream = await readFile("docs/research/casimir-dp-apparatus-search-stage4-2m-verification-receipt.json");

    expect(result.report.upstream_integrity).toBe(true);
    expect(result.report.fixture_integrity).toBe(true);
    expect(result.report.optical_table_integrity).toBe(true);
    expect(result.report.readiness.software_pipeline).toBe("pass");
    expect(result.receipt.config_sha256).toBe(sha(config));
    expect(result.receipt.fixture_sha256).toBe(sha(fixture));
    expect(result.receipt.upstream_verification_receipt_sha256).toBe(sha(upstream));
    expect(result.receipt.report_json_sha256).toBe(sha(JSON.stringify(result.report, null, 2) + "\n"));
    expect(result.receipt.observable_bridge_edges_added).toBe(0);
    expect(result.receipt.promotion_allowed).toBe(false);
  });
});
