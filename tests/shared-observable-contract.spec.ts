import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  FUSION_LANE_CONTRACT_SCHEMA_VERSION,
  type FusionLaneBundleV1,
} from "../shared/contracts/fusion-observable-contract.v1";
import { SHARED_OBSERVABLE_CONTRACT_SCHEMA_VERSION } from "../shared/contracts/observable-contract.v1";
import { toStellarObservableContract } from "../sim_core/stellar_observable_contract";
import {
  buildBenchmarkObservation,
  makeAngularContinuumSolarLikeFixture,
  makeFullSpectrumSolarLikeFixture,
} from "./helpers/stellar-benchmark-fixtures";

describe("shared observable contract", () => {
  it("maps stellar benchmark observations into the shared observable contract shape", () => {
    const fixture = makeFullSpectrumSolarLikeFixture();
    const intensity = Float64Array.from(fixture.wavelength_m, () => 1);
    const observation = buildBenchmarkObservation(fixture, intensity, {
      uncertainty: Float64Array.from(fixture.wavelength_m, () => 0.03),
      quality_mask: Float64Array.from(fixture.wavelength_m, (_, index) => (index % 7 === 0 ? 0 : 1)),
      quality_label: "synthetic_quality_mask",
    });

    const contract = toStellarObservableContract(observation);
    expect(contract.schema_version).toBe(SHARED_OBSERVABLE_CONTRACT_SCHEMA_VERSION);
    expect(contract.lane_id).toBe("stellar_radiation");
    expect(contract.modality).toBe("spectrum");
    expect(contract.coverage_mode).toBe("full_spectrum");
    expect(contract.reference_kind).toBe("tsis_sim_tim_composite");
    expect(contract.provenance_class).toBe("observed");
    expect(contract.axes.map((entry) => entry.axis_id)).toEqual(["wavelength_m"]);
    expect(contract.error?.sigma).toEqual(observation.uncertainty);
    expect(contract.error?.quality_mask).toEqual(observation.quality_mask);
    expect(contract.error?.quality_label).toBe("synthetic_quality_mask");
    expect(contract.intended_observables).toEqual([
      "continuum_fit",
      "uv_residual",
      "line_residual",
      "band_flux_closure",
      "bolometric_closure",
    ]);
  });

  it("includes mu axis when angular observations are available", () => {
    const fixture = makeAngularContinuumSolarLikeFixture();
    const intensity = Float64Array.from(fixture.wavelength_m, () => 1);
    const observation = buildBenchmarkObservation(fixture, intensity);

    const contract = toStellarObservableContract(observation, {
      observable_id: "solar_clv_contract",
    });
    expect(contract.observable_id).toBe("solar_clv_contract");
    expect(contract.axes.map((entry) => entry.axis_id)).toEqual(["wavelength_m", "mu"]);
    expect(contract.intended_observables).toEqual(["continuum_fit", "angular_residual"]);
  });

  it("supports fusion lane bundles with diagnostic-facing observables", () => {
    const bundle: FusionLaneBundleV1 = {
      schema_version: FUSION_LANE_CONTRACT_SCHEMA_VERSION,
      G_geometry: {
        confinement_mode: "magnetic",
        device_class: "tokamak",
        equilibrium_ref: "imas://equilibrium/0",
        diagnostic_sightline_refs: ["imas://diagnostics/sightlines/bolometer"],
      },
      F_forcing: {
        heating_refs: ["imas://nbi/0"],
        actuator_refs: ["imas://pf_coils/0"],
      },
      S_state: {
        profile_ref: "imas://core_profiles/0",
        profile_ids: ["electron_temperature", "electron_density"],
      },
      C_closure: {
        reactivity_ref: "closure://bosch_hale_v1",
        synthetic_response_refs: ["diag://bolometer_response_v1"],
      },
      O_observables: [
        {
          schema_version: SHARED_OBSERVABLE_CONTRACT_SCHEMA_VERSION,
          observable_id: "fusion_bolometer_line_integral",
          lane_id: "fusion_plasma_diagnostics",
          modality: "channel_series",
          diagnostic_kind: "bolometer",
          channel_ids: ["bolo_001", "bolo_002"],
          axes: [
            { axis_id: "time_s", unit: "s", role: "time", time_mode: "homogeneous", monotonic: true },
            { axis_id: "channel", unit: "index", role: "channel" },
          ],
          units: "W/m^2",
          coverage_mode: "channel_limited",
          values_ref: "artifacts/fusion/bolo-line-integral.json",
          response_model: {
            id: "fusion_synthetic_diag_bolo_v1",
            kind: "synthetic_diagnostic",
          },
          provenance: {
            source_id: "imas_bolometer",
            source_family: "imas",
          },
          claim_tier: "diagnostic",
          provenance_class: "observed",
          intended_observables: ["bolometric_closure"],
          imas_binding: {
            ids_roots: ["equilibrium", "core_profiles", "bolometer"],
            time_mode: "homogeneous",
            coordinate_notes: "R-Z line-integrated channels",
          },
        },
      ],
    };

    expect(bundle.schema_version).toBe(FUSION_LANE_CONTRACT_SCHEMA_VERSION);
    expect(bundle.O_observables[0]?.lane_id).toBe("fusion_plasma_diagnostics");
    expect(bundle.O_observables[0]?.diagnostic_kind).toBe("bolometer");
    expect(bundle.O_observables[0]?.imas_binding?.ids_roots).toContain("core_profiles");
  });

  it("pins shared-contract design claims to published references", () => {
    const repoRoot = process.cwd();
    const docPath = path.join(repoRoot, "docs", "architecture", "shared-observable-contract.md");
    const doc = fs.readFileSync(docPath, "utf8");

    expect(doc).toContain("https://imas-data-dictionary.readthedocs.io/en/latest/coordinates.html");
    expect(doc).toContain("https://imas-data-dictionary.readthedocs.io/en/latest/errorbars.html");
    expect(doc).toContain("https://fusion.gat.com/conferences/ttf/files/preview/Terry_TTFV%26V.pdf");
    expect(doc).toContain("https://arxiv.org/abs/2305.09683");
    expect(doc).toContain("https://arxiv.org/abs/1403.3088");
    expect(doc).toContain("https://arxiv.org/abs/2212.03991");
  });
});
