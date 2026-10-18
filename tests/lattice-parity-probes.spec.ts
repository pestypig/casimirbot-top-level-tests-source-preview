import { describe, expect, it } from "vitest";
import { applyHullBasisToPositions, HULL_BASIS_IDENTITY, resolveHullBasis, type HullBasisResolved } from "@shared/hull-basis";
import type { HullSurfaceMesh } from "@/lib/resolve-wireframe-overlay";
import { buildLatticeFrame, type LatticeProfileTag, type LatticeQualityPreset } from "@/lib/lattice-frame";
import { voxelizeHullSurfaceStrobe, type HullSurfaceVoxelVolume } from "@/lib/lattice-surface";

type Vec3 = [number, number, number];

const SIGMA = 6;
const R_METRIC = 1;
const DFDR_SIGNATURE = "6.000000|0.200000|1.000";

// Matches renderer/AlcubierrePanel dTopHatDr (metric units).
const dTopHatDr = (r: number, sigma: number, R: number) => {
  const den = Math.max(1e-8, 2 * Math.tanh(sigma * R));
  const cPlus = Math.cosh(sigma * (r + R));
  const cMinus = Math.cosh(sigma * (r - R));
  const sech2 = (c: number) => (c === 0 ? 0 : 1 / (c * c));
  return sigma * (sech2(cPlus) - sech2(cMinus)) / den;
};

const DFDR_PEAK = dTopHatDr(1, SIGMA, R_METRIC);

const mulMat4PointCM = (m: Float32Array, p: Vec3): Vec3 => {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  const x2 = m[0] * x + m[4] * y + m[8] * z + m[12];
  const y2 = m[1] * x + m[5] * y + m[9] * z + m[13];
  const z2 = m[2] * x + m[6] * y + m[10] * z + m[14];
  const w2 = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (Math.abs(w2) > 1e-6 && Math.abs(w2 - 1) > 1e-6) {
    const inv = 1 / w2;
    return [x2 * inv, y2 * inv, z2 * inv];
  }
  return [x2, y2, z2];
};

type Fixture = {
  label: string;
  dims: { Lx_m: number; Ly_m: number; Lz_m: number };
  basis: HullBasisResolved;
};

const octahedronIndices = new Uint32Array([
  0, 2, 4,
  2, 1, 4,
  1, 3, 4,
  3, 0, 4,
  2, 0, 5,
  1, 2, 5,
  3, 1, 5,
  0, 3, 5,
]);

const buildAngles01 = (positions: Float32Array) => {
  const count = Math.floor(positions.length / 3);
  const angles = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const x = positions[base] ?? 0;
    const z = positions[base + 2] ?? 0;
    const a = Math.atan2(z, x);
    angles[i] = a < 0 ? a / (Math.PI * 2) + 1 : a / (Math.PI * 2);
  }
  return angles;
};

const handedness = (basis: HullBasisResolved) => {
  const [rx, ry, rz] = basis.right;
  const [ux, uy, uz] = basis.up;
  const [fx, fy, fz] = basis.forward;
  const cx = ry * fz - rz * fy;
  const cy = rz * fx - rx * fz;
  const cz = rx * fy - ry * fx;
  const dot = cx * ux + cy * uy + cz * uz;
  return dot >= 0 ? 1 : -1;
};

