import { beforeAll, describe, expect, it } from "vitest";
import { resetDbClient } from "../server/db/client";
import { curvatureUnitHandler } from "../server/skills/physics.curvature";
import { SI_UNITS } from "../shared/unit-system";

describe("CurvatureUnit invariants", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = "pg-mem://theory-conservation";
    await resetDbClient();
  });

  it("preserves mass equivalence and small Poisson residuals", async () => {
    const result = (await curvatureUnitHandler(
      {
        units: SI_UNITS,
        grid: { nx: 64, ny: 64, dx_m: 0.02, dy_m: 0.02, thickness_m: 1 },
        sources: [
          { x_m: -0.2, y_m: 0, sigma_m: 0.05, peak_u_Jm3: 1_000 },
          { x_m: 0.2, y_m: 0, sigma_m: 0.05, peak_u_Jm3: 1_000 },
        ],
        constants: { c: 299_792_458, G: 6.6743e-11 },
      },
      { personaId: "persona:test" },
    )) as any;

    expect(result.summary.total_energy_J).toBeGreaterThan(0);
    expect(result.summary.mass_equivalent_kg).toBeGreaterThan(0);
    expect(result.summary.residual_rms).toBeLessThan(1e-6);
    expect(result.summary.vector_roots.length).toBeGreaterThan(0);
    expect(result.inputs?.units?.system).toBe("SI");
    expect(result.grid?.dx_m).toBeCloseTo(0.02, 12);
  });
});
