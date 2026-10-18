import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  STAR_SIM_SOLAR_OBSERVED_ADAPTER_VERSION,
  buildSolarObservedFixture,
  normalizeSolarObservedBaselinePatch,
  resolveSolarObservedSource,
} from "../server/modules/starsim/sources/adapters/solar-observed";
import {
  __resetSolarProductRegistryForTest,
  __setSolarProductRegistryForTest,
  getSolarProductRegistry,
  loadSolarProductRegistryFromPath,
} from "../server/modules/starsim/solar-product-registry";
import {
  __resetSolarReferencePackForTest,
  __setSolarReferencePackForTest,
  getSolarReferencePack,
  loadSolarReferencePackFromPath,
} from "../server/modules/starsim/solar-reference-pack";
import {
  evaluateSolarCycleObservedDiagnostics,
  evaluateSolarCoronalFieldDiagnostics,
  evaluateSolarCrossLayerConsistencyDiagnostics,
  evaluateSolarEruptiveCatalogDiagnostics,
  evaluateSolarEventLinkageDiagnostics,
  evaluateSolarInteriorClosureDiagnostics,
  evaluateSolarLocalHelioDiagnostics,
  evaluateSolarMagneticMemoryDiagnostics,
  evaluateSolarProvenanceDiagnostics,
  evaluateSolarSpotRegionDiagnostics,
  evaluateSolarStructuralResidualDiagnostics,
  evaluateSolarSurfaceFlowDiagnostics,
  evaluateSolarTopologyLinkageDiagnostics,
} from "../server/modules/starsim/solar-diagnostics";
import { buildSolarConsistencyDiagnostics } from "../server/modules/starsim/solar-repeatability";

afterEach(() => {
  __resetSolarReferencePackForTest();
  __resetSolarProductRegistryForTest();
});

const loadSolarCrossLayerCounterexamplePayload = (fileName: string): Record<string, unknown> => {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/starsim/sources/solar-observed", fileName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    payload?: Record<string, unknown>;
  };
  return fixture.payload ?? {};
};

