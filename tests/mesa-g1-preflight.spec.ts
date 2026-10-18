import { describe, expect, it } from "vitest";
import { assessMesaG1RuntimeCapacity } from "../server/modules/starsim/external/mesa-g1-preflight";

const base = {
  imageReference: "evbauer/mesa_lean:r24.03.1.01",
  imageConfigDigest: "sha256:4c961961858c808842c133662416f14b44faa191b6765c7ab9aaded6e65aeaf6",
  imageInstalled: false,
  compressedLayerBytes: 4_609_897_301,
  freeBytes: 4_283_359_232,
  minimumFreeBytes: 25_000_000_000,
};

describe("MESA G1 runtime-capacity preflight", () => {
  it("fails first on insufficient disk when an absent image cannot be installed safely", () => {
    expect(assessMesaG1RuntimeCapacity(base)).toMatchObject({
      pass: false,
      code: "INSUFFICIENT_DISK_FOR_MESA_IMAGE",
    });
  });

  it("reports an absent image separately when capacity is adequate", () => {
    expect(
      assessMesaG1RuntimeCapacity({ ...base, freeBytes: 30_000_000_000 }),
    ).toMatchObject({ pass: false, code: "MESA_IMAGE_NOT_INSTALLED" });
  });

  it("passes when the pinned image is already installed", () => {
    expect(
      assessMesaG1RuntimeCapacity({ ...base, imageInstalled: true }),
    ).toMatchObject({ pass: true, code: "PASS_RUNTIME_CAPACITY" });
  });
});
