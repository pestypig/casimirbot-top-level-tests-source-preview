import { describe, expect, it } from "vitest";
import { __testScoreDeterministicClaimCitationLinkage } from "../server/routes/agi.plan";
import {
  evaluateEvidenceEligibility,
  extractClaimCandidates,
  evaluateClaimCoverage,
  evaluateClaimCitationLinkage,
} from "../server/services/helix-ask/query";
import { scorePremeditation } from "../server/services/premeditation-scorer";
import { resolveHelixAskArbiter } from "../server/services/helix-ask/arbiter";
import { buildHelixAskStrictFailReasonLedger } from "../server/services/helix-ask/strict-fail-reason-ledger";

describe("Helix Ask evidence eligibility gate", () => {
  it("fails when context misses key tokens", () => {
    const result = evaluateEvidenceEligibility(
      "platonic reasoning in this system",
      "unrelated ui components and settings",
      { minTokens: 2, minRatio: 0.25 },
    );
    expect(result.ok).toBe(false);
    expect(result.matchCount).toBe(0);
  });

  it("passes when context includes key tokens", () => {
    const result = evaluateEvidenceEligibility(
      "platonic reasoning in this system",
      "This system references platonic reasoning and its constraints in docs.",
      { minTokens: 2, minRatio: 0.25 },
    );
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBeGreaterThanOrEqual(2);
  });

  it("ignores instruction noise tokens", () => {
    const result = evaluateEvidenceEligibility(
      "What is the scientific method, and how does this system apply it for verification? Two short paragraphs; second must cite repo files.",
      "scientific method verification system",
      { minTokens: 3, minRatio: 0.5 },
    );
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBeGreaterThanOrEqual(3);
  });

  it("uses signal tokens when provided", () => {
    const result = evaluateEvidenceEligibility(
      "How does it work?",
      "kappa_drive kappa_body curvature proxy",
      {
        minTokens: 2,
        minRatio: 0.4,
        signalTokens: ["kappa_drive", "kappa_body", "curvature proxy"],
      },
    );
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBeGreaterThanOrEqual(2);
  });

  it("extracts claim candidates from bullets and strips citations", () => {
    const scaffold = [
      "- The system uses a gate to validate results (server/routes/agi.plan.ts).",
      "- Training traces are persisted for export (server/services/observability/training-trace-store.ts).",
    ].join("\n");
    const claims = extractClaimCandidates(scaffold, 4);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims[0]).toMatch(/uses a gate/i);
    expect(claims[0]).not.toMatch(/\.ts/);
  });

  it("evaluates claim coverage against context", () => {
    const claims = [
      "The system uses a gate to validate results.",
      "Training traces are persisted for export.",
    ];
    const ok = evaluateClaimCoverage(claims, "The system uses a gate and persists training traces.", {
      minTokens: 1,
      minRatio: 0.2,
      minSupportRatio: 0.5,
    });
    expect(ok.ok).toBe(true);
    expect(ok.supportedCount).toBeGreaterThan(0);

    const fail = evaluateClaimCoverage(claims, "Unrelated context only.", {
      minTokens: 1,
      minRatio: 0.4,
      minSupportRatio: 0.5,
    });
    expect(fail.ok).toBe(false);
    expect(fail.supportedCount).toBe(0);
  });
});

describe("Ideology dual-key hard gate scoring", () => {
  it("emits explicit HARD firstFail for missing legal key on covered actions", () => {
    const result = scorePremeditation({
      candidates: [
        {
          id: "covered-missing-legal",
          valueLongevity: 0.9,
          risk: 0.2,
          entropy: 0.1,
          tags: ["covered-action", "ethos-key", "jurisdiction-floor-ok"],
        },
      ],
    });
    expect(result.chosenCandidateId).toBeUndefined();
    expect(result.rationaleTags).toContain("ideology_gate.firstFail:IDEOLOGY_MISSING_LEGAL_KEY");
    expect(result.rationaleTags).toContain("ideology_gate.severity:HARD");
  });

  it("keeps non-covered actions backward compatible", () => {
    const result = scorePremeditation({
      candidates: [
        {
          id: "legacy-safe",
          valueLongevity: 0.7,
          risk: 0.1,
          entropy: 0.1,
          tags: ["legacy-action"],
        },
      ],
    });
    expect(result.chosenCandidateId).toBe("legacy-safe");
    expect(result.rationaleTags.join(" ")).not.toContain("ideology_gate.firstFail");
  });
});


