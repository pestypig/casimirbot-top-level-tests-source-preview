import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeStarSimRequest } from "../server/modules/starsim/canonicalize";
import {
  evaluateSolarObservedBaseline,
  evaluateStarSimSupportedDomain,
} from "../server/modules/starsim/domain";
import { STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION } from "../server/modules/starsim/contract";
import { resolveSolarObservedSource } from "../server/modules/starsim/sources/adapters/solar-observed";

const loadSolarCrossLayerCounterexamplePayload = (fileName: string): Record<string, unknown> => {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/starsim/sources/solar-observed", fileName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    payload?: Record<string, unknown>;
  };
  return fixture.payload ?? {};
};

describe("star-sim supported domain", () => {
  it("passes the solar-like main-sequence structure domain for supported observable sets", () => {
    const star = canonicalizeStarSimRequest({
      target: {
        object_id: "alpha-centauri-a",
        name: "Alpha Centauri A",
        spectral_type: "G2",
        luminosity_class: "V",
      },
      spectroscopy: {
        teff_K: 5790,
        logg_cgs: 4.31,
        metallicity_feh: 0.22,
      },
      structure: {
        radius_Rsun: 1.22,
      },
      requested_lanes: ["structure_mesa"],
    });

    const domain = evaluateStarSimSupportedDomain(star, "structure_mesa");
    expect(domain.passed).toBe(true);
    expect(domain.fit_profile_id).toBe("solar_like_observable_fit_v1");
    expect(domain.benchmark_pack_id).toBe("solar_like_structure_fit_pack_v1");
  });

  it("requires seismology for the oscillation domain", () => {
    const star = canonicalizeStarSimRequest({
      target: {
        object_id: "alpha-centauri-a",
        name: "Alpha Centauri A",
        spectral_type: "G2",
        luminosity_class: "V",
      },
      spectroscopy: {
        teff_K: 5790,
        logg_cgs: 4.31,
        metallicity_feh: 0.22,
      },
      structure: {
        radius_Rsun: 1.22,
      },
      requested_lanes: ["oscillation_gyre"],
    });

    const domain = evaluateStarSimSupportedDomain(star, "oscillation_gyre");
    expect(domain.passed).toBe(false);
    expect(domain.reasons).toContain("seismology_required");
  });

  it("evaluates the solar observed baseline separately from the solar-like live domain", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_interior_profile: {
            profile_ref: "artifact:solar/interior",
            summary: {
              convection_zone_base_rsun: 0.713,
              envelope_helium_fraction: 0.248,
            },
          },
          solar_layer_boundaries: {
            convection_zone_base_rsun: 0.713,
          },
          solar_global_modes: {
            mode_table_ref: "artifact:solar/modes",
            detail_ref: "artifact:solar/modes/detail",
            splitting_ref: "artifact:solar/modes/splitting",
            low_degree_mode_count: 48,
          },
          solar_neutrino_constraints: {
            constraints_ref: "artifact:solar/neutrinos",
            pp_flux: 5.98,
            be7_flux: 4.82,
            pep_flux: 1.44,
            b8_flux: 5.16,
            cno_flux: 7.0,
          },
        },
      },
      "solar_interior_closure_v1",
    );

    expect(support.id).toBe("solar_observed_baseline_v1");
    expect(support.passed).toBe(true);
    expect(support.benchmark_pack_id).toBe("solar_interior_closure_v1");
    expect(support.solar_reference_pack_id).toBe("solar_reference_pack");
    expect(support.conceptual_lanes).toContain("helioseismology_solar_observed");
    expect(support.closure_diagnostics?.overall_status).toBe("pass");
    expect(support.closure_diagnostics?.reference_pack_id).toBe("solar_reference_pack");
    expect(support.closure_diagnostics?.checks.convection_zone_depth.status).toBe("pass");
    expect(support.closure_diagnostics?.checks.convection_zone_depth.reference_anchor_id).toBe("solar.interior.convection_zone_depth.v1");
    expect(support.closure_diagnostics?.checks.convection_zone_depth.reference_doc_ids).toEqual(["basu_antia_2004"]);
    expect(support.closure_diagnostics?.checks.envelope_helium_fraction.status).toBe("pass");
    expect(support.closure_diagnostics?.checks.low_degree_mode_support.status).toBe("pass");
    expect(support.closure_diagnostics?.checks.neutrino_constraint_vector.status).toBe("pass");
  });

  it("reports solar baseline readiness gaps without changing stellar live-fit gating", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_cycle_indices: {
            sunspot_number: 85,
          },
        },
      },
      "solar_interior_closure_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_interior_profile_missing",
        "solar_layer_boundaries_missing",
        "solar_global_modes_missing",
        "solar_neutrino_constraints_missing",
      ]),
    );
  });

  it("fails solar interior closure when the neutrino vector is incomplete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_interior_profile: {
            summary: {
              convection_zone_base_rsun: 0.713,
              envelope_helium_fraction: 0.248,
            },
          },
          solar_layer_boundaries: {
            convection_zone_base_rsun: 0.713,
          },
          solar_global_modes: {
            mode_table_ref: "artifact:solar/modes",
            detail_ref: "artifact:solar/modes/detail",
            low_degree_mode_count: 48,
          },
          solar_neutrino_constraints: {
            constraints_ref: "artifact:solar/neutrinos",
            pp_flux: 5.98,
            be7_flux: 4.82,
            pep_flux: 1.44,
            b8_flux: 5.16,
          },
        },
      },
      "solar_interior_closure_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toContain("solar_neutrino_vector_incomplete");
    expect(support.closure_diagnostics?.checks.neutrino_constraint_vector.status).toBe("fail");
    expect(support.closure_diagnostics?.checks.neutrino_constraint_vector.reference_anchor_id).toBe("solar.interior.neutrino_constraint_vector.v1");
  });

  it("warns when low-degree mode coverage is present but below the preferred closure target", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_interior_profile: {
            summary: {
              convection_zone_base_rsun: 0.713,
              envelope_helium_fraction: 0.248,
            },
          },
          solar_layer_boundaries: {
            convection_zone_base_rsun: 0.713,
          },
          solar_global_modes: {
            mode_table_ref: "artifact:solar/modes",
            low_degree_mode_count: 30,
          },
          solar_neutrino_constraints: {
            constraints_ref: "artifact:solar/neutrinos",
            pp_flux: 5.98,
            be7_flux: 4.82,
            pep_flux: 1.44,
            b8_flux: 5.16,
            cno_flux: 7.0,
          },
        },
      },
      "solar_interior_closure_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.closure_diagnostics?.overall_status).toBe("warn");
    expect(support.closure_diagnostics?.checks.low_degree_mode_support.status).toBe("warn");
  });

  it("fails when convection-zone depth falls outside the closure envelope", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_interior_profile: {
            summary: {
              convection_zone_base_rsun: 0.73,
              envelope_helium_fraction: 0.248,
            },
          },
          solar_layer_boundaries: {
            convection_zone_base_rsun: 0.73,
          },
          solar_global_modes: {
            mode_table_ref: "artifact:solar/modes",
            detail_ref: "artifact:solar/modes/detail",
            low_degree_mode_count: 48,
          },
          solar_neutrino_constraints: {
            constraints_ref: "artifact:solar/neutrinos",
            pp_flux: 5.98,
            be7_flux: 4.82,
            pep_flux: 1.44,
            b8_flux: 5.16,
            cno_flux: 7.0,
          },
        },
      },
      "solar_interior_closure_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toContain("solar_convection_zone_depth_invalid");
    expect(support.closure_diagnostics?.checks.convection_zone_depth.status).toBe("fail");
  });

  it("warns when envelope helium is outside the preferred band but still near the solar baseline", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_interior_profile: {
            summary: {
              convection_zone_base_rsun: 0.713,
              envelope_helium_fraction: 0.257,
            },
          },
          solar_layer_boundaries: {
            convection_zone_base_rsun: 0.713,
          },
          solar_global_modes: {
            mode_table_ref: "artifact:solar/modes",
            detail_ref: "artifact:solar/modes/detail",
            low_degree_mode_count: 48,
          },
          solar_neutrino_constraints: {
            constraints_ref: "artifact:solar/neutrinos",
            pp_flux: 5.98,
            be7_flux: 4.82,
            pep_flux: 1.44,
            b8_flux: 5.16,
            cno_flux: 7.0,
          },
        },
      },
      "solar_interior_closure_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.closure_diagnostics?.overall_status).toBe("warn");
    expect(support.closure_diagnostics?.checks.envelope_helium_fraction.status).toBe("warn");
  });

  it("passes the solar structural residual closure baseline when hydrostatic and seismic residual context are complete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_structural_residuals: {
            hydrostatic_residual_ref: "artifact:solar/structural-residuals/hydrostatic-balance",
            sound_speed_residual_ref: "artifact:solar/structural-residuals/sound-speed",
            rotation_residual_ref: "artifact:solar/structural-residuals/rotation",
            pressure_scale_height_ref: "artifact:solar/structural-residuals/pressure-scale-height",
            neutrino_consistency_ref: "artifact:solar/structural-residuals/neutrino-consistency",
            summary: {
              max_sound_speed_fractional_residual: 0.0018,
              mean_hydrostatic_fractional_residual: 0.0006,
              max_rotation_residual_nhz: 8.4,
              pressure_scale_height_consistent: true,
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
      },
      "solar_structural_residual_closure_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.benchmark_pack_id).toBe("solar_structural_residual_closure_v1");
    expect(support.structural_residual_diagnostics?.overall_status).toBe("pass");
    expect(support.structural_residual_diagnostics?.checks.hydrostatic_balance_context.status).toBe("pass");
    expect(support.structural_residual_diagnostics?.checks.hydrostatic_balance_context.reference_anchor_id).toBe(
      "solar.structural_residuals.hydrostatic_balance_context.v1",
    );
    expect(support.structural_residual_diagnostics?.checks.sound_speed_residual_context.status).toBe("pass");
    expect(support.structural_residual_diagnostics?.checks.rotation_residual_context.status).toBe("pass");
  });

  it("fails the solar structural residual closure baseline when hydrostatic residual context is missing", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_structural_residuals: {
            sound_speed_residual_ref: "artifact:solar/structural-residuals/sound-speed",
            rotation_residual_ref: "artifact:solar/structural-residuals/rotation",
            summary: {
              max_sound_speed_fractional_residual: 0.0018,
              mean_hydrostatic_fractional_residual: 0.0006,
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
      },
      "solar_structural_residual_closure_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toContain("solar_hydrostatic_residual_missing");
    expect(support.structural_residual_diagnostics?.checks.hydrostatic_balance_context.status).toBe("missing");
    expect(support.structural_residual_diagnostics?.checks.hydrostatic_balance_context.reference_anchor_id).toBe(
      "solar.structural_residuals.hydrostatic_balance_context.v1",
    );
  });

  it("passes the solar cycle observed baseline when cycle, magnetogram, and active-region context are complete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_cycle_indices: {
            sunspot_number: 82,
            f10_7_sfu: 155,
            cycle_label: "Cycle 25",
            polarity_label: "north_negative_south_positive",
          },
          solar_cycle_history: {
            history_start_iso: "2018-01-01T00:00:00.000Z",
            history_end_iso: "2025-12-31T23:59:59.000Z",
            covered_cycle_labels: ["Cycle 24", "Cycle 25"],
            polarity_reversal_refs: ["artifact:solar/cycle/polarity-reversal"],
            butterfly_history_ref: "artifact:solar/cycle/butterfly-history",
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
          solar_irradiance_series: {
            tsi_ref: "artifact:solar/irradiance/tsi",
          },
        },
      },
      "solar_cycle_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.cycle_diagnostics?.overall_status).toBe("pass");
    expect(support.cycle_diagnostics?.checks.cycle_indices.status).toBe("pass");
    expect(support.cycle_diagnostics?.checks.chronology_window.status).toBe("pass");
    expect(support.cycle_diagnostics?.checks.polarity_reversal_context.status).toBe("pass");
    expect(support.cycle_diagnostics?.checks.butterfly_history.status).toBe("pass");
    expect(support.cycle_diagnostics?.checks.axial_dipole_history.status).toBe("pass");
    expect(support.cycle_diagnostics?.checks.magnetogram_context.status).toBe("pass");
    expect(support.cycle_diagnostics?.checks.active_region_context.status).toBe("pass");
  });

  it("passes the local helioseismology observed baseline when Dopplergram and analysis context are complete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_local_helio: {
            dopplergram_ref: "artifact:solar/local-helio/dopplergram",
            travel_time_ref: "artifact:solar/local-helio/travel-time",
            holography_ref: "artifact:solar/local-helio/holography",
            sunquake_event_refs: ["artifact:solar/local-helio/sunquake-event-1"],
            metadata: {
              instrument: "SDO/HMI+GONG",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: {
                value: 45,
                unit: "s",
              },
              time_range: {
                start_iso: "2025-02-14T00:00:00.000Z",
                end_iso: "2025-02-15T23:59:59.000Z",
              },
              source_product_id: "hmi_gong_local_helio_context_v1",
              source_product_family: "local_helioseismology_products",
              source_doc_ids: ["hmi_products", "gong_products"],
            },
          },
        },
      },
      "solar_local_helio_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.benchmark_pack_id).toBe("solar_local_helio_observed_v1");
    expect(support.local_helio_diagnostics?.overall_status).toBe("pass");
    expect(support.local_helio_diagnostics?.checks.dopplergram_context.status).toBe("pass");
    expect(support.local_helio_diagnostics?.checks.travel_time_or_holography_context.status).toBe("pass");
    expect(support.local_helio_diagnostics?.checks.sunquake_event_context.status).toBe("pass");
  });

  it("fails the local helioseismology observed baseline when Dopplergram or analysis context is incomplete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_local_helio: {
            metadata: {
              instrument: "SDO/HMI+GONG",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
            },
          },
        },
      },
      "solar_local_helio_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_local_helio_dopplergram_missing",
        "solar_local_helio_context_incomplete",
      ]),
    );
    expect(support.local_helio_diagnostics?.checks.dopplergram_context.status).toBe("missing");
    expect(support.local_helio_diagnostics?.checks.travel_time_or_holography_context.status).toBe("fail");
  });

  it("fails the solar cycle observed baseline when polarity or magnetogram linkage is incomplete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_cycle_indices: {
            sunspot_number: 82,
            f10_7_sfu: 155,
            cycle_label: "Cycle 25",
          },
          solar_cycle_history: {
            history_start_iso: "2018-01-01T00:00:00.000Z",
            history_end_iso: "2025-12-31T23:59:59.000Z",
            covered_cycle_labels: ["Cycle 24", "Cycle 25"],
            polarity_reversal_refs: ["artifact:solar/cycle/polarity-reversal"],
            butterfly_history_ref: "artifact:solar/cycle/butterfly-history",
            axial_dipole_history_ref: "artifact:solar/cycle/axial-dipole-history",
            polar_field_history_ref: "artifact:solar/cycle/polar-field-history",
          },
          solar_magnetogram: {
            line_of_sight_ref: "artifact:solar/magnetograms/los",
          },
          solar_active_regions: {
            region_refs: ["artifact:solar/active-regions/noaa-13000"],
            region_count: 1,
          },
        },
      },
      "solar_cycle_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_cycle_indices_incomplete",
        "solar_cycle_magnetogram_incomplete",
      ]),
    );
    expect(support.cycle_diagnostics?.checks.cycle_indices.status).toBe("fail");
    expect(support.cycle_diagnostics?.checks.cycle_indices.reference_anchor_id).toBe("solar.cycle.cycle_indices.v1");
    expect(support.cycle_diagnostics?.checks.magnetogram_context.status).toBe("fail");
    expect(support.cycle_diagnostics?.checks.magnetogram_context.reference_anchor_id).toBe("solar.cycle.magnetogram_context.v1");
  });

  it("fails the solar cycle observed baseline when active-region evidence is empty", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_cycle_indices: {
            sunspot_number: 82,
            f10_7_sfu: 155,
            cycle_label: "Cycle 25",
            polarity_label: "north_negative_south_positive",
          },
          solar_cycle_history: {
            history_start_iso: "2018-01-01T00:00:00.000Z",
            history_end_iso: "2025-12-31T23:59:59.000Z",
            covered_cycle_labels: ["Cycle 24", "Cycle 25"],
            polarity_reversal_refs: ["artifact:solar/cycle/polarity-reversal"],
            butterfly_history_ref: "artifact:solar/cycle/butterfly-history",
            axial_dipole_history_ref: "artifact:solar/cycle/axial-dipole-history",
            polar_field_history_ref: "artifact:solar/cycle/polar-field-history",
          },
          solar_magnetogram: {
            line_of_sight_ref: "artifact:solar/magnetograms/los",
            synoptic_radial_map_ref: "artifact:solar/magnetograms/synoptic",
          },
          solar_active_regions: {
            region_count: 0,
            region_refs: [],
          },
        },
      },
      "solar_cycle_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toContain("solar_active_regions_incomplete");
    expect(support.cycle_diagnostics?.checks.active_region_context.status).toBe("fail");
    expect(support.cycle_diagnostics?.checks.irradiance_continuity.status).toBe("warn");
  });

  it("fails the solar cycle observed baseline when chronology remains a one-year snapshot", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
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
            polarity_reversal_refs: ["artifact:solar/cycle/polarity-reversal"],
            butterfly_history_ref: "artifact:solar/cycle/butterfly-history",
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
      },
      "solar_cycle_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toContain("solar_cycle_chronology_incomplete");
    expect(support.cycle_diagnostics?.checks.chronology_window.status).toBe("fail");
    expect(support.cycle_diagnostics?.checks.chronology_window.reference_anchor_id).toBe("solar.cycle.chronology_window.v1");
  });

  it("passes the solar surface-flow observed baseline when flow refs and region geometry are present", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_surface_flows: {
            differential_rotation_ref: "artifact:solar/surface-flows/differential-rotation",
            meridional_flow_ref: "artifact:solar/surface-flows/meridional-flow",
            supergranular_diffusion_ref: "artifact:solar/surface-flows/supergranular-diffusion",
            summary: {
              equatorial_rotation_deg_per_day: 14.35,
              rotation_shear_deg_per_day: 2.68,
              meridional_flow_peak_ms: 12.4,
            },
            metadata: {
              instrument: "SDO/HMI+GONG",
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
                noaa_region_id: "13000",
                harp_id: "HARP-13000",
                sharp_ref: "artifact:solar/active-regions/sharp-13000",
                heliographic_latitude_deg: 14.2,
                carrington_longitude_deg: 205.4,
                area_msh: 420,
                magnetic_class: "beta-gamma",
                tilt_deg: 11.5,
                leading_polarity: "negative",
              },
            ],
            metadata: {
              instrument: "NOAA+SDO/HMI/HARP",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
            },
          },
        },
      },
      "solar_surface_flow_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.surface_flow_diagnostics?.overall_status).toBe("pass");
    expect(support.surface_flow_diagnostics?.checks.differential_rotation_context.reference_anchor_id).toBe(
      "solar.surface_flow.differential_rotation_context.v1",
    );
    expect(support.surface_flow_diagnostics?.checks.active_region_geometry_context.status).toBe("pass");
  });

  it("fails the solar surface-flow observed baseline when flow context or region geometry is too thin", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_surface_flows: {
            meridional_flow_ref: "artifact:solar/surface-flows/meridional-flow",
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
      },
      "solar_surface_flow_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toContain("solar_surface_flow_rotation_missing");
    expect(support.reasons).toContain("solar_active_region_geometry_incomplete");
    expect(support.surface_flow_diagnostics?.checks.differential_rotation_context.status).not.toBe("pass");
    expect(support.surface_flow_diagnostics?.checks.active_region_geometry_context.status).toBe("fail");
  });

  it("passes the solar coronal-field observed baseline when PFSS, boundary, and topology context are complete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_coronal_field: {
            pfss_solution_ref: "artifact:solar/corona/pfss-solution",
            synoptic_boundary_ref: "artifact:solar/corona/synoptic-boundary",
            coronal_hole_refs: ["artifact:solar/corona/coronal-hole-north"],
            open_field_map_ref: "artifact:solar/corona/open-field-map",
            euv_coronal_context_ref: "artifact:solar/corona/aia-euv",
            summary: {
              source_surface_rsun: 2.5,
              open_flux_weber: 340000000000000,
              dominant_topology: "dipolar_open_flux",
              coronal_hole_count: 1,
            },
            metadata: {
              instrument: "NSO/PFSS+SDO/HMI+SDO/AIA",
              coordinate_frame: "Carrington",
              observed_mode: "modeled",
              cadence: {
                value: 1,
                unit: "carrington_rotation",
              },
              carrington_rotation: 2290,
              source_product_id: "pfss_coronal_field_context_v1",
              source_product_family: "coronal_field_proxy_products",
              source_doc_ids: ["nso_pfss", "hmi_products", "aia_corona"],
            },
          },
          solar_magnetogram: {
            synoptic_radial_map_ref: "artifact:solar/magnetograms/synoptic-radial",
            active_region_patch_refs: ["artifact:solar/active-regions/patch-13000"],
            metadata: {
              instrument: "SDO/HMI",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: {
                value: 1,
                unit: "day",
              },
              carrington_rotation: 2290,
              source_product_id: "hmi_full_disk_magnetogram_v1",
              source_product_family: "magnetogram_products",
              source_doc_ids: ["hmi_products"],
            },
          },
          solar_active_regions: {
            region_refs: ["artifact:solar/active-regions/noaa-13000"],
            region_count: 1,
          },
          solar_event_linkage: {
            link_refs: ["artifact:solar/event-linkage/link-13000"],
            summary: {
              flare_link_count: 1,
              cme_link_count: 0,
              sunquake_link_count: 0,
            },
          },
        },
      },
      "solar_coronal_field_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.coronal_field_diagnostics?.overall_status).toBe("pass");
    expect(support.coronal_field_diagnostics?.checks.pfss_context.status).toBe("pass");
    expect(support.coronal_field_diagnostics?.checks.pfss_context.reference_anchor_id).toBe(
      "solar.coronal_field.pfss_context.v1",
    );
    expect(support.coronal_field_diagnostics?.checks.open_field_topology_context.status).toBe("pass");
  });

  it("fails the solar coronal-field observed baseline when PFSS or boundary context is missing", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
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
      },
      "solar_coronal_field_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_coronal_field_pfss_missing",
        "solar_coronal_field_boundary_missing",
        "solar_coronal_field_topology_incomplete",
        "solar_coronal_field_source_region_incomplete",
      ]),
    );
    expect(support.coronal_field_diagnostics?.checks.pfss_context.status).toBe("fail");
    expect(support.coronal_field_diagnostics?.checks.synoptic_boundary_context.status).toBe("fail");
    expect(support.coronal_field_diagnostics?.checks.open_field_topology_context.status).toBe("fail");
  });

  it("passes the solar magnetic-memory observed baseline when dipole, polar-field, reversal, and bipolar-region context are complete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_magnetic_memory: {
            axial_dipole_history_ref: "artifact:solar/magnetic-memory/axial-dipole-history",
            polar_field_history_ref: "artifact:solar/magnetic-memory/polar-field-history",
            polarity_reversal_refs: ["artifact:solar/magnetic-memory/reversal-marker"],
            bipolar_region_proxy_ref: "artifact:solar/magnetic-memory/bipolar-region-proxy",
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
              cadence: { value: 1, unit: "day" },
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
              cadence: { value: 1, unit: "day" },
            },
          },
        },
      },
      "solar_magnetic_memory_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.magnetic_memory_diagnostics?.overall_status).toBe("pass");
    expect(support.magnetic_memory_diagnostics?.checks.axial_dipole_continuity_context.status).toBe("pass");
    expect(support.magnetic_memory_diagnostics?.checks.polar_field_continuity_context.status).toBe("pass");
    expect(support.magnetic_memory_diagnostics?.checks.reversal_linkage_context.status).toBe("pass");
    expect(support.magnetic_memory_diagnostics?.checks.active_region_polarity_ordering_context.status).toBe("pass");
    expect(support.magnetic_memory_diagnostics?.checks.hemisphere_bipolar_coverage_context.status).toBe("pass");
  });

  it("passes the solar spot-region observed baseline when spot catalog and bipolar linkage are complete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_sunspot_catalog: {
            spot_refs: [
              "artifact:solar/sunspots/spot-13000-a",
              "artifact:solar/sunspots/spot-13000-b",
              "artifact:solar/sunspots/spot-13001-a",
              "artifact:solar/sunspots/spot-13001-b",
            ],
            spot_count: 4,
            bipolar_group_refs: [
              "artifact:solar/bipolar-groups/group-13000",
              "artifact:solar/bipolar-groups/group-13001",
            ],
            spots: [
              {
                spot_id: "artifact:solar/sunspots/spot-13000-a",
                linked_region_id: "artifact:solar/active-regions/noaa-13000",
                linked_noaa_region_id: "13000",
                linked_harp_id: "HARP-13000",
                hemisphere: "north",
                heliographic_latitude_deg: 14.1,
                carrington_longitude_deg: 205.1,
                area_msh: 180,
                polarity: "negative",
                bipolar_group_id: "artifact:solar/bipolar-groups/group-13000",
              },
              {
                spot_id: "artifact:solar/sunspots/spot-13000-b",
                linked_region_id: "artifact:solar/active-regions/noaa-13000",
                linked_noaa_region_id: "13000",
                linked_harp_id: "HARP-13000",
                hemisphere: "north",
                heliographic_latitude_deg: 14.4,
                carrington_longitude_deg: 206,
                area_msh: 150,
                polarity: "positive",
                bipolar_group_id: "artifact:solar/bipolar-groups/group-13000",
              },
              {
                spot_id: "artifact:solar/sunspots/spot-13001-a",
                linked_region_id: "artifact:solar/active-regions/noaa-13001",
                linked_noaa_region_id: "13001",
                linked_harp_id: "HARP-13001",
                hemisphere: "south",
                heliographic_latitude_deg: -9.8,
                carrington_longitude_deg: 218.4,
                area_msh: 135,
                polarity: "positive",
                bipolar_group_id: "artifact:solar/bipolar-groups/group-13001",
              },
              {
                spot_id: "artifact:solar/sunspots/spot-13001-b",
                linked_region_id: "artifact:solar/active-regions/noaa-13001",
                linked_noaa_region_id: "13001",
                linked_harp_id: "HARP-13001",
                hemisphere: "south",
                heliographic_latitude_deg: -10.1,
                carrington_longitude_deg: 219.2,
                area_msh: 120,
                polarity: "negative",
                bipolar_group_id: "artifact:solar/bipolar-groups/group-13001",
              },
            ],
            metadata: {
              instrument: "NOAA+SDO/HMI/HARP",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: { value: 1, unit: "day" },
              source_product_id: "hmi_noaa_sunspot_catalog_v1",
              source_product_family: "sunspot_catalog_products",
              source_doc_ids: ["hmi_products", "sft_review_2023"],
            },
          },
          solar_active_regions: {
            region_refs: ["artifact:solar/active-regions/noaa-13000", "artifact:solar/active-regions/noaa-13001"],
            region_count: 2,
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
                joy_law_tilt_class: "aligned",
                linked_spot_ids: ["artifact:solar/sunspots/spot-13000-a", "artifact:solar/sunspots/spot-13000-b"],
                bipolar_group_id: "artifact:solar/bipolar-groups/group-13000",
                polarity_ordering_class: "hale-consistent",
              },
              {
                region_id: "artifact:solar/active-regions/noaa-13001",
                noaa_region_id: "13001",
                harp_id: "HARP-13001",
                heliographic_latitude_deg: -10.4,
                carrington_longitude_deg: 218.9,
                area_msh: 365,
                magnetic_class: "beta",
                tilt_deg: -8.2,
                leading_polarity: "positive",
                hemisphere: "south",
                following_polarity: "negative",
                bipole_separation_deg: 5.9,
                joy_law_tilt_class: "aligned",
                linked_spot_ids: ["artifact:solar/sunspots/spot-13001-a", "artifact:solar/sunspots/spot-13001-b"],
                bipolar_group_id: "artifact:solar/bipolar-groups/group-13001",
                polarity_ordering_class: "hale-consistent",
              },
            ],
            metadata: {
              instrument: "NOAA+SDO/HMI/HARP",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: { value: 1, unit: "day" },
              source_product_id: "hmi_noaa_bipolar_active_region_context_v1",
              source_product_family: "bipolar_active_region_products",
              source_doc_ids: ["hmi_products", "sft_review_2023"],
            },
          },
        },
      },
      "solar_spot_region_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.benchmark_pack_id).toBe("solar_spot_region_observed_v1");
    expect(support.spot_region_diagnostics?.overall_status).toBe("pass");
    expect(support.spot_region_diagnostics?.checks.sunspot_catalog_context.status).toBe("pass");
    expect(support.spot_region_diagnostics?.checks.spot_region_linkage_context.status).toBe("pass");
    expect(support.spot_region_diagnostics?.checks.polarity_tilt_context.status).toBe("pass");
  });

  it("fails the solar spot-region observed baseline when spot geometry or linkage is incomplete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
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
      },
      "solar_spot_region_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_spot_geometry_incomplete",
        "solar_spot_region_linkage_incomplete",
        "solar_bipolar_grouping_incomplete",
        "solar_spot_polarity_tilt_incomplete",
      ]),
    );
    expect(support.spot_region_diagnostics?.checks.spot_geometry_context.status).toBe("fail");
    expect(support.spot_region_diagnostics?.checks.spot_region_linkage_context.status).toBe("fail");
  });

  it("fails the solar magnetic-memory observed baseline when axial-dipole and hemisphere coverage are too thin", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_magnetic_memory: {
            polar_field_history_ref: "artifact:solar/magnetic-memory/polar-field-history",
            polarity_reversal_refs: ["artifact:solar/magnetic-memory/reversal-marker"],
            summary: {
              cycle_labels_covered: ["Cycle 25"],
              north_polarity_state: "negative",
              south_polarity_state: "positive",
              reversal_marker_count: 1,
            },
            metadata: {
              instrument: "NOAA/SWPC+SDO/HMI",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: { value: 1, unit: "day" },
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
              cadence: { value: 1, unit: "day" },
            },
          },
        },
      },
      "solar_magnetic_memory_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toContain("solar_magnetic_memory_axial_dipole_missing");
    expect(support.reasons).toContain("solar_active_region_hemisphere_incomplete");
    expect(support.magnetic_memory_diagnostics?.checks.axial_dipole_continuity_context.status).toBe("missing");
    expect(support.magnetic_memory_diagnostics?.checks.hemisphere_bipolar_coverage_context.status).toBe("fail");
  });

  it("passes the solar event-association observed baseline when flare, CME, and region identifiers link coherently", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_event_linkage: {
            link_refs: ["artifact:solar/event-linkage/summary"],
            links: [
              {
                linked_region_id: "artifact:solar/active-regions/noaa-13000",
                linked_noaa_region_id: "13000",
                linked_harp_id: "HARP-13000",
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
              {
                linked_region_id: "artifact:solar/active-regions/noaa-13000",
                linked_noaa_region_id: "13000",
                linked_harp_id: "HARP-13000",
                linked_flare_event_ref: "artifact:solar/flares/goes-event-1",
                event_type: "sunquake",
                event_ref: "artifact:solar/local-helio/sunquake-event-1",
                linkage_basis: "manual_catalog_association",
                event_time_iso: "2025-02-14T11:35:00.000Z",
                time_offset_minutes: 12,
              },
            ],
            summary: {
              flare_link_count: 1,
              cme_link_count: 1,
              sunquake_link_count: 1,
            },
            metadata: {
              instrument: "GOES/SWPC+SOHO/LASCO+SDO/HMI+GONG",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: { value: 1, unit: "min" },
              source_product_id: "solar_cross_phase_event_linkage_context_v1",
              source_product_family: "cross_phase_event_linkage",
              source_doc_ids: ["goes_xray", "lasco_docs", "hmi_products", "gong_products"],
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
          solar_local_helio: {
            dopplergram_ref: "artifact:solar/local-helio/dopplergram",
            travel_time_ref: "artifact:solar/local-helio/travel-time",
            sunquake_event_refs: ["artifact:solar/local-helio/sunquake-event-1"],
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
      },
      "solar_event_association_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.event_linkage_diagnostics?.overall_status).toBe("pass");
    expect(support.event_linkage_diagnostics?.checks.flare_region_linkage_context.status).toBe("pass");
    expect(support.event_linkage_diagnostics?.checks.cme_region_linkage_context.status).toBe("pass");
    expect(support.event_linkage_diagnostics?.checks.region_identifier_consistency_context.status).toBe("pass");
  });

  it("fails the solar event-association observed baseline when flare linkage or region identifiers are inconsistent", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_event_linkage: {
            links: [
              {
                linked_region_id: "artifact:solar/active-regions/noaa-99999",
                linked_noaa_region_id: "99999",
                linked_harp_id: "HARP-99999",
                event_type: "cme",
                event_ref: "artifact:solar/cmes/lasco-event-1",
                linkage_basis: "catalog",
                event_time_iso: "2025-02-14T12:02:00.000Z",
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
      },
      "solar_event_association_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_event_linkage_flare_missing",
        "solar_event_linkage_region_identifier_inconsistent",
      ]),
    );
    expect(support.event_linkage_diagnostics?.checks.flare_region_linkage_context.status).toBe("fail");
    expect(support.event_linkage_diagnostics?.checks.region_identifier_consistency_context.status).toBe("fail");
  });

  it("passes the solar topology-linkage observed baseline when surface, coronal, magnetic-memory, and eruptive linkage agree", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_sunspot_catalog: {
            spot_refs: ["artifact:solar/sunspots/spot-13000-a", "artifact:solar/sunspots/spot-13000-b"],
            spot_count: 2,
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
              {
                spot_id: "artifact:solar/sunspots/spot-13000-b",
                linked_region_id: "artifact:solar/active-regions/noaa-13000",
                linked_noaa_region_id: "13000",
                linked_harp_id: "HARP-13000",
                hemisphere: "north",
                heliographic_latitude_deg: 14.4,
                carrington_longitude_deg: 206.0,
                area_msh: 150,
                polarity: "positive",
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
                linked_spot_ids: ["artifact:solar/sunspots/spot-13000-a", "artifact:solar/sunspots/spot-13000-b"],
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
              open_flux_weber: 340000000000000,
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
          solar_topology_linkage: {
            link_refs: ["artifact:solar/topology-linkage/link-13000"],
            link_count: 1,
            links: [
              {
                link_id: "artifact:solar/topology-linkage/link-13000",
                linked_spot_ids: ["artifact:solar/sunspots/spot-13000-a", "artifact:solar/sunspots/spot-13000-b"],
                linked_region_id: "artifact:solar/active-regions/noaa-13000",
                linked_noaa_region_id: "13000",
                linked_harp_id: "HARP-13000",
                linked_pfss_solution_ref: "artifact:solar/coronal/pfss-solution-2290",
                linked_open_field_map_ref: "artifact:solar/coronal/open-field-map-2290",
                linked_coronal_hole_refs: ["artifact:solar/coronal/coronal-hole-north"],
                linked_flare_refs: ["artifact:solar/flares/goes-event-1"],
                linked_cme_refs: ["artifact:solar/cmes/lasco-event-1"],
                linked_polar_field_ref: "artifact:solar/magnetic-memory/polar-field-history",
                linked_axial_dipole_ref: "artifact:solar/magnetic-memory/axial-dipole-history",
                topology_role: "active_region_open_flux_source",
                linkage_basis: "manual_catalog_association",
                time_window_start: "2025-02-14T10:30:00.000Z",
                time_window_end: "2025-02-14T12:30:00.000Z",
              },
            ],
            summary: {
              topology_role_count: 1,
              open_flux_link_count: 1,
              event_link_count: 1,
            },
          },
        },
      },
      "solar_topology_linkage_observed_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.benchmark_pack_id).toBe("solar_topology_linkage_observed_v1");
    expect(support.topology_linkage_diagnostics?.overall_status).toBe("pass");
    expect(support.topology_linkage_diagnostics?.checks.spot_region_corona_context.status).toBe("pass");
    expect(support.topology_linkage_diagnostics?.checks.spot_region_corona_context.reference_anchor_id).toBe(
      "solar.topology_linkage.spot_region_corona_context.v1",
    );
    expect(support.topology_linkage_diagnostics?.checks.open_flux_polar_field_continuity_context.status).toBe("pass");
    expect(support.topology_linkage_diagnostics?.checks.event_topology_context.status).toBe("pass");
    expect(support.topology_linkage_diagnostics?.checks.identifier_consistency_context.status).toBe("pass");
  });

  it("fails the solar topology-linkage observed baseline when spot-region-corona linkage or continuity context is too thin", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
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
          solar_topology_linkage: {
            link_refs: ["artifact:solar/topology-linkage/link-bad"],
            link_count: 1,
            links: [
              {
                link_id: "artifact:solar/topology-linkage/link-bad",
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
          },
        },
      },
      "solar_topology_linkage_observed_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_topology_linkage_surface_corona_missing",
        "solar_topology_linkage_open_flux_missing",
        "solar_topology_linkage_identifier_inconsistent",
      ]),
    );
    expect(support.topology_linkage_diagnostics?.checks.spot_region_corona_context.status).toBe("fail");
    expect(support.topology_linkage_diagnostics?.checks.open_flux_polar_field_continuity_context.status).toBe("fail");
    expect(support.topology_linkage_diagnostics?.checks.identifier_consistency_context.status).toBe("fail");
  });

  it("passes the solar cross-layer consistency baseline when structural, cycle-memory, coronal, and event chains agree", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: result.baseline_patch ?? undefined,
      },
      "solar_cross_layer_consistency_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.benchmark_pack_id).toBe("solar_cross_layer_consistency_v1");
    expect(support.cross_layer_consistency_diagnostics?.overall_status).toBe("pass");
    expect(support.cross_layer_consistency_diagnostics?.checks.interior_residual_coherence.status).toBe("pass");
    expect(support.cross_layer_consistency_diagnostics?.checks.interior_residual_coherence.reference_anchor_id).toBe(
      "solar.cross_layer_consistency.interior_residual_coherence.v1",
    );
    expect(support.cross_layer_consistency_diagnostics?.checks.cycle_memory_topology_coherence.status).toBe("pass");
    expect(support.cross_layer_consistency_diagnostics?.checks.event_topology_identifier_coherence.status).toBe("pass");
    expect(support.cross_layer_consistency_diagnostics?.cross_layer_mismatch_summary).toEqual({
      failing_check_ids: [],
      warning_check_ids: [],
      conflicting_section_ids: [],
      conflict_token_count: 0,
      mismatch_fingerprint: "cross-layer:none",
    });
  });

  it("fails the solar cross-layer consistency baseline when structural, topology, or identifier chains diverge", async () => {
    const result = await resolveSolarObservedSource({
      target: {
        object_id: "sun",
        name: "Sun",
      },
    });

    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          ...(result.baseline_patch ?? {}),
          ...loadSolarCrossLayerCounterexamplePayload("solar-cross-layer-counterexample.structural-mismatch.json"),
          ...loadSolarCrossLayerCounterexamplePayload("solar-cross-layer-counterexample.memory-topology-mismatch.json"),
          ...loadSolarCrossLayerCounterexamplePayload("solar-cross-layer-counterexample.event-topology-mismatch.json"),
        },
      },
      "solar_cross_layer_consistency_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_cross_layer_structural_context_incomplete",
        "solar_cross_layer_mode_residual_incomplete",
        "solar_cross_layer_memory_topology_inconsistent",
        "solar_cross_layer_event_topology_inconsistent",
      ]),
    );
    expect(support.cross_layer_consistency_diagnostics?.checks.interior_residual_coherence.status).toBe("fail");
    expect(support.cross_layer_consistency_diagnostics?.checks.interior_residual_coherence.missing_required_refs).toEqual(
      expect.arrayContaining([
        "solar_structural_residuals.hydrostatic_residual_ref",
        "solar_structural_residuals.sound_speed_residual_ref",
      ]),
    );
    expect(support.cross_layer_consistency_diagnostics?.checks.cycle_memory_topology_coherence.status).toBe("fail");
    expect(support.cross_layer_consistency_diagnostics?.checks.cycle_memory_topology_coherence.conflicting_ref_pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "topology_memory_axial_dipole" }),
      ]),
    );
    expect(support.cross_layer_consistency_diagnostics?.checks.event_topology_identifier_coherence.status).toBe("fail");
    expect(support.cross_layer_consistency_diagnostics?.checks.event_topology_identifier_coherence.conflicting_noaa_ids).toContain("99999");
    expect(support.cross_layer_consistency_diagnostics?.cross_layer_mismatch_summary.conflict_token_count).toBeGreaterThan(0);
  });

  it("passes the solar eruptive observed baseline when flare, CME, and irradiance context are complete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_active_regions: {
            region_refs: ["artifact:solar/active-regions/noaa-13000"],
            region_count: 1,
          },
          solar_magnetogram: {
            active_region_patch_refs: ["artifact:solar/magnetograms/patch-1"],
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
          solar_irradiance_series: {
            euv_ref: "artifact:solar/irradiance/euv",
            xray_ref: "artifact:solar/irradiance/xray",
          },
        },
      },
      "solar_eruptive_catalog_v1",
    );

    expect(support.passed).toBe(true);
    expect(support.eruptive_diagnostics?.overall_status).toBe("pass");
    expect(support.eruptive_diagnostics?.checks.flare_catalog.status).toBe("pass");
    expect(support.eruptive_diagnostics?.checks.cme_catalog.status).toBe("pass");
    expect(support.eruptive_diagnostics?.checks.irradiance_continuity.status).toBe("pass");
    expect(support.eruptive_diagnostics?.checks.source_region_linkage.status).toBe("pass");
  });

  it("fails the solar eruptive observed baseline when flare or CME coverage is incomplete", () => {
    const support = evaluateSolarObservedBaseline(
      {
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_flare_catalog: {
            event_refs: ["artifact:solar/flares/goes-event-1"],
            flare_count: 1,
          },
          solar_cme_catalog: {
            cme_count: 0,
            event_refs: [],
          },
          solar_irradiance_series: {
            tsi_ref: "artifact:solar/irradiance/tsi",
          },
        },
      },
      "solar_eruptive_catalog_v1",
    );

    expect(support.passed).toBe(false);
    expect(support.reasons).toEqual(
      expect.arrayContaining([
        "solar_flare_catalog_incomplete",
        "solar_cme_catalog_incomplete",
      ]),
    );
    expect(support.eruptive_diagnostics?.checks.flare_catalog.status).toBe("fail");
    expect(support.eruptive_diagnostics?.checks.flare_catalog.reference_anchor_id).toBe("solar.eruptive.flare_catalog.v1");
    expect(support.eruptive_diagnostics?.checks.cme_catalog.status).toBe("fail");
    expect(support.eruptive_diagnostics?.checks.cme_catalog.reference_anchor_id).toBe("solar.eruptive.cme_catalog.v1");
    expect(support.eruptive_diagnostics?.checks.irradiance_continuity.status).toBe("warn");
    expect(support.eruptive_diagnostics?.checks.source_region_linkage.status).toBe("warn");
  });
});
