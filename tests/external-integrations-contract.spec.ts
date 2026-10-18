import { describe, expect, it } from "vitest";

import {
  __testOnlyClassifyExternalIntegrationEvidenceFailure,
  __testOnlyHasExternalIntegrationsEvidenceContract,
} from "../server/services/helix-ask/graph-resolver";

describe("external integrations evidence contract", () => {
  it("accepts deterministic provenance+claim-tier contract for promoted external-integrations lane", () => {
    const ok = __testOnlyHasExternalIntegrationsEvidenceContract({
      path: [
        { id: "external-integrations-tree" },
        {
          id: "external-llm-stack",
          evidence: [
            {
              type: "doc",
              path: "docs/knowledge/external-integrations-tree.json",
              provenance_class: "inferred",
              claim_tier: "diagnostic",
            },
          ],
        },
      ],
    });

    expect(ok).toBe(true);
  });

  it("returns missing taxonomy for absent provenance metadata", () => {
    const reason = __testOnlyClassifyExternalIntegrationEvidenceFailure([
      {
        type: "doc",
        path: "docs/knowledge/external-integrations-tree.json",
        claim_tier: "diagnostic",
      },
    ]);

    expect(reason).toBe("missing_provenance_metadata");
  });

  it("returns contradictory taxonomy for conflicting deterministic contracts on same path", () => {
    const reason = __testOnlyClassifyExternalIntegrationEvidenceFailure([
      {
        type: "doc",
        path: "docs/knowledge/external-integrations-tree.json",
        provenance_class: "proxy",
        claim_tier: "diagnostic",
      },
      {
        type: "doc",
        path: "docs/knowledge/external-integrations-tree.json",
        provenance_class: "measured",
        claim_tier: "certified",
      },
    ]);

    expect(reason).toBe("contradictory_provenance_metadata");
  });
});
