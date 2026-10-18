import { describe, expect, it } from "vitest";
import {
  getSolarObservedBenchmarkPackById,
  getSolarBenchmarkRegistryVersion,
  listSolarObservedBenchmarkPacks,
} from "../server/modules/starsim/benchmarks";

describe("star-sim solar benchmark packs", () => {
  it("registers the solar interior closure benchmark pack with the required closure sections", () => {
    const pack = getSolarObservedBenchmarkPackById("solar_interior_closure_v1");
    expect(pack).not.toBeNull();
    expect(pack?.domain_id).toBe("solar_observed_baseline_v1");
    expect(pack?.required_sections).toEqual(
      expect.arrayContaining([
        "solar_interior_profile",
        "solar_layer_boundaries",
        "solar_global_modes",
        "solar_neutrino_constraints",
      ]),
    );
    expect(pack?.quality_checks).toEqual(
      expect.arrayContaining([
        "convection_zone_depth",
        "envelope_helium_fraction",
        "low_degree_mode_support",
        "neutrino_constraint_vector",
      ]),
    );
    expect(pack?.conceptual_lanes).toContain("helioseismology_solar_observed");
  });

  it("registers observed cycle and eruptive benchmark packs separately", () => {
    const packIds = listSolarObservedBenchmarkPacks().map((entry) => entry.id);
    const cyclePack = getSolarObservedBenchmarkPackById("solar_cycle_observed_v1");
    const eruptivePack = getSolarObservedBenchmarkPackById("solar_eruptive_catalog_v1");
    const structuralResidualPack = getSolarObservedBenchmarkPackById("solar_structural_residual_closure_v1");
    const localHelioPack = getSolarObservedBenchmarkPackById("solar_local_helio_observed_v1");
    const surfaceFlowPack = getSolarObservedBenchmarkPackById("solar_surface_flow_observed_v1");
    const coronalFieldPack = getSolarObservedBenchmarkPackById("solar_coronal_field_observed_v1");
    const magneticMemoryPack = getSolarObservedBenchmarkPackById("solar_magnetic_memory_observed_v1");
    const spotRegionPack = getSolarObservedBenchmarkPackById("solar_spot_region_observed_v1");
    const eventAssociationPack = getSolarObservedBenchmarkPackById("solar_event_association_observed_v1");
    const topologyLinkagePack = getSolarObservedBenchmarkPackById("solar_topology_linkage_observed_v1");
    const crossLayerConsistencyPack = getSolarObservedBenchmarkPackById("solar_cross_layer_consistency_v1");
    expect(packIds).toEqual(
      expect.arrayContaining([
        "solar_interior_closure_v1",
        "solar_cycle_observed_v1",
        "solar_eruptive_catalog_v1",
        "solar_structural_residual_closure_v1",
        "solar_local_helio_observed_v1",
        "solar_surface_flow_observed_v1",
        "solar_coronal_field_observed_v1",
        "solar_magnetic_memory_observed_v1",
        "solar_spot_region_observed_v1",
        "solar_event_association_observed_v1",
        "solar_topology_linkage_observed_v1",
        "solar_cross_layer_consistency_v1",
      ]),
    );
    expect(cyclePack?.quality_checks).toEqual(
      expect.arrayContaining([
        "cycle_indices",
        "chronology_window",
        "polarity_reversal_context",
        "butterfly_history",
        "axial_dipole_history",
        "magnetogram_context",
        "active_region_context",
        "irradiance_continuity",
      ]),
    );
    expect(eruptivePack?.quality_checks).toEqual(
      expect.arrayContaining([
        "flare_catalog",
        "cme_catalog",
        "irradiance_continuity",
        "source_region_linkage",
      ]),
    );
    expect(structuralResidualPack?.required_sections).toEqual(["solar_structural_residuals"]);
    expect(structuralResidualPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "hydrostatic_balance_context",
        "sound_speed_residual_context",
        "rotation_residual_context",
        "pressure_scale_height_continuity_context",
        "neutrino_seismic_consistency_context",
        "residual_metadata_coherence_context",
      ]),
    );
    expect(structuralResidualPack?.conceptual_lanes).toContain("helioseismology_solar_observed");
    expect(localHelioPack?.required_sections).toEqual(["solar_local_helio"]);
    expect(localHelioPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "dopplergram_context",
        "travel_time_or_holography_context",
        "sunquake_event_context",
      ]),
    );
    expect(surfaceFlowPack?.required_sections).toEqual(["solar_surface_flows", "solar_active_regions"]);
    expect(surfaceFlowPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "differential_rotation_context",
        "meridional_flow_context",
        "active_region_geometry_context",
        "surface_transport_proxy_context",
      ]),
    );
    expect(surfaceFlowPack?.conceptual_lanes).toEqual(
      expect.arrayContaining(["magnetism_surface_flux_transport", "solar_cycle_observed"]),
    );
    expect(magneticMemoryPack?.required_sections).toEqual(["solar_magnetic_memory", "solar_active_regions"]);
    expect(magneticMemoryPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "axial_dipole_continuity_context",
        "polar_field_continuity_context",
        "reversal_linkage_context",
        "active_region_polarity_ordering_context",
        "hemisphere_bipolar_coverage_context",
        "bipolar_region_proxy_context",
      ]),
    );
    expect(spotRegionPack?.required_sections).toEqual(["solar_sunspot_catalog", "solar_active_regions"]);
    expect(spotRegionPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "sunspot_catalog_context",
        "spot_geometry_context",
        "spot_region_linkage_context",
        "bipolar_grouping_context",
        "polarity_tilt_context",
      ]),
    );
    expect(eventAssociationPack?.required_sections).toEqual(
      expect.arrayContaining([
        "solar_event_linkage",
        "solar_active_regions",
        "solar_flare_catalog",
        "solar_cme_catalog",
      ]),
    );
    expect(eventAssociationPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "flare_region_linkage_context",
        "cme_region_linkage_context",
        "sunquake_flare_region_linkage_context",
        "event_chronology_alignment_context",
        "region_identifier_consistency_context",
      ]),
    );
    expect(topologyLinkagePack?.required_sections).toEqual(
      expect.arrayContaining([
        "solar_topology_linkage",
        "solar_coronal_field",
        "solar_magnetic_memory",
        "solar_active_regions",
      ]),
    );
    expect(topologyLinkagePack?.quality_checks).toEqual(
      expect.arrayContaining([
        "spot_region_corona_context",
        "open_flux_polar_field_continuity_context",
        "event_topology_context",
        "topology_role_context",
        "chronology_alignment_context",
        "identifier_consistency_context",
      ]),
    );
    expect(crossLayerConsistencyPack?.required_sections).toEqual(
      expect.arrayContaining([
        "solar_interior_profile",
        "solar_global_modes",
        "solar_structural_residuals",
        "solar_cycle_history",
        "solar_magnetic_memory",
        "solar_coronal_field",
        "solar_active_regions",
        "solar_event_linkage",
        "solar_topology_linkage",
      ]),
    );
    expect(crossLayerConsistencyPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "interior_residual_coherence",
        "mode_residual_coherence",
        "rotation_residual_coherence",
        "cycle_memory_topology_coherence",
        "event_topology_identifier_coherence",
        "chronology_metadata_alignment",
      ]),
    );
    expect(localHelioPack?.conceptual_lanes).toContain("helioseismology_solar_observed");
    expect(cyclePack?.required_sections).toContain("solar_cycle_history");
    expect(coronalFieldPack?.required_sections).toEqual(["solar_coronal_field", "solar_magnetogram"]);
    expect(coronalFieldPack?.quality_checks).toEqual(
      expect.arrayContaining([
        "pfss_context",
        "synoptic_boundary_context",
        "open_field_topology_context",
        "source_region_linkage_context",
      ]),
    );
    expect(getSolarBenchmarkRegistryVersion()).toBe("starsim-solar-benchmarks/15");
  });
});
