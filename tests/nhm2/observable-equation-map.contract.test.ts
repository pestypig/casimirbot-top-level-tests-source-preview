import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateNhm2ObservableEquationMap, type Nhm2ObservableEquationMap } from "../../shared/contracts/nhm2-observable-equation-map.v1.js";
import { validateObservableEquationMap } from "../../tools/nhm2/validate-observable-equation-map.js";

const MAP_PATH = path.join("docs", "research", "nhm2-observable-equation-map.v1.json");

function loadMap(): Nhm2ObservableEquationMap {
  return JSON.parse(fs.readFileSync(MAP_PATH, "utf8")) as Nhm2ObservableEquationMap;
}

describe("NHM2 observable equation map contract", () => {
  it("loads and validates through the contract and tool", () => {
    const map = loadMap();
    expect(validateNhm2ObservableEquationMap(map)).toEqual([]);
    expect(validateObservableEquationMap(MAP_PATH)).toEqual([]);
  });

  it("keeps node IDs, edge endpoints, and figure IDs well-formed", () => {
    const map = loadMap();
    const nodeIds = new Set(map.nodes.map((node) => node.id));
    expect(nodeIds.size).toBe(map.nodes.length);
    for (const edge of map.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
    const figureIds = map.nodes.flatMap((node) => node.figurePlan.map((figure) => figure.figureId));
    expect(new Set(figureIds).size).toBe(figureIds.length);
  });

  it("hash-covers source whitepaper refs", () => {
    const map = loadMap();
    expect(map.sourceWhitepaperRefs.length).toBeGreaterThanOrEqual(5);
    for (const ref of map.sourceWhitepaperRefs) {
      expect(fs.existsSync(ref.path)).toBe(true);
      expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
