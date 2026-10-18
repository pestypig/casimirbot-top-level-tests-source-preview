import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validatePhysicsRootLeafManifest } from "../scripts/validate-physics-root-leaf-manifest";

const tempRoots: string[] = [];

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeFixture(mutator?: (manifest: Record<string, unknown>) => void) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "physics-root-leaf-"));
  tempRoots.push(repoRoot);

  const manifest: Record<string, unknown> = {
    schema_version: "physics_root_leaf_manifest/1",
    manifest_id: "fixture",
    claim_tier_ceiling: "diagnostic",
    roots: [
      {
        id: "physics_spacetime_gr",
        name: "GR",
        tree_lane: "physics_spacetime_gr",
        tree_path: "docs/knowledge/physics/physics-spacetime-gr-tree.json",
      },
      {
        id: "physics_quantum_semiclassical",
        name: "QFT curved spacetime",
        tree_lane: "physics_quantum_semiclassical",
        tree_path: "docs/knowledge/physics/physics-quantum-semiclassical-tree.json",
      },
      {
        id: "physics_thermodynamics_entropy",
        name: "Thermodynamics",
        tree_lane: "physics_thermodynamics_entropy",
        tree_path: "docs/knowledge/physics/physics-thermodynamics-entropy-tree.json",
      },
      {
        id: "physics_information_dynamics",
        name: "Information dynamics",
        tree_lane: "physics_information_dynamics",
        tree_path: "docs/knowledge/physics/physics-information-dynamics-tree.json",
      },
      { id: "physics_prebiotic_chemistry", name: "Prebiotic chemistry" },
      { id: "physics_biology_life", name: "Biology" },
      { id: "physics_runtime_safety_control", name: "Runtime safety" },
      { id: "physics_casimir_force_measurement", name: "Casimir force measurement" },
      { id: "physics_stress_energy_brick", name: "Stress-energy brick" },
      { id: "physics_gr_diagnostics", name: "GR diagnostics" },
      { id: "physics_curvature_proxy", name: "Curvature proxy" },
      { id: "physics_collapse_benchmark", name: "Collapse benchmark" },
      { id: "physics_solar_coherence_hypothesis", name: "Solar coherence hypothesis" },
    ],
    leaves: [
      {
        id: "leaf_universe_produces_life",
        prompt_family: "how does the universe produce life",
        statement: "life prompt chain",
      },
      {
        id: "leaf_human_ai_financial_safety",
        prompt_family: "human protection from ai financial hack",
        statement: "safety prompt chain",
      },
      {
        id: "leaf_stress_energy_brick",
        prompt_family: "measured casimir force to stress-energy brick",
        statement: "flagship bridge stage 1",
      },
      {
        id: "leaf_gr_diagnostics",
        prompt_family: "stress-energy brick to gr diagnostics",
        statement: "flagship bridge stage 2",
      },
      {
        id: "leaf_curvature_proxy",
        prompt_family: "gr diagnostics to curvature proxy",
        statement: "flagship bridge stage 3",
      },
      {
        id: "leaf_collapse_benchmark",
        prompt_family: "curvature proxy to collapse benchmark",
        statement: "flagship bridge stage 4",
      },
      {
        id: "leaf_solar_collapse_hypothesis",
        prompt_family: "solar coherence to collapse hypothesis",
        statement: "quarantined hypothesis lane",
      },
    ],
    paths: [
      {
        id: "path_entropy_to_life",
        bundle_id: "legacy.root-leaf.audit",
        root_id: "physics_thermodynamics_entropy",
        leaf_id: "leaf_universe_produces_life",
        nodes: [
          "physics_thermodynamics_entropy",
          "physics_information_dynamics",
          "physics_biology_life",
          "leaf_universe_produces_life",
        ],
        dag_bridges: ["life-cosmology-consciousness-bridge"],
        falsifier: {
          observable: "citation linkage",
          reject_rule: "link_rate < 0.9",
          uncertainty_model: "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: ["tests/helix-ask-ps2-runtime-report.spec.ts", "tests/gr-constraint-network.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["measured", "proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_FALSIFIER_MISSING",
        },
      },
      {
        id: "path_spacetime_to_life",
        bundle_id: "legacy.root-leaf.audit",
        root_id: "physics_spacetime_gr",
        leaf_id: "leaf_universe_produces_life",
        nodes: [
          "physics_spacetime_gr",
          "physics_quantum_semiclassical",
          "physics_thermodynamics_entropy",
          "physics_biology_life",
          "leaf_universe_produces_life",
        ],
        dag_bridges: ["life-cosmology-consciousness-bridge"],
        falsifier: {
          observable: "equation-grounded path completeness",
          reject_rule: "missing canonical equation refs",
          uncertainty_model: "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: ["scripts/validate-physics-root-leaf-manifest.ts", "tests/gr-constraint-gate.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_PATH_INCOMPLETE",
        },
      },
      {
        id: "path_quantum_to_consciousness",
        bundle_id: "legacy.root-leaf.audit",
        root_id: "physics_quantum_semiclassical",
        leaf_id: "leaf_universe_produces_life",
        nodes: [
          "physics_quantum_semiclassical",
          "physics_information_dynamics",
          "physics_thermodynamics_entropy",
          "leaf_universe_produces_life",
        ],
        dag_bridges: ["life-cosmology-consciousness-bridge"],
        falsifier: {
          observable: "bridge provenance determinism",
          reject_rule: "strict bridge gate missing deterministic reason",
          uncertainty_model: "deterministic_contract_gate(decision_mode=strict,strict_reason_required=true)",
          test_refs: ["tests/helix-ask-bridge.spec.ts", "tests/gr-agent-loop.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_STRICT_BRIDGE_FAIL",
        },
      },
      {
        id: "path_information_to_life",
        bundle_id: "legacy.root-leaf.audit",
        root_id: "physics_information_dynamics",
        leaf_id: "leaf_universe_produces_life",
        nodes: [
          "physics_information_dynamics",
          "physics_prebiotic_chemistry",
          "physics_biology_life",
          "leaf_universe_produces_life",
        ],
        dag_bridges: ["life-cosmology-consciousness-bridge"],
        falsifier: {
          observable: "coherence linkage",
          reject_rule: "coherence_link_rate < 0.9",
          uncertainty_model: "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: ["tests/physics-root-leaf-manifest.spec.ts", "tests/gr-constraint-network.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_INFORMATION_DYNAMICS_PATH_MISSING",
        },
      },
      {
        id: "path_prebiotic_to_life",
        bundle_id: "legacy.root-leaf.audit",
        root_id: "physics_prebiotic_chemistry",
        leaf_id: "leaf_universe_produces_life",
        nodes: [
          "physics_prebiotic_chemistry",
          "physics_biology_life",
          "leaf_universe_produces_life",
        ],
        dag_bridges: ["life-cosmology-consciousness-bridge"],
        falsifier: {
          observable: "prebiotic alignment",
          reject_rule: "prebiotic_alignment_rate < 0.9",
          uncertainty_model: "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: ["tests/physics-root-leaf-manifest.spec.ts", "tests/gr-constraint-network.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["measured", "proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_PREBIOTIC_PATH_MISSING",
        },
      },
      {
        id: "path_runtime_control_to_safety",
        bundle_id: "legacy.root-leaf.audit",
        root_id: "physics_runtime_safety_control",
        leaf_id: "leaf_human_ai_financial_safety",
        nodes: [
          "physics_runtime_safety_control",
          "physics_information_dynamics",
          "leaf_human_ai_financial_safety",
        ],
        dag_bridges: ["life-cosmology-consciousness-bridge"],
        falsifier: {
          observable: "runtime determinism",
          reject_rule: "determinism_rate < 0.98",
          uncertainty_model: "runtime_gate_thresholds(determinism_min=0.98,citation_min=0.95,non_200_max=0.02)",
          test_refs: ["tests/casimir-verify-ps2.spec.ts", "tests/gr-constraint-network.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_RUNTIME_CONTROL_PATH_MISSING",
        },
      },
      {
        id: "path_life_to_safety",
        bundle_id: "legacy.root-leaf.audit",
        root_id: "physics_biology_life",
        leaf_id: "leaf_human_ai_financial_safety",
        nodes: [
          "physics_biology_life",
          "physics_runtime_safety_control",
          "leaf_human_ai_financial_safety",
        ],
        dag_bridges: ["life-cosmology-consciousness-bridge"],
        falsifier: {
          observable: "non_200 rate",
          reject_rule: "non_200_rate > 0.02",
          uncertainty_model: "runtime_gate_thresholds(determinism_min=0.98,citation_min=0.95,non_200_max=0.02)",
          test_refs: ["tests/casimir-verify-ps2.spec.ts", "tests/gr-constraint-network.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_RUNTIME_SAFETY_MISSING",
        },
      },
      {
        id: "path_casimir_force_to_stress_energy",
        bundle_id: "nhm2.curvature-collapse",
        root_id: "physics_casimir_force_measurement",
        leaf_id: "leaf_stress_energy_brick",
        nodes: [
          "physics_casimir_force_measurement",
          "physics_stress_energy_brick",
          "leaf_stress_energy_brick",
        ],
        dag_bridges: [
          "bridge-casimir-force-to-measured-mass-normalization",
          "bridge-measured-mass-normalization-to-stress-energy-brick",
        ],
        falsifier: {
          observable: "measured force bridge residuals",
          reject_rule: "massFitResidual_rms_rel > 0.1",
          uncertainty_model:
            "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: ["tests/pipeline-mass-mode.spec.ts", "tests/casimir-inference.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["measured", "inferred"],
          strict_fail_reason: "ROOT_LEAF_CASIMIR_STRESS_BRIDGE_FAIL",
        },
      },
      {
        id: "path_stress_energy_to_gr_diagnostics",
        bundle_id: "nhm2.curvature-collapse",
        root_id: "physics_stress_energy_brick",
        leaf_id: "leaf_gr_diagnostics",
        nodes: [
          "physics_stress_energy_brick",
          "physics_spacetime_gr",
          "physics_gr_diagnostics",
          "leaf_gr_diagnostics",
        ],
        dag_bridges: [
          "bridge-stress-energy-brick-to-gr-fieldset",
          "bridge-gr-fieldset-to-diagnostics-ledger",
        ],
        falsifier: {
          observable: "stress-energy to GR diagnostics residual parity",
          reject_rule: "stressEnergyToGRResidual_rms > 0.1",
          uncertainty_model:
            "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: ["tests/stress-energy-matter.spec.ts", "tests/gr-constraint-gate.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["measured", "proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_STRESS_GR_BRIDGE_FAIL",
        },
      },
      {
        id: "path_gr_diagnostics_to_curvature_proxy",
        bundle_id: "nhm2.curvature-collapse",
        root_id: "physics_gr_diagnostics",
        leaf_id: "leaf_curvature_proxy",
        nodes: ["physics_gr_diagnostics", "physics_curvature_proxy", "leaf_curvature_proxy"],
        dag_bridges: [
          "bridge-gr-diagnostics-to-kappa-parity",
          "bridge-curvature-ledger-to-kappa-proxy",
        ],
        falsifier: {
          observable: "equation-grounded kappa parity residual evidence",
          reject_rule: "kappaParityResidual_rms > 0.1 OR missing residual evidence",
          uncertainty_model:
            "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: ["tests/stress-energy-units.spec.ts", "tests/physics-equation-backbone.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["measured", "proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_GR_CURVATURE_BRIDGE_FAIL",
        },
      },
      {
        id: "path_curvature_proxy_to_collapse_benchmark",
        bundle_id: "nhm2.curvature-collapse",
        root_id: "physics_curvature_proxy",
        leaf_id: "leaf_collapse_benchmark",
        nodes: ["physics_curvature_proxy", "physics_collapse_benchmark", "leaf_collapse_benchmark"],
        dag_bridges: [
          "bridge-kappa-proxy-to-collapse-benchmark",
          "bridge-curvature-ledger-to-tau-rc-benchmark",
        ],
        falsifier: {
          observable: "prediction-registry-backed null model comparison",
          reject_rule: "nullModelComparisonWin != true",
          uncertainty_model:
            "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
          test_refs: [
            "tests/collapse-benchmark.phase2.routes.spec.ts",
            "tests/collapse-benchmark.phase4.estimator.spec.ts",
          ],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["measured", "proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_CURVATURE_COLLAPSE_BRIDGE_FAIL",
        },
      },
      {
        id: "path_solar_coherence_to_collapse_hypothesis",
        bundle_id: "nhm2.curvature-collapse",
        root_id: "physics_solar_coherence_hypothesis",
        leaf_id: "leaf_solar_collapse_hypothesis",
        nodes: [
          "physics_solar_coherence_hypothesis",
          "physics_information_dynamics",
          "physics_collapse_benchmark",
          "leaf_solar_collapse_hypothesis",
        ],
        dag_bridges: [
          "bridge-solar-coherence-to-collapse-hypothesis",
          "bridge-information-dynamics-to-hypothesis-quarantine",
        ],
        falsifier: {
          observable: "hypothesis quarantine determinism",
          reject_rule: "quarantineStatus != true",
          uncertainty_model:
            "deterministic_contract_gate(decision_mode=strict,strict_reason_required=true)",
          test_refs: ["tests/helix-ask-graph-resolver.spec.ts", "tests/helix-ask-bridge.spec.ts"],
        },
        maturity_gate: {
          max_claim_tier: "diagnostic",
          required_evidence_types: ["proxy", "inferred"],
          strict_fail_reason: "ROOT_LEAF_SOLAR_COLLAPSE_HYPOTHESIS_QUARANTINED",
        },
      },
    ],
    bridge_bundles: [
      {
        id: "legacy.root-leaf.audit",
        summary: "legacy broad root-leaf coverage",
        claim_scope: "runtime_contract",
        max_claim_tier: "diagnostic",
        path_ids: [
          "path_entropy_to_life",
          "path_spacetime_to_life",
          "path_quantum_to_consciousness",
          "path_information_to_life",
          "path_prebiotic_to_life",
          "path_runtime_control_to_safety",
          "path_life_to_safety",
        ],
      },
      {
        id: "nhm2.curvature-collapse",
        summary: "flagship measured Casimir to curvature-collapse bridge family",
        claim_scope: "cross_domain",
        max_claim_tier: "diagnostic",
        path_ids: [
          "path_casimir_force_to_stress_energy",
          "path_stress_energy_to_gr_diagnostics",
          "path_gr_diagnostics_to_curvature_proxy",
          "path_curvature_proxy_to_collapse_benchmark",
          "path_solar_coherence_to_collapse_hypothesis",
        ],
      },
    ],
    maturity_propagation_policy: {
      enabled: true,
      no_over_promotion: true,
      strict_fail_reason: "FAIL_MATURITY_CEILING_VIOLATION",
      default_max_claim_tier: "diagnostic",
      upstream_claim_tier_blocklist_for_certified: ["diagnostic", "reduced-order"],
      upstream_provenance_blocklist_for_certified: ["proxy", "inferred"],
    },
  };

  mutator?.(manifest);
  writeJson(path.join(repoRoot, "configs", "physics-root-leaf-manifest.v1.json"), manifest);
  writeJson(path.join(repoRoot, "configs", "uncertainty-model-registry.v1.json"), {
    schema_version: "uncertainty_model_registry/1",
    registry_id: "fixture-registry",
    models: [
      {
        id: "deterministic_threshold_contract_v1",
        required_parameters: ["pass_threshold", "fail_threshold"],
        optional_parameters: ["window", "aggregation"],
      },
      {
        id: "deterministic_contract_gate",
        required_parameters: ["decision_mode", "strict_reason_required"],
        optional_parameters: ["replay_window"],
      },
      {
        id: "runtime_gate_thresholds",
        required_parameters: ["determinism_min", "citation_min", "non_200_max"],
        optional_parameters: ["latency_p95_max_ms"],
      },
    ],
  });
  return repoRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("validatePhysicsRootLeafManifest", () => {
  it("passes for a complete root-to-leaf manifest", () => {
    const repoRoot = makeFixture();
    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });


  it("fails when dedicated root tree lane metadata is missing", () => {
    const repoRoot = makeFixture((manifest) => {
      const roots = manifest.roots as Array<Record<string, unknown>>;
      delete roots[0].tree_lane;
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("roots[0].tree_lane must be physics_spacetime_gr");
  });

  it("fails when a required root is missing", () => {
    const repoRoot = makeFixture((manifest) => {
      const roots = manifest.roots as Array<Record<string, unknown>>;
      manifest.roots = roots.filter((entry) => entry.id !== "physics_information_dynamics");
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "missing required root id: physics_information_dynamics",
    );
  });

  it("fails when root/leaf path endpoints are inconsistent", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      const target = paths[0];
      target.nodes = ["physics_biology_life", "leaf_universe_produces_life"];
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("paths[0].nodes must start with root_id");
  });

  it("fails when canonical entropy-first life path is missing", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      const target = paths[0];
      target.root_id = "physics_quantum_semiclassical";
      target.nodes = [
        "physics_quantum_semiclassical",
        "physics_information_dynamics",
        "physics_biology_life",
        "leaf_universe_produces_life",
      ];
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "paths must include at least one canonical entropy-first path ending at leaf_universe_produces_life",
    );
  });

  it("fails when the flagship curvature-collapse bundle is incomplete", () => {
    const repoRoot = makeFixture((manifest) => {
      const bundles = manifest.bridge_bundles as Array<Record<string, unknown>>;
      const flagship = bundles.find((entry) => entry.id === "nhm2.curvature-collapse");
      if (!flagship) {
        throw new Error("missing flagship bundle in fixture");
      }
      flagship.path_ids = ["path_casimir_force_to_stress_energy"];
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "bridge bundle nhm2.curvature-collapse missing required path_id: path_stress_energy_to_gr_diagnostics",
    );
  });

  it("fails when required root-lane entrypoint coverage is missing", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      manifest.paths = paths.filter((entry) => entry.root_id !== "physics_runtime_safety_control");
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "missing required root-lane entrypoint path for root_id: physics_runtime_safety_control",
    );
  });

  it("fails when falsifier and maturity gate are incomplete", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      const target = paths[0];
      target.falsifier = {
        observable: "",
        reject_rule: "",
        uncertainty_model: "",
        test_refs: [],
      };
      target.maturity_gate = {
        max_claim_tier: "certified",
        required_evidence_types: [],
        strict_fail_reason: "",
      };
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    const combined = result.errors.join("\n");
    expect(combined).toContain("paths[0].falsifier.observable is required");
    expect(combined).toContain("paths[0].falsifier.test_refs must be non-empty");
    expect(combined).toContain("paths[0].maturity_gate.max_claim_tier cannot exceed claim_tier_ceiling");
    expect(combined).toContain("paths[0].maturity_gate.strict_fail_reason is required");
  });

  it("fails deterministically when equation-grounded paths omit residual evidence", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      const target = paths[1];
      target.falsifier = {
        observable: "equation-grounded path completeness",
        reject_rule: "missing canonical equation refs",
        uncertainty_model:
          "deterministic_threshold_contract_v1(pass_threshold=0.95,fail_threshold=0.90)",
        test_refs: ["scripts/validate-physics-root-leaf-manifest.ts"],
      };
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "paths[1] references equation-grounded claims but does not provide residual evidence",
    );
  });

  it("fails deterministically on unknown uncertainty models", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      const target = paths[0];
      target.falsifier = {
        ...(target.falsifier as Record<string, unknown>),
        uncertainty_model: "unknown_model(pass_threshold=0.95)",
      };
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "paths[0].falsifier.uncertainty_model references undefined model: unknown_model",
    );
  });

  it("fails deterministically on unparameterized uncertainty models", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      const target = paths[0];
      target.falsifier = {
        ...(target.falsifier as Record<string, unknown>),
        uncertainty_model: "deterministic_threshold_contract_v1",
      };
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "paths[0].falsifier.uncertainty_model must be parameterized as model_id(param=value,...)",
    );
  });

  it("fails deterministically on tier over-claim patterns", () => {
    const repoRoot = makeFixture((manifest) => {
      const paths = manifest.paths as Array<Record<string, unknown>>;
      const target = paths[0];
      target.falsifier = {
        ...(target.falsifier as Record<string, unknown>),
        observable: "certified physically viable proof",
      };
    });

    const result = validatePhysicsRootLeafManifest({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "paths[0] contains tier over-claim language inconsistent with max_claim_tier=diagnostic",
    );
  });

  it("declares deterministic maturity propagation metadata in repo manifest", () => {
    const manifestPath = path.join(process.cwd(), "configs", "physics-root-leaf-manifest.v1.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      maturity_propagation_policy?: Record<string, unknown>;
    };
    const policy = manifest.maturity_propagation_policy ?? {};

    expect(policy.enabled).toBe(true);
    expect(policy.no_over_promotion).toBe(true);
    expect(policy.strict_fail_reason).toBe("FAIL_MATURITY_CEILING_VIOLATION");
    expect(policy.default_max_claim_tier).toBe("diagnostic");
    expect(policy.upstream_claim_tier_blocklist_for_certified).toEqual(["diagnostic", "reduced-order"]);
    expect(policy.upstream_provenance_blocklist_for_certified).toEqual(["proxy", "inferred"]);
  });

  it("declares the fail-closed Casimir-DP/OR boundary-coherence bridge", () => {
    const manifestPath = path.join(process.cwd(), "configs", "physics-root-leaf-manifest.v1.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      leaves?: Array<{ id: string; statement?: string }>;
      paths?: Array<{
        id: string;
        root_id?: string;
        leaf_id?: string;
        bundle_id?: string;
        dag_bridges?: string[];
        falsifier?: {
          observable?: string;
          readiness_block_rule?: string;
          reject_rule?: string;
          test_refs?: string[];
        };
        maturity_gate?: {
          max_claim_tier?: string;
          required_evidence_types?: string[];
          strict_fail_reason?: string;
        };
      }>;
      bridge_bundles?: Array<{
        id: string;
        claim_scope?: string;
        max_claim_tier?: string;
        path_ids?: string[];
      }>;
    };

    expect(
      manifest.leaves?.find(
        (entry) => entry.id === "leaf_casimir_dp_boundary_coherence_or_test",
      ),
    ).toEqual(
      expect.objectContaining({
        id: "leaf_casimir_dp_boundary_coherence_or_test",
      }),
    );
    expect(
      manifest.leaves?.find(
        (entry) =>
          entry.id === "leaf_casimir_dp_complete_apparatus_gravity_control",
      ),
    ).toEqual(
      expect.objectContaining({
        id: "leaf_casimir_dp_complete_apparatus_gravity_control",
        statement: expect.stringContaining("never plate pressure"),
      }),
    );

    const pathEntry = manifest.paths?.find(
      (entry) => entry.id === "path_quantum_semiclassical_to_casimir_dp_or_test",
    );
    expect(pathEntry).toEqual(
      expect.objectContaining({
        root_id: "physics_quantum_semiclassical",
        leaf_id: "leaf_casimir_dp_boundary_coherence_or_test",
        bundle_id: "casimir-dp.or-boundary-coherence",
      }),
    );
    expect(pathEntry?.maturity_gate).toEqual(
      expect.objectContaining({
        max_claim_tier: "diagnostic",
        strict_fail_reason: "ROOT_LEAF_CASIMIR_DP_OR_BRIDGE_FAIL",
      }),
    );
    expect(pathEntry?.maturity_gate?.required_evidence_types).toEqual(
      expect.arrayContaining(["measured", "proxy", "inferred"]),
    );
    expect(pathEntry?.dag_bridges).toEqual(expect.arrayContaining([
      "bridge-stage4-2p-worldline-to-ordinary-proper-time",
      "bridge-stage4-2r-four-cell-to-boundary-interaction",
      "bridge-stage4-2s-green-response-to-ordinary-complex-coherence",
      "bridge-stage4-2s-zero-collapse-bridge-to-claim-boundary",
    ]));
    expect(pathEntry?.falsifier?.readiness_block_rule).toContain(
      "stage4_2sOrdinaryNullIntegrationReady != true",
    );
    expect(pathEntry?.falsifier?.readiness_block_rule).toContain(
      "stage4_2sZeroCollapseBridgePreserved != true",
    );
    expect(pathEntry?.falsifier?.observable).toContain(
      "Stage-4.2S measured conserved source spectra",
    );
    expect(pathEntry?.falsifier?.test_refs).toEqual(expect.arrayContaining([
      "tests/casimir-dp-proper-time-worldline-closure-stage4-2p.spec.ts",
      "tests/casimir-dp-integrated-feasibility-pilot-stage4-2r.spec.ts",
      "tests/casimir-dp-retarded-source-propagation-stage4-2s.spec.ts",
      "tests/casimir-dp-stage4-2s-campaign.spec.ts",
    ]));

    const compositionPath = manifest.paths?.find(
      (entry) =>
        entry.id ===
        "path_quantum_semiclassical_to_casimir_dp_composition_internal_energy_successor",
    );
    expect(compositionPath).toEqual(expect.objectContaining({
      root_id: "physics_quantum_semiclassical",
      leaf_id: "leaf_casimir_dp_composition_internal_energy_successor",
      bundle_id: "casimir-dp.or-boundary-coherence",
    }));
    expect(compositionPath?.dag_bridges).toEqual(expect.arrayContaining([
      "bridge-replicated-casimir-dp-residual-to-composition-successor",
      "bridge-internal-energy-equivalence-to-conserved-source-gate",
      "bridge-qcd-decomposition-to-constituent-nonbridge",
    ]));
    expect(compositionPath?.falsifier?.readiness_block_rule).toContain(
      "parentPositiveIndependentReplicationReady != true",
    );
    expect(compositionPath?.falsifier?.readiness_block_rule).toContain(
      "successorAuthorityPacketsReady != 9",
    );
    expect(compositionPath?.maturity_gate).toEqual(expect.objectContaining({
      max_claim_tier: "diagnostic",
      strict_fail_reason:
        "ROOT_LEAF_CASIMIR_DP_COMPOSITION_SUCCESSOR_BLOCKED",
    }));

    const evolutionaryPath = manifest.paths?.find(
      (entry) =>
        entry.id ===
        "path_casimir_dp_residual_to_evolutionary_coherence_conditional",
    );
    expect(evolutionaryPath).toEqual(expect.objectContaining({
      root_id: "physics_quantum_semiclassical",
      leaf_id: "leaf_casimir_dp_evolutionary_coherence_conditional",
      bundle_id: "casimir-dp.or-boundary-coherence",
    }));
    expect(evolutionaryPath?.nodes).toEqual(expect.arrayContaining([
      "physics_information_dynamics",
      "physics_biology_life",
    ]));
    expect(evolutionaryPath?.dag_bridges).toEqual(expect.arrayContaining([
      "bridge-replicated-nonbiological-coherence-law-to-biological-test-entry",
      "bridge-heritable-phenotype-to-fitness-covariance",
      "bridge-evolutionary-coherence-control-to-teleology-nonclaim",
    ]));
    expect(evolutionaryPath?.falsifier?.readiness_block_rule).toContain(
      "replicatedNonbiologicalCoherenceLawReady != true",
    );
    expect(evolutionaryPath?.falsifier?.readiness_block_rule).toContain(
      "fitnessTraitCovarianceReady != true",
    );
    expect(evolutionaryPath?.falsifier?.readiness_block_rule).toContain(
      "adaptationTeleologySeparationPreserved != true",
    );
    expect(evolutionaryPath?.maturity_gate).toEqual(expect.objectContaining({
      max_claim_tier: "diagnostic",
      strict_fail_reason:
        "ROOT_LEAF_CASIMIR_DP_EVOLUTIONARY_COHERENCE_CONDITIONAL_FAIL",
    }));

    const readinessBlockRule = (
      pathEntry?.falsifier as {
        readiness_block_rule?: string;
      } | undefined
    )?.readiness_block_rule ?? "";
    expect(readinessBlockRule).toContain(
      "upstreamAuthorityIntegrity != true",
    );
    expect(readinessBlockRule).toContain("preregistrationFrozen != true");
    expect(readinessBlockRule).toContain("measuredEvidenceReady != true");
    expect(readinessBlockRule).toContain("fixedDeltaRhoMatched != true");
    expect(readinessBlockRule).toContain(
      "complexCoherenceIdentifiable != true",
    );
    expect(readinessBlockRule).toContain(
      "ordinaryDecoherenceClosure != true",
    );
    expect(readinessBlockRule).toContain(
      "polarizationQEDControlReady != true",
    );
    expect(readinessBlockRule).toContain("thermalFdtControlReady != true");
    expect(readinessBlockRule).toContain(
      "tensorDimensionalCongruence != true",
    );
    expect(readinessBlockRule).toContain(
      "qedScaleHierarchyCalibration != true",
    );
    expect(readinessBlockRule).toContain(
      "electronMassHiggsAnchorCalibration != true",
    );
    expect(readinessBlockRule).toContain("planckSolarCalibration != true");
    expect(readinessBlockRule).toContain(
      "crossScaleDpNonbridgePreserved != true",
    );
    expect(readinessBlockRule).toContain("namedDpManifestUnchanged != true");
    expect(readinessBlockRule).toContain(
      "phaseResidualReplayDeterministic != true",
    );
    expect(readinessBlockRule).toContain(
      "collapseDiscriminatorPresent != true",
    );
    expect(readinessBlockRule).toContain(
      "heldOutModelComparisonReady != true",
    );
    expect(readinessBlockRule).toContain(
      "boundaryToCoherenceTransferKernelRegistered != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2bForecastContractReady != true",
    );
    expect(readinessBlockRule).toContain(
      "responseCorrectedSpectralThermometryReady != true",
    );
    expect(readinessBlockRule).toContain(
      "physicalSensorNoiseSeparated != true",
    );
    expect(readinessBlockRule).toContain(
      "fullCrossSpectralCovarianceReady != true",
    );
    expect(readinessBlockRule).toContain(
      "completeJointSystemEquivalenceReady != true",
    );
    expect(readinessBlockRule).toContain(
      "apparatusDpPowerReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2bMeasuredEvidenceCampaignVersioned != true",
    );
    expect(readinessBlockRule).toContain(
      "bridgeCompared == true AND registeredNumericBridgeKernel != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2eCausalRecoveryReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2eQEDMetricNonbridgePreserved != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2eStandardDpBoundaryIndependence != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2eMeasuredTimingControlReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2eCompleteApparatusMetricReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fSoftwareEquationRecoveryReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fFiniteGeometryMaxwellReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fMeasuredMaterialGreenReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fCandidateTransportIdentityReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fDpParameterRegionReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fCompanionDetectorReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fCompanionModelIdentityReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fStatePreparationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fQuasistaticModulationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fCompleteApparatusStressEnergyReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2fZeroBridgePreserved != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gDesignIdentityFrozen != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gDpCompanionConsistent != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gMeasuredPacketIntegrityReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gFiniteGeometryMaterialReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gStatePreparationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gBranchMetrologyReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gModulationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gMeasuredCovarianceReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gCompanionDetectorReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gBlindReplicationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gPilotIdentifiabilityReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gCompleteStressEnergyReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2gZeroBridgePreserved != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2hInstrumentRegistryReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2hPacketCompilationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2hZeroBridgePreserved != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2iFourCellContractReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2iWavepacketEmpiricalReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2iOrdinaryInteractionResponseReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2iMeasuredContrastReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2iStandardDpBoundaryIndependence != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2iTransferKernelRegistered != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2jSoftwareDiagnosticReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2jCompleteDensityRepresentationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2jMeasuredEnvironmentModelReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2jEnvironmentalCandidateReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2jStatePreparationReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2jExternalBoundMappingReady != true",
    );
    expect(readinessBlockRule).toContain(
      "stage4_2jZeroBridgePreserved != true",
    );
    expect(readinessBlockRule).toContain("stage4_2kSoftwareDiagnosticReady != true");
    expect(readinessBlockRule).toContain("stage4_2kMeasuredMaterialSpectrumReady != true");
    expect(readinessBlockRule).toContain("stage4_2kFiniteGeometryGreenReady != true");
    expect(readinessBlockRule).toContain("stage4_2kBranchOrientationReady != true");
    expect(readinessBlockRule).toContain("stage4_2kOrdinaryPhaseCovarianceReady != true");
    expect(readinessBlockRule).toContain("stage4_2kQlbeEnvironmentReady != true");
    expect(readinessBlockRule).toContain("stage4_2kResidualAttributionReady != true");
    expect(readinessBlockRule).toContain("stage4_2kZeroBridgePreserved != true");
    expect(readinessBlockRule).toContain("stage4_2lSoftwareDiagnosticReady != true");
    expect(readinessBlockRule).toContain("stage4_2lAsBuiltGeometryReady != true");
    expect(readinessBlockRule).toContain("stage4_2lFullFiniteGeometryGreenReady != true");
    expect(readinessBlockRule).toContain("stage4_2lMeasuredMaterialSpectrumReady != true");
    expect(readinessBlockRule).toContain("stage4_2lEmpiricalPhaseCovarianceReady != true");
    expect(readinessBlockRule).toContain("stage4_2lMeasuredQlbeEnvironmentReady != true");
    expect(readinessBlockRule).toContain("stage4_2lStatePreparationReady != true");
    expect(readinessBlockRule).toContain("stage4_2lExactExternalBoundMappingReady != true");
    expect(readinessBlockRule).toContain("stage4_2lCompleteMassDensityAuthorityReady != true");
    expect(readinessBlockRule).toContain("stage4_2lZeroBridgePreserved != true");
    expect(readinessBlockRule).toContain("stage4_2mSoftwareSearchReady != true");
    expect(readinessBlockRule).toContain("stage4_2mSyntheticRegionReady != true");
    expect(readinessBlockRule).toContain("stage4_2mMeasuredMaterialReady != true");
    expect(readinessBlockRule).toContain("stage4_2mAsBuiltGeometryReady != true");
    expect(readinessBlockRule).toContain("stage4_2mFullMaxwellReady != true");
    expect(readinessBlockRule).toContain("stage4_2mMeasuredPhaseCovarianceReady != true");
    expect(readinessBlockRule).toContain("stage4_2mMeasuredQlbeReady != true");
    expect(readinessBlockRule).toContain("stage4_2mStatePreparationReady != true");
    expect(readinessBlockRule).toContain("stage4_2mMeasuredCompanionReady != true");
    expect(readinessBlockRule).toContain("stage4_2mIndependentReplicationReady != true");
    expect(readinessBlockRule).toContain("stage4_2mZeroBridgePreserved != true");
    expect(readinessBlockRule).toContain("stage4_2nSoftwarePipelineReady != true");
    expect(readinessBlockRule).toContain("stage4_2nSpecimenMaterialReady != true");
    expect(readinessBlockRule).toContain("stage4_2nAsBuiltGeometryReady != true");
    expect(readinessBlockRule).toContain("stage4_2nFullMaxwellGreenReady != true");
    expect(readinessBlockRule).toContain("stage4_2nIndependentSolverReady != true");
    expect(readinessBlockRule).toContain("stage4_2nMeasuredCalibrationReady != true");
    expect(readinessBlockRule).toContain("stage4_2nMeasuredCovarianceReady != true");
    expect(readinessBlockRule).toContain("stage4_2nOrdinaryNullAuthorityReady != true");
    expect(readinessBlockRule).toContain("stage4_2nZeroBridgePreserved != true");
    expect(readinessBlockRule).toContain("stage4_2oComponentReplayReady != true");
    expect(readinessBlockRule).toContain("stage4_2oJointProtocolValidationReady != true");
    expect(readinessBlockRule).toContain("stage4_2oCrossApparatusIsolationReady != true");
    expect(readinessBlockRule).toContain("stage4_2oExactExternalBoundMappingReady != true");
    expect(readinessBlockRule).toContain("stage4_2oZeroBridgePreserved != true");
    expect(readinessBlockRule).toContain("stage4_2qSoftwareRecoveryReady != true");
    expect(readinessBlockRule).toContain("stage4_2qSpecimenImpedanceReady != true");
    expect(readinessBlockRule).toContain("stage4_2qGreenResponseReady != true");
    expect(readinessBlockRule).toContain("stage4_2qSwitchCovarianceReady != true");
    expect(readinessBlockRule).toContain("stage4_2qJointCoherenceReady != true");
    expect(readinessBlockRule).toContain("stage4_2qZeroCollapseBridgePreserved != true");
    const rejectRule = pathEntry?.falsifier?.reject_rule ?? "";
    expect(rejectRule).toContain("heldOutReplicationReady == true");
    expect(rejectRule).toContain("apparatusDpPowerReady == true");
    expect(rejectRule).toContain(
      "registeredNonunitarySignatureMatch != true",
    );
    expect(rejectRule).toContain("frozenDpScalingMatch != true");
    expect(rejectRule).toContain("branchConditionedCompleteStressReady != true");
    expect(rejectRule).toContain("boundaryMetricNoiseKernelRegistered != true");
    expect(rejectRule).toContain("boundaryCoherenceExtensionRegistered != true");
    expect(rejectRule).not.toContain(
      "electronMassHiggsAnchorCalibration",
    );
    expect(pathEntry?.dag_bridges).toEqual(
      expect.arrayContaining([
        "bridge-stage3-complex-coherence-to-model-discrimination",
        "bridge-stage3-ordinary-physics-null-to-residual",
        "bridge-stage3-named-dp-to-companion-falsifier",
        "bridge-stage3-manifold-registry-to-bridge-admission",
        "bridge-magnetar-qed-precedent-to-polarization-control",
        "bridge-branch-conditioned-complete-stress-to-metric-kernel",
        "bridge-retarded-metric-noise-to-coherence-extension",
        "bridge-boundary-coherence-extension-to-orch-conditional-nonclaim",
        "bridge-stage4-transverse-polarization-to-qed-null",
        "bridge-stage4-planck-fdt-to-thermal-null",
        "bridge-stage4-congruence-to-model-admission",
        "bridge-stage4-2i-four-cell-to-boundary-branch-interaction",
        "bridge-stage4-2i-ordinary-covariance-to-corrected-cross-ratio",
        "bridge-stage4-2i-wavepacket-custody-to-branch-equivalence",
        "bridge-stage4-2i-boundary-independent-dp-to-interaction-nonbridge",
        "bridge-stage4-2j-schrodinger-phase-to-coherence-separation",
        "bridge-stage4-2j-density-representation-to-forecast-envelope",
        "bridge-stage4-2j-gas-screen-to-apparatus-no-go",
        "bridge-stage4-2j-hydrogen-scale-to-semantic-nonbridge",
        "bridge-stage4-2k-ground-state-response-to-ordinary-casimir-null",
        "bridge-stage4-2k-orientation-phase-to-residual-attribution-gate",
        "bridge-stage4-2k-phase-jitter-to-coherence-loss-budget",
        "bridge-stage4-2k-qlbe-readiness-to-environmental-no-go",
        "bridge-stage4-2n-material-loss-to-imaginary-axis-response",
        "bridge-stage4-2n-green-fdt-to-ordinary-complex-coherence",
        "bridge-stage4-2n-four-cell-ratio-to-boundary-superposition-control",
        "bridge-stage4-2n-zero-bridge-to-claim-boundary",
        "bridge-stage4-2o-public-fringe-to-component-recovery",
        "bridge-stage4-2o-boundary-response-to-component-recovery",
        "bridge-stage4-2o-heldout-covariance-to-component-recovery",
        "bridge-stage4-2o-external-bound-to-model-scope",
        "bridge-stage4-2o-no-fusion-to-claim-boundary",
        "bridge-stage4-2q-superconducting-impedance-to-ordinary-green-response",
        "bridge-stage4-2q-boundary-ratio-to-standard-diosi-cancellation",
        "bridge-stage4-2q-toggle-confounders-to-control-no-go",
        "bridge-stage4-2q-higgs-condensate-bec-to-collapse-nonbridge",
        "bridge-stage4-2r-diosi-precision-to-primary-estimand",
        "bridge-stage4-2r-four-cell-to-boundary-interaction",
        "bridge-stage4-2r-authority-packets-to-pilot-no-go",
        "bridge-stage4-2r-zero-bridge-to-claim-boundary",
        "bridge-stage4-2l-authoritative-geometry-to-finite-em-model",
        "bridge-stage4-2l-material-and-geometry-to-phase-covariance",
        "bridge-stage4-2l-qlbe-and-state-preparation-to-redesign-no-go",
        "bridge-stage4-2l-density-envelope-and-external-bound-to-model-region",
        "bridge-stage4-expanded-null-to-prediction-residual",
        "bridge-stage4-same-dimension-to-nonbridge",
        "bridge-stage4-1-qed-scale-hierarchy-to-semantic-nonbridge",
        "bridge-stage4-2a-electron-mass-higgs-anchor-to-semantic-nonbridge",
        "bridge-stage4-2a-planck-solar-calibration-to-semantic-nonbridge",
        "bridge-stage4-2b-scale-transport-to-frozen-dp-signature",
        "bridge-stage4-2b-spectral-thermometry-to-ordinary-null",
        "bridge-stage4-2b-sensor-forward-model-to-nuisance-covariance",
        "bridge-stage4-2b-full-covariance-to-complex-residual",
        "bridge-stage4-2b-dp-scaling-to-identifiability-power",
        "bridge-stage4-2b-complete-equivalence-to-conditional-dp-null",
        "bridge-stage4-2b-missing-kernel-to-manifold-nonclaim",
        "bridge-stage4-2e-adm-null-clock-to-causal-consistency",
        "bridge-stage4-2e-casimir-screen-to-complete-tensor-nonclaim",
        "bridge-stage4-2e-qed-propagation-to-metric-nonbridge",
        "bridge-stage4-2e-standard-dp-boundary-independence",
        "bridge-stage4-2f-maxwell-green-fdt-to-ordinary-null",
        "bridge-stage4-2f-named-dp-to-frozen-signature",
        "bridge-stage4-2f-apparatus-authority-to-pilot-readiness",
        "bridge-stage4-2f-zero-observable-bridge-preservation",
        "bridge-stage4-2g-single-identity-to-dp-prediction",
        "bridge-stage4-2g-packet-to-empirical-pilot-readiness",
        "bridge-stage4-2g-companion-to-same-identity",
        "bridge-stage4-2g-complete-stress-to-manifold-nonclaim",
        "bridge-stage4-2h-instrument-calibration-to-commissioning-gate",
        "bridge-stage4-2h-raw-covariance-custody-to-packet-compilation",
        "bridge-stage4-2h-synthetic-dry-run-to-empirical-nonclaim",
        "bridge-stage4-2h-measured-dossier-to-pilot-readiness",
      ]),
    );
    expect(pathEntry?.falsifier?.test_refs).toEqual(
      expect.arrayContaining([
        "tests/casimir-dp-data-readiness.spec.ts",
        "tests/casimir-dp-phase-coherence.spec.ts",
        "tests/casimir-dp-or-phase-stage2.spec.ts",
        "tests/casimir-dp-proposal-closure.spec.ts",
        "tests/casimir-dp-complex-coherence.spec.ts",
        "tests/casimir-dp-qed-green-noise.spec.ts",
        "tests/casimir-dp-dp-companion.spec.ts",
        "tests/casimir-dp-gravity-upper-bound.spec.ts",
        "tests/casimir-dp-model-comparison.spec.ts",
        "tests/casimir-dp-manifold-kernel-registry.spec.ts",
        "tests/casimir-dp-evidence-map-stage3.spec.ts",
        "tests/casimir-dp-polarization-qed-control.spec.ts",
        "tests/casimir-dp-radiative-thermal-closure.spec.ts",
        "tests/casimir-dp-tensor-dimensional-congruence.spec.ts",
        "tests/casimir-dp-polarization-congruence-stage4.spec.ts",
        "tests/casimir-dp-qed-scale-hierarchy-calibration.spec.ts",
        "tests/casimir-dp-electron-mass-higgs-anchor-stage4-2a.spec.ts",
        "tests/casimir-dp-planck-solar-calibration-stage4-2a.spec.ts",
        "tests/casimir-dp-stage4-2a-campaign.spec.ts",
        "tests/casimir-dp-apparatus-scale-transport-stage4-2b.spec.ts",
        "tests/casimir-dp-apparatus-spectral-thermometry-stage4-2b.spec.ts",
        "tests/casimir-dp-apparatus-response-covariance-stage4-2b.spec.ts",
        "tests/casimir-dp-dp-scaling-forecast-stage4-2b.spec.ts",
        "tests/casimir-dp-apparatus-coherence-residual-stage4-2b.spec.ts",
        "tests/casimir-dp-apparatus-identifiability-stage4-2b.spec.ts",
        "tests/casimir-dp-stage4-2b-contract.spec.ts",
        "tests/casimir-dp-stage4-2b-campaign.spec.ts",
        "tests/casimir-dp-causal-cone-clock-stage4-2e.spec.ts",
        "tests/casimir-dp-stage4-2e-campaign.spec.ts",
        "tests/casimir-dp-maxwell-macroscopic-qed-closure-stage4-2f.spec.ts",
        "tests/casimir-dp-stage4-2f-campaign.spec.ts",
        "tests/casimir-dp-empirical-feasibility-pilot-stage4-2g.spec.ts",
        "tests/casimir-dp-stage4-2g-campaign.spec.ts",
        "tests/casimir-dp-commissioning-intake-stage4-2h.spec.ts",
        "tests/casimir-dp-stage4-2h-campaign.spec.ts",
        "tests/casimir-dp-schrodinger-mass-density-stage4-2j.spec.ts",
        "tests/casimir-dp-stage4-2j-campaign.spec.ts",
        "tests/casimir-dp-microscopic-em-closure-stage4-2k.spec.ts",
        "tests/casimir-dp-stage4-2k-campaign.spec.ts",
        "tests/casimir-dp-empirical-authority-stage4-2l.spec.ts",
        "tests/casimir-dp-stage4-2l-campaign.spec.ts",
        "tests/casimir-dp-material-thermal-ordinary-null-stage4-2n.spec.ts",
        "tests/casimir-dp-stage4-2n-campaign.spec.ts",
        "tests/casimir-dp-public-data-component-validation-stage4-2o.spec.ts",
        "tests/casimir-dp-stage4-2o-campaign.spec.ts",
        "tests/casimir-dp-superconducting-boundary-control-stage4-2q.spec.ts",
        "tests/casimir-dp-stage4-2q-campaign.spec.ts",
        "tests/casimir-dp-integrated-feasibility-pilot-stage4-2r.spec.ts",
        "tests/casimir-dp-stage4-2r-campaign.spec.ts",
      ]),
    );

    const gravityPath = manifest.paths?.find(
      (entry) =>
        entry.id ===
        "path_complete_casimir_apparatus_to_ordinary_gravity_control",
    );
    expect(gravityPath).toEqual(
      expect.objectContaining({
        root_id: "physics_quantum_semiclassical",
        leaf_id: "leaf_casimir_dp_complete_apparatus_gravity_control",
        bundle_id: "casimir-dp.or-boundary-coherence",
      }),
    );
    expect(gravityPath?.falsifier?.reject_rule).toContain(
      "completeApparatusLedger != true",
    );
    expect(gravityPath?.falsifier?.reject_rule).toContain(
      "pressureUsedAsWeight == true",
    );
    expect(gravityPath?.falsifier?.reject_rule).toContain(
      "tensorSourceConserved != true",
    );
    expect(gravityPath?.falsifier?.reject_rule).toContain(
      "independentGravityResponseMeasured != true",
    );
    expect(gravityPath?.dag_bridges).toEqual([
      "bridge-complete-casimir-ledger-to-mass-energy-bound",
      "bridge-complete-source-to-weak-field-gr-control",
    ]);
    expect(gravityPath?.falsifier?.test_refs).toEqual(
      expect.arrayContaining([
        "tests/casimir-dp-gravity-upper-bound.spec.ts",
        "tests/casimir-dp-evidence-map-stage3.spec.ts",
        "tests/physics-root-leaf-manifest.spec.ts",
      ]),
    );
    expect(gravityPath?.maturity_gate?.required_evidence_types).toEqual(
      expect.arrayContaining(["measured", "proxy", "inferred"]),
    );
    expect(gravityPath?.maturity_gate?.strict_fail_reason).toBe(
      "ROOT_LEAF_CASIMIR_DP_ORDINARY_GRAVITY_FAIL",
    );

    expect(
      manifest.bridge_bundles?.find(
        (entry) => entry.id === "casimir-dp.or-boundary-coherence",
      ),
    ).toEqual(
      expect.objectContaining({
        claim_scope: "cross_domain",
        max_claim_tier: "diagnostic",
        path_ids: [
          "path_quantum_semiclassical_to_casimir_dp_or_test",
          "path_quantum_semiclassical_to_casimir_dp_composition_internal_energy_successor",
          "path_casimir_dp_residual_to_evolutionary_coherence_conditional",
          "path_complete_casimir_apparatus_to_ordinary_gravity_control",
        ],
      }),
    );
  });

  it("keeps the Penrose branch-geometry candidate fail closed in its separate theory bundle", () => {
    const manifestPath = path.join(
      process.cwd(),
      "configs",
      "physics-root-leaf-manifest.v1.json",
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      leaves?: Array<{ id: string; statement?: string }>;
      paths?: Array<{
        id: string;
        root_id?: string;
        leaf_id?: string;
        bundle_id?: string;
        dag_bridges?: string[];
        falsifier?: {
          readiness_block_rule?: string;
          reject_rule?: string;
          test_refs?: string[];
        };
        maturity_gate?: {
          max_claim_tier?: string;
          strict_fail_reason?: string;
          required_evidence_types?: string[];
        };
      }>;
      bridge_bundles?: Array<{ id: string; path_ids?: string[] }>;
    };
    const candidatePath = manifest.paths?.find(
      (entry) =>
        entry.id ===
        "path_spacetime_equivalence_to_penrose_branch_geometry_coherence",
    );

    expect(
      manifest.leaves?.find(
        (entry) =>
          entry.id === "leaf_penrose_branch_geometry_to_coherence_candidate",
      )?.statement,
    ).toContain("tau approximately hbar over E_G alone is insufficient");
    expect(candidatePath).toEqual(
      expect.objectContaining({
        root_id: "physics_spacetime_gr",
        leaf_id: "leaf_penrose_branch_geometry_to_coherence_candidate",
        bundle_id: "penrose.branch-geometry-coherence-candidate",
      }),
    );
    expect(candidatePath?.dag_bridges).toEqual(
      expect.arrayContaining([
        "bridge-equivalence-principle-to-relational-branch-comparison",
        "bridge-incompatibility-functional-to-objective-reduction-dynamics",
        "bridge-boundary-independent-candidate-to-casimir-nonbridge",
      ]),
    );
    expect(candidatePath?.falsifier?.readiness_block_rule).toContain(
      "relationalCorrespondenceStage0_1Ready != true",
    );
    expect(candidatePath?.falsifier?.readiness_block_rule).toContain(
      "branchIdentificationDefined != true",
    );
    expect(candidatePath?.falsifier?.readiness_block_rule).toContain(
      "numericalCalculatorRegistered != true",
    );
    expect(candidatePath?.falsifier?.readiness_block_rule).toContain(
      "boundaryDependenceClaimed == true AND boundaryExtensionKernelRegistered != true",
    );
    expect(candidatePath?.falsifier?.reject_rule).toContain(
      "poweredHeldOutDataReady == true",
    );
    expect(candidatePath?.falsifier?.test_refs).toContain(
      "tests/casimir-dp-penrose-candidate-theory-stage0.spec.ts",
    );
    expect(candidatePath?.falsifier?.test_refs).toContain(
      "tests/casimir-dp-penrose-relational-correspondence-stage0-1.spec.ts",
    );
    expect(candidatePath?.maturity_gate).toEqual(
      expect.objectContaining({
        max_claim_tier: "diagnostic",
        strict_fail_reason:
          "ROOT_LEAF_PENROSE_BRANCH_GEOMETRY_CANDIDATE_FAIL",
      }),
    );
    expect(candidatePath?.maturity_gate?.required_evidence_types).toEqual(
      expect.arrayContaining(["measured", "proxy", "inferred"]),
    );
    expect(
      manifest.bridge_bundles?.find(
        (entry) => entry.id === "penrose.branch-geometry-coherence-candidate",
      )?.path_ids,
    ).toEqual([
      "path_spacetime_equivalence_constraints_to_penrose_relational_correspondence_stage0_1",
      "path_spacetime_equivalence_to_penrose_branch_geometry_coherence",
    ]);
  });

  it("registers Stage-0.1 as a correspondence-only intermediate leaf", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "configs", "physics-root-leaf-manifest.v1.json"),
        "utf8",
      ),
    ) as {
      roots?: Array<{ id: string; equation_refs?: string[] }>;
      leaves?: Array<{ id: string; statement?: string }>;
      paths?: Array<{
        id: string;
        bundle_id?: string;
        root_id?: string;
        leaf_id?: string;
        dag_bridges?: string[];
        falsifier?: {
          readiness_block_rule?: string;
          reject_rule?: string;
          uncertainty_model?: string;
          test_refs?: string[];
        };
        maturity_gate?: {
          max_claim_tier?: string;
          strict_fail_reason?: string;
        };
      }>;
    };
    const stage01 = manifest.paths?.find(
      (entry) =>
        entry.id ===
        "path_spacetime_equivalence_constraints_to_penrose_relational_correspondence_stage0_1",
    );
    expect(
      manifest.leaves?.find(
        (entry) =>
          entry.id === "leaf_penrose_relational_branch_correspondence_stage0_1",
      )?.statement,
    ).toContain("does not establish a covariant incompatibility functional");
    expect(stage01).toEqual(
      expect.objectContaining({
        bundle_id: "penrose.branch-geometry-coherence-candidate",
        root_id: "physics_spacetime_gr",
        leaf_id: "leaf_penrose_relational_branch_correspondence_stage0_1",
      }),
    );
    expect(stage01?.dag_bridges).toEqual(
      expect.arrayContaining([
        "bridge-relational-anchors-to-branch-embeddings",
        "bridge-independent-rigid-coordinate-relabeling-to-correspondence-gate",
        "bridge-correspondence-nonuniqueness-to-uncertainty-envelope",
      ]),
    );
    expect(stage01?.falsifier?.readiness_block_rule).toContain(
      "physicalReferenceReceiptsReady != true",
    );
    expect(stage01?.falsifier?.reject_rule).toContain(
      "knownSourcePerturbationPreserved != true",
    );
    expect(stage01?.falsifier?.uncertainty_model).toBe(
      "deterministic_contract_gate(decision_mode=strict,strict_reason_required=true,replay_window=session)",
    );
    expect(stage01?.maturity_gate?.strict_fail_reason).toBe(
      "ROOT_LEAF_PENROSE_RELATIONAL_CORRESPONDENCE_STAGE0_1_FAIL",
    );
    expect(
      manifest.roots?.find(
        (entry) => entry.id === "physics_quantum_semiclassical",
      )?.equation_refs,
    ).toEqual(
      expect.arrayContaining([
        "casimir_dp_penrose_relational_branch_state",
        "casimir_dp_penrose_relational_pullback_stress_difference",
        "casimir_dp_penrose_correspondence_covariance_gate",
        "casimir_dp_penrose_newtonian_target_limit",
      ]),
    );
  });

  it("declares the stellar radiation null-model lane in the repo manifest", () => {
    const manifestPath = path.join(process.cwd(), "configs", "physics-root-leaf-manifest.v1.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      roots?: Array<{ id: string; tree_lane?: string; tree_path?: string; equation_refs?: string[] }>;
      leaves?: Array<{ id: string; prompt_family?: string }>;
      paths?: Array<{ id: string; root_id?: string; leaf_id?: string; bundle_id?: string }>;
      bridge_bundles?: Array<{ id: string; path_ids?: string[] }>;
    };

    expect(
      manifest.roots?.find((entry) => entry.id === "physics_stellar_structure_nucleosynthesis"),
    ).toEqual(
      expect.objectContaining({
        id: "physics_stellar_structure_nucleosynthesis",
        tree_lane: "physics_stellar_structure_nucleosynthesis",
        tree_path: "docs/knowledge/physics/physics-stellar-structure-nucleosynthesis-tree.json",
      }),
    );
    const stellarRoot = manifest.roots?.find((entry) => entry.id === "physics_stellar_structure_nucleosynthesis");
    expect(stellarRoot?.equation_refs).toEqual(
      expect.arrayContaining([
        "stellar_radiative_transfer_equation",
        "stellar_lte_source_function",
        "stellar_nlte_source_function",
        "stellar_continuum_opacity_sum",
        "stellar_population_ionization_balance_diagnostic",
      ]),
    );
    expect(
      manifest.leaves?.find((entry) => entry.id === "leaf_stellar_spectral_viability"),
    ).toEqual(
      expect.objectContaining({
        id: "leaf_stellar_spectral_viability",
        prompt_family: "stellar radiation null model viability",
      }),
    );
    expect(
      manifest.paths?.find((entry) => entry.id === "path_stellar_structure_to_spectral_viability"),
    ).toEqual(
      expect.objectContaining({
        root_id: "physics_stellar_structure_nucleosynthesis",
        leaf_id: "leaf_stellar_spectral_viability",
        bundle_id: "stellar.radiation.audit",
      }),
    );
    expect(
      manifest.bridge_bundles?.find((entry) => entry.id === "stellar.radiation.audit")?.path_ids,
    ).toContain("path_stellar_structure_to_spectral_viability");
  });

  it("declares the stellar chemical-inheritance path to the life/consciousness bridge", () => {
    const manifestPath = path.join(process.cwd(), "configs", "physics-root-leaf-manifest.v1.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      paths?: Array<{
        id: string;
        root_id?: string;
        leaf_id?: string;
        bundle_id?: string;
        dag_bridges?: string[];
        maturity_gate?: { strict_fail_reason?: string };
      }>;
      bridge_bundles?: Array<{ id: string; path_ids?: string[] }>;
    };

    const pathEntry = manifest.paths?.find(
      (entry) => entry.id === "path_stellar_chemical_inheritance_to_life_consciousness",
    );
    expect(pathEntry).toEqual(
      expect.objectContaining({
        root_id: "physics_stellar_structure_nucleosynthesis",
        leaf_id: "leaf_life_cosmology_consciousness",
        bundle_id: "stellar.chemical-inheritance.audit",
      }),
    );
    expect(pathEntry?.dag_bridges).toEqual(
      expect.arrayContaining([
        "bridge-stellar-inheritance-to-carbon-synthesis",
        "bridge-stellar-carbon-to-astrochemistry",
        "bridge-astrochemistry-to-prebiotic-organics",
      ]),
    );
    expect(pathEntry?.maturity_gate?.strict_fail_reason).toBe(
      "ROOT_LEAF_STELLAR_CHEMICAL_INHERITANCE_BOUNDARY_FAIL",
    );
    expect(
      manifest.bridge_bundles?.find((entry) => entry.id === "stellar.chemical-inheritance.audit")?.path_ids,
    ).toContain("path_stellar_chemical_inheritance_to_life_consciousness");
  });

});
