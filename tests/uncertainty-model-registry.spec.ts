import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validatePhysicsRootLeafManifest } from "../scripts/validate-physics-root-leaf-manifest";
import { validateUncertaintyModelRegistry } from "../scripts/validate-uncertainty-model-registry";

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

describe("validateUncertaintyModelRegistry", () => {
  it("passes for the repo registry", () => {
    const result = validateUncertaintyModelRegistry({ repoRoot: process.cwd() });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when required parameters are empty", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "uncertainty-registry-"));
    writeJson(path.join(root, "configs", "uncertainty-model-registry.v1.json"), {
      schema_version: "uncertainty_model_registry/1",
      registry_id: "bad-registry",
      models: [{ id: "deterministic_threshold_contract_v1", description: "x", required_parameters: [] }],
    });

    const result = validateUncertaintyModelRegistry({ repoRoot: root });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("models[0].required_parameters must be non-empty");
  });
});

describe("physics manifest uncertainty model enforcement", () => {
  it("rejects unparameterized and undefined uncertainty model references", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "physics-uncertainty-"));

    writeJson(path.join(root, "configs", "uncertainty-model-registry.v1.json"), {
      schema_version: "uncertainty_model_registry/1",
      registry_id: "test",
      models: [
        {
          id: "deterministic_threshold_contract_v1",
          description: "d",
          required_parameters: ["pass_threshold", "fail_threshold"],
          optional_parameters: ["window"],
        },
      ],
    });

    writeJson(path.join(root, "configs", "physics-root-leaf-manifest.v1.json"), {
      schema_version: "physics_root_leaf_manifest/1",
      manifest_id: "m",
      claim_tier_ceiling: "diagnostic",
      roots: [
        {
          id: "physics_spacetime_gr",
          name: "r1",
          tree_lane: "physics_spacetime_gr",
          tree_path: "docs/knowledge/physics/physics-spacetime-gr-tree.json",
        },
        {
          id: "physics_quantum_semiclassical",
          name: "r2",
          tree_lane: "physics_quantum_semiclassical",
          tree_path: "docs/knowledge/physics/physics-quantum-semiclassical-tree.json",
        },
        {
          id: "physics_thermodynamics_entropy",
          name: "r3",
          tree_lane: "physics_thermodynamics_entropy",
          tree_path: "docs/knowledge/physics/physics-thermodynamics-entropy-tree.json",
        },
        {
          id: "physics_information_dynamics",
          name: "r4",
          tree_lane: "physics_information_dynamics",
          tree_path: "docs/knowledge/physics/physics-information-dynamics-tree.json",
        },
        {
          id: "physics_prebiotic_chemistry",
          name: "r5",
          tree_lane: "physics_prebiotic_chemistry",
          tree_path: "docs/knowledge/physics/physics-prebiotic-chemistry-tree.json",
        },
        {
          id: "physics_biology_life",
          name: "r6",
          tree_lane: "physics_biology_life",
          tree_path: "docs/knowledge/physics/physics-biology-life-tree.json",
        },
        {
          id: "physics_runtime_safety_control",
          name: "r7",
          tree_lane: "physics_runtime_safety_control",
          tree_path: "docs/knowledge/physics/physics-runtime-safety-control-tree.json",
        },
      ],
      leaves: [{ id: "leaf_universe_produces_life", prompt_family: "p", statement: "s" }],
      paths: [
        {
          id: "path",
          root_id: "physics_thermodynamics_entropy",
          leaf_id: "leaf_universe_produces_life",
          nodes: [
            "physics_thermodynamics_entropy",
            "physics_biology_life",
            "leaf_universe_produces_life",
          ],
          dag_bridges: ["life-cosmology-consciousness-bridge"],
          falsifier: {
            observable: "o",
            reject_rule: "r",
            uncertainty_model: "deterministic_threshold_contract_v1",
            test_refs: ["tests/physics-root-leaf-manifest.spec.ts"],
          },
          maturity_gate: {
            max_claim_tier: "diagnostic",
            required_evidence_types: ["proxy"],
            strict_fail_reason: "ROOT_LEAF_FALSIFIER_MISSING",
          },
        },
      ],
    });

    const unparameterizedResult = validatePhysicsRootLeafManifest({ repoRoot: root });
    expect(unparameterizedResult.ok).toBe(false);
    expect(unparameterizedResult.errors.some((error) => error.includes("must be parameterized"))).toBe(
      true,
    );

    const manifestPath = path.join(root, "configs", "physics-root-leaf-manifest.v1.json");
    const parsedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    parsedManifest.paths[0].falsifier.uncertainty_model =
      "unknown_model(pass_threshold=0.95,fail_threshold=0.90)";
    writeJson(manifestPath, parsedManifest);

    const undefinedResult = validatePhysicsRootLeafManifest({ repoRoot: root });
    expect(undefinedResult.ok).toBe(false);
    expect(
      undefinedResult.errors.some((error) => error.includes("references undefined model: unknown_model")),
    ).toBe(true);
  });
});
