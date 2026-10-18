import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadSparcRotationImport } from "../server/modules/starsim/accordion/sparc-rotation-import";
import { computeStarSimGalacticRotationControls } from "../shared/starsim-galactic-rotation-controls";

describe("StarSim galactic rotation controls", () => {
  it("accepts a SPARC-like fixture and computes residuals", () => {
    const imported = loadSparcRotationImport("tests/fixtures/starsim-accordion/sparc-rotation-curve.fixture.json");
    const controls = computeStarSimGalacticRotationControls({
      galaxyId: imported.galaxyId,
      points: imported.points,
      models: ["baryonic_newtonian", "dark_matter_halo_nfw", "mond_low_acceleration"],
    });
    expect(controls.map((control) => control.model)).toContain("baryonic_newtonian");
    expect(controls[0].summary.rmsResidual_km_s).toBeGreaterThan(0);
    expect(controls[1].rotationCurve[0].residual_km_s).toBeCloseTo(4);
  });

  it("includes baryonic, dark-matter, and MOND labels without selecting a winner", () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/starsim-accordion/accordion-local-volume.fixture.json", "utf8"));
    const controls = computeStarSimGalacticRotationControls({
      galaxyId: fixture.rotation.galaxyId,
      points: fixture.rotation.points,
      models: fixture.rotation.models,
    });
    expect(controls.map((control) => control.model)).toEqual([
      "baryonic_newtonian",
      "dark_matter_halo_nfw",
      "dark_matter_halo_burkert",
      "mond_low_acceleration",
      "empirical_sparc_reference",
    ]);
    expect(controls.every((control) => control.caveats.includes("galactic_dynamics_result_does_not_select_physics_winner"))).toBe(true);
  });

  it("rejects direct ER=EPR interpretation of rotation residuals", () => {
    expect(() =>
      computeStarSimGalacticRotationControls({
        galaxyId: "blocked",
        points: [{ radius_kpc: 1, observedVelocity_km_s: 100, baryonicVelocity_km_s: 70 }],
        interpretationRequest: "direct_er_epr",
      }),
    ).toThrow(/direct ER=EPR/);
  });
});
