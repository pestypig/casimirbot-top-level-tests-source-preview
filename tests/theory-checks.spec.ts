import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  const full = join(process.cwd(), relativePath);
  if (!existsSync(full)) {
    throw new Error(`Missing file: ${relativePath}`);
  }
  return readFileSync(full, "utf8");
}

describe("TheoryRefs presence", () => {
  it("tags Ford–Roman QI in the retained enforcement and pipeline modules", () => {
    expect(read("server/energy-pipeline.ts")).toMatch(/TheoryRefs:[\s\S]*ford-roman-qi-1995/);
    expect(read("client/src/hooks/use-energy-pipeline.ts")).toMatch(/TheoryRefs:[\s\S]*ford-roman-qi-1995/);
    expect(read("modules/dynamic/dynamic-casimir.ts")).toMatch(/TheoryRefs:[\s\S]*ford-roman-qi-1995/);
  });

  it("tags Van den Broeck in geometry modules", () => {
    expect(read("modules/dynamic/stress-energy-equations.ts")).toMatch(/TheoryRefs:[\s\S]*vanden-broeck-1999/);
    expect(read("modules/warp/warp-module.ts")).toMatch(/TheoryRefs:[\s\S]*vanden-broeck-1999/);
    expect(read("client/src/components/AlcubierrePanel.tsx")).toMatch(/TheoryRefs:[\s\S]*vanden-broeck-1999/);
  });
});

describe("Ford–Roman duty clamp symbol exists", () => {
  it("includes a dutyEffectiveFR symbol", () => {
    expect(read("server/energy-pipeline.ts")).toMatch(/dutyEffectiveFR|frDuty(Max|Clamp|Ceil)/i);
  });
});

describe("Primitive manifest parity", () => {
  it("maps TOE-010 primitive policy/runtime/tests/tree-owner fields", () => {
    const manifest = JSON.parse(read("configs/warp-primitive-manifest.v1.json")) as {
      primitives?: Array<{
        primitive_id?: string;
        tree_owner?: string;
        policy_source?: { path?: string };
        evaluator?: { path?: string };
        tests?: string[];
      }>;
    };

    const primitive = (manifest.primitives ?? []).find(
      (entry) => entry.primitive_id === "TOE-010-unified-primitive-manifest",
    );

    expect(primitive).toBeTruthy();
    expect(primitive?.tree_owner).toBe("math");
    expect(primitive?.policy_source?.path).toBe("WARP_AGENTS.md");
    expect(primitive?.evaluator?.path).toBe("scripts/validate-agent-context-checklist.ts");
    expect(primitive?.tests).toEqual([
      "tests/startup-config.spec.ts",
      "tests/theory-checks.spec.ts",
    ]);
  });
});
