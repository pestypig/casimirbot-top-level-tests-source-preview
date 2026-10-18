import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  MORAL_SOCIETY_STRICT_FAIL_REASON,
  getIdeologyArtifactById,
  searchIdeologyArtifacts,
} from "../server/services/ideology/artifacts";
import { evaluatePressureBundleGate, IDEOLOGY_PRESSURE_REASON_CODES } from "../server/services/ideology/action-gates";

const ideology = JSON.parse(readFileSync("docs/ethos/ideology.json", "utf-8"));
const telemetryPath = "docs/ethos/ideology-telemetry-schema.json";

describe("ideology DAG evidence", () => {
  it("has doc + code evidence for every node", () => {
    const nodes = ideology.nodes ?? [];
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const evidence = Array.isArray(node.evidence) ? node.evidence : [];
      const types = new Set(evidence.map((entry: any) => entry?.type));
      expect(types.has("doc")).toBe(true);
      expect(types.has("code")).toBe(true);
    }
  });

  it("includes telemetry schema evidence for every node", () => {
    const nodes = ideology.nodes ?? [];
    for (const node of nodes) {
      const evidence = Array.isArray(node.evidence) ? node.evidence : [];
      const hasTelemetry = evidence.some(
        (entry: any) => entry?.type === "telemetry" && entry?.path === telemetryPath,
      );
      expect(hasTelemetry).toBe(true);
    }
  });

  it("tracks dependencies for child nodes", () => {
    const nodes = ideology.nodes ?? [];
    const parentMap = new Map<string, Set<string>>();
    for (const node of nodes) {
      for (const child of node.children ?? []) {
        if (!parentMap.has(child)) parentMap.set(child, new Set());
        parentMap.get(child)?.add(node.id);
      }
      for (const link of node.links ?? []) {
        const rel = typeof link?.rel === "string" ? link.rel.toLowerCase() : "";
        const target = link?.to;
        if (!target) continue;
        if (rel === "parent") {
          if (!parentMap.has(node.id)) parentMap.set(node.id, new Set());
          parentMap.get(node.id)?.add(target);
        }
        if (rel === "child") {
          if (!parentMap.has(target)) parentMap.set(target, new Set());
          parentMap.get(target)?.add(node.id);
        }
      }
    }

    for (const node of nodes) {
      if (node.id === ideology.rootId) continue;
      const parents = parentMap.get(node.id);
      if (!parents || parents.size === 0) continue;
      const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
      expect(deps.length).toBeGreaterThan(0);
      for (const parent of parents) {
        expect(deps).toContain(parent);
      }
    }
  });
  it("adds ethos knowledge provenance metadata and deterministic strict fail reason", () => {
    const search = searchIdeologyArtifacts({ limit: 2, strictProvenance: true });
    expect(search.items.length).toBeGreaterThan(0);
    for (const artifact of search.items) {
      expect(artifact.provenance_class).toBe("inferred");
      expect(artifact.claim_tier).toBe("diagnostic");
      expect(artifact.certifying).toBe(false);
    }
    expect(search.fail_reason).toBe(MORAL_SOCIETY_STRICT_FAIL_REASON);

    const byId = getIdeologyArtifactById(search.items[0]!.id);
    expect(byId?.provenance_class).toBe("inferred");
    expect(byId?.claim_tier).toBe("diagnostic");
    expect(byId?.certifying).toBe(false);
  });

  it("fails closed for high-risk pressure bundles with deterministic reason codes", () => {
    const decision = evaluatePressureBundleGate([
      "sexualized_attention",
      "financial_ask",
      "urgency_scarcity",
    ]);
    expect(decision.blocked).toBe(true);
    expect(decision.warned).toBe(true);
    expect(decision.reasonCodes).toContain(IDEOLOGY_PRESSURE_REASON_CODES.romanceInvestmentUrgency);

    const baseline = evaluatePressureBundleGate(["status_competition"]);
    expect(baseline.blocked).toBe(false);
    expect(baseline.reasonCodes).toHaveLength(0);
  });

});
