import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readPhaseCalibration,
  writePhaseCalibration,
} from "../server/utils/phase-calibration";

describe("phase calibration compatibility", () => {
  let calibPath: string;

  beforeEach(() => {
    calibPath = path.join(
      os.tmpdir(),
      `phase-calibration-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    process.env.HELIX_PHASE_CALIB_JSON = calibPath;
  });

  afterEach(async () => {
    delete process.env.HELIX_PHASE_CALIB_JSON;
    await fs.rm(calibPath, { force: true });
  });

  it("writes the renamed hull_reference_radius_m field", async () => {
    await writePhaseCalibration({
      tile_area_cm2: 25,
      hull_reference_radius_m: 503.5,
      P_target_W: 100e6,
      M_target_kg: 1405,
      zeta_target: 0.5,
    });

    const payload = JSON.parse(await fs.readFile(calibPath, "utf8"));
    expect(payload.hull_reference_radius_m).toBe(503.5);
    expect("ship_radius_m" in payload).toBe(false);
  });

  it("reads legacy ship_radius_m files through the compatibility reader", async () => {
    await fs.writeFile(
      calibPath,
      JSON.stringify({
        tile_area_cm2: 25,
        ship_radius_m: 86.5,
        P_target_W: 50e6,
        M_target_kg: 1400,
        zeta_target: 0.4,
        timestamp: "2026-03-26T00:00:00.000Z",
        source: "manual",
      }),
      "utf8",
    );

    const config = await readPhaseCalibration();
    expect(config).not.toBeNull();
    expect(config?.hull_reference_radius_m).toBe(86.5);
    expect(config?.source).toBe("manual");
  });
});

