import { describe, expect, it } from "vitest";
import {
  SOLAR_KHI_MEASUREMENT_SCHEMA_VERSION,
  SOLAR_KHI_OBSERVATION_SCHEMA_VERSION,
  SOLAR_TEMPORAL_PYRAMID_V1,
  SolarKhiObservationV1Schema,
  type SolarKhiMeasurementInputV1,
} from "@shared/contracts/solar-khi-observation.v1";
import {
  compareSolarKhiReconstructions,
  measureSolarKhiBoundary,
} from "../server/services/essence/solar-khi-analysis";

const buildMeasurementInput = (
  reconstruction: "mfbd" | "speckle",
  options: { spacingPx?: number; growthRate?: number; phaseSpeedMps?: number } = {},
): SolarKhiMeasurementInputV1 => {
  const spacingPx = options.spacingPx ?? 10;
  const growthRate = options.growthRate ?? 0.03;
  const phaseSpeedMps = options.phaseSpeedMps ?? 1_200;
  const cadenceS = 2.7;
  const nativeKmPerPixel = 6;
  return {
    schema_version: SOLAR_KHI_MEASUREMENT_SCHEMA_VERSION,
    observation_id: "dkist-fastcam-ar14060",
    boundary_id: "boundary-01",
    reconstruction,
    native_km_per_pixel: nativeKmPerPixel,
    effective_resolution_km: 19,
    cadence_s: cadenceS,
    flow_speed_km_s: 3,
    minimum_dip_prominence: 0.04,
    frames: Array.from({ length: 12 }, (_, frameIndex) => {
      const time = frameIndex * cadenceS;
      const amplitude = Math.exp(growthRate * time);
      const intensity = Array.from({ length: 61 }, (_, index) => {
        const distanceToDip = Math.min(
          ...Array.from({ length: 5 }, (_unused, dipIndex) => Math.abs(index - (5 + dipIndex * spacingPx))),
        );
        return distanceToDip === 0 ? 0.55 : distanceToDip === 1 ? 0.82 : 1;
      });
      return {
        frame_index: frameIndex,
        time_offset_s: time,
        boundary_displacement_px: Array.from(
          { length: 24 },
          (_unused, sampleIndex) => amplitude * Math.sin((2 * Math.PI * sampleIndex) / 12),
        ),
        intensity_along_boundary: intensity,
        ridge_position_px: 4 + (phaseSpeedMps / (nativeKmPerPixel * 1_000)) * time,
      };
    }),
  };
};

describe("solar KHI numerical analysis", () => {
  it("recovers paper-scale wavelength, growth, phase speed, and diffusivity at native cadence", () => {
    const result = measureSolarKhiBoundary(buildMeasurementInput("mfbd"));

    expect(result.authority).toBe("deterministic_numerical_measurement");
    expect(result.coherence_kind).toBe("morphological_persistence");
    expect(result.wavelength_m).toBeCloseTo(60_000, 6);
    expect(result.growth_rate_s_inv).toBeCloseTo(0.03, 8);
    expect(result.e_folding_time_s).toBeCloseTo(33.333333, 5);
    expect(result.frames_per_e_folding).toBeGreaterThan(12);
    expect(result.phase_speed_m_s).toBeCloseTo(1_200, 6);
    expect(result.turbulent_diffusivity_m2_s).toBeCloseTo(60_000_000, 3);
    expect(result.range_checks).toEqual({
      wavelength_published_range: true,
      growth_rate_published_range: true,
      phase_speed_published_range: true,
    });
    expect(result.quality.native_resolution_preserved).toBe(true);
  });

  it("requires agreement across independently reconstructed products", () => {
    const mfbd = measureSolarKhiBoundary(buildMeasurementInput("mfbd"));
    const speckle = measureSolarKhiBoundary(
      buildMeasurementInput("speckle", { growthRate: 0.032, phaseSpeedMps: 1_260 }),
    );

    const agreement = compareSolarKhiReconstructions(mfbd, speckle);
    expect(agreement.matched).toBe(true);
    expect(agreement.claim_tier).toBe("diagnostic");
  });

  it("rejects non-growing textures instead of calling them KHI", () => {
    const input = buildMeasurementInput("mfbd");
    input.frames = input.frames.map((frame, index) => ({
      ...frame,
      boundary_displacement_px: frame.boundary_displacement_px.map((value) => value * Math.exp(-0.1 * index)),
    }));
    expect(() => measureSolarKhiBoundary(input)).toThrow("solar_khi_non_growing_boundary_mode");
  });
});

