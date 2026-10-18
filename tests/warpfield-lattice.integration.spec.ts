import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCardExportSidecar } from "@/lib/card-export-sidecar";
import { buildLatticeFrame } from "@/lib/lattice-frame";
import { buildHullDistanceGrid } from "@/lib/lattice-sdf";
import { voxelizeHullSurfaceStrobe } from "@/lib/lattice-surface";
import { resolveHullSurfaceMesh } from "@/lib/resolve-wireframe-overlay";
import { sha256Hex } from "@/utils/sha";
import { getGlobalPipelineState, initializePipelineState, setGlobalPipelineState } from "../server/energy-pipeline";
import { updatePipelineParams } from "../server/helix-core";
import type { HullPreviewPayload } from "@shared/schema";

type GlbParsed = { json: any; bin: Uint8Array };

const COMPONENT_TYPED_ARRAY: Record<number, any> = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GLB_PATH = path.resolve(__dirname, "..", "client", "public", "luma", "needle-ellipsoid.glb");
const TARGET_LONG_AXIS_M = 3; // keep the lattice lightweight for CI

const loadGlb = (file: string): GlbParsed => {
  const buf = fs.readFileSync(file);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  if (magic !== 0x46546c67 || version !== 2) throw new Error(`Unexpected GLB header for ${file}`);

  const length = view.getUint32(8, true);
  if (length !== buf.byteLength) throw new Error(`GLB length mismatch for ${file}`);

  let offset = 12;
  const readChunk = () => {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkData = buf.slice(offset + 8, offset + 8 + chunkLength);
    offset += 8 + chunkLength;
    return { chunkLength, chunkType, chunkData };
  };

  const jsonChunk = readChunk();
  if (jsonChunk.chunkType !== 0x4e4f534a) throw new Error(`First chunk must be JSON for ${file}`);
  const binChunk = readChunk();
  if (binChunk.chunkType !== 0x004e4942) throw new Error(`Second chunk must be BIN for ${file}`);

  return {
    json: JSON.parse(jsonChunk.chunkData.toString("utf8")),
    bin: new Uint8Array(binChunk.chunkData.buffer, binChunk.chunkData.byteOffset, binChunk.chunkData.byteLength),
  };
};

