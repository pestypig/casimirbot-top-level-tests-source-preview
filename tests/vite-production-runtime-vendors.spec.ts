import { describe, expect, it } from "vitest";
import {
  isProductionRuntimeExternal,
  plotlySubresourceIntegrity,
  renderVendoredPlotlyModule,
  resolveDreiDependencyImport,
  rewriteProductionRuntimeImports,
} from "../scripts/vite-production-runtime-vendors";

describe("production runtime vendor convergence", () => {
  it("direct-imports the used Drei exports without consuming preceding imports", () => {
    const source = [
      'import { useMemo } from "react";',
      'import { OrbitControls as Controls, Stars } from "@react-three/drei";',
    ].join("\n");
    const result = rewriteProductionRuntimeImports(source);

    expect(result.rewrittenDreiExports).toBe(2);
    expect(result.code).toContain('import { useMemo } from "react";');
    expect(result.code).toContain(
      'import { OrbitControls as Controls } from "@react-three/drei/core/OrbitControls.js";',
    );
    expect(result.code).toContain(
      'import { Stars } from "@react-three/drei/core/Stars.js";',
    );
  });

  it("bypasses the three-stdlib barrel for Drei OrbitControls", () => {
    const resolved = resolveDreiDependencyImport(
      "three-stdlib",
      "C:\\repo\\node_modules\\@react-three\\drei\\core\\OrbitControls.js",
      process.cwd(),
    );

    expect(resolved).toMatch(
      /\/node_modules\/three-stdlib\/controls\/OrbitControls\.js$/,
    );
    expect(resolveDreiDependencyImport("three-stdlib", "/other.js", process.cwd())).toBeNull();
  });

  it("keeps Mermaid lazy while moving its complete ESM tree outside Rollup", () => {
    const result = rewriteProductionRuntimeImports(
      'void import("mermaid").then(({ default: mermaid }) => mermaid.render());',
      "/app/",
    );

    expect(result.rewrittenMermaidImports).toBe(1);
    expect(result.code).toContain(
      'import(/* @vite-ignore */ "/app/vendor/mermaid/mermaid.esm.min.mjs")',
    );
    expect(
      isProductionRuntimeExternal(
        "/app/vendor/mermaid/mermaid.esm.min.mjs",
      ),
    ).toBe(true);
    expect(isProductionRuntimeExternal("mermaid")).toBe(false);
  });

  it("pins the same-origin Plotly asset with SHA-384 integrity", () => {
    const integrity = plotlySubresourceIntegrity(process.cwd());
    const moduleSource = renderVendoredPlotlyModule("/", integrity);

    expect(integrity).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
    expect(moduleSource).toContain('const SCRIPT_URL = "/vendor/plotly/plotly.min.js";');
    expect(moduleSource).toContain(`const SCRIPT_INTEGRITY = ${JSON.stringify(integrity)};`);
    expect(moduleSource).toContain('import createPlotlyComponent from "react-plotly.js/factory";');
    expect(moduleSource).not.toContain("plotly.js/dist/plotly");
  });
});
