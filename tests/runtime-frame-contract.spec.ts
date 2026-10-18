import { describe, expect, it } from "vitest";
import { loadRuntimeFrameContract } from "../server/services/runtime/frame-contract";
import { runAdapterExecution } from "../server/services/adapter/run";

describe("runtime frame contract", () => {
  it("loads the default $499 profile", () => {
    const contract = loadRuntimeFrameContract();
    expect(contract.profile).toBe("console_499");
    expect(contract.clockA.max_tool_calls).toBe(2);
    expect(contract.lanes.llm.max_concurrent).toBe(1);
  });

  it("returns non-null firstFail for constraint FAIL", async () => {
    const result = await runAdapterExecution({
      mode: "constraint-pack",
      pack: {
        id: "tool-use-budget",
        metrics: {
          "steps.used": 64,
          "cost.usd": 1,
          "ops.forbidden.count": 0,
          "ops.approval_missing.count": 0,
          "provenance.missing.count": 0,
        },
      },
    });

    expect(result.verdict).toBe("FAIL");
    expect(result.firstFail).not.toBeNull();
    expect(result.firstFail?.id).toBe("step_limit");
    expect(result.firstFail?.note).toContain("class=constraint");
  });

  it("maps certificate missing FAIL to canonical firstFail", async () => {
    const result = await runAdapterExecution({
      mode: "constraint-pack",
      pack: {
        id: "tool-use-budget",
        metrics: {
          "steps.used": 2,
          "cost.usd": 1,
          "ops.forbidden.count": 0,
          "ops.approval_missing.count": 0,
          "provenance.missing.count": 0,
        },
        certificate: {
          status: "APPROVED",
          certificateHash: null,
          integrityOk: true,
        },
      },
    });

    expect(result.verdict).toBe("FAIL");
    expect(result.firstFail).not.toBeNull();
    expect(result.firstFail?.id).toBe("ADAPTER_CERTIFICATE_MISSING");
    expect(result.firstFail?.note).toContain("class=certificate_missing");
  });
});
