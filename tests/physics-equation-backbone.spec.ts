import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validatePhysicsEquationBackbone } from "../scripts/validate-physics-equation-backbone";

const tempRoots: string[] = [];

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeFixture(mutator?: (manifest: Record<string, unknown>) => void) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "physics-equation-backbone-"));
  tempRoots.push(repoRoot);

  const manifest: Record<string, unknown> = {
    schema_version: "physics_equation_backbone/1",
    manifest_id: "fixture",
    unit_system: "SI",
    claim_tier: "diagnostic",
    equations: [
      {
        id: "efe_baseline",
        expression: "G_mu_nu + Lambda * g_mu_nu = (8 * pi * G / c^4) * T_mu_nu",
        claim_tier: "diagnostic",
        symbols: [
          { symbol: "G_mu_nu", units: "1/m^2" },
          { symbol: "Lambda", units: "1/m^2" },
          { symbol: "g_mu_nu", units: "dimensionless" },
          { symbol: "G", units: "m^3/(kg*s^2)" },
          { symbol: "c", units: "m/s" },
          { symbol: "T_mu_nu", units: "Pa" },
        ],
      },
      {
        id: "semiclassical_coupling",
        expression: "G_mu_nu + Lambda * g_mu_nu = (8 * pi * G / c^4) * <T_mu_nu>",
        claim_tier: "diagnostic",
        symbols: [
          { symbol: "G_mu_nu", units: "1/m^2" },
          { symbol: "Lambda", units: "1/m^2" },
          { symbol: "g_mu_nu", units: "dimensionless" },
          { symbol: "<T_mu_nu>", units: "Pa" },
        ],
      },
      {
        id: "stress_energy_conservation",
        expression: "nabla_mu T_mu_nu = 0",
        claim_tier: "diagnostic",
        symbols: [
          { symbol: "nabla_mu", units: "1/m" },
          { symbol: "T_mu_nu", units: "Pa" },
        ],
      },
      {
        id: "uncertainty_propagation",
        expression: "sigma_f^2 = sum_i ((partial f / partial x_i)^2 * sigma_x_i^2)",
        claim_tier: "diagnostic",
        symbols: [
          { symbol: "sigma_f", units: "output_units" },
          { symbol: "partial f / partial x_i", units: "output_units/input_units" },
          { symbol: "sigma_x_i", units: "input_units" },
        ],
      },
      {
        id: "runtime_safety_gate",
        expression: "abs(delta_T00 / max(abs(T00_ref), eps)) <= rho_delta_max AND qi_bound_ok = true",
        claim_tier: "diagnostic",
        symbols: [
          { symbol: "delta_T00", units: "J/m^3" },
          { symbol: "T00_ref", units: "J/m^3" },
          { symbol: "eps", units: "J/m^3" },
          { symbol: "rho_delta_max", units: "dimensionless" },
          { symbol: "qi_bound_ok", units: "boolean" },
        ],
      },
      {
        id: "curvature_unit_proxy_contract",
        expression: "kappa_proxy = map_units(curvature_signal, scale_assumptions) ; residual = abs(kappa_proxy - kappa_ref)/max(abs(kappa_ref), eps)",
        claim_tier: "diagnostic",
        symbols: [
          { symbol: "kappa_proxy", units: "1/m^2" },
          { symbol: "curvature_signal", units: "arb_curvature_units" },
          { symbol: "scale_assumptions", units: "dimensionless" },
          { symbol: "kappa_ref", units: "1/m^2" },
          { symbol: "eps", units: "1/m^2" },
        ],
      },
    ],
  };

  mutator?.(manifest);
  writeJson(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), manifest);
  return repoRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("validatePhysicsEquationBackbone", () => {
  it("passes for complete canonical equation manifest", () => {
    const repoRoot = makeFixture();
    const result = validatePhysicsEquationBackbone({ repoRoot });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when required equation entry is missing", () => {
    const repoRoot = makeFixture((manifest) => {
      const equations = manifest.equations as Array<Record<string, unknown>>;
      manifest.equations = equations.filter((entry) => entry.id !== "curvature_unit_proxy_contract");
    });

    const result = validatePhysicsEquationBackbone({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("missing required equation id: curvature_unit_proxy_contract");
  });

  it("fails when required symbols or units are absent", () => {
    const repoRoot = makeFixture((manifest) => {
      const equations = manifest.equations as Array<Record<string, unknown>>;
      const target = equations.find((entry) => entry.id === "stress_energy_conservation");
      if (!target) {
        throw new Error("fixture setup failed");
      }
      target.symbols = [{ symbol: "T_mu_nu", units: "Pa" }];
    });

    const result = validatePhysicsEquationBackbone({ repoRoot });
    expect(result.ok).toBe(false);
    const combined = result.errors.join("\n");
    expect(combined).toContain("equation stress_energy_conservation missing required symbol: nabla_mu");
    expect(combined).toContain("equation stress_energy_conservation missing required unit: 1/m");
  });



  it("registers canonical atomic energy-density proxy equation in repo backbone", () => {
    const repoRoot = process.cwd();
    const backbone = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), "utf8"),
    ) as {
      equations: Array<{ id: string; claim_tier?: string; symbols?: Array<{ symbol?: string; units?: string }> }>;
    };

    const equation = backbone.equations.find((entry) => entry.id === "atomic_energy_to_energy_density_proxy");
    expect(equation).toBeDefined();
    expect(equation?.claim_tier).toBe("diagnostic");
    expect(equation?.symbols?.some((entry) => entry.symbol === "rho_atomic_proxy" && entry.units === "J/m^3")).toBe(true);
    expect(equation?.symbols?.some((entry) => entry.symbol === "E_atomic" && entry.units === "J")).toBe(true);
    expect(equation?.symbols?.some((entry) => entry.symbol === "V_proxy" && entry.units === "m^3")).toBe(true);
  });

  it("registers curvature leverage and NHM2 full-solve regional tensor leverage", () => {
    const repoRoot = process.cwd();
    const backbone = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), "utf8"),
    ) as {
      equations: Array<{
        id: string;
        category?: string;
        claim_tier?: string;
        root_lane?: string;
        symbols?: Array<{ symbol?: string; units?: string }>;
      }>;
    };

    const scale = backbone.equations.find(
      (entry) => entry.id === "curvature_leverage_scale_normalization",
    );
    expect(scale).toBeDefined();
    expect(scale?.category).toBe("curvature_leverage");
    expect(scale?.claim_tier).toBe("diagnostic");
    expect(scale?.root_lane).toBe("curvature_leverage");
    expect(scale?.symbols?.some((entry) => entry.symbol === "Lambda" && entry.units === "dimensionless")).toBe(true);
    expect(scale?.symbols?.some((entry) => entry.symbol === "kappa" && entry.units === "1/m^2")).toBe(true);
    expect(scale?.symbols?.some((entry) => entry.symbol === "L" && entry.units === "m")).toBe(true);

    const nhm2 = backbone.equations.find(
      (entry) => entry.id === "nhm2_full_solve_regional_tensor_leverage",
    );
    expect(nhm2).toBeDefined();
    expect(nhm2?.category).toBe("curvature_leverage");
    expect(nhm2?.claim_tier).toBe("diagnostic");
    expect(nhm2?.root_lane).toBe("nhm2_full_solve");
    expect(nhm2?.symbols?.some((entry) => entry.symbol === "Lambda_R" && entry.units === "dimensionless")).toBe(true);
    expect(nhm2?.symbols?.some((entry) => entry.symbol === "G_ab[g_NHM2]" && entry.units === "1/m^2")).toBe(true);
    expect(nhm2?.symbols?.some((entry) => entry.symbol === "T_required_ab" && entry.units === "geometric_units")).toBe(true);
  });

  it("registers the stellar radiation null-model contract equations in repo backbone", () => {
    const repoRoot = process.cwd();
    const backbone = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), "utf8"),
    ) as {
      equations: Array<{ id: string; category?: string; root_lane?: string; symbols?: Array<{ symbol?: string; units?: string }> }>;
    };

    const planck = backbone.equations.find((entry) => entry.id === "planck_radiance_lambda");
    const spectralViability = backbone.equations.find((entry) => entry.id === "stellar_spectral_viability");

    expect(planck).toBeDefined();
    expect(planck?.category).toBe("stellar_radiation");
    expect(planck?.root_lane).toBe("physics_stellar_structure_nucleosynthesis");
    expect(planck?.symbols?.some((entry) => entry.symbol === "B_lambda(T)" && entry.units === "W/(m^3*sr)")).toBe(true);

    expect(spectralViability).toBeDefined();
    expect(spectralViability?.symbols?.some((entry) => entry.symbol === "continuum_rms" && entry.units === "dimensionless")).toBe(true);
    expect(spectralViability?.symbols?.some((entry) => entry.symbol === "bolometric_closure" && entry.units === "dimensionless")).toBe(true);
  });

  it("registers diagnostic stellar radiative transfer closures for M0 hardening", () => {
    const repoRoot = process.cwd();
    const backbone = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), "utf8"),
    ) as {
      equations: Array<{
        id: string;
        expression?: string;
        claim_tier?: string;
        symbols?: Array<{ symbol?: string; units?: string }>;
      }>;
    };

    const requiredIds = [
      "stellar_radiative_transfer_equation",
      "stellar_lte_source_function",
      "stellar_nlte_source_function",
      "stellar_continuum_opacity_sum",
      "stellar_population_ionization_balance_diagnostic",
    ];

    for (const id of requiredIds) {
      const equation = backbone.equations.find((entry) => entry.id === id);
      expect(equation).toBeDefined();
      expect(equation?.claim_tier).toBe("diagnostic");
    }

    const radiativeTransferEquation = backbone.equations.find(
      (entry) => entry.id === "stellar_radiative_transfer_equation",
    );
    expect(radiativeTransferEquation?.expression).toBe("dI_nu/dtau_nu = S_nu - I_nu");
    expect(radiativeTransferEquation?.symbols?.some((entry) => entry.symbol === "mu")).toBe(false);

    const radiativeTransferNote = fs.readFileSync(
      path.join(repoRoot, "docs", "knowledge", "physics", "stellar-radiative-transfer.md"),
      "utf8",
    );
    expect(radiativeTransferNote).toContain("dI_nu/dtau_nu = S_nu - I_nu");
    expect(radiativeTransferNote).toContain("dtau_nu = alpha_nu ds");
  });

  it("registers compact-star limit-observable descriptor equations in repo backbone", () => {
    const repoRoot = process.cwd();
    const backbone = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), "utf8"),
    ) as {
      equations: Array<{
        id: string;
        claim_tier?: string;
        category?: string;
        symbols?: Array<{ symbol?: string }>;
      }>;
    };

    const requiredIds = [
      "pulsar_period_period_derivative_state_point",
      "pulsar_spin_down_power_definition",
      "pulsar_death_line_limit_classifier",
      "pulsar_vacuum_gap_potential_definition",
      "pulsar_pair_cascade_threshold_descriptor",
      "pulsar_surface_mountain_gap_enhancement_descriptor",
      "pulsar_diffraction_band_spacing_observable",
      "compact_star_matter_hypothesis_envelope",
      "compact_star_micro_macro_bridge_descriptor",
    ];

    for (const id of requiredIds) {
      const equation = backbone.equations.find((entry) => entry.id === id);
      expect(equation).toBeDefined();
      expect(equation?.claim_tier).toBe("diagnostic");
      expect(equation?.category).toBe("compact_star_limit_observables");
    }

    const deathLine = backbone.equations.find(
      (entry) => entry.id === "pulsar_death_line_limit_classifier",
    );
    expect(deathLine?.symbols?.some((entry) => entry.symbol === "P")).toBe(true);
    expect(deathLine?.symbols?.some((entry) => entry.symbol === "Pdot")).toBe(true);
    expect(deathLine?.symbols?.some((entry) => entry.symbol === "status")).toBe(true);
  });

  it("registers the exploratory Penrose relational-correspondence definition equations", () => {
    const backbone = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "configs", "physics-equation-backbone.v1.json"),
        "utf8",
      ),
    ) as {
      equations: Array<{
        id: string;
        category?: string;
        claim_tier?: string;
        maturity_label?: string;
        root_lane?: string;
      }>;
    };
    const requiredIds = [
      "casimir_dp_penrose_relational_branch_state",
      "casimir_dp_penrose_relational_pullback_stress_difference",
      "casimir_dp_penrose_relational_pullback_metric_difference",
      "casimir_dp_penrose_correspondence_covariance_gate",
      "casimir_dp_penrose_correspondence_identity_swap_gate",
      "casimir_dp_penrose_newtonian_target_limit",
    ];
    for (const id of requiredIds) {
      const equation = backbone.equations.find((entry) => entry.id === id);
      expect(equation).toBeDefined();
      expect(equation?.category).toBe("stage0_candidate_definition");
      expect(equation?.claim_tier).toBe("diagnostic");
      expect(equation?.maturity_label).toBe("exploratory");
      expect(equation?.root_lane).toBe("physics_quantum_semiclassical");
    }
  });

  it("fails when manifest/equation claim tier is invalid", () => {
    const repoRoot = makeFixture((manifest) => {
      manifest.claim_tier = "exploratory";
      const equations = manifest.equations as Array<Record<string, unknown>>;
      equations[0].claim_tier = "exploratory";
    });

    const result = validatePhysicsEquationBackbone({ repoRoot });
    expect(result.ok).toBe(false);
    const combined = result.errors.join("\n");
    expect(combined).toContain("claim_tier must be one of diagnostic|reduced-order|certified");
    expect(combined).toContain("equations[0].claim_tier must be one of diagnostic|reduced-order|certified");
  });
});
