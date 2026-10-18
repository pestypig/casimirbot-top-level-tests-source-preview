import { describe, expect, it } from "vitest";
import { kappa_u } from "../shared/curvature-proxy";
import { computeAtomicStressEnergyProxy } from "../client/src/lib/atomic-orbitals";

describe("atomic stress-energy proxy compute", () => {
  it("maps atomic energy + effective volume into deterministic proxy payload with governance metadata", () => {
    const proxy = computeAtomicStressEnergyProxy({
      energy_scalar_eV: 13.6,
      effective_volume_m3: 1e-30,
    });

    expect(proxy.energy_scalar_eV).toBe(13.6);
    expect(proxy.energy_scalar_J).toBeCloseTo(13.6 * 1.602176634e-19, 25);
    expect(proxy.effective_volume_m3).toBe(1e-30);
    expect(proxy.energy_density_J_m3).toBeCloseTo(proxy.energy_scalar_J / 1e-30, 18);
    expect(proxy.kappa_proxy_m2).toBeCloseTo(kappa_u(proxy.energy_density_J_m3), 25);

    expect(proxy.units).toEqual({
      energy_scalar_eV: "eV",
      energy_scalar_J: "J",
      effective_volume_m3: "m^3",
      energy_density_J_m3: "J/m^3",
      kappa_proxy_m2: "m^-2",
    });

    expect(proxy.governance.equation_ref).toBe("atomic_energy_to_energy_density_proxy");
    expect(proxy.governance.uncertainty_model_id.length).toBeGreaterThan(0);
    expect(proxy.governance.citation_claim_ids).toContain("atomic_energy_to_energy_density_proxy.v1");
    expect(proxy.governance.claim_tier).toBe("diagnostic");
    expect(proxy.governance.provenance_class).toBe("proxy");
    expect(proxy.governance.certifying).toBe(false);

    expect(proxy.uncertainty.relative_1sigma).toBeGreaterThan(0);
    expect(proxy.uncertainty.absolute_1sigma_J_m3).toBeCloseTo(
      Math.abs(proxy.energy_density_J_m3) * proxy.uncertainty.relative_1sigma,
      18,
    );
    expect(proxy.uncertainty.assumptions.toLowerCase()).toContain("volume");
    expect(proxy.uncertainty.labels).toContain("volume_scale_ambiguity");

    expect(proxy.semantics.interpretation).toBe("diagnostic proxy");
    expect(proxy.semantics.not_stress_energy_tensor_inference).toBe(true);
  });

  it("clamps non-finite effective volume to deterministic floor", () => {
    const proxy = computeAtomicStressEnergyProxy({
      energy_scalar_eV: 1,
      effective_volume_m3: 0,
    });

    expect(proxy.effective_volume_m3).toBeGreaterThan(0);
    expect(Number.isFinite(proxy.energy_density_J_m3)).toBe(true);
    expect(Number.isFinite(proxy.kappa_proxy_m2)).toBe(true);
  });
});
