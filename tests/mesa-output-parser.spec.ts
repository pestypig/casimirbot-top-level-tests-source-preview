import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseMesaHistoryFile,
  parseMesaProfileFile,
} from "../server/modules/starsim/external/mesa-output-parser";

const profilePath = "ops/mesa/solar-reference/profile_solar_reference.data";
const historyPath = "ops/mesa/solar-reference/history_solar_reference.data";

describe("MESA output parser", () => {
  it("parses a MESA-like solar profile fixture", () => {
    const result = parseMesaProfileFile({
      path: profilePath,
      sourceHash: "profile-hash",
      profileHash: "profile-hash",
      inlistHash: "inlist-hash",
      historyHash: "history-hash",
      network: "pp_cno_extras.net",
    });
    expect(result.profile.objectId).toBe("Sun");
    expect(result.profile.shells.length).toBeGreaterThan(1);
    expect(result.profile.shells[0].shellIndex).toBe(0);
  });

  it("parses a history fixture", () => {
    const history = parseMesaHistoryFile(historyPath);
    expect(history.finalAge_Gyr).toBe(4.57);
    expect(history.luminosity_Lsun).toBe(1);
  });

  it("rejects missing integration basis", () => {
    const path = join(mkdtempSync(join(tmpdir(), "mesa-parser-")), "bad.data");
    writeFileSync(path, "logT eps_nuc\n7.0 1.0\n");
    expect(() => parseMesaProfileFile({ path })).toThrow(/integration basis/);
  });

  it("rejects nonnumeric shell fields", () => {
    const path = join(mkdtempSync(join(tmpdir(), "mesa-parser-")), "bad.data");
    writeFileSync(path, "mass radius logT eps_nuc\n0.1 nope 7.0 1.0\n");
    expect(() => parseMesaProfileFile({ path })).toThrow(/nonnumeric/);
  });

  it("emits warnings when component epsilon columns are unavailable", () => {
    const path = join(mkdtempSync(join(tmpdir(), "mesa-parser-")), "warn.data");
    writeFileSync(path, "mass radius logT logRho eps_nuc\n0.1 0.1 7.0 2.0 1.0\n0.2 0.2 7.0 2.0 1.0\n");
    const result = parseMesaProfileFile({ path });
    expect(result.parserWarnings).toContain("missing_eps_pp");
    expect(result.parserWarnings).toContain("missing_eps_cno");
  });

  it("preserves shell ordering by enclosed mass", () => {
    const result = parseMesaProfileFile({ path: profilePath });
    expect(result.profile.shells.map((shell) => shell.shellIndex)).toEqual([0, 1, 2, 3]);
  });
});
