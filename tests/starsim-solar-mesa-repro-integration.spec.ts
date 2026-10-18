import { describe, expect, it } from "vitest";

const enabled = process.env.STARSIM_MESA_INTEGRATION === "1";

describe.skipIf(!enabled)("StarSim solar MESA repro integration", () => {
  it("is reserved for real external MESA runtime checks", () => {
    expect(enabled).toBe(true);
  });
});
