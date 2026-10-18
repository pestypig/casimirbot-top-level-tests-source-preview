import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = (): string => {
  const root = path.join(process.cwd(), "artifacts", "research", "full-solve", "rendered", "layered-ledger-atlas");
  expect(fs.existsSync(root), "layered-ledger-atlas render root exists").toBe(true);
  const candidates = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, "manifest.json"))
    .filter((candidate) => fs.existsSync(candidate))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  expect(candidates.length, "manifest candidates").toBeGreaterThan(0);
  return candidates[0];
};

const readJson = <T = any>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
const resolveRepoPath = (filePath: string): string => path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

const prohibitedPromotion = [
  /validated propulsion/i,
  /working warp drive/i,
  /physical mechanism confirmed/i,
  /Casimir propulsion proven/i,
  /QEI passed/i,
  /certificate validates NHM2 propulsion/i,
];

describe("NHM2 layered-ledger atlas manifest", () => {
  const manifestFile = manifestPath();
  const manifest = readJson(manifestFile);

  it("exists after render and references existing outputs", () => {
    expect(fs.existsSync(manifestFile)).toBe(true);
    for (const layer of manifest.layers ?? []) {
      expect(fs.existsSync(resolveRepoPath(layer.outputPath)), `${layer.id} output exists`).toBe(true);
    }
  });

  it("hashes every declared input ref", () => {
    for (const [key, ref] of Object.entries<any>(manifest.inputRefs ?? {})) {
      if (ref.exists === false) continue;
      expect(manifest.inputHashes?.[key], `${key} input hash`).toEqual(expect.any(String));
      expect(String(manifest.inputHashes[key]).length, `${key} hash length`).toBeGreaterThan(16);
    }
  });

  it("preserves claim locks", () => {
    expect(manifest.claimLock).toMatchObject({
      validationClaimAllowed: false,
      physicalMechanismClaimAllowed: false,
      promotionAllowed: false,
    });
  });

  it("keeps validation overlays off the hull while allowing spatial geometry on hull", () => {
    for (const layer of manifest.layers ?? []) {
      if (layer.semanticKind === "validation_overlay") expect(layer.visibleOnHull, layer.id).toBe(false);
      if (layer.semanticKind === "spatial_geometry") expect(typeof layer.visibleOnHull, layer.id).toBe("boolean");
    }
  });

  it("marks the tile inset as representative layout/process context, not field intensity", () => {
    const combined = (manifest.layers ?? []).find((layer: any) => layer.id === "combined_layered_atlas");
    const caption = String(combined?.metadata?.tileInset?.caption ?? "");
    const captionAndFlags = JSON.stringify(combined?.metadata?.tileInset ?? {});
    expect(captionAndFlags).toMatch(/representative/i);
    expect(captionAndFlags).toMatch(/layout|mask\/process|process mask/i);
    expect(caption).not.toMatch(/colors\s+(mean|represent|show)\s+(energy|field strength|curvature|spacetime intensity)/i);
  });

  it("matches sector counts from the cavity contract", () => {
    const cavityRef = manifest.inputRefs?.cavityContract?.resolvedPath ?? manifest.inputRefs?.cavityContract?.path;
    const cavity = readJson(resolveRepoPath(cavityRef));
    const sectorLayer = (manifest.layers ?? []).find((layer: any) => layer.id === "sector_lattice");
    expect(Number(sectorLayer?.metadata?.sectorCount)).toBe(Number(cavity.geometry?.sectorCount));
    expect(Number(sectorLayer?.metadata?.activeSectorCount)).toBe(Number(cavity.geometry?.concurrentSectors));
  });

  it("rejects prohibited promotion language in captions and notes", () => {
    const text = JSON.stringify({
      captions: manifest.captions,
      layers: manifest.layers,
      validationNotes: manifest.validationNotes,
      prohibitedClaims: manifest.prohibitedClaims,
    });
    for (const pattern of prohibitedPromotion) expect(text).not.toMatch(pattern);
  });
});
