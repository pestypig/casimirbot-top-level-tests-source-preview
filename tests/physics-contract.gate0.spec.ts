import { describe, expect, it } from "vitest";
import { C, C2, G, HBAR, PI } from "@shared/physics-const";
import { curvatureProxyPrefactors, kappa_body, kappa_drive, kappa_drive_from_power, kappa_u } from "@shared/curvature-proxy";
import { CollapseBenchmarkInput, CollapseBenchmarkResult, hazardProbability, collapseBenchmarkDiagnostics } from "@shared/collapse-benchmark";
import { CurvatureSummary, CurvatureUnitInput } from "@shared/essence-physics";
import { SI_UNITS } from "@shared/unit-system";
import { RasterEnergyField2D } from "@shared/raster-energy-field";
import { DatasetManifest } from "@shared/dataset-manifest";
import { C as serverC, C2 as serverC2, G as serverG, HBAR as serverHBAR, PI as serverPI } from "../server/physics-const";
import { C as clientC, C2 as clientC2, G as clientG2, HBAR as clientHBAR, PI as clientPI } from "@/lib/physics-const";
import { G as clientG, c as client_c } from "@/physics/constants";
import { curvaturePrefactors, kappaBody, kappaDrive, kappaDriveFromPower } from "@/physics/curvature";

const relClose = (a: number, b: number, tol = 1e-12) => {
  const denom = Math.max(1e-30, Math.abs(b));
  return Math.abs(a - b) / denom <= tol;
};

describe("Gate 0: shared physics constants (no drift)", () => {
  it("keeps shared/server/client constants identical", () => {
    expect(serverC).toBe(C);
    expect(serverC2).toBe(C2);
    expect(serverG).toBe(G);
    expect(serverHBAR).toBe(HBAR);
    expect(serverPI).toBe(PI);

    expect(clientC).toBe(C);
    expect(clientC2).toBe(C2);
    expect(clientG2).toBe(G);
    expect(clientHBAR).toBe(HBAR);
    expect(clientPI).toBe(PI);

    expect(clientG).toBe(G);
    expect(client_c).toBe(C);
  });

  it("locks CurvatureUnitInput to SI units + shared constants by default", () => {
    const parsed = CurvatureUnitInput.parse({
      grid: { nx: 8, ny: 8, dx_m: 0.01, dy_m: 0.01, thickness_m: 1 },
      sources: [{ x_m: 0, y_m: 0, sigma_m: 0.1, peak_u_Jm3: 0 }],
    });

    expect(parsed.units).toEqual(SI_UNITS);
    expect(parsed.constants.c).toBe(C);
    expect(parsed.constants.G).toBe(G);
  });



  it("validates curvature bridge output fields on summary schema", () => {
    const parsed = CurvatureSummary.parse({
      total_energy_J: 1,
      mass_equivalent_kg: 1,
      residual_rms: 0,
      stability: {
        iterations: 1,
        nan_count: 0,
        phi_min: 0,
        phi_max: 0,
        grad_rms: 0,
        laplacian_rms: 0,
        residual_max_abs: 0,
      },
      k_metrics: { k0: 0, k1: 0, k2: 0 },
      ridge_summary: {
        ridge_count: 0,
        ridge_point_count: 0,
        ridge_length_m: 0,
        ridge_density: 0,
        fragmentation_index: 0,
        thresholds: { high: 0, low: 0 },
      },
      vector_roots: [],
      stress_energy_bridge: [
        {
          source: { channel: "kappa_u", kappa_m2: 1e-10 },
          surrogate: { t00_J_m3: 5, bounded: true, bound_abs_J_m3: 10 },
          units: SI_UNITS,
          provenance: { class: "diagnostic", method: "unit test" },
          uncertainty: { model: "bounded", relative_1sigma: 0.1, absolute_1sigma_J_m3: 0.5, confidence: 0.95 },
          parity: { canonical_kappa_m2: 1e-10, mismatch_rel: 0, mismatch_threshold_rel: 0.01, pass: true },
        },
      ],
    });

    expect(parsed.stress_energy_bridge[0].units.system).toBe("SI");
    expect(parsed.stress_energy_bridge[0].provenance.class).toBe("diagnostic");
    expect(parsed.stress_energy_bridge[0].uncertainty.absolute_1sigma_J_m3).toBe(0.5);
  });

});

