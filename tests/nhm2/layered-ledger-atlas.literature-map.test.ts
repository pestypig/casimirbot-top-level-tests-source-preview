import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const literaturePath = path.join(process.cwd(), "docs", "research", "nhm2-layered-ledger-literature-map.v1.json");
const manifestRoot = path.join(process.cwd(), "artifacts", "research", "full-solve", "rendered", "layered-ledger-atlas");

const readJson = <T = any>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const newestManifestPath = (): string => {
  const candidates = fs
    .readdirSync(manifestRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(manifestRoot, entry.name, "manifest.json"))
    .filter((candidate) => fs.existsSync(candidate))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  expect(candidates.length).toBeGreaterThan(0);
  return candidates[0];
};

const requiredIds = [
  "alcubierre_1994_warp_metric",
  "natario_2002_zero_expansion",
  "pfenning_ford_1997_warp_qi",
  "fewster_2005_energy_inequalities",
  "lamoreaux_1997_casimir_force",
  "klimchitskaya_2009_casimir_real_materials",
  "bobrick_martire_2021_physical_warp_drives",
  "santiago_schuster_visser_2022_generic_warp_nec",
];

const allowedUses = new Set(["context_only", "claim_boundary", "qei_context", "casimir_context"]);
const forbiddenWording = /validates NHM2|proves NHM2|confirms propulsion|demonstrates physical mechanism/i;
const mappedTerms = /QEI|quantum inequality|Casimir|NEC|WEC|warp metric|negative energy/i;

describe("NHM2 layered-ledger atlas literature map", () => {
  const literature = readJson(literaturePath);
  const refs = Array.isArray(literature.refs) ? literature.refs : [];
  const byId = new Map(refs.map((ref: any) => [ref.id, ref]));
  const manifest = readJson(newestManifestPath());

  it("contains required literature ids", () => {
    for (const id of requiredIds) expect(byId.has(id), id).toBe(true);
  });

  it("keeps every literature entry non-validating and context bounded", () => {
    for (const ref of refs) {
      expect(ref.doesValidateNHM2, ref.id).toBe(false);
      expect(allowedUses.has(ref.useInThisRepo), ref.id).toBe(true);
    }
  });

  it("does not use prohibited validating language in allowed caption use text", () => {
    for (const ref of refs) {
      const allowedText = String(ref.allowedCaptionUse ?? "");
      expect(allowedText, ref.id).not.toMatch(forbiddenWording);
    }
  });

  it("maps external physics caption terms to literature ids", () => {
    for (const caption of manifest.captions ?? []) {
      if (!mappedTerms.test(caption.text)) continue;
      expect(caption.literatureRefs?.length ?? 0, caption.id).toBeGreaterThan(0);
      for (const id of caption.literatureRefs ?? []) expect(byId.has(id), `${caption.id}:${id}`).toBe(true);
    }
  });
});
