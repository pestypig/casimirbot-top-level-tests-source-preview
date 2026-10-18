import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StarSimRouteModule = typeof import("../server/routes/star-sim");

let artifactRoot = "";
let sourceServer: Server | null = null;
let sourceBaseUrl = "";

const buildApp = async () => {
  vi.resetModules();
  const routeModule: StarSimRouteModule = await import("../server/routes/star-sim");
  const app = express();
  app.use(express.json());
  app.use("/api/star-sim", routeModule.starSimRouter);
  return app;
};

const startSourceServer = async () => {
  const app = express();
  app.get("/gaia", async (req, res) => {
    const sourceId = String(req.query.gaia_dr3_source_id ?? "");
    const name = String(req.query.name ?? "");
    if (sourceId === "timeout" || name.toLowerCase() === "timeout demo") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return res.json({
        record_id: "gaia-timeout",
      });
    }
    if (sourceId === "123456789012345678") {
      return res.json({
        record_id: "gaia-live-demo-solar-a",
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
        },
        aliases: ["demo solar a", "demo-a"],
        quality_flags: ["astrometry_clean", "photometry_complete", "live_mock"],
        quality_score: 97,
        target: {
          object_id: "123456789012345678",
          name: "Demo Solar A",
          spectral_type: "G2",
          luminosity_class: "V",
          epoch_iso: "2016-01-01T00:00:00.000Z",
        },
        astrometry: {
          parallax_mas: 59.21,
          proper_motion_ra_masyr: -45.09,
          proper_motion_dec_masyr: 83.41,
          radial_velocity_kms: -11.18,
          uncertainties: {
            parallax_mas: 0.02,
            proper_motion_ra_masyr: 0.03,
            proper_motion_dec_masyr: 0.03,
            radial_velocity_kms: 0.1,
          },
        },
        photometry: {
          bands: {
            G: 5.12,
            BP: 5.48,
            RP: 4.74,
          },
        },
      });
    }
    if (sourceId === "987654321098765432") {
      return res.json({
        record_id: "gaia-live-demo-solar-b",
        identifiers: {
          gaia_dr3_source_id: "987654321098765432",
        },
        aliases: ["demo solar b", "demo-b"],
        quality_flags: ["astrometry_clean", "live_mock"],
        quality_score: 94,
        target: {
          object_id: "987654321098765432",
          name: "Demo Solar B",
          spectral_type: "G3",
          luminosity_class: "V",
          epoch_iso: "2016-01-01T00:00:00.000Z",
        },
        astrometry: {
          parallax_mas: 61.7,
          proper_motion_ra_masyr: -12.4,
          proper_motion_dec_masyr: 71.2,
          radial_velocity_kms: -3.5,
        },
        photometry: {
          bands: {
            G: 5.84,
            BP: 6.15,
            RP: 5.47,
          },
        },
      });
    }
    if (sourceId === "112233445566778899") {
      return res.json({
        record_id: "gaia-live-demo-solar-c",
        identifiers: {
          gaia_dr3_source_id: "112233445566778899",
          tess_tic_id: "100000003",
        },
        aliases: ["demo solar c", "demo-c"],
        quality_flags: ["astrometry_clean", "live_mock"],
        quality_score: 93,
        target: {
          object_id: "112233445566778899",
          name: "Demo Solar C",
          spectral_type: "G1",
          luminosity_class: "V",
          epoch_iso: "2016-01-01T00:00:00.000Z",
        },
        astrometry: {
          parallax_mas: 57.92,
          proper_motion_ra_masyr: -34.18,
          proper_motion_dec_masyr: 65.65,
          radial_velocity_kms: -8.35,
        },
        photometry: {
          bands: {
            G: 5.44,
            BP: 5.78,
            RP: 5.09,
          },
        },
      });
    }
    return res.status(404).json({
      error: "not_found",
    });
  });

  app.get("/astra", (req, res) => {
    const sourceId = String(req.query.gaia_dr3_source_id ?? "");
    if (sourceId === "123456789012345678") {
      return res.json({
        record_id: "astra-live-demo-solar-a",
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
          sdss_apogee_id: "2M00000000+0000000",
        },
        aliases: ["demo solar a", "demo-a"],
        quality_flags: ["astra_primary_pipeline", "snr_high", "live_mock"],
        quality_score: 91,
        target: {
          name: "Demo Solar A",
          spectral_type: "G2",
          luminosity_class: "V",
        },
        spectroscopy: {
          teff_K: 5823,
          logg_cgs: 4.43,
          metallicity_feh: 0.04,
          vsini_kms: 2.0,
          spectrum_ref: "sdss-astra://astra-live-demo-solar-a",
          abundances: {
            Fe: 0.04,
            Mg: 0.03,
          },
          uncertainties: {
            teff_K: 16,
            logg_cgs: 0.03,
            metallicity_feh: 0.02,
            vsini_kms: 0.3,
          },
        },
        raw_payload: {
          catalog: "sdss_astra",
          pipeline: "astra_mwm_live",
        },
      });
    }
    if (sourceId === "112233445566778899") {
      return res.json({
        record_id: "astra-live-demo-solar-c",
        identifiers: {
          gaia_dr3_source_id: "112233445566778899",
          sdss_apogee_id: "2M00000000+0000003",
          tess_tic_id: "100000003",
        },
        aliases: ["demo solar c", "demo-c"],
        quality_flags: ["astra_primary_pipeline", "snr_high", "live_mock"],
        quality_score: 88,
        target: {
          name: "Demo Solar C",
          spectral_type: "G1",
          luminosity_class: "V",
        },
        spectroscopy: {
          teff_K: 5895,
          logg_cgs: 4.4,
          metallicity_feh: 0.01,
          vsini_kms: 2.4,
          spectrum_ref: "sdss-astra://astra-live-demo-solar-c",
          uncertainties: {
            teff_K: 18,
            logg_cgs: 0.03,
            metallicity_feh: 0.02,
            vsini_kms: 0.3,
          },
        },
        raw_payload: {
          catalog: "sdss_astra",
          pipeline: "astra_mwm_live",
        },
      });
    }
    return res.status(404).json({
      error: "not_found",
    });
  });

  app.get("/lamost", (req, res) => {
    const sourceId = String(req.query.gaia_dr3_source_id ?? "");
    if (sourceId === "987654321098765432") {
      return res.json({
        record_id: "lamost-live-demo-solar-b",
        identifiers: {
          gaia_dr3_source_id: "987654321098765432",
          lamost_obsid: "LAMOST-B-0002",
        },
        aliases: ["demo solar b", "demo-b"],
        quality_flags: ["lamost_fallback", "live_mock"],
        quality_score: 68,
        target: {
          name: "Demo Solar B",
          spectral_type: "G3",
          luminosity_class: "V",
        },
        spectroscopy: {
          teff_K: 5711,
          logg_cgs: 4.35,
          metallicity_feh: -0.01,
          vsini_kms: 2.6,
          spectrum_ref: "lamost-dr10://lamost-live-demo-solar-b",
          uncertainties: {
            teff_K: 42,
            logg_cgs: 0.07,
            metallicity_feh: 0.05,
            vsini_kms: 0.6,
          },
        },
        raw_payload: {
          catalog: "lamost_dr10",
          pipeline: "lamost_live",
        },
      });
    }
    return res.status(404).json({
      error: "not_found",
    });
  });

  app.get("/tess", (req, res) => {
    const sourceId = String(req.query.gaia_dr3_source_id ?? "");
    if (sourceId === "123456789012345678") {
      return res.json({
        record_id: "tess-live-demo-solar-a",
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
          tess_tic_id: "100000001",
          mast_obs_id: "MAST-A-0001",
        },
        aliases: ["demo solar a", "demo-a"],
        quality_flags: ["tess_summary_available", "live_mock"],
        quality_score: 71,
        photometry: {
          time_series_ref: "mast://demo-solar-a/lightcurve",
        },
        asteroseismology: {
          numax_uHz: 3079.5,
          deltanu_uHz: 134.1,
          uncertainties: {
            numax_uHz: 22.0,
            deltanu_uHz: 0.8,
          },
        },
        raw_payload: {
          catalog: "tess_mast",
          pipeline: "tess-summary-live",
        },
      });
    }
    if (sourceId === "112233445566778899") {
      return res.json({
        record_id: "tess-live-demo-solar-c",
        identifiers: {
          gaia_dr3_source_id: "112233445566778899",
          tess_tic_id: "100000003",
          mast_obs_id: "MAST-C-0003",
        },
        aliases: ["demo solar c", "demo-c"],
        quality_flags: ["tess_summary_available", "live_mock"],
        quality_score: 74,
        photometry: {
          time_series_ref: "mast://demo-solar-c/lightcurve",
        },
        asteroseismology: {
          numax_uHz: 2962.4,
          deltanu_uHz: 131.7,
          uncertainties: {
            numax_uHz: 18.0,
            deltanu_uHz: 0.6,
          },
        },
        raw_payload: {
          catalog: "tess_mast",
          pipeline: "tess-summary-live",
        },
      });
    }
    return res.status(404).json({
      error: "not_found",
    });
  });

  app.get("/tasoc", (req, res) => {
    const sourceId = String(req.query.gaia_dr3_source_id ?? "");
    if (sourceId === "123456789012345678") {
      return res.json({
        record_id: "tasoc-live-demo-solar-a",
        identifiers: {
          gaia_dr3_source_id: "123456789012345678",
          tess_tic_id: "100000001",
          tasoc_target_id: "TASOC-A-0001",
        },
        aliases: ["demo solar a", "demo-a"],
        quality_flags: ["tasoc_summary_primary", "seismic_qc_pass", "live_mock"],
        quality_score: 93,
        photometry: {
          time_series_ref: "tasoc://demo-solar-a/lightcurve",
        },
        asteroseismology: {
          numax_uHz: 3084.9,
          deltanu_uHz: 134.6,
          mode_frequencies_uHz: [2864.9, 2997.5, 3129.8],
          uncertainties: {
            numax_uHz: 11.0,
            deltanu_uHz: 0.4,
          },
        },
        raw_payload: {
          catalog: "tasoc",
          pipeline: "tasoc-summary-live",
        },
      });
    }
    return res.status(404).json({
      error: "not_found",
    });
  });

  await new Promise<void>((resolve) => {
    sourceServer = app.listen(0, () => {
      const address = sourceServer?.address();
      if (address && typeof address === "object") {
        sourceBaseUrl = `http://127.0.0.1:${address.port}`;
      }
      resolve();
    });
  });
};

