import { describe, expect, it } from "vitest";
import {
  buildAtomicPipelineCouplingContract,
  computeAtomicPipelineDrift,
} from "../client/src/lib/atomic-pipeline-coupling";

describe("atomic pipeline coupling contract", () => {
  it("is explicit display-proxy and non-certifying", () => {
    const contract = buildAtomicPipelineCouplingContract({ tsRatio: 120, duty: 0.4 });
    expect(contract.mode).toBe("display_proxy");
    expect(contract.domain).toBe("telemetry_seed");
    expect(contract.equation_ref).toBeNull();
    expect(contract.uncertainty_model_id).toBeNull();
    expect(contract.citation_claim_ids).toEqual([]);
    expect(contract.claim_tier).toBe("diagnostic");
    expect(contract.certifying).toBe(false);
  });

  it("uses deterministic drift defaults and formula", () => {
    expect(computeAtomicPipelineDrift(undefined, undefined)).toBeCloseTo(1, 12);
    expect(computeAtomicPipelineDrift(120, 0.4)).toBeCloseTo(1 + (20 / 600) + 0.1, 12);
  });
});

