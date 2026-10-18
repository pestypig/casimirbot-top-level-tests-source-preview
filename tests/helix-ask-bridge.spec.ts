import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  __testOnlyClassifyStrictBridgeEvidenceFailure,
  buildRelationAssemblyPacket,
} from "../server/services/helix-ask/relation-assembly";

type TreeNode = {
  id: string;
  nodeType?: string;
  links?: Array<{ rel: string; to: string }>;
  bridge?: { left: string; right: string; relation?: string };
  evidence?: Array<{
    scope?: string;
    provenance_class?: "measured" | "proxy" | "inferred";
    claim_tier?: "diagnostic" | "reduced-order" | "certified";
    certifying?: boolean;
  }>;
  validity?: {
    equation_ref?: string;
    strict_fail_reason?: string;
    maturity_ceiling?: string;
    proxy_semantics?: unknown;
    display_semantics?: unknown;
  };
};

type TreeFile = { nodes: TreeNode[] };

const walkTreeFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTreeFiles(full, acc);
      continue;
    }
    if (entry.endsWith("-tree.json")) {
      acc.push(full);
    }
  }
  return acc;
};

const loadTree = (filePath: string): TreeFile =>
  JSON.parse(readFileSync(filePath, "utf8")) as TreeFile;

const ensureLink = (links: TreeNode["links"] | undefined, rel: string, to: string) =>
  Array.isArray(links) && links.some((link) => link.rel === rel && link.to === to);

