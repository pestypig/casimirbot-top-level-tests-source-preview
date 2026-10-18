import { describe, expect, it } from "vitest";
import {
  __testOnlyResolveTreeNeighborIds,
  resolveHelixAskGraphPack,
} from "../server/services/helix-ask/graph-resolver";

describe("relativistic map tree semantics", () => {
  it("exposes the projection family as a conceptual GR child", () => {
    const neighbors = __testOnlyResolveTreeNeighborIds({
      treeId: "physics_spacetime_gr",
      treePath: "docs/knowledge/physics/physics-spacetime-gr-tree.json",
      nodeId: "physics-spacetime-gr-tree",
      congruenceWalkOverride: {
        allowedCL: "CL4",
        allowConceptual: true,
        allowProxies: false,
      },
    });

    expect(neighbors).toContain("relativistic-map-projections");
  });

  it("keeps the flat-SR to warp placeholder edge blocked unless proxies are enabled", () => {
    const blockedNeighbors = __testOnlyResolveTreeNeighborIds({
      treeId: "physics_spacetime_gr",
      treePath: "docs/knowledge/physics/physics-spacetime-gr-tree.json",
      nodeId: "flat-sr-flip-burn-control",
      congruenceWalkOverride: {
        allowedCL: "CL4",
        allowConceptual: false,
        allowProxies: false,
      },
    });

    const proxyNeighbors = __testOnlyResolveTreeNeighborIds({
      treeId: "physics_spacetime_gr",
      treePath: "docs/knowledge/physics/physics-spacetime-gr-tree.json",
      nodeId: "flat-sr-flip-burn-control",
      congruenceWalkOverride: {
        allowedCL: "CL4",
        allowConceptual: false,
        allowProxies: true,
      },
    });

    expect(blockedNeighbors).not.toContain("warp-route-time-map-placeholder");
    expect(proxyNeighbors).toContain("warp-route-time-map-placeholder");
  });

  it("routes relativistic-map prompts into the spacetime GR lane", () => {
    const pack = resolveHelixAskGraphPack({
      question: "Build a relativistic map with proper-time accessibility and Lorentz contraction",
      topicTags: ["physics"],
    });

    expect(pack?.treeIds).toContain("physics_spacetime_gr");
  });
});
