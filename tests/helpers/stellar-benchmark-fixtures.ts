import type {
  StellarBenchmarkDomain,
  StellarBenchmarkObservable,
  StellarCoverageMode,
  StellarSpectrumObservation,
} from "../../sim_core/stellar_viability";
import { getStellarBenchmarkCatalogEntry } from "./stellar-benchmark-catalog";

export const SOLAR_LUMINOSITY_W = 3.828e26;
export const SOLAR_RADIUS_M = 6.957e8;

export interface StellarBenchmarkFixture {
  benchmark_id: string;
  reference_kind: string;
  coverage_mode: StellarCoverageMode;
  coverage_fraction: number;
  valid_domain: StellarBenchmarkDomain;
  intended_observables: StellarBenchmarkObservable[];
  wavelength_m: Float64Array;
  uncertainty?: Float64Array;
  quality_mask?: Float64Array;
  quality_label?: string;
  continuum_mask?: Float64Array;
  uv_mask?: Float64Array;
  line_mask?: Float64Array;
  mu_grid?: Float64Array;
  intensity_by_mu?: Float64Array;
  reference_flux_W_m2?: number;
}

export function makeWavelengthGrid(
  minLambda = 100e-9,
  maxLambda = 10e-6,
  count = 256,
): Float64Array {
  return Float64Array.from(
    Array.from({ length: count }, (_, index) => minLambda + ((maxLambda - minLambda) * index) / (count - 1)),
  );
}

export function makeVisibleBandGrid(): Float64Array {
  return Float64Array.from({ length: 64 }, (_, index) => 420e-9 + index * 5e-9);
}

export function makeUvHeavyBandGrid(): Float64Array {
  return Float64Array.from({ length: 56 }, (_, index) => 200e-9 + index * 2e-9);
}

export function makeLineFocusedOpticalGrid(): Float64Array {
  return Float64Array.from({ length: 96 }, (_, index) => 460e-9 + index * 2.2e-9);
}

export function makeContinuumClvGrid(): Float64Array {
  return Float64Array.from({ length: 80 }, (_, index) => 400e-9 + index * 5e-9);
}

export function makeContinuumMask(wavelengths: ArrayLike<number>): Float64Array {
  return Float64Array.from(wavelengths, (lambda) =>
    lambda >= 400e-9 &&
    lambda <= 2.5e-6 &&
    !((lambda >= 482e-9 && lambda <= 490e-9) || (lambda >= 650e-9 && lambda <= 660e-9))
      ? 1
      : 0,
  );
}

export function makeUvMask(wavelengths: ArrayLike<number>): Float64Array {
  return Float64Array.from(wavelengths, (lambda) => (lambda < 400e-9 ? 1 : 0));
}

export function makeLineMask(wavelengths: ArrayLike<number>): Float64Array {
  return Float64Array.from(wavelengths, (lambda) =>
    (lambda >= 482e-9 && lambda <= 490e-9) || (lambda >= 650e-9 && lambda <= 660e-9) ? 1 : 0,
  );
}

export function makeMuGrid(): Float64Array {
  return Float64Array.from([0.2, 0.35, 0.5, 0.7, 0.85, 1]);
}

export function makeFullSpectrumSolarLikeFixture(
  wavelength_m: Float64Array = makeWavelengthGrid(200e-9, 2400e-9, 256),
): StellarBenchmarkFixture {
  const entry = getStellarBenchmarkCatalogEntry("solar_tsis_sim_tim_full");
  return {
    benchmark_id: entry.benchmark_id,
    reference_kind: entry.reference_kind,
    coverage_mode: entry.coverage_mode,
    coverage_fraction: 1,
    valid_domain: entry.wavelength_domain,
    intended_observables: [...entry.intended_observables],
    wavelength_m,
    continuum_mask: makeContinuumMask(wavelength_m),
    uv_mask: makeUvMask(wavelength_m),
    line_mask: makeLineMask(wavelength_m),
  };
}

export function makeVisibleBandSolarLikeFixture(
  wavelength_m: Float64Array = makeVisibleBandGrid(),
): StellarBenchmarkFixture {
  const entry = getStellarBenchmarkCatalogEntry("solar_tsis_sim_tim_full");
  return {
    benchmark_id: "solar_tsis_visible_band_proxy",
    reference_kind: entry.reference_kind,
    coverage_mode: "band_limited",
    coverage_fraction: 0.38,
    valid_domain: entry.wavelength_domain,
    intended_observables: ["continuum_fit", "line_residual", "band_flux_closure"],
    wavelength_m,
    continuum_mask: makeContinuumMask(wavelength_m),
    line_mask: makeLineMask(wavelength_m),
  };
}

