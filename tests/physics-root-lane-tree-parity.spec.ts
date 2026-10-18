import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RootEntry = {
  id: string;
  tree_lane?: string;
  tree_path?: string;
};

type PathFalsifier = {
  uncertainty_model?: string;
  test_refs?: string[];
};

type PathMaturityGate = {
  strict_fail_reason?: string;
};

type PathEntry = {
  root_id: string;
  falsifier?: PathFalsifier;
  maturity_gate?: PathMaturityGate;
};

type Manifest = { roots: RootEntry[]; paths: PathEntry[] };
type ResolverTree = { id: string; path: string };
type Resolvers = { trees: ResolverTree[] };
type TreeNode = {
  id: string;
  validity?: {
    equation_ref?: string;
  };
  derived_residual?: {
    schema?: string;
    equation_ref?: string;
    tolerance?: { max?: number };
    uncertainty?: { model?: string };
  };
};
type LaneTree = { rootId: string; nodes: TreeNode[] };

const REQUIRED_ROOT_TREE_MAP: Record<string, string> = {
  physics_spacetime_gr: "docs/knowledge/physics/physics-spacetime-gr-tree.json",
  physics_quantum_semiclassical: "docs/knowledge/physics/physics-quantum-semiclassical-tree.json",
  physics_thermodynamics_entropy: "docs/knowledge/physics/physics-thermodynamics-entropy-tree.json",
  physics_information_dynamics: "docs/knowledge/physics/physics-information-dynamics-tree.json",
  physics_prebiotic_chemistry: "docs/knowledge/physics/physics-prebiotic-chemistry-tree.json",
  physics_biology_life: "docs/knowledge/physics/physics-biology-life-tree.json",
  physics_runtime_safety_control: "docs/knowledge/physics/physics-runtime-safety-control-tree.json",
  physics_stellar_structure_nucleosynthesis: "docs/knowledge/physics/physics-stellar-structure-nucleosynthesis-tree.json",
};


