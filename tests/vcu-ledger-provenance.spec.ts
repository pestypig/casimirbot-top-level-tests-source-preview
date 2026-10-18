import { describe, expect, it } from "vitest";
import {
  resolveLedgerProvenanceContract,
  type LedgerClaimTier,
} from "../server/services/contributions/vcu-ledger";
import { collectToolUseBudgetTelemetry } from "../server/services/observability/constraint-pack-telemetry";

type ReceiptFixture = {
  receipt: {
    verification: {
      verdict: "pass" | "fail";
      integrityOk?: boolean;
      certificateHash?: string;
      tier?: "L0" | "L1" | "L2" | "L3";
    };
  };
};

const asReceipt = (fixture: ReceiptFixture) =>
  fixture as Parameters<typeof resolveLedgerProvenanceContract>[0];

describe("vcu ledger provenance contract", () => {
  it("defaults to conservative inferred/diagnostic when evidence is missing", () => {
    expect(resolveLedgerProvenanceContract(undefined)).toEqual({
      provenance_class: "inferred",
      claim_tier: "diagnostic",
    });

    expect(
      resolveLedgerProvenanceContract(
        asReceipt({
          receipt: { verification: { verdict: "fail" } },
        }),
      ),
    ).toEqual({
      provenance_class: "inferred",
      claim_tier: "diagnostic",
    });
  });

  it("keeps claim tier canonical while moving provenance class by evidence", () => {
    const proxy = resolveLedgerProvenanceContract(
      asReceipt({
        receipt: {
          verification: {
            verdict: "pass",
            tier: "L2",
          },
        },
      }),
    );
    expect(proxy).toEqual({
      provenance_class: "proxy",
      claim_tier: "reduced-order",
    });

    const measured = resolveLedgerProvenanceContract(
      asReceipt({
        receipt: {
          verification: {
            verdict: "pass",
            integrityOk: true,
            certificateHash: "abc123",
            tier: "L3",
          },
        },
      }),
    );
    expect(measured).toEqual({
      provenance_class: "measured",
      claim_tier: "certified",
    });
  });
});

describe("tool telemetry canonical provenance metrics", () => {
  it("emits deterministic metrics with conservative defaults", async () => {
    const { telemetry } = await collectToolUseBudgetTelemetry({
      env: {},
      explicit: {},
    });

    expect(telemetry?.metrics?.["provenance.class"]).toBe("proxy");
    expect(telemetry?.metrics?.["claim.tier"]).toBe("diagnostic");
  });

  it("respects explicit canonical env fields and falls back claim tier to diagnostic", async () => {
    const { telemetry } = await collectToolUseBudgetTelemetry({
      env: {
        CASIMIR_PROVENANCE_MISSING: "3",
        CASIMIR_PROVENANCE_CLASS: "measured",
      },
      explicit: {
        metrics: {
          sentinel: 1,
        },
      },
    });

    expect(telemetry?.metrics).toMatchObject({
      sentinel: 1,
      "provenance.class": "measured",
      "claim.tier": "diagnostic" satisfies LedgerClaimTier,
    });
  });
});
