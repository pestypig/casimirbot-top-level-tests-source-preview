import { prepareSolarResearchExport } from "../../shared/solar-research-export";
import { prepareSolarResearchEvidencePackage } from "../../shared/solar-research-evidence-package";
import { createHash } from "node:crypto";
import { createSolarEventImageSelection } from "../../shared/solar-event-image-selection";

/** Synthetic storage input; no retained user data, downloaded files or scientific authority. */
export async function syntheticSolarPortablePackage(withArchive = false, withSelectedEvent = false) {
  const source = (id: string, digit: string) => ({
    id, sha256: digit.repeat(64), kind: "fixture", provenance: "declared_source_identity",
  });
  const bundle = await prepareSolarResearchExport({
    schemaVersion: "solar-primary-comparison-record/1", createdAt: "2026-09-27T00:00:00Z",
    operator: "g1-bison13-sound-speed-primary-operator/1", operatorSha256: "c".repeat(64),
    observation: source("synthetic-storage-observation", "a"),
    kernels: source("synthetic-storage-kernels", "b"), modelDifference: null,
    fixtureOnly: true, quantity: "delta_c_squared_over_bp04_c_squared", units: "dimensionless",
    referenceRadiusM: 695980000, coordinate: "r_over_historical_bp04_radius",
    fullKernelSupport: [0.01, 1], uncertainty: "quoted_solution_error_only_no_covariance_or_systematics",
    residualConvention: "observed_minus_primary_term", crossTermIncluded: false,
    referenceProfileBound: false, admissionAllowed: false, scienceRunAllowed: false,
    rows: [{ authorRow: 1, secondQuartileRadius: 0.1, observed: 0.02,
      quotedSolutionError: 0.001, primaryPrediction: null, residual: null }],
  });
  const pixels = Buffer.alloc(32 * 32 * 4);
  const archive = withArchive ? {
    instrument: "AIA", wavelength_A: 193,
    meta: { observed_mode: "observed", fetched_at_utc: "2026-09-27T00:00:00Z" },
    frames: [{ grid_size: 32, map_b64: pixels.toString("base64"),
      obstime: "2026-09-27T00:00:00Z", coordinate_frame: "native_instrument_pixel_grid",
      fits_sha256: "d".repeat(64), display_sha256: createHash("sha256").update(pixels).digest("hex") }],
    ...(withSelectedEvent ? { selected_event_context: createSolarEventImageSelection({
      id: 'ivo://helio-informatics.org/AR_fixture', event_type: 'AR',
      start_time: '2026-09-26T23:59:00Z', end_time: '2026-09-27T00:01:00Z',
      frm_name: 'fixture method',
    }, 0, 1) } : {}),
  } : undefined;
  return (await prepareSolarResearchEvidencePackage(bundle, archive)).packageJson;
}