describe("physics root-lane tree parity", () => {
  it("maps dedicated manifest root lanes to deterministic graph resolver tree lanes", () => {
    const repoRoot = process.cwd();
    const manifestPath = path.join(repoRoot, "configs", "physics-root-leaf-manifest.v1.json");
    const resolversPath = path.join(repoRoot, "configs", "graph-resolvers.json");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
    const resolvers = JSON.parse(fs.readFileSync(resolversPath, "utf8")) as Resolvers;

    const rootsById = new Map(manifest.roots.map((root) => [root.id, root]));
    const treesById = new Map(resolvers.trees.map((tree) => [tree.id, tree.path]));

    for (const [rootId, expectedPath] of Object.entries(REQUIRED_ROOT_TREE_MAP)) {
      const root = rootsById.get(rootId);
      expect(root).toBeTruthy();
      expect(root?.tree_lane).toBe(rootId);
      expect(root?.tree_path).toBe(expectedPath);
      expect(treesById.get(rootId)).toBe(expectedPath);
    }
  });

  it("requires explicit falsifier linkage for information-dynamics paths", () => {
    const repoRoot = process.cwd();
    const manifestPath = path.join(repoRoot, "configs", "physics-root-leaf-manifest.v1.json");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;

    const informationPaths = manifest.paths.filter((entry) => entry.root_id === "physics_information_dynamics");
    expect(informationPaths.length).toBeGreaterThan(0);

    for (const entry of informationPaths) {
      expect(entry.falsifier).toBeTruthy();
      expect(entry.falsifier?.test_refs ?? []).toContain("tests/physics-root-lane-tree-parity.spec.ts");
    }
  });


  it("requires explicit deterministic strict fail reasons for runtime safety control paths", () => {
    const repoRoot = process.cwd();
    const manifestPath = path.join(repoRoot, "configs", "physics-root-leaf-manifest.v1.json");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;

    const runtimePaths = manifest.paths.filter((entry) => entry.root_id === "physics_runtime_safety_control");
    expect(runtimePaths.length).toBeGreaterThan(0);

    for (const entry of runtimePaths) {
      expect(entry.falsifier).toBeTruthy();
      expect(entry.falsifier?.uncertainty_model?.startsWith("runtime_gate_thresholds")).toBe(true);
      expect(entry.maturity_gate?.strict_fail_reason).toBe("ROOT_LEAF_RUNTIME_CONTROL_PATH_MISSING");
    }
  });

  it("requires derived residual schema plus tolerance and uncertainty declaration for each physics root lane tree", () => {
    const repoRoot = process.cwd();
    const backbonePath = path.join(repoRoot, "configs", "physics-equation-backbone.v1.json");
    const backbone = JSON.parse(fs.readFileSync(backbonePath, "utf8")) as {
      equations: Array<{ id?: string }>;
    };
    const canonicalEquationIds = new Set(
      (backbone.equations ?? []).map((entry) => String(entry.id ?? "").trim()).filter(Boolean),
    );

    for (const [rootId, treePath] of Object.entries(REQUIRED_ROOT_TREE_MAP)) {
      const fullTreePath = path.join(repoRoot, treePath);
      const tree = JSON.parse(fs.readFileSync(fullTreePath, "utf8")) as LaneTree;

      const residualNodes = tree.nodes.filter((node) => Boolean(node.derived_residual));
      expect(residualNodes.length).toBeGreaterThan(0);

      for (const node of residualNodes) {
        const residual = node.derived_residual;
        expect(residual?.schema).toBeTruthy();
        expect(typeof residual?.tolerance?.max).toBe("number");
        expect(residual?.uncertainty?.model).toBeTruthy();
        expect(canonicalEquationIds.has(String(residual?.equation_ref ?? ""))).toBe(true);
      }
    }
  });

  it("threads hardened stellar M0 radiative-transfer equations into the stellar lane tree", () => {
    const repoRoot = process.cwd();
    const treePath = path.join(
      repoRoot,
      "docs",
      "knowledge",
      "physics",
      "physics-stellar-structure-nucleosynthesis-tree.json",
    );
    const tree = JSON.parse(fs.readFileSync(treePath, "utf8")) as LaneTree;

    const requiredRefs = [
      "stellar_radiative_transfer_equation",
      "stellar_lte_source_function",
      "stellar_nlte_source_function",
      "stellar_continuum_opacity_sum",
      "stellar_population_ionization_balance_diagnostic",
    ];
    const refsInTree = new Set(
      tree.nodes.map((entry) => String(entry.validity?.equation_ref ?? "").trim()).filter(Boolean),
    );

    for (const equationRef of requiredRefs) {
      expect(refsInTree.has(equationRef)).toBe(true);
    }
  });

  it("requires stellar opacity and M0 hardening nodes to keep evidence provenance bindings", () => {
    const repoRoot = process.cwd();
    const treePath = path.join(
      repoRoot,
      "docs",
      "knowledge",
      "physics",
      "physics-stellar-structure-nucleosynthesis-tree.json",
    );
    const tree = JSON.parse(fs.readFileSync(treePath, "utf8")) as LaneTree & {
      nodes: Array<{ id: string; evidence?: Array<{ type?: string; path?: string }> }>;
    };

    const hardenedNodeIds = [
      "physics-stellar-structure-nucleosynthesis-radiative-transfer-definition",
      "physics-stellar-structure-nucleosynthesis-lte-source-function-definition",
      "physics-stellar-structure-nucleosynthesis-nlte-source-function-definition",
      "physics-stellar-structure-nucleosynthesis-continuum-opacity-sum-definition",
      "physics-stellar-structure-nucleosynthesis-population-ionization-balance-diagnostic",
    ];
    const hardenedEvidencePath = "docs/knowledge/physics/stellar-radiative-transfer.md";

    const stellarOpacityDefinition = tree.nodes.find(
      (entry) => entry.id === "physics-stellar-structure-nucleosynthesis-stellar-opacity-definition",
    );
    expect(stellarOpacityDefinition).toBeTruthy();
    const stellarOpacityDocPaths = (stellarOpacityDefinition?.evidence ?? [])
      .filter((entry) => entry.type === "doc" && typeof entry.path === "string")
      .map((entry) => String(entry.path));
    const stellarOpacityDocPath = "docs/knowledge/physics/stellar-opacity.md";
    expect(stellarOpacityDocPaths).toContain(stellarOpacityDocPath);
    expect(fs.existsSync(path.join(repoRoot, stellarOpacityDocPath))).toBe(true);

    for (const nodeId of hardenedNodeIds) {
      const node = tree.nodes.find((entry) => entry.id === nodeId);
      expect(node).toBeTruthy();
      const docPaths = (node?.evidence ?? [])
        .filter((entry) => entry.type === "doc" && typeof entry.path === "string")
        .map((entry) => String(entry.path));
      expect(docPaths.length).toBeGreaterThan(0);
      expect(docPaths).toContain(hardenedEvidencePath);

      for (const docPath of docPaths) {
        expect(fs.existsSync(path.join(repoRoot, docPath))).toBe(true);
      }
    }
  });

});
