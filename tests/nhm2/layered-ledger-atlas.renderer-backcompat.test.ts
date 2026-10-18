import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const renderRoot = path.join(process.cwd(), "artifacts", "research", "full-solve", "rendered", "scientific_3p1_field");

const newestRicciMetadata = (): string => {
  const candidates: string[] = [];
  if (fs.existsSync(renderRoot)) {
    for (const dirent of fs.readdirSync(renderRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const metadata = path.join(renderRoot, dirent.name, "nhm2_ricci4_nat3d_iso-metadata.json");
      if (fs.existsSync(metadata)) candidates.push(metadata);
    }
  }
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  expect(candidates.length, "ricci4 metadata candidates").toBeGreaterThan(0);
  return candidates[0];
};

const readJson = <T = any>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
const resolveRepoPath = (filePath: string): string => path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

describe("NHM2 ricci4 renderer backcompat", () => {
  const metadataPath = newestRicciMetadata();
  const metadata = readJson(metadataPath);

  it("still writes ricci-only, shell-only, and combined outputs", () => {
    for (const layer of ["ricci_only", "shell_only", "combined"]) {
      const output = metadata.outputs?.[layer];
      expect(output, layer).toBeTruthy();
      expect(fs.existsSync(resolveRepoPath(output.gif)), `${layer} gif`).toBe(true);
      expect(fs.existsSync(resolveRepoPath(output.mp4)), `${layer} mp4`).toBe(true);
      expect(fs.existsSync(resolveRepoPath(output.xzSlice)), `${layer} xz slice`).toBe(true);
      expect(fs.existsSync(resolveRepoPath(output.yzSlice)), `${layer} yz slice`).toBe(true);
    }
  });

  it("keeps core metadata fields stable", () => {
    expect(metadata.channels?.ricci4).toBeTruthy();
    expect(metadata.channels?.hull_sdf).toBeTruthy();
    expect(metadata.method?.isoExtractor).toBe("marching_tetrahedra");
    expect(metadata.method?.renderer).toBe("software_triangle_rasterizer");
  });

  it("does not make the old renderer depend on atlas ledger files", () => {
    const script = fs.readFileSync(path.join(process.cwd(), "scripts", "render-rodal-3d-turntable.ts"), "utf8");
    expect(script).not.toMatch(/layered-ledger-atlas|nhm2-layered-ledger|nhm2-blocker-ledger/i);
  });
});
