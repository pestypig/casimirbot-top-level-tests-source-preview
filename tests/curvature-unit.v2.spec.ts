import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CurvatureUnitInput } from "../shared/essence-physics";
import { C, G } from "../shared/physics-const";
import { SI_UNITS } from "../shared/unit-system";
import { curvatureUnitHandler, runCurvatureUnitWithProvenance } from "../server/skills/physics.curvature";
import { getBlob, putBlob } from "../server/storage";
import { resetDbClient } from "../server/db/client";
import { findEnvelopeByOriginalHash, resetEnvelopeStore } from "../server/services/essence/store";
import { stableJsonStringify } from "../server/utils/stable-json";

type GaussianSource = { x_m: number; y_m: number; sigma_m: number; peak_u_Jm3: number };

const sha256Hex = (buffer: Buffer): string => crypto.createHash("sha256").update(buffer).digest("hex");
type FixtureManifest = {
  entries: Array<{
    input: Record<string, unknown>;
    expected?: { hashes?: { inputs_hash?: string; features_hash?: string } };
  }>;
};

const FIXTURE_MANIFEST_PATH = path.resolve(process.cwd(), "datasets", "u-field-rz.fixture.json");
const hasFixtureManifest = existsSync(FIXTURE_MANIFEST_PATH);
const itWithFixtureManifest = hasFixtureManifest ? it : it.skip;

function synthesizeGaussianField(grid: { nx: number; ny: number; dx_m: number; dy_m: number }, sources: GaussianSource[]) {
  const { nx, ny, dx_m, dy_m } = grid;
  const u = new Float32Array(nx * ny);
  const cx = (nx - 1) / 2;
  const cy = (ny - 1) / 2;
  for (let j = 0; j < ny; j++) {
    const y_m = (j - cy) * dy_m;
    for (let i = 0; i < nx; i++) {
      const x_m = (i - cx) * dx_m;
      let val = 0;
      for (const s of sources) {
        const dx = x_m - s.x_m;
        const dy = y_m - s.y_m;
        const r2 = dx * dx + dy * dy;
        val += s.peak_u_Jm3 * Math.exp(-0.5 * r2 / (s.sigma_m * s.sigma_m));
      }
      u[j * nx + i] = val;
    }
  }
  return u;
}

function float32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
}

async function readBlobToFloat32(uri: string): Promise<Float32Array> {
  const stream = await getBlob(uri);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<unknown>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
  }
  const buf = Buffer.concat(chunks);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function buildPeriodicPoissonField(grid: { nx: number; ny: number; dx_m: number; dy_m: number; thickness_m: number }) {
  const { nx, ny, dx_m, dy_m, thickness_m } = grid;
  const Lx = nx * dx_m;
  const Ly = ny * dy_m;
  const kx = (2 * Math.PI) / Lx;
  const ky = (2 * Math.PI) / Ly;
  const lambda =
    (2 * Math.cos(kx * dx_m) - 2) / (dx_m * dx_m) +
    (2 * Math.cos(ky * dy_m) - 2) / (dy_m * dy_m);

  const phi = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    const yPos = y * dy_m;
    for (let x = 0; x < nx; x++) {
      const xPos = x * dx_m;
      phi[y * nx + x] = Math.sin(kx * xPos) * Math.sin(ky * yPos);
    }
  }

  const rho = new Float32Array(phi.length);
  const u = new Float32Array(phi.length);
  const invThickness = 1 / thickness_m;
  for (let i = 0; i < phi.length; i++) {
    rho[i] = (lambda * phi[i]) / (4 * Math.PI * G);
    u[i] = rho[i] * C * C * invThickness;
  }

  return { phi, u };
}

function buildDirichletPoissonField(grid: { nx: number; ny: number; dx_m: number; dy_m: number; thickness_m: number }) {
  const { nx, ny, dx_m, dy_m, thickness_m } = grid;
  const Lx = (nx - 1) * dx_m;
  const Ly = (ny - 1) * dy_m;
  const kx = Math.PI / Lx;
  const ky = Math.PI / Ly;
  const lambda =
    (2 * Math.cos(kx * dx_m) - 2) / (dx_m * dx_m) +
    (2 * Math.cos(ky * dy_m) - 2) / (dy_m * dy_m);

  const phi = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    const yPos = y * dy_m;
    for (let x = 0; x < nx; x++) {
      const xPos = x * dx_m;
      phi[y * nx + x] = -Math.sin(kx * xPos) * Math.sin(ky * yPos);
    }
  }

  const rho = new Float32Array(phi.length);
  const u = new Float32Array(phi.length);
  const invThickness = 1 / thickness_m;
  for (let i = 0; i < phi.length; i++) {
    rho[i] = (lambda * phi[i]) / (4 * Math.PI * G);
    u[i] = rho[i] * C * C * invThickness;
  }

  return { phi, u };
}

