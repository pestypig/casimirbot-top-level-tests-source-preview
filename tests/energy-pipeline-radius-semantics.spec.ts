import { describe, expect, it } from "vitest";

import {
  buildGrRequestPayload,
  resolveBubbleRadiusM,
  resolveHullGeometry,
  resolveHullReferenceRadiusM,
  type EnergyPipelineState,
} from "../server/energy-pipeline";

describe("energy pipeline radius semantics", () => {
  it("prefers explicit bubble radius over top-level radius mirrors", () => {
    const state = {
      bubble: { R: 280 },
      R: 2,
    } as EnergyPipelineState;

    expect(resolveBubbleRadiusM(state)).toBe(280);
  });

  it("prefers explicit hull geometry over scalar fallbacks", () => {
    const state = {
      hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      bubble: { R: 280 },
      R: 2,
    } as EnergyPipelineState;

    expect(resolveHullGeometry(state)).toMatchObject({
      Lx_m: 1007,
      Ly_m: 264,
      Lz_m: 173,
    });
    expect(resolveHullReferenceRadiusM(state)).toBe(503.5);
  });

  it("builds GR payloads from explicit hull geometry, not legacy scalar aliases", () => {
    const state = {
      tileArea_cm2: 25,
      gap_nm: 8,
      sag_nm: 16,
      temperature_K: 20,
      modulationFreq_GHz: 15,
      currentMode: "hover",
      dutyCycle: 0.12,
      dutyShip: 0.12,
      sectorCount: 80,
      concurrentSectors: 2,
      sectorStrobing: 2,
      qSpoilingFactor: 3,
      negativeFraction: 0.5,
      gammaGeo: 1,
      qMechanical: 1,
      qCavity: 100000,
      gammaVanDenBroeck: 500,
      P_avg: 0,
      hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      bubble: { R: 2 },
      R: 2,
    } as EnergyPipelineState;

    expect(buildGrRequestPayload(state).hull).toMatchObject({
      Lx_m: 1007,
      Ly_m: 264,
      Lz_m: 173,
    });
  });
});