describe("star-sim solar observed adapter scaffold", () => {
  it("normalizes solar observed metadata onto baseline sections", () => {
    const result = normalizeSolarObservedBaselinePatch({
      request: {
        target: {
          object_id: "sun",
          name: "Sun",
        },
      },
      source_id: "fixture:hmi-cycle",
      instrument: "SDO/HMI",
      observed_mode: "observed",
      coordinate_frame: "Carrington",
      cadence: {
        value: 12,
        unit: "s",
      },
      payload: {
        solar_cycle_indices: {
          sunspot_number: 83,
        },
      },
    });

    expect(result.adapter_version).toBe(STAR_SIM_SOLAR_OBSERVED_ADAPTER_VERSION);
    expect(result.reason).toBeNull();
    expect(result.baseline_patch?.solar_cycle_indices?.metadata?.instrument).toBe("SDO/HMI");
    expect(result.baseline_patch?.solar_cycle_indices?.metadata?.coordinate_frame).toBe("Carrington");
  });

  it("provides a minimal fixture scaffold for the Sun only", () => {
    const result = buildSolarObservedFixture({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    expect(result.reason).toBeNull();
    expect(result.baseline_patch?.solar_cycle_indices?.cycle_label).toBe("Cycle 25");
    expect(result.baseline_patch?.solar_local_helio?.dopplergram_ref).toBe("fixture:solar/local-helio/dopplergram");
    expect(result.baseline_patch?.solar_irradiance_series?.tsi_ref).toBe("fixture:solar/tsi");
  });

  it("loads the solar interior closure fixture when resolving the Sun baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    expect(result.adapter_version).toBe(STAR_SIM_SOLAR_OBSERVED_ADAPTER_VERSION);
    expect(result.reason).toBeNull();
    expect(result.baseline_patch?.solar_interior_profile?.summary?.convection_zone_base_rsun).toBe(0.713);
    expect(result.baseline_patch?.solar_neutrino_constraints?.cno_flux).toBe(7.0);
    expect(result.baseline_patch?.solar_cycle_indices?.cycle_label).toBe("Cycle 25");
    expect(result.baseline_patch?.solar_local_helio?.dopplergram_ref).toBe("fixture:solar/local-helio/dopplergram-cube");
    expect(result.baseline_patch?.solar_local_helio?.holography_ref).toBe("fixture:solar/local-helio/holography-egression");
    expect(result.baseline_patch?.solar_structural_residuals?.hydrostatic_residual_ref).toBe(
      "fixture:solar/structural-residuals/hydrostatic-balance",
    );
    expect(result.baseline_patch?.solar_structural_residuals?.summary?.max_sound_speed_fractional_residual).toBe(0.0018);
    expect(result.baseline_patch?.solar_magnetogram?.synoptic_radial_map_ref).toBe("fixture:solar/magnetograms/synoptic-radial");
    expect(result.baseline_patch?.solar_surface_flows?.differential_rotation_ref).toBe(
      "fixture:solar/surface-flows/differential-rotation-profile",
    );
    expect(result.baseline_patch?.solar_surface_flows?.summary?.meridional_flow_peak_ms).toBe(12.4);
    expect(result.baseline_patch?.solar_coronal_field?.pfss_solution_ref).toBe("fixture:solar/coronal/pfss-solution-2290");
    expect(result.baseline_patch?.solar_coronal_field?.summary?.dominant_topology).toBe("dipolar_open_flux");
    expect(result.baseline_patch?.solar_magnetic_memory?.axial_dipole_history_ref).toBe(
      "fixture:solar/magnetic-memory/axial-dipole-history",
    );
    expect(result.baseline_patch?.solar_magnetic_memory?.summary?.north_polarity_state).toBe("negative");
    expect(result.baseline_patch?.solar_sunspot_catalog?.spot_count).toBe(4);
    expect(result.baseline_patch?.solar_sunspot_catalog?.spots?.[0]?.spot_id).toBe("fixture:solar/sunspots/spot-13000-a");
    expect(result.baseline_patch?.solar_sunspot_catalog?.spots?.[0]?.polarity).toBe("negative");
    expect(result.baseline_patch?.solar_event_linkage?.summary?.flare_link_count).toBe(1);
    expect(result.baseline_patch?.solar_event_linkage?.links?.[0]?.event_type).toBe("flare");
    expect(result.baseline_patch?.solar_topology_linkage?.link_count).toBe(2);
    expect(result.baseline_patch?.solar_topology_linkage?.links?.[0]?.topology_role).toBe(
      "active_region_open_flux_source",
    );
    expect(result.baseline_patch?.solar_active_regions?.region_count).toBe(2);
    expect(result.baseline_patch?.solar_active_regions?.regions?.[0]?.tilt_deg).toBe(11.5);
    expect(result.baseline_patch?.solar_active_regions?.regions?.[0]?.following_polarity).toBe("positive");
    expect(result.baseline_patch?.solar_active_regions?.regions?.[0]?.linked_spot_ids).toEqual([
      "fixture:solar/sunspots/spot-13000-a",
      "fixture:solar/sunspots/spot-13000-b",
    ]);
    expect(result.baseline_patch?.solar_active_regions?.regions?.[0]?.polarity_ordering_class).toBe("hale-consistent");
    expect(result.baseline_patch?.solar_active_regions?.regions?.[1]?.hemisphere).toBe("south");
    expect(result.baseline_patch?.solar_flare_catalog?.strongest_goes_class).toBe("M3.4");
    expect(result.baseline_patch?.solar_cme_catalog?.cme_count).toBe(1);
    expect(result.baseline_patch?.solar_irradiance_series?.euv_ref).toBe("fixture:solar/irradiance/eve-euv");
    expect(result.metadata.instrument).toBe("SDO/HMI+Borexino+solar-assimilation");
    expect(result.metadata.observed_mode).toBe("assimilated");
    expect(result.baseline_patch?.solar_interior_profile?.metadata?.source_product_id).toBe("solar_assimilation_interior_profile_v1");
    expect(result.baseline_patch?.solar_global_modes?.metadata?.source_product_family).toBe("global_helioseismology_products");
    expect(result.baseline_patch?.solar_local_helio?.metadata?.source_product_id).toBe("hmi_gong_local_helio_context_v1");
    expect(result.baseline_patch?.solar_surface_flows?.metadata?.source_product_id).toBe("hmi_gong_surface_flow_context_v1");
    expect(result.baseline_patch?.solar_magnetic_memory?.metadata?.source_product_id).toBe(
      "hmi_noaa_magnetic_memory_history_v1",
    );
    expect(result.baseline_patch?.solar_flare_catalog?.metadata?.source_doc_ids).toEqual(["goes_xray"]);
  });

  it("evaluates the merged Sun fixture as product-provenance consistent", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarProvenanceDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics?.overall_status).toBe("pass");
    expect(diagnostics?.product_registry_id).toBe("solar_product_registry");
    expect(diagnostics?.checks.solar_interior_profile?.status).toBe("pass");
    expect(diagnostics?.checks.solar_interior_profile?.source_product_id).toBe("solar_assimilation_interior_profile_v1");
    expect(diagnostics?.checks.solar_local_helio?.status).toBe("pass");
    expect(diagnostics?.checks.solar_local_helio?.source_product_id).toBe("hmi_gong_local_helio_context_v1");
    expect(diagnostics?.checks.solar_structural_residuals?.status).toBe("pass");
    expect(diagnostics?.checks.solar_structural_residuals?.source_product_id).toBe(
      "solar_assimilation_structural_residual_context_v1",
    );
    expect(diagnostics?.checks.solar_surface_flows?.status).toBe("pass");
    expect(diagnostics?.checks.solar_surface_flows?.source_product_family).toBe("surface_flow_products");
    expect(diagnostics?.checks.solar_coronal_field?.status).toBe("pass");
    expect(diagnostics?.checks.solar_coronal_field?.source_product_id).toBe("pfss_coronal_field_context_v1");
    expect(diagnostics?.checks.solar_magnetic_memory?.status).toBe("pass");
    expect(diagnostics?.checks.solar_magnetic_memory?.source_product_id).toBe("hmi_noaa_magnetic_memory_history_v1");
    expect(diagnostics?.checks.solar_sunspot_catalog?.status).toBe("pass");
    expect(diagnostics?.checks.solar_sunspot_catalog?.source_product_id).toBe("hmi_noaa_sunspot_catalog_v1");
    expect(diagnostics?.checks.solar_event_linkage?.status).toBe("pass");
    expect(diagnostics?.checks.solar_event_linkage?.source_product_id).toBe("solar_cross_phase_event_linkage_context_v1");
    expect(diagnostics?.checks.solar_topology_linkage?.status).toBe("pass");
    expect(diagnostics?.checks.solar_topology_linkage?.source_product_id).toBe(
      "solar_cross_layer_topology_linkage_context_v1",
    );
    expect(diagnostics?.checks.solar_magnetogram?.source_product_family).toBe("magnetogram_products");
    expect(diagnostics?.checks.solar_flare_catalog?.source_doc_ids).toEqual(["goes_xray"]);
  });

  it("fails product provenance when a section declares the wrong family for an otherwise plausible product", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarProvenanceDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        ...(result.baseline_patch ?? { schema_version: "star-sim-solar-baseline/1" }),
        solar_magnetogram: {
          ...result.baseline_patch?.solar_magnetogram,
          metadata: {
            ...result.baseline_patch?.solar_magnetogram?.metadata,
            source_product_family: "cycle_index_products",
          },
        },
      },
    });

    expect(diagnostics?.overall_status).toBe("fail");
    expect(diagnostics?.checks.solar_magnetogram?.status).toBe("fail");
    expect(diagnostics?.checks.solar_magnetogram?.reason_code).toBe("section_product_family_mismatch");
  });

  it("evaluates the current Sun fixture as a passing Phase 0 interior closure baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarInteriorClosureDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.convection_zone_depth.status).toBe("pass");
    expect(diagnostics.checks.convection_zone_depth.reference_anchor_id).toBe("solar.interior.convection_zone_depth.v1");
    expect(diagnostics.checks.convection_zone_depth.reference_doc_ids).toEqual(["basu_antia_2004"]);
    expect(diagnostics.checks.envelope_helium_fraction.status).toBe("pass");
    expect(diagnostics.checks.envelope_helium_fraction.reference_anchor_id).toBe("solar.interior.envelope_helium_fraction.v1");
    expect(diagnostics.checks.low_degree_mode_support.status).toBe("pass");
    expect(diagnostics.checks.low_degree_mode_support.reference_anchor_id).toBe("solar.interior.low_degree_mode_support.v1");
    expect(diagnostics.checks.neutrino_constraint_vector.status).toBe("pass");
    expect(diagnostics.checks.neutrino_constraint_vector.reference_anchor_id).toBe("solar.interior.neutrino_constraint_vector.v1");
  });

  it("evaluates the merged Sun fixture as a passing solar structural residual baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarStructuralResidualDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.hydrostatic_balance_context.status).toBe("pass");
    expect(diagnostics.checks.hydrostatic_balance_context.reference_anchor_id).toBe(
      "solar.structural_residuals.hydrostatic_balance_context.v1",
    );
    expect(diagnostics.checks.sound_speed_residual_context.status).toBe("pass");
    expect(diagnostics.checks.sound_speed_residual_context.reference_anchor_id).toBe(
      "solar.structural_residuals.sound_speed_residual_context.v1",
    );
    expect(diagnostics.checks.rotation_residual_context.status).toBe("pass");
    expect(diagnostics.checks.pressure_scale_height_continuity_context.status).toBe("pass");
    expect(diagnostics.checks.neutrino_seismic_consistency_context.status).toBe("pass");
    expect(diagnostics.checks.residual_metadata_coherence_context.status).toBe("pass");
  });

  it("fails the structural residual baseline when hydrostatic or sound-speed residual refs are missing", () => {
    const diagnostics = evaluateSolarStructuralResidualDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_structural_residuals: {
          rotation_residual_ref: "artifact:solar/structural-residuals/rotation",
          summary: {
            max_rotation_residual_nhz: 8.4,
            residual_window_label: "cycle24-25-assimilated-closure-window",
          },
          metadata: {
            instrument: "solar-assimilation+SDO/HMI+GONG+Borexino",
            coordinate_frame: "Carrington",
            observed_mode: "assimilated",
            cadence: {
              value: 1,
              unit: "day",
            },
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.hydrostatic_balance_context.status).toBe("missing");
    expect(diagnostics.checks.hydrostatic_balance_context.reason_code).toBe("solar_hydrostatic_residual_missing");
    expect(diagnostics.checks.hydrostatic_balance_context.reference_anchor_id).toBe(
      "solar.structural_residuals.hydrostatic_balance_context.v1",
    );
    expect(diagnostics.checks.sound_speed_residual_context.status).toBe("missing");
    expect(diagnostics.checks.sound_speed_residual_context.reason_code).toBe("solar_sound_speed_residual_missing");
    expect(diagnostics.checks.sound_speed_residual_context.reference_anchor_id).toBe(
      "solar.structural_residuals.sound_speed_residual_context.v1",
    );
  });

  it("fails the structural residual baseline when rotation residual context is missing", () => {
    const diagnostics = evaluateSolarStructuralResidualDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_structural_residuals: {
          hydrostatic_residual_ref: "artifact:solar/structural-residuals/hydrostatic-balance",
          sound_speed_residual_ref: "artifact:solar/structural-residuals/sound-speed",
          summary: {
            max_sound_speed_fractional_residual: 0.0018,
            mean_hydrostatic_fractional_residual: 0.0006,
            residual_window_label: "cycle24-25-assimilated-closure-window",
          },
          metadata: {
            instrument: "solar-assimilation+SDO/HMI+GONG+Borexino",
            coordinate_frame: "Carrington",
            observed_mode: "assimilated",
            cadence: {
              value: 1,
              unit: "day",
            },
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.rotation_residual_context.status).toBe("missing");
    expect(diagnostics.checks.rotation_residual_context.reason_code).toBe("solar_rotation_residual_missing");
    expect(diagnostics.checks.rotation_residual_context.reference_anchor_id).toBe(
      "solar.structural_residuals.rotation_residual_context.v1",
    );
  });

  it("evaluates the merged Sun fixture as a passing solar cycle observed baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarCycleObservedDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.cycle_indices.status).toBe("pass");
    expect(diagnostics.checks.cycle_indices.reference_anchor_id).toBe("solar.cycle.cycle_indices.v1");
    expect(diagnostics.checks.cycle_indices.reference_doc_ids).toEqual(["goes_xray"]);
    expect(diagnostics.checks.chronology_window.status).toBe("pass");
    expect(diagnostics.checks.chronology_window.reference_anchor_id).toBe("solar.cycle.chronology_window.v1");
    expect(diagnostics.checks.chronology_window.reference_doc_ids).toEqual(["sft_review_2023"]);
    expect(diagnostics.checks.polarity_reversal_context.status).toBe("pass");
    expect(diagnostics.checks.polarity_reversal_context.reference_anchor_id).toBe("solar.cycle.polarity_reversal_context.v1");
    expect(diagnostics.checks.butterfly_history.status).toBe("pass");
    expect(diagnostics.checks.butterfly_history.reference_anchor_id).toBe("solar.cycle.butterfly_history.v1");
    expect(diagnostics.checks.axial_dipole_history.status).toBe("pass");
    expect(diagnostics.checks.axial_dipole_history.reference_anchor_id).toBe("solar.cycle.axial_dipole_history.v1");
    expect(diagnostics.checks.magnetogram_context.status).toBe("pass");
    expect(diagnostics.checks.magnetogram_context.reference_anchor_id).toBe("solar.cycle.magnetogram_context.v1");
    expect(diagnostics.checks.active_region_context.status).toBe("pass");
    expect(diagnostics.checks.active_region_context.reference_anchor_id).toBe("solar.cycle.active_region_context.v1");
    expect(diagnostics.checks.irradiance_continuity.status).toBe("pass");
    expect(diagnostics.checks.irradiance_continuity.reference_anchor_id).toBe("solar.cycle.irradiance_continuity.v1");
  });

  it("evaluates the merged Sun fixture as a passing local helioseismology baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarLocalHelioDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.dopplergram_context.status).toBe("pass");
    expect(diagnostics.checks.dopplergram_context.reference_anchor_id).toBe("solar.local_helio.dopplergram_context.v1");
    expect(diagnostics.checks.travel_time_or_holography_context.status).toBe("pass");
    expect(diagnostics.checks.travel_time_or_holography_context.reference_anchor_id).toBe(
      "solar.local_helio.travel_time_or_holography_context.v1",
    );
    expect(diagnostics.checks.sunquake_event_context.status).toBe("pass");
    expect(diagnostics.checks.sunquake_event_context.reference_anchor_id).toBe("solar.local_helio.sunquake_event_context.v1");
  });

  it("evaluates the merged Sun fixture as a passing solar surface-flow baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarSurfaceFlowDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.differential_rotation_context.status).toBe("pass");
    expect(diagnostics.checks.differential_rotation_context.reference_anchor_id).toBe(
      "solar.surface_flow.differential_rotation_context.v1",
    );
    expect(diagnostics.checks.meridional_flow_context.status).toBe("pass");
    expect(diagnostics.checks.active_region_geometry_context.status).toBe("pass");
    expect(diagnostics.checks.surface_transport_proxy_context.status).toBe("pass");
  });

  it("evaluates the merged Sun fixture as a passing solar coronal-field baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarCoronalFieldDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.pfss_context.status).toBe("pass");
    expect(diagnostics.checks.pfss_context.reference_anchor_id).toBe("solar.coronal_field.pfss_context.v1");
    expect(diagnostics.checks.synoptic_boundary_context.status).toBe("pass");
    expect(diagnostics.checks.open_field_topology_context.status).toBe("pass");
    expect(diagnostics.checks.source_region_linkage_context.status).toBe("pass");
  });

  it("evaluates the merged Sun fixture as a passing solar magnetic-memory baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarMagneticMemoryDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.axial_dipole_continuity_context.status).toBe("pass");
    expect(diagnostics.checks.axial_dipole_continuity_context.reference_anchor_id).toBe(
      "solar.magnetic_memory.axial_dipole_continuity_context.v1",
    );
    expect(diagnostics.checks.polar_field_continuity_context.status).toBe("pass");
    expect(diagnostics.checks.reversal_linkage_context.status).toBe("pass");
    expect(diagnostics.checks.active_region_polarity_ordering_context.status).toBe("pass");
    expect(diagnostics.checks.hemisphere_bipolar_coverage_context.status).toBe("pass");
    expect(diagnostics.checks.bipolar_region_proxy_context.status).toBe("pass");
  });

  it("evaluates the merged Sun fixture as a passing solar sunspot and spot-region baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarSpotRegionDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.sunspot_catalog_context.status).toBe("pass");
    expect(diagnostics.checks.sunspot_catalog_context.reference_anchor_id).toBe(
      "solar.spot_region.sunspot_catalog_context.v1",
    );
    expect(diagnostics.checks.spot_geometry_context.status).toBe("pass");
    expect(diagnostics.checks.spot_region_linkage_context.status).toBe("pass");
    expect(diagnostics.checks.bipolar_grouping_context.status).toBe("pass");
    expect(diagnostics.checks.polarity_tilt_context.status).toBe("pass");
  });

  it("evaluates the merged Sun fixture as a passing solar event-association baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarEventLinkageDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.flare_region_linkage_context.status).toBe("pass");
    expect(diagnostics.checks.flare_region_linkage_context.reference_anchor_id).toBe(
      "solar.event_linkage.flare_region_linkage_context.v1",
    );
    expect(diagnostics.checks.cme_region_linkage_context.status).toBe("pass");
    expect(diagnostics.checks.sunquake_flare_region_linkage_context.status).toBe("pass");
    expect(diagnostics.checks.event_chronology_alignment_context.status).toBe("pass");
    expect(diagnostics.checks.region_identifier_consistency_context.status).toBe("pass");
  });

  it("evaluates the merged Sun fixture as a passing solar topology-linkage baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarTopologyLinkageDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.spot_region_corona_context.status).toBe("pass");
    expect(diagnostics.checks.spot_region_corona_context.reference_anchor_id).toBe(
      "solar.topology_linkage.spot_region_corona_context.v1",
    );
    expect(diagnostics.checks.open_flux_polar_field_continuity_context.status).toBe("pass");
    expect(diagnostics.checks.event_topology_context.status).toBe("pass");
    expect(diagnostics.checks.topology_role_context.status).toBe("pass");
    expect(diagnostics.checks.chronology_alignment_context.status).toBe("pass");
    expect(diagnostics.checks.identifier_consistency_context.status).toBe("pass");
  });

  it("fails the topology-linkage baseline when spot-region-corona linkage or identifier integrity is missing", () => {
    const diagnostics = evaluateSolarTopologyLinkageDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_topology_linkage: {
          link_refs: ["artifact:solar/topology-linkage/bad-link"],
          link_count: 1,
          links: [
            {
              link_id: "artifact:solar/topology-linkage/bad-link",
              linked_spot_ids: ["artifact:solar/sunspots/spot-99999-a"],
              linked_region_id: "artifact:solar/active-regions/noaa-99999",
              linked_noaa_region_id: "99999",
              linked_harp_id: "HARP-99999",
              linked_pfss_solution_ref: "artifact:solar/coronal/pfss-solution-bad",
              linked_flare_refs: ["artifact:solar/flares/goes-event-1"],
              topology_role: "active_region_open_flux_source",
              linkage_basis: "catalog",
              time_window_start: "2025-02-14T10:30:00.000Z",
              time_window_end: "2025-02-14T12:30:00.000Z",
            },
          ],
          summary: {
            topology_role_count: 1,
            open_flux_link_count: 0,
            event_link_count: 1,
          },
          metadata: {
            instrument: "NSO/PFSS+SDO/HMI+NOAA+GOES/LASCO",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_sunspot_catalog: {
          spot_refs: ["artifact:solar/sunspots/spot-13000-a"],
          spot_count: 1,
          spots: [
            {
              spot_id: "artifact:solar/sunspots/spot-13000-a",
              linked_region_id: "artifact:solar/active-regions/noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              hemisphere: "north",
              heliographic_latitude_deg: 14.1,
              carrington_longitude_deg: 205.2,
              area_msh: 180,
              polarity: "negative",
            },
          ],
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
          regions: [
            {
              region_id: "artifact:solar/active-regions/noaa-13000",
              noaa_region_id: "13000",
              harp_id: "HARP-13000",
              heliographic_latitude_deg: 14.2,
              carrington_longitude_deg: 205.4,
              area_msh: 420,
              magnetic_class: "beta-gamma",
              tilt_deg: 11.5,
              leading_polarity: "negative",
              hemisphere: "north",
              following_polarity: "positive",
              bipole_separation_deg: 6.8,
              emergence_time_iso: "2025-02-14T08:15:00.000Z",
              linked_spot_ids: ["artifact:solar/sunspots/spot-13000-a"],
            },
          ],
        },
        solar_coronal_field: {
          pfss_solution_ref: "artifact:solar/coronal/pfss-solution-2290",
          synoptic_boundary_ref: "artifact:solar/coronal/synoptic-boundary-2290",
          coronal_hole_refs: ["artifact:solar/coronal/coronal-hole-north"],
          open_field_map_ref: "artifact:solar/coronal/open-field-map-2290",
          summary: {
            source_surface_rsun: 2.5,
            dominant_topology: "dipolar_open_flux",
            coronal_hole_count: 1,
          },
        },
        solar_magnetic_memory: {
          axial_dipole_history_ref: "artifact:solar/magnetic-memory/axial-dipole-history",
          polar_field_history_ref: "artifact:solar/magnetic-memory/polar-field-history",
          polarity_reversal_refs: ["artifact:solar/magnetic-memory/reversal-marker"],
          summary: {
            cycle_labels_covered: ["Cycle 24", "Cycle 25"],
            north_polarity_state: "negative",
            south_polarity_state: "positive",
            latest_axial_dipole_sign: "positive",
            reversal_marker_count: 1,
          },
        },
        solar_flare_catalog: {
          event_refs: ["artifact:solar/flares/goes-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-13000"],
          flare_count: 1,
          strongest_goes_class: "M1.2",
        },
        solar_cme_catalog: {
          event_refs: ["artifact:solar/cmes/lasco-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-13000"],
          cme_count: 1,
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.spot_region_corona_context.status).toBe("fail");
    expect(diagnostics.checks.spot_region_corona_context.reference_anchor_id).toBe(
      "solar.topology_linkage.spot_region_corona_context.v1",
    );
    expect(diagnostics.checks.open_flux_polar_field_continuity_context.status).toBe("fail");
    expect(diagnostics.checks.identifier_consistency_context.status).toBe("fail");
  });

  it("evaluates the merged Sun fixture as a passing solar cross-layer consistency baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarCrossLayerConsistencyDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.interior_residual_coherence.status).toBe("pass");
    expect(diagnostics.checks.interior_residual_coherence.reference_anchor_id).toBe(
      "solar.cross_layer_consistency.interior_residual_coherence.v1",
    );
    expect(diagnostics.checks.mode_residual_coherence.status).toBe("pass");
    expect(diagnostics.checks.rotation_residual_coherence.status).toBe("pass");
    expect(diagnostics.checks.cycle_memory_topology_coherence.status).toBe("pass");
    expect(diagnostics.checks.event_topology_identifier_coherence.status).toBe("pass");
    expect(diagnostics.checks.chronology_metadata_alignment.status).toBe("pass");
    expect(diagnostics.cross_layer_mismatch_summary).toEqual({
      failing_check_ids: [],
      warning_check_ids: [],
      conflicting_section_ids: [],
      conflict_token_count: 0,
      mismatch_fingerprint: "cross-layer:none",
    });
  });

  it("fails the cross-layer consistency baseline with explicit residual mismatch tokens", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });
    const diagnostics = evaluateSolarCrossLayerConsistencyDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        ...result.baseline_patch!,
        ...loadSolarCrossLayerCounterexamplePayload("solar-cross-layer-counterexample.structural-mismatch.json"),
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.interior_residual_coherence.status).toBe("fail");
    expect(diagnostics.checks.interior_residual_coherence.missing_required_refs).toEqual(
      expect.arrayContaining([
        "solar_structural_residuals.hydrostatic_residual_ref",
        "solar_structural_residuals.sound_speed_residual_ref",
      ]),
    );
    expect(diagnostics.checks.mode_residual_coherence.status).toBe("fail");
    expect(diagnostics.checks.mode_residual_coherence.missing_required_refs).toContain(
      "solar_structural_residuals.sound_speed_residual_ref",
    );
    expect(diagnostics.cross_layer_mismatch_summary.failing_check_ids).toEqual(
      expect.arrayContaining(["interior_residual_coherence", "mode_residual_coherence"]),
    );
    expect(diagnostics.cross_layer_mismatch_summary.mismatch_fingerprint).not.toBe("cross-layer:none");
  });

  it("fails the cross-layer consistency baseline with explicit magnetic-memory and topology ref conflicts", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarCrossLayerConsistencyDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        ...result.baseline_patch!,
        ...loadSolarCrossLayerCounterexamplePayload("solar-cross-layer-counterexample.memory-topology-mismatch.json"),
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.cycle_memory_topology_coherence.status).toBe("fail");
    expect(diagnostics.checks.cycle_memory_topology_coherence.conflicting_ref_pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "topology_memory_axial_dipole" }),
        expect.objectContaining({ relation: "topology_memory_polar_field" }),
        expect.objectContaining({ relation: "topology_coronal_pfss_solution" }),
      ]),
    );
    expect(diagnostics.checks.cycle_memory_topology_coherence.topology_link_ids_in_conflict).toEqual(
      expect.arrayContaining([
        "fixture:solar/topology-linkage/region-13000-open-flux",
        "fixture:solar/topology-linkage/region-13001-memory-continuity",
      ]),
    );
  });

  it("fails the cross-layer consistency baseline with explicit event and topology identifier conflicts", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarCrossLayerConsistencyDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        ...result.baseline_patch!,
        ...loadSolarCrossLayerCounterexamplePayload("solar-cross-layer-counterexample.event-topology-mismatch.json"),
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.event_topology_identifier_coherence.status).toBe("fail");
    expect(diagnostics.checks.event_topology_identifier_coherence.conflicting_region_ids).toContain(
      "fixture:solar/active-regions/noaa-99999",
    );
    expect(diagnostics.checks.event_topology_identifier_coherence.conflicting_noaa_ids).toContain("99999");
    expect(diagnostics.checks.event_topology_identifier_coherence.conflicting_harp_ids).toContain("HARP-99999");
    expect(diagnostics.checks.event_topology_identifier_coherence.event_refs_in_conflict).toEqual(
      expect.arrayContaining([
        "fixture:solar/flares/goes-2025-001",
        "fixture:solar/cmes/lasco-2025-001",
      ]),
    );
  });

  it("fails the cross-layer consistency baseline with explicit chronology and metadata conflict fields", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarCrossLayerConsistencyDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        ...result.baseline_patch!,
        ...loadSolarCrossLayerCounterexamplePayload("solar-cross-layer-counterexample.metadata-mismatch.json"),
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.chronology_metadata_alignment.status).toBe("fail");
    expect(diagnostics.checks.chronology_metadata_alignment.non_carrington_sections).toContain("solar_coronal_field");
    expect(diagnostics.checks.chronology_metadata_alignment.out_of_window_event_refs).toEqual(
      expect.arrayContaining([
        "fixture:solar/flares/goes-2025-001",
        "fixture:solar/cmes/lasco-2025-001",
      ]),
    );
    expect(diagnostics.checks.chronology_metadata_alignment.topology_link_ids_in_conflict).toContain(
      "fixture:solar/topology-linkage/region-13000-open-flux",
    );
  });

  it("fails the magnetic-memory baseline when axial-dipole continuity is missing", () => {
    const diagnostics = evaluateSolarMagneticMemoryDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_magnetic_memory: {
          polar_field_history_ref: "artifact:solar/magnetic-memory/polar-field-history",
          polarity_reversal_refs: ["artifact:solar/magnetic-memory/reversal-marker"],
          summary: {
            cycle_labels_covered: ["Cycle 24", "Cycle 25"],
            north_polarity_state: "negative",
            south_polarity_state: "positive",
            latest_axial_dipole_sign: "positive",
            reversal_marker_count: 1,
          },
          metadata: {
            instrument: "NOAA/SWPC+SDO/HMI",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000", "artifact:solar/active-regions/noaa-13001"],
          region_count: 2,
          regions: [
            {
              region_id: "artifact:solar/active-regions/noaa-13000",
              heliographic_latitude_deg: 14.2,
              carrington_longitude_deg: 205.4,
              area_msh: 420,
              magnetic_class: "beta-gamma",
              tilt_deg: 11.5,
              leading_polarity: "negative",
              hemisphere: "north",
              following_polarity: "positive",
              bipole_separation_deg: 6.8,
            },
            {
              region_id: "artifact:solar/active-regions/noaa-13001",
              heliographic_latitude_deg: -9.6,
              carrington_longitude_deg: 218.8,
              area_msh: 360,
              magnetic_class: "beta",
              tilt_deg: -8.1,
              leading_polarity: "positive",
              hemisphere: "south",
              following_polarity: "negative",
              bipole_separation_deg: 5.7,
            },
          ],
          metadata: {
            instrument: "NOAA+SDO/HMI/HARP",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.axial_dipole_continuity_context.status).toBe("missing");
    expect(diagnostics.checks.axial_dipole_continuity_context.reason_code).toBe("solar_magnetic_memory_axial_dipole_missing");
  });

  it("fails the magnetic-memory baseline when active-region hemisphere coverage is one-sided", () => {
    const diagnostics = evaluateSolarMagneticMemoryDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_magnetic_memory: {
          axial_dipole_history_ref: "artifact:solar/magnetic-memory/axial-dipole-history",
          polar_field_history_ref: "artifact:solar/magnetic-memory/polar-field-history",
          polarity_reversal_refs: ["artifact:solar/magnetic-memory/reversal-marker"],
          summary: {
            cycle_labels_covered: ["Cycle 24", "Cycle 25"],
            north_polarity_state: "negative",
            south_polarity_state: "positive",
            latest_axial_dipole_sign: "positive",
            reversal_marker_count: 1,
          },
          metadata: {
            instrument: "NOAA/SWPC+SDO/HMI",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
          regions: [
            {
              region_id: "artifact:solar/active-regions/noaa-13000",
              heliographic_latitude_deg: 14.2,
              carrington_longitude_deg: 205.4,
              area_msh: 420,
              magnetic_class: "beta-gamma",
              tilt_deg: 11.5,
              leading_polarity: "negative",
              hemisphere: "north",
              following_polarity: "positive",
              bipole_separation_deg: 6.8,
            },
          ],
          metadata: {
            instrument: "NOAA+SDO/HMI/HARP",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.hemisphere_bipolar_coverage_context.status).toBe("fail");
    expect(diagnostics.checks.hemisphere_bipolar_coverage_context.reason_code).toBe("solar_active_region_hemisphere_incomplete");
  });

  it("fails the spot-region baseline when the sunspot catalog is missing", () => {
    const diagnostics = evaluateSolarSpotRegionDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
          regions: [
            {
              region_id: "artifact:solar/active-regions/noaa-13000",
              noaa_region_id: "13000",
              harp_id: "HARP-13000",
              linked_spot_ids: ["artifact:solar/sunspots/spot-13000-a"],
            },
          ],
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.sunspot_catalog_context.status).toBe("missing");
    expect(diagnostics.checks.sunspot_catalog_context.reason_code).toBe("solar_sunspot_catalog_missing");
    expect(diagnostics.checks.sunspot_catalog_context.reference_anchor_id).toBe(
      "solar.spot_region.sunspot_catalog_context.v1",
    );
  });

  it("fails the spot-region baseline when spot geometry or linkage is too thin", () => {
    const diagnostics = evaluateSolarSpotRegionDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_sunspot_catalog: {
          spot_refs: ["artifact:solar/sunspots/spot-13000-a"],
          spot_count: 1,
          spots: [
            {
              spot_id: "artifact:solar/sunspots/spot-13000-a",
              linked_region_id: "artifact:solar/active-regions/noaa-13000",
            },
          ],
          metadata: {
            instrument: "NOAA+SDO/HMI/HARP",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
            source_product_id: "hmi_noaa_sunspot_catalog_v1",
            source_product_family: "sunspot_catalog_products",
            source_doc_ids: ["hmi_products", "sft_review_2023"],
          },
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
          regions: [
            {
              region_id: "artifact:solar/active-regions/noaa-13000",
              noaa_region_id: "13000",
              harp_id: "HARP-13000",
              linked_spot_ids: ["artifact:solar/sunspots/spot-99999"],
              leading_polarity: "negative",
            },
          ],
          metadata: {
            instrument: "NOAA+SDO/HMI/HARP",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
            source_product_id: "hmi_noaa_bipolar_active_region_context_v1",
            source_product_family: "bipolar_active_region_products",
            source_doc_ids: ["hmi_products", "sft_review_2023"],
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.spot_geometry_context.status).toBe("fail");
    expect(diagnostics.checks.spot_geometry_context.reason_code).toBe("solar_spot_geometry_incomplete");
    expect(diagnostics.checks.spot_region_linkage_context.status).toBe("fail");
    expect(diagnostics.checks.spot_region_linkage_context.reason_code).toBe("solar_spot_region_linkage_incomplete");
    expect(diagnostics.checks.bipolar_grouping_context.status).toBe("fail");
    expect(diagnostics.checks.polarity_tilt_context.status).toBe("fail");
  });

  it("fails the event-association baseline when flare linkage is missing", () => {
    const diagnostics = evaluateSolarEventLinkageDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_event_linkage: {
          links: [
            {
              linked_region_id: "artifact:solar/active-regions/noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              event_type: "cme",
              event_ref: "artifact:solar/cmes/lasco-event-1",
              linkage_basis: "catalog",
              event_time_iso: "2025-02-14T12:00:00.000Z",
            },
          ],
          summary: {
            flare_link_count: 0,
            cme_link_count: 1,
            sunquake_link_count: 0,
          },
          metadata: {
            instrument: "GOES/SWPC+SOHO/LASCO+SDO/HMI+GONG",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_flare_catalog: {
          event_refs: ["artifact:solar/flares/goes-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-13000"],
          flare_count: 1,
          strongest_goes_class: "M1.2",
        },
        solar_cme_catalog: {
          event_refs: ["artifact:solar/cmes/lasco-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-13000"],
          cme_count: 1,
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
          regions: [
            {
              region_id: "artifact:solar/active-regions/noaa-13000",
              noaa_region_id: "13000",
              harp_id: "HARP-13000",
              heliographic_latitude_deg: 14.2,
              carrington_longitude_deg: 205.4,
              area_msh: 420,
              magnetic_class: "beta-gamma",
              tilt_deg: 11.5,
              leading_polarity: "negative",
              hemisphere: "north",
              following_polarity: "positive",
              bipole_separation_deg: 6.8,
              emergence_time_iso: "2025-02-14T08:15:00.000Z",
            },
          ],
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.flare_region_linkage_context.status).toBe("fail");
    expect(diagnostics.checks.flare_region_linkage_context.reason_code).toBe("solar_event_linkage_flare_missing");
  });

  it("fails the event-association baseline when linked region identifiers are inconsistent", () => {
    const diagnostics = evaluateSolarEventLinkageDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_event_linkage: {
          links: [
            {
              linked_region_id: "artifact:solar/active-regions/noaa-99999",
              linked_noaa_region_id: "99999",
              linked_harp_id: "HARP-99999",
              event_type: "flare",
              event_ref: "artifact:solar/flares/goes-event-1",
              linkage_basis: "catalog",
              event_time_iso: "2025-02-14T11:23:00.000Z",
            },
            {
              linked_region_id: "artifact:solar/active-regions/noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              event_type: "cme",
              event_ref: "artifact:solar/cmes/lasco-event-1",
              linkage_basis: "catalog",
              event_time_iso: "2025-02-14T12:02:00.000Z",
            },
          ],
          summary: {
            flare_link_count: 1,
            cme_link_count: 1,
            sunquake_link_count: 0,
          },
          metadata: {
            instrument: "GOES/SWPC+SOHO/LASCO+SDO/HMI+GONG",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_flare_catalog: {
          event_refs: ["artifact:solar/flares/goes-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-13000"],
          flare_count: 1,
          strongest_goes_class: "M1.2",
        },
        solar_cme_catalog: {
          event_refs: ["artifact:solar/cmes/lasco-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-13000"],
          cme_count: 1,
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
          regions: [
            {
              region_id: "artifact:solar/active-regions/noaa-13000",
              noaa_region_id: "13000",
              harp_id: "HARP-13000",
              heliographic_latitude_deg: 14.2,
              carrington_longitude_deg: 205.4,
              area_msh: 420,
              magnetic_class: "beta-gamma",
              tilt_deg: 11.5,
              leading_polarity: "negative",
              hemisphere: "north",
              following_polarity: "positive",
              bipole_separation_deg: 6.8,
              emergence_time_iso: "2025-02-14T08:15:00.000Z",
            },
          ],
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.region_identifier_consistency_context.status).toBe("fail");
    expect(diagnostics.checks.region_identifier_consistency_context.reason_code).toBe(
      "solar_event_linkage_region_identifier_inconsistent",
    );
  });

  it("fails the surface-flow baseline when active-region geometry stays count-only", () => {
    const diagnostics = evaluateSolarSurfaceFlowDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_surface_flows: {
          differential_rotation_ref: "artifact:solar/surface-flow/differential-rotation",
          meridional_flow_ref: "artifact:solar/surface-flow/meridional-flow",
          metadata: {
            instrument: "SDO/HMI+GONG",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
          metadata: {
            instrument: "NOAA+SDO/HMI/HARP",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.active_region_geometry_context.status).toBe("fail");
    expect(diagnostics.checks.active_region_geometry_context.reason_code).toBe("solar_active_region_geometry_incomplete");
  });

  it("fails the coronal-field baseline when PFSS and synoptic-boundary context are missing", () => {
    const diagnostics = evaluateSolarCoronalFieldDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_coronal_field: {
          coronal_hole_refs: [],
          summary: {
            dominant_topology: "unknown",
            coronal_hole_count: 0,
          },
          metadata: {
            instrument: "NSO/PFSS+SDO/HMI",
            coordinate_frame: "Carrington",
            observed_mode: "modeled",
            cadence: {
              value: 1,
              unit: "carrington_rotation",
            },
            source_product_id: "pfss_coronal_field_context_v1",
            source_product_family: "coronal_field_proxy_products",
            source_doc_ids: ["nso_pfss", "hmi_products", "aia_corona"],
          },
        },
        solar_magnetogram: {
          synoptic_radial_map_ref: "artifact:solar/magnetograms/synoptic-radial",
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.pfss_context.status).toBe("fail");
    expect(diagnostics.checks.pfss_context.reason_code).toBe("solar_coronal_field_pfss_missing");
    expect(diagnostics.checks.synoptic_boundary_context.status).toBe("fail");
    expect(diagnostics.checks.synoptic_boundary_context.reason_code).toBe("solar_coronal_field_boundary_missing");
    expect(diagnostics.checks.open_field_topology_context.status).toBe("fail");
  });

  it("fails the local helioseismology baseline when the Dopplergram ref is missing", () => {
    const diagnostics = evaluateSolarLocalHelioDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_local_helio: {
          travel_time_ref: "artifact:solar/local-helio/travel-time",
          metadata: {
            instrument: "SDO/HMI+GONG",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.dopplergram_context.status).toBe("missing");
    expect(diagnostics.checks.dopplergram_context.reason_code).toBe("solar_local_helio_dopplergram_missing");
  });

  it("fails the local helioseismology baseline when both travel-time and holography evidence are missing", () => {
    const diagnostics = evaluateSolarLocalHelioDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_local_helio: {
          dopplergram_ref: "artifact:solar/local-helio/dopplergram",
          metadata: {
            instrument: "SDO/HMI+GONG",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.travel_time_or_holography_context.status).toBe("fail");
    expect(diagnostics.checks.travel_time_or_holography_context.reason_code).toBe("solar_local_helio_context_incomplete");
  });

  it("treats missing sunquake refs as advisory-only in the local helioseismology phase", () => {
    const diagnostics = evaluateSolarLocalHelioDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_local_helio: {
          dopplergram_ref: "artifact:solar/local-helio/dopplergram",
          travel_time_ref: "artifact:solar/local-helio/travel-time",
          metadata: {
            instrument: "SDO/HMI+GONG",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
      },
    });

    expect(diagnostics.overall_status).toBe("warn");
    expect(diagnostics.checks.sunquake_event_context.status).toBe("warn");
  });

  it("fails the solar cycle observed baseline when chronology stays snapshot-thin or loses Hale markers", () => {
    const diagnostics = evaluateSolarCycleObservedDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_cycle_indices: {
          sunspot_number: 82,
          f10_7_sfu: 155,
          cycle_label: "Cycle 25",
          polarity_label: "north_negative_south_positive",
        },
        solar_cycle_history: {
          history_start_iso: "2025-01-01T00:00:00.000Z",
          history_end_iso: "2025-12-31T23:59:59.000Z",
          covered_cycle_labels: ["Cycle 25"],
          axial_dipole_history_ref: "artifact:solar/cycle/axial-dipole-history",
          polar_field_history_ref: "artifact:solar/cycle/polar-field-history",
        },
        solar_magnetogram: {
          line_of_sight_ref: "artifact:solar/magnetograms/los",
          synoptic_radial_map_ref: "artifact:solar/magnetograms/synoptic",
          active_region_patch_refs: ["artifact:solar/magnetograms/patch-1"],
        },
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
        },
      },
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.chronology_window.status).toBe("fail");
    expect(diagnostics.checks.chronology_window.reason_code).toBe("solar_cycle_chronology_incomplete");
    expect(diagnostics.checks.polarity_reversal_context.status).toBe("fail");
    expect(diagnostics.checks.polarity_reversal_context.reason_code).toBe("solar_cycle_polarity_reversal_missing");
    expect(diagnostics.checks.butterfly_history.status).toBe("fail");
    expect(diagnostics.checks.butterfly_history.reason_code).toBe("solar_cycle_butterfly_history_missing");
  });

  it("evaluates the merged Sun fixture as a passing solar eruptive observed baseline", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = evaluateSolarEruptiveCatalogDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("pass");
    expect(diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics.checks.flare_catalog.status).toBe("pass");
    expect(diagnostics.checks.flare_catalog.reference_anchor_id).toBe("solar.eruptive.flare_catalog.v1");
    expect(diagnostics.checks.flare_catalog.reference_doc_ids).toEqual(["goes_xray"]);
    expect(diagnostics.checks.cme_catalog.status).toBe("pass");
    expect(diagnostics.checks.cme_catalog.reference_anchor_id).toBe("solar.eruptive.cme_catalog.v1");
    expect(diagnostics.checks.irradiance_continuity.status).toBe("pass");
    expect(diagnostics.checks.irradiance_continuity.reference_anchor_id).toBe("solar.eruptive.irradiance_continuity.v1");
    expect(diagnostics.checks.source_region_linkage.status).toBe("pass");
    expect(diagnostics.checks.source_region_linkage.reference_anchor_id).toBe("solar.eruptive.source_region_linkage.v1");
  });

  it("evaluates the merged Sun fixture as cross-phase consistent", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const diagnostics = buildSolarConsistencyDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics?.overall_status).toBe("pass");
    expect(diagnostics?.reference_pack_id).toBe("solar_reference_pack");
    expect(diagnostics?.checks.source_region_overlap.status).toBe("pass");
    expect(diagnostics?.checks.source_region_overlap.reference_anchor_id).toBe("solar.consistency.source_region_overlap.v1");
    expect(diagnostics?.checks.source_region_overlap.reference_doc_ids).toEqual(["hmi_products", "goes_xray", "lasco_docs"]);
    expect(diagnostics?.checks.magnetogram_active_region_linkage.status).toBe("pass");
    expect(diagnostics?.checks.magnetogram_active_region_linkage.reference_anchor_id).toBe("solar.consistency.magnetogram_active_region_linkage.v1");
    expect(diagnostics?.checks.irradiance_context_consistency.status).toBe("pass");
    expect(diagnostics?.checks.irradiance_context_consistency.reference_anchor_id).toBe("solar.consistency.irradiance_context.v1");
    expect(diagnostics?.checks.phase_metadata_coherence.status).toBe("pass");
    expect(diagnostics?.checks.phase_metadata_coherence.reference_anchor_id).toBe("solar.consistency.phase_metadata_coherence.v1");
  });

  it("flags mismatched source-region refs in the solar consistency diagnostics", () => {
    const diagnostics = buildSolarConsistencyDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_active_regions: {
          region_refs: ["artifact:solar/active-regions/noaa-13000"],
          region_count: 1,
        },
        solar_magnetogram: {
          active_region_patch_refs: ["artifact:solar/magnetograms/patch-1"],
          metadata: {
            instrument: "SDO/HMI",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_flare_catalog: {
          event_refs: ["artifact:solar/flares/goes-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-99999"],
          flare_count: 1,
          strongest_goes_class: "M1.2",
        },
        solar_cme_catalog: {
          event_refs: ["artifact:solar/cmes/lasco-event-1"],
          source_region_refs: ["artifact:solar/active-regions/noaa-99999"],
          cme_count: 1,
        },
        solar_irradiance_series: {
          tsi_ref: "artifact:solar/irradiance/tsi",
          euv_ref: "artifact:solar/irradiance/euv",
        },
      },
    });

    expect(diagnostics?.checks.source_region_overlap.status).toBe("fail");
    expect(diagnostics?.checks.source_region_overlap.reason_code).toBe("source_region_overlap_mismatch");
    expect(diagnostics?.checks.source_region_overlap.reference_pack_id).toBe("solar_reference_pack");
  });

  it("drives solar diagnostics from the loaded reference-pack content", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });
    const updatedPack = getSolarReferencePack();
    updatedPack.anchors.interior.convection_zone_depth.expected_summary = {
      ...(updatedPack.anchors.interior.convection_zone_depth.expected_summary ?? {}),
      pass_range: {
        min: 0.714,
        max: 0.718,
      },
      warn_range: {
        min: 0.714,
        max: 0.718,
      },
    };
    __setSolarReferencePackForTest(updatedPack);

    const diagnostics = evaluateSolarInteriorClosureDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics.overall_status).toBe("fail");
    expect(diagnostics.checks.convection_zone_depth.status).toBe("fail");
    expect(diagnostics.checks.convection_zone_depth.reference_pack_version).toBe(updatedPack.version);
  });

  it("validates event-congruence and speculative anchors from the solar reference pack", () => {
    const pack = getSolarReferencePack();

    expect(pack.anchors.event_congruence.reconnection_null.id).toBe("solar.eruptive.reconnection_null.v1");
    expect(pack.anchors.event_congruence.pmode_phase_modulation.id).toBe(
      "solar.eruptive.pmode_phase_modulation.v1",
    );
    expect(pack.anchors.event_congruence.ribbon_blob_tearing_context.reference_doc_ids).toContain(
      "dkist_visp_ribbon_blobs_2025",
    );
    expect(pack.anchors.event_congruence.multifractal_flare_memory_proxy.id).toBe(
      "solar.temporal.multifractal_flare_memory_proxy.v1",
    );
    expect(pack.anchors.event_congruence.entropy_aliasing_context.reference_doc_ids).toContain(
      "high_entropy_quantum_limit_2026",
    );
    expect(
      (pack.anchors.speculative.collapse_residual_context.expected_summary as Record<string, unknown>)
        .source_power_allowed,
    ).toBe(false);
  });

  it("fails clearly when the solar reference-pack JSON is malformed", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-solar-pack-"));
    const packPath = path.join(tempRoot, "solar-reference-pack.bad.json");
    fs.writeFileSync(packPath, "{\n  \"id\": \"broken\",\n", "utf8");

    expect(() => loadSolarReferencePackFromPath(packPath)).toThrow(/Failed to parse solar reference pack JSON/);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("fails clearly when the solar product-registry JSON is malformed", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-solar-products-"));
    const registryPath = path.join(tempRoot, "solar-product-registry.bad.json");
    fs.writeFileSync(registryPath, "{\n  \"id\": \"broken\",\n", "utf8");

    expect(() => loadSolarProductRegistryFromPath(registryPath)).toThrow(/Failed to parse solar product registry JSON/);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("drives solar provenance diagnostics from the loaded product-registry content", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });
    const updatedRegistry = getSolarProductRegistry();
    updatedRegistry.products.hmi_full_disk_magnetogram_v1.instrument = "HMI/ALT";
    __setSolarProductRegistryForTest(updatedRegistry);

    const diagnostics = evaluateSolarProvenanceDiagnostics({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: result.baseline_patch ?? undefined,
    });

    expect(diagnostics?.overall_status).toBe("fail");
    expect(diagnostics?.checks.solar_magnetogram?.status).toBe("fail");
    expect(diagnostics?.checks.solar_magnetogram?.reason_code).toBe("section_product_instrument_mismatch");
  });
});