let tmpDir = "";

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "curvature-unit-v2-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://curvature-unit-v2";
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

describe("CurvatureUnit v2: schema + u_field handling", () => {
  it("accepts u_field (base64) and normalizes data URLs / whitespace", () => {
    const nx = 2;
    const ny = 2;
    const u = new Float32Array([1, 2, 3, 4]);
    const b64 = float32ToBase64(u);
    const withNoise = `data:application/octet-stream;base64,${b64.slice(0, 6)}\n${b64.slice(6)}  `;

    const parsed = CurvatureUnitInput.parse({
      grid: { nx, ny, dx_m: 1, dy_m: 1, thickness_m: 1 },
      u_field: {
        encoding: "base64",
        dtype: "float32",
        endian: "little",
        order: "row-major",
        data_b64: withNoise,
      },
    });

    expect(parsed.boundary).toBe("dirichlet0");
    expect(parsed.units).toEqual(SI_UNITS);
    expect(parsed.u_field?.encoding).toBe("base64");
    expect((parsed.u_field as any).data_b64).toBe(b64);
  });

  it("rejects ambiguous inputs (both sources and u_field)", () => {
    expect(() =>
      CurvatureUnitInput.parse({
        grid: { nx: 4, ny: 4, dx_m: 1, dy_m: 1, thickness_m: 1 },
        sources: [{ x_m: 0, y_m: 0, sigma_m: 0.5, peak_u_Jm3: 1 }],
        u_field: {
          encoding: "base64",
          dtype: "float32",
          endian: "little",
          order: "row-major",
          data_b64: "AAAA",
        },
      }),
    ).toThrow();
  });
});

