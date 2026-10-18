import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCasimirDpIntegratedFeasibilityPilotStage4_2R } from "../scripts/research/run-casimir-dp-integrated-feasibility-pilot-stage4-2r";

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

describe("Casimir-DP Stage-4.2R campaign", () => {
  it("binds immutable upstream evidence and emits a fail-closed receipt", async () => {
    const result = await runCasimirDpIntegratedFeasibilityPilotStage4_2R({ writeArtifacts: false });
    const config = await readFile("configs/research/casimir-dp-integrated-feasibility-pilot-stage4-2r.v1.json");
    expect(result.report.upstream_integrity).toBe(true);
    expect(result.receipt.config_sha256).toBe(sha(config));
    expect(result.receipt.report_json_sha256).toBe(sha(JSON.stringify(result.report, null, 2) + "\n"));
    expect(result.receipt.packet_contract).toBe("pass");
    expect(result.receipt.empirical_feasibility_pilot).toBe("not_authorized");
    expect(result.receipt.ready_authorities).toBe(0);
    expect(result.receipt.missing_authorities).toHaveLength(8);
    expect(result.receipt.measured_evidence).toBe("not_ready");
    expect(result.receipt.collapse_identification).toBe("blocked");
    expect(result.receipt.frozen_diosi_law_modified).toBe(false);
    expect(result.receipt.collapse_bridge_edges_added).toBe(0);
  });
});

