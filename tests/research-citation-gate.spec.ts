import { describe, expect, it } from "vitest";
import { validateResearchCitationGateManifest } from "../scripts/lib/research-citation-gate";

const buildBaseManifest = () => ({
  manifestType: "research_citation_patch_checklist/v1" as const,
  generatedOn: "2026-04-24",
  policy: {
    citationRequiredStatuses: ["measured", "derived", "hypothesis"],
    minSourcesPerClaim: 1,
    requireGithubCloneForMeasured: false,
    requireCompletedChecklistItems: true,
  },
  checklist: [{ id: "c1", title: "done", status: "done" as const }],
  sources: [
    {
      id: "paper_good",
      type: "paper" as const,
      evidenceType: "peer_reviewed" as const,
      sourceStability: "preprint" as const,
      title: "Paper",
      supportsClaimIds: ["claim_hyp"],
      accessedOn: "2026-04-24",
      url: "https://arxiv.org/abs/2102.06824",
    },
  ],
  claims: [
    {
      claimId: "claim_hyp",
      claimText: "This remains uncertain and diagnostic.",
      status: "hypothesis" as const,
      artifactPaths: ["a.json"],
      sourceIds: ["paper_good"],
      uncertaintyNote: "u",
      uncertaintyRationale: "r",
      scopeBoundary: "b",
    },
  ],
});

describe("research citation gate hardening", () => {
  it("rejects invalid paper URL", () => {
    const manifest = buildBaseManifest();
    manifest.sources[0].url = "notaurl";
    const result = validateResearchCitationGateManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.join(",")).toMatch(/paper_url_invalid/i);
  });

  it("rejects invalid DOI format", () => {
    const manifest = buildBaseManifest();
    manifest.sources[0].doi = "bad-doi";
    const result = validateResearchCitationGateManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.join(",")).toMatch(/doi_invalid/i);
  });

  it("rejects certainty language in non-measured claim text", () => {
    const manifest = buildBaseManifest();
    manifest.claims[0].claimText = "This is proven and experimentally validated.";
    const result = validateResearchCitationGateManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.join(",")).toMatch(/certainty_language_forbidden/i);
  });

  it("rejects non-measured claims backed only by non-literature sources", () => {
    const manifest = buildBaseManifest();
    manifest.sources.push({
      id: "web_only",
      type: "web",
      evidenceType: "reference_web",
      sourceStability: "operational_web",
      title: "Web page",
      supportsClaimIds: ["claim_hyp"],
      accessedOn: "2026-04-24",
      url: "https://example.com/reference",
    } as any);
    manifest.claims[0].sourceIds = ["web_only"];
    const result = validateResearchCitationGateManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.join(",")).toMatch(/non_measured_paper_required/i);
  });

  it("rejects non-measured claims when paper sources are not stable literature", () => {
    const manifest = buildBaseManifest();
    (manifest.sources[0] as any).sourceStability = "operational_web";
    const result = validateResearchCitationGateManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.join(",")).toMatch(/non_measured_paper_stability_required/i);
  });
});