describe("solar KHI observation contract", () => {
  const baseObservation = {
    schema_version: SOLAR_KHI_OBSERVATION_SCHEMA_VERSION,
    observation_id: "dkist-fastcam-ar14060",
    observation_time: "2025-02-01T00:00:00.000Z",
    instrument: "DKIST_FastCam",
    detector: "FastCam diagnostic",
    noaa_active_region_id: "14060",
    passband: { center_nm: 416, fwhm_nm: 0.5 },
    sampling: { reconstructed_cadence_s: 2.7, native_km_per_pixel: 6, effective_resolution_km: 19 },
    native_field_of_view: { width_km: 5_800, height_km: 4_350 },
    coordinates: {
      helioprojective_center_arcsec: { x: -162, y: 168 },
      footprint_polygon_arcsec: [{ x: -166, y: 165 }, { x: -158, y: 165 }, { x: -158, y: 171 }],
      heliographic_stonyhurst_deg: { longitude: -9, latitude: 10 },
      carrington_deg: { longitude: 121, latitude: 10 },
      mu: 0.97,
      observer_metadata: { observatory: "DKIST" },
      wcs_artifact_ref: "artifact://wcs",
    },
    registrations: [{
      source_frame: "DKIST_FastCam",
      target_frame: "SDO_HMI",
      transform_kind: "cross_correlation",
      matrix_3x3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      residual_rms_arcsec: 0.03,
      covariance_2x2_arcsec2: [0.001, 0, 0, 0.001],
      artifact_ref: "artifact://registration",
    }],
    reconstruction_products: ["mfbd", "speckle"].map((kind) => ({
      kind,
      frame_artifact_refs: [`artifact://${kind}/frame-0`],
      native_width_px: 967,
      native_height_px: 725,
      frame_count: 67,
      content_hash: `sha256:${"a".repeat(64)}`,
      reconstruction_method: kind,
    })),
    psf_artifact_ref: "artifact://psf",
    quality_report_ref: "artifact://quality",
    parent_context_image_refs: ["artifact://vbi", "artifact://hmi"],
    boundary_track_artifact_refs: [],
    vortex_tracks: [],
    radiometric_interpretation: "forward_model_required",
    energy_calibration: "not_applicable_aia_193",
    numerical_measurement_authority: true,
    provenance: {
      source_archive: "https://dkist.virtualsolar.org/vanNoortfastcam/",
      source_literature_doi: "10.1038/s41586-026-10871-3",
      ingest_tool: "tools/dkist_fastcam_ingest.py",
      ingest_version: "1.0.0",
    },
  };

  it("requires both reconstructions and the photospheric forward-model boundary", () => {
    expect(SolarKhiObservationV1Schema.safeParse(baseObservation).success).toBe(true);
    const invalid = {
      ...baseObservation,
      reconstruction_products: baseObservation.reconstruction_products.slice(0, 1),
      energy_calibration: "aia-193-v1",
    };
    expect(SolarKhiObservationV1Schema.safeParse(invalid).success).toBe(false);
  });

  it("keeps FastCam growth separate from the 300-second p-mode lane", () => {
    const fastcam = SOLAR_TEMPORAL_PYRAMID_V1.lanes.find((lane) => lane.id === "fastcam_khi");
    const pMode = SOLAR_TEMPORAL_PYRAMID_V1.lanes.find((lane) => lane.id === "p_mode");
    expect(SOLAR_TEMPORAL_PYRAMID_V1.master_cadence_forbidden).toBe(true);
    expect(SOLAR_TEMPORAL_PYRAMID_V1.exchange_policy).toBe("summaries_and_causal_state_variables_only");
    expect(fastcam?.native_cadence_s).toBe(2.7);
    expect(fastcam?.window_s?.max).toBeLessThan(pMode?.window_s?.min ?? 0);
  });
});
