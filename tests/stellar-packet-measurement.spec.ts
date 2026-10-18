import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateStellarSpectralViability } from "../sim_core/stellar_viability";
import { packetizeContinuousSpectrum, photonEnergyJ } from "../sim_core/stellar_packet_measurement";
import { SOLAR_LUMINOSITY_W, SOLAR_RADIUS_M } from "./helpers/stellar-benchmark-fixtures";

const wavelengthGrid = (length = 2048): Float64Array =>
  Float64Array.from({ length }, (_, index) => 350e-9 + (index / (length - 1)) * 1200e-9);

describe("stellar packet measurement", () => {
  it("packetizes a continuous spectrum without changing expected energy", () => {
    const report = packetizeContinuousSpectrum({
      wavelength_m: Float64Array.from([400e-9, 500e-9, 600e-9, 700e-9]),
      spectral_flux_W_m2_per_m: Float64Array.from([1.5, 2, 2.5, 3]),
      exposure_s: 10,
      collecting_area_m2: 2,
      rng_seed: "energy-closure",
    });
    const reconstructed = report.bins.reduce((sum, bin) => sum + bin.expected_count * bin.photon_energy_J, 0);
    expect(report.claim).toBe("packetized_measurement_of_continuous_spectrum");
    expect(reconstructed).toBeCloseTo(report.expected_energy_J, 12);
    expect(report.expected_energy_closure_fraction).toBe(1);
    expect(report.sampled_energy_sigma_fraction).toBeGreaterThan(0);
  });

  it("uses E = h c / lambda so shorter wavelengths require fewer photons per joule", () => {
    const shortEnergy = photonEnergyJ(400e-9);
    const longEnergy = photonEnergyJ(800e-9);
    expect(shortEnergy).toBeGreaterThan(longEnergy);
    expect(1 / shortEnergy).toBeLessThan(1 / longEnergy);
  });

  it("keeps M1 packet expected energy tied to the redistributed continuous spectrum", () => {
    const wavelengths = wavelengthGrid();
    const seed = evaluateStellarSpectralViability({
      luminosity_W: SOLAR_LUMINOSITY_W,
      radius_m: SOLAR_RADIUS_M,
      observation: {
        wavelength_m: wavelengths,
        intensity: Float64Array.from(wavelengths, () => 1),
      },
      structure: { xi: 0.95, alpha_xi: 0.75 },
    });
    const m0 = seed.models.find((entry) => entry.id === "M0_planck_atmosphere");
    const m1 = seed.models.find((entry) => entry.id === "M1_lattice_emissivity");
    expect(m1?.bolometric_flux_W_m2).toBeCloseTo(m0?.bolometric_flux_W_m2 ?? 0, 6);

    const report = packetizeContinuousSpectrum({
      wavelength_m: seed.wavelength_m,
      spectral_flux_W_m2_per_m: Float64Array.from(m1?.predicted_intensity ?? [], (value) => value * Math.PI),
      exposure_s: 1e-3,
      collecting_area_m2: 1e-4,
      rng_seed: "m1-continuous-packetization",
    });
    const expectedFromBins = report.bins.reduce((sum, bin) => sum + bin.expected_count * bin.photon_energy_J, 0);
    expect(report.expected_energy_J).toBeCloseTo(expectedFromBins, 12);
  });

  it("rejects non-monotonic wavelength grids", () => {
    expect(() =>
      packetizeContinuousSpectrum({
        wavelength_m: Float64Array.from([400e-9, 600e-9, 500e-9]),
        spectral_flux_W_m2_per_m: Float64Array.from([1, 1, 1]),
        exposure_s: 1,
        collecting_area_m2: 1,
      }),
    ).toThrow(/strictly increasing/);
  });

  it("requires throughput arrays to match the wavelength grid", () => {
    expect(() =>
      packetizeContinuousSpectrum({
        wavelength_m: Float64Array.from([400e-9, 500e-9, 600e-9]),
        spectral_flux_W_m2_per_m: Float64Array.from([1, 1, 1]),
        throughput: Float64Array.from([1, 1]),
        exposure_s: 1,
        collecting_area_m2: 1,
      }),
    ).toThrow(/throughput array/);
  });

  it("caps timestamped packet recording while preserving binned counts", () => {
    expect(() =>
      packetizeContinuousSpectrum({
        wavelength_m: Float64Array.from([400e-9, 500e-9]),
        spectral_flux_W_m2_per_m: Float64Array.from([1, 1]),
        exposure_s: 1,
        collecting_area_m2: 1,
        record_packets: true,
      }),
    ).toThrow(/max_recorded_packets/);

    const report = packetizeContinuousSpectrum({
      wavelength_m: Float64Array.from([400e-9, 500e-9]),
      spectral_flux_W_m2_per_m: Float64Array.from([1e12, 1e12]),
      exposure_s: 1,
      collecting_area_m2: 1,
      rng_seed: "packet-cap",
      record_packets: true,
      max_recorded_packets: 1,
    });

    expect(report.packet_recording_truncated).toBe(true);
    expect(report.packets_recorded).toBe(0);
    expect(report.packets).toBeUndefined();
    expect(report.bins.reduce((sum, bin) => sum + bin.sampled_count, 0)).toBeGreaterThan(1);
  });

  it("documents M1 as flux-preserving redistribution rather than emitted photon packets", () => {
    const doc = fs.readFileSync(path.join(process.cwd(), "docs/starsim/solar-event-congruence.md"), "utf8");
    expect(doc).toContain("`M1_lattice_emissivity` is a continuous spectral redistribution model");
    expect(doc).toContain("It does not emit timestamped photons");
    expect(doc).toContain("StarSim models Planck energy emitted in discrete quanta packets");
  });
});
