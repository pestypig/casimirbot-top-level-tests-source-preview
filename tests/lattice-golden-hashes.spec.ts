import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HULL_BASIS_IDENTITY } from "@shared/hull-basis";
import type { HullPreviewPayload } from "@shared/schema";
import { buildLatticeFrame } from "@/lib/lattice-frame";
import { buildHullDistanceGrid } from "@/lib/lattice-sdf";
import { hashLatticeSdfDeterminism, hashLatticeVolumeDeterminism } from "@/lib/lattice-health";
import { voxelizeHullSurfaceStrobe } from "@/lib/lattice-surface";
import type { HullSurfaceMesh } from "@/lib/resolve-wireframe-overlay";

type LatticeGoldenFixture = {
  frame: {
    hullDims: { Lx_m: number; Ly_m: number; Lz_m: number };
    boundsProfile: string;
    preset: string;
    profileTag: string;
    overrides: Record<string, number>;
    centerWorld: [number, number, number];
  };
  surface: {
    positions: number[];
    indices: number[];
    meshHash: string;
    sectorCount: number;
  };
  expected: {
    volume_generation_hash: string;
    volume_determinism_hash: string;
    sdf_grid_key: string;
    sdf_determinism_hash: string;
  };
};

const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", "lattice-golden.fixture.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as LatticeGoldenFixture;

describe("lattice golden hashes (CI determinism)", () => {
  it("produces stable lattice generation + determinism hash for volume voxelization", async () => {
    const frame = buildLatticeFrame({
      hullDims: fixture.frame.hullDims,
      basis: HULL_BASIS_IDENTITY,
      boundsProfile: fixture.frame.boundsProfile as any,
      preset: fixture.frame.preset as any,
      profileTag: fixture.frame.profileTag as any,
      overrides: fixture.frame.overrides,
      centerWorld: fixture.frame.centerWorld,
    });

    const positions = new Float32Array(fixture.surface.positions);

    const surface: HullSurfaceMesh = {
      key: "goldenSurface",
      lod: "preview",
      positions,
      indices: new Uint32Array(fixture.surface.indices),
      normals: null,
      tangents: null,
      vertexAngles01: new Float32Array([0, 0, 0]),
      vertexSectors: new Uint16Array([0, 0, 0]),
      triangleAngles01: new Float32Array([0]),
      triangleSectors: new Uint16Array([0]),
      sectorCount: fixture.surface.sectorCount,
      triangleCount: 1,
      vertexCount: 3,
      meshHash: fixture.surface.meshHash,
      basis: HULL_BASIS_IDENTITY,
      handedness: 1,
      bounds: {
        min: [-0.25, -0.25, 0],
        max: [0.25, 0.25, 0],
        size: [0.5, 0.5, 0],
        center: [0, 0, 0],
      },
      wireframe: null,
      clampReasons: [],
      source: "preview",
    };

    const volumeResult = voxelizeHullSurfaceStrobe({
      frame,
      surface,
      sectorWeights: new Float32Array([1]),
      perVertexDfdr: new Float32Array([1, 1, 1]),
      gateScale: 1,
      driveScale: 1,
      driveLadder: { R: 1, sigma: 6, beta: 0.2, gate: 1, ampChain: 1 },
      shellThickness: 0.3,
      sampleBudget: 256,
      surfaceHash: "meshGolden|preview",
      weightsHash: "w00000000",
      dfdrSignature: "6.000000|0.200000|1.000",
    });
    expect(volumeResult.volume).not.toBeNull();

    const volume = volumeResult.volume!;
    const generationHash = volume.hash.slice(0, 8);
    const determinismHash = await hashLatticeVolumeDeterminism(volume, {
      sampleCount: 64,
      quantScale: 1e5,
    });

    expect(generationHash).toBe(fixture.expected.volume_generation_hash);
    expect(determinismHash).toBe(fixture.expected.volume_determinism_hash);
  });

  it("produces stable cache key + determinism hash for hull SDF band grid", async () => {
    const frame = buildLatticeFrame({
      hullDims: fixture.frame.hullDims,
      basis: HULL_BASIS_IDENTITY,
      boundsProfile: fixture.frame.boundsProfile as any,
      preset: fixture.frame.preset as any,
      profileTag: fixture.frame.profileTag as any,
      overrides: fixture.frame.overrides,
      centerWorld: fixture.frame.centerWorld,
    });

    const positions = fixture.surface.positions;

    const payload: HullPreviewPayload = {
      version: "v1",
      provenance: "preview",
      meshHash: fixture.surface.meshHash,
      lodCoarse: {
        tag: "coarse",
        meshHash: fixture.surface.meshHash,
        indexedGeometry: {
          positions,
          indices: fixture.surface.indices,
          vertexCount: 3,
          triangleCount: 1,
        },
      },
    };

    const sdfResult = await buildHullDistanceGrid({
      payload,
      frame,
      band: 0.6,
      surface: { lod: "preview", totalSectors: 1 },
      maxSamples: 256,
    });
    expect(sdfResult.grid).not.toBeNull();

    const grid = sdfResult.grid!;
    const determinismHash = await hashLatticeSdfDeterminism(grid, {
      sampleCount: 64,
      quantScale: 1e5,
    });

    expect(grid.key).toBe(fixture.expected.sdf_grid_key);
    expect(determinismHash).toBe(fixture.expected.sdf_determinism_hash);
  });
});
