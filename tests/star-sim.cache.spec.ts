import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STAR_SIM_SOLAR_OBSERVED_BASELINE_SCHEMA_VERSION,
  STAR_SIM_SOURCE_SELECTION_SCHEMA_VERSION,
} from "../server/modules/starsim/contract";
import { STAR_SIM_SOURCE_REGISTRY_VERSION } from "../server/modules/starsim/sources/types";

type StarSimRouteModule = typeof import("../server/routes/star-sim");
type StarSimJobsModule = typeof import("../server/modules/starsim/jobs");
type StarSimWorkerClientModule = typeof import("../server/modules/starsim/worker/starsim-worker-client");

let artifactRoot = "";

const buildApp = async () => {
  vi.resetModules();
  const routeModule: StarSimRouteModule = await import("../server/routes/star-sim");
  const jobsModule: StarSimJobsModule = await import("../server/modules/starsim/jobs");
  const workerClientModule: StarSimWorkerClientModule = await import(
    "../server/modules/starsim/worker/starsim-worker-client"
  );
  await jobsModule.__resetStarSimJobsForTest();
  await workerClientModule.__resetStarSimWorkerForTest();
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

const waitForJob = async (app: express.Express, jobId: string, expected: string) => {
  for (let i = 0; i < 40; i += 1) {
    const response = await request(app).get(`/api/star-sim/v1/jobs/${jobId}`).expect(200);
    if (response.body?.status === expected) {
      return response.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`job ${jobId} did not reach ${expected}`);
};

beforeEach(() => {
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-cache-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_MESA_RUNTIME = "mock";
  process.env.STAR_SIM_GYRE_RUNTIME = "mock";
  process.env.STAR_SIM_SOURCE_FETCH_MODE = "fixture";
});

afterEach(async () => {
  const jobsModule: StarSimJobsModule = await import("../server/modules/starsim/jobs");
  const workerClientModule: StarSimWorkerClientModule = await import(
    "../server/modules/starsim/worker/starsim-worker-client"
  );
  jobsModule.__resetStarSimJobsForTest();
  await workerClientModule.__resetStarSimWorkerForTest();
  delete process.env.STAR_SIM_ARTIFACT_ROOT;
  delete process.env.STAR_SIM_MESA_RUNTIME;
  delete process.env.STAR_SIM_GYRE_RUNTIME;
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
  delete process.env.STAR_SIM_CACHE_TTL_MS;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim source-resolution cache", () => {
  it("serves a cached source-resolution result on repeated identical requests", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        name: "Demo Solar A",
      },
      identifiers: {
        gaia_dr3_source_id: "123456789012345678",
      },
    };

    const first = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);
    const second = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);

    expect(first.body.source_resolution.cache_key).toBe(second.body.source_resolution.cache_key);
    expect(first.body.identifiers_resolved).toEqual(second.body.identifiers_resolved);
    expect(second.body.source_resolution.cache_status).toBe("hit");
    expect(second.body.source_resolution.fetch_mode).toBe("cache");
    expect(Array.isArray(second.body.source_resolution.artifact_refs)).toBe(true);
  });

  it("changes the source-resolution cache key when source policy changes", async () => {
    const app = await buildApp();
    const payloadA = {
      target: {
        name: "Demo Solar A",
      },
      identifiers: {
        gaia_dr3_source_id: "123456789012345678",
      },
      spectroscopy: {
        teff_K: 5900,
      },
    };
    const payloadB = {
      ...payloadA,
      source_policy: {
        strict_catalog_resolution: true,
      },
    };

    const [resA, resB] = await Promise.all([
      request(app).post("/api/star-sim/v1/resolve").send(payloadA).expect(200),
      request(app).post("/api/star-sim/v1/resolve").send(payloadB).expect(200),
    ]);

    expect(resA.body.source_resolution.cache_key).not.toBe(resB.body.source_resolution.cache_key);
  });

  it("separates live and fixture source cache namespaces", async () => {
    const fixtureApp = await buildApp();
    const payload = {
      target: {
        name: "Demo Solar A",
      },
      identifiers: {
        gaia_dr3_source_id: "123456789012345678",
      },
    };
    const fixtureRes = await request(fixtureApp).post("/api/star-sim/v1/resolve").send(payload).expect(200);

    process.env.STAR_SIM_SOURCE_FETCH_MODE = "live";
    process.env.STAR_SIM_GAIA_DR3_ENDPOINT = "http://127.0.0.1:9/gaia";
    process.env.STAR_SIM_SDSS_ASTRA_ENDPOINT = "http://127.0.0.1:9/astra";
    process.env.STAR_SIM_LAMOST_DR10_ENDPOINT = "http://127.0.0.1:9/lamost";
    const liveApp = await buildApp();
    const liveRes = await request(liveApp).post("/api/star-sim/v1/resolve").send(payload).expect(200);

    expect(fixtureRes.body.source_resolution.cache_key).not.toBe(liveRes.body.source_resolution.cache_key);
    expect(liveRes.body.source_resolution.fetch_mode).toBe("live");
  });

  it("returns an explicit cache-only miss when no compatible source artifact exists", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "cache_only";
    const app = await buildApp();
    const payload = {
      target: {
        name: "Demo Solar A",
      },
      identifiers: {
        gaia_dr3_source_id: "123456789012345678",
      },
    };

    const res = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);

    expect(res.body.source_resolution.status).toBe("unresolved");
    expect(res.body.source_resolution.fetch_mode).toBe("cache_only");
    expect(res.body.source_resolution.reasons).toContain("cache_only_miss");
  });

  it("writes source cache artifacts with the current selection-manifest schema version", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        name: "Demo Solar A",
      },
      identifiers: {
        gaia_dr3_source_id: "123456789012345678",
      },
    };

    const res = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);
    const selectionManifestRef = (res.body.source_resolution.artifact_refs as Array<{ kind: string; path: string }>).find(
      (ref) => ref.kind === "selection_manifest",
    );
    expect(selectionManifestRef).toBeTruthy();

    const selectionManifestPath = path.resolve(selectionManifestRef!.path);
    const selectionManifest = JSON.parse(fs.readFileSync(selectionManifestPath, "utf8"));
    expect(selectionManifest.schema_version).toBe(STAR_SIM_SOURCE_SELECTION_SCHEMA_VERSION);
  });

  it("writes source cache artifacts with the current registry version", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        name: "Demo Solar A",
      },
      identifiers: {
        gaia_dr3_source_id: "123456789012345678",
      },
    };

    const res = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);
    const manifestRef = (res.body.source_resolution.artifact_refs as Array<{ kind: string; path: string }>).find(
      (ref) => ref.kind === "manifest",
    );
    expect(manifestRef).toBeTruthy();

    const manifestPath = path.resolve(manifestRef!.path);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.registry_version).toBe(STAR_SIM_SOURCE_REGISTRY_VERSION);
  });

  it("persists solar observed artifact metadata through the source cache for Sun requests", async () => {
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

    const solarArtifact = (res.body.source_resolution.artifact_refs as Array<{ kind: string; metadata?: Record<string, unknown> }>).find(
      (ref) => ref.kind === "solar_observed_baseline",
    );
    expect(solarArtifact).toBeTruthy();
    expect(solarArtifact?.metadata).toEqual(
      expect.objectContaining({
        instrument: "SDO/HMI+Borexino+solar-assimilation",
        coordinate_frame: "Carrington",
        observed_mode: "assimilated",
      }),
    );

    const cached = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          object_id: "sun",
          name: "Sun",
        },
      })
      .expect(200);

    const cachedSolarArtifact = (cached.body.source_resolution.artifact_refs as Array<{ kind: string; metadata?: Record<string, unknown> }>).find(
      (ref) => ref.kind === "solar_observed_baseline",
    );
    expect(cached.body.source_resolution.cache_status).toBe("hit");
    expect(cachedSolarArtifact?.metadata?.instrument).toBe("SDO/HMI+Borexino+solar-assimilation");
  });

  it("marks repeated equivalent Sun resolves as repeatable with the same solar baseline signature", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        object_id: "sun",
        name: "Sun",
      },
    };

    const first = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);
    const second = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);

    expect(first.body.solar_baseline_signature).toMatch(/^sha256:/);
    expect(first.body.solar_reference_pack_id).toBe("solar_reference_pack");
    expect(second.body.source_resolution.cache_status).toBe("hit");
    expect(second.body.solar_baseline_signature).toBe(first.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability).toEqual(
      expect.objectContaining({
        repeatable: true,
        same_signature: true,
      }),
    );

    const summaryArtifact = (second.body.source_resolution.artifact_refs as Array<{ kind: string; path: string }>).find(
      (ref) => ref.kind === "solar_baseline_summary",
    );
    expect(summaryArtifact).toBeTruthy();
  });

  it("changes the solar baseline signature when irradiance context changes and reports drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (euvRef: string) => ({
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
          metadata: {
            instrument: "NOAA/SWPC",
            coordinate_frame: "Carrington",
            carrington_rotation: 2290,
            observed_mode: "observed",
          },
        },
        solar_magnetogram: {
          synoptic_radial_map_ref: "user:solar/magnetograms/synoptic",
          active_region_patch_refs: ["user:solar/magnetograms/patch-1"],
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
          source_region_refs: ["user:solar/active-regions/noaa-13000"],
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
          source_region_refs: ["user:solar/active-regions/noaa-13000"],
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
          euv_ref: euvRef,
          xray_ref: "user:solar/irradiance/xray",
          metadata: {
            instrument: "SDO/EVE",
            coordinate_frame: "Carrington",
            carrington_rotation: 2290,
            observed_mode: "observed",
          },
        },
      },
    });

    const first = await request(app).post("/api/star-sim/v1/resolve").send(buildPayload("user:solar/irradiance/euv-a")).expect(200);
    const second = await request(app).post("/api/star-sim/v1/resolve").send(buildPayload("user:solar/irradiance/euv-b")).expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("irradiance_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when only cycle-history refs change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (butterflyRef: string) => ({
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
          metadata: {
            instrument: "NOAA/SWPC",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_cycle_history: {
          history_start_iso: "2018-01-01T00:00:00.000Z",
          history_end_iso: "2025-12-31T23:59:59.000Z",
          covered_cycle_labels: ["Cycle 24", "Cycle 25"],
          polarity_reversal_refs: ["user:solar/cycle/polarity-reversal"],
          butterfly_history_ref: butterflyRef,
          axial_dipole_history_ref: "user:solar/cycle/axial-dipole-history",
          polar_field_history_ref: "user:solar/cycle/polar-field-history",
          metadata: {
            instrument: "NOAA/SWPC+SDO/HMI",
            coordinate_frame: "Carrington",
            cadence: {
              value: 1,
              unit: "day",
            },
            observed_mode: "observed",
            source_product_id: "hale_cycle_history_context_v1",
            source_product_family: "cycle_history_products",
            source_doc_ids: ["sft_review_2023", "hmi_products"],
          },
        },
        solar_magnetogram: {
          synoptic_radial_map_ref: "user:solar/magnetograms/synoptic",
          active_region_patch_refs: ["user:solar/magnetograms/patch-1"],
          metadata: {
            instrument: "SDO/HMI",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
        solar_active_regions: {
          region_refs: ["user:solar/active-regions/noaa-13000"],
          region_count: 1,
          metadata: {
            instrument: "NOAA",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
          },
        },
      },
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/cycle/butterfly-history-a"))
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/cycle/butterfly-history-b"))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("artifact_refs_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when only section product provenance changes and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (productId: string, docIds: string[]) => ({
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
          metadata: {
            instrument: "NOAA/SWPC",
            coordinate_frame: "Carrington",
            carrington_rotation: 2290,
            observed_mode: "observed",
          },
        },
        solar_magnetogram: {
          synoptic_radial_map_ref: "user:solar/magnetograms/synoptic",
          active_region_patch_refs: ["user:solar/magnetograms/patch-1"],
          metadata: {
            instrument: "SDO/HMI",
            coordinate_frame: "Carrington",
            carrington_rotation: 2290,
            observed_mode: "observed",
            source_product_id: productId,
            source_product_family: "magnetogram_products",
            source_doc_ids: docIds,
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
      },
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("hmi_full_disk_magnetogram_v1", ["hmi_products"]))
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("noaa_active_region_catalog_v1", ["hmi_products"]))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("product_provenance_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when local-helio refs change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (dopplergramRef: string) => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_local_helio: {
          dopplergram_ref: dopplergramRef,
          travel_time_ref: "user:solar/local-helio/travel-time",
          holography_ref: "user:solar/local-helio/holography",
          sunquake_event_refs: ["user:solar/local-helio/sunquake-event-1"],
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
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/local-helio/dopplergram-a"))
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/local-helio/dopplergram-b"))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("artifact_refs_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when structural-residual refs or summary values change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (maxRotationResidualNhz: number) => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_structural_residuals: {
          hydrostatic_residual_ref: "user:solar/structural-residuals/hydrostatic-balance",
          sound_speed_residual_ref: "user:solar/structural-residuals/sound-speed",
          rotation_residual_ref: "user:solar/structural-residuals/rotation",
          pressure_scale_height_ref: "user:solar/structural-residuals/pressure-scale-height",
          neutrino_consistency_ref: "user:solar/structural-residuals/neutrino-consistency",
          summary: {
            max_sound_speed_fractional_residual: 0.0018,
            mean_hydrostatic_fractional_residual: 0.0006,
            max_rotation_residual_nhz: maxRotationResidualNhz,
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
            time_range: {
              start_iso: "2010-04-30T00:00:00.000Z",
              end_iso: "2025-12-31T23:59:59.000Z",
            },
            source_product_id: "solar_assimilation_structural_residual_context_v1",
            source_product_family: "structural_residual_products",
            source_doc_ids: ["basu_antia_2004", "hmi_products", "gong_products", "borexino_2018"],
          },
        },
      },
    });

    const first = await request(app).post("/api/star-sim/v1/resolve").send(buildPayload(8.4)).expect(200);
    const second = await request(app).post("/api/star-sim/v1/resolve").send(buildPayload(12.6)).expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("structural_residual_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when surface-flow geometry changes and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (tiltDeg: number) => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_surface_flows: {
          differential_rotation_ref: "user:solar/surface-flows/differential-rotation",
          meridional_flow_ref: "user:solar/surface-flows/meridional-flow",
          supergranular_diffusion_ref: "user:solar/surface-flows/supergranular-diffusion",
          summary: {
            equatorial_rotation_deg_per_day: 14.35,
            rotation_shear_deg_per_day: 2.68,
            meridional_flow_peak_ms: 12.4,
          },
          metadata: {
            instrument: "SDO/HMI+GONG",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
            cadence: {
              value: 1,
              unit: "day",
            },
            time_range: {
              start_iso: "2025-01-01T00:00:00.000Z",
              end_iso: "2025-12-31T23:59:59.000Z",
            },
            source_product_id: "hmi_gong_surface_flow_context_v1",
            source_product_family: "surface_flow_products",
            source_doc_ids: ["hmi_products", "gong_products", "sft_review_2023"],
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
              sharp_ref: "user:solar/active-regions/sharp-13000",
              heliographic_latitude_deg: 14.2,
              carrington_longitude_deg: 205.4,
              area_msh: 420,
              magnetic_class: "beta-gamma",
              tilt_deg: tiltDeg,
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
            time_range: {
              start_iso: "2025-01-01T00:00:00.000Z",
              end_iso: "2025-12-31T23:59:59.000Z",
            },
            source_product_id: "hmi_noaa_active_region_geometry_v1",
            source_product_family: "active_region_geometry_products",
            source_doc_ids: ["hmi_products", "sft_review_2023"],
          },
        },
      },
    });

    const first = await request(app).post("/api/star-sim/v1/resolve").send(buildPayload(11.5)).expect(200);
    const second = await request(app).post("/api/star-sim/v1/resolve").send(buildPayload(18.5)).expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("surface_flow_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when coronal-field refs or topology change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (pfssRef: string, dominantTopology: string) => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_coronal_field: {
          pfss_solution_ref: pfssRef,
          synoptic_boundary_ref: "user:solar/corona/synoptic-boundary",
          coronal_hole_refs: ["user:solar/corona/coronal-hole-north"],
          open_field_map_ref: "user:solar/corona/open-field-map",
          euv_coronal_context_ref: "user:solar/corona/aia-euv",
          summary: {
            source_surface_rsun: 2.5,
            open_flux_weber: 340000000000000,
            dominant_topology: dominantTopology,
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
            source_product_id: "pfss_coronal_field_context_v1",
            source_product_family: "coronal_field_proxy_products",
            source_doc_ids: ["nso_pfss", "hmi_products", "aia_corona"],
          },
        },
        solar_magnetogram: {
          synoptic_radial_map_ref: "user:solar/magnetograms/synoptic-radial",
          active_region_patch_refs: ["user:solar/active-regions/patch-13000"],
          metadata: {
            instrument: "SDO/HMI",
            coordinate_frame: "Carrington",
            observed_mode: "observed",
            cadence: {
              value: 1,
              unit: "day",
            },
            source_product_id: "hmi_full_disk_magnetogram_v1",
            source_product_family: "magnetogram_products",
            source_doc_ids: ["hmi_products"],
          },
        },
        solar_active_regions: {
          region_refs: ["user:solar/active-regions/noaa-13000"],
          region_count: 1,
        },
        solar_event_linkage: {
          link_refs: ["user:solar/event-linkage/link-13000"],
          summary: {
            flare_link_count: 1,
            cme_link_count: 0,
            sunquake_link_count: 0,
          },
        },
      },
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/corona/pfss-a", "dipolar_open_flux"))
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/corona/pfss-b", "quadrupolar_open_flux"))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("coronal_field_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when magnetic-memory refs or bipolar semantics change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (axialDipoleRef: string, southHemisphere: "north" | "south") => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_magnetic_memory: {
          axial_dipole_history_ref: axialDipoleRef,
          polar_field_history_ref: "user:solar/magnetic-memory/polar-field-history",
          polarity_reversal_refs: ["user:solar/magnetic-memory/reversal-marker"],
          bipolar_region_proxy_ref: "user:solar/magnetic-memory/bipolar-proxy",
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
            cadence: {
              value: 1,
              unit: "day",
            },
            time_range: {
              start_iso: "2024-01-01T00:00:00.000Z",
              end_iso: "2025-12-31T23:59:59.000Z",
            },
            source_product_id: "hmi_noaa_magnetic_memory_history_v1",
            source_product_family: "magnetic_memory_products",
            source_doc_ids: ["sft_review_2023", "hmi_products"],
          },
        },
        solar_active_regions: {
          region_refs: ["user:solar/active-regions/noaa-13000", "user:solar/active-regions/noaa-13001"],
          region_count: 2,
          regions: [
            {
              region_id: "user:solar/active-regions/noaa-13000",
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
              region_id: "user:solar/active-regions/noaa-13001",
              heliographic_latitude_deg: -9.6,
              carrington_longitude_deg: 218.8,
              area_msh: 360,
              magnetic_class: "beta",
              tilt_deg: -8.1,
              leading_polarity: "positive",
              hemisphere: southHemisphere,
              following_polarity: "negative",
              bipole_separation_deg: 5.7,
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
            time_range: {
              start_iso: "2025-01-01T00:00:00.000Z",
              end_iso: "2025-12-31T23:59:59.000Z",
            },
            source_product_id: "hmi_noaa_bipolar_active_region_context_v1",
            source_product_family: "bipolar_active_region_products",
            source_doc_ids: ["hmi_products", "sft_review_2023"],
          },
        },
      },
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/magnetic-memory/axial-dipole-history-a", "south"))
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/magnetic-memory/axial-dipole-history-b", "north"))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("magnetic_memory_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when event-linkage refs or linkage basis change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (eventRef: string, linkageBasis: "catalog" | "spatiotemporal") => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_event_linkage: {
          links: [
            {
              linked_region_id: "user:solar/active-regions/noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              event_type: "flare",
              event_ref: "user:solar/flares/goes-event-1",
              linkage_basis: "catalog",
              event_time_iso: "2025-02-14T11:23:00.000Z",
            },
            {
              linked_region_id: "user:solar/active-regions/noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              event_type: "cme",
              event_ref: eventRef,
              linkage_basis: linkageBasis,
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
            cadence: {
              value: 1,
              unit: "min",
            },
            time_range: {
              start_iso: "2025-02-14T00:00:00.000Z",
              end_iso: "2025-02-15T00:00:00.000Z",
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
          event_refs: [eventRef],
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
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/cmes/lasco-event-1", "catalog"))
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/cmes/lasco-event-2", "spatiotemporal"))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("event_linkage_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when sunspot refs or bipolar grouping change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (spotRef: string, bipolarGroupId: string) => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_sunspot_catalog: {
          spot_refs: [spotRef, "user:solar/sunspots/spot-13000-b"],
          spot_count: 2,
          bipolar_group_refs: [bipolarGroupId],
          spots: [
            {
              spot_id: spotRef,
              linked_region_id: "user:solar/active-regions/noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              hemisphere: "north",
              heliographic_latitude_deg: 14.1,
              carrington_longitude_deg: 205.2,
              area_msh: 180,
              polarity: "negative",
              bipolar_group_id: bipolarGroupId,
            },
            {
              spot_id: "user:solar/sunspots/spot-13000-b",
              linked_region_id: "user:solar/active-regions/noaa-13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              hemisphere: "north",
              heliographic_latitude_deg: 14.4,
              carrington_longitude_deg: 206,
              area_msh: 150,
              polarity: "positive",
              bipolar_group_id: bipolarGroupId,
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
            time_range: {
              start_iso: "2025-02-14T00:00:00.000Z",
              end_iso: "2025-02-16T00:00:00.000Z",
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
              linked_spot_ids: [spotRef, "user:solar/sunspots/spot-13000-b"],
              bipolar_group_id: bipolarGroupId,
              polarity_ordering_class: "hale-consistent",
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
            time_range: {
              start_iso: "2025-02-14T00:00:00.000Z",
              end_iso: "2025-02-16T00:00:00.000Z",
            },
            source_product_id: "hmi_noaa_bipolar_active_region_context_v1",
            source_product_family: "bipolar_active_region_products",
            source_doc_ids: ["hmi_products", "sft_review_2023"],
          },
        },
      },
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/sunspots/spot-13000-a", "user:solar/bipolar-groups/group-13000-a"))
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("user:solar/sunspots/spot-13000-c", "user:solar/bipolar-groups/group-13000-b"))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("spot_region_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when topology-linkage refs or linkage semantics change and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (
      topologyRef: string,
      topologyRole: "active_region_open_flux_source" | "bipolar_memory_continuity",
      linkageBasis: "manual_catalog_association" | "region_id_match",
    ) => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        schema_version: "star-sim-solar-baseline/1",
        solar_sunspot_catalog: {
          spot_refs: ["user:solar/sunspots/spot-13000-a", "user:solar/sunspots/spot-13000-b"],
          spot_count: 2,
          spots: [
            {
              spot_id: "user:solar/sunspots/spot-13000-a",
              linked_region_id: "user:solar/active-regions/ar13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              hemisphere: "north",
              heliographic_latitude_deg: 14.1,
              carrington_longitude_deg: 205.2,
              area_msh: 180,
              polarity: "negative",
            },
            {
              spot_id: "user:solar/sunspots/spot-13000-b",
              linked_region_id: "user:solar/active-regions/ar13000",
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
          region_refs: ["user:solar/active-regions/ar13000"],
          region_count: 1,
          regions: [
            {
              region_id: "user:solar/active-regions/ar13000",
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
              linked_spot_ids: ["user:solar/sunspots/spot-13000-a", "user:solar/sunspots/spot-13000-b"],
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
            time_range: {
              start_iso: "2025-02-14T00:00:00.000Z",
              end_iso: "2025-02-16T00:00:00.000Z",
            },
            source_product_id: "pfss_coronal_field_context_v1",
            source_product_family: "coronal_field_proxy_products",
            source_doc_ids: ["nso_pfss", "hmi_products", "aia_corona"],
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
          source_region_refs: ["user:solar/active-regions/ar13000"],
          flare_count: 1,
          strongest_goes_class: "M1.2",
        },
        solar_cme_catalog: {
          event_refs: ["user:solar/cmes/lasco-event-1"],
          source_region_refs: ["user:solar/active-regions/ar13000"],
          cme_count: 1,
        },
        solar_topology_linkage: {
          link_refs: [topologyRef],
          link_count: 1,
          links: [
            {
              link_id: topologyRef,
              linked_spot_ids: ["user:solar/sunspots/spot-13000-a", "user:solar/sunspots/spot-13000-b"],
              linked_region_id: "user:solar/active-regions/ar13000",
              linked_noaa_region_id: "13000",
              linked_harp_id: "HARP-13000",
              linked_pfss_solution_ref: "user:solar/coronal/pfss-solution-2290",
              linked_open_field_map_ref: "user:solar/coronal/open-field-map-2290",
              linked_coronal_hole_refs: ["user:solar/coronal/coronal-hole-north"],
              linked_flare_refs: ["user:solar/flares/goes-event-1"],
              linked_cme_refs: ["user:solar/cmes/lasco-event-1"],
              linked_polar_field_ref: "user:solar/magnetic-memory/polar-field-history",
              linked_axial_dipole_ref: "user:solar/magnetic-memory/axial-dipole-history",
              topology_role: topologyRole,
              linkage_basis: linkageBasis,
              time_window_start: "2025-02-14T10:30:00.000Z",
              time_window_end: "2025-02-14T12:30:00.000Z",
            },
          ],
          summary: {
            topology_role_count: 1,
            open_flux_link_count: 1,
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
            time_range: {
              start_iso: "2025-02-14T00:00:00.000Z",
              end_iso: "2025-02-16T00:00:00.000Z",
            },
            source_product_id: "solar_cross_layer_topology_linkage_context_v1",
            source_product_family: "topology_linkage_products",
            source_doc_ids: ["nso_pfss", "hmi_products", "sft_review_2023", "goes_xray", "lasco_docs"],
          },
        },
      },
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(
        buildPayload(
          "user:solar/topology-linkage/region-13000-open-flux-a",
          "active_region_open_flux_source",
          "manual_catalog_association",
        ),
      )
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(
        buildPayload(
          "user:solar/topology-linkage/region-13000-open-flux-b",
          "bipolar_memory_continuity",
          "region_id_match",
        ),
      )
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("topology_linkage_context_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when cross-layer coherence evidence changes and reports evidence drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const buildPayload = (counterexampleFileName?: string) => ({
      target: {
        object_id: "sun",
        name: "Sun",
      },
      solar_baseline: {
        ...loadSolarObservedFixtureBaseline(),
        ...(counterexampleFileName ? loadSolarCrossLayerCounterexamplePayload(counterexampleFileName) : {}),
      },
    });

    const first = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload())
      .expect(200);
    const second = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send(buildPayload("solar-cross-layer-counterexample.event-topology-mismatch.json"))
      .expect(200);

    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_support.solar_cross_layer_consistency_v1.passed).toBe(false);
    expect(
      first.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.cross_layer_mismatch_summary.mismatch_fingerprint,
    ).toBe("cross-layer:none");
    expect(
      second.body.solar_baseline_support.solar_cross_layer_consistency_v1.cross_layer_consistency_diagnostics.cross_layer_mismatch_summary.mismatch_fingerprint,
    ).not.toBe("cross-layer:none");
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("cross_layer_consistency_changed");
    expect(second.body.solar_baseline_repeatability.drift_categories).not.toContain("reference_basis_changed");
  });

  it("changes the solar baseline signature when only the reference-pack content changes and reports reference-basis drift", async () => {
    process.env.STAR_SIM_SOURCE_FETCH_MODE = "disabled";
    const app = await buildApp();
    const payload = {
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
          metadata: {
            instrument: "NOAA/SWPC",
            coordinate_frame: "Carrington",
            carrington_rotation: 2290,
            observed_mode: "observed",
          },
        },
        solar_magnetogram: {
          synoptic_radial_map_ref: "user:solar/magnetograms/synoptic",
          active_region_patch_refs: ["user:solar/magnetograms/patch-1"],
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
          source_region_refs: ["user:solar/active-regions/noaa-13000"],
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
          source_region_refs: ["user:solar/active-regions/noaa-13000"],
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
          euv_ref: "user:solar/irradiance/euv-a",
          xray_ref: "user:solar/irradiance/xray",
          metadata: {
            instrument: "SDO/EVE+GOES",
            coordinate_frame: "Carrington",
            carrington_rotation: 2290,
            observed_mode: "observed",
          },
        },
      },
    };

    const first = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);
    const packModule = await import("../server/modules/starsim/solar-reference-pack");
    const updatedPack = packModule.getSolarReferencePack();
    updatedPack.anchors.interior.convection_zone_depth.expected_summary = {
      ...(updatedPack.anchors.interior.convection_zone_depth.expected_summary ?? {}),
      warn_range: {
        min: 0.701,
        max: 0.725,
      },
    };
    packModule.__setSolarReferencePackForTest(updatedPack);

    const second = await request(app).post("/api/star-sim/v1/resolve").send(payload).expect(200);

    expect(second.body.solar_reference_pack_version).toBe(first.body.solar_reference_pack_version);
    expect(first.body.solar_baseline_signature).not.toBe(second.body.solar_baseline_signature);
    expect(second.body.previous_solar_baseline_ref).toBeTruthy();
    expect(second.body.solar_baseline_repeatability.same_signature).toBe(false);
    expect(second.body.solar_baseline_repeatability.drift_categories).toContain("reference_basis_changed");
  });
});