export function makeUvHeavySolarLikeFixture(
  wavelength_m: Float64Array = makeUvHeavyBandGrid(),
): StellarBenchmarkFixture {
  const entry = getStellarBenchmarkCatalogEntry("solar_solstice_uv_200_310");
  return {
    benchmark_id: entry.benchmark_id,
    reference_kind: entry.reference_kind,
    coverage_mode: entry.coverage_mode,
    coverage_fraction: 0.11,
    valid_domain: entry.wavelength_domain,
    intended_observables: [...entry.intended_observables],
    wavelength_m,
    uv_mask: makeUvMask(wavelength_m),
  };
}

export function makeLineFocusedOpticalSolarLikeFixture(
  wavelength_m: Float64Array = makeLineFocusedOpticalGrid(),
): StellarBenchmarkFixture {
  const entry = getStellarBenchmarkCatalogEntry("solar_iag_optical_lines");
  return {
    benchmark_id: entry.benchmark_id,
    reference_kind: entry.reference_kind,
    coverage_mode: entry.coverage_mode,
    coverage_fraction: 0.18,
    valid_domain: entry.wavelength_domain,
    intended_observables: [...entry.intended_observables],
    wavelength_m,
    continuum_mask: makeContinuumMask(wavelength_m),
    line_mask: makeLineMask(wavelength_m),
  };
}

export function makeAngularContinuumSolarLikeFixture(
  wavelength_m: Float64Array = makeContinuumClvGrid(),
  mu_grid: Float64Array = makeMuGrid(),
): StellarBenchmarkFixture {
  const entry = getStellarBenchmarkCatalogEntry("solar_neckel_labs_clv");
  return {
    benchmark_id: entry.benchmark_id,
    reference_kind: entry.reference_kind,
    coverage_mode: entry.coverage_mode,
    coverage_fraction: 0.2,
    valid_domain: entry.wavelength_domain,
    intended_observables: [...entry.intended_observables],
    wavelength_m,
    continuum_mask: makeContinuumMask(wavelength_m),
    mu_grid,
    intensity_by_mu: Float64Array.from(mu_grid, (mu) => 1 - 0.55 * (1 - mu)),
  };
}

export function makeQualityMaskedUvSolarLikeFixture(
  wavelength_m: Float64Array = makeUvHeavyBandGrid(),
): StellarBenchmarkFixture {
  const base = makeUvHeavySolarLikeFixture(wavelength_m);
  return {
    ...base,
    quality_mask: Float64Array.from(wavelength_m, (_, index) => (index >= 18 && index <= 24 ? 0 : 1)),
    quality_label: "synthetic_uv_quality_mask",
  };
}

export function makeWeightedFullSpectrumSolarLikeFixture(
  wavelength_m: Float64Array = makeWavelengthGrid(200e-9, 2400e-9, 256),
): StellarBenchmarkFixture {
  const base = makeFullSpectrumSolarLikeFixture(wavelength_m);
  return {
    ...base,
    uncertainty: Float64Array.from(wavelength_m, (lambda) => (lambda < 600e-9 ? 0.2 : 0.02)),
    quality_label: "synthetic_full_spectrum_uncertainty",
  };
}

export function makeCanonicalStellarBenchmarkFixtures(): StellarBenchmarkFixture[] {
  return [
    makeFullSpectrumSolarLikeFixture(),
    makeVisibleBandSolarLikeFixture(),
    makeUvHeavySolarLikeFixture(),
    makeLineFocusedOpticalSolarLikeFixture(),
  ];
}

export function buildBenchmarkObservation(
  fixture: StellarBenchmarkFixture,
  intensity: ArrayLike<number>,
  overrides: Partial<StellarSpectrumObservation> = {},
): StellarSpectrumObservation {
  return {
    benchmark_id: overrides.benchmark_id ?? fixture.benchmark_id,
    coverage_mode: overrides.coverage_mode ?? fixture.coverage_mode,
    reference_flux_W_m2: overrides.reference_flux_W_m2 ?? fixture.reference_flux_W_m2,
    coverage_fraction: overrides.coverage_fraction ?? fixture.coverage_fraction,
    reference_kind: overrides.reference_kind ?? fixture.reference_kind,
    valid_domain: overrides.valid_domain ?? fixture.valid_domain,
    intended_observables: overrides.intended_observables ?? fixture.intended_observables,
    uncertainty: overrides.uncertainty ?? fixture.uncertainty,
    quality_mask: overrides.quality_mask ?? fixture.quality_mask,
    quality_label: overrides.quality_label ?? fixture.quality_label,
    wavelength_m: fixture.wavelength_m,
    intensity,
    continuum_mask: overrides.continuum_mask ?? fixture.continuum_mask,
    uv_mask: overrides.uv_mask ?? fixture.uv_mask,
    line_mask: overrides.line_mask ?? fixture.line_mask,
    mu_grid: overrides.mu_grid ?? fixture.mu_grid,
    intensity_by_mu: overrides.intensity_by_mu ?? fixture.intensity_by_mu,
    anisotropy: overrides.anisotropy,
    polarization: overrides.polarization,
  };
}
