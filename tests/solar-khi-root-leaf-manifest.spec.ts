import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("solar KHI root-to-leaf falsifier path", () => {
  it("registers the native-resolution predictive gate and quantum nonclaim", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "configs", "physics-root-leaf-manifest.v1.json"), "utf8"),
    ) as {
      paths?: Array<{
        id: string;
        root_id?: string;
        leaf_id?: string;
        bundle_id?: string;
        dag_bridges?: string[];
        falsifier?: { reject_rule?: string; test_refs?: string[] };
        maturity_gate?: { max_claim_tier?: string; strict_fail_reason?: string };
      }>;
      bridge_bundles?: Array<{ id: string; max_claim_tier?: string; path_ids?: string[] }>;
    };
    const route = manifest.paths?.find(
      (candidate) => candidate.id === "path_stellar_transport_to_solar_khi_nanoflare_gate",
    );

    expect(route).toEqual(expect.objectContaining({
      root_id: "physics_stellar_structure_nucleosynthesis",
      leaf_id: "leaf_solar_khi_nanoflare_predictive_gate",
      bundle_id: "solar.khi-nanoflare.audit",
    }));
    expect(route?.falsifier?.reject_rule).toMatch(/nativeResolutionPreserved != true/);
    expect(route?.falsifier?.reject_rule).toMatch(/mfbdSpeckleAgreement != true/);
    expect(route?.falsifier?.reject_rule).toMatch(/labelsUsedAsFeatures == true/);
    expect(route?.falsifier?.reject_rule).toMatch(/timeShuffleGainLost != true/);
    expect(route?.falsifier?.reject_rule).toMatch(/quantumRopePromotionRequested == true/);
    expect(route?.maturity_gate).toEqual(expect.objectContaining({
      max_claim_tier: "diagnostic",
      strict_fail_reason: "ROOT_LEAF_SOLAR_KHI_NANOFLARE_GATE_FAIL",
    }));
    expect(manifest.bridge_bundles?.find((bundle) => bundle.id === "solar.khi-nanoflare.audit")).toEqual(
      expect.objectContaining({
        max_claim_tier: "diagnostic",
        path_ids: ["path_stellar_transport_to_solar_khi_nanoflare_gate"],
      }),
    );
  });
});
