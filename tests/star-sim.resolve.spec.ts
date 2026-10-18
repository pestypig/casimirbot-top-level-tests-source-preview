import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
  STAR_SIM_SOURCE_SELECTION_SCHEMA_VERSION,
} from "../server/modules/starsim/contract";

type StarSimRouteModule = typeof import("../server/routes/star-sim");

let artifactRoot = "";

const buildApp = async () => {
  vi.resetModules();
  const routeModule: StarSimRouteModule = await import("../server/routes/star-sim");
  const app = express();
  app.use(express.json());
  app.use("/api/star-sim", routeModule.starSimRouter);
  return app;
};

const SOLAR_OBSERVED_FIXTURE_FILES = [
  "solar-interior-closure.json",
  "solar-structural-residual-observed.json",
  "solar-cycle-observed.json",
  "solar-cycle-history-observed.json",
  "solar-local-helio-observed.json",
  "solar-surface-flow-observed.json",
  "solar-magnetic-memory-observed.json",
  "solar-sunspot-region-observed.json",
  "solar-event-linkage-observed.json",
  "solar-eruptive-observed.json",
  "solar-coronal-field-observed.json",
  "solar-topology-linkage-observed.json",
] as const;

const applySectionMetadataOverrides = (
  payload: Record<string, unknown>,
  sectionMetadataOverrides?: Record<string, unknown>,
): Record<string, unknown> => {
  if (!sectionMetadataOverrides) {
    return payload;
  }

  return Object.entries(sectionMetadataOverrides).reduce<Record<string, unknown>>((nextPayload, [sectionId, metadata]) => {
    const sectionValue = nextPayload[sectionId];
    if (!sectionValue || typeof sectionValue !== "object") {
      return nextPayload;
    }
    return {
      ...nextPayload,
      [sectionId]: {
        ...sectionValue,
        metadata: {
          ...((sectionValue as { metadata?: Record<string, unknown> }).metadata ?? {}),
          ...(typeof metadata === "object" && metadata ? (metadata as Record<string, unknown>) : {}),
        },
      },
    };
  }, payload);
};

const loadSolarObservedFixtureBaseline = (): Record<string, unknown> => {
  const fixtureDir = path.join(process.cwd(), "tests/fixtures/starsim/sources/solar-observed");
  return SOLAR_OBSERVED_FIXTURE_FILES.reduce<Record<string, unknown>>(
    (baseline, fileName) => {
      const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, fileName), "utf8")) as {
        payload?: Record<string, unknown>;
        section_metadata_overrides?: Record<string, unknown>;
      };
      const payload = applySectionMetadataOverrides(fixture.payload ?? {}, fixture.section_metadata_overrides);
      return {
        ...baseline,
        ...payload,
      };
    },
    {
      schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
    },
  );
};

const loadSolarCrossLayerCounterexamplePayload = (fileName: string): Record<string, unknown> => {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/starsim/sources/solar-observed", fileName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    payload?: Record<string, unknown>;
  };
  return fixture.payload ?? {};
};

beforeEach(() => {
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-resolve-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_SOURCE_FETCH_MODE = "fixture";
  process.env.STAR_SIM_MESA_RUNTIME = "mock";
});