describe("CurvatureUnit v2: determinism + hashing", () => {
  it("produces deterministic artifacts/hashes for a 256×256 raster u_field (base64 vs blob)", async () => {
    const grid = { nx: 256, ny: 256, dx_m: 0.02, dy_m: 0.02, thickness_m: 1 };
    const sources: GaussianSource[] = [
      { x_m: -0.2, y_m: 0, sigma_m: 0.05, peak_u_Jm3: 1_000 },
      { x_m: 0.2, y_m: 0, sigma_m: 0.05, peak_u_Jm3: 1_000 },
    ];
    const u = synthesizeGaussianField(grid, sources);
    const uBuf = Buffer.from(u.buffer, u.byteOffset, u.byteLength);
    const uB64 = uBuf.toString("base64");
    const uBlob = await putBlob(uBuf, { contentType: "application/octet-stream" });
    const expectedEnergyCid = uBlob.cid;
    const expectedEnergyHash = sha256Hex(uBuf);
    expect(expectedEnergyCid).toBe(`cid:${expectedEnergyHash}`);

    const base64Input: any = {
      units: SI_UNITS,
      grid,
      u_field: {
        encoding: "base64",
        dtype: "float32",
        endian: "little",
        order: "row-major",
        data_b64: uB64,
      },
      constants: { c: 299_792_458, G: 6.6743e-11 },
    };
    const blobInput: any = {
      units: SI_UNITS,
      grid,
      u_field: {
        encoding: "blob",
        dtype: "float32",
        endian: "little",
        order: "row-major",
        uri: uBlob.uri,
        cid: uBlob.cid,
      },
      constants: { c: 299_792_458, G: 6.6743e-11 },
    };

    const a = (await curvatureUnitHandler(base64Input, { personaId: "persona:curvature-v2-base64" })) as any;
    const b = (await curvatureUnitHandler(blobInput, { personaId: "persona:curvature-v2-blob" })) as any;

    expect(a.artifacts.energy_field_cid).toBe(expectedEnergyCid);
    expect(b.artifacts.energy_field_cid).toBe(expectedEnergyCid);
    expect(a.artifacts.potential_cid).toBe(b.artifacts.potential_cid);
    expect(a.summary.residual_rms).toBeLessThan(1e-4);
    expect(b.summary.residual_rms).toBeLessThan(1e-4);

    const potentialHash = String(a.artifacts.potential_cid ?? "").replace(/^cid:/, "");
    const envA = await findEnvelopeByOriginalHash("sha256", potentialHash, "persona:curvature-v2-base64");
    const envB = await findEnvelopeByOriginalHash("sha256", potentialHash, "persona:curvature-v2-blob");
    expect(envA).toBeTruthy();
    expect(envB).toBeTruthy();

    expect(envA?.provenance?.information_boundary?.inputs_hash).toBe(envB?.provenance?.information_boundary?.inputs_hash);
    expect(envA?.provenance?.information_boundary?.features_hash).toBe(envB?.provenance?.information_boundary?.features_hash);
    expect(envA?.provenance?.information_boundary?.inputs_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(envA?.provenance?.information_boundary?.features_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes hashes when boundary conditions change (Dirichlet vs Neumann vs periodic)", async () => {
    const grid = { nx: 64, ny: 64, dx_m: 0.02, dy_m: 0.02, thickness_m: 1 };
    const sources: GaussianSource[] = [
      { x_m: -0.2, y_m: 0, sigma_m: 0.05, peak_u_Jm3: 1_000 },
      { x_m: 0.2, y_m: 0, sigma_m: 0.05, peak_u_Jm3: 1_000 },
    ];
    const u = synthesizeGaussianField(grid, sources);
    const uB64 = float32ToBase64(u);

    const mkInput = (boundary: "dirichlet0" | "neumann0" | "periodic") => ({
      units: SI_UNITS,
      grid,
      boundary,
      u_field: { encoding: "base64", dtype: "float32", endian: "little", order: "row-major", data_b64: uB64 },
      constants: { c: 299_792_458, G: 6.6743e-11 },
    });

    const dir = (await curvatureUnitHandler(mkInput("dirichlet0"), { personaId: "persona:curv-bc-dir" })) as any;
    const neu = (await curvatureUnitHandler(mkInput("neumann0"), { personaId: "persona:curv-bc-neu" })) as any;
    const per = (await curvatureUnitHandler(mkInput("periodic"), { personaId: "persona:curv-bc-per" })) as any;

    expect(dir.artifacts.potential_cid).not.toBe(neu.artifacts.potential_cid);
    expect(dir.artifacts.potential_cid).not.toBe(per.artifacts.potential_cid);
    expect(neu.artifacts.potential_cid).not.toBe(per.artifacts.potential_cid);
    expect(dir.summary.residual_rms).toBeLessThan(1e-5);
    expect(neu.summary.residual_rms).toBeLessThan(1e-5);
    expect(per.summary.residual_rms).toBeLessThan(1e-5);

    const potDir = String(dir.artifacts.potential_cid ?? "").replace(/^cid:/, "");
    const potNeu = String(neu.artifacts.potential_cid ?? "").replace(/^cid:/, "");
    const envDir = await findEnvelopeByOriginalHash("sha256", potDir, "persona:curv-bc-dir");
    const envNeu = await findEnvelopeByOriginalHash("sha256", potNeu, "persona:curv-bc-neu");
    expect(envDir?.provenance?.information_boundary?.inputs_hash).not.toBe(envNeu?.provenance?.information_boundary?.inputs_hash);
  });

  it("keeps Gaussian fields stable and repeatable", async () => {
    const grid = { nx: 64, ny: 64, dx_m: 0.05, dy_m: 0.05, thickness_m: 1 };
    const sources: GaussianSource[] = [
      { x_m: -0.25, y_m: 0.1, sigma_m: 0.08, peak_u_Jm3: 1_200 },
      { x_m: 0.2, y_m: -0.1, sigma_m: 0.06, peak_u_Jm3: 900 },
    ];
    const u = synthesizeGaussianField(grid, sources);
    const uB64 = float32ToBase64(u);

    const input: any = {
      units: SI_UNITS,
      grid,
      boundary: "dirichlet0",
      u_field: { encoding: "base64", dtype: "float32", endian: "little", order: "row-major", data_b64: uB64 },
      constants: { c: C, G },
    };

    const a = (await curvatureUnitHandler(input, { personaId: "persona:curv-gauss-a" })) as any;
    const b = (await curvatureUnitHandler(input, { personaId: "persona:curv-gauss-b" })) as any;

    expect(a.artifacts.potential_cid).toBe(b.artifacts.potential_cid);
    expect(a.artifacts.grad_mag_cid).toBe(b.artifacts.grad_mag_cid);
    expect(a.artifacts.laplacian_cid).toBe(b.artifacts.laplacian_cid);
    expect(a.artifacts.residual_cid).toBe(b.artifacts.residual_cid);
    expect(a.summary.residual_rms).toBe(b.summary.residual_rms);
    expect(a.summary.residual_rms).toBeLessThan(5e-3);
    expect(a.summary.stability.nan_count).toBe(0);
    expect(a.summary.stability.grad_rms).toBeGreaterThan(0);
    expect(a.summary.stability.laplacian_rms).toBeGreaterThan(0);
  });

  it("solves a periodic Poisson mode with low relative error", async () => {
    const grid = { nx: 32, ny: 32, dx_m: 0.1, dy_m: 0.1, thickness_m: 1 };
    const { phi: phiTrue, u } = buildPeriodicPoissonField(grid);
    const uB64 = float32ToBase64(u);

    const result = (await curvatureUnitHandler(
      {
        units: SI_UNITS,
        grid,
        boundary: "periodic",
        u_field: { encoding: "base64", dtype: "float32", endian: "little", order: "row-major", data_b64: uB64 },
        constants: { c: C, G },
      },
      { personaId: "persona:curv-poisson" },
    )) as any;

    const phiOut = await readBlobToFloat32(result.artifacts.potential_url);
    let sse = 0;
    let sseTrue = 0;
    for (let i = 0; i < phiOut.length; i++) {
      const diff = phiOut[i] - phiTrue[i];
      sse += diff * diff;
      sseTrue += phiTrue[i] * phiTrue[i];
    }
    const rmse = Math.sqrt(sse / phiOut.length);
    const rmsTrue = Math.sqrt(sseTrue / phiOut.length);
    expect(rmse / (rmsTrue || 1)).toBeLessThan(0.2);
    expect(result.summary.residual_rms).toBeLessThan(5e-2);
    expect(result.summary.k_metrics.k0).toBeGreaterThanOrEqual(0);
    expect(result.summary.k_metrics.k1).toBeGreaterThanOrEqual(0);
    expect(result.summary.k_metrics.k2).toBeGreaterThanOrEqual(0);
    expect(result.artifacts.ridge_spines_url).toBeTruthy();
  });

  it("solves a Dirichlet Poisson mode with low relative error", async () => {
    const grid = { nx: 33, ny: 33, dx_m: 0.1, dy_m: 0.1, thickness_m: 1 };
    const { phi: phiTrue, u } = buildDirichletPoissonField(grid);
    const uB64 = float32ToBase64(u);

    const result = (await curvatureUnitHandler(
      {
        units: SI_UNITS,
        grid,
        boundary: "dirichlet0",
        u_field: { encoding: "base64", dtype: "float32", endian: "little", order: "row-major", data_b64: uB64 },
        constants: { c: C, G },
      },
      { personaId: "persona:curv-poisson-dirichlet" },
    )) as any;

    const phiOut = await readBlobToFloat32(result.artifacts.potential_url);
    let sse = 0;
    let sseTrue = 0;
    let n = 0;
    for (let y = 1; y < grid.ny - 1; y++) {
      for (let x = 1; x < grid.nx - 1; x++) {
        const i = y * grid.nx + x;
        const diff = phiOut[i] - phiTrue[i];
        sse += diff * diff;
        sseTrue += phiTrue[i] * phiTrue[i];
        n += 1;
      }
    }
    const rmse = Math.sqrt(sse / (n || 1));
    const rmsTrue = Math.sqrt(sseTrue / (n || 1));
    expect(rmse / (rmsTrue || 1)).toBeLessThan(0.2);
    expect(result.summary.residual_rms).toBeLessThan(0.2);
    expect(result.summary.stability.nan_count).toBe(0);
  });

  it("uses the RZ solver path and honors masks", async () => {
    const grid = { nx: 24, ny: 24, dx_m: 0.02, dy_m: 0.02, thickness_m: 1 };
    const sources: GaussianSource[] = [{ x_m: 0, y_m: 0, sigma_m: 0.08, peak_u_Jm3: 1_000 }];
    const u = synthesizeGaussianField(grid, sources);
    const uB64 = float32ToBase64(u);

    const mask = new Float32Array(grid.nx * grid.ny);
    for (let y = 0; y < grid.ny; y++) {
      for (let x = 0; x < grid.nx; x++) {
        mask[y * grid.nx + x] = x < grid.nx / 2 ? 1 : 0;
      }
    }
    const maskB64 = float32ToBase64(mask);

    const cart = (await curvatureUnitHandler(
      {
        units: SI_UNITS,
        grid,
        boundary: "dirichlet0",
        u_field: { encoding: "base64", dtype: "float32", endian: "little", order: "row-major", data_b64: uB64 },
        constants: { c: C, G },
      },
      { personaId: "persona:curv-cart" },
    )) as any;

    const rz = (await curvatureUnitHandler(
      {
        units: SI_UNITS,
        grid,
        frame: { kind: "rz-plane", r_min_m: 1.0, r_max_m: 1.46, z_min_m: -0.23, z_max_m: 0.23 },
        boundary: "dirichlet0",
        u_field: { encoding: "base64", dtype: "float32", endian: "little", order: "row-major", data_b64: uB64 },
        mask: { encoding: "base64", dtype: "float32", endian: "little", order: "row-major", data_b64: maskB64 },
        constants: { c: C, G },
      },
      { personaId: "persona:curv-rz" },
    )) as any;

    expect(cart.artifacts.potential_cid).not.toBe(rz.artifacts.potential_cid);
    expect(rz.summary.stability.mask_coverage).toBeCloseTo(0.5, 6);
    expect(rz.artifacts.grad_mag_url).toBeTruthy();
    expect(rz.artifacts.laplacian_url).toBeTruthy();
    expect(rz.artifacts.residual_url).toBeTruthy();

    const phiMasked = await readBlobToFloat32(rz.artifacts.potential_url);
    let maskedMax = 0;
    for (let y = 0; y < grid.ny; y++) {
      for (let x = Math.floor(grid.nx / 2); x < grid.nx; x++) {
        maskedMax = Math.max(maskedMax, Math.abs(phiMasked[y * grid.nx + x]));
      }
    }
    expect(maskedMax).toBeLessThan(1e-6);
  });

  itWithFixtureManifest("produces deterministic hashes for the RZ u_field fixtures", async () => {
    const manifest = JSON.parse(readFileSync(FIXTURE_MANIFEST_PATH, "utf8")) as FixtureManifest;

    for (let i = 0; i < manifest.entries.length; i++) {
      const entry = manifest.entries[i];
      const ctx = {
        personaId: `persona:curv-fixture-${i}`,
        dataCutoffIso: "2025-01-01T00:00:00.000Z",
      };
      const runA = await runCurvatureUnitWithProvenance(entry.input, ctx);
      const runB = await runCurvatureUnitWithProvenance(entry.input, {
        ...ctx,
        personaId: `persona:curv-fixture-${i}-b`,
      });

      expect(runA.hashes).toEqual(runB.hashes);
      expect(runA.information_boundary.inputs_hash).toBe(entry.expected?.hashes?.inputs_hash);
      expect(runA.information_boundary.features_hash).toBe(entry.expected?.hashes?.features_hash);

      const manifestJson = stableJsonStringify((entry.input as any).u_manifest);
      const manifestHash = crypto.createHash("sha256").update(manifestJson).digest("hex");
      expect(runA.hashes.manifest_hash).toBe(`sha256:${manifestHash}`);
      expect(runA.result.inputs.u_manifest_hash).toBe(runA.hashes.manifest_hash);

      expect(runA.envelope.header.id).toBe(runA.envelope_id);
      expect(runA.envelope.provenance.information_boundary.inputs_hash).toBe(
        runA.information_boundary.inputs_hash,
      );

      expect(runA.result.artifacts.manifest_url).toBeTruthy();
      expect(runA.result.artifacts.manifest_cid).toBeTruthy();
    }
  });
});