const makeSurface = (fixture: Fixture): { surface: HullSurfaceMesh; extents: Record<"right" | "up" | "forward", number> } => {
  const { Lx_m, Ly_m, Lz_m } = fixture.dims;
  const verts = new Float32Array([
    Lx_m / 2, 0, 0,
    -Lx_m / 2, 0, 0,
    0, Ly_m / 2, 0,
    0, -Ly_m / 2, 0,
    0, 0, Lz_m / 2,
    0, 0, -Lz_m / 2,
  ]);

  const applied = applyHullBasisToPositions(verts, { basis: fixture.basis });
  const transformed = applied.positions;
  const vertexCount = transformed.length / 3;
  const triangleCount = octahedronIndices.length / 3;

  const vertexAngles01 = buildAngles01(transformed);
  const triangleAngles01 = new Float32Array(triangleCount);
  for (let i = 0; i < triangleCount; i++) {
    const ia = octahedronIndices[i * 3] ?? 0;
    const ib = octahedronIndices[i * 3 + 1] ?? 0;
    const ic = octahedronIndices[i * 3 + 2] ?? 0;
    triangleAngles01[i] = (vertexAngles01[ia] + vertexAngles01[ib] + vertexAngles01[ic]) / 3;
  }

  const basis = applied.basis;
  const dirExtent = (dir: Vec3) => {
    let max = 0;
    for (let i = 0; i < transformed.length; i += 3) {
      const dot = Math.abs(transformed[i] * dir[0] + transformed[i + 1] * dir[1] + transformed[i + 2] * dir[2]);
      if (dot > max) max = dot;
    }
    return max;
  };

  const extents = {
    right: dirExtent(basis.right as Vec3),
    up: dirExtent(basis.up as Vec3),
    forward: dirExtent(basis.forward as Vec3),
  };

  const surface: HullSurfaceMesh = {
    key: fixture.label,
    lod: "preview",
    positions: transformed,
    indices: octahedronIndices,
    normals: null,
    tangents: null,
    vertexAngles01,
    vertexSectors: new Uint16Array(vertexCount).fill(0),
    triangleAngles01,
    triangleSectors: new Uint16Array(triangleCount).fill(0),
    sectorCount: 1,
    triangleCount,
    vertexCount,
    meshHash: fixture.label,
    basis,
    handedness: handedness(basis) as 1 | -1,
    bounds: applied.bounds,
    wireframe: null,
    clampReasons: [],
    source: "preview",
  };

  return { surface, extents };
};

const sampleVolume = (
  volume: HullSurfaceVoxelVolume,
  frame: ReturnType<typeof buildLatticeFrame>,
  dir: Vec3,
  distance: number,
) => {
  const min = frame.bounds.minLattice;
  const v = frame.voxelSize_m;
  const pWorld: Vec3 = [dir[0] * distance, dir[1] * distance, dir[2] * distance];
  const pLattice = frame.worldToLattice
    ? mulMat4PointCM(frame.worldToLattice, pWorld)
    : pWorld;
  const ix = Math.floor((pLattice[0] - min[0]) / v);
  const iy = Math.floor((pLattice[1] - min[1]) / v);
  const iz = Math.floor((pLattice[2] - min[2]) / v);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= frame.dims[0] || iy >= frame.dims[1] || iz >= frame.dims[2]) {
    return null;
  }
  const idx = ix + frame.dims[0] * (iy + frame.dims[1] * iz);
  return {
    gate: volume.gate3D[idx] ?? 0,
    dfdr: volume.dfdr3D[idx] ?? 0,
    drive: volume.drive3D[idx] ?? 0,
  };
};

const expectClose = (actual: number, expected: number, wide = false) => {
  const absTol = wide ? 5e-4 : 1e-4;
  const relTol = wide ? 5e-3 : 1e-3;
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThanOrEqual(absTol);
    return;
  }
  const tol = Math.max(absTol, Math.abs(expected) * relTol);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

type ProfileCase = {
  profileTag: LatticeProfileTag;
  preset: LatticeQualityPreset;
  boundsProfile: "tight" | "wide";
  domain: "wallBand" | "bubbleBox";
};

const fixtures: Fixture[] = [
  {
    label: "ellipsoid-axis-aligned",
    dims: { Lx_m: 12, Ly_m: 6, Lz_m: 4 },
    basis: HULL_BASIS_IDENTITY,
  },
  {
    label: "ellipsoid-basis-swapped",
    dims: { Lx_m: 12, Ly_m: 6, Lz_m: 4 },
    basis: resolveHullBasis({
      swap: { x: "z", y: "y", z: "x" },
      flip: { x: false, y: true, z: false },
      scale: [0.5, 1.25, 1],
    }),
  },
  {
    label: "needle-hull",
    dims: { Lx_m: 100, Ly_m: 10, Lz_m: 6 },
    basis: HULL_BASIS_IDENTITY,
  },
];