beforeEach(async () => {
  artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "starsim-live-sources-"));
  process.env.STAR_SIM_ARTIFACT_ROOT = artifactRoot;
  process.env.STAR_SIM_SOURCE_FETCH_MODE = "live";
  process.env.STAR_SIM_GAIA_DR3_MODE = "live";
  process.env.STAR_SIM_SDSS_ASTRA_MODE = "live";
  process.env.STAR_SIM_LAMOST_DR10_MODE = "live";
  process.env.STAR_SIM_TESS_MAST_MODE = "live";
  process.env.STAR_SIM_TASOC_MODE = "live";
  process.env.STAR_SIM_SOURCE_TIMEOUT_MS = "50";
  process.env.STAR_SIM_SOURCE_USER_AGENT = "starsim-live-source-test/1";
  await startSourceServer();
  process.env.STAR_SIM_GAIA_DR3_ENDPOINT = `${sourceBaseUrl}/gaia`;
  process.env.STAR_SIM_SDSS_ASTRA_ENDPOINT = `${sourceBaseUrl}/astra`;
  process.env.STAR_SIM_LAMOST_DR10_ENDPOINT = `${sourceBaseUrl}/lamost`;
  process.env.STAR_SIM_TESS_MAST_ENDPOINT = `${sourceBaseUrl}/tess`;
  process.env.STAR_SIM_TASOC_ENDPOINT = `${sourceBaseUrl}/tasoc`;
});