afterEach(() => {
  delete process.env.STAR_SIM_ARTIFACT_ROOT;
  delete process.env.STAR_SIM_SOURCE_FETCH_MODE;
  delete process.env.STAR_SIM_GAIA_DR3_MODE;
  delete process.env.STAR_SIM_SDSS_ASTRA_MODE;
  delete process.env.STAR_SIM_LAMOST_DR10_MODE;
  delete process.env.STAR_SIM_GAIA_DR3_ENDPOINT;
  delete process.env.STAR_SIM_SDSS_ASTRA_ENDPOINT;
  delete process.env.STAR_SIM_LAMOST_DR10_ENDPOINT;
  delete process.env.STAR_SIM_TESS_MAST_MODE;
  delete process.env.STAR_SIM_TASOC_MODE;
  delete process.env.STAR_SIM_TESS_MAST_ENDPOINT;
  delete process.env.STAR_SIM_TASOC_ENDPOINT;
  delete process.env.STAR_SIM_SOURCE_TIMEOUT_MS;
  delete process.env.STAR_SIM_SOURCE_USER_AGENT;
  delete process.env.STAR_SIM_MESA_RUNTIME;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim source resolution route", () => {
  it("accepts additive solar baseline scaffolding without altering the solar-like live resolve path", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_cycle_indices: {
            sunspot_number: 84,
            metadata: {
              instrument: "NOAA/SWPC",
              observed_mode: "observed",
            },
          },
        },
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("resolved");
    expect(res.body.benchmark_target_id).toBe("demo_solar_a");
    expect(res.body.canonical_request_draft.solar_baseline.solar_cycle_indices.sunspot_number).toBe(84);
    expect(res.body.solar_reference_pack_id).toBeUndefined();
    expect(res.body.solar_reference_pack_ref).toBeUndefined();
    expect(res.body.solar_product_registry_id).toBeUndefined();
    expect(res.body.solar_product_registry_ref).toBeUndefined();
    expect(res.body.solar_provenance_diagnostics).toBeUndefined();
  });

  it("populates a Sun-only Phase 0 solar interior baseline and reports closure readiness", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("resolved");
    expect(res.body.benchmark_target_id).toBe("sun_observed_baseline");
    expect(res.body.benchmark_target_match_mode).toBe("matched_by_name");
    expect(res.body.canonical_request_draft.solar_baseline.solar_interior_profile.profile_ref).toBe("fixture:solar/interior/profile");
    expect(res.body.canonical_request_draft.solar_baseline.solar_layer_boundaries.convection_zone_base_rsun).toBe(0.713);
    expect(res.body.canonical_request_draft.solar_baseline.solar_global_modes.low_degree_mode_count).toBe(48);
    expect(res.body.canonical_request_draft.solar_baseline.solar_local_helio.dopplergram_ref).toBe("fixture:solar/local-helio/dopplergram-cube");
    expect(res.body.canonical_request_draft.solar_baseline.solar_local_helio.holography_ref).toBe("fixture:solar/local-helio/holography-egression");
    expect(res.body.canonical_request_draft.solar_baseline.solar_neutrino_constraints.cno_flux).toBe(7.0);
    expect(res.body.canonical_request_draft.solar_baseline.solar_structural_residuals.hydrostatic_residual_ref).toBe(
      "fixture:solar/structural-residuals/hydrostatic-balance",
    );
    expect(
      res.body.canonical_request_draft.solar_baseline.solar_structural_residuals.summary.max_sound_speed_fractional_residual,
    ).toBe(0.0018);
    expect(res.body.canonical_request_draft.solar_baseline.solar_cycle_indices.sunspot_number).toBe(82);
    expect(res.body.canonical_request_draft.solar_baseline.solar_cycle_history.history_start_iso).toBe("2018-01-01T00:00:00.000Z");
    expect(res.body.canonical_request_draft.solar_baseline.solar_cycle_history.covered_cycle_labels).toEqual(["Cycle 24", "Cycle 25"]);
    expect(res.body.canonical_request_draft.solar_baseline.solar_magnetogram.synoptic_radial_map_ref).toBe("fixture:solar/magnetograms/synoptic-radial");
    expect(res.body.canonical_request_draft.solar_baseline.solar_surface_flows.differential_rotation_ref).toBe(
      "fixture:solar/surface-flows/differential-rotation-profile",
    );
    expect(res.body.canonical_request_draft.solar_baseline.solar_coronal_field.pfss_solution_ref).toBe(
      "fixture:solar/coronal/pfss-solution-2290",
    );
    expect(res.body.canonical_request_draft.solar_baseline.solar_coronal_field.summary.dominant_topology).toBe(
      "dipolar_open_flux",
    );
    expect(res.body.canonical_request_draft.solar_baseline.solar_magnetic_memory.axial_dipole_history_ref).toBe(
      "fixture:solar/magnetic-memory/axial-dipole-history",
    );
    expect(res.body.canonical_request_draft.solar_baseline.solar_sunspot_catalog.spot_count).toBe(4);
    expect(res.body.canonical_request_draft.solar_baseline.solar_sunspot_catalog.spots[0].spot_id).toBe(
      "fixture:solar/sunspots/spot-13000-a",
    );
    expect(res.body.canonical_request_draft.solar_baseline.solar_sunspot_catalog.spots[0].polarity).toBe("negative");
    expect(res.body.canonical_request_draft.solar_baseline.solar_event_linkage.summary.flare_link_count).toBe(1);
    expect(res.body.canonical_request_draft.solar_baseline.solar_event_linkage.links[0].event_type).toBe("flare");
    expect(res.body.canonical_request_draft.solar_baseline.solar_topology_linkage.link_count).toBe(2);
    expect(res.body.canonical_request_draft.solar_baseline.solar_topology_linkage.links[0].topology_role).toBe(
      "active_region_open_flux_source",
    );
    expect(res.body.canonical_request_draft.solar_baseline.solar_active_regions.region_count).toBe(2);
    expect(res.body.canonical_request_draft.solar_baseline.solar_active_regions.regions[0].leading_polarity).toBe("negative");
    expect(res.body.canonical_request_draft.solar_baseline.solar_active_regions.regions[0].following_polarity).toBe("positive");
    expect(res.body.canonical_request_draft.solar_baseline.solar_active_regions.regions[1].hemisphere).toBe("south");
    expect(res.body.canonical_request_draft.solar_baseline.solar_flare_catalog.strongest_goes_class).toBe("M3.4");
    expect(res.body.canonical_request_draft.solar_baseline.solar_cme_catalog.cme_count).toBe(1);
    expect(res.body.canonical_request_draft.solar_baseline.solar_irradiance_series.euv_ref).toBe("fixture:solar/irradiance/eve-euv");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.benchmark_pack_id).toBe("solar_interior_closure_v1");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.solar_reference_pack_id).toBe("solar_reference_pack");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.overall_status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.convection_zone_depth.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.convection_zone_depth.reference_anchor_id).toBe("solar.interior.convection_zone_depth.v1");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.convection_zone_depth.reference_doc_ids).toEqual(["basu_antia_2004"]);
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.envelope_helium_fraction.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.low_degree_mode_support.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.neutrino_constraint_vector.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_structural_residual_closure_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_structural_residual_closure_v1.structural_residual_diagnostics.overall_status).toBe(
      "pass",
    );
    expect(
      res.body.solar_baseline_support.solar_structural_residual_closure_v1.structural_residual_diagnostics.checks.hydrostatic_balance_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_structural_residual_closure_v1.structural_residual_diagnostics.checks.hydrostatic_balance_context.reference_anchor_id,
    ).toBe("solar.structural_residuals.hydrostatic_balance_context.v1");
    expect(
      res.body.solar_baseline_support.solar_structural_residual_closure_v1.structural_residual_diagnostics.checks.sound_speed_residual_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_structural_residual_closure_v1.structural_residual_diagnostics.checks.rotation_residual_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.overall_status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.cycle_indices.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.cycle_indices.reference_anchor_id).toBe("solar.cycle.cycle_indices.v1");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.chronology_window.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.chronology_window.reference_anchor_id).toBe("solar.cycle.chronology_window.v1");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.polarity_reversal_context.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.butterfly_history.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.axial_dipole_history.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.magnetogram_context.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.active_region_context.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_local_helio_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_local_helio_observed_v1.local_helio_diagnostics.overall_status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_local_helio_observed_v1.local_helio_diagnostics.checks.dopplergram_context.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_local_helio_observed_v1.local_helio_diagnostics.checks.dopplergram_context.reference_anchor_id).toBe(
      "solar.local_helio.dopplergram_context.v1",
    );
    expect(res.body.solar_baseline_support.solar_local_helio_observed_v1.local_helio_diagnostics.checks.travel_time_or_holography_context.status).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_local_helio_observed_v1.local_helio_diagnostics.checks.sunquake_event_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_surface_flow_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_surface_flow_observed_v1.surface_flow_diagnostics.overall_status).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_surface_flow_observed_v1.surface_flow_diagnostics.checks.differential_rotation_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_surface_flow_observed_v1.surface_flow_diagnostics.checks.differential_rotation_context.reference_anchor_id,
    ).toBe("solar.surface_flow.differential_rotation_context.v1");
    expect(
      res.body.solar_baseline_support.solar_surface_flow_observed_v1.surface_flow_diagnostics.checks.active_region_geometry_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_coronal_field_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_coronal_field_observed_v1.coronal_field_diagnostics.overall_status).toBe(
      "pass",
    );
    expect(
      res.body.solar_baseline_support.solar_coronal_field_observed_v1.coronal_field_diagnostics.checks.pfss_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_coronal_field_observed_v1.coronal_field_diagnostics.checks.pfss_context.reference_anchor_id,
    ).toBe("solar.coronal_field.pfss_context.v1");
    expect(
      res.body.solar_baseline_support.solar_coronal_field_observed_v1.coronal_field_diagnostics.checks.open_field_topology_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_magnetic_memory_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_magnetic_memory_observed_v1.magnetic_memory_diagnostics.overall_status).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_magnetic_memory_observed_v1.magnetic_memory_diagnostics.checks.axial_dipole_continuity_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_magnetic_memory_observed_v1.magnetic_memory_diagnostics.checks.axial_dipole_continuity_context.reference_anchor_id,
    ).toBe("solar.magnetic_memory.axial_dipole_continuity_context.v1");
    expect(
      res.body.solar_baseline_support.solar_magnetic_memory_observed_v1.magnetic_memory_diagnostics.checks.hemisphere_bipolar_coverage_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_spot_region_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_spot_region_observed_v1.spot_region_diagnostics.overall_status).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_spot_region_observed_v1.spot_region_diagnostics.checks.sunspot_catalog_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_spot_region_observed_v1.spot_region_diagnostics.checks.sunspot_catalog_context.reference_anchor_id,
    ).toBe("solar.spot_region.sunspot_catalog_context.v1");
    expect(
      res.body.solar_baseline_support.solar_spot_region_observed_v1.spot_region_diagnostics.checks.spot_region_linkage_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_spot_region_observed_v1.spot_region_diagnostics.checks.polarity_tilt_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_event_association_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_event_association_observed_v1.event_linkage_diagnostics.overall_status).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_event_association_observed_v1.event_linkage_diagnostics.checks.flare_region_linkage_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_event_association_observed_v1.event_linkage_diagnostics.checks.flare_region_linkage_context.reference_anchor_id,
    ).toBe("solar.event_linkage.flare_region_linkage_context.v1");
    expect(
      res.body.solar_baseline_support.solar_event_association_observed_v1.event_linkage_diagnostics.checks.cme_region_linkage_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_event_association_observed_v1.event_linkage_diagnostics.checks.region_identifier_consistency_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_topology_linkage_observed_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.overall_status).toBe(
      "pass",
    );
    expect(
      res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.checks.spot_region_corona_context.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.checks.spot_region_corona_context.reference_anchor_id,
    ).toBe("solar.topology_linkage.spot_region_corona_context.v1");
    expect(
      res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.checks.open_flux_polar_field_continuity_context.status,
    ).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cross_layer_consistency_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.overall_status).toBe(
      "pass",
    );
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.interior_residual_coherence.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.interior_residual_coherence.reference_anchor_id,
    ).toBe("solar.cross_layer_consistency.interior_residual_coherence.v1");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.cycle_memory_topology_coherence.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.event_topology_identifier_coherence.status,
    ).toBe("pass");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.cross_layer_mismatch_summary,
    ).toEqual({
      failing_check_ids: [],
      warning_check_ids: [],
      conflicting_section_ids: [],
      conflict_token_count: 0,
      mismatch_fingerprint: "cross-layer:none",
    });
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.overall_status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.flare_catalog.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.flare_catalog.reference_anchor_id).toBe("solar.eruptive.flare_catalog.v1");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.cme_catalog.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.irradiance_continuity.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.source_region_linkage.status).toBe("pass");
    expect(res.body.solar_reference_pack_id).toBe("solar_reference_pack");
    expect(res.body.solar_reference_pack_ref).toBe("data/starsim/solar-reference-pack.v1.json");
    expect(res.body.solar_product_registry_id).toBe("solar_product_registry");
    expect(res.body.solar_product_registry_ref).toBe("data/starsim/solar-product-registry.v1.json");
    expect(res.body.source_resolution.solar_reference_pack_id).toBe("solar_reference_pack");
    expect(res.body.source_resolution.solar_reference_pack_ref).toBe("data/starsim/solar-reference-pack.v1.json");
    expect(res.body.source_resolution.solar_product_registry_id).toBe("solar_product_registry");
    expect(res.body.source_resolution.solar_product_registry_ref).toBe("data/starsim/solar-product-registry.v1.json");
    expect(res.body.solar_consistency_diagnostics.overall_status).toBe("pass");
    expect(res.body.solar_consistency_diagnostics.reference_pack_id).toBe("solar_reference_pack");
    expect(res.body.solar_consistency_diagnostics.checks.source_region_overlap.status).toBe("pass");
    expect(res.body.solar_consistency_diagnostics.checks.source_region_overlap.reference_anchor_id).toBe("solar.consistency.source_region_overlap.v1");
    expect(res.body.solar_consistency_diagnostics.checks.source_region_overlap.reference_doc_ids).toEqual(["hmi_products", "goes_xray", "lasco_docs"]);
    expect(res.body.solar_consistency_diagnostics.checks.magnetogram_active_region_linkage.status).toBe("pass");
    expect(res.body.solar_consistency_diagnostics.checks.irradiance_context_consistency.status).toBe("pass");
    expect(res.body.solar_consistency_diagnostics.checks.phase_metadata_coherence.status).toBe("pass");
    expect(res.body.solar_provenance_diagnostics.overall_status).toBe("pass");
    expect(res.body.solar_provenance_diagnostics.product_registry_id).toBe("solar_product_registry");
    expect(res.body.solar_provenance_diagnostics.checks.solar_global_modes.source_product_id).toBe("gong_hmi_global_modes_v1");
    expect(res.body.solar_provenance_diagnostics.checks.solar_local_helio.source_product_id).toBe("hmi_gong_local_helio_context_v1");
    expect(res.body.solar_provenance_diagnostics.checks.solar_structural_residuals.source_product_id).toBe(
      "solar_assimilation_structural_residual_context_v1",
    );
    expect(res.body.solar_provenance_diagnostics.checks.solar_surface_flows.source_product_id).toBe("hmi_gong_surface_flow_context_v1");
    expect(res.body.solar_provenance_diagnostics.checks.solar_coronal_field.source_product_id).toBe(
      "pfss_coronal_field_context_v1",
    );
    expect(res.body.solar_provenance_diagnostics.checks.solar_magnetic_memory.source_product_id).toBe(
      "hmi_noaa_magnetic_memory_history_v1",
    );
    expect(res.body.solar_provenance_diagnostics.checks.solar_sunspot_catalog.source_product_id).toBe(
      "hmi_noaa_sunspot_catalog_v1",
    );
    expect(res.body.solar_provenance_diagnostics.checks.solar_event_linkage.source_product_id).toBe(
      "solar_cross_phase_event_linkage_context_v1",
    );
    expect(res.body.solar_provenance_diagnostics.checks.solar_topology_linkage.source_product_id).toBe(
      "solar_cross_layer_topology_linkage_context_v1",
    );
    expect(res.body.solar_provenance_diagnostics.checks.solar_cycle_history.source_product_id).toBe("hale_cycle_history_context_v1");
    expect(res.body.solar_provenance_diagnostics.checks.solar_magnetogram.source_product_family).toBe("magnetogram_products");
    expect(res.body.canonical_request_draft.solar_baseline.solar_magnetogram.metadata.source_product_id).toBe("hmi_full_disk_magnetogram_v1");
    expect(res.body.canonical_request_draft.solar_baseline.solar_flare_catalog.metadata.source_doc_ids).toEqual(["goes_xray"]);
    expect(res.body.solar_baseline_signature).toMatch(/^sha256:/);
    expect(res.body.previous_solar_baseline_ref).toBeNull();
    expect(res.body.solar_baseline_repeatability).toBeUndefined();
    expect(res.body.source_resolution.artifact_refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "solar_observed_baseline",
          metadata: expect.objectContaining({
            instrument: "SDO/HMI+Borexino+solar-assimilation",
            coordinate_frame: "Carrington",
            observed_mode: "assimilated",
          }),
        }),
      ]),
    );
  });

  it("surfaces solar consistency failures when eruptive source-region refs diverge from cycle context", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
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
            metadata: {
              instrument: "NOAA/SWPC",
              coordinate_frame: "Carrington",
              carrington_rotation: 2290,
              observed_mode: "observed",
            },
          },
          solar_magnetogram: {
            active_region_patch_refs: ["user:solar/magnetograms/patch-1"],
            synoptic_radial_map_ref: "user:solar/magnetograms/synoptic",
            metadata: {
              instrument: "SDO/HMI",
              coordinate_frame: "Carrington",
              carrington_rotation: 2290,
              observed_mode: "observed",
            },
          },
          solar_active_regions: {
            region_refs: ["user:solar/active-regions/noaa-13000"],
            region_count: 1,
            metadata: {
              instrument: "NOAA",
              coordinate_frame: "Carrington",
              carrington_rotation: 2290,
              observed_mode: "observed",
            },
          },
          solar_flare_catalog: {
            event_refs: ["user:solar/flares/goes-event-1"],
            source_region_refs: ["user:solar/active-regions/noaa-99999"],
            flare_count: 1,
            strongest_goes_class: "M1.2",
            metadata: {
              instrument: "GOES/SWPC",
              coordinate_frame: "Carrington",
              carrington_rotation: 2290,
              observed_mode: "observed",
            },
          },
          solar_cme_catalog: {
            event_refs: ["user:solar/cmes/lasco-event-1"],
            source_region_refs: ["user:solar/active-regions/noaa-99999"],
            cme_count: 1,
            metadata: {
              instrument: "SOHO/LASCO",
              coordinate_frame: "Carrington",
              carrington_rotation: 2290,
              observed_mode: "observed",
            },
          },
          solar_irradiance_series: {
            tsi_ref: "user:solar/irradiance/tsi",
            euv_ref: "user:solar/irradiance/euv",
            metadata: {
              instrument: "SDO/EVE",
              coordinate_frame: "Carrington",
              carrington_rotation: 2290,
              observed_mode: "observed",
            },
          },
        },
      })
      .expect(200);

    expect(res.body.solar_consistency_diagnostics.overall_status).toBe("fail");
    expect(res.body.solar_consistency_diagnostics.checks.source_region_overlap.status).toBe("fail");
    expect(res.body.solar_consistency_diagnostics.checks.source_region_overlap.reason_code).toBe("source_region_overlap_mismatch");
  });

  it("surfaces solar interior closure support failures when a Sun request is only partially populated", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_interior_profile: {
            profile_ref: "user:solar/interior/profile",
          },
          solar_layer_boundaries: {
            convection_zone_base_rsun: 0.713,
          },
          solar_global_modes: {
            mode_table_ref: "user:solar/modes",
            low_degree_mode_count: 48,
            detail_ref: "user:solar/modes/detail",
          },
          solar_neutrino_constraints: {
            constraints_ref: "user:solar/neutrinos",
            pp_flux: 5.98,
            be7_flux: 4.82,
            pep_flux: 1.44,
            b8_flux: 5.16,
          },
        },
      })
      .expect(200);

    expect(res.body.canonical_request_draft.solar_baseline.solar_interior_profile.profile_ref).toBe("user:solar/interior/profile");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.reasons).toContain("solar_neutrino_vector_incomplete");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.neutrino_constraint_vector.status).toBe("fail");
  });

  it("surfaces solar interior closure warnings without blocking the Sun baseline when values remain near-band", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_interior_profile: {
            profile_ref: "user:solar/interior/profile",
            summary: {
              convection_zone_base_rsun: 0.713,
              envelope_helium_fraction: 0.257,
            },
          },
          solar_layer_boundaries: {
            convection_zone_base_rsun: 0.713,
          },
          solar_global_modes: {
            mode_table_ref: "user:solar/modes",
            low_degree_mode_count: 30,
          },
          solar_neutrino_constraints: {
            constraints_ref: "user:solar/neutrinos",
            pp_flux: 5.98,
            be7_flux: 4.82,
            pep_flux: 1.44,
            b8_flux: 5.16,
            cno_flux: 7.0,
          },
        },
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("resolved");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.passed).toBe(true);
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.overall_status).toBe("warn");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.envelope_helium_fraction.status).toBe("warn");
    expect(res.body.solar_baseline_support.solar_interior_closure_v1.closure_diagnostics.checks.low_degree_mode_support.status).toBe("warn");
  });

  it("surfaces solar cycle observed failures when cycle context is incomplete", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
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
            polarity_reversal_refs: ["user:solar/cycle/polarity-reversal"],
            butterfly_history_ref: "user:solar/cycle/butterfly-history",
            axial_dipole_history_ref: "user:solar/cycle/axial-dipole-history",
            polar_field_history_ref: "user:solar/cycle/polar-field-history",
          },
          solar_magnetogram: {
            line_of_sight_ref: "user:solar/magnetograms/los",
          },
          solar_active_regions: {
            region_count: 0,
            region_refs: [],
          },
        },
      })
      .expect(200);

    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.reasons).toEqual(
      expect.arrayContaining([
        "solar_cycle_indices_incomplete",
        "solar_cycle_magnetogram_incomplete",
        "solar_active_regions_incomplete",
      ]),
    );
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.cycle_indices.status).toBe("fail");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.chronology_window.status).toBe("pass");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.magnetogram_context.status).toBe("fail");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.active_region_context.status).toBe("fail");
    expect(res.body.solar_baseline_support.solar_cycle_observed_v1.cycle_diagnostics.checks.irradiance_continuity.status).toBe("warn");
  });

  it("surfaces local helioseismology failures when Dopplergram or analysis context is incomplete", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
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
              source_product_id: "hmi_gong_local_helio_context_v1",
              source_product_family: "local_helioseismology_products",
              source_doc_ids: ["hmi_products", "gong_products"],
            },
          },
        },
      })
      .expect(200);

    expect(res.body.solar_baseline_support.solar_local_helio_observed_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_local_helio_observed_v1.reasons).toEqual(
      expect.arrayContaining([
        "solar_local_helio_dopplergram_missing",
        "solar_local_helio_context_incomplete",
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_local_helio_observed_v1.local_helio_diagnostics.checks.dopplergram_context.status,
    ).toBe("missing");
    expect(
      res.body.solar_baseline_support.solar_local_helio_observed_v1.local_helio_diagnostics.checks.travel_time_or_holography_context.status,
    ).toBe("fail");
  });

  it("surfaces solar spot-region failures when spot geometry or spot-to-region linkage is incomplete", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_sunspot_catalog: {
            spot_refs: ["user:solar/sunspots/spot-13000-a"],
            spot_count: 1,
            spots: [
              {
                spot_id: "user:solar/sunspots/spot-13000-a",
                linked_region_id: "user:solar/active-regions/noaa-13000",
              },
            ],
            metadata: {
              instrument: "NOAA+SDO/HMI/HARP",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: {
                value: 1,
                unit: "day",
              },
              source_product_id: "hmi_noaa_sunspot_catalog_v1",
              source_product_family: "sunspot_catalog_products",
              source_doc_ids: ["hmi_products", "sft_review_2023"],
            },
          },
          solar_active_regions: {
            region_refs: ["user:solar/active-regions/noaa-13000"],
            region_count: 1,
            regions: [
              {
                region_id: "user:solar/active-regions/noaa-13000",
                noaa_region_id: "13000",
                harp_id: "HARP-13000",
                linked_spot_ids: ["user:solar/sunspots/spot-99999"],
                leading_polarity: "negative",
              },
            ],
            metadata: {
              instrument: "NOAA+SDO/HMI/HARP",
              coordinate_frame: "Carrington",
              observed_mode: "observed",
              cadence: {
                value: 1,
                unit: "day",
              },
              source_product_id: "hmi_noaa_bipolar_active_region_context_v1",
              source_product_family: "bipolar_active_region_products",
              source_doc_ids: ["hmi_products", "sft_review_2023"],
            },
          },
        },
      })
      .expect(200);

    expect(res.body.solar_baseline_support.solar_spot_region_observed_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_spot_region_observed_v1.reasons).toEqual(
      expect.arrayContaining([
        "solar_spot_geometry_incomplete",
        "solar_spot_region_linkage_incomplete",
        "solar_bipolar_grouping_incomplete",
        "solar_spot_polarity_tilt_incomplete",
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_spot_region_observed_v1.spot_region_diagnostics.checks.spot_geometry_context.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_spot_region_observed_v1.spot_region_diagnostics.checks.spot_region_linkage_context.status,
    ).toBe("fail");
  });

  it("surfaces solar eruptive observed failures when flare and CME context are incomplete", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_flare_catalog: {
            event_refs: ["user:solar/flares/goes-event-1"],
            flare_count: 1,
          },
          solar_cme_catalog: {
            cme_count: 0,
            event_refs: [],
          },
          solar_irradiance_series: {
            tsi_ref: "user:solar/irradiance/tsi",
          },
        },
      })
      .expect(200);

    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.reasons).toEqual(
      expect.arrayContaining([
        "solar_flare_catalog_incomplete",
        "solar_cme_catalog_incomplete",
      ]),
    );
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.flare_catalog.status).toBe("fail");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.cme_catalog.status).toBe("fail");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.irradiance_continuity.status).toBe("warn");
    expect(res.body.solar_baseline_support.solar_eruptive_catalog_v1.eruptive_diagnostics.checks.source_region_linkage.status).toBe("warn");
  });

  it("surfaces solar event-association failures when flare linkage or region identifiers are inconsistent", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_event_linkage: {
            links: [
              {
                linked_region_id: "user:solar/active-regions/noaa-99999",
                linked_noaa_region_id: "99999",
                linked_harp_id: "HARP-99999",
                event_type: "cme",
                event_ref: "user:solar/cmes/lasco-event-1",
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
              cadence: {
                value: 1,
                unit: "min",
              },
              source_product_id: "solar_cross_phase_event_linkage_context_v1",
              source_product_family: "cross_phase_event_linkage",
              source_doc_ids: ["goes_xray", "lasco_docs", "hmi_products", "gong_products"],
            },
          },
          solar_flare_catalog: {
            event_refs: ["user:solar/flares/goes-event-1"],
            source_region_refs: ["user:solar/active-regions/noaa-13000"],
            flare_count: 1,
            strongest_goes_class: "M1.2",
          },
          solar_cme_catalog: {
            event_refs: ["user:solar/cmes/lasco-event-1"],
            source_region_refs: ["user:solar/active-regions/noaa-13000"],
            cme_count: 1,
          },
          solar_active_regions: {
            region_refs: ["user:solar/active-regions/noaa-13000"],
            region_count: 1,
            regions: [
              {
                region_id: "user:solar/active-regions/noaa-13000",
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
      })
      .expect(200);

    expect(res.body.solar_baseline_support.solar_event_association_observed_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_event_association_observed_v1.reasons).toEqual(
      expect.arrayContaining([
        "solar_event_linkage_flare_missing",
        "solar_event_linkage_region_identifier_inconsistent",
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_event_association_observed_v1.event_linkage_diagnostics.checks.flare_region_linkage_context.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_event_association_observed_v1.event_linkage_diagnostics.checks.region_identifier_consistency_context.status,
    ).toBe("fail");
  });

  it("surfaces solar topology-linkage failures when surface-to-corona linkage or identifiers are inconsistent", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          schema_version: STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
          solar_sunspot_catalog: {
            spot_refs: ["user:solar/sunspots/spot-13000-a"],
            spot_count: 1,
            spots: [
              {
                spot_id: "user:solar/sunspots/spot-13000-a",
                linked_region_id: "user:solar/active-regions/noaa-13000",
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
            region_refs: ["user:solar/active-regions/noaa-13000"],
            region_count: 1,
            regions: [
              {
                region_id: "user:solar/active-regions/noaa-13000",
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
                linked_spot_ids: ["user:solar/sunspots/spot-13000-a"],
              },
            ],
          },
          solar_coronal_field: {
            pfss_solution_ref: "user:solar/coronal/pfss-solution-2290",
            synoptic_boundary_ref: "user:solar/coronal/synoptic-boundary-2290",
            coronal_hole_refs: ["user:solar/coronal/coronal-hole-north"],
            open_field_map_ref: "user:solar/coronal/open-field-map-2290",
            summary: {
              source_surface_rsun: 2.5,
              dominant_topology: "dipolar_open_flux",
              coronal_hole_count: 1,
            },
          },
          solar_magnetic_memory: {
            axial_dipole_history_ref: "user:solar/magnetic-memory/axial-dipole-history",
            polar_field_history_ref: "user:solar/magnetic-memory/polar-field-history",
            polarity_reversal_refs: ["user:solar/magnetic-memory/reversal-marker"],
            summary: {
              cycle_labels_covered: ["Cycle 24", "Cycle 25"],
              north_polarity_state: "negative",
              south_polarity_state: "positive",
              latest_axial_dipole_sign: "positive",
              reversal_marker_count: 1,
            },
          },
          solar_flare_catalog: {
            event_refs: ["user:solar/flares/goes-event-1"],
            source_region_refs: ["user:solar/active-regions/noaa-13000"],
            flare_count: 1,
            strongest_goes_class: "M1.2",
          },
          solar_cme_catalog: {
            event_refs: ["user:solar/cmes/lasco-event-1"],
            source_region_refs: ["user:solar/active-regions/noaa-13000"],
            cme_count: 1,
          },
          solar_topology_linkage: {
            link_refs: ["user:solar/topology-linkage/bad-link"],
            link_count: 1,
            links: [
              {
                link_id: "user:solar/topology-linkage/bad-link",
                linked_spot_ids: ["user:solar/sunspots/spot-99999-a"],
                linked_region_id: "user:solar/active-regions/noaa-99999",
                linked_noaa_region_id: "99999",
                linked_harp_id: "HARP-99999",
                linked_pfss_solution_ref: "user:solar/coronal/pfss-solution-bad",
                linked_flare_refs: ["user:solar/flares/goes-event-1"],
                topology_role: "active_region_open_flux_source",
                linkage_basis: "catalog",
                time_window_start: "2025-02-15T02:45:00.000Z",
                time_window_end: "2025-02-15T04:15:00.000Z",
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
              cadence: {
                value: 1,
                unit: "day",
              },
              source_product_id: "solar_cross_layer_topology_linkage_context_v1",
              source_product_family: "topology_linkage_products",
              source_doc_ids: ["nso_pfss", "hmi_products", "sft_review_2023", "goes_xray", "lasco_docs"],
            },
          },
        },
      })
      .expect(200);

    expect(res.body.solar_baseline_support.solar_topology_linkage_observed_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_topology_linkage_observed_v1.reasons).toEqual(
      expect.arrayContaining([
        "solar_topology_linkage_surface_corona_missing",
        "solar_topology_linkage_open_flux_missing",
        "solar_topology_linkage_identifier_inconsistent",
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.checks.spot_region_corona_context.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.checks.spot_region_corona_context.reference_anchor_id,
    ).toBe("solar.topology_linkage.spot_region_corona_context.v1");
    expect(
      res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.checks.open_flux_polar_field_continuity_context.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_topology_linkage_observed_v1.topology_linkage_diagnostics.checks.identifier_consistency_context.status,
    ).toBe("fail");
  });

  it("surfaces solar cross-layer consistency failures when structural residuals, magnetic-memory continuity, or event identifiers diverge", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const baseline = loadSolarObservedFixtureBaseline();
    const structuralCounterexample = loadSolarCrossLayerCounterexamplePayload(
      "solar-cross-layer-counterexample.structural-mismatch.json",
    );
    const memoryTopologyCounterexample = loadSolarCrossLayerCounterexamplePayload(
      "solar-cross-layer-counterexample.memory-topology-mismatch.json",
    );
    const eventTopologyCounterexample = loadSolarCrossLayerCounterexamplePayload(
      "solar-cross-layer-counterexample.event-topology-mismatch.json",
    );
    const metadataCounterexample = loadSolarCrossLayerCounterexamplePayload(
      "solar-cross-layer-counterexample.metadata-mismatch.json",
    );
    const memoryTopologySection = memoryTopologyCounterexample.solar_topology_linkage as
      | { links?: Array<Record<string, unknown>> }
      | undefined;
    const metadataTopologySection = metadataCounterexample.solar_topology_linkage as
      | { links?: Array<Record<string, unknown>> }
      | undefined;
    const metadataTopologyLinksById = new Map(
      (metadataTopologySection?.links ?? [])
        .filter((link): link is Record<string, unknown> => typeof link === "object" && link !== null)
        .map((link) => [link.link_id, link]),
    );
    const combinedTopologyLinkage = {
      ...(memoryTopologySection ?? {}),
      links: (memoryTopologySection?.links ?? []).map((link) => {
        const metadataLink = metadataTopologyLinksById.get((link as { link_id?: unknown }).link_id);
        return metadataLink
          ? {
              ...link,
              time_window_start: metadataLink.time_window_start ?? (link as Record<string, unknown>).time_window_start,
              time_window_end: metadataLink.time_window_end ?? (link as Record<string, unknown>).time_window_end,
            }
          : link;
      }),
    };

    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
        solar_baseline: {
          ...baseline,
          ...structuralCounterexample,
          ...eventTopologyCounterexample,
          ...metadataCounterexample,
          ...memoryTopologyCounterexample,
          solar_coronal_field: metadataCounterexample.solar_coronal_field ?? baseline.solar_coronal_field,
          solar_topology_linkage: combinedTopologyLinkage,
        },
      })
      .expect(200);

    expect(res.body.solar_baseline_support.solar_cross_layer_consistency_v1.passed).toBe(false);
    expect(res.body.solar_baseline_support.solar_cross_layer_consistency_v1.reasons).toEqual(
      expect.arrayContaining([
        "solar_cross_layer_structural_context_incomplete",
        "solar_cross_layer_mode_residual_incomplete",
        "solar_cross_layer_memory_topology_inconsistent",
        "solar_cross_layer_event_topology_inconsistent",
        "solar_cross_layer_metadata_misaligned",
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.interior_residual_coherence.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.interior_residual_coherence.missing_required_refs,
    ).toEqual(
      expect.arrayContaining([
        "solar_structural_residuals.hydrostatic_residual_ref",
        "solar_structural_residuals.sound_speed_residual_ref",
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.interior_residual_coherence.reference_anchor_id,
    ).toBe("solar.cross_layer_consistency.interior_residual_coherence.v1");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.cycle_memory_topology_coherence.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.cycle_memory_topology_coherence.conflicting_ref_pairs,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "topology_memory_axial_dipole" }),
        expect.objectContaining({ relation: "topology_memory_polar_field" }),
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.cycle_memory_topology_coherence.reference_anchor_id,
    ).toBe("solar.cross_layer_consistency.cycle_memory_topology_coherence.v1");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.event_topology_identifier_coherence.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.event_topology_identifier_coherence.conflicting_noaa_ids,
    ).toContain("99999");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.event_topology_identifier_coherence.reference_anchor_id,
    ).toBe("solar.cross_layer_consistency.event_topology_identifier_coherence.v1");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.chronology_metadata_alignment.status,
    ).toBe("fail");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.checks.chronology_metadata_alignment.non_carrington_sections,
    ).toContain("solar_coronal_field");
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.cross_layer_mismatch_summary.failing_check_ids,
    ).toEqual(
      expect.arrayContaining([
        "interior_residual_coherence",
        "cycle_memory_topology_coherence",
        "event_topology_identifier_coherence",
        "chronology_metadata_alignment",
      ]),
    );
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.cross_layer_mismatch_summary.conflict_token_count,
    ).toBeGreaterThan(0);
    expect(
      res.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.cross_layer_mismatch_summary.mismatch_fingerprint,
    ).not.toBe("cross-layer:none");
  });

  it("merges Gaia DR3 identity/astrometry with SDSS Astra spectroscopy into a structure-ready draft", async () => {
    const app = await buildApp();
    const resolveResponse = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        requested_lanes: ["structure_mesa"],
      })
      .expect(200);

    expect(resolveResponse.body.schema_version).toBe("star-sim-source-resolve-v1");
    expect(resolveResponse.body.source_resolution.status).toBe("resolved");
    expect(resolveResponse.body.source_resolution.fetch_mode).toBe("fixture");
    expect(resolveResponse.body.source_resolution.selection_manifest.schema_version).toBe(STAR_SIM_SOURCE_SELECTION_SCHEMA_VERSION);
    expect(resolveResponse.body.structure_mesa_ready).toBe(true);
    expect(resolveResponse.body.supported_domain_preview?.passed).toBe(true);
    expect(resolveResponse.body.identifiers_resolved.gaia_dr3_source_id).toBe("123456789012345678");
    expect(resolveResponse.body.identifiers_resolved.sdss_apogee_id).toBe("2M00000000+0000000");
    expect(resolveResponse.body.identifiers_observed.sdss_apogee_id).toBe("2M00000000+0000000");
    expect(resolveResponse.body.identifiers_trusted.sdss_apogee_id).toBe("2M00000000+0000000");
    expect(resolveResponse.body.benchmark_target_id).toBe("demo_solar_a");
    expect(resolveResponse.body.benchmark_target_match_mode).toBe("matched_by_identifier");
    expect(resolveResponse.body.benchmark_target_identity_basis).toBe("trusted_identifier");
    expect(resolveResponse.body.crossmatch_summary.accepted).toBeGreaterThan(0);
    expect(resolveResponse.body.crossmatch_summary.rejected).toBe(0);
    expect(
      (resolveResponse.body.crossmatch_summary.fallback_fields as Array<{ field_path: string }>).some(
        (entry) => entry.field_path === "spectroscopy.teff_K",
      ),
    ).toBe(false);
    expect(resolveResponse.body.canonical_request_draft.astrometry.parallax_mas).toBe(59.2);
    expect(resolveResponse.body.canonical_request_draft.spectroscopy.teff_K).toBe(5821);
    expect(resolveResponse.body.canonical_request_draft.spectroscopy.field_sources.teff_K).toBe("sdss_astra");

    const runResponse = await request(app)
      .post("/api/star-sim/v1/run")
      .send({
        ...resolveResponse.body.canonical_request_draft,
        requested_lanes: ["structure_mesa"],
      })
      .expect(200);

    expect(runResponse.body.lanes[0].status).toBe("unavailable");
    expect(runResponse.body.lanes[0].status_reason).toBe("async_job_required");
  });

  it("returns a partial Gaia-only resolution when fallback spectroscopy is disabled", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        source_hints: {
          preferred_catalogs: ["gaia_dr3"],
          allow_fallbacks: false,
        },
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("partial");
    expect(res.body.structure_mesa_ready).toBe(false);
    expect(res.body.source_resolution.reasons).toContain("spectroscopy_unresolved");
    expect(res.body.canonical_request_draft.astrometry.parallax_mas).toBe(59.2);
    expect(res.body.canonical_request_draft.spectroscopy).toBeUndefined();
  });

  it("adds TASOC seismic summaries and marks oscillation readiness when requested", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        requested_lanes: ["structure_mesa", "oscillation_gyre"],
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("resolved");
    expect(res.body.structure_mesa_ready).toBe(true);
    expect(res.body.oscillation_gyre_ready).toBe(true);
    expect(res.body.canonical_request_draft.asteroseismology.numax_uHz).toBe(3085.2);
    expect(res.body.canonical_request_draft.asteroseismology.deltanu_uHz).toBe(134.7);
    expect(res.body.canonical_request_draft.asteroseismology.field_sources.numax_uHz).toBe("tasoc");
    expect(res.body.source_resolution.selection_manifest.fields["asteroseismology.numax_uHz"].selected_from).toBe("tasoc");
  });

  it("returns a partial oscillation preview when seismic summaries are unavailable", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar B",
        },
        identifiers: {
          gaia_dr3_source_id: "987654321098765432",
        },
        requested_lanes: ["structure_mesa", "oscillation_gyre"],
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("partial");
    expect(res.body.structure_mesa_ready).toBe(true);
    expect(res.body.oscillation_gyre_ready).toBe(false);
    expect(res.body.source_resolution.reasons).toContain("seismology_unresolved");
  });


  it("records explicit crossmatch rejection reasons on identifier conflict", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
          sdss_apogee_id: "BAD-ID",
        },
      })
      .expect(200);

    expect(res.body.quality_rejections.length).toBeGreaterThan(0);
    expect(res.body.quality_rejections.some((entry: any) => entry.reason === "rejected_identifier_conflict")).toBe(true);
  });

  it("does not let rejected-source identifiers drive benchmark-target assignment", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar B",
        },
        identifiers: {
          gaia_dr3_source_id: "987654321098765432",
          sdss_apogee_id: "2M00000000+0000000",
        },
      })
      .expect(200);

    expect(res.body.quality_rejections.some((entry: any) => entry.catalog === "sdss_astra")).toBe(true);
    expect(res.body.identifiers_observed.sdss_apogee_id).toBe("2M00000000+0000000");
    expect(res.body.identifiers_trusted.sdss_apogee_id).toBe("2M00000000+0000000");
    expect(res.body.benchmark_target_id).toBe("demo_solar_b");
    expect(res.body.benchmark_target_id).not.toBe("demo_solar_a");
  });

  it("surfaces conflicting trusted identifiers instead of picking an arbitrary benchmark target", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
          lamost_obsid: "LAMOST-B-0002",
        },
      })
      .expect(200);

    expect(res.body.identifiers_trusted.gaia_dr3_source_id).toBe("123456789012345678");
    expect(res.body.identifiers_trusted.lamost_obsid).toBe("LAMOST-B-0002");
    expect(res.body.benchmark_target_id).toBeUndefined();
    expect(res.body.benchmark_target_match_mode).toBe("conflicted_trusted_identifiers");
    expect(res.body.benchmark_target_conflict_reason).toBe("multiple_trusted_identifier_targets");
    expect(res.body.benchmark_target_identity_basis).toBe("conflicted_trusted_identifiers");
    expect(res.body.benchmark_target_quality_ok).toBe(false);
  });

  it("does not promote name-only non-Gaia secondary records into trusted benchmark identity", async () => {
    process.env.STAR_SIM_GAIA_DR3_MODE = "disabled";
    process.env.STAR_SIM_SDSS_ASTRA_MODE = "disabled";
    process.env.STAR_SIM_TASOC_MODE = "disabled";
    process.env.STAR_SIM_TESS_MAST_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "lamost-demo-solar-b",
        },
      })
      .expect(200);

    expect(res.body.identifiers_observed.lamost_obsid).toBe("LAMOST-B-0002");
    expect(res.body.identifiers_trusted.lamost_obsid).toBeUndefined();
    expect(res.body.benchmark_target_id).toBeUndefined();
    expect(res.body.benchmark_target_match_mode).toBe("no_match");
    expect(res.body.canonical_request_draft.spectroscopy.teff_K).toBe(5710);
  });

  it("allows an explicit non-Gaia secondary identifier to become trusted without promoting unrelated fetched identity", async () => {
    process.env.STAR_SIM_GAIA_DR3_MODE = "disabled";
    process.env.STAR_SIM_SDSS_ASTRA_MODE = "disabled";
    process.env.STAR_SIM_TASOC_MODE = "disabled";
    process.env.STAR_SIM_TESS_MAST_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        identifiers: {
          lamost_obsid: "LAMOST-B-0002",
        },
      })
      .expect(200);

    expect(res.body.identifiers_observed.lamost_obsid).toBe("LAMOST-B-0002");
    expect(res.body.identifiers_trusted.lamost_obsid).toBe("LAMOST-B-0002");
    expect(res.body.benchmark_target_id).toBe("demo_solar_b");
    expect(res.body.benchmark_target_match_mode).toBe("matched_by_identifier");
    expect(res.body.crossmatch_identity_basis.lamost_dr10).toContain("explicit_request_identifier");
  });

  it("marks fallback as used when Astra is absent and LAMOST provides selected spectroscopy", async () => {
    process.env.STAR_SIM_SDSS_ASTRA_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
      })
      .expect(200);

    expect(res.body.source_resolution.selection_manifest.fields["spectroscopy.teff_K"].selected_from).toBe("lamost_dr10");
    expect(res.body.crossmatch_summary.fallback_used).toBe(true);
    expect(res.body.crossmatch_summary.fallback_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_path: "spectroscopy.teff_K",
          selected_from: "lamost_dr10",
          preferred_catalog: "sdss_astra",
          preferred_status: "absent",
        }),
      ]),
    );
  });

  it("marks fallback as used when TASOC is absent and TESS provides selected seismic summaries", async () => {
    process.env.STAR_SIM_TASOC_MODE = "disabled";
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar A",
        },
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        requested_lanes: ["oscillation_gyre"],
      })
      .expect(200);

    expect(res.body.source_resolution.selection_manifest.fields["asteroseismology.numax_uHz"].selected_from).toBe("tess_mast");
    expect(res.body.crossmatch_summary.fallback_used).toBe(true);
    expect(res.body.crossmatch_summary.fallback_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_path: "asteroseismology.numax_uHz",
          selected_from: "tess_mast",
          preferred_catalog: "tasoc",
          preferred_status: "absent",
        }),
      ]),
    );
  });

  it("fails unresolved targets honestly with explicit reasons", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Unknown Demo Star",
        },
        identifiers: {
          gaia_dr3_source_id: "000000000000000000",
        },
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("unresolved");
    expect(res.body.canonical_request_draft).toBeNull();
    expect(res.body.source_resolution.reasons).toContain("gaia_target_not_found");
  });
});
