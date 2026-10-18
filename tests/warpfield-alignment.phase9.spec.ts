import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveHullBasis } from "@shared/hull-basis";
import type { BasisTransform, HullPreviewPayload } from "@shared/schema";
import { remapXYZToFrontRightUp, formatAxisDirection, resolveBasisFrontRightUp } from "@/lib/hull-hud";
import { resolveWireframeOverlay } from "@/lib/resolve-wireframe-overlay";

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
const root = path.resolve(__dirname, "..", "client", "public", "luma");

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
  const stride = bufferView.byteStride ?? TypeCtor.BYTES_PER_ELEMENT * components;
  const count = accessor.count;
  const data = new TypeCtor(glb.bin.buffer, glb.bin.byteOffset + byteOffset, Math.floor(byteLength / TypeCtor.BYTES_PER_ELEMENT));
  return { accessor, bufferView, data, stride, components, count, elemBytes: TypeCtor.BYTES_PER_ELEMENT };
};

const boundsFromAccessor = (glb: GlbParsed, accessorIndex: number) => {
  const { data, components, stride, count } = readAccessor(glb, accessorIndex);
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  const elemSize = components * data.BYTES_PER_ELEMENT;
  for (let i = 0; i < count; i++) {
    const byteIndex = i * stride;
    const elemOffset = byteIndex / data.BYTES_PER_ELEMENT;
    const vx = data[elemOffset] ?? 0;
    const vy = data[elemOffset + 1] ?? 0;
    const vz = data[elemOffset + 2] ?? 0;
    mins[0] = Math.min(mins[0], vx);
    mins[1] = Math.min(mins[1], vy);
    mins[2] = Math.min(mins[2], vz);
    maxs[0] = Math.max(maxs[0], vx);
    maxs[1] = Math.max(maxs[1], vy);
    maxs[2] = Math.max(maxs[2], vz);
  }
  return { mins, maxs, dims: [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]] as [number, number, number] };
};

const accessorToVecArray = (glb: GlbParsed, accessorIndex: number) => {
  const { data, stride, components, count, elemBytes } = readAccessor(glb, accessorIndex);
  const out = new Float32Array(count * components);
  for (let i = 0; i < count; i++) {
    const byteIndex = i * stride;
    const elemOffset = byteIndex / elemBytes;
    for (let c = 0; c < components; c++) {
      out[i * components + c] = Number(data[elemOffset + c] ?? 0);
    }
  }
  return out;
};

const accessorToIndices = (glb: GlbParsed, accessorIndex: number) => {
  const { data, stride, count, elemBytes } = readAccessor(glb, accessorIndex);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const byteIndex = i * stride;
    const elemOffset = byteIndex / elemBytes;
    out[i] = Number(data[elemOffset] ?? 0);
  }
  return out;
};

const boundsFromLines = (positions: Float32Array) => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return {
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as [number, number, number],
  };
};

const fixtures = [
  {
    label: "axis-aligned",
    file: "needle-ellipsoid.glb",
    basis: null as BasisTransform | null,
    expectDims: [1007, 264, 173] as [number, number, number],
  },
  {
    label: "basis-swapped",
    file: "needle-ellipsoid-basis-swapped.glb",
    basis: {
      swap: { x: "z", y: "y", z: "x" },
      flip: { x: false, y: true, z: false },
      scale: [0.5, 1.25, 1],
    } satisfies BasisTransform,
    expectDims: [86.5, 330, 1007] as [number, number, number],
  },
];

const domains = [
  { domain: "wallBand" as const, scale: 1 },
  { domain: "bubbleBox" as const, scale: 1.3 }, // mirrors renderer DEFAULT_DOMAIN_SCALE when no override is set
];

