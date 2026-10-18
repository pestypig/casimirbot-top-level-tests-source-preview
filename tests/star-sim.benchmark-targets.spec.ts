import { describe, expect, it } from "vitest";
import { resolveBenchmarkTarget } from "../server/modules/starsim/benchmark-targets";

describe("star-sim benchmark target matching", () => {
  it("matches supported benchmark target deterministically by Gaia identifier", () => {
    const match = resolveBenchmarkTarget({
      request: {
        target: { name: "Any" },
      } as any,
      identifiersResolved: { gaia_dr3_source_id: "123456789012345678" },
    });
    expect(match.benchmark_target?.id).toBe("demo_solar_a");
    expect(match.benchmark_target_match_mode).toBe("matched_by_identifier");
    expect(match.benchmark_target_identity_basis).toBe("trusted_identifier");
  });

  it("does not infer unsupported target membership", () => {
    const match = resolveBenchmarkTarget({
      request: {
        target: { name: "Random Star" },
      } as any,
      identifiersResolved: { gaia_dr3_source_id: "000000000000000001" },
    });
    expect(match.benchmark_target).toBeNull();
    expect(match.benchmark_target_match_mode).toBe("no_match");
    expect(match.benchmark_target_identity_basis).toBe("none");
  });

  it("does not silently assign a wrong benchmark target when name conflicts with identifiers", () => {
    const match = resolveBenchmarkTarget({
      request: {
        target: { name: "Demo Solar A" },
      } as any,
      identifiersResolved: { gaia_dr3_source_id: "987654321098765432" },
    });
    expect(match.benchmark_target).toBeNull();
    expect(match.benchmark_target_match_mode).toBe("conflicted_name_vs_identifier");
    expect(match.benchmark_target_conflict_reason).toBe("name_identifier_disagreement_conflict_unresolved");
    expect(match.benchmark_target_identity_basis).toBe("conflicted_trusted_identifier_vs_name");
  });

  it("returns an explicit conflict when trusted identifiers point at different benchmark targets", () => {
    const match = resolveBenchmarkTarget({
      request: {
        target: {},
      } as any,
      identifiersResolved: {
        gaia_dr3_source_id: "123456789012345678",
        lamost_obsid: "LAMOST-B-0002",
      },
    });
    expect(match.benchmark_target).toBeNull();
    expect(match.benchmark_target_match_mode).toBe("conflicted_trusted_identifiers");
    expect(match.benchmark_target_conflict_reason).toBe("multiple_trusted_identifier_targets");
    expect(match.benchmark_target_identity_basis).toBe("conflicted_trusted_identifiers");
    expect(match.benchmark_target_quality_ok).toBe(false);
  });

  it("accepts multiple trusted identifiers when they converge on the same benchmark target", () => {
    const match = resolveBenchmarkTarget({
      request: {
        target: {},
      } as any,
      identifiersResolved: {
        gaia_dr3_source_id: "123456789012345678",
        tess_tic_id: "100000001",
        tasoc_target_id: "TASOC-A-0001",
      },
    });
    expect(match.benchmark_target?.id).toBe("demo_solar_a");
    expect(match.benchmark_target_match_mode).toBe("matched_by_identifier");
    expect(match.benchmark_target_identity_basis).toBe("trusted_identifier");
    expect(match.benchmark_target_quality_ok).toBe(true);
  });

  it("matches the Sun as a separate observed-baseline benchmark target without disturbing existing stellar targets", () => {
    const match = resolveBenchmarkTarget({
      request: {
        target: { object_id: "sun", name: "Sun" },
      } as any,
      identifiersResolved: {},
    });
    expect(match.benchmark_target?.id).toBe("sun_observed_baseline");
    expect(match.benchmark_target_match_mode).toBe("matched_by_name");
    expect(match.benchmark_target_identity_basis).toBe("name_label");
    expect(match.benchmark_target?.benchmark_family_or_pack_ids).toContain("solar_structural_residual_closure_v1");
    expect(match.benchmark_target?.benchmark_family_or_pack_ids).toContain("solar_spot_region_observed_v1");
    expect(match.benchmark_target?.benchmark_family_or_pack_ids).toContain("solar_coronal_field_observed_v1");
    expect(match.benchmark_target?.benchmark_family_or_pack_ids).toContain("solar_topology_linkage_observed_v1");
    expect(match.benchmark_target?.benchmark_family_or_pack_ids).toContain("solar_cross_layer_consistency_v1");
  });
});
