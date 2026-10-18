import { describe, expect, it } from "vitest";
import { evaluateKnowledgePromotionGate } from "../server/services/knowledge/promotion-gate";

describe("evaluateKnowledgePromotionGate", () => {
  it("rejects when policy disables promotion path", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      promotionPolicyEnabled: false,
      claimTier: "certified",
      evidenceRef: "trace-1",
      evidenceResolved: true,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: true,
      casimirVerdict: "PASS",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_POLICY_DISABLED");
    }
  });

  it("rejects non-certified claim tiers", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "diagnostic",
      evidenceRef: "trace-1",
      evidenceResolved: true,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: true,
      casimirVerdict: "PASS",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_CERTIFIED_ONLY_REQUIRED");
    }
  });

  it("rejects when server evidence reference is missing", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "certified",
      evidenceRef: "",
      evidenceResolved: false,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: true,
      casimirVerdict: "PASS",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_MISSING_EVIDENCE_REF");
    }
  });

  it("rejects when server evidence reference does not resolve", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "certified",
      evidenceRef: "trace-unknown",
      evidenceResolved: false,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: true,
      casimirVerdict: "PASS",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_UNRESOLVED_EVIDENCE_REF");
    }
  });

  it("rejects evidence forbidden for tenant context", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "certified",
      evidenceRef: "trace-1",
      evidenceResolved: true,
      evidenceTenantAllowed: false,
      evidenceTrustedProvenance: true,
      casimirVerdict: "PASS",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_EVIDENCE_TENANT_FORBIDDEN");
    }
  });

  it("rejects resolved evidence with untrusted provenance", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "certified",
      evidenceRef: "trace-1",
      evidenceResolved: true,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: false,
      casimirVerdict: "PASS",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_UNTRUSTED_EVIDENCE_PROVENANCE");
    }
  });

  it("rejects resolved non-PASS verdict", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "certified",
      evidenceRef: "trace-1",
      evidenceResolved: true,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: true,
      casimirVerdict: "FAIL",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_MISSING_CASIMIR_VERIFICATION");
    }
  });

  it("rejects resolved missing certificate integrity", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "certified",
      evidenceRef: "trace-1",
      evidenceResolved: true,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: true,
      casimirVerdict: "PASS",
      certificateHash: null,
      certificateIntegrityOk: false,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("KNOWLEDGE_PROMOTION_CERTIFICATE_INTEGRITY_REQUIRED");
    }
  });

  it("allows certified promotion when resolved evidence checks pass", () => {
    const decision = evaluateKnowledgePromotionGate({
      enforceCertifiedOnly: true,
      claimTier: "certified",
      evidenceRef: "trace-1",
      evidenceResolved: true,
      evidenceTenantAllowed: true,
      evidenceTrustedProvenance: true,
      casimirVerdict: "PASS",
      certificateHash: "abc123",
      certificateIntegrityOk: true,
    });

    expect(decision).toEqual({ ok: true, enforcement: "enforce" });
  });
});