describe("Gate 0: curvature proxy contract (kappa_*)", () => {
  it("matches prefactor formulas from shared constants", () => {
    const driveExpected = (8 * PI * G) / Math.pow(C, 5);
    const bodyExpected = (8 * PI * G) / (3 * C2);
    const uExpected = (8 * PI * G) / Math.pow(C, 4);

    expect(relClose(curvatureProxyPrefactors.drive, driveExpected)).toBe(true);
    expect(relClose(curvatureProxyPrefactors.body, bodyExpected)).toBe(true);
    expect(relClose(curvatureProxyPrefactors.energy_density, uExpected)).toBe(true);
  });

  it("keeps shared and client curvature helpers identical", () => {
    expect(relClose(curvaturePrefactors.drive, curvatureProxyPrefactors.drive)).toBe(true);
    expect(relClose(curvaturePrefactors.body, curvatureProxyPrefactors.body)).toBe(true);

    const rho = 1_234.5;
    const flux = 9.87e4;
    const power = 83.3e6;
    const area = 4.92e6;
    const dEff = 2.5e-5;
    const gain = 1.2e6;

    expect(relClose(kappaBody(rho), kappa_body(rho))).toBe(true);
    expect(relClose(kappaDrive(flux, dEff, gain), kappa_drive(flux, dEff, gain))).toBe(true);
    expect(relClose(kappaDriveFromPower(power, area, dEff, gain), kappa_drive_from_power(power, area, dEff, gain))).toBe(true);
    expect(relClose(kappa_u(42), curvatureProxyPrefactors.energy_density * 42)).toBe(true);
  });
});

describe("Gate 0: collapse benchmark contract (Phase 0)", () => {
  it("validates and round-trips schema parsing", () => {
    const input = CollapseBenchmarkInput.parse({
      schema_version: "collapse_benchmark/1",
      dt_ms: 50,
      tau_ms: 1_000,
      r_c_m: 0.25,
      seed: "deadbeef",
    });
    expect(input.dt_ms).toBe(50);

    const data_cutoff_iso = "2025-01-01T00:00:00.000Z";
    const inputs_hash = "sha256:deadbeef";
    const features_hash = "sha256:cafebabe";
    const diagnostics = collapseBenchmarkDiagnostics({ tau_ms: 1_000, r_c_m: 0.25 });
    const p_trigger = hazardProbability(50, 1_000);

    const result = CollapseBenchmarkResult.parse({
      schema_version: "collapse_benchmark/1",
      kind: "collapse_benchmark",
      dt_ms: input.dt_ms,
      tau_ms: 1_000,
      tau_source: "manual",
      r_c_m: 0.25,
      r_c_source: "manual",
      c_mps: C,
      p_trigger,
      L_present_m: diagnostics.L_present_m,
      kappa_present_m2: diagnostics.kappa_present_m2,
      diagnostics: {
        tau_s: diagnostics.tau_s,
        L_lc_m: diagnostics.L_lc_m,
        E_G_J: diagnostics.E_G_J,
        V_c_m3: diagnostics.V_c_m3,
        rho_eff_kg_m3: diagnostics.rho_eff_kg_m3,
        kappa_collapse_m2: diagnostics.kappa_collapse_m2,
      },
      data_cutoff_iso,
      inputs_hash,
      features_hash,
      information_boundary: {
        schema_version: "ib/1",
        data_cutoff_iso,
        inputs_hash,
        features_hash,
        mode: "observables",
        labels_used_as_features: false,
        event_features_included: false,
      },
    });

    expect(result.data_cutoff_iso).toBe(result.information_boundary.data_cutoff_iso);
    expect(result.inputs_hash).toBe(result.information_boundary.inputs_hash);
    expect(result.features_hash).toBe(result.information_boundary.features_hash);
  });
});

describe("Gate 0: repeatable artifacts (schemas)", () => {
  it("validates the canonical raster energy-field contract (2D)", () => {
    const data_cutoff_iso = "2025-01-01T00:00:00.000Z";
    const inputs_hash = "sha256:deadbeef";
    const features_hash = "sha256:cafebabe";

    const parsed = RasterEnergyField2D.parse({
      schema_version: "raster_energy_field/1",
      kind: "raster_energy_field",
      data_cutoff_iso,
      inputs_hash,
      features_hash,
      information_boundary: {
        schema_version: "ib/1",
        data_cutoff_iso,
        inputs_hash,
        features_hash,
        mode: "observables",
        labels_used_as_features: false,
        event_features_included: false,
      },
      units: SI_UNITS,
      grid: { nx: 2, ny: 2, dx_m: 1, dy_m: 1, thickness_m: 1 },
      timestamp_iso: data_cutoff_iso,
      components: {
        u_total_Jm3: {
          encoding: "base64",
          dtype: "float32",
          endian: "little",
          order: "row-major",
          data_b64: "AAAA",
        },
      },
    });

    expect(parsed.units.system).toBe("SI");
    expect(parsed.features_hash).toBe(features_hash);
  });

  it("validates the dataset-manifest format (Phase 0)", () => {
    const parsed = DatasetManifest.parse({
      schema_version: "dataset_manifest/1",
      kind: "dataset_manifest",
      created_at: "2025-01-01T00:00:00.000Z",
      entries: [
        {
          id: "curvature-unit:smoke",
          pipeline: "physics.curvature.unit",
          input: { grid: { nx: 8, ny: 8, dx_m: 0.01, dy_m: 0.01 }, sources: [{ x_m: 0, y_m: 0, sigma_m: 0.1, peak_u_Jm3: 0 }] },
          expected: { hashes: { inputs_hash: "sha256:deadbeef" } },
        },
      ],
    });

    expect(parsed.units).toEqual(SI_UNITS);
    expect(parsed.entries.length).toBe(1);
  });
});
