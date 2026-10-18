import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

const loadGlb = (file: string): GlbParsed => {
  const buf = fs.readFileSync(file);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  if (magic !== 0x46546c67 || version !== 2) {
    throw new Error(`Unexpected GLB header for ${file}`);
  }
  const length = view.getUint32(8, true);
  if (length !== buf.byteLength) {
    throw new Error(`GLB length mismatch for ${file}`);
  }

  let offset = 12;
  const readChunk = () => {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkData = buf.slice(offset + 8, offset + 8 + chunkLength);
    offset += 8 + chunkLength;
    return { chunkLength, chunkType, chunkData };
  };

  const jsonChunk = readChunk();
  if (jsonChunk.chunkType !== 0x4e4f534a) {
    throw new Error(`First chunk must be JSON for ${file}`);
  }
  const binChunk = readChunk();
  if (binChunk.chunkType !== 0x004e4942) {
    throw new Error(`Second chunk must be BIN for ${file}`);
  }

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
  return { accessor, bufferView, data, stride, components, count };
};

const boundsFromAccessor = (glb: GlbParsed, accessorIndex: number) => {
  const { data, components, stride, count } = readAccessor(glb, accessorIndex);
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  // When byteStride equals component width * components we can index directly.
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
  return { mins, maxs, dims: [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]] };
};

describe("ellipsoid GLB fixtures", () => {
  const root = path.resolve(__dirname, "..", "client", "public", "luma");

  it("axis-aligned fixture preserves expected OBB dims", () => {
    const glb = loadGlb(path.join(root, "needle-ellipsoid.glb"));
    const { mins, maxs, dims } = boundsFromAccessor(glb, 0);
    expect(mins).toEqual([-503.5, -132, -86.5]);
    expect(maxs).toEqual([503.5, 132, 86.5]);
    expect(dims[0]).toBeCloseTo(1007, 5);
    expect(dims[1]).toBeCloseTo(264, 5);
    expect(dims[2]).toBeCloseTo(173, 5);
  });

  it("basis-swapped fixture applies swap/flip/scale to axes", () => {
    const glb = loadGlb(path.join(root, "needle-ellipsoid-basis-swapped.glb"));
    const { mins, maxs, dims } = boundsFromAccessor(glb, 0);
    expect(mins).toEqual([-43.25, -165, -503.5]);
    expect(maxs).toEqual([43.25, 165, 503.5]);
    expect(dims[0]).toBeCloseTo(86.5, 5);   // 173 * 0.5 from swap x<-z with scale 0.5
    expect(dims[1]).toBeCloseTo(330, 5);    // 264 * 1.25 with flip preserved in magnitude
    expect(dims[2]).toBeCloseTo(1007, 5);   // swap z<-x -> full 1007 m length
  });
});
