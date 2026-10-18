import { describe, expect, it } from "vitest";
import {
  loadLucideIconExportMap,
  rewriteLucideNamedImports,
} from "../scripts/vite-lucide-direct-imports";

const exports = loadLucideIconExportMap(process.cwd());

describe("production Lucide import convergence", () => {
  it("rewrites named icons to exact modules while preserving types and utilities", () => {
    const result = rewriteLucideNamedImports(
      [
        'import { Activity, GaugeCircle as Meter, type LucideIcon, createLucideIcon } from "lucide-react";',
        "export const value = [Activity, Meter];",
      ].join("\n"),
      exports,
    );

    expect(result.rewrittenIcons).toBe(2);
    expect(result.code).toContain(
      'import Activity from "lucide-react/dist/esm/icons/activity.js";',
    );
    expect(result.code).toContain(
      'import Meter from "lucide-react/dist/esm/icons/circle-gauge.js";',
    );
    expect(result.code).toContain(
      'import { type LucideIcon, createLucideIcon } from "lucide-react";',
    );
  });

  it("supports multiline and single-quoted imports without changing other modules", () => {
    const result = rewriteLucideNamedImports(
      [
        "import {",
        "  AlertTriangle,",
        "  RotateCcw,",
        "} from 'lucide-react';",
        'import { Button } from "@/components/ui/button";',
      ].join("\n"),
      exports,
    );

    expect(result.rewrittenIcons).toBe(2);
    expect(result.code).toContain("icons/triangle-alert.js");
    expect(result.code).toContain("icons/rotate-ccw.js");
    expect(result.code).toContain('import { Button } from "@/components/ui/button";');
  });

  it("never consumes a preceding named import", () => {
    const source = [
      'import { useMemo } from "react";',
      'import { Card, CardContent } from "@/components/ui/card";',
      'import { Activity, ShieldCheck } from "lucide-react";',
    ].join("\n");
    const result = rewriteLucideNamedImports(source, exports);

    expect(result.rewrittenIcons).toBe(2);
    expect(result.code).toContain('import { useMemo } from "react";');
    expect(result.code).toContain(
      'import { Card, CardContent } from "@/components/ui/card";',
    );
  });

  it("preserves comments embedded in an icon import", () => {
    const source = [
      "import {",
      "  /** Theory reference retained for the panel. */",
      "  Activity,",
      "  ShieldCheck,",
      '} from "lucide-react";',
    ].join("\n");
    const result = rewriteLucideNamedImports(source, exports);

    expect(result.rewrittenIcons).toBe(2);
    expect(result.code).toContain(
      "/** Theory reference retained for the panel. */",
    );
    expect(result.code).toContain("icons/activity.js");
    expect(result.code).toContain("icons/shield-check.js");
  });
});