describe("star-sim cache-backed heavy lanes", () => {
  it("returns async_job_required on sync path before cache exists, then serves structure_mesa from cache", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        object_id: "sun",
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
      },
      spectroscopy: {
        teff_K: 5772,
        logg_cgs: 4.438,
        metallicity_feh: 0,
      },
      structure: {
        mass_Msun: 1,
        radius_Rsun: 1,
      },
      requested_lanes: ["structure_mesa"],
      strict_lanes: true,
    };

    const uncached = await request(app).post("/api/star-sim/v1/run").send(payload).expect(200);
    expect(uncached.body.lanes[0].status).toBe("unavailable");
    expect(uncached.body.lanes[0].status_reason).toBe("async_job_required");

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    await waitForJob(app, submit.body.job_id, "completed");

    const cached = await request(app).post("/api/star-sim/v1/run").send(payload).expect(200);
    expect(cached.body.lanes[0].status).toBe("available");
    expect(cached.body.lanes[0].cache_key).toBeTruthy();
    expect(Array.isArray(cached.body.lanes[0].artifact_refs)).toBe(true);
    expect(fs.existsSync(path.resolve(cached.body.lanes[0].artifact_refs[0].path))).toBe(true);
  });

  it("keeps the heavy-lane cache key deterministic under JSON field reordering", async () => {
    const app = await buildApp();
    const payloadA = {
      target: {
        object_id: "sun",
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
      },
      spectroscopy: {
        teff_K: 5772,
        logg_cgs: 4.438,
        metallicity_feh: 0,
      },
      structure: {
        mass_Msun: 1,
        radius_Rsun: 1,
      },
      requested_lanes: ["structure_mesa"],
    };
    const payloadB = {
      requested_lanes: ["structure_mesa"],
      structure: {
        radius_Rsun: 1,
        mass_Msun: 1,
      },
      spectroscopy: {
        metallicity_feh: 0,
        logg_cgs: 4.438,
        teff_K: 5772,
      },
      target: {
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
        object_id: "sun",
      },
    };

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(payloadA).expect(202);
    await waitForJob(app, submit.body.job_id, "completed");

    const [resA, resB] = await Promise.all([
      request(app).post("/api/star-sim/v1/run").send(payloadA).expect(200),
      request(app).post("/api/star-sim/v1/run").send(payloadB).expect(200),
    ]);

    expect(resA.body.meta.deterministic_request_hash).toBe(resB.body.meta.deterministic_request_hash);
    expect(resA.body.meta.canonical_observables_hash).toBe(resB.body.meta.canonical_observables_hash);
    expect(resA.body.lanes[0].cache_key).toBe(resB.body.lanes[0].cache_key);
    expect(resA.body.lanes[0].artifact_refs).toEqual(resB.body.lanes[0].artifact_refs);
  });

  it("separates cache namespaces when the runtime mode changes", async () => {
    const payload = {
      target: {
        object_id: "sun",
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
      },
      spectroscopy: {
        teff_K: 5772,
        logg_cgs: 4.438,
        metallicity_feh: 0,
      },
      structure: {
        mass_Msun: 1,
        radius_Rsun: 1,
      },
      requested_lanes: ["structure_mesa"],
    };

    const mockApp = await buildApp();
    const job = await request(mockApp).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    await waitForJob(mockApp, job.body.job_id, "completed");
    const cachedMock = await request(mockApp).post("/api/star-sim/v1/run").send(payload).expect(200);
    const mockLane = cachedMock.body.lanes[0];

    process.env.STAR_SIM_MESA_RUNTIME = "docker";
    const dockerApp = await buildApp();
    const dockerRes = await request(dockerApp).post("/api/star-sim/v1/run").send(payload).expect(200);
    const dockerLane = dockerRes.body.lanes[0];

    expect(dockerLane.cache_key).not.toBe(mockLane.cache_key);
    expect(dockerLane.status).toBe("unavailable");
    expect(dockerLane.status_reason).toBe("solver_unconfigured");
    expect(dockerLane.cache_status).toBe("missing");
    expect(dockerLane.runtime_mode).toBe("docker");
  });

  it("changes the cache key when fit profile or fit constraints change", async () => {
    const app = await buildApp();
    const basePayload = {
      target: {
        object_id: "alpha-centauri-a",
        name: "Alpha Centauri A",
        epoch_iso: "2026-01-01T00:00:00.000Z",
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
    };

    const variantA = {
      ...basePayload,
      fit_profile_id: "solar_like_observable_fit_v1",
      fit_constraints: {
        mixing_length_alpha_max: 2.05,
      },
    };
    const variantB = {
      ...basePayload,
      fit_profile_id: "solar_like_observable_fit_v2",
      fit_constraints: {
        mixing_length_alpha_max: 1.95,
      },
    };

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(variantA).expect(202);
    await waitForJob(app, submit.body.job_id, "completed");
    const [resA, resB] = await Promise.all([
      request(app).post("/api/star-sim/v1/run").send(variantA).expect(200),
      request(app).post("/api/star-sim/v1/run").send(variantB).expect(200),
    ]);

    expect(resA.body.lanes[0].cache_key).not.toBe(resB.body.lanes[0].cache_key);
  });

  it("treats a corrupt cached artifact as a cache miss instead of valid output", async () => {
    const app = await buildApp();
    const payload = {
      target: {
        object_id: "sun",
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
      },
      spectroscopy: {
        teff_K: 5772,
        logg_cgs: 4.438,
        metallicity_feh: 0,
      },
      structure: {
        mass_Msun: 1,
        radius_Rsun: 1,
      },
      requested_lanes: ["structure_mesa"],
    };

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    await waitForJob(app, submit.body.job_id, "completed");

    const cached = await request(app).post("/api/star-sim/v1/run").send(payload).expect(200);
    const summaryRef = cached.body.lanes[0].artifact_refs.find((ref: any) => ref.kind === "mesa_summary");
    fs.writeFileSync(path.resolve(summaryRef.path), "{\n  \"corrupt\": true\n}\n", "utf8");

    const res = await request(app).post("/api/star-sim/v1/run").send(payload).expect(200);
    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("async_job_required");
    expect(res.body.lanes[0].cache_status).toBe("corrupt");
    expect(res.body.lanes[0].artifact_integrity_status).toBe("corrupt");
  });

  it("treats an expired artifact as stale and requires a new async job", async () => {
    process.env.STAR_SIM_CACHE_TTL_MS = "1";
    const app = await buildApp();
    const payload = {
      target: {
        object_id: "sun",
        name: "Sun",
        epoch_iso: "2026-01-01T00:00:00.000Z",
      },
      spectroscopy: {
        teff_K: 5772,
        logg_cgs: 4.438,
        metallicity_feh: 0,
      },
      structure: {
        mass_Msun: 1,
        radius_Rsun: 1,
      },
      requested_lanes: ["structure_mesa"],
    };

    const submit = await request(app).post("/api/star-sim/v1/jobs").send(payload).expect(202);
    await waitForJob(app, submit.body.job_id, "completed");
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await request(app).post("/api/star-sim/v1/run").send(payload).expect(200);
    expect(res.body.lanes[0].status).toBe("unavailable");
    expect(res.body.lanes[0].status_reason).toBe("async_job_required");
    expect(res.body.lanes[0].cache_status).toBe("stale");
    expect(res.body.lanes[0].artifact_integrity_status).toBe("stale");
  });
});
