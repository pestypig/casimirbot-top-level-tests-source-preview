import type {
  StellarBenchmarkDomain,
  StellarBenchmarkObservable,
  StellarCoverageMode,
} from "../../sim_core/stellar_viability";

export interface StellarBenchmarkCatalogEntry {
  benchmark_id: string;
  reference_kind: string;
  coverage_mode: StellarCoverageMode;
  wavelength_domain: StellarBenchmarkDomain;
  intended_observables: StellarBenchmarkObservable[];
  claim_boundary: string;
  notes?: string;
  quality_notes?: string;
}

const STELLAR_BENCHMARK_CATALOG: Record<string, StellarBenchmarkCatalogEntry> = {
  solar_hsrs_full: {
    benchmark_id: "solar_hsrs_full",
    reference_kind: "tsis_hybrid_reference_spectrum",
    coverage_mode: "full_spectrum",
    wavelength_domain: {
      lambda_min_m: 202e-9,
      lambda_max_m: 2730e-9,
    },
    intended_observables: ["continuum_fit", "uv_residual", "line_residual", "band_flux_closure"],
    claim_boundary: "Diagnostic solar-minimum reference spectrum for continuum, UV, and line-family benchmarking.",
    notes: "Use as a benchmark family descriptor only; this local catalog does not load the real HSRS product.",
  },
  solar_tsis_sim_tim_full: {
    benchmark_id: "solar_tsis_sim_tim_full",
    reference_kind: "tsis_sim_tim_composite",
    coverage_mode: "full_spectrum",
    wavelength_domain: {
      lambda_min_m: 200e-9,
      lambda_max_m: 2400e-9,
    },
    intended_observables: [
      "continuum_fit",
      "uv_residual",
      "line_residual",
      "band_flux_closure",
      "bolometric_closure",
    ],
    claim_boundary: "Diagnostic full-disk solar irradiance family for continuum, UV, line, and bolometric closure checks.",
    notes: "Represents the SIM-plus-TIM benchmark family, not a real ingestion adapter.",
    quality_notes: "Real TSIS benchmark products ship uncertainty estimates and quality flags; local fixtures can emulate both.",
  },
  solar_solstice_uv_200_310: {
    benchmark_id: "solar_solstice_uv_200_310",
    reference_kind: "solstice_tsis_adjusted_uv",
    coverage_mode: "band_limited",
    wavelength_domain: {
      lambda_min_m: 200e-9,
      lambda_max_m: 310e-9,
    },
    intended_observables: ["uv_residual", "band_flux_closure"],
    claim_boundary: "Diagnostic UV-band benchmark family for photospheric 200-310 nm residual and band-closure checks.",
    quality_notes: "Use quality flags conservatively; small masked intervals should gate only the invalid UV samples, not the whole family.",
  },
  solar_iag_optical_lines: {
    benchmark_id: "solar_iag_optical_lines",
    reference_kind: "iag_solar_flux_atlas",
    coverage_mode: "band_limited",
    wavelength_domain: {
      lambda_min_m: 405e-9,
      lambda_max_m: 2300e-9,
    },
    intended_observables: ["continuum_fit", "line_residual", "band_flux_closure"],
    claim_boundary: "Diagnostic optical line benchmark family for photospheric line-region comparisons.",
  },
  solar_neckel_labs_clv: {
    benchmark_id: "solar_neckel_labs_clv",
    reference_kind: "neckel_labs_continuum_clv",
    coverage_mode: "band_limited",
    wavelength_domain: {
      lambda_min_m: 303e-9,
      lambda_max_m: 1099e-9,
    },
    intended_observables: ["continuum_fit", "angular_residual"],
    claim_boundary: "Diagnostic continuum center-to-limb benchmark family for quiet-Sun angular structure checks.",
  },
};

export function getStellarBenchmarkCatalogEntry(benchmarkId: keyof typeof STELLAR_BENCHMARK_CATALOG): StellarBenchmarkCatalogEntry {
  return STELLAR_BENCHMARK_CATALOG[benchmarkId];
}

export function listCanonicalSolarBenchmarkCatalogEntries(): StellarBenchmarkCatalogEntry[] {
  return Object.values(STELLAR_BENCHMARK_CATALOG);
}
