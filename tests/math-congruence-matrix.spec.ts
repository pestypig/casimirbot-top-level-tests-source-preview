import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMathCongruenceMatrix } from "../scripts/build-math-congruence-matrix";
import { validateMathCongruenceMatrix } from "../scripts/validate-math-congruence-matrix";

const tempRoots: string[] = [];

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixtureRepoRoot() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "math-congruence-matrix-"));
  tempRoots.push(repoRoot);

  writeJson(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), {
    schema_version: "physics_equation_backbone/1",
    equations: [{ id: "efe_baseline" }, { id: "runtime_safety_gate" }],
  });

  writeJson(path.join(repoRoot, "configs", "physics-root-leaf-manifest.v1.json"), {
    schema_version: "physics_root_leaf_manifest/1",
    roots: [
      { id: "physics_spacetime_gr", equation_refs: ["efe_baseline"] },
      { id: "physics_runtime_safety_control", equation_refs: ["runtime_safety_gate"] },
    ],
  });

  const matrix = buildMathCongruenceMatrix({ repoRoot });
  writeJson(path.join(repoRoot, "configs", "math-congruence-matrix.v1.json"), matrix);

  return repoRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


describe("buildMathCongruenceMatrix", () => {
  it("sorts rows deterministically by root/equation id", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "math-congruence-matrix-sort-"));
    tempRoots.push(repoRoot);

    writeJson(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), {
      schema_version: "physics_equation_backbone/1",
      equations: [{ id: "runtime_safety_gate" }, { id: "efe_baseline" }],
    });

    writeJson(path.join(repoRoot, "configs", "physics-root-leaf-manifest.v1.json"), {
      schema_version: "physics_root_leaf_manifest/1",
      roots: [
        { id: "physics_runtime_safety_control", equation_refs: ["runtime_safety_gate"] },
        { id: "physics_spacetime_gr", equation_refs: ["efe_baseline"] },
      ],
    });

    const matrix = buildMathCongruenceMatrix({ repoRoot });
    expect(matrix.rows.map((row) => row.id)).toEqual([
      "physics_runtime_safety_control__runtime_safety_gate",
      "physics_spacetime_gr__efe_baseline",
    ]);
  });
});

describe("validateMathCongruenceMatrix", () => {
  it("requires canonical curvature proxy equation bindings in repo matrix", () => {
    const repoRoot = process.cwd();
    const backbone = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "physics-equation-backbone.v1.json"), "utf8"),
    ) as { equations: Array<{ id: string }> };
    const matrix = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "math-congruence-matrix.v1.json"), "utf8"),
    ) as { rows: Array<{ id: string; equation_id: string; root_id: string }> };

    expect(backbone.equations.some((equation) => equation.id === "curvature_unit_proxy_contract")).toBe(true);
    const curvatureRow = matrix.rows.find(
      (row) =>
        row.id === "physics_spacetime_gr__curvature_unit_proxy_contract" &&
        row.root_id === "physics_spacetime_gr" &&
        row.equation_id === "curvature_unit_proxy_contract",
    ) as
      | {
          residual?: { metric?: string; threshold?: string };
          falsifier?: { evidence?: string };
        }
      | undefined;

    expect(curvatureRow).toBeDefined();
    expect(curvatureRow?.residual?.metric).toBe("curvature_unit_proxy_residual");
    expect(curvatureRow?.residual?.threshold).toBe("0.05");
    expect(curvatureRow?.falsifier?.evidence).toBe("curvature_unit_proxy_diagnostic_trace");
  });

  it("binds atomic energy-density proxy equation with residual, falsifier, and uncertainty model metadata", () => {
    const repoRoot = process.cwd();
    const matrix = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "configs", "math-congruence-matrix.v1.json"), "utf8"),
    ) as {
      rows: Array<{
        id: string;
        equation_id: string;
        root_id: string;
        residual?: { metric?: string; threshold?: string };
        falsifier?: { evidence?: string };
        uncertainty_model_id?: string;
      }>;
    };

    const row = matrix.rows.find(
      (entry) =>
        entry.id === "physics_quantum_semiclassical__atomic_energy_to_energy_density_proxy" &&
        entry.root_id === "physics_quantum_semiclassical" &&
        entry.equation_id === "atomic_energy_to_energy_density_proxy",
    );

    expect(row).toBeDefined();
    expect(row?.residual?.metric).toBe("atomic_energy_density_proxy_residual");
    expect(row?.residual?.threshold).toBe("0.15");
    expect(row?.falsifier?.evidence).toBe("atomic_energy_density_proxy_trace");
    expect(row?.uncertainty_model_id).toBe("atomic_energy_density_proxy_uq_v1");
  });

  it("passes for deterministic matrix with full root/equation coverage", () => {
    const repoRoot = fixtureRepoRoot();
    const result = validateMathCongruenceMatrix({ repoRoot });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when a root/equation pair from root manifest is missing", () => {
    const repoRoot = fixtureRepoRoot();
    const matrixPath = path.join(repoRoot, "configs", "math-congruence-matrix.v1.json");
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as { rows: Array<{ equation_id: string }> };
    matrix.rows = matrix.rows.filter((row) => row.equation_id !== "runtime_safety_gate");
    writeJson(matrixPath, matrix);

    const result = validateMathCongruenceMatrix({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "missing matrix row for root/equation pair: physics_runtime_safety_control::runtime_safety_gate",
    );
  });

  it("fails when binding/residual/falsifier fields are missing", () => {
    const repoRoot = fixtureRepoRoot();
    const matrixPath = path.join(repoRoot, "configs", "math-congruence-matrix.v1.json");
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as {
      rows: Array<Record<string, unknown>>;
    };
    matrix.rows[0].binding = undefined;
    matrix.rows[0].residual = undefined;
    matrix.rows[0].falsifier = undefined;
    writeJson(matrixPath, matrix);

    const result = validateMathCongruenceMatrix({ repoRoot });
    expect(result.ok).toBe(false);
    const errors = result.errors.join("\n");
    expect(errors).toContain("rows[0].binding is required");
    expect(errors).toContain("rows[0].residual is required");
    expect(errors).toContain("rows[0].falsifier is required");
  });
});
