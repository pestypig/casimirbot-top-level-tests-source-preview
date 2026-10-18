import { describe, expect, it, vi } from "vitest";

const normalizePathForMatch = (target: unknown): string => String(target ?? "").replace(/\\/g, "/");
import {
  __testOnlyResolveCrossLaneUncertaintyValidation,
  __testOnlyResolveMaturityCeilingValidation,
  buildRelationAssemblyPacket,
  ensureRelationAssemblyPacketFallback,
  ensureRelationFallbackDomainAnchors,
  evaluateRelationPacketFloors,
  renderRelationAssemblyConversationalFallback,
  renderRelationAssemblyFallback,
  resolveRelationTopologySignal,
} from "../server/services/helix-ask/relation-assembly";

describe("relation assembly packet", () => {
  it("builds warp+ethos packet with deterministic bridge claims", () => {
    const packet = buildRelationAssemblyPacket({
      question: "How does a warp bubble fit in with the mission ethos?",
      contextFiles: ["docs/knowledge/warp/warp-bubble.md", "docs/ethos/ideology.json"],
      contextText: "warp bubble constraints and mission ethos stewardship",
      docBlocks: [
        { path: "docs/knowledge/warp/warp-bubble.md", block: "Warp bubble geometry is constrained by viability gates." },
        { path: "docs/ethos/why.md", block: "Mission ethos binds capability to stewardship." },
      ],
      graphPack: null,
    });
    expect(packet.domains).toEqual(["ethos", "warp"]);
    expect(packet.bridge_claims.length).toBeGreaterThanOrEqual(2);
    expect(packet.evidence.some((entry) => entry.domain === "warp")).toBe(true);
    expect(packet.evidence.some((entry) => entry.domain === "ethos")).toBe(true);
  });

  it("reports missing anchors when relation topology is single-domain", () => {
    const signal = resolveRelationTopologySignal({
      question: "How does warp relate to mission ethos?",
      relationIntent: true,
      contextFiles: ["docs/knowledge/warp/warp-bubble.md"],
      graphPack: null,
    });
    expect(signal.dualDomainAnchors).toBe(false);
    expect(signal.missingAnchors).toContain("ethos");
  });


  it("enforces relation packet floors with structured fail reasons", () => {
    const lowBridgePacket = {
      question: "q",
      domains: ["warp", "ethos"],
      definitions: { warp_definition: "w", ethos_definition: "e" },
      bridge_claims: ["only-one"],
      constraints: [],
      falsifiability_hooks: [],
      evidence: [
        {
          evidence_id: "ev_1",
          path: "docs/knowledge/warp/warp-bubble.md",
          span: "L1-L1",
          snippet: "warp",
          domain: "warp" as const,
        },
      ],
      source_map: { ev_1: "docs/knowledge/warp/warp-bubble.md#L1-L1" },
    };
    const bridgeFail = evaluateRelationPacketFloors(lowBridgePacket, { minBridges: 2, minEvidence: 2 });
    expect(bridgeFail.ok).toBe(false);
    expect(bridgeFail.failReason).toBe("bridge_count_low");

    const evidenceFail = evaluateRelationPacketFloors(
      { ...lowBridgePacket, bridge_claims: ["a", "b"] },
      { minBridges: 2, minEvidence: 2 },
    );
    expect(evidenceFail.ok).toBe(false);
    expect(evidenceFail.failReason).toBe("evidence_count_low");
  });

  it("fails deterministically when runtime-eligible cross-lane rows miss uncertainty models", async () => {
    const fs = await import("node:fs");
    const existsSpy = vi.spyOn(fs.default ?? fs, "existsSync").mockReturnValue(true);
    const readSpy = vi.spyOn(fs.default ?? fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        rows: [
          {
            id: "physics_spacetime_gr__curvature_unit_proxy_contract",
            runtime_safety_eligible: true,
            cross_lane_bridge: true,
            uncertainty_model_id: "",
          },
        ],
      }) as any,
    );

    const result = __testOnlyResolveCrossLaneUncertaintyValidation();
    expect(result.referenced).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.failReason).toBe("FAIL_MISSING_UNCERTAINTY_MODEL");
    expect(result.summary).toContain("cross_lane_uncertainty=missing_uncertainty_metadata:");

    readSpy.mockRestore();
    existsSpy.mockRestore();
  });

  it("sets explicit packet fail_reason when cross-lane uncertainty metadata is missing", async () => {
    const fs = await import("node:fs");
    const fsMod = fs.default ?? fs;
    const realExistsSync = fsMod.existsSync.bind(fsMod);
    const realReadFileSync = fsMod.readFileSync.bind(fsMod);
    const existsSpy = vi.spyOn(fsMod, "existsSync").mockImplementation((target: any) => {
      const normalized = normalizePathForMatch(target);
      if (normalized.endsWith("configs/math-congruence-matrix.v1.json")) return true;
      return realExistsSync(target);
    });
    const readSpy = vi.spyOn(fsMod, "readFileSync").mockImplementation((target: any, ...args: any[]) => {
      const normalized = normalizePathForMatch(target);
      if (normalized.endsWith("configs/math-congruence-matrix.v1.json")) {
        return JSON.stringify({
          rows: [
            {
              id: "runtime_cross_lane_proxy",
              runtime_safety_eligible: true,
              cross_lane_bridge: true,
              provenance_class: "proxy",
              uncertainty_model_id: "proxy_v1",
              falsifier: {},
            },
          ],
        }) as any;
      }
      return realReadFileSync(target, ...(args as [any]));
    });

    const packet = buildRelationAssemblyPacket({
      question: "How does runtime safety handle proxy bridge evidence?",
      contextFiles: ["docs/knowledge/warp/warp-bubble.md", "docs/ethos/ideology.json"],
      contextText: "runtime safety assembly",
      docBlocks: [
        { path: "docs/knowledge/warp/warp-bubble.md", block: "Warp runtime safety rail." },
        { path: "docs/ethos/ideology.json", block: "Ethos runtime stewardship rail." },
      ],
      graphPack: null,
    });

    expect(packet.fail_reason).toBe("FAIL_MISSING_UNCERTAINTY_MODEL");
    expect(packet.falsifiability_hooks.some((entry) => entry.includes("cross_lane_uncertainty=missing_uncertainty_metadata:runtime_cross_lane_proxy"))).toBe(true);

    readSpy.mockRestore();
    existsSpy.mockRestore();
  });


  it("fails deterministically when runtime cross-lane proxy rows miss citation/equation metadata", async () => {
    const fs = await import("node:fs");
    const existsSpy = vi.spyOn(fs.default ?? fs, "existsSync").mockReturnValue(true);
    const readSpy = vi.spyOn(fs.default ?? fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        rows: [
          {
            id: "runtime_cross_lane_proxy_missing_citation",
            runtime_safety_eligible: true,
            cross_lane_bridge: true,
            provenance_class: "proxy",
            equation_id: "",
            claim_tier: "diagnostic",
            uncertainty_model_id: "proxy_uq_v1",
            falsifier: {
              uncertainty_model: "proxy_bridge_uncertainty(proxy_uq_v1)",
              evidence: "",
            },
          },
        ],
      }) as any,
    );

    const result = __testOnlyResolveCrossLaneUncertaintyValidation();
    expect(result.referenced).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.failReason).toBe("FAIL_MISSING_PROXY_METADATA");
    expect(result.summary).toContain("cross_lane_uncertainty=missing_citation_or_equation_metadata:runtime_cross_lane_proxy_missing_citation");

    readSpy.mockRestore();
    existsSpy.mockRestore();
  });

  it("sets explicit packet fail_reason when cross-lane citation/equation metadata is missing", async () => {
    const fs = await import("node:fs");
    const fsMod = fs.default ?? fs;
    const realExistsSync = fsMod.existsSync.bind(fsMod);
    const realReadFileSync = fsMod.readFileSync.bind(fsMod);
    const existsSpy = vi.spyOn(fsMod, "existsSync").mockImplementation((target: any) => {
      const normalized = normalizePathForMatch(target);
      if (normalized.endsWith("configs/math-congruence-matrix.v1.json")) return true;
      return realExistsSync(target);
    });
    const readSpy = vi.spyOn(fsMod, "readFileSync").mockImplementation((target: any, ...args: any[]) => {
      const normalized = normalizePathForMatch(target);
      if (normalized.endsWith("configs/math-congruence-matrix.v1.json")) {
        return JSON.stringify({
          rows: [
            {
              id: "runtime_cross_lane_proxy_missing_metadata",
              runtime_safety_eligible: true,
              cross_lane_bridge: true,
              provenance_class: "proxy",
              equation_id: "",
              claim_tier: "diagnostic",
              uncertainty_model_id: "proxy_v1",
              falsifier: {
                uncertainty_model: "proxy_bridge_uncertainty(proxy_v1)",
                evidence: "",
              },
            },
          ],
        }) as any;
      }
      return realReadFileSync(target, ...(args as [any]));
    });

    const packet = buildRelationAssemblyPacket({
      question: "How does runtime safety handle proxy bridge evidence?",
      contextFiles: ["docs/knowledge/warp/warp-bubble.md", "docs/ethos/ideology.json"],
      contextText: "runtime safety assembly",
      docBlocks: [
        { path: "docs/knowledge/warp/warp-bubble.md", block: "Warp runtime safety rail." },
        { path: "docs/ethos/ideology.json", block: "Ethos runtime stewardship rail." },
      ],
      graphPack: null,
    });

    expect(packet.fail_reason).toBe("FAIL_MISSING_PROXY_METADATA");
    expect(packet.falsifiability_hooks.some((entry) => entry.includes("cross_lane_uncertainty=missing_citation_or_equation_metadata:runtime_cross_lane_proxy_missing_metadata"))).toBe(true);

    readSpy.mockRestore();
    existsSpy.mockRestore();
  });

  it("fails deterministically for broad open-world science prompt when proxy metadata is insufficient", async () => {
    const fs = await import("node:fs");
    const existsSpy = vi.spyOn(fs.default ?? fs, "existsSync").mockReturnValue(true);
    const readSpy = vi.spyOn(fs.default ?? fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        rows: [
          {
            id: "runtime_broad_science_proxy_missing_metadata",
            runtime_safety_eligible: true,
            cross_lane_bridge: true,
            provenance_class: "proxy",
            equation_id: "",
            claim_tier: "diagnostic",
            uncertainty_model_id: "broad_proxy_uq_v1",
            falsifier: {
              uncertainty_model: "proxy_bridge_uncertainty(broad_proxy_uq_v1)",
              evidence: "",
            },
          },
        ],
      }) as any,
    );

    const packet = buildRelationAssemblyPacket({
      question: "How do consciousness, cosmology, and life interact in open-world settings?",
      contextFiles: ["docs/knowledge/warp/warp-bubble.md", "docs/ethos/ideology.json"],
      contextText: "broad science bridge synthesis",
      docBlocks: [
        { path: "docs/knowledge/warp/warp-bubble.md", block: "Warp runtime safety rail." },
        { path: "docs/ethos/ideology.json", block: "Ethos runtime stewardship rail." },
      ],
      graphPack: null,
    });

    expect(packet.fail_reason).toBe("FAIL_MISSING_PROXY_METADATA");
    expect(
      packet.falsifiability_hooks.some((entry) =>
        entry.includes("cross_lane_uncertainty=missing_citation_or_equation_metadata:runtime_broad_science_proxy_missing_metadata"),
      ),
    ).toBe(true);

    readSpy.mockRestore();
    existsSpy.mockRestore();
  });

  it("keeps contracted positive route for broad science prompts when uncertainty/citation/equation metadata is complete", async () => {
    const fs = await import("node:fs");
    const existsSpy = vi.spyOn(fs.default ?? fs, "existsSync").mockReturnValue(true);
    const readSpy = vi.spyOn(fs.default ?? fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        rows: [
          {
            id: "runtime_broad_science_proxy_complete",
            runtime_safety_eligible: true,
            cross_lane_bridge: true,
            provenance_class: "proxy",
            equation_id: "eq_broad_science_1",
            claim_tier: "diagnostic",
            uncertainty_model_id: "broad_proxy_uq_v1",
            falsifier: {
              uncertainty_model: "proxy_bridge_uncertainty(broad_proxy_uq_v1)",
              evidence: "docs/knowledge/bridges/life-cosmology-consciousness-bridge.json#falsifier",
            },
          },
        ],
      }) as any,
    );

    const result = __testOnlyResolveCrossLaneUncertaintyValidation();
    expect(result.referenced).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.failReason).toBeUndefined();
    expect(result.summary).toContain("cross_lane_uncertainty=ok:runtime_broad_science_proxy_complete");

    readSpy.mockRestore();
    existsSpy.mockRestore();
  });


  it("builds deterministic dual-domain fallback evidence when relation fields are missing", () => {
    const fallback = ensureRelationAssemblyPacketFallback(
      {
        question: "",
        domains: [],
        definitions: { warp_definition: "", ethos_definition: "" },
        bridge_claims: [],
        constraints: [],
        falsifiability_hooks: [],
        evidence: [],
        source_map: {},
      },
      "",
    );
    expect(fallback.domains).toEqual(["ethos", "warp"]);
    expect(fallback.evidence.some((entry) => entry.domain === "warp")).toBe(true);
    expect(fallback.evidence.some((entry) => entry.domain === "ethos")).toBe(true);
    expect(fallback.bridge_claims.length).toBeGreaterThanOrEqual(2);
  });


  it("ensures fallback packet satisfies minimum relation floors deterministically", () => {
    const packet = ensureRelationAssemblyPacketFallback(null, "How does warp relate to mission ethos?");
    const floor = evaluateRelationPacketFloors(packet, { minBridges: 2, minEvidence: 2 });
    expect(floor.ok).toBe(true);
    expect(packet.domains).toEqual(["ethos", "warp"]);
  });

  it("injects deterministic dual-domain anchors for relation fallback packets", () => {
    const anchored = ensureRelationFallbackDomainAnchors(
      ensureRelationAssemblyPacketFallback(
        {
          question: "How does warp relate to mission ethos?",
          domains: ["warp"],
          definitions: {
            warp_definition: "warp definition",
            ethos_definition: "ethos definition",
          },
          bridge_claims: ["bridge claim"],
          constraints: ["constraint"],
          falsifiability_hooks: ["hook"],
          evidence: [
            {
              evidence_id: "ev_existing",
              path: "docs/knowledge/warp/warp-bubble.md",
              span: "L1-L1",
              snippet: "warp",
              domain: "warp",
            },
          ],
          source_map: { ev_existing: "docs/knowledge/warp/warp-bubble.md#L1-L1" },
        },
        "How does warp relate to mission ethos?",
      ),
    );
    expect(anchored.domains).toEqual(["ethos", "warp"]);
    expect(anchored.evidence.some((entry) => entry.domain === "warp")).toBe(true);
    expect(anchored.evidence.some((entry) => entry.domain === "ethos")).toBe(true);
    expect(Object.values(anchored.source_map)).toContain("docs/ethos/ideology.json#L1-L1");
  });

  it("renders relation fallback in natural language without artifact-style keys", () => {
    const packet = ensureRelationAssemblyPacketFallback(
      {
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
      },
      "How does warp relate to mission ethos?",
    );

    const rendered = renderRelationAssemblyFallback(packet);

    expect(rendered).not.toMatch(/\bwhat_is_[a-z0-9_]+\s*:/i);
    expect(rendered).not.toMatch(/\bhow_they_connect\s*:/i);
    expect(rendered).not.toMatch(/\bconstraints?_and_falsifiability\s*:/i);
    expect(rendered).not.toMatch(/^What is warp bubble:/im);
    expect(rendered).toMatch(/^Direct Answer:/m);
    expect(rendered).toMatch(/^Mechanism:/m);
    expect(rendered).toMatch(/^Constraints and Falsifiability:/m);
    expect(rendered).toContain("Warp bubble geometry is constrained by viability gates.");
    expect(rendered).toContain("Mission ethos requires stewardship and non-harm.");
    expect(rendered).toContain("Sources:");
  });

  it("renders conversational relation fallback without tree-walk headings or path prefixes", () => {
    const conversational = renderRelationAssemblyConversationalFallback(
      ensureRelationAssemblyPacketFallback(
        {
          question: "Explain the relation between warp bubble physics and mission ethos in this repo.",
          domains: ["ethos", "warp"],
          definitions: {
            warp_definition:
              "docs/knowledge/warp/warp-bubble.md - A warp bubble is a bounded spacetime configuration under this repository's warp model.",
            ethos_definition:
              "docs/ethos/ideology.json.. - Mission ethos constrains capability claims to verified, non-harmful operation.",
          },
          bridge_claims: [
            "Mission ethos constrains warp development to measured, auditable checkpoints before deployment.",
            "Verification hooks translate design ambition into falsifiable tests across physics and policy layers.",
          ],
          constraints: [
            "Physics bounds: Ford-Roman QI and GR constraint gates must pass before viability claims.",
          ],
          falsifiability_hooks: [
            "Re-run /api/agi/adapter/run with updated action payload and require PASS with certificate integrity OK.",
          ],
          evidence: [],
          source_map: {
            ev_1: "docs/knowledge/warp/warp-bubble.md#L1-L2",
            ev_2: "docs/ethos/ideology.json#L1-L2",
          },
        },
        "Explain the relation between warp bubble physics and mission ethos in this repo.",
      ),
    );

    expect(conversational).toContain("A warp bubble is a bounded spacetime configuration");
    expect(conversational).toContain("Mission ethos constrains capability claims");
    expect(conversational).toContain("Verification hooks translate design ambition");
    expect(conversational).not.toMatch(/^Direct Answer:/im);
    expect(conversational).not.toMatch(/\bTree Walk\b/i);
    expect(conversational).not.toMatch(/\bdocs\/ethos\/ideology\.json\b/i);
    expect(conversational).not.toMatch(/^\.\.\s*-/);
    expect(conversational.length).toBeGreaterThan(220);
  });

  it("falls back to safe relation sentences when packet fields contain tree-walk artifacts", () => {
    const conversational = renderRelationAssemblyConversationalFallback({
      question: "How does a warp bubble fit in with the mission ethos?",
      domains: ["ethos", "warp"],
      definitions: {
        warp_definition:
          "Tree Walk: Warp Mechanics Walk (tree-derived; source: docs/knowledge/warp/warp-mechanics-tree.json) Chain scaffold: root_to_anchor 1. Walk: Warp Mechanics Tree - A walkable map of warp geometry, proxies, and control levers.",
        ethos_definition:
          "Tree Walk: Mission Ethos Tree (tree-derived; source: docs/ethos/ideology.json) Chain scaffold: root_to_leaf 1. Role:anchor: Mission Ethos - The warp vessel is a vow to return radiance to the Sun, pairing physics with compassion.",
      },
      bridge_claims: [
        "Tree Walk: Ethos Knowledge Walk (tree-derived; source: docs/knowledge/ethos/ethos-knowledge-tree.json) Chain scaffold: root_to_leaf 1. Hint: Civic and Governance Systems - Navigation hint only.",
      ],
      constraints: [],
      falsifiability_hooks: [],
      evidence: [],
      source_map: {},
    });

    expect(conversational).toContain("A warp bubble is a bounded spacetime configuration");
    expect(conversational).toContain("Mission ethos constrains capability claims");
    expect(conversational).not.toMatch(/\bTree Walk\b/i);
    expect(conversational).not.toMatch(/\bChain scaffold\b/i);
  });

  it("blocks over-promotion above diagnostic maturity ceiling", () => {
    const result = __testOnlyResolveMaturityCeilingValidation([
      {
        evidence_id: "ev_cert",
        path: "docs/knowledge/warp/warp-bubble.md",
        span: "L1-L1",
        snippet: "certified lane statement",
        domain: "warp",
        claim_tier: "certified",
      },
    ]);

    expect(result.referenced).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.failReason).toBe("FAIL_MATURITY_CEILING_VIOLATION");
  });

  it("blocks diagnostic/proxy upstream evidence from implying certified surfaces", async () => {
    const fs = await import("node:fs");
    const fsMod = fs.default ?? fs;
    const realExistsSync = fsMod.existsSync.bind(fsMod);
    const realReadFileSync = fsMod.readFileSync.bind(fsMod);
    const existsSpy = vi.spyOn(fsMod, "existsSync").mockImplementation((target: any) => {
      const normalized = normalizePathForMatch(target);
      if (normalized.endsWith("configs/physics-root-leaf-manifest.v1.json")) return true;
      return realExistsSync(target);
    });
    const readSpy = vi.spyOn(fsMod, "readFileSync").mockImplementation((target: any, ...args: any[]) => {
      const normalized = normalizePathForMatch(target);
      if (normalized.endsWith("configs/physics-root-leaf-manifest.v1.json")) {
        return JSON.stringify({
          claim_tier_ceiling: "certified",
          maturity_propagation_policy: {
            enabled: true,
            no_over_promotion: true,
            strict_fail_reason: "FAIL_MATURITY_CEILING_VIOLATION",
            default_max_claim_tier: "certified",
            upstream_claim_tier_blocklist_for_certified: ["diagnostic", "reduced-order"],
            upstream_provenance_blocklist_for_certified: ["proxy", "inferred"],
          },
        }) as any;
      }
      return realReadFileSync(target, ...(args as [any]));
    });

    const result = __testOnlyResolveMaturityCeilingValidation([
      {
        evidence_id: "ev_upstream_proxy",
        path: "docs/knowledge/warp/warp-bubble.md",
        span: "L1-L1",
        snippet: "proxy upstream diagnostic",
        domain: "warp",
        provenance_class: "proxy",
        claim_tier: "diagnostic",
      },
      {
        evidence_id: "ev_surface_cert",
        path: "docs/ethos/ideology.json",
        span: "L1-L1",
        snippet: "certified downstream output",
        domain: "ethos",
        provenance_class: "measured",
        claim_tier: "certified",
      },
    ]);

    expect(result.referenced).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.failReason).toBe("FAIL_MATURITY_CEILING_VIOLATION");
    expect(result.summary).toContain("maturity_ceiling=upstream_to_certified_violation");

    readSpy.mockRestore();
    existsSpy.mockRestore();
  });
});
