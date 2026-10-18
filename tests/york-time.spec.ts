import { describe, expect, it } from "vitest";
import {
  computeSurfaceDivergenceBeta,
  type YorkSample,
  type Vec3,
} from "../client/src/lib/york-time";
import { theta as alcubierreTheta, extrinsicCurvature } from "../client/src/physics/alcubierre";
import { buildEvolutionBrick } from "../server/gr/evolution/index.js";
import { createMinkowskiState, gridFromBounds } from "../modules/gr/bssn-state";

const TWO_PI = Math.PI * 2;

const axesUnit = { a: 1, b: 1, c: 1 };

type FieldFn = (pos: Vec3, theta: number, phi: number) => Vec3;

function sampleSphere(thetaCount: number, phiCount: number, field: FieldFn): YorkSample[] {
  const samples: YorkSample[] = [];
  for (let i = 0; i < thetaCount; i += 1) {
    // Include both poles so the grid matches the renderer bands.
    const theta = (i / (thetaCount - 1)) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let j = 0; j < phiCount; j += 1) {
      const phi = (j / phiCount) * TWO_PI;
      const pos: Vec3 = [
        sinTheta * Math.cos(phi),
        sinTheta * Math.sin(phi),
        cosTheta,
      ];
      const beta = field(pos, theta, phi);
      samples.push({ pos, beta });
    }
  }
  return samples;
}

const constantField: FieldFn = () => [0.05, -0.02, 0.01];

const curlField: FieldFn = (pos) => [-pos[1], pos[0], 0];

const varyingField: FieldFn = (pos, theta, phi) => {
  const tangential: Vec3 = [-pos[1], pos[0], 0];
  const scale = 1 + 0.5 * Math.sin(theta) * Math.cos(phi);
  return [tangential[0] * scale, tangential[1] * scale, tangential[2] * scale];
};

describe("computeSurfaceDivergenceBeta", () => {
  it("returns small divergence for constant tangential fields", () => {
    const samples = sampleSphere(16, 24, constantField);
    const stats = computeSurfaceDivergenceBeta(samples, axesUnit);
    expect(stats.divMax).toBeLessThan(0.2);
    expect(stats.divRMS).toBeLessThan(0.1);
  });

  it("detects positive divergence when the field varies across the shell", () => {
    const samples = sampleSphere(24, 32, varyingField);
    const stats = computeSurfaceDivergenceBeta(samples, axesUnit);
    expect(stats.divMax).toBeGreaterThan(1e-3);
    expect(stats.divRMS).toBeGreaterThan(5e-4);
  });

  it("keeps curl-like tangential fields near divergence-free", () => {
    const samples = sampleSphere(20, 28, curlField);
    const stats = computeSurfaceDivergenceBeta(samples, axesUnit);
    expect(stats.divMax).toBeLessThan(5e-3);
    expect(stats.divRMS).toBeLessThan(2e-3);
  });
});

describe("Alcubierre theta sign convention", () => {
  it("maps theta to -K and preserves front/back sign flip", () => {
    const dims: [number, number, number] = [9, 7, 5];
    const bounds = { min: [-1, -1, -1] as Vec3, max: [1, 1, 1] as Vec3 };
    const grid = gridFromBounds(dims, bounds);
    const state = createMinkowskiState(grid);
    const params = {
      R: 0.6,
      sigma: 5.0,
      v: 0.4,
      center: [0, 0, 0] as Vec3,
    };

    const [nx, ny, nz] = dims;
    const dx = (bounds.max[0] - bounds.min[0]) / nx;
    const dy = (bounds.max[1] - bounds.min[1]) / ny;
    const dz = (bounds.max[2] - bounds.min[2]) / nz;
    let idx = 0;
    for (let z = 0; z < nz; z += 1) {
      const pz = bounds.min[2] + (z + 0.5) * dz;
      for (let y = 0; y < ny; y += 1) {
        const py = bounds.min[1] + (y + 0.5) * dy;
        for (let x = 0; x < nx; x += 1) {
          const px = bounds.min[0] + (x + 0.5) * dx;
          const { Kxx, Kyy, Kzz } = extrinsicCurvature(px, py, pz, params);
          state.K[idx] = Kxx + Kyy + Kzz;
          idx += 1;
        }
      }
    }

    const brick = buildEvolutionBrick({ state, includeConstraints: false });
    const index = (x: number, y: number, z: number) => z * nx * ny + y * nx + x;
    const sampleAt = (x: number, y: number, z: number) => {
      const pos: Vec3 = [
        bounds.min[0] + (x + 0.5) * dx,
        bounds.min[1] + (y + 0.5) * dy,
        bounds.min[2] + (z + 0.5) * dz,
      ];
      const thetaExpected = alcubierreTheta(pos[0], pos[1], pos[2], params);
      const thetaBrick = brick.channels.theta.data[index(x, y, z)];
      return { thetaExpected, thetaBrick };
    };

    const midY = Math.floor(ny / 2);
    const midZ = Math.floor(nz / 2);
    const ahead = sampleAt(nx - 2, midY, midZ);
    const behind = sampleAt(1, midY, midZ);

    expect(Math.abs(ahead.thetaExpected)).toBeGreaterThan(1e-4);
    expect(Math.abs(behind.thetaExpected)).toBeGreaterThan(1e-4);
    expect(ahead.thetaBrick).toBeCloseTo(ahead.thetaExpected, 6);
    expect(behind.thetaBrick).toBeCloseTo(behind.thetaExpected, 6);
    expect(ahead.thetaBrick * behind.thetaBrick).toBeLessThan(0);
  });
});
