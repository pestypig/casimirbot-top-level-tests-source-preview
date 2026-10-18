import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCasimirDpRetardedSourcePropagationStage4_2S } from "../scripts/research/run-casimir-dp-retarded-source-propagation-stage4-2s";

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

describe("Casimir-DP Stage-4.2S campaign", () => {
  it("binds immutable Stage-4.2R evidence and emits a fail-closed canonical receipt", async () => {
    const result = await runCasimirDpRetardedSourcePropagationStage4_2S({ writeArtifacts: false });
    const config = await readFile("configs/research/casimir-dp-retarded-source-propagation-stage4-2s.v1.json");
    expect(result.report.upstream_integrity).toBe(true);
    expect(result.receipt.config_sha256).toBe(sha(config));
    expect(result.receipt.report_json_sha256).toBe(sha(JSON.stringify(result.report, null, 2) + "\n"));
    expect(result.receipt.software_contract).toBe("pass");
    expect(result.receipt.analytic_recovery).toBe("pass");
    expect(result.receipt.ordinary_null_integration).toBe("not_authorized");
    expect(result.receipt.ready_authorities).toBe(0);
    expect(result.receipt.missing_authorities).toHaveLength(7);
    expect(result.receipt.measured_evidence).toBe("not_ready");
    expect(result.receipt.frozen_diosi_law_modified).toBe(false);
    expect(result.receipt.collapse_bridge_edges_added).toBe(0);
  });
});
