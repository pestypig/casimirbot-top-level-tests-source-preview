import { describe, expect, it } from "vitest";

import { __testHelixAskReliabilityGuards } from "../server/routes/agi.plan";

describe("helix ask relation contract leakage guards", () => {
  it("builds relation contracts without artifact-style key labels", () => {
    const contract = __testHelixAskReliabilityGuards.buildRelationModeContractFromPacket({
      question: "How does warp relate to mission ethos?",
      domains: ["ethos", "warp"],
      definitions: {
        warp_definition: "Warp bubble geometry is constrained by viability gates",
        ethos_definition: "Mission ethos requires stewardship and non-harm",
      },
      bridge_claims: ["The ethos gate binds warp deployment to reproducible checkpoints"],
      constraints: ["Ford-Roman quantum inequality and GR gate checks must pass"],
      falsifiability_hooks: ["Re-run adapter verification and require PASS certificate integrity"],
      evidence: [],
      source_map: {
        ev_1: "docs/knowledge/warp/warp-bubble.md#L1-L2",
        ev_2: "docs/ethos/ideology.json#L1-L2",
      },
    });

    const merged = [
      contract.summary ?? "",
      ...(contract.claims ?? []).map((claim) => claim.text ?? ""),
    ].join(" ");

    expect(merged).not.toMatch(/\bwhat_is_[a-z0-9_]+\s*:/i);
    expect(merged).not.toMatch(/\bhow_they_connect\s*:/i);
    expect(merged).not.toMatch(/\bconstraints?_and_falsifiability\s*:/i);
    expect(merged).toContain("Warp bubble geometry is constrained by viability gates.");
    expect(merged).toContain("Mission ethos requires stewardship and non-harm.");
  });

  it("flags artifact-key spill in relation deterministic fallback reasons", () => {
    const reasons = __testHelixAskReliabilityGuards.detectRelationDeterministicFallbackReasons(
      "What it is: what_is_mission_ethos: Mission ethos is the stewardship policy layer.",
    );
    expect(reasons).toContain("artifact_json_spill");
  });

  it("flags tree-walk leakage in relation deterministic fallback reasons", () => {
    const reasons = __testHelixAskReliabilityGuards.detectRelationDeterministicFallbackReasons(
      "Tree Walk\nTree Walk: Ethos Knowledge Walk\n1. Walk: Mission Ethos\n\nKey files\n- docs/ethos/ideology.json",
    );
    expect(reasons).toContain("tree_walk_leak");
  });

  it("falls back to natural relation definitions when packet definitions are path-only or code-like", () => {
    const contract = __testHelixAskReliabilityGuards.buildRelationModeContractFromPacket({
      question: "How does warp relate to mission ethos?",
      domains: ["ethos", "warp"],
      definitions: {
        warp_definition:
          "export default function ElectronOrbitalPanel() const state = useElectronOrbitSim();",
        ethos_definition: "docs/BUSINESS_MODEL.md",
      },
      bridge_claims: ["Mission ethos constrains warp deployment through explicit gate checks"],
      constraints: ["Ford-Roman and GR gates must pass before viability claims"],
      falsifiability_hooks: ["Re-run adapter verification and require PASS certificate integrity"],
      evidence: [],
      source_map: {
        ev_1: "docs/knowledge/warp/warp-bubble.md#L1-L2",
        ev_2: "docs/ethos/ideology.json#L1-L2",
      },
    });

    expect(contract.summary).toContain("bounded spacetime configuration");
    expect(contract.claims?.[0]?.text).toContain("Mission ethos constrains capability claims");
  });

  it("renders relation compare contracts without deterministic label stubs", () => {
    const rendered = __testHelixAskReliabilityGuards.renderHelixAskAnswerContract(
      {
        summary: "Warp bubble geometry is constrained by viability gates.",
        claims: [
          { text: "Mission ethos requires stewardship and non-harm." },
          { text: "Warp deployment is gated by reproducible viability checkpoints." },
          { text: "Ford-Roman and GR gates must pass before viability claims." },
        ],
        sources: ["docs/knowledge/warp/warp-bubble.md", "docs/ethos/ideology.json"],
      },
      "compare",
      "How does warp physics relate to mission ethos?",
      { family: "relation", prompt: "How does warp physics relate to mission ethos?" },
    );

    expect(rendered).not.toMatch(/\bWhat it is:\b/i);
    expect(rendered).not.toMatch(/\bWhy it matters:\b/i);
    expect(rendered).not.toMatch(/\bConstraint:\b/i);
    expect(rendered).toContain("Mission ethos requires stewardship and non-harm.");
  });
});