describe("Helix Ask strict-ready arbiter promotion", () => {
  it("promotes strict-ready missing certainty evidence to clarify with deterministic fail_reason", () => {
    const result = resolveHelixAskArbiter({
      retrievalConfidence: 0.92,
      repoThreshold: 0.8,
      hybridThreshold: 0.5,
      mustIncludeOk: true,
      viabilityMustIncludeOk: true,
      topicMustIncludeOk: true,
      conceptMatch: true,
      hasRepoHints: true,
      topicTags: ["helix_ask"],
      verificationAnchorRequired: false,
      verificationAnchorOk: true,
      userExpectsRepo: true,
      hasHighStakesConstraints: false,
      strictCertainty: true,
      certaintyEvidenceOk: false,
    });

    expect(result.mode).toBe("clarify");
    expect(result.reason).toBe("strict_ready_contract_missing");
    expect(result.fail_reason).toBe("CERTAINTY_EVIDENCE_MISSING");
  });

  it("keeps non-strict arbiter behavior backward-compatible", () => {
    const result = resolveHelixAskArbiter({
      retrievalConfidence: 0.92,
      repoThreshold: 0.8,
      hybridThreshold: 0.5,
      mustIncludeOk: true,
      viabilityMustIncludeOk: true,
      topicMustIncludeOk: true,
      conceptMatch: true,
      hasRepoHints: true,
      topicTags: ["helix_ask"],
      verificationAnchorRequired: false,
      verificationAnchorOk: true,
      userExpectsRepo: true,
      hasHighStakesConstraints: false,
      strictCertainty: false,
      certaintyEvidenceOk: false,
    });

    expect(result.mode).toBe("repo_grounded");
    expect(result.reason).toBe("repo_ratio");
    expect(result.fail_reason).toBeUndefined();
  });
});