describe("Helix Ask bridge nodes", () => {
  const treeFiles = walkTreeFiles(join(process.cwd(), "docs", "knowledge"));
  const trees = treeFiles.map((file) => ({ file, tree: loadTree(file) }));
  const globalNodeIds = new Set<string>();
  for (const { tree } of trees) {
    for (const node of tree.nodes ?? []) {
      if (node?.id) {
        globalNodeIds.add(node.id);
      }
    }
  }

  it("bridge nodes bind left/right and include scoped evidence", () => {
    const bridgeNodes: Array<{ file: string; node: TreeNode }> = [];
    for (const { file, tree } of trees) {
      for (const node of tree.nodes ?? []) {
        if (node.nodeType === "bridge" || node.bridge) {
          bridgeNodes.push({ file, node });
        }
      }
    }

    if (bridgeNodes.length === 0) {
      return;
    }

    for (const { file, node } of bridgeNodes) {
      expect(node.bridge, `${file} ${node.id} missing bridge block`).toBeTruthy();
      const bridge = node.bridge!;
      expect(bridge.left, `${file} ${node.id} missing bridge.left`).toBeTruthy();
      expect(bridge.right, `${file} ${node.id} missing bridge.right`).toBeTruthy();
      expect(bridge.relation, `${file} ${node.id} missing bridge.relation`).toBeTruthy();

      expect(globalNodeIds.has(bridge.left), `${file} ${node.id} left target missing`).toBe(true);
      expect(globalNodeIds.has(bridge.right), `${file} ${node.id} right target missing`).toBe(true);

      expect(ensureLink(node.links, "see-also", bridge.left), `${file} ${node.id} missing see-also to left`).toBe(true);
      expect(ensureLink(node.links, "see-also", bridge.right), `${file} ${node.id} missing see-also to right`).toBe(true);

      const evidence = node.evidence ?? [];
      const hasLeft = evidence.some((entry) => entry.scope === "left");
      const hasRight = evidence.some((entry) => entry.scope === "right");
      if (hasLeft || hasRight) {
        expect(hasLeft, `${file} ${node.id} missing left-scoped evidence`).toBe(true);
        expect(hasRight, `${file} ${node.id} missing right-scoped evidence`).toBe(true);
      } else {
        expect(
          evidence.length >= 2,
          `${file} ${node.id} missing left/right scoped evidence`,
        ).toBe(true);
      }

      for (const entry of evidence) {
        const hasContractMetadata =
          !!entry.provenance_class || !!entry.claim_tier || typeof entry.certifying === "boolean";
        if (!hasContractMetadata) {
          continue;
        }

        expect(entry.provenance_class, `${file} ${node.id} missing provenance_class`).toBeTruthy();
        expect(entry.claim_tier, `${file} ${node.id} missing claim_tier`).toBeTruthy();
        if (entry.certifying !== undefined) {
          expect(typeof entry.certifying, `${file} ${node.id} invalid certifying`).toBe("boolean");
        }
      }
    }
  });



  it("declares an atomic->stress-energy placeholder bridge with deterministic strict-fail metadata", () => {
    const atomicTree = loadTree(join(process.cwd(), "docs", "knowledge", "physics", "atomic-systems-tree.json"));
    const placeholder = atomicTree.nodes.find((node) => node.id === "atomic-stress-energy-bridge-placeholder");

    expect(placeholder).toBeTruthy();
    expect(placeholder?.nodeType).toBe("bridge");
    expect(placeholder?.bridge).toEqual({
      left: "atomic-quantum-route",
      right: "stress-energy-tensor",
      relation: "atomic_to_stress_energy_lift",
    });
    expect(placeholder?.validity?.strict_fail_reason).toBe("FAIL_NO_ATOMIC_TO_TMU_NU_MAPPING");
    expect(placeholder?.validity?.maturity_ceiling).toBe("diagnostic");
    expect(placeholder?.validity?.proxy_semantics).toBeTruthy();
    expect(placeholder?.validity?.display_semantics).toBeTruthy();
  });

  it("keeps strict-routed physics bridge metadata equation/citation complete for targeted bridge nodes", () => {
    const targets: Array<{
      file: string;
      nodeId: string;
      equationRef: string;
    }> = [
      {
        file: "math-tree.json",
        nodeId: "bridge-math-maturity-stages-math-evidence-registry",
        equationRef: "curvature_unit_proxy_contract",
      },
      {
        file: "physics-foundations-tree.json",
        nodeId: "bridge-field-equations-stack-stress-energy-stack",
        equationRef: "efe_baseline",
      },
      {
        file: "uncertainty-mechanics-tree.json",
        nodeId: "bridge-uncertainty-classical-stack-uncertainty-statistical-stack",
        equationRef: "uncertainty_propagation",
      },
      {
        file: "uncertainty-mechanics-tree.json",
        nodeId: "bridge-uncertainty-reality-bounds-verification-checklist",
        equationRef: "runtime_safety_gate",
      },
    ];

    for (const target of targets) {
      const tree = loadTree(join(process.cwd(), "docs", "knowledge", "physics", target.file));
      const bridge = tree.nodes.find((node) => node.id === target.nodeId);

      expect(bridge, `${target.file} ${target.nodeId} missing`).toBeTruthy();
      expect(bridge?.validity?.equation_ref, `${target.file} ${target.nodeId} missing equation_ref`).toBe(target.equationRef);

      const evidence = bridge?.evidence ?? [];
      expect(evidence.length, `${target.file} ${target.nodeId} missing evidence`).toBeGreaterThan(0);
      for (const entry of evidence) {
        expect(entry.provenance_class, `${target.file} ${target.nodeId} missing provenance_class`).toBe("proxy");
        expect(entry.claim_tier, `${target.file} ${target.nodeId} missing claim_tier`).toBe("diagnostic");
        expect(entry.certifying, `${target.file} ${target.nodeId} missing certifying=false`).toBe(false);
      }
    }
  });

  it("returns deterministic strict bridge fail_reason when bridge evidence metadata is incomplete", () => {
    const packet = buildRelationAssemblyPacket({
      question: "How does ideology bridge physics?",
      contextFiles: ["docs/ethos/ideology.json", "docs/knowledge/physics/einstein-field-equations.md"],
      contextText: "ideology and physics relation",
      docBlocks: [],
      strictBridgeEvidence: true,
      graphPack: {
        frameworks: [
          {
            treeId: "test",
            sourcePath: "docs/ethos/ideology.json",
            anchors: [],
            path: [
              {
                id: "bridge-node",
                title: "Bridge",
                tags: [],
                score: 1,
                depth: 0,
                nodeType: "bridge",
                evidence: [
                  {
                    type: "doc",
                    path: "docs/knowledge/physics/einstein-field-equations.md",
                    scope: "left",
                  },
                ],
              },
            ],
            scaffoldText: "",
            contextText: "",
            preferGraph: true,
          },
        ],
        scaffoldText: "",
        contextText: "",
        preferGraph: true,
        sourcePaths: ["docs/ethos/ideology.json"],
        treeIds: ["test"],
      },
    });

    expect(packet.fail_reason).toBe("IDEOLOGY_PHYSICS_BRIDGE_EVIDENCE_MISSING");
  });

  it("returns deterministic strict bridge fail_reason when bridge evidence metadata is contradictory", () => {
    const packet = buildRelationAssemblyPacket({
      question: "How does ideology bridge physics?",
      contextFiles: ["docs/ethos/ideology.json", "docs/knowledge/physics/einstein-field-equations.md"],
      contextText: "ideology and physics relation",
      docBlocks: [],
      strictBridgeEvidence: true,
      graphPack: {
        frameworks: [
          {
            treeId: "test",
            sourcePath: "docs/ethos/ideology.json",
            anchors: [],
            path: [
              {
                id: "bridge-node",
                title: "Bridge",
                tags: [],
                score: 1,
                depth: 0,
                nodeType: "bridge",
                evidence: [
                  {
                    type: "doc",
                    path: "docs/knowledge/physics/einstein-field-equations.md",
                    scope: "left",
                    provenance_class: "proxy",
                    claim_tier: "diagnostic",
                    certifying: true,
                  },
                ],
              },
            ],
            scaffoldText: "",
            contextText: "",
            preferGraph: true,
          },
        ],
        scaffoldText: "",
        contextText: "",
        preferGraph: true,
        sourcePaths: ["docs/ethos/ideology.json"],
        treeIds: ["test"],
      },
    });

    expect(packet.fail_reason).toBe("IDEOLOGY_PHYSICS_BRIDGE_EVIDENCE_CONTRADICTORY");
  });


  it("returns contradictory fail_reason when same evidence path has conflicting bridge contracts", () => {
    const packet = buildRelationAssemblyPacket({
      question: "How does ideology bridge physics?",
      contextFiles: ["docs/ethos/ideology.json", "docs/knowledge/physics/einstein-field-equations.md"],
      contextText: "ideology and physics relation",
      docBlocks: [],
      strictBridgeEvidence: true,
      graphPack: {
        frameworks: [
          {
            treeId: "test",
            sourcePath: "docs/ethos/ideology.json",
            anchors: [],
            path: [
              {
                id: "bridge-node",
                title: "Bridge",
                tags: [],
                score: 1,
                depth: 0,
                nodeType: "bridge",
                evidence: [
                  {
                    type: "doc",
                    path: "docs/knowledge/physics/einstein-field-equations.md",
                    scope: "left",
                    provenance_class: "proxy",
                    claim_tier: "diagnostic",
                    certifying: false,
                  },
                  {
                    type: "doc",
                    path: "docs/knowledge/physics/einstein-field-equations.md",
                    scope: "right",
                    provenance_class: "measured",
                    claim_tier: "certified",
                    certifying: true,
                  },
                ],
              },
            ],
            scaffoldText: "",
            contextText: "",
            preferGraph: true,
          },
        ],
        scaffoldText: "",
        contextText: "",
        preferGraph: true,
        sourcePaths: ["docs/ethos/ideology.json"],
        treeIds: ["test"],
      },
    });

    expect(packet.fail_reason).toBe("IDEOLOGY_PHYSICS_BRIDGE_EVIDENCE_CONTRADICTORY");
  });


  it("stabilizes strict fail precedence for mixed missing/contradictory evidence under replay", () => {
    const adversarialContracts = [
      {
        path: "docs/knowledge/physics/einstein-field-equations.md",
        provenance_class: "proxy" as const,
        claim_tier: "diagnostic" as const,
        certifying: true,
      },
      {
        path: "docs/knowledge/physics/einstein-field-equations.md",
        provenance_class: "measured" as const,
        claim_tier: "certified" as const,
        certifying: true,
      },
      {
        path: "docs/knowledge/physics/warp-metric.md",
        provenance_class: "inferred" as const,
        claim_tier: "diagnostic" as const,
      },
    ];

    const verdicts = new Set<string>();
    for (let idx = 0; idx < adversarialContracts.length; idx += 1) {
      const replayOrder = [
        ...adversarialContracts.slice(idx),
        ...adversarialContracts.slice(0, idx),
      ];
      verdicts.add(__testOnlyClassifyStrictBridgeEvidenceFailure(replayOrder) ?? "__none__");
    }

    expect(Array.from(verdicts)).toEqual(["IDEOLOGY_PHYSICS_BRIDGE_EVIDENCE_CONTRADICTORY"]);
  });

  it("maps strict bridge contradiction into evidence falsifier ledger taxonomy when lane is active", () => {
    const verdict = __testOnlyClassifyStrictBridgeEvidenceFailure(
      [
        {
          path: "docs/knowledge/physics/einstein-field-equations.md",
          provenance_class: "proxy",
          claim_tier: "diagnostic",
          certifying: true,
        },
      ],
      { evidenceFalsifierLane: true },
    );

    expect(verdict).toBe("EVIDENCE_FALSIFIER_LEDGER_CONTRACT_CONTRADICTORY");
  });

  it("maps strict bridge missing metadata into evidence falsifier ledger taxonomy when lane is active", () => {
    const verdict = __testOnlyClassifyStrictBridgeEvidenceFailure(
      [
        {
          path: "docs/knowledge/physics/einstein-field-equations.md",
          provenance_class: "inferred",
          claim_tier: "diagnostic",
        },
      ],
      { evidenceFalsifierLane: true, requireStrongEvidence: true },
    );

    expect(verdict).toBe("EVIDENCE_FALSIFIER_LEDGER_CONTRACT_MISSING");
  });

  it("preserves non-strict bridge behavior when metadata is incomplete", () => {
    const packet = buildRelationAssemblyPacket({
      question: "How does ideology bridge physics?",
      contextFiles: ["docs/ethos/ideology.json", "docs/knowledge/physics/einstein-field-equations.md"],
      contextText: "ideology and physics relation",
      docBlocks: [],
      graphPack: {
        frameworks: [
          {
            treeId: "test",
            sourcePath: "docs/ethos/ideology.json",
            anchors: [],
            path: [
              {
                id: "bridge-node",
                title: "Bridge",
                tags: [],
                score: 1,
                depth: 0,
                nodeType: "bridge",
                evidence: [
                  {
                    type: "doc",
                    path: "docs/knowledge/physics/einstein-field-equations.md",
                    scope: "left",
                  },
                ],
              },
            ],
            scaffoldText: "",
            contextText: "",
            preferGraph: true,
          },
        ],
        scaffoldText: "",
        contextText: "",
        preferGraph: true,
        sourcePaths: ["docs/ethos/ideology.json"],
        treeIds: ["test"],
      },
    });

    expect(packet.fail_reason).toBeUndefined();
  });

  it("fails strict bridge evidence deterministically for life/cosmology prompts when only weak evidence exists", () => {
    const packet = buildRelationAssemblyPacket({
      question: "How does the universe produce life from cosmology and consciousness constraints?",
      contextFiles: ["docs/stellar-consciousness-orch-or-review.md"],
      contextText: "life cosmology consciousness bridge",
      docBlocks: [],
      strictBridgeEvidence: true,
      graphPack: {
        frameworks: [
          {
            treeId: "stellar-ps1-bridges",
            sourcePath: "docs/knowledge/bridges/stellar-ps1-bridge-tree.json",
            anchors: [],
            path: [
              {
                id: "bridge-node",
                title: "Bridge",
                tags: [],
                score: 1,
                depth: 0,
                nodeType: "bridge",
                evidence: [
                  {
                    type: "doc",
                    path: "docs/stellar-consciousness-orch-or-review.md",
                    scope: "left",
                    provenance_class: "inferred",
                    claim_tier: "diagnostic",
                    certifying: false,
                  },
                ],
              },
            ],
            scaffoldText: "",
            contextText: "",
            preferGraph: true,
          },
        ],
        scaffoldText: "",
        contextText: "",
        preferGraph: true,
        sourcePaths: ["docs/knowledge/bridges/stellar-ps1-bridge-tree.json"],
        treeIds: ["stellar-ps1-bridges"],
      },
    });

    expect(packet.fail_reason).toBe("IDEOLOGY_PHYSICS_BRIDGE_EVIDENCE_MISSING");
  });

  it("uses evidence falsifier ledger fail taxonomy through packet assembly when ledger lane is selected", () => {
    const packet = buildRelationAssemblyPacket({
      question: "How does ideology bridge physics?",
      contextFiles: ["docs/ethos/ideology.json", "docs/knowledge/physics/einstein-field-equations.md"],
      contextText: "ideology and physics relation",
      docBlocks: [],
      strictBridgeEvidence: true,
      graphPack: {
        frameworks: [
          {
            treeId: "evidence-falsifier-ledger",
            sourcePath: "docs/knowledge/evidence-falsifier-ledger-tree.json",
            anchors: [],
            path: [
              {
                id: "bridge-node",
                title: "Bridge",
                tags: [],
                score: 1,
                depth: 0,
                nodeType: "bridge",
                evidence: [
                  {
                    type: "doc",
                    path: "docs/knowledge/physics/einstein-field-equations.md",
                    scope: "left",
                    provenance_class: "proxy",
                    claim_tier: "diagnostic",
                    certifying: true,
                  },
                ],
              },
            ],
            scaffoldText: "",
            contextText: "",
            preferGraph: true,
          },
        ],
        scaffoldText: "",
        contextText: "",
        preferGraph: true,
        sourcePaths: ["docs/knowledge/evidence-falsifier-ledger-tree.json"],
        treeIds: ["evidence-falsifier-ledger"],
      },
    });

    expect(packet.fail_reason).toBe("EVIDENCE_FALSIFIER_LEDGER_CONTRACT_CONTRADICTORY");
  });


});
