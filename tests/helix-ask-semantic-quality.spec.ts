import { describe, expect, it } from "vitest";
import {
  evaluateSemanticQuality,
  precomputeBridgeTraversalCandidates,
  selectDeterministicMove,
  rankMovesDeterministically,
  selectDeterministicMoveWithDebug,
} from "../server/services/helix-ask/quake-frame-loop";
import { __testHelixAskReliabilityGuards } from "../server/routes/agi.plan";

describe("Helix Ask semantic quality gates", () => {
  it("computes claim-citation linkage and unsupported-claim rate", () => {
    const text = [
      "Claim one is grounded [docs/a.md].",
      "Claim two has Sources: docs/b.md.",
      "Claim three has no citation evidence.",
    ].join(" ");
    const quality = evaluateSemanticQuality({ text, supportedClaimCount: 2, contradictionCount: 0 });
    expect(quality.claimCitationLinkRate).toBeGreaterThanOrEqual(0.6);
    expect(quality.unsupportedClaimRate).toBeGreaterThan(0);
    expect(quality.repetitionPenaltyFail).toBe(false);
    expect(quality.contradictionFlag).toBe(false);
  });

  it("flags contradiction and repetition penalties", () => {
    const repeated = "A long repeated sentence for deterministic penalty. ".repeat(4);
    const quality = evaluateSemanticQuality({ text: repeated, supportedClaimCount: 0, contradictionCount: 1 });
    expect(quality.repetitionPenaltyFail).toBe(true);
    expect(quality.contradictionFlag).toBe(true);
  });
});

describe("Helix Ask deterministic fuzzy move selector", () => {
  it("picks deterministic direct answer for strong groundedness", () => {
    const move = selectDeterministicMove({ groundedness: 0.95, uncertainty: 0.1, safety: 0.2, coverage: 0.9, evidenceGain: 0.2, latencyCost: 0.2, risk: 0.1, budgetPressure: 0.1 });
    expect(move).toBe("direct_answer");
  });

  it("picks deterministic fail closed for high risk/pressure", () => {
    const move = selectDeterministicMove({
      groundedness: 0.1,
      uncertainty: 0.6,
      safety: 1,
      coverage: 0.05,
      evidenceGain: 0.8,
      latencyCost: 0.8,
      risk: 0.95,
      budgetPressure: 0.95,
    });
    expect(move).toBe("fail_closed");
  });

  it("keeps stable tie-break ordering with identical scores", () => {
    const ranked = rankMovesDeterministically({
      direct_answer: 1,
      retrieve_more: 1,
      relation_build: 1,
      clarify: 1,
      fail_closed: 1,
    });
    expect(ranked.map((entry) => entry.move)).toEqual([
      "direct_answer",
      "retrieve_more",
      "relation_build",
      "clarify",
      "fail_closed",
    ]);
  });

  it("changes move preference by profile", () => {
    const baseInput = {
      groundedness: 0.4,
      uncertainty: 0.5,
      safety: 0.2,
      coverage: 0.3,
      evidenceGain: 0.9,
      latencyCost: 0.85,
      risk: 0.2,
      budgetPressure: 0.7,
    } as const;
    const evidence = selectDeterministicMoveWithDebug({ ...baseInput, profile: "evidence_first" });
    const latency = selectDeterministicMoveWithDebug({ ...baseInput, profile: "latency_first" });
    expect(evidence.selectedMove).toBe("retrieve_more");
    expect(latency.selectedMove).toBe("direct_answer");
  });

  it("applies relation intent override toward relation_build", () => {
    const input = {
      groundedness: 0.25,
      uncertainty: 0.7,
      safety: 0.25,
      coverage: 0.3,
      evidenceGain: 0.8,
      latencyCost: 0.5,
      risk: 0.3,
      budgetPressure: 0.3,
      profile: "evidence_first" as const,
    };
    const withoutRelation = selectDeterministicMoveWithDebug({ ...input, relationIntentActive: false });
    const withRelation = selectDeterministicMoveWithDebug({ ...input, relationIntentActive: true });
    expect(withoutRelation.selectedMove).not.toBe("relation_build");
    expect(withRelation.moveScores.relation_build).toBeGreaterThan(withoutRelation.moveScores.relation_build);
  });

  it("keeps clarify above fail_closed below threshold and flips above threshold", () => {
    const near = {
      groundedness: 0.2,
      uncertainty: 0.8,
      safety: 0.4,
      coverage: 0.25,
      evidenceGain: 0.4,
      latencyCost: 0.4,
      budgetPressure: 0.35,
      clarifyFailClosedThreshold: 0.72,
    };
    const clarify = selectDeterministicMoveWithDebug({ ...near, risk: 0.55 });
    const closed = selectDeterministicMoveWithDebug({ ...near, risk: 0.9 });
    expect(clarify.selectedMove).toBe("clarify");
    expect(closed.selectedMove).toBe("fail_closed");
  });
});

describe("AAS-style bridge reachability", () => {
  it("returns deterministically ordered bounded candidates", () => {
    const graphPack = {
      frameworks: [
        {
          treeId: "t1",
          sourcePath: "docs/tree1.json",
          path: [
            { id: "b2", relation: "verifies", depth: 1, score: 4, nodeType: "bridge" },
            { id: "b1", relation: "enables", depth: 0, score: 2, nodeType: "bridge" },
            { id: "n1", relation: "child", depth: 0, score: 10, nodeType: "node" },
          ],
        },
      ],
    } as any;
    const out = precomputeBridgeTraversalCandidates({ graphPack, maxCandidates: 2, maxDepth: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]?.nodeId).toBe("b1");
    expect(out[1]?.nodeId).toBe("b2");
  });
});

describe("Helix Ask relation completeness gate", () => {
  it("detects missing relation slots in partial relation answers", () => {
    const completeness =
      __testHelixAskReliabilityGuards.evaluateRelationSemanticCompleteness(
        "Warp bubble geometry is discussed here.",
      );
    expect(completeness.pass).toBe(false);
    expect(completeness.missing).toContain("entity_b");
    expect(completeness.missing).toContain("mechanism");
  });

  it("repairs missing relation slots using relation packet anchors before sources", () => {
    const relationPacket = {
      definitions: {
        warp_definition:
          "A warp bubble is a bounded spacetime configuration under this repository's warp model.",
        ethos_definition:
          "Mission ethos constrains capability claims to verified, non-harmful operation.",
      },
      bridge_claims: [
        "Mission ethos constrains warp deployment through audited verification checkpoints.",
      ],
      constraints: {
        physics_bound: "Ford-Roman and GR bounds must pass before viability claims.",
      },
      falsifiability_hooks: ["Re-run verification hooks before deployment."],
      source_map: {
        warp: "docs/knowledge/warp/warp-bubble.md",
        ethos: "docs/ethos/ideology.json",
      },
      evidence: [],
      domains: ["warp", "ethos"],
    } as any;
    const original = [
      "Direct Answer:",
      "- Warp bubble geometry can be modeled from shift-vector fields.",
      "",
      "Sources: docs/knowledge/warp/warp-bubble.md",
    ].join("\n");
    const before = __testHelixAskReliabilityGuards.evaluateRelationSemanticCompleteness(original);
    const repaired = __testHelixAskReliabilityGuards.repairRelationSemanticCompleteness({
      answer: original,
      relationPacket,
      missing: before.missing,
    });
    expect(repaired.applied).toBe(true);
    expect(repaired.text).toMatch(/^Sources:/m);
    const after = __testHelixAskReliabilityGuards.evaluateRelationSemanticCompleteness(
      repaired.text,
    );
    expect(after.pass).toBe(true);
  });
});