describe("Helix Ask strict fail-reason ledger", () => {
  it("emits deterministic ledger entries and histogram artifact for strict runs", () => {
    const ledger = buildHelixAskStrictFailReasonLedger({
      strictEnabled: true,
      payload: {
        fail_reason: "CONCEPTS_PROVENANCE_MISSING",
        debug: {
          arbiter_fail_reason: "CERTAINTY_EVIDENCE_MISSING",
        },
      },
    });

    expect(ledger).toBeTruthy();
    expect(ledger?.entries).toEqual([
      {
        ordinal: 1,
        stage: "response",
        fail_reason: "CONCEPTS_PROVENANCE_MISSING",
        category: "evidence_contract",
      },
      {
        ordinal: 2,
        stage: "arbiter",
        fail_reason: "CERTAINTY_EVIDENCE_MISSING",
        category: "evidence_contract",
      },
    ]);
    expect(ledger?.histogram).toEqual([
      {
        fail_reason: "CERTAINTY_EVIDENCE_MISSING",
        category: "evidence_contract",
        count: 1,
      },
      {
        fail_reason: "CONCEPTS_PROVENANCE_MISSING",
        category: "evidence_contract",
        count: 1,
      },
    ]);
    expect(ledger?.histogram_artifact.kind).toBe("helix_ask.strict_fail_reason_histogram.v1");
    expect(ledger?.histogram_artifact.integrity).toBe("OK");
    expect(ledger?.histogram_artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps non-strict behavior backward-compatible", () => {
    const ledger = buildHelixAskStrictFailReasonLedger({
      strictEnabled: false,
      payload: {
        fail_reason: "CONCEPTS_PROVENANCE_MISSING",
      },
    });

    expect(ledger).toBeNull();
  });

  it("categorizes scientific-slot and telemetry-leak fail reasons deterministically", () => {
    const ledger = buildHelixAskStrictFailReasonLedger({
      strictEnabled: true,
      payload: {
        fail_reason: "SCIENTIFIC_METHOD_MISSING_SLOT",
        debug: {
          helix_ask_fail_reason: "TELEMETRY_LEAK_IN_ANSWER",
        },
      },
    });

    expect(ledger?.entries).toEqual([
      {
        ordinal: 1,
        stage: "response",
        fail_reason: "SCIENTIFIC_METHOD_MISSING_SLOT",
        category: "evidence_contract",
      },
      {
        ordinal: 2,
        stage: "runtime",
        fail_reason: "TELEMETRY_LEAK_IN_ANSWER",
        category: "runtime_contract",
      },
    ]);
  });

  it("categorizes relation-proof fail reason as evidence_contract", () => {
    const ledger = buildHelixAskStrictFailReasonLedger({
      strictEnabled: true,
      payload: {
        fail_reason: "RELATION_EDGE_MISSING_NEEDLE_HULL_NATARIO_FAMILY",
      },
    });

    expect(ledger?.entries).toEqual([
      {
        ordinal: 1,
        stage: "response",
        fail_reason: "RELATION_EDGE_MISSING_NEEDLE_HULL_NATARIO_FAMILY",
        category: "evidence_contract",
      },
    ]);
  });
});


describe("Helix Ask semantic claim-citation linkage scorer", () => {
  it("fails with CLAIM_CITATION_LINK_MISSING when claims have no citation tokens", () => {
    const score = __testScoreDeterministicClaimCitationLinkage(
      "Deterministic quality gates enforce strict response contracts. Final outputs preserve semantic structure.",
    );

    expect(score.claimCount).toBe(2);
    expect(score.linkedClaimCount).toBe(0);
    expect(score.linkRate).toBe(0);
    expect(score.failReasons).toEqual(["CLAIM_CITATION_LINK_MISSING"]);
  });

  it("fails with CLAIM_CITATION_LINK_WEAK when only a subset of claims link to citations", () => {
    const score = __testScoreDeterministicClaimCitationLinkage([
      "Quality floor appends source anchors from server/routes/agi.plan.ts.",
      "Semantic scoring also evaluates unsupported claim rates.",
      "Sources: server/routes/agi.plan.ts",
    ].join("\n\n"));

    expect(score.claimCount).toBe(2);
    expect(score.linkedClaimCount).toBe(1);
    expect(score.failReasons).toEqual(["CLAIM_CITATION_LINK_WEAK"]);
  });

  it("passes when every final claim sentence links to a citation token/path", () => {
    const score = __testScoreDeterministicClaimCitationLinkage([
      "Quality floor appends source anchors from server/routes/agi.plan.ts.",
      "Gate enforcement is tested in tests/helix-ask-evidence-gate.spec.ts.",
      "Sources: server/routes/agi.plan.ts, tests/helix-ask-evidence-gate.spec.ts",
    ].join("\n\n"));

    expect(score.claimCount).toBe(2);
    expect(score.linkedClaimCount).toBe(2);
    expect(score.linkRate).toBe(1);
    expect(score.failReasons).toEqual([]);
  });
});

describe("Helix Ask semantic claim citation linkage", () => {
  it("fails with CLAIM_CITATION_LINK_MISSING when claims have no citation links", () => {
    const answer = [
      "The system enforces deterministic evidence gates for Helix Ask.",
      "It persists training traces for replay and audits.",
    ].join(" ");
    const result = evaluateClaimCitationLinkage(answer, []);
    expect(result.ok).toBe(false);
    expect(result.failReason).toBe("CLAIM_CITATION_LINK_MISSING");
    expect(result.unlinkedClaims.length).toBeGreaterThan(0);
  });

  it("fails with CLAIM_CITATION_LINK_WEAK when citations cannot cover all claims", () => {
    const answer = [
      "The system enforces deterministic evidence gates for Helix Ask.",
      "It persists training traces for replay and audits.",
      "It records strict fail reasons for contract regressions.",
      "",
      "Sources: server/routes/agi.plan.ts",
    ].join("\n");
    const result = evaluateClaimCitationLinkage(answer, []);
    expect(result.ok).toBe(false);
    expect(result.failReason).toBe("CLAIM_CITATION_LINK_WEAK");
  });

  it("passes when citations can be deterministically linked to all claims", () => {
    const answer = [
      "The system enforces deterministic evidence gates for Helix Ask.",
      "It persists training traces for replay and audits.",
      "",
      "Sources: server/routes/agi.plan.ts, tests/helix-ask-evidence-gate.spec.ts",
    ].join("\n");
    const result = evaluateClaimCitationLinkage(answer, []);
    expect(result.ok).toBe(true);
    expect(result.failReason).toBeUndefined();
  });
});