afterEach(async () => {
  delete process.env.STAR_SIM_ARTIFACT_ROOT;
  delete process.env.STAR_SIM_SOURCE_FETCH_MODE;
  delete process.env.STAR_SIM_GAIA_DR3_MODE;
  delete process.env.STAR_SIM_SDSS_ASTRA_MODE;
  delete process.env.STAR_SIM_LAMOST_DR10_MODE;
  delete process.env.STAR_SIM_TESS_MAST_MODE;
  delete process.env.STAR_SIM_TASOC_MODE;
  delete process.env.STAR_SIM_GAIA_DR3_ENDPOINT;
  delete process.env.STAR_SIM_SDSS_ASTRA_ENDPOINT;
  delete process.env.STAR_SIM_LAMOST_DR10_ENDPOINT;
  delete process.env.STAR_SIM_TESS_MAST_ENDPOINT;
  delete process.env.STAR_SIM_TASOC_ENDPOINT;
  delete process.env.STAR_SIM_SOURCE_TIMEOUT_MS;
  delete process.env.STAR_SIM_SOURCE_USER_AGENT;
  await new Promise<void>((resolve) => {
    if (sourceServer) {
      sourceServer.close(() => resolve());
    } else {
      resolve();
    }
  });
  sourceServer = null;
  sourceBaseUrl = "";
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("star-sim live source resolution", () => {
  it("resolves live Gaia + Astra data into a structure-ready canonical draft", async () => {
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

    expect(res.body.source_resolution.status).toBe("resolved");
    expect(res.body.source_resolution.fetch_mode).toBe("live");
    expect(res.body.source_resolution.fetch_modes_by_catalog.gaia_dr3).toBe("live");
    expect(res.body.structure_mesa_ready).toBe(true);
    expect(res.body.canonical_request_draft.astrometry.parallax_mas).toBe(59.21);
    expect(res.body.canonical_request_draft.spectroscopy.teff_K).toBe(5823);
    expect(res.body.source_resolution.selection_manifest.fields["spectroscopy.teff_K"].selected_from).toBe("sdss_astra");
    expect(res.body.source_resolution.selection_manifest.fields["spectroscopy.teff_K"].chosen.fetch_mode).toBe("live");
    expect(res.body.source_resolution.selection_manifest.fields["astrometry.parallax_mas"].chosen.query_metadata.endpoint)
      .toContain("/gaia");
  });

  it("falls back to live LAMOST spectroscopy when Astra is absent", async () => {
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
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("resolved");
    expect(res.body.canonical_request_draft.spectroscopy.teff_K).toBe(5711);
    expect(res.body.canonical_request_draft.spectroscopy.field_sources.teff_K).toBe("lamost_dr10");
    expect(res.body.source_resolution.selection_manifest.fields["spectroscopy.teff_K"].reason).toBe("only_available_candidate");
  });

  it("prefers live TASOC seismic summaries and marks oscillation readiness when available", async () => {
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
    expect(res.body.oscillation_gyre_ready).toBe(true);
    expect(res.body.canonical_request_draft.asteroseismology.numax_uHz).toBe(3084.9);
    expect(res.body.source_resolution.selection_manifest.fields["asteroseismology.numax_uHz"].selected_from).toBe("tasoc");
    expect(res.body.source_resolution.selection_manifest.fields["asteroseismology.numax_uHz"].candidates.map((candidate: any) => candidate.selected_from))
      .toEqual(["tasoc", "tess_mast"]);
  });

  it("uses live TESS/MAST seismic summaries when TASOC is absent", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Demo Solar C",
        },
        identifiers: {
          gaia_dr3_source_id: "112233445566778899",
        },
        requested_lanes: ["structure_mesa", "oscillation_gyre"],
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("resolved");
    expect(res.body.oscillation_gyre_ready).toBe(true);
    expect(res.body.canonical_request_draft.asteroseismology.numax_uHz).toBe(2962.4);
    expect(res.body.canonical_request_draft.asteroseismology.field_sources.numax_uHz).toBe("tess_mast");
  });

  it("returns a partial live resolution when seismic summaries are unavailable for oscillation requests", async () => {
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

  it("surfaces live source timeout failures honestly", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/star-sim/v1/resolve")
      .send({
        target: {
          name: "Timeout Demo",
        },
      })
      .expect(200);

    expect(res.body.source_resolution.status).toBe("unresolved");
    expect(res.body.source_resolution.reasons).toContain("source_timeout");
    expect(res.body.source_resolution.notes.some((note: string) => note.includes("Gaia DR3"))).toBe(true);
  });

  it("keeps user overrides winning by default in live mode", async () => {
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
        spectroscopy: {
          teff_K: 5901,
        },
      })
      .expect(200);

    expect(res.body.canonical_request_draft.spectroscopy.teff_K).toBe(5901);
    expect(res.body.source_resolution.selection_manifest.fields["spectroscopy.teff_K"].selected_from).toBe("user_override");
  });

  it("keeps user overrides winning by default for live seismic summaries", async () => {
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
        asteroseismology: {
          numax_uHz: 3200,
        },
      })
      .expect(200);

    expect(res.body.canonical_request_draft.asteroseismology.numax_uHz).toBe(3200);
    expect(res.body.source_resolution.selection_manifest.fields["asteroseismology.numax_uHz"].selected_from).toBe("user_override");
  });
});