describe("phase 9 alignment validation (ellipsoid overlays + HUD)", () => {
  fixtures.forEach((fixture) => {
    it(`${fixture.label} GLB drives overlay bounds and HUD labels across wallBand/bubbleBox`, () => {
      const glb = loadGlb(path.join(root, fixture.file));
      const mesh = glb.json?.meshes?.[0]?.primitives?.[0];
      if (!mesh) throw new Error(`Missing mesh primitive in ${fixture.file}`);
      const positionAccessor = mesh.attributes?.POSITION;
      const indexAccessor = mesh.indices;
      if (positionAccessor == null || indexAccessor == null) {
        throw new Error(`Missing POSITION or indices accessors in ${fixture.file}`);
      }

      const positionData = accessorToVecArray(glb, positionAccessor);
      const indexData = accessorToIndices(glb, indexAccessor);
      const { mins, maxs, dims } = boundsFromAccessor(glb, positionAccessor);

      // Guard raw fixture dimensions so regressions in the GLB are caught.
      expect(dims[0]).toBeCloseTo(fixture.expectDims[0], 3);
      expect(dims[1]).toBeCloseTo(fixture.expectDims[1], 3);
      expect(dims[2]).toBeCloseTo(fixture.expectDims[2], 3);

      const basisResolved = resolveHullBasis(fixture.basis ?? undefined);
      const payload: HullPreviewPayload = {
        version: "v1",
        meshHash: fixture.label,
        basis: fixture.basis ?? undefined,
        mesh: {
          obb: { center: [(mins[0] + maxs[0]) * 0.5, (mins[1] + maxs[1]) * 0.5, (mins[2] + maxs[2]) * 0.5], halfSize: [dims[0] / 2, dims[1] / 2, dims[2] / 2] },
        },
        lodCoarse: {
          indexedGeometry: {
            positions: Array.from(positionData),
            indices: Array.from(indexData),
          },
        },
      };

      const overlay = resolveWireframeOverlay(payload, { lod: "preview" });
      expect(overlay.overlay).not.toBeNull();
      const overlaySize = overlay.overlay ? boundsFromLines(overlay.overlay.positions).size : [0, 0, 0];
      expect(overlaySize[0]).toBeCloseTo(dims[0], 3);
      expect(overlaySize[1]).toBeCloseTo(dims[1], 3);
      expect(overlaySize[2]).toBeCloseTo(dims[2], 3);

      const axes = resolveBasisFrontRightUp(basisResolved);
      expect(formatAxisDirection(axes.front)).not.toBe("--");
      expect(formatAxisDirection(axes.right)).not.toBe("--");
      expect(formatAxisDirection(axes.up)).not.toBe("--");

      domains.forEach(({ domain, scale }) => {
        const scaledXYZ: [number, number, number] = [dims[0] * scale, dims[1] * scale, dims[2] * scale];
        const hud = remapXYZToFrontRightUp(scaledXYZ, basisResolved);
        expect(hud.labels.front).toBe(formatAxisDirection(axes.front));
        expect(hud.labels.right).toBe(formatAxisDirection(axes.right));
        expect(hud.labels.up).toBe(formatAxisDirection(axes.up));

        const axisIndex = (axis: "x" | "y" | "z") => (axis === "x" ? 0 : axis === "y" ? 1 : 2);
        const expectedFront = axes.front ? scaledXYZ[axisIndex(axes.front.axis)] : null;
        const expectedRight = axes.right ? scaledXYZ[axisIndex(axes.right.axis)] : null;
        const expectedUp = axes.up ? scaledXYZ[axisIndex(axes.up.axis)] : null;
        expect(hud.values[0]).toBeCloseTo(expectedFront ?? 0, 6);
        expect(hud.values[1]).toBeCloseTo(expectedRight ?? 0, 6);
        expect(hud.values[2]).toBeCloseTo(expectedUp ?? 0, 6);

        // BubbleBox uses scaled bounds; ensure values track the domain scale while preserving basis mapping.
        if (domain === "bubbleBox") {
          expect(hud.values[0]).toBeGreaterThan(remapXYZToFrontRightUp(dims, basisResolved).values[0]);
          expect(hud.values[1]).toBeGreaterThan(remapXYZToFrontRightUp(dims, basisResolved).values[1]);
          expect(hud.values[2]).toBeGreaterThan(remapXYZToFrontRightUp(dims, basisResolved).values[2]);
        }
      });
    });
  });
});