const readAccessor = (glb: GlbParsed, accessorIndex: number) => {
  const accessor = glb.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`);
  const bufferView = glb.json.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`Missing bufferView for accessor ${accessorIndex}`);
  const TypeCtor = COMPONENT_TYPED_ARRAY[accessor.componentType];
  if (!TypeCtor) throw new Error(`Unsupported componentType ${accessor.componentType}`);
  const components = TYPE_COMPONENTS[accessor.type];
  if (!components) throw new Error(`Unsupported accessor type ${accessor.type}`);

  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const byteLength = bufferView.byteLength;
  const strideBytes = bufferView.byteStride ?? TypeCtor.BYTES_PER_ELEMENT * components;
  const count = accessor.count;
  const data = new TypeCtor(glb.bin.buffer, glb.bin.byteOffset + byteOffset, Math.floor(byteLength / TypeCtor.BYTES_PER_ELEMENT));
  return { data, strideBytes, components, count, elementBytes: TypeCtor.BYTES_PER_ELEMENT };
};

const accessorToVecArray = (glb: GlbParsed, accessorIndex: number): Float32Array => {
  const { data, strideBytes, components, count, elementBytes } = readAccessor(glb, accessorIndex);
  const out = new Float32Array(count * components);
  for (let i = 0; i < count; i++) {
    const byteIndex = i * strideBytes;
    const elemOffset = byteIndex / elementBytes;
    for (let c = 0; c < components; c++) {
      out[i * components + c] = Number(data[elemOffset + c] ?? 0);
    }
  }
  return out;
};

const accessorToIndices = (glb: GlbParsed, accessorIndex: number): Uint32Array => {
  const { data, strideBytes, count, elementBytes } = readAccessor(glb, accessorIndex);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const byteIndex = i * strideBytes;
    const elemOffset = byteIndex / elementBytes;
    out[i] = Number(data[elemOffset] ?? 0);
  }
  return out;
};

const computeBounds = (positions: Float32Array) => {
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    if (x < mins[0]) mins[0] = x;
    if (y < mins[1]) mins[1] = y;
    if (z < mins[2]) mins[2] = z;
    if (x > maxs[0]) maxs[0] = x;
    if (y > maxs[1]) maxs[1] = y;
    if (z > maxs[2]) maxs[2] = z;
  }
  return {
    mins,
    maxs,
    dims: [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]] as [number, number, number],
  };
};

const hashMesh = async (positions: Float32Array, indices: Uint32Array) => {
  const posBytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
  const idxBytes = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength);
  const combined = new Uint8Array(posBytes.length + idxBytes.length);
  combined.set(posBytes, 0);
  combined.set(idxBytes, posBytes.length);
  return sha256Hex(combined);
};

async function buildLatticeFixture(opts?: { forceClamp?: boolean }) {
  const glb = loadGlb(GLB_PATH);
  const primitive = glb.json.meshes?.[0]?.primitives?.[0] ?? {};
  const posAccessorIndex = primitive.attributes?.POSITION ?? 0;
  const idxAccessorIndex = primitive.indices ?? 0;

  const rawPositions = accessorToVecArray(glb, posAccessorIndex);
  const indices = accessorToIndices(glb, idxAccessorIndex);
  const bounds = computeBounds(rawPositions);

  const scale = TARGET_LONG_AXIS_M / Math.max(...bounds.dims);
  const scaledPositions = new Float32Array(rawPositions.length);
  for (let i = 0; i < rawPositions.length; i++) scaledPositions[i] = rawPositions[i] * scale;
  const scaledDims: [number, number, number] = [
    bounds.dims[0] * scale,
    bounds.dims[1] * scale,
    bounds.dims[2] * scale,
  ];

  const meshHash = await hashMesh(scaledPositions, indices);
  const preview: HullPreviewPayload = {
    version: "v1",
    glbUrl: GLB_PATH,
    meshHash,
    targetDims: { Lx_m: scaledDims[0], Ly_m: scaledDims[1], Lz_m: scaledDims[2] },
    lodCoarse: {
      tag: "coarse",
      meshHash,
      indexedGeometry: {
        positions: Array.from(scaledPositions),
        indices: Array.from(indices),
        vertexCount: scaledPositions.length / 3,
        triangleCount: indices.length / 3,
      },
      triangleCount: indices.length / 3,
      vertexCount: scaledPositions.length / 3,
    },
    lods: [],
    provenance: "preview",
    updatedAt: Date.now(),
    clampReasons: [],
  };

  const surfaceResolved = resolveHullSurfaceMesh(preview, { lod: "preview", totalSectors: 96 });
  if (!surfaceResolved.surface) throw new Error("surface resolution failed");

  const frame = buildLatticeFrame({
    hullDims: { Lx_m: scaledDims[0], Ly_m: scaledDims[1], Lz_m: scaledDims[2] },
    basis: surfaceResolved.surface.basis,
    boundsProfile: "tight",
    preset: "low",
    profileTag: "preview",
  });

  const sdf = await buildHullDistanceGrid({
    payload: preview,
    frame,
    band: frame.voxelSize_m * 1.1,
    surface: { lod: "preview", totalSectors: surfaceResolved.surface.sectorCount },
    surfaceResolved,
    maxSamples: Math.max(50_000, frame.voxelCount * 4),
  });
  if (!sdf.grid) throw new Error("failed to build lattice SDF");

  const volumeResult = voxelizeHullSurfaceStrobe({
    frame,
    surface: surfaceResolved.surface,
    sectorWeights: new Float32Array(surfaceResolved.surface.sectorCount).fill(1),
    perVertexDfdr: new Float32Array(surfaceResolved.surface.vertexCount).fill(1),
    gateScale: 1,
    driveScale: 1,
    driveLadder: { R: 1, sigma: 6, beta: 0.2, gate: 1, ampChain: 1 },
    shellThickness: frame.voxelSize_m * 0.75,
    sampleBudget: Math.max(frame.voxelCount * 6, 60_000),
    surfaceHash: surfaceResolved.surface.key,
    weightsHash: "unity",
    dfdrSignature: "dfdr:unity",
  });
  if (!volumeResult.volume) throw new Error("failed to voxelize lattice volume");

  const clampReasons = opts?.forceClamp ? ["dims:maxVoxels"] : [];
  const frameForPreview = {
    preset: frame.preset,
    profileTag: frame.profileTag,
    boundsProfile: frame.boundsProfile,
    dims: frame.dims,
    voxelSize_m: frame.voxelSize_m,
    latticeMin: frame.bounds.minLattice,
    latticeSize: frame.bounds.size,
    worldToLattice: Array.from(frame.worldToLattice),
    latticeToWorld: Array.from(frame.latticeToWorld),
    clampReasons,
  };

  const latticeMeta = {
    enabled: true,
    updatedAt: Date.now(),
    band_m: sdf.grid.band,
    frame: frameForPreview,
    hashes: { volume: volumeResult.volume.hash, sdf: sdf.grid.key },
    stats: {
      coverage: volumeResult.volume.stats.coverage,
      maxGate: volumeResult.volume.stats.maxGate,
      maxDfdr: volumeResult.volume.stats.maxDfdr,
      maxDrive: volumeResult.volume.stats.maxDrive,
    },
  };

  return {
    preview,
    frame,
    frameForPreview,
    sdf,
    volume: volumeResult.volume,
    latticeMeta,
    clampReasons,
  };
}

const toPipelinePreviewPayload = (fixture: Awaited<ReturnType<typeof buildLatticeFixture>>) => ({
  preview: fixture.preview,
  previewMesh: { meshHash: fixture.preview.meshHash },
  previewSdf: { key: fixture.sdf.grid?.key, clampReasons: fixture.clampReasons },
  previewLattice: {
    enabled: true,
    hashes: { volume: fixture.volume.hash, sdf: fixture.sdf.grid?.key },
    frame: fixture.frameForPreview,
  },
  hull: fixture.preview.targetDims
    ? {
        Lx_m: fixture.preview.targetDims.Lx_m,
        Ly_m: fixture.preview.targetDims.Ly_m,
        Lz_m: fixture.preview.targetDims.Lz_m,
      }
    : undefined,
});

const buildCardLatticeMeta = (fixture: Awaited<ReturnType<typeof buildLatticeFixture>>) => ({
  meta: fixture.latticeMeta,
  assets: null,
});

const createPipelineApp = () => {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.post("/api/helix/pipeline/update", updatePipelineParams);
  return app;
};

describe("warpfield lattice integration (GLB preview → pipeline/viewer)", () => {
  beforeEach(() => {
    setGlobalPipelineState(initializePipelineState());
  });

  it("promotes a valid GLB preview lattice into the pipeline and rendered path", async () => {
    const fixture = await buildLatticeFixture();
    const app = createPipelineApp();

    const res = await request(app)
      .post("/api/helix/pipeline/update")
      .send({
        ...toPipelinePreviewPayload(fixture),
        warpGeometryKind: "sdf",
      });
    if (res.status !== 200) {
      // Surface the server-side rejection in CI output.
      // eslint-disable-next-line no-console
      console.error("[integration:lattice] pipeline update failed", res.status, res.body);
    }
    expect(res.status).toBe(200);

    expect(res.body.warpGeometryKind).toBe("sdf");
    expect(res.body.geometryPreview?.lattice?.hashes?.volume).toBe(fixture.volume.hash);
    expect(res.body.geometryPreview?.mesh?.meshHash ?? res.body.geometryPreview?.preview?.meshHash).toBe(fixture.preview.meshHash);

    const sidecar = buildCardExportSidecar({
      timestampIso: new Date().toISOString(),
      canvas: { width: 1, height: 1, devicePixelRatio: 1 },
      overlayEnabled: false,
      pipeline: res.body,
      hull: null,
      overlayFrame: null,
      geometryUpdatePayload: { warpGeometryKind: res.body.warpGeometryKind },
      mesh: { meshHash: fixture.preview.meshHash, geometrySource: "preview" } as any,
      lattice: buildCardLatticeMeta(fixture),
      renderedPath: {
        warpGeometryKind: res.body.warpGeometryKind,
        meshHash: fixture.preview.meshHash,
        latticeHashes: fixture.latticeMeta.hashes,
        latticeEnabled: fixture.latticeMeta.enabled,
        geometrySource: "preview",
      },
      replayPayload: { pipelineUpdate: { warpGeometryKind: res.body.warpGeometryKind }, viewer: {}, signatures: null },
    });

    expect(sidecar.renderedPath?.warpGeometryKind).toBe("sdf");
    expect(sidecar.lattice?.meta?.hashes?.volume).toBe(fixture.volume.hash);
    expect(sidecar.lattice?.meta?.frame?.clampReasons ?? []).not.toContain("dims:maxVoxels");
  });

  it("prefers stored preview lattice hashes when the request omits preview payloads", async () => {
    const fixture = await buildLatticeFixture();
    const state = initializePipelineState();
    state.geometryPreview = {
      preview: fixture.preview,
      mesh: { meshHash: fixture.preview.meshHash },
      sdf: { key: fixture.sdf.grid?.key, hash: fixture.sdf.grid?.key },
      lattice: fixture.latticeMeta,
      updatedAt: Date.now(),
    };
    state.warpGeometryKind = "ellipsoid";
    setGlobalPipelineState(state);
    const app = createPipelineApp();

    const res = await request(app).post("/api/helix/pipeline/update").send({});
    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.error("[integration:lattice] stored-preview request failed", res.status, res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.warpGeometryKind).toBe("sdf");
    expect(res.body.geometryPreview?.lattice?.hashes?.volume).toBe(fixture.volume.hash);
    expect(res.body.geometryPreview?.lattice?.hashes?.sdf).toBe(fixture.sdf.grid?.key);
    expect(res.body.geometryPreview?.mesh?.meshHash ?? res.body.geometryPreview?.preview?.meshHash).toBe(
      fixture.preview.meshHash,
    );
  });

  it("falls back to analytic warp geometry and logs when lattice budgets clamp", async () => {
    const fixture = await buildLatticeFixture({ forceClamp: true });
    const app = createPipelineApp();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await request(app)
        .post("/api/helix/pipeline/update")
        .send({
          ...toPipelinePreviewPayload(fixture),
          warpGeometryKind: "sdf",
        });
      if (res.status !== 200) {
        // eslint-disable-next-line no-console
        console.error("[integration:lattice] fallback request failed", res.status, res.body);
      }
      expect(res.status).toBe(200);

      expect(res.body.warpGeometryKind).toBe("ellipsoid");
      expect(res.body.geometryPreview?.lattice?.frame?.clampReasons).toContain("dims:maxVoxels");
      expect(res.body.geometryFallback?.applied).toBe(true);
      expect(res.body.geometryFallback?.mode ?? "allow").toBe("allow");
      expect(res.body.geometryFallback?.reasons).toContain("clamp:dims:maxVoxels");
      expect(warnSpy.mock.calls.some(([msg]) => typeof msg === "string" && msg.includes("warp geometry fallback"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns geometryFallback warnings when fallbackMode=warn", async () => {
    const fixture = await buildLatticeFixture({ forceClamp: true });
    const app = createPipelineApp();

    const res = await request(app)
      .post("/api/helix/pipeline/update")
      .send({
        ...toPipelinePreviewPayload(fixture),
        warpGeometryKind: "sdf",
        fallbackMode: "warn",
      });

    expect(res.status).toBe(200);
    expect(res.body.warpGeometryKind).toBe("ellipsoid");
    expect(res.body.geometryFallback?.mode).toBe("warn");
    expect(res.body.geometryFallback?.applied).toBe(true);
    expect(res.body.geometryFallback?.reasons).toContain("clamp:dims:maxVoxels");
  });

  it("blocks pipeline update when fallbackMode=block and fallback would apply", async () => {
    const fixture = await buildLatticeFixture({ forceClamp: true });
    const app = createPipelineApp();

    const res = await request(app)
      .post("/api/helix/pipeline/update")
      .send({
        ...toPipelinePreviewPayload(fixture),
        warpGeometryKind: "sdf",
        fallbackMode: "block",
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("warp-geometry-fallback-blocked");
    expect(res.body.geometryFallback?.mode).toBe("block");
    expect(res.body.geometryFallback?.applied).toBe(true);
    expect(res.body.geometryFallback?.reasons).toContain("clamp:dims:maxVoxels");

    const stateAfter = getGlobalPipelineState();
    expect(stateAfter.warpGeometryKind).toBe("ellipsoid");
    expect(stateAfter.geometryPreview?.mesh?.meshHash ?? stateAfter.geometryPreview?.preview?.meshHash).toBe(
      fixture.preview.meshHash,
    );
  });

  it("rejects preview ingestion when mesh validation exceeds caps", async () => {
    const fixture = await buildLatticeFixture();
    const app = createPipelineApp();
    const oversized = structuredClone(fixture.preview);
    oversized.lodCoarse = {
      ...(oversized.lodCoarse ?? {}),
      triangleCount: 3_000_000,
    } as any;

    const res = await request(app)
      .post("/api/helix/pipeline/update")
      .send({
        ...toPipelinePreviewPayload(fixture),
        preview: oversized,
      });

    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.validation)).toBe(true);
    expect(res.body.validation).toContainEqual(expect.stringContaining("triangles"));
  });
});
