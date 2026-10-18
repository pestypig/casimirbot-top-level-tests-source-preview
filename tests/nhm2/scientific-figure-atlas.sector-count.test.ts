import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScientificAtlasManifest, resolveRepoPath } from "./scientific-figure-atlas.test-utils.js";

describe("NHM2 scientific figure atlas sector count", () => {
  it("renders the schedule over all contract sectors", () => {
    const manifest = loadScientificAtlasManifest();
    const figure = manifest.figures.find((entry) => entry.id === "06_sector_schedule_timeline");
    const source = JSON.parse(fs.readFileSync(resolveRepoPath(figure!.sourceDataJson), "utf8"));
    const cavity = JSON.parse(fs.readFileSync("configs/needle-hull-mark2-cavity-contract.v1.json", "utf8"));
    const sectors = new Set(source.data.rows.map((row: any) => row.sector));
    expect(source.data.sectorCount).toBe(cavity.geometry.sectorCount);
    expect(source.data.concurrentSectors).toBe(cavity.geometry.concurrentSectors);
    expect(source.data.coveredSectorCount).toBe(cavity.geometry.sectorCount);
    expect(sectors.size).toBe(cavity.geometry.sectorCount);
  });
});
