import { describe, expect, it } from "vitest";
import {
  buildNeedleHullMark2SimulationParameters,
  NHM2_CAVITY_CONTRACT,
  NHM2_FULL_HULL_GEOMETRY,
  NHM2_REDUCED_ORDER_REFERENCE,
  NHM2_SIMULATION_CONTROL_DEFAULTS,
  NHM2_SIMULATION_PARAMETERS,
} from "../shared/needle-hull-mark2-cavity-contract";
import { PROMOTED_WARP_PROFILE } from "../shared/warp-promoted-profile";

const legacyShipRadiusKey = `${"shipRadius"}_m`;

describe("NHM2 simulation defaults", () => {
  it("derives the canonical simulation payload from the NHM2 cavity contract", () => {
    expect(NHM2_SIMULATION_PARAMETERS.geometry).toBe("bowl");
    expect(NHM2_SIMULATION_PARAMETERS.moduleType).toBe("warp");
    expect(NHM2_SIMULATION_PARAMETERS.gap).toBe(
      NHM2_CAVITY_CONTRACT.geometry.gap_nm,
    );
    expect(NHM2_SIMULATION_PARAMETERS.radius).toBe(
      NHM2_CAVITY_CONTRACT.geometry.pocketDiameter_um / 2,
    );
    expect(NHM2_SIMULATION_PARAMETERS.temperature).toBe(
      NHM2_CAVITY_CONTRACT.thermal.temperature_K,
    );
    expect(NHM2_SIMULATION_PARAMETERS.dynamicConfig?.cavityQ).toBe(
      NHM2_SIMULATION_CONTROL_DEFAULTS.qFactor,
    );
    expect(NHM2_SIMULATION_PARAMETERS.dynamicConfig?.sectorCount).toBe(
      NHM2_CAVITY_CONTRACT.geometry.sectorCount,
    );
    expect(
      NHM2_SIMULATION_PARAMETERS.dynamicConfig?.lightCrossingTimeNs,
    ).toBeCloseTo(NHM2_SIMULATION_CONTROL_DEFAULTS.fullHullTauLCNs, 6);
    expect(NHM2_SIMULATION_PARAMETERS.advanced?.maxXiPoints).toBe(
      NHM2_SIMULATION_CONTROL_DEFAULTS.xiPoints,
    );
  });

  it("keeps full-hull and reduced-order references separate", () => {
    expect(NHM2_FULL_HULL_GEOMETRY).toMatchObject({
      Lx_m: 1007,
      Ly_m: 264,
      Lz_m: 173,
    });
    expect(legacyShipRadiusKey in NHM2_CAVITY_CONTRACT.geometry).toBe(false);
    expect(legacyShipRadiusKey in PROMOTED_WARP_PROFILE).toBe(false);
    expect(NHM2_REDUCED_ORDER_REFERENCE.radius_m).toBe(2);
    expect(NHM2_SIMULATION_CONTROL_DEFAULTS.hullReferenceRadiusM).toBe(503.5);
    expect(NHM2_SIMULATION_CONTROL_DEFAULTS.reducedOrderReferenceRadiusM).toBe(2);
    expect(NHM2_SIMULATION_CONTROL_DEFAULTS.fullHullTauLCNs).toBeCloseTo(
      NHM2_SIMULATION_CONTROL_DEFAULTS.fullHullTauLCMs * 1e6,
      6,
    );
  });

  it("keeps lightCrossingTimeNs anchored to full-hull tau_LC, not reduced-order metadata", () => {
    const reducedOrderTauLcNs =
      (NHM2_REDUCED_ORDER_REFERENCE.tauLC_ms ?? 0) * 1e6;

    expect(NHM2_SIMULATION_PARAMETERS.dynamicConfig?.lightCrossingTimeNs).toBeCloseTo(
      NHM2_SIMULATION_CONTROL_DEFAULTS.fullHullTauLCNs,
      6,
    );
    expect(
      Math.abs(
        (NHM2_SIMULATION_PARAMETERS.dynamicConfig?.lightCrossingTimeNs ?? 0) -
          reducedOrderTauLcNs,
      ),
    ).toBeGreaterThan(1);
  });

  it("rebuilds the canonical payload deterministically", () => {
    expect(buildNeedleHullMark2SimulationParameters()).toEqual(
      NHM2_SIMULATION_PARAMETERS,
    );
  });
});
