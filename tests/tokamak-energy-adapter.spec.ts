import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTokamakRzEnergyField,
  buildTokamakRzEnergyFromSnapshot,
  runTokamakEnergyField,
} from "../server/services/essence/tokamak-energy-adapter";
import { resetDbClient } from "../server/db/client";
import { findEnvelopeByOriginalHash, resetEnvelopeStore } from "../server/services/essence/store";

type FixtureManifest = {
  entries: Array<{
    input: Record<string, unknown>;
    expected?: { hashes?: { inputs_hash?: string; features_hash?: string } };
  }>;
};

const FIXTURE_MANIFEST_PATH = path.resolve(process.cwd(), "datasets", "tokamak-rz-energy.fixture.json");
const hasFixtureManifest = existsSync(FIXTURE_MANIFEST_PATH);
const itWithFixtureManifest = hasFixtureManifest ? it : it.skip;

let tmpDir = "";

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "tokamak-energy-adapter-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://tokamak-energy-adapter";
  await resetDbClient();
  await resetEnvelopeStore();
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_URL;
});

describe("tokamak energy adapter", () => {
  it("builds u_total from equilibrium + perturbation snapshot inputs", () => {
    const encode = (values: number[]) =>
      Buffer.from(Float32Array.from(values).buffer).toString("base64");
    const raster = (values: number[]) => ({
      encoding: "base64",
      dtype: "float32",
      endian: "little",
      order: "row-major",
      data_b64: encode(values),
    });
    const grid = { nx: 3, ny: 2, dx_m: 1, dy_m: 1, thickness_m: 1 };
    const frame = {
      kind: "rz-plane",
      r_min_m: 1.0,
      r_max_m: 1.2,
      z_min_m: -0.1,
      z_max_m: 0.1,
      axis_order: ["r", "z"],
    };
    const deltaB = [0.001, 0.001, 0.001, 0.002, 0.002, 0.002];
    const p = [0, 1, 2, 0, 1, 2];
    const j = [0.5, 0.25, 0.0, 0.5, 0.25, 0.0];
    const rad = [1, 2, 3, 1, 2, 3];
    const snapshot = {
      schema_version: "tokamak_rz_snapshot/1",
      device_id: "sparc-sim",
      shot_id: "shot-0002",
      timestamp_iso: "2025-01-02T00:00:00.000Z",
      data_cutoff_iso: "2025-01-02T00:00:00.000Z",
      grid,
      frame,
      separatrix_mask: raster([1, 1, 1, 1, 1, 1]),
      perturbations: {
        delta_b_T: raster(deltaB),
        p_Pa: raster(p),
        j_A_m2: raster(j),
        rad_W_m3: raster(rad),
      },
      manifest: {
        schema_version: "tokamak_channel_manifest/1",
        version: "v-test",
        device_id: "sparc-sim",
        channels: [
          { key: "u_deltaB_Jm3", weight: 1, normalization: { method: "none" } },
          { key: "u_gradp", weight: 0.1, normalization: { method: "none" } },
          { key: "u_J", weight: 0.01, normalization: { method: "none" } },
          { key: "u_rad", weight: 0.001, normalization: { method: "none" } },
        ],
        total_policy: { method: "weighted-sum", normalize_weights: false },
      },
    };

    const field = buildTokamakRzEnergyFromSnapshot(snapshot as any);
    const totalBuf = Buffer.from(field.components.u_total_Jm3.data_b64, "base64");
    const total = new Float32Array(totalBuf.buffer, totalBuf.byteOffset, totalBuf.byteLength / 4);
    const inv2mu0 = 1 / (2 * 4 * Math.PI * 1e-7);
    const uDeltaB0 = deltaB[0] * deltaB[0] * inv2mu0;
    const uGradp0 = 1;
    const uJ0 = j[0] * j[0];
    const uRad0 = rad[0];
    const expected0 = uDeltaB0 + 0.1 * uGradp0 + 0.01 * uJ0 + 0.001 * uRad0;
    expect(total[0]).toBeCloseTo(expected0, 6);
    const uDeltaB3 = deltaB[3] * deltaB[3] * inv2mu0;
    const uJ3 = j[3] * j[3];
    const uRad3 = rad[3];
    const expected3 = uDeltaB3 + 0.1 * uGradp0 + 0.01 * uJ3 + 0.001 * uRad3;
    expect(total[3]).toBeCloseTo(expected3, 6);
  });

  itWithFixtureManifest("matches fixture hashes and u_total output", () => {
    const manifest = JSON.parse(readFileSync(FIXTURE_MANIFEST_PATH, "utf8")) as FixtureManifest;
    const entry = manifest.entries[0];
    const field = buildTokamakRzEnergyField(entry.input as any);

    expect(field.inputs_hash).toBe(entry.expected?.hashes?.inputs_hash);
    expect(field.features_hash).toBe(entry.expected?.hashes?.features_hash);
    expect(field.manifest_hash).toBe("sha256:a6dbacb72b5c95de1a014142d14f312572076683169fb6bab0fea7bac778d5b6");
    expect(field.components.u_total_Jm3.data_b64).toBe("ZmYGQM3MXECamZlAzczUQAAACEGamSVB");
  });

  itWithFixtureManifest("persists envelope with manifest + mask artifacts", async () => {
    const manifest = JSON.parse(readFileSync(FIXTURE_MANIFEST_PATH, "utf8")) as FixtureManifest;
    const entry = manifest.entries[0];
    const field = await runTokamakEnergyField(entry.input as any, { personaId: "persona:tokamak-fixture" });

    const energyBuf = Buffer.from(field.components.u_total_Jm3.data_b64, "base64");
    const energyHash = crypto.createHash("sha256").update(energyBuf).digest("hex");
    const env = await findEnvelopeByOriginalHash("sha256", energyHash, "persona:tokamak-fixture");
    expect(env).toBeTruthy();

    const physics = env?.features?.physics as any;
    expect(physics?.kind).toBe("tokamak-energy-field");
    expect(physics?.summary?.manifest_hash).toBe(field.manifest_hash);
    expect(physics?.artifacts?.mask_url).toBeTruthy();
    expect(physics?.artifacts?.manifest_url).toBeTruthy();
    expect(env?.provenance?.information_boundary?.inputs_hash).toBe(field.inputs_hash);
  });
});