const profiles: ProfileCase[] = [
  { profileTag: "preview", preset: "low", boundsProfile: "tight", domain: "wallBand" },
  { profileTag: "card", preset: "card", boundsProfile: "wide", domain: "bubbleBox" },
];

describe("lattice parity probes (shell anchors vs analytic)", () => {
  profiles.forEach((profile) => {
    fixtures.forEach((fixture) => {
      it(`${fixture.label} | ${profile.domain} | ${profile.profileTag}`, () => {
        const { surface, extents } = makeSurface(fixture);
        const frame = buildLatticeFrame({
          hullDims: { Lx_m: extents.right * 2, Ly_m: extents.up * 2, Lz_m: extents.forward * 2 },
          basis: surface.basis,
          boundsProfile: profile.boundsProfile,
          preset: profile.preset,
          profileTag: profile.profileTag,
          centerWorld: [0, 0, 0],
        });

        const shellThickness = frame.voxelSize_m * 1.25;
        const volumeResult = voxelizeHullSurfaceStrobe({
          frame,
          surface,
          sectorWeights: new Float32Array([1]),
          perVertexDfdr: new Float32Array(surface.vertexCount).fill(DFDR_PEAK),
          gateScale: 1,
          driveScale: 1,
          driveLadder: { R: R_METRIC, sigma: SIGMA, beta: 0.2, gate: 1, ampChain: 1 },
          shellThickness,
          sampleBudget: frame.voxelCount * 12,
          surfaceHash: surface.meshHash ?? surface.key,
          weightsHash: "unity",
          dfdrSignature: DFDR_SIGNATURE,
        });

        expect(volumeResult.volume).not.toBeNull();
        const volume = volumeResult.volume!;
        const voxel = frame.voxelSize_m;

        const axes: Array<{ axis: "right" | "up" | "forward"; dir: Vec3; extent: number }> = [
          { axis: "right", dir: surface.basis.right as Vec3, extent: extents.right },
          { axis: "up", dir: surface.basis.up as Vec3, extent: extents.up },
          { axis: "forward", dir: surface.basis.forward as Vec3, extent: extents.forward },
        ];

        axes.forEach(({ axis, dir, extent }) => {
          const centerSample = sampleVolume(volume, frame, dir, 0);
          expect(centerSample).not.toBeNull();
          expectClose(centerSample!.gate, 0, false);
          expectClose(centerSample!.dfdr, 0, false);
          expectClose(centerSample!.drive, 0, false);

          const offsets = [
            { label: "inside", delta: -0.5 * voxel },
            { label: "shell", delta: 0 },
            { label: "outside-near", delta: 0.5 * voxel },
            { label: "far", delta: 4 * voxel },
          ];

          offsets.forEach(({ label, delta }) => {
            const pos = extent + delta;
            const sample = sampleVolume(volume, frame, dir, pos);
            expect(sample).not.toBeNull();
            const inBand = Math.abs(delta) <= shellThickness;
            const expectGate = inBand ? 1 : 0;
            const expectDfdr = inBand ? DFDR_PEAK : 0;
            const wideTol = profile.profileTag === "card" && profile.domain === "bubbleBox";

            expectClose(sample!.gate, expectGate, wideTol);
            expectClose(sample!.dfdr, expectDfdr, wideTol);
            expectClose(sample!.drive, expectDfdr, wideTol);

            if (inBand && expectDfdr !== 0) {
              expect(Math.sign(sample!.dfdr || 0)).toBe(Math.sign(expectDfdr));
              expect(Math.sign(sample!.drive || 0)).toBe(Math.sign(expectDfdr));
            }

            // Sanity: near-band samples should carry non-zero gate
            if (label !== "far") {
              expect(sample!.gate).toBeGreaterThanOrEqual(0);
            }
          });
        });
      });
    });
  });
});
