import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderVegaLite } from "../../scripts/figures/render-vega.js";
import { renderDot } from "../../scripts/figures/render-graphviz.js";
import { renderSvgTable } from "../../scripts/figures/render-svg-table.js";

describe("NHM2 scientific figure atlas renderers", () => {
  const out = path.join("artifacts", "tmp", "scientific-figure-renderers-vitest");

  it("renders Vega-Lite SVG and PNG deterministically", async () => {
    const spec = {
      width: 120,
      height: 80,
      data: { values: [{ x: "a", y: 1 }, { x: "b", y: 2 }] },
      mark: "bar",
      encoding: { x: { field: "x", type: "nominal" }, y: { field: "y", type: "quantitative" } },
    };
    await renderVegaLite(spec, path.join(out, "vega.svg"), path.join(out, "vega.png"), path.join(out, "vega.spec.json"));
    await renderVegaLite(spec, path.join(out, "vega2.svg"), path.join(out, "vega2.png"), path.join(out, "vega2.spec.json"));
    expect(fs.existsSync(path.join(out, "vega.svg"))).toBe(true);
    expect(fs.existsSync(path.join(out, "vega.png"))).toBe(true);
    expect(fs.readFileSync(path.join(out, "vega.spec.json"), "utf8")).toEqual(fs.readFileSync(path.join(out, "vega2.spec.json"), "utf8"));
  });

  it("renders Graphviz SVG and PNG", async () => {
    const dot = "digraph g { a -> b [label=\"feeds\"]; }";
    await renderDot(dot, path.join(out, "graph.dot"), path.join(out, "graph.svg"), path.join(out, "graph.png"));
    expect(fs.existsSync(path.join(out, "graph.svg"))).toBe(true);
    expect(fs.existsSync(path.join(out, "graph.png"))).toBe(true);
  });

  it("renders SVG table PNG", async () => {
    await renderSvgTable("Claim locks", [{ label: "promotionAllowed", value: "false", status: "locked" }], path.join(out, "table.svg"), path.join(out, "table.png"));
    expect(fs.existsSync(path.join(out, "table.svg"))).toBe(true);
    expect(fs.existsSync(path.join(out, "table.png"))).toBe(true);
  });
});
