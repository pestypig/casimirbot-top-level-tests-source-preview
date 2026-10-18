import { describe, expect, it } from "vitest";
import {
  STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
  starSimArtifactRefSchema,
  starSimRequestSchema,
} from "../server/modules/starsim/contract";

describe("star-sim solar baseline contract", () => {
  it("accepts additive solar baseline sections on requests", () => {
    const parsed = starSimRequestSchema.parse({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
        solar_interior_profile: {
          profile_ref: "artifacts/research/starsim/solar/interior/profile.json",
          summary: {
            convection_zone_base_rsun: 0.713,
            envelope_helium_fraction: 0.248,
          },
          metadata: {
            instrument: "MESA+helioseismic-assimilation",
            observed_mode: "assimilated",
          },
        },
        solar_global_modes: {
          mode_table_ref: "artifacts/research/starsim/solar/modes/low-degree.json",
          low_degree_mode_count: 40,
        },
        solar_surface_flows: {
          differential_rotation_ref: "artifacts/research/starsim/solar/surface-flows/differential-rotation.json",
          meridional_flow_ref: "artifacts/research/starsim/solar/surface-flows/meridional-flow.json",
          summary: {
            equatorial_rotation_deg_per_day: 14.35,
            rotation_shear_deg_per_day: 2.68,
            meridional_flow_peak_ms: 12.4,
          },
          metadata: {
            instrument: "SDO/HMI+GONG",
            observed_mode: "observed",
            source_product_id: "hmi_gong_surface_flow_context_v1",
            source_product_family: "surface_flow_products",
            source_doc_ids: ["hmi_products", "gong_products", "sft_review_2023"],
          },
        },
        solar_coronal_field: {
          pfss_solution_ref: "artifacts/research/starsim/solar/corona/pfss-solution.json",
          synoptic_boundary_ref: "artifacts/research/starsim/solar/corona/synoptic-boundary.json",
          coronal_hole_refs: [
            "artifacts/research/starsim/solar/corona/coronal-hole-north.json",
            "artifacts/research/starsim/solar/corona/coronal-hole-south.json",
          ],
          open_field_map_ref: "artifacts/research/starsim/solar/corona/open-field-map.json",
          euv_coronal_context_ref: "artifacts/research/starsim/solar/corona/aia-context.json",
          summary: {
            source_surface_rsun: 2.5,
            open_flux_weber: 340000000000000,
            dominant_topology: "dipolar_open_flux",
            coronal_hole_count: 2,
          },
          metadata: {
            instrument: "NSO/PFSS+SDO/HMI+SDO/AIA",
            observed_mode: "modeled",
            source_product_id: "pfss_coronal_field_context_v1",
            source_product_family: "coronal_field_proxy_products",
            source_doc_ids: ["nso_pfss", "hmi_products", "aia_corona"],
          },
        },
        solar_magnetic_memory: {
          axial_dipole_history_ref: "artifacts/research/starsim/solar/magnetic-memory/axial-dipole-history.json",
          polar_field_history_ref: "artifacts/research/starsim/solar/magnetic-memory/polar-field-history.json",
          polarity_reversal_refs: ["artifacts/research/starsim/solar/magnetic-memory/reversal-2024.json"],
          bipolar_region_proxy_ref: "artifacts/research/starsim/solar/magnetic-memory/bipolar-proxy.json",
          summary: {
            cycle_labels_covered: ["Cycle 24", "Cycle 25"],
            north_polarity_state: "negative",
            south_polarity_state: "positive",
            latest_axial_dipole_sign: "positive",
            reversal_marker_count: 1,
          },
          metadata: {
            instrument: "NOAA/SWPC+SDO/HMI",
            observed_mode: "observed",
            source_product_id: "hmi_noaa_magnetic_memory_history_v1",
            source_product_family: "magnetic_memory_products",
            source_doc_ids: ["sft_review_2023", "hmi_products"],
          },
        },
        solar_sunspot_catalog: {
          spot_refs: [
            "artifacts/research/starsim/solar/sunspots/spot-13000-a.json",
            "artifacts/research/starsim/solar/sunspots/spot-13000-b.json",
          ],
          spot_count: 2,
          bipolar_group_refs: ["artifacts/research/starsim/solar/sunspots/group-13000.json"],
          spots: [
            {
              spot_id: "spot-13000-a",
              linked_region_id: "noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              hemisphere: "north",
              heliographic_latitude_deg: 14.1,
              carrington_longitude_deg: 205.2,
              area_msh: 180,
              polarity: "negative",
              umbra_area_msh: 62,
              penumbra_area_msh: 118,
              magnetic_class: "beta-gamma",
              bipolar_group_id: "group-13000",
              emergence_time_iso: "2025-02-14T08:10:00.000Z",
            },
            {
              spot_id: "spot-13000-b",
              linked_region_id: "noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              hemisphere: "north",
              heliographic_latitude_deg: 14.4,
              carrington_longitude_deg: 206,
              area_msh: 150,
              polarity: "positive",
              bipolar_group_id: "group-13000",
            },
          ],
          metadata: {
            instrument: "NOAA+SDO/HMI/HARP",
            observed_mode: "observed",
            source_product_id: "hmi_noaa_sunspot_catalog_v1",
            source_product_family: "sunspot_catalog_products",
            source_doc_ids: ["hmi_products", "sft_review_2023"],
          },
        },
        solar_event_linkage: {
          link_refs: ["artifacts/research/starsim/solar/event-linkage/linkage-summary.json"],
          links: [
            {
              linked_region_id: "noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              event_type: "flare",
              event_ref: "artifacts/research/starsim/solar/flares/goes-event-1.json",
              linkage_basis: "catalog",
              event_time_iso: "2025-02-14T11:23:00.000Z",
              time_offset_minutes: 12,
            },
          ],
          summary: {
            flare_link_count: 1,
            cme_link_count: 0,
            sunquake_link_count: 0,
          },
          metadata: {
            instrument: "GOES/SWPC+SOHO/LASCO+SDO/HMI+GONG",
            observed_mode: "observed",
            source_product_id: "solar_cross_phase_event_linkage_context_v1",
            source_product_family: "cross_phase_event_linkage",
            source_doc_ids: ["goes_xray", "lasco_docs", "hmi_products", "gong_products"],
          },
        },
        solar_topology_linkage: {
          link_refs: ["artifacts/research/starsim/solar/topology/linkage-13000.json"],
          link_count: 1,
          links: [
            {
              link_id: "topology-link-13000",
              linked_spot_ids: ["spot-13000-a", "spot-13000-b"],
              linked_region_id: "noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              linked_pfss_solution_ref: "artifacts/research/starsim/solar/corona/pfss-solution.json",
              linked_open_field_map_ref: "artifacts/research/starsim/solar/corona/open-field-map.json",
              linked_coronal_hole_refs: ["artifacts/research/starsim/solar/corona/coronal-hole-north.json"],
              linked_flare_refs: ["artifacts/research/starsim/solar/flares/goes-event-1.json"],
              linked_cme_refs: ["artifacts/research/starsim/solar/cmes/lasco-event-1.json"],
              linked_polar_field_ref: "artifacts/research/starsim/solar/magnetic-memory/polar-field-history.json",
              linked_axial_dipole_ref: "artifacts/research/starsim/solar/magnetic-memory/axial-dipole-history.json",
              topology_role: "active_region_open_flux_source",
              linkage_basis: "manual_catalog_association",
              time_window_start: "2025-02-14T10:30:00.000Z",
              time_window_end: "2025-02-14T12:30:00.000Z",
              notes: ["Open-flux corridor linked to AR13000."],
            },
          ],
          summary: {
            topology_role_count: 1,
            open_flux_link_count: 1,
            event_link_count: 1,
          },
          metadata: {
            instrument: "NSO/PFSS+SDO/HMI+NOAA+GOES/LASCO",
            observed_mode: "observed",
            source_product_id: "solar_cross_layer_topology_linkage_context_v1",
            source_product_family: "topology_linkage_products",
            source_doc_ids: ["nso_pfss", "hmi_products", "sft_review_2023", "goes_xray", "lasco_docs"],
          },
        },
        solar_active_regions: {
          region_refs: ["artifacts/research/starsim/solar/active-regions/noaa-13000.json"],
          region_count: 1,
          regions: [
            {
              region_id: "noaa-13000",
              noaa_region_id: "13000",
              harp_id: "HARP-13000",
              sharp_ref: "artifacts/research/starsim/solar/active-regions/sharp-13000.json",
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
              joy_law_tilt_class: "aligned",
              linked_spot_ids: ["spot-13000-a", "spot-13000-b"],
              bipolar_group_id: "group-13000",
              polarity_ordering_class: "hale-consistent",
            },
          ],
        },
        solar_neutrino_constraints: {
          constraints_ref: "artifacts/research/starsim/solar/neutrinos/closure.json",
          cno_flux: 7.0,
        },
      },
    });

    expect(parsed.solar_baseline?.schema_version).toBe(STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION);
    expect(parsed.solar_baseline?.solar_interior_profile?.summary?.convection_zone_base_rsun).toBe(0.713);
    expect(parsed.solar_baseline?.solar_surface_flows?.summary?.equatorial_rotation_deg_per_day).toBe(14.35);
    expect(parsed.solar_baseline?.solar_coronal_field?.summary?.dominant_topology).toBe("dipolar_open_flux");
    expect(parsed.solar_baseline?.solar_magnetic_memory?.summary?.latest_axial_dipole_sign).toBe("positive");
    expect(parsed.solar_baseline?.solar_sunspot_catalog?.spot_count).toBe(2);
    expect(parsed.solar_baseline?.solar_sunspot_catalog?.spots?.[0]?.polarity).toBe("negative");
    expect(parsed.solar_baseline?.solar_event_linkage?.summary?.flare_link_count).toBe(1);
    expect(parsed.solar_baseline?.solar_event_linkage?.links?.[0]?.linkage_basis).toBe("catalog");
    expect(parsed.solar_baseline?.solar_topology_linkage?.link_count).toBe(1);
    expect(parsed.solar_baseline?.solar_topology_linkage?.links?.[0]?.topology_role).toBe("active_region_open_flux_source");
    expect(parsed.solar_baseline?.solar_topology_linkage?.metadata?.source_product_id).toBe(
      "solar_cross_layer_topology_linkage_context_v1",
    );
    expect(parsed.solar_baseline?.solar_active_regions?.regions?.[0]?.leading_polarity).toBe("negative");
    expect(parsed.solar_baseline?.solar_active_regions?.regions?.[0]?.hemisphere).toBe("north");
    expect(parsed.solar_baseline?.solar_active_regions?.regions?.[0]?.linked_spot_ids).toEqual(["spot-13000-a", "spot-13000-b"]);
    expect(parsed.solar_baseline?.solar_active_regions?.regions?.[0]?.polarity_ordering_class).toBe("hale-consistent");
    expect(parsed.solar_baseline?.solar_neutrino_constraints?.cno_flux).toBe(7.0);
  });

  it("preserves solar artifact metadata fields on artifact refs", () => {
    const artifactRef = starSimArtifactRefSchema.parse({
      kind: "solar_interior_profile",
      path: "artifacts/research/starsim/solar/interior/profile.json",
      hash: "abc123",
      integrity_status: "verified",
      metadata: {
        time_range: {
          start_iso: "2026-01-01T00:00:00.000Z",
          end_iso: "2026-01-02T00:00:00.000Z",
        },
        cadence: {
          value: 12,
          unit: "s",
        },
        coordinate_frame: "Carrington",
        carrington_rotation: 2290,
        instrument: "SDO/HMI",
        observed_mode: "observed",
        uncertainty_summary: {
          kind: "summary",
          note: "1 sigma aggregate uncertainty",
        },
      },
    });

    expect(artifactRef.metadata?.instrument).toBe("SDO/HMI");
    expect(artifactRef.metadata?.coordinate_frame).toBe("Carrington");
    expect(artifactRef.metadata?.cadence?.value).toBe(12);
    expect(artifactRef.metadata?.observed_mode).toBe("observed");
  });
});
