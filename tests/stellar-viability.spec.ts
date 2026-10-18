import { describe, expect, it } from "vitest";

import {
  computeEffectiveTemperature,
  evaluateStellarSpectralViability,
} from "../sim_core/stellar_viability";
import {
  SOLAR_LUMINOSITY_W,
  SOLAR_RADIUS_M,
  type StellarBenchmarkFixture,
  buildBenchmarkObservation,
  makeAngularContinuumSolarLikeFixture,
  makeCanonicalStellarBenchmarkFixtures,
  makeContinuumMask,
  makeFullSpectrumSolarLikeFixture,
  makeLineMask,
  makeMuGrid,
  makeQualityMaskedUvSolarLikeFixture,
  makeUvMask,
  makeVisibleBandSolarLikeFixture,
  makeWavelengthGrid,
  makeWeightedFullSpectrumSolarLikeFixture,
} from "./helpers/stellar-benchmark-fixtures";

function nearestIndex(wavelengths: ArrayLike<number>, target: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < wavelengths.length; index += 1) {
    const distance = Math.abs(Number(wavelengths[index]) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function fixtureObservablesActive(fixture: StellarBenchmarkFixture) {
  const qualityMask = fixture.quality_mask ? Array.from(fixture.quality_mask, Boolean) : null;
  const effective = (mask?: Float64Array) =>
    mask
      ? Array.from(mask, (value, index) => Boolean(value) && (qualityMask ? qualityMask[index] : true))
      : [];
  return {
    continuum: effective(fixture.continuum_mask).some(Boolean),
    uv: effective(fixture.uv_mask).some(Boolean),
    line: effective(fixture.line_mask).some(Boolean),
    angular: Boolean(fixture.mu_grid && fixture.intensity_by_mu),
    polarization: false,
  };
}

function expectBenchmarkSummary(
  benchmark: {
    id: string | null;
    coverage_mode: "full_spectrum" | "band_limited";
    wavelength_min_m: number;
    wavelength_max_m: number;
    coverage_fraction: number | null;
    reference_kind: string | null;
    valid_domain: { lambda_min_m: number; lambda_max_m: number } | null;
    intended_observables: string[];
    quality_mask_used: boolean;
    uncertainty_used: boolean;
    valid_sample_fraction: number | null;
    quality_label: string | null;
  },
  fixture: StellarBenchmarkFixture,
) {
  const validSampleFraction = fixture.quality_mask
    ? Array.from(fixture.quality_mask, Boolean).filter(Boolean).length / fixture.quality_mask.length
    : null;
  expect(benchmark).toEqual({
    id: fixture.benchmark_id,
    coverage_mode: fixture.coverage_mode,
    wavelength_min_m: fixture.wavelength_m[0],
    wavelength_max_m: fixture.wavelength_m[fixture.wavelength_m.length - 1],
    coverage_fraction: fixture.coverage_fraction,
    reference_kind: fixture.reference_kind,
    valid_domain: fixture.valid_domain,
    intended_observables: fixture.intended_observables,
    quality_mask_used: Boolean(fixture.quality_mask),
    uncertainty_used: Boolean(fixture.uncertainty),
    valid_sample_fraction: validSampleFraction,
    quality_label: fixture.quality_label ?? null,
  });
}

function activeObservableNames(observablesActive: {
  continuum: boolean;
  uv: boolean;
  line: boolean;
  angular: boolean;
  polarization: boolean;
}): string[] {
  const names: string[] = [];
  if (observablesActive.continuum) names.push("continuum_fit");
  if (observablesActive.uv) names.push("uv_residual");
  if (observablesActive.line) names.push("line_residual");
  if (observablesActive.angular) names.push("angular_residual");
  if (observablesActive.polarization) names.push("polarization_penalty");
  return names;
}

describe("stellar viability contract", () => {
  it("recovers the solar blackbody-equivalent effective temperature from luminosity and radius", () => {
    const teff = computeEffectiveTemperature(SOLAR_LUMINOSITY_W, SOLAR_RADIUS_M);
    expect(teff).toBeCloseTo(5772, 0);
  });

  it("keeps the blackbody-plus-transfer null model as the winner for a blackbody-like spectrum", () => {
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const nullModel = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(nullModel).toBeDefined();
    const fixture = makeFullSpectrumSolarLikeFixture(seed.wavelength_m);

    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, nullModel?.predicted_intensity ?? new Float64Array(), {
        reference_flux_W_m2: nullModel?.bolometric_flux_W_m2,
      }),
      structure: {
        xi: 0.4,
        alpha_xi: 0.25,
        d_eff: 1e-12,
        A_ml: 0.01,
        Q_coh: 4,
      },
    });

    expect(report.winner).toBe("M0_planck_atmosphere");
    expect(
      report.models.find((entry) => entry.id === "M0_planck_atmosphere")?.metrics.continuum_rms,
    ).toBeLessThan(1e-12);
    expect(report.models.find((entry) => entry.id === "M0_planck_atmosphere")?.metrics.status.uv_residual).toBe("computed");
    expect(report.models.find((entry) => entry.id === "M0_planck_atmosphere")?.metrics.status.bolometric_closure).toBe("computed");
    expect(report.observables_active).toEqual({
      continuum: true,
      uv: true,
      line: true,
      angular: false,
      polarization: false,
    });
    expect(report.benchmark.coverage_mode).toBe("full_spectrum");
    expect(report.benchmark.id).toBe("solar_tsis_sim_tim_full");
    expect(report.benchmark.coverage_fraction).toBe(1);
    expect(report.benchmark.reference_kind).toBe("tsis_sim_tim_composite");
    expect(report.benchmark.valid_domain).toEqual({
      lambda_min_m: 200e-9,
      lambda_max_m: 2400e-9,
    });
    expect(report.benchmark.intended_observables).toEqual([
      "continuum_fit",
      "uv_residual",
      "line_residual",
      "band_flux_closure",
      "bolometric_closure",
    ]);
    expect(report.benchmark.quality_mask_used).toBe(false);
    expect(report.benchmark.uncertainty_used).toBe(false);
    expect(report.benchmark.valid_sample_fraction).toBeNull();
    expect(report.benchmark.quality_label).toBeNull();
  });

  it("keeps default M0 behavior unchanged when no atmosphere hardening inputs are supplied", () => {
    const baseline = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const explicitDefault = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        source_function_mode: "lte",
      },
    });

    const baselineM0 = baseline.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const explicitDefaultM0 = explicitDefault.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(baselineM0).toBeDefined();
    expect(explicitDefaultM0).toBeDefined();

    expect(Array.from(explicitDefaultM0?.predicted_intensity ?? [])).toEqual(
      Array.from(baselineM0?.predicted_intensity ?? []),
    );
  });

  it("applies continuum opacity directly in the null model and reshapes the M0 spectrum", () => {
    const baseline = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const hardened = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        continuum_opacity: Float64Array.from(baseline.wavelength_m, (_, index) =>
          index < baseline.wavelength_m.length / 2 ? 0.1 : 2.0,
        ),
      },
    });

    const baselineM0 = baseline.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const hardenedM0 = hardened.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(baselineM0).toBeDefined();
    expect(hardenedM0).toBeDefined();
    const lowIndex = 16;
    const highIndex = baseline.wavelength_m.length - 16;
    const lowRatio =
      (hardenedM0?.predicted_intensity[lowIndex] ?? 0) / Math.max(baselineM0?.predicted_intensity[lowIndex] ?? 0, 1e-30);
    const highRatio =
      (hardenedM0?.predicted_intensity[highIndex] ?? 0) /
      Math.max(baselineM0?.predicted_intensity[highIndex] ?? 0, 1e-30);
    expect(lowRatio).toBeCloseTo(1 / 1.1, 12);
    expect(highRatio).toBeCloseTo(1 / 3, 12);
    expect(highRatio).toBeLessThan(lowRatio);
  });

  it("applies line opacity and source contrast only within the null-model line regions", () => {
    const baseline = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const hardened = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        line_opacity: 1.5,
        line_source_contrast: -0.2,
      },
    });

    const baselineM0 = baseline.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const hardenedM0 = hardened.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(baselineM0).toBeDefined();
    expect(hardenedM0).toBeDefined();

    const continuumIndex = nearestIndex(baseline.wavelength_m, 550e-9);
    const lineIndex = nearestIndex(baseline.wavelength_m, 656.3e-9);
    const continuumRatio =
      (hardenedM0?.predicted_intensity[continuumIndex] ?? 0) /
      Math.max(baselineM0?.predicted_intensity[continuumIndex] ?? 0, 1e-30);
    const lineRatio =
      (hardenedM0?.predicted_intensity[lineIndex] ?? 0) / Math.max(baselineM0?.predicted_intensity[lineIndex] ?? 0, 1e-30);

    expect(Math.abs(continuumRatio - 1)).toBeLessThan(1e-4);
    expect(lineRatio).toBeLessThan(0.5);
  });

  it("changes M0 deterministically when nlte_proxy source mode is enabled", () => {
    const baseline = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const nlteProxy = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        source_function_mode: "nlte_proxy",
        nlte_departure: 0.2,
      },
    });

    const baselineM0 = baseline.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const nlteM0 = nlteProxy.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(baselineM0).toBeDefined();
    expect(nlteM0).toBeDefined();
    const uvRatio = (nlteM0?.predicted_intensity[0] ?? 0) / Math.max(baselineM0?.predicted_intensity[0] ?? 0, 1e-30);
    const visibleRatio =
      (nlteM0?.predicted_intensity[128] ?? 0) / Math.max(baselineM0?.predicted_intensity[128] ?? 0, 1e-30);
    expect(uvRatio).toBeGreaterThan(visibleRatio);
    expect(uvRatio).toBeGreaterThan(1.18);
    expect(visibleRatio).toBeGreaterThan(1.08);
  });

  it("reduces line-region residuals when null-model line controls match the observation", () => {
    const hardenedSeed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        line_opacity: 1.2,
        line_source_contrast: -0.15,
      },
    });
    const hardenedM0 = hardenedSeed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(hardenedM0).toBeDefined();
    const fixture = makeFullSpectrumSolarLikeFixture(hardenedSeed.wavelength_m);

    const baselineFit = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, hardenedM0?.predicted_intensity ?? new Float64Array(), {
        reference_flux_W_m2: hardenedM0?.bolometric_flux_W_m2,
      }),
    });
    const hardenedFit = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, hardenedM0?.predicted_intensity ?? new Float64Array(), {
        reference_flux_W_m2: hardenedM0?.bolometric_flux_W_m2,
      }),
      atmosphere: {
        line_opacity: 1.2,
        line_source_contrast: -0.15,
      },
    });

    const baselineM0 = baselineFit.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const matchedM0 = hardenedFit.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(baselineM0?.metrics.line_residual).toBeGreaterThan(0);
    expect(matchedM0?.metrics.line_residual).toBeLessThan(1e-12);
    expect((baselineM0?.metrics.line_residual ?? 0)).toBeGreaterThan(matchedM0?.metrics.line_residual ?? 0);
  });

  it("keeps M0 as the promoted winner across the canonical local benchmark suite", () => {
    for (const fixture of makeCanonicalStellarBenchmarkFixtures()) {
      const seed = evaluateStellarSpectralViability({
        luminosity_W: SOLAR_LUMINOSITY_W,
        radius_m: SOLAR_RADIUS_M,
        observation: buildBenchmarkObservation(
          fixture,
          Float64Array.from({ length: fixture.wavelength_m.length }, () => 1),
        ),
      });
      const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
      expect(m0Seed, fixture.benchmark_id).toBeDefined();

      const report = evaluateStellarSpectralViability({
        luminosity_W: SOLAR_LUMINOSITY_W,
        radius_m: SOLAR_RADIUS_M,
        observation: buildBenchmarkObservation(fixture, m0Seed?.predicted_intensity ?? new Float64Array(), {
          reference_flux_W_m2:
            fixture.coverage_mode === "full_spectrum" ? m0Seed?.bolometric_flux_W_m2 : undefined,
        }),
      });

      expect(report.winner, fixture.benchmark_id).toBe("M0_planck_atmosphere");
      expect(report.promotable_winner, fixture.benchmark_id).toBe("M0_planck_atmosphere");
      expect(report.observables_active, fixture.benchmark_id).toEqual(fixtureObservablesActive(fixture));
      expectBenchmarkSummary(report.benchmark, fixture);
      const activeNames = activeObservableNames(report.observables_active);
      expect(activeNames.every((observable) => fixture.intended_observables.includes(observable)), fixture.benchmark_id).toBe(
        true,
      );
    }
  });

  it("allows challenger observations to win across reusable benchmark fixtures", () => {
    const fixtures = makeCanonicalStellarBenchmarkFixtures().filter(
      (fixture) => fixture.benchmark_id !== "solar_solstice_uv_200_310",
    );
    for (const fixture of fixtures) {
      const structure = { xi: 0.9, alpha_xi: 0.45 };
      const seed = evaluateStellarSpectralViability({
        luminosity_W: SOLAR_LUMINOSITY_W,
        radius_m: SOLAR_RADIUS_M,
        structure,
        observation: buildBenchmarkObservation(
          fixture,
          Float64Array.from({ length: fixture.wavelength_m.length }, () => 1),
        ),
      });
      const m1Seed = seed.models.find((entry) => entry.id === "M1_lattice_emissivity");
      expect(m1Seed, fixture.benchmark_id).toBeDefined();

      const report = evaluateStellarSpectralViability({
        luminosity_W: SOLAR_LUMINOSITY_W,
        radius_m: SOLAR_RADIUS_M,
        structure,
        observation: buildBenchmarkObservation(fixture, m1Seed?.predicted_intensity ?? new Float64Array(), {
          reference_flux_W_m2:
            fixture.coverage_mode === "full_spectrum" ? m1Seed?.bolometric_flux_W_m2 : undefined,
        }),
      });

      expect(report.winner, fixture.benchmark_id).toBe("M1_lattice_emissivity");
      expect(report.promotable_winner, fixture.benchmark_id).toBe("M1_lattice_emissivity");
      expectBenchmarkSummary(report.benchmark, fixture);
    }
  });

  it("treats band-limited benchmarks differently from full-spectrum closure checks", () => {
    const fixture = makeVisibleBandSolarLikeFixture();
    const wavelengths = fixture.wavelength_m;
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: wavelengths,
        intensity: Float64Array.from({ length: wavelengths.length }, () => 1),
        coverage_mode: "band_limited",
      },
    });
    const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0Seed).toBeDefined();

    const bandLimited = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, m0Seed?.predicted_intensity ?? new Float64Array(), {
        benchmark_id: "solar-visible",
      }),
    });
    const fullSpectrum = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, m0Seed?.predicted_intensity ?? new Float64Array(), {
        benchmark_id: "solar-visible",
        coverage_mode: "full_spectrum",
      }),
    });

    const bandM0 = bandLimited.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const fullM0 = fullSpectrum.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(bandM0?.metrics.band_flux_closure).toBeLessThan(1e-12);
    expect(bandM0?.metrics.status.band_flux_closure).toBe("computed");
    expect(bandM0?.metrics.bolometric_closure).toBeNull();
    expect(bandM0?.metrics.status.bolometric_closure).toBe("gated");
    expect(fullM0?.metrics.bolometric_closure).toBeGreaterThan(0.5);
    expect(fullM0?.metrics.status.bolometric_closure).toBe("computed");
    expect(bandLimited.winner).toBe("M0_planck_atmosphere");
    expect(bandLimited.promotable_winner).toBe("M0_planck_atmosphere");
    expect(fullSpectrum.promotable_winner).toBeNull();
    expect(bandLimited.observables_active).toEqual({
      continuum: true,
      uv: false,
      line: true,
      angular: false,
      polarization: false,
    });
    expect(bandLimited.benchmark).toEqual({
      id: "solar-visible",
      coverage_mode: "band_limited",
      wavelength_min_m: wavelengths[0],
      wavelength_max_m: wavelengths[wavelengths.length - 1],
      coverage_fraction: 0.38,
      reference_kind: "tsis_sim_tim_composite",
      valid_domain: {
        lambda_min_m: 200e-9,
        lambda_max_m: 2400e-9,
      },
      intended_observables: ["continuum_fit", "line_residual", "band_flux_closure"],
      quality_mask_used: false,
      uncertainty_used: false,
      valid_sample_fraction: null,
      quality_label: null,
    });
  });

  it("surfaces a strict intended-vs-active observable contract for UV benchmark runs", () => {
    const fixture = makeCanonicalStellarBenchmarkFixtures().find((entry) => entry.benchmark_id === "solar_solstice_uv_200_310");
    expect(fixture).toBeDefined();

    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(
        fixture ?? makeFullSpectrumSolarLikeFixture(),
        Float64Array.from({ length: fixture?.wavelength_m.length ?? 0 }, () => 1),
      ),
    });
    const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0Seed).toBeDefined();

    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture ?? makeFullSpectrumSolarLikeFixture(), m0Seed?.predicted_intensity ?? new Float64Array()),
    });

    expect(report.benchmark.reference_kind).toBe("solstice_tsis_adjusted_uv");
    expect(report.benchmark.valid_domain).toEqual({
      lambda_min_m: 200e-9,
      lambda_max_m: 310e-9,
    });
    expect(report.benchmark.intended_observables).toEqual(["uv_residual", "band_flux_closure"]);
    expect(report.observables_active).toEqual({
      continuum: false,
      uv: true,
      line: false,
      angular: false,
      polarization: false,
    });
    const activeNames = activeObservableNames(report.observables_active);
    expect(activeNames).toEqual(["uv_residual"]);
    expect(activeNames.length).toBeLessThan(report.benchmark.intended_observables.length);
    expect(activeNames.every((observable) => report.benchmark.intended_observables.includes(observable))).toBe(true);
  });

  it("surfaces the angular benchmark contract separately from runtime-active angular evidence", () => {
    const fixture = makeAngularContinuumSolarLikeFixture();
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(
        fixture,
        Float64Array.from({ length: fixture.wavelength_m.length }, () => 1),
      ),
    });
    const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0Seed).toBeDefined();

    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, m0Seed?.predicted_intensity ?? new Float64Array()),
    });

    expect(report.benchmark.id).toBe("solar_neckel_labs_clv");
    expect(report.benchmark.reference_kind).toBe("neckel_labs_continuum_clv");
    expect(report.benchmark.valid_domain).toEqual({
      lambda_min_m: 303e-9,
      lambda_max_m: 1099e-9,
    });
    expect(report.benchmark.intended_observables).toEqual(["continuum_fit", "angular_residual"]);
    expect(report.observables_active).toEqual({
      continuum: true,
      uv: false,
      line: false,
      angular: true,
      polarization: false,
    });
    expect(report.models.find((entry) => entry.id === "M0_planck_atmosphere")?.metrics.status.anisotropy_penalty).toBe(
      "computed",
    );
  });

  it("excludes masked UV samples from residuals and reports benchmark quality usage", () => {
    const fixture = makeQualityMaskedUvSolarLikeFixture();
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(
        fixture,
        Float64Array.from({ length: fixture.wavelength_m.length }, () => 1),
      ),
    });
    const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0Seed).toBeDefined();

    const maskedQuality = Array.from(fixture.quality_mask ?? [], Boolean);
    const distorted = Float64Array.from(m0Seed?.predicted_intensity ?? new Float64Array(), (value, index) =>
      maskedQuality[index] ? value : value * 1.35,
    );
    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, distorted),
    });
    const m0 = report.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0?.metrics.uv_residual).toBeLessThan(1e-12);
    expect(m0?.metrics.status.uv_residual).toBe("computed");
    expect(m0?.metrics.band_flux_closure).toBeLessThan(1e-12);
    expect(report.benchmark.quality_mask_used).toBe(true);
    expect(report.benchmark.uncertainty_used).toBe(false);
    expect(report.benchmark.valid_sample_fraction).toBeCloseTo(49 / 56, 12);
    expect(report.benchmark.quality_label).toBe("synthetic_uv_quality_mask");
  });

  it("weights full-spectrum residuals by uncertainty and reports uncertainty use explicitly", () => {
    const weightedFixture = makeWeightedFullSpectrumSolarLikeFixture();
    const unweightedFixture = makeFullSpectrumSolarLikeFixture(weightedFixture.wavelength_m);
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(
        weightedFixture,
        Float64Array.from({ length: weightedFixture.wavelength_m.length }, () => 1),
      ),
    });
    const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0Seed).toBeDefined();

    const distorted = Float64Array.from(m0Seed?.predicted_intensity ?? new Float64Array(), (value, index) => {
      const lambda = weightedFixture.wavelength_m[index];
      return lambda < 600e-9 ? value * 1.2 : value;
    });
    const weightedReport = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(weightedFixture, distorted, {
        reference_flux_W_m2: m0Seed?.bolometric_flux_W_m2,
      }),
    });
    const unweightedReport = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(unweightedFixture, distorted, {
        reference_flux_W_m2: m0Seed?.bolometric_flux_W_m2,
      }),
    });

    const weightedM0 = weightedReport.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const unweightedM0 = unweightedReport.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(weightedM0?.metrics.continuum_rms).toBeLessThan(unweightedM0?.metrics.continuum_rms ?? 0);
    expect(weightedReport.benchmark.quality_mask_used).toBe(false);
    expect(weightedReport.benchmark.uncertainty_used).toBe(true);
    expect(weightedReport.benchmark.valid_sample_fraction).toBeNull();
    expect(weightedReport.benchmark.quality_label).toBe("synthetic_full_spectrum_uncertainty");
  });

  it("gates fully masked observable families and closure metrics instead of inventing values", () => {
    const fixture = makeQualityMaskedUvSolarLikeFixture();
    const fullyMasked = Float64Array.from({ length: fixture.wavelength_m.length }, () => 0);
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(
        fixture,
        Float64Array.from({ length: fixture.wavelength_m.length }, () => 1),
      ),
    });
    const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0Seed).toBeDefined();

    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, m0Seed?.predicted_intensity ?? new Float64Array(), {
        quality_mask: fullyMasked,
        quality_label: "synthetic_all_invalid_uv",
      }),
    });
    const m0 = report.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0?.metrics.uv_residual).toBeNull();
    expect(m0?.metrics.status.uv_residual).toBe("gated");
    expect(m0?.metrics.band_flux_closure).toBeNull();
    expect(m0?.metrics.status.band_flux_closure).toBe("gated");
    expect(report.observables_active.uv).toBe(false);
    expect(report.benchmark.valid_sample_fraction).toBe(0);
    expect(report.benchmark.quality_mask_used).toBe(true);
    expect(report.benchmark.quality_label).toBe("synthetic_all_invalid_uv");
  });

  it("applies reference_flux_W_m2 to the active closure path deterministically", () => {
    const fixture = makeVisibleBandSolarLikeFixture();
    const wavelengths = fixture.wavelength_m;
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: wavelengths,
        intensity: Float64Array.from({ length: wavelengths.length }, () => 1),
        coverage_mode: "band_limited",
      },
    });
    const m0Seed = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0Seed).toBeDefined();

    const matched = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, m0Seed?.predicted_intensity ?? new Float64Array(), {
        benchmark_id: "solar-visible",
      }),
    });
    const matchedReferenceFlux = matched.models[0]?.observed_bolometric_flux_W_m2 ?? 0;
    const shifted = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, m0Seed?.predicted_intensity ?? new Float64Array(), {
        benchmark_id: "solar-visible",
        reference_flux_W_m2: matchedReferenceFlux * 0.5,
      }),
    });

    const matchedM0 = matched.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const shiftedM0 = shifted.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(matchedM0?.metrics.band_flux_closure).toBeLessThan(1e-12);
    expect(shiftedM0?.metrics.band_flux_closure).toBeCloseTo(1, 12);
    expect(shiftedM0?.metrics.bolometric_closure).toBeNull();
  });

  it("promotes the lattice lane only when it improves the observed structured spectrum", () => {
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: {
        xi: 0.8,
        alpha_xi: 0.35,
      },
    });
    const lattice = seed.models.find((entry) => entry.id === "M1_lattice_emissivity");
    expect(lattice).toBeDefined();
    const fixture = makeFullSpectrumSolarLikeFixture(seed.wavelength_m);

    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, lattice?.predicted_intensity ?? new Float64Array(), {
        reference_flux_W_m2: lattice?.bolometric_flux_W_m2,
      }),
      structure: {
        xi: 0.8,
        alpha_xi: 0.35,
      },
    });

    expect(report.winner).toBe("M1_lattice_emissivity");
    expect(
      report.models.find((entry) => entry.id === "M1_lattice_emissivity")?.metrics.continuum_rms,
    ).toBeLessThan(1e-12);
  });

  it("reuses one full-spectrum benchmark fixture across default M0, hardened M0, and challenger outputs", () => {
    const baselineSeed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const hardenedSeed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        continuum_opacity: 0.25,
        line_opacity: 0.8,
      },
    });
    const challengerSeed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: {
        xi: 0.8,
        alpha_xi: 0.35,
      },
    });

    const fixture = makeFullSpectrumSolarLikeFixture(baselineSeed.wavelength_m);
    const baselineM0 = baselineSeed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const hardenedM0 = hardenedSeed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const challengerM1 = challengerSeed.models.find((entry) => entry.id === "M1_lattice_emissivity");
    expect(baselineM0).toBeDefined();
    expect(hardenedM0).toBeDefined();
    expect(challengerM1).toBeDefined();

    const baselineReport = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: buildBenchmarkObservation(fixture, baselineM0?.predicted_intensity ?? new Float64Array(), {
        reference_flux_W_m2: baselineM0?.bolometric_flux_W_m2,
      }),
    });
    const hardenedReport = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        continuum_opacity: 0.25,
        line_opacity: 0.8,
      },
      observation: buildBenchmarkObservation(fixture, hardenedM0?.predicted_intensity ?? new Float64Array(), {
        reference_flux_W_m2: hardenedM0?.bolometric_flux_W_m2,
      }),
    });
    const challengerReport = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: {
        xi: 0.8,
        alpha_xi: 0.35,
      },
      observation: buildBenchmarkObservation(fixture, challengerM1?.predicted_intensity ?? new Float64Array(), {
        reference_flux_W_m2: challengerM1?.bolometric_flux_W_m2,
      }),
    });

    expect(baselineReport.benchmark.id).toBe("solar_tsis_sim_tim_full");
    expect(hardenedReport.benchmark.id).toBe("solar_tsis_sim_tim_full");
    expect(challengerReport.benchmark.id).toBe("solar_tsis_sim_tim_full");
    expect(baselineReport.winner).toBe("M0_planck_atmosphere");
    expect(hardenedReport.winner).toBe("M0_planck_atmosphere");
    expect(challengerReport.winner).toBe("M1_lattice_emissivity");
  });

  it("tracks best-fit winner separately from promotable winner when the lowest-score model fails contract", () => {
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: { xi: 1, alpha_xi: 0, d_eff: 1e-12, A_ml: 0, material_gate: true },
    });
    const m0 = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0).toBeDefined();

    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: seed.wavelength_m,
        intensity: m0?.predicted_intensity ?? new Float64Array(),
        continuum_mask: makeContinuumMask(seed.wavelength_m),
        uv_mask: makeUvMask(seed.wavelength_m),
        polarization: Float64Array.from({ length: seed.wavelength_m.length }, () => 0.05),
      },
      structure: { xi: 1, alpha_xi: 0, d_eff: 1e-12, A_ml: 0, material_gate: true },
      weights: {
        continuum: 1,
        uv: 0,
        line: 0,
        bolometric: 0,
        anisotropy: 0,
        polarization: 0,
      },
    });

    const bestFit = report.models.find((entry) => entry.id === report.best_fit_winner);
    const promotable = report.models.find((entry) => entry.id === report.promotable_winner);
    expect(bestFit?.passes_contract).toBe(false);
    expect(promotable?.passes_contract).toBe(true);
    expect(report.promotable_winner).not.toBe(report.best_fit_winner);
    expect(report.winner).toBe(report.promotable_winner);
  });

  it("keeps alternative-lane promotion semantics unchanged under M0 atmosphere hardening inputs", () => {
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: { xi: 1, alpha_xi: 0, d_eff: 1e-12, A_ml: 0, material_gate: true },
      atmosphere: {
        source_function_mode: "lte",
      },
    });
    const m0 = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(m0).toBeDefined();

    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: seed.wavelength_m,
        intensity: m0?.predicted_intensity ?? new Float64Array(),
        continuum_mask: makeContinuumMask(seed.wavelength_m),
        uv_mask: makeUvMask(seed.wavelength_m),
        polarization: Float64Array.from({ length: seed.wavelength_m.length }, () => 0.05),
      },
      structure: { xi: 1, alpha_xi: 0, d_eff: 1e-12, A_ml: 0, material_gate: true },
      atmosphere: {
        source_function_mode: "lte",
      },
      weights: {
        continuum: 1,
        uv: 0,
        line: 0,
        bolometric: 0,
        anisotropy: 0,
        polarization: 0,
      },
    });

    const bestFit = report.models.find((entry) => entry.id === report.best_fit_winner);
    const promotable = report.models.find((entry) => entry.id === report.promotable_winner);
    expect(bestFit?.passes_contract).toBe(false);
    expect(promotable?.passes_contract).toBe(true);
    expect(report.promotable_winner).not.toBe(report.best_fit_winner);
    expect(report.winner).toBe(report.promotable_winner);
  });

  it("sets promotable winner to null and falls back to M0 when all models fail the contract", () => {
    const wavelengths = makeWavelengthGrid();
    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: wavelengths,
        intensity: Float64Array.from({ length: wavelengths.length }, () => 0),
        continuum_mask: makeContinuumMask(wavelengths),
        uv_mask: makeUvMask(wavelengths),
        line_mask: makeLineMask(wavelengths),
      },
    });
    expect(report.models.every((entry) => entry.passes_contract === false)).toBe(true);
    expect(report.promotable_winner).toBeNull();
    expect(report.fallback_winner).toBe("M0_planck_atmosphere");
    expect(report.winner).toBe(report.fallback_winner);
    expect(report.observables_active).toEqual({
      continuum: true,
      uv: true,
      line: true,
      angular: false,
      polarization: false,
    });
  });

  it("keeps M1 and M3 bolometric flux matched to M0 by default", () => {
    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: {
        xi: 0.95,
        alpha_xi: 0.75,
        Q_coh: 10,
      },
    });
    const m0 = report.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const m1 = report.models.find((entry) => entry.id === "M1_lattice_emissivity");
    const m3 = report.models.find((entry) => entry.id === "M3_coherence_angular");
    expect(m0).toBeDefined();
    expect(m1).toBeDefined();
    expect(m3).toBeDefined();
    const flux0 = m0?.bolometric_flux_W_m2 ?? 0;
    expect(Math.abs((m1?.bolometric_flux_W_m2 ?? 0) - flux0) / flux0).toBeLessThan(1e-10);
    expect(Math.abs((m3?.bolometric_flux_W_m2 ?? 0) - flux0) / flux0).toBeLessThan(1e-10);
  });

  it("keeps M1 and M3 flux-conserving even when M2 source power is enabled", () => {
    const baseInput = {
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: {
        xi: 0.95,
        alpha_xi: 0.75,
        Q_coh: 10,
        d_eff: 2e-12,
        A_ml: 0.9,
        pressure_proxy_Pa: 5e8,
        stress_rate_proxy_Pa_s: 4e8,
        trap_density_m3: 6e20,
        material_gate: true,
      },
    };
    const report = evaluateStellarSpectralViability({
      ...baseInput,
      structure: { ...baseInput.structure, m2_source_power_enabled: true },
    });
    const reportWithoutM2Source = evaluateStellarSpectralViability({
      ...baseInput,
      structure: { ...baseInput.structure, m2_source_power_enabled: false },
    });

    const m0 = report.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const m1 = report.models.find((entry) => entry.id === "M1_lattice_emissivity");
    const m2 = report.models.find((entry) => entry.id === "M2_mechanoluminescent_pressure");
    const m3 = report.models.find((entry) => entry.id === "M3_coherence_angular");
    const m2WithoutSource = reportWithoutM2Source.models.find((entry) => entry.id === "M2_mechanoluminescent_pressure");
    expect(m0).toBeDefined();
    expect(m1).toBeDefined();
    expect(m2).toBeDefined();
    expect(m3).toBeDefined();
    expect(m2WithoutSource).toBeDefined();

    const flux0 = m0?.bolometric_flux_W_m2 ?? 0;
    const m1Closure = Math.abs((m1?.bolometric_flux_W_m2 ?? 0) - flux0) / flux0;
    const m3Closure = Math.abs((m3?.bolometric_flux_W_m2 ?? 0) - flux0) / flux0;
    expect(m1Closure).toBeLessThan(1e-10);
    expect(m3Closure).toBeLessThan(1e-10);
    expect(m2?.bolometric_flux_W_m2).not.toBeCloseTo(m2WithoutSource?.bolometric_flux_W_m2 ?? 0, 12);
  });

  it("keeps continuum, UV, and line residuals separate and gates missing spectral windows", () => {
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const distorted = Float64Array.from(seed.wavelength_m, (_, index) => {
      const lambda = seed.wavelength_m[index];
      const base = seed.models.find((entry) => entry.id === "M0_planck_atmosphere")?.predicted_intensity[index] ?? 0;
      if (lambda < 400e-9) return base * 1.25;
      if ((lambda >= 482e-9 && lambda <= 490e-9) || (lambda >= 650e-9 && lambda <= 660e-9)) return base * 0.7;
      if (lambda >= 400e-9 && lambda <= 2.5e-6) return base * 1.05;
      return base;
    });

    const gated = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: seed.wavelength_m,
        intensity: distorted,
      },
    });
    const gatedM0 = gated.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(gatedM0?.metrics.continuum_rms).toBeNull();
    expect(gatedM0?.metrics.uv_residual).toBeNull();
    expect(gatedM0?.metrics.line_residual).toBeNull();
    expect(gatedM0?.metrics.status.continuum_rms).toBe("gated");
    expect(gatedM0?.metrics.status.uv_residual).toBe("gated");
    expect(gatedM0?.metrics.status.line_residual).toBe("gated");

    const partitioned = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: seed.wavelength_m,
        intensity: distorted,
        continuum_mask: makeContinuumMask(seed.wavelength_m),
        uv_mask: makeUvMask(seed.wavelength_m),
        line_mask: makeLineMask(seed.wavelength_m),
      },
    });
    const partitionedM0 = partitioned.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(partitionedM0?.metrics.continuum_rms).toBeGreaterThan(0);
    expect(partitionedM0?.metrics.uv_residual).toBeGreaterThan(0);
    expect(partitionedM0?.metrics.line_residual).toBeGreaterThan(0);
    expect(partitionedM0?.metrics.status.continuum_rms).toBe("computed");
    expect(partitionedM0?.metrics.status.uv_residual).toBe("computed");
    expect(partitionedM0?.metrics.status.line_residual).toBe("computed");
    expect(partitionedM0?.metrics.uv_residual).toBeGreaterThan(partitionedM0?.metrics.continuum_rms ?? 0);
  });

  it("only evaluates angular residuals when mu-profile observations are provided", () => {
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    const baseIntensity = seed.models.find((entry) => entry.id === "M0_planck_atmosphere")?.predicted_intensity ?? new Float64Array();

    const withoutMu = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: seed.wavelength_m,
        intensity: baseIntensity,
        continuum_mask: makeContinuumMask(seed.wavelength_m),
        uv_mask: makeUvMask(seed.wavelength_m),
      },
    });
    const withoutMuM0 = withoutMu.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(withoutMuM0?.metrics.anisotropy_penalty).toBeNull();
    expect(withoutMuM0?.metrics.status.anisotropy_penalty).toBe("unavailable");
    expect(withoutMu.observables_active.angular).toBe(false);

    const muGrid = makeMuGrid();
    const withMu = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: seed.wavelength_m,
        intensity: baseIntensity,
        continuum_mask: makeContinuumMask(seed.wavelength_m),
        uv_mask: makeUvMask(seed.wavelength_m),
        mu_grid: muGrid,
        intensity_by_mu: Float64Array.from(muGrid, (mu) => 1 - 0.55 * (1 - mu)),
      },
    });
    const withMuM0 = withMu.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(withMuM0?.metrics.anisotropy_penalty).toBeLessThan(1e-12);
    expect(withMuM0?.metrics.status.anisotropy_penalty).toBe("computed");
    expect(withMuM0?.predicted_mu_profile?.length).toBe(muGrid.length);
    expect(withMu.observables_active.angular).toBe(true);
  });

  it("changes angular null-model profiles deterministically with atmosphere inputs", () => {
    const muGrid = makeMuGrid();
    const baseline = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: makeWavelengthGrid(),
        intensity: Float64Array.from(makeWavelengthGrid(), () => 1),
        continuum_mask: makeContinuumMask(makeWavelengthGrid()),
        uv_mask: makeUvMask(makeWavelengthGrid()),
        mu_grid: muGrid,
        intensity_by_mu: Float64Array.from(muGrid, (mu) => 1 - 0.55 * (1 - mu)),
      },
    });
    const atmosphereShifted = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      atmosphere: {
        continuum_opacity: 1.8,
        line_opacity: 1.1,
        line_source_contrast: -0.2,
        nlte_departure: 0.15,
      },
      observation: {
        wavelength_m: baseline.wavelength_m,
        intensity: Float64Array.from(baseline.wavelength_m, () => 1),
        continuum_mask: makeContinuumMask(baseline.wavelength_m),
        uv_mask: makeUvMask(baseline.wavelength_m),
        mu_grid: muGrid,
        intensity_by_mu: Float64Array.from(muGrid, (mu) => 1 - 0.55 * (1 - mu)),
      },
    });

    const baselineM0 = baseline.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const shiftedM0 = atmosphereShifted.models.find((entry) => entry.id === "M0_planck_atmosphere");
    expect(baselineM0?.predicted_mu_profile).toBeDefined();
    expect(shiftedM0?.predicted_mu_profile).toBeDefined();
    const edgeIndex = 0;
    const centerIndex = muGrid.length - 1;
    expect(shiftedM0?.predicted_mu_profile?.[edgeIndex]).not.toBeCloseTo(baselineM0?.predicted_mu_profile?.[edgeIndex] ?? 0, 6);
    expect(shiftedM0?.predicted_mu_profile?.[centerIndex]).toBeCloseTo(1, 12);
  });

  it("requires explicit M2 material gate and prevents M2 wins when the gate is off", () => {
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      structure: {
        xi: 0.6,
        d_eff: 2e-12,
        A_ml: 0.8,
        pressure_proxy_Pa: 5e8,
        stress_rate_proxy_Pa_s: 4e8,
        trap_density_m3: 6e20,
        material_gate: true,
      },
    });
    const m2Seed = seed.models.find((entry) => entry.id === "M2_mechanoluminescent_pressure");
    expect(m2Seed).toBeDefined();

    const gatedOff = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: makeWavelengthGrid(),
        intensity: m2Seed?.predicted_intensity ?? new Float64Array(),
      },
      structure: {
        xi: 0.6,
        d_eff: 2e-12,
        A_ml: 0.8,
        pressure_proxy_Pa: 5e8,
        stress_rate_proxy_Pa_s: 4e8,
        trap_density_m3: 6e20,
        material_gate: false,
      },
    });

    const m2 = gatedOff.models.find((entry) => entry.id === "M2_mechanoluminescent_pressure");
    expect(m2?.predicted_anisotropy).toBe(0);
    expect(gatedOff.winner).not.toBe("M2_mechanoluminescent_pressure");
  });

  it("uses the observation-driven wavelength grid for band-limited inputs", () => {
    const wavelengths = Float64Array.from({ length: 48 }, (_, index) => 420e-9 + index * 4e-9);
    const observation = Float64Array.from({ length: wavelengths.length }, () => 1);
    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: wavelengths,
        intensity: observation,
      },
    });
    expect(report.models[0]?.predicted_intensity.length).toBe(48);
  });

  it("uses a log-spaced fallback wavelength grid when no observation is provided", () => {
    const report = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
    });
    expect(report.wavelength_m.length).toBe(256);
    const ratioA = report.wavelength_m[1] / report.wavelength_m[0];
    const ratioB = report.wavelength_m[128] / report.wavelength_m[127];
    expect(Math.abs(ratioA - ratioB)).toBeLessThan(1e-12);
  });
});
