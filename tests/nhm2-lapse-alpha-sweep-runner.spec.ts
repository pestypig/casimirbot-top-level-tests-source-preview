import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertClaimEvidenceSufficiency,
  assertResearchLockCoverage,
  assertValidCitationRegistry,
  assertControlledSingleProfileContract,
  assertControlledExploratoryPrereq,
  classifySweepRow,
  deriveEvidenceSufficiency,
  deriveResearchConfidenceTier,
  deriveEvidenceLedgerReason,
  deriveExpectedClockingTarget,
  deriveSweepFailureSummary,
  assertBaselineClockingCoherence,
  inferSelectedTransportRuntimeReason,
  getNextActionForRuntimeReason,
  classifyFrontierBlocker,
  classifyFrontierLadderGroup,
  getFirstBlockingReason,
  isStalledByHeartbeat,
  normalizeFullLoopState,
  readPositiveIntFromEnv,
  readPositiveTimeoutMsFromEnv,
  resolveSelectedTransportOnlyContract,
  resolveNhm2SweepOutputRoots,
  resolveCitationRegistryPath,
  selectSweepSpecs,
  validateClaimsLedger,
  verifyFullLoopArtifactFreshness,
  writeHeartbeatSnapshot,
} from "../scripts/research/run-nhm2-lapse-alpha-sweep";

describe("nhm2 lapse alpha sweep runner helpers", () => {
  it("classifies exploratory passing rows as blocked when policy forbids auto-promotion", () => {
    const progressionClass = classifySweepRow({
      gates: {
        baselineInvariance: "pass",
        clockingConsistency: "pass",
        antiSrSafety: "pass",
        decompositionConsistency: "pass",
        invariantGate: "pass",
        fullLoopAudit: "pass",
        evidenceLedger: "pass",
        promotionEligible: "pass",
      },
      bracket: "exploratory",
      exploratoryBracketCannotAutoPromote: true,
      allowExploratoryPromotion: false,
    });
    expect(progressionClass).toBe("exploratory_pass_blocked_by_policy");
  });

  it("reports dominant failure gate from failed rows", () => {
    const summary = deriveSweepFailureSummary({
      sweepName: "demo",
      rows: [
        {
          profileId: "a",
          bracket: "baseline",
          family: "nhm2-shift-lapse",
          clockingMode: "bounded-lapse",
          centerlineAlpha: 0.995,
          centerlineDtauDt: 0.995,
          coordinateTimeS: 10,
          properTimeS: 9.95,
          properMinusCoordinateS: -0.05,
          savedDays: 0,
          properToCoordinateRatio: 0.995,
          subjectiveEfficiency: 1.005,
          betaOverAlphaMax: 0,
          wallHorizonMargin: 1,
          decompositionResidualS: 0,
          lapseTrackedFraction: 1,
          invariantGateStatus: "pass",
          fullLoopStateRaw: "pass",
          fullLoopStateNormalized: "pass",
          coordinateTimeDeltaFromBaselineS: 0,
          coordinateTimeDeltaFromBaselineRel: 0,
          gates: {
            baselineInvariance: "pass",
            clockingConsistency: "fail",
            antiSrSafety: "pass",
            decompositionConsistency: "pass",
            invariantGate: "pass",
            fullLoopAudit: "pass",
            evidenceLedger: "pass",
            promotionEligible: "fail",
          },
          progressionClass: "diagnostic_fail",
          gateDiagnostics: {
            baselineToleranceS: 0.001,
            baselineToleranceRel: 1e-9,
            ratioError: 0.1,
            ratioTolerance: 1e-9,
            properMinusErrorS: 0.1,
            properMinusToleranceS: 0.001,
            betaOverAlphaMaxLimit: 1e-6,
            wallHorizonMarginMin: 1,
            decompositionResidualToleranceS: 1e-3,
            lapseTrackedFractionMin: 0.99,
            evidenceBlocking: false,
            evidenceLedgerReason: "pass",
          },
          overallState: "fail",
          claimClass: "not_validated",
          supportTier: "repo_plus_literature",
          literatureContextOnly: false,
          claimClassNote: "x",
          uncertainty: {
            category: "evidence_gap",
            blockers: ["clockingConsistency"],
            nextMeasurement: "rerun",
            note: "diagnostic",
          },
          currentClaimTier: "diagnostic",
          maximumClaimTier: "reduced-order",
          sourceDir: "a",
          auditDir: "a",
          provenance: {
            generatedAt: new Date().toISOString(),
            gitSha: null,
            sweepConfigPath: "x",
            sweepConfigChecksum: "y",
            fullLoopExecuted: true,
            solverCommand: "z",
          },
        },
      ],
    });
    expect(summary.firstFailureProfileId).toBe("a");
    expect(summary.dominantFailureGate).toBe("clockingConsistency");
  });

  it("fails claim-ledger validation for unknown source references", () => {
    expect(() =>
      validateClaimsLedger({
        knownSourceIds: ["repo_source", "paper_source", "known_source"],
        paperSourceIds: ["paper_source"],
        repoSourceIds: ["repo_source"],
        paperMetadataById: {
          paper_source: {
            sourceStability: "primary_peer_reviewed",
            doi: "10.1234/test",
            evidenceRole: "constraint_context",
            publisherType: "journal",
          },
        },
        measuredOrDerivedRequiresCitation: true,
        hypothesisRequiresUncertaintyNote: true,
        claims: [
          {
            claimId: "c1",
            claimText: "x",
            status: "derived",
            supportTier: "repo_plus_literature",
            artifactPaths: ["a"],
            sourceIds: ["repo_source", "paper_source", "unknown_source"],
            uncertaintyNote: "uncertain",
            uncertaintyRationale: "r",
            scopeBoundary: "b",
          },
        ],
      }),
    ).toThrow(/unknown source id/i);
  });

  it("fails non-measured claims that do not cite a paper source", () => {
    expect(() =>
      validateClaimsLedger({
        knownSourceIds: ["repo_source"],
        paperSourceIds: ["paper_source"],
        repoSourceIds: ["repo_source"],
        paperMetadataById: {
          paper_source: {
            sourceStability: "primary_peer_reviewed",
            doi: "10.1234/test",
            evidenceRole: "constraint_context",
            publisherType: "journal",
          },
        },
        measuredOrDerivedRequiresCitation: true,
        hypothesisRequiresUncertaintyNote: true,
        claims: [
          {
            claimId: "c2",
            claimText: "x",
            status: "derived",
            supportTier: "repo_measured",
            artifactPaths: ["a"],
            sourceIds: ["repo_source"],
            uncertaintyNote: "uncertain",
            uncertaintyRationale: "r",
            scopeBoundary: "b",
            allowedClaim: "diagnostic only",
            cannotClaim: ["experimental validation"],
          },
        ],
      }),
    ).toThrow(/non-measured but has no paper citation/i);
  });

  it("accepts measured claims with repo evidence and no paper citation", () => {
    expect(() =>
      validateClaimsLedger({
        knownSourceIds: ["repo_source"],
        paperSourceIds: ["paper_source"],
        repoSourceIds: ["repo_source"],
        paperMetadataById: {
          paper_source: {
            sourceStability: "primary_peer_reviewed",
            doi: "10.1234/test",
            evidenceRole: "constraint_context",
          },
        },
        measuredOrDerivedRequiresCitation: true,
        hypothesisRequiresUncertaintyNote: true,
        claims: [
          {
            claimId: "c3",
            claimText: "x",
            status: "measured",
            supportTier: "repo_measured",
            artifactPaths: ["a"],
            sourceIds: ["repo_source"],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("fails literature-only claims missing literatureContextOnly flag", () => {
    expect(() =>
      validateClaimsLedger({
        knownSourceIds: ["paper_source"],
        paperSourceIds: ["paper_source"],
        repoSourceIds: ["repo_source"],
        paperMetadataById: {
          paper_source: {
            sourceStability: "primary_peer_reviewed",
            doi: "10.1234/test",
            evidenceRole: "constraint_context",
          },
        },
        measuredOrDerivedRequiresCitation: true,
        hypothesisRequiresUncertaintyNote: true,
        claims: [
          {
            claimId: "c4",
            claimText: "x",
            status: "hypothesis",
            supportTier: "literature_only_nonproof",
            profileId: "stage1_centerline_alpha_0p7000_v1",
            artifactPaths: ["a"],
            sourceIds: ["paper_source"],
            uncertaintyNote: "uncertain",
            uncertaintyRationale: "r",
            scopeBoundary: "b",
            allowedClaim: "diagnostic only",
            cannotClaim: ["experimental validation"],
          },
        ],
      }),
    ).toThrow(/literatureContextOnly flag is not true/i);
  });

  it("filters specs by NHM2_ALPHA_SWEEP_ONLY_TAGS ordering from config", () => {
    const selected = selectSweepSpecs({
      allSpecs: [
        { alpha: 0.995, tag: "0p995", bracket: "baseline" },
        { alpha: 0.7, tag: "0p7000", bracket: "exploratory" },
        { alpha: 0.65, tag: "0p6500", bracket: "exploratory" },
      ],
      onlyTags: ["0p7000", "0p6500"],
    });
    expect(selected.map((entry) => entry.tag)).toEqual(["0p7000", "0p6500"]);
  });

  it("enforces controlled single-profile contract when only-tags is set", () => {
    expect(() =>
      assertControlledSingleProfileContract({
        onlyTags: ["0p7000", "0p6500"],
        selectedSpecs: [
          { alpha: 0.7, tag: "0p7000", bracket: "exploratory" },
          { alpha: 0.65, tag: "0p6500", bracket: "exploratory" },
        ],
        runFullLoop: true,
      }),
    ).toThrow(/requires exactly one profile/i);
    expect(() =>
      assertControlledSingleProfileContract({
        onlyTags: ["0p7000"],
        selectedSpecs: [{ alpha: 0.7, tag: "0p7000", bracket: "exploratory" }],
        runFullLoop: false,
      }),
    ).toThrow(/requires NHM2_ALPHA_SWEEP_RUN_FULL_LOOP=1/i);
  });

  it("enforces prior full-loop artifact for controlled exploratory progression", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nhm2-sweep-"));
    expect(() =>
      assertControlledExploratoryPrereq({
        profileTag: "0p6500",
        profileId: "stage1_centerline_alpha_0p6500_v1",
        sweepRootDir: tmpRoot,
        requirePreviousFullLoop: true,
      }),
    ).toThrow(/Controlled progression prerequisite missing/i);
  });

  it("fails repo_plus_literature claims missing DOI-backed primary paper", () => {
    expect(() =>
      validateClaimsLedger({
        knownSourceIds: ["repo_source", "paper_source"],
        paperSourceIds: ["paper_source"],
        repoSourceIds: ["repo_source"],
        paperMetadataById: {
          paper_source: {
            sourceStability: "preprint",
            doi: undefined,
            evidenceRole: "constraint_context",
            publisherType: "preprint",
          },
        },
        measuredOrDerivedRequiresCitation: true,
        hypothesisRequiresUncertaintyNote: true,
        claims: [
          {
            claimId: "c5",
            claimText: "x",
            status: "hypothesis",
            supportTier: "repo_plus_literature",
            profileId: "stage1_centerline_alpha_0p7000_v1",
            artifactPaths: ["a"],
            sourceIds: ["repo_source", "paper_source"],
            uncertaintyNote: "uncertain",
            uncertaintyRationale: "r",
            scopeBoundary: "b",
            allowedClaim: "diagnostic only",
            cannotClaim: ["experimental validation"],
          },
        ],
      }),
    ).toThrow(/no DOI-backed primary paper citation/i);
  });

  it("returns gate-specific first blocking reason for clocking consistency", () => {
    const row = {
      profileId: "stage1_centerline_alpha_0p7000_v1",
      bracket: "exploratory",
      family: "nhm2-shift-lapse",
      clockingMode: "bounded-lapse",
      centerlineAlpha: 0.7,
      centerlineDtauDt: 0.7,
      coordinateTimeS: 10,
      properTimeS: 7,
      properMinusCoordinateS: -3,
      savedDays: 0,
      properToCoordinateRatio: 0.7,
      subjectiveEfficiency: 1.4285,
      betaOverAlphaMax: 0,
      wallHorizonMargin: 1,
      decompositionResidualS: 0,
      lapseTrackedFraction: 1,
      invariantGateStatus: "pass",
      fullLoopStateRaw: "pass",
      fullLoopStateNormalized: "pass",
      coordinateTimeDeltaFromBaselineS: 0,
      coordinateTimeDeltaFromBaselineRel: 0,
      gates: {
        baselineInvariance: "pass",
        clockingConsistency: "fail",
        antiSrSafety: "pass",
        decompositionConsistency: "pass",
        invariantGate: "pass",
        fullLoopAudit: "pass",
        evidenceLedger: "pass",
        promotionEligible: "fail",
      },
      progressionClass: "diagnostic_fail",
      claimClass: "not_validated",
      supportTier: "repo_plus_literature",
      literatureContextOnly: false,
      claimClassNote: "x",
      uncertainty: {
        category: "evidence_gap",
        blockers: ["clockingConsistency"],
        nextMeasurement: "rerun",
        note: "x",
      },
      gateDiagnostics: {
        baselineToleranceS: 0.001,
        baselineToleranceRel: 1e-9,
        ratioError: 1e-4,
        ratioTolerance: 1e-9,
        properMinusErrorS: 1e-4,
        properMinusToleranceS: 1e-5,
        betaOverAlphaMaxLimit: 1e-6,
        wallHorizonMarginMin: 1,
        decompositionResidualToleranceS: 1e-3,
        lapseTrackedFractionMin: 0.99,
        evidenceBlocking: false,
        evidenceLedgerReason: "pass",
      },
      overallState: "fail",
      currentClaimTier: "diagnostic",
      maximumClaimTier: "reduced-order",
      sourceDir: "a",
      auditDir: "a",
      provenance: {
        generatedAt: new Date().toISOString(),
        gitSha: null,
        sweepConfigPath: "x",
        sweepConfigChecksum: "y",
        fullLoopExecuted: true,
        solverCommand: "z",
      },
    } as const;
    const reason = getFirstBlockingReason({
      firstBlockingGate: "clockingConsistency",
      row,
    });
    expect(reason).toMatch(/ratio_error:/i);
    expect(reason).toMatch(/proper_minus_error_s:/i);
  });

  it("enforces research lock coverage for required citations", () => {
    expect(() =>
      assertResearchLockCoverage({
        lock: {
          manifestType: "nhm2_alpha_sweep_research_lock/v1",
          generatedOn: "2026-04-26",
          entries: [
            {
              id: "paper_a",
              url: "https://doi.org/10.1234/a",
              doi: "10.1234/a",
              accessedOn: "2026-04-26",
              evidenceRole: "constraint_context",
              claimClasses: ["repo_plus_literature"],
            },
          ],
        },
        requiredPaperIds: ["paper_a", "paper_b"],
      }),
    ).toThrow(/research_lock_missing_citation:paper_b/i);
  });

  it("derives evidence sufficiency and marks missing role/doi requirements", () => {
    const sufficiency = deriveEvidenceSufficiency({
      claim: {
        claimId: "c6",
        claimText: "x",
        status: "hypothesis",
        supportTier: "repo_plus_literature",
        profileId: "stage1_centerline_alpha_0p7000_v1",
        artifactPaths: ["a"],
        sourceIds: ["repo_source", "paper_source"],
        uncertaintyNote: "uncertain",
      },
      paperMetadataById: {
          paper_source: {
            sourceStability: "preprint",
            doi: undefined,
            evidenceRole: "theory_context",
            publisherType: "preprint",
          },
        },
      repoSourceIds: ["repo_source"],
    });
    expect(sufficiency.pass).toBe(false);
    expect(sufficiency.missing).toContain("doi_primary_peer_reviewed");
    expect(sufficiency.missing).toContain("constraint_context_paper");
    expect(sufficiency.missing).toContain("journal_constraint_context_paper");
  });

  it("fails non-measured profile claims missing boundary contract", () => {
    expect(() =>
      validateClaimsLedger({
        knownSourceIds: ["repo_source", "paper_source"],
        paperSourceIds: ["paper_source"],
        repoSourceIds: ["repo_source"],
        paperMetadataById: {
          paper_source: {
            sourceStability: "primary_peer_reviewed",
            doi: "10.1234/test",
            evidenceRole: "constraint_context",
            publisherType: "journal",
          },
        },
        measuredOrDerivedRequiresCitation: true,
        hypothesisRequiresUncertaintyNote: true,
        claims: [
          {
            claimId: "c7",
            claimText: "x",
            status: "hypothesis",
            supportTier: "repo_plus_literature",
            profileId: "stage1_centerline_alpha_0p7000_v1",
            artifactPaths: ["a"],
            sourceIds: ["repo_source", "paper_source"],
            uncertaintyNote: "uncertain",
            uncertaintyRationale: "r",
            scopeBoundary: "b",
          },
        ],
      }),
    ).toThrow(/no allowedClaim/i);
  });

  it("maps research confidence tier correctly", () => {
    const measuredTier = deriveResearchConfidenceTier({
      claim: {
        claimId: "m",
        claimText: "x",
        status: "measured",
        supportTier: "repo_measured",
        artifactPaths: ["a"],
        sourceIds: ["repo_source"],
      },
      evidenceSufficiency: { required: [], present: [], missing: [], pass: true },
    });
    expect(measuredTier).toBe("repo_measured");

    const constraintTier = deriveResearchConfidenceTier({
      claim: {
        claimId: "n",
        claimText: "x",
        status: "hypothesis",
        supportTier: "repo_plus_literature",
        profileId: "stage1_centerline_alpha_0p7000_v1",
        artifactPaths: ["a"],
        sourceIds: ["repo_source", "paper_source"],
      },
      evidenceSufficiency: {
        required: ["journal_constraint_context_paper"],
        present: ["journal_constraint_context_paper"],
        missing: [],
        pass: true,
      },
    });
    expect(constraintTier).toBe("constraint_supported");
  });

  it("fails non-measured profile claims when evidence sufficiency is missing required items", () => {
    expect(() =>
      assertClaimEvidenceSufficiency({
        claim: {
          claimId: "c8",
          claimText: "x",
          status: "hypothesis",
          supportTier: "repo_plus_literature",
          profileId: "stage1_centerline_alpha_0p7000_v1",
          artifactPaths: ["a"],
          sourceIds: ["repo_source", "paper_source"],
          uncertaintyNote: "uncertain",
        },
        evidenceSufficiency: {
          required: ["repo_citation", "doi_primary_peer_reviewed"],
          present: ["repo_citation"],
          missing: ["doi_primary_peer_reviewed"],
          pass: false,
        },
        researchConfidenceTier: "context_only",
      }),
    ).toThrow(/claim_evidence_sufficiency_violation/i);
  });

  it("fails repo_plus_literature non-measured profile claims unless confidence tier is constraint_supported", () => {
    expect(() =>
      assertClaimEvidenceSufficiency({
        claim: {
          claimId: "c9",
          claimText: "x",
          status: "hypothesis",
          supportTier: "repo_plus_literature",
          profileId: "stage1_centerline_alpha_0p7000_v1",
          artifactPaths: ["a"],
          sourceIds: ["repo_source", "paper_source"],
          uncertaintyNote: "uncertain",
        },
        evidenceSufficiency: {
          required: ["repo_citation", "doi_primary_peer_reviewed", "constraint_context_paper"],
          present: ["repo_citation", "doi_primary_peer_reviewed", "constraint_context_paper"],
          missing: [],
          pass: true,
        },
        researchConfidenceTier: "context_only",
      }),
    ).toThrow(/repo_plus_literature_requires_constraint_supported/i);
  });

  it("normalizes unavailable full-loop state to fail", () => {
    expect(normalizeFullLoopState("unavailable")).toBe("fail");
    expect(normalizeFullLoopState("pass")).toBe("pass");
  });

  it("derives evidence-ledger reason from explicit failure mode", () => {
    expect(
      deriveEvidenceLedgerReason({
        runFullLoop: true,
        fullLoopStateRaw: "unavailable",
        claimEvidence: { validationOk: true, hasBlockingEvidence: false, entries: [] },
      }),
    ).toBe("full_loop_unavailable");
    expect(
      deriveEvidenceLedgerReason({
        runFullLoop: true,
        fullLoopStateRaw: "fail",
        claimEvidence: { validationOk: true, hasBlockingEvidence: false, entries: [] },
      }),
    ).toBe("full_loop_failed");
    expect(
      deriveEvidenceLedgerReason({
        runFullLoop: true,
        fullLoopStateRaw: "pass",
        claimEvidence: { validationOk: false, hasBlockingEvidence: false, entries: [] },
      }),
    ).toBe("validation_failed");
    expect(
      deriveEvidenceLedgerReason({
        runFullLoop: true,
        fullLoopStateRaw: "pass",
        claimEvidence: { validationOk: true, hasBlockingEvidence: true, entries: [] },
      }),
    ).toBe("blocking_evidence_true");
    expect(
      deriveEvidenceLedgerReason({
        runFullLoop: true,
        fullLoopStateRaw: "pass",
        claimEvidence: { validationOk: true, hasBlockingEvidence: false, entries: [{ mappingStatus: "missing" }] },
      }),
    ).toBe("entry_unmapped");
  });

  it("fails freshness gate when required full-loop artifacts are stale or missing", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nhm2-freshness-"));
    const now = Date.now();
    const fullLoopPath = path.join(tmpRoot, "nhm2-full-loop-audit-latest.json");
    const sourcePath = path.join(tmpRoot, "nhm2-source-closure-latest.json");
    fs.writeFileSync(fullLoopPath, "{}");
    fs.writeFileSync(sourcePath, "{}");
    const staleDate = new Date(now - 60_000);
    fs.utimesSync(fullLoopPath, staleDate, staleDate);
    fs.utimesSync(sourcePath, staleDate, staleDate);
    const freshness = verifyFullLoopArtifactFreshness({
      profileArtifactRoot: tmpRoot,
      runStartedAtMs: now,
    });
    expect(freshness.allFresh).toBe(false);
    expect(freshness.staleReasonCodes.some((entry) => entry.includes("nhm2-full-loop-audit-latest.json"))).toBe(
      true,
    );
    expect(freshness.staleReasonCodes.some((entry) => entry.includes("nhm2-observer-audit-latest.json"))).toBe(
      true,
    );
  });

  it("parses full-loop timeout env in seconds and returns milliseconds", () => {
    const old = process.env.NHM2_FULL_LOOP_TIMEOUT_S;
    process.env.NHM2_FULL_LOOP_TIMEOUT_S = "2.5";
    expect(readPositiveTimeoutMsFromEnv("NHM2_FULL_LOOP_TIMEOUT_S", 10)).toBe(2500);
    process.env.NHM2_FULL_LOOP_TIMEOUT_S = "";
    expect(readPositiveTimeoutMsFromEnv("NHM2_FULL_LOOP_TIMEOUT_S", 10)).toBe(10000);
    process.env.NHM2_FULL_LOOP_TIMEOUT_S = old;
  });

  it("writes heartbeat artifact with stage metadata", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nhm2-heartbeat-"));
    const payload = {
      profileId: "stage1_centerline_alpha_0p7000_v1",
      stage: "full_loop" as const,
      detail: "full_loop_publish_started",
      pid: 123,
      runStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date().toISOString(),
      heartbeatIntervalMs: 15000,
    };
    const outPath = writeHeartbeatSnapshot({
      profileArtifactRoot: tmpRoot,
      payload,
    });
    expect(fs.existsSync(outPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outPath, "utf8"));
    expect(written.profileId).toBe(payload.profileId);
    expect(written.stage).toBe(payload.stage);
    expect(written.pid).toBe(payload.pid);
  });

  it("parses positive integer env for stall heartbeat threshold", () => {
    const old = process.env.NHM2_STALL_MIN_HEARTBEATS;
    process.env.NHM2_STALL_MIN_HEARTBEATS = "7";
    expect(readPositiveIntFromEnv("NHM2_STALL_MIN_HEARTBEATS", 5)).toBe(7);
    process.env.NHM2_STALL_MIN_HEARTBEATS = "";
    expect(readPositiveIntFromEnv("NHM2_STALL_MIN_HEARTBEATS", 5)).toBe(5);
    process.env.NHM2_STALL_MIN_HEARTBEATS = old;
  });

  it("detects stall only when no-progress time and heartbeat count exceed thresholds", () => {
    const now = Date.now();
    expect(
      isStalledByHeartbeat({
        health: {
          lastProgressAtMs: now - 700_000,
          heartbeatTicksSinceProgress: 6,
        },
        nowMs: now,
        stallMaxNoProgressMs: 600_000,
        stallMinHeartbeats: 5,
      }),
    ).toBe(true);
    expect(
      isStalledByHeartbeat({
        health: {
          lastProgressAtMs: now - 700_000,
          heartbeatTicksSinceProgress: 2,
        },
        nowMs: now,
        stallMaxNoProgressMs: 600_000,
        stallMinHeartbeats: 5,
      }),
    ).toBe(false);
  });

  it("fails citation registry papers that omit allowedClaimClasses", () => {
    expect(() =>
      assertValidCitationRegistry({
        manifestType: "nhm2_alpha_sweep_citations/v1",
        generatedOn: "2026-04-27",
        papers: [
          {
            id: "paper-a",
            title: "A",
            url: "https://example.com/a",
            year: 2024,
            publisherType: "journal",
            sourceStability: "primary_peer_reviewed",
            evidenceRole: "constraint_context",
          },
        ],
        claimClassRequiredPaperIds: {
          literature_context: ["paper-a"],
          extrapolation_candidate: ["paper-a"],
          not_validated: ["paper-a"],
        },
      }),
    ).toThrow(/allowedClaimClasses invalid/i);
  });

  it("fails citation registry papers with invalid publisherType", () => {
    expect(() =>
      assertValidCitationRegistry({
        manifestType: "nhm2_alpha_sweep_citations/v1",
        generatedOn: "2026-04-27",
        papers: [
          {
            id: "paper-b",
            title: "B",
            url: "https://example.com/b",
            year: 2024,
            publisherType: "magazine",
            allowedClaimClasses: ["repo_plus_literature"],
            sourceStability: "preprint",
            evidenceRole: "theory_context",
          },
        ],
        claimClassRequiredPaperIds: {
          literature_context: ["paper-b"],
          extrapolation_candidate: ["paper-b"],
          not_validated: ["paper-b"],
        },
      }),
    ).toThrow(/publisherType invalid/i);
  });

  it("resolves citation registry path to docs registry when available", () => {
    const resolved = resolveCitationRegistryPath();
    expect(resolved.endsWith(path.join("docs", "research", "nhm2-alpha-sweep-citation-registry.v1.json"))).toBe(
      true,
    );
  });

  it("classifies selected transport error taxonomy from tagged error strings", () => {
    expect(inferSelectedTransportRuntimeReason("selected_transport_invalid_json:foo")).toBe(
      "selected_transport_invalid_json",
    );
    expect(inferSelectedTransportRuntimeReason("selected_transport_missing_artifact:bar")).toBe(
      "selected_transport_missing_artifact",
    );
    expect(inferSelectedTransportRuntimeReason("selected_transport_profile_mismatch:baz")).toBe(
      "selected_transport_profile_mismatch",
    );
    expect(inferSelectedTransportRuntimeReason("selected_transport_stale_artifact:old")).toBe(
      "selected_transport_stale_artifact",
    );
  });

  it("maps runtime blocker classes to concrete next actions", () => {
    expect(getNextActionForRuntimeReason("selected_transport_missing_artifact")).toMatch(/artifact/i);
    expect(getNextActionForRuntimeReason("selected_transport_invalid_json")).toMatch(/json/i);
    expect(getNextActionForRuntimeReason("selected_transport_profile_mismatch")).toMatch(/profile/i);
    expect(getNextActionForRuntimeReason("selected_transport_stale_artifact")).toMatch(/stale/i);
  });

  it("enforces selected-transport-only env contract", () => {
    expect(() =>
      resolveSelectedTransportOnlyContract({
        NHM2_SWEEP_MODE: "selected-transport-only",
        NHM2_PROFILE_ID: "stage1_centerline_alpha_0p7000_v1",
        NHM2_CENTERLINE_ALPHA: "0.7",
        NHM2_CENTERLINE_DTAU_DT: "0.7",
      }),
    ).toThrow(/NHM2_OUTPUT_DIR/i);

    expect(() =>
      resolveSelectedTransportOnlyContract({
        NHM2_SWEEP_MODE: "selected-transport-only",
        NHM2_PROFILE_ID: "stage1_centerline_alpha_0p7000_v1",
        NHM2_PROFILE_TAG: "0p7000",
        NHM2_CENTERLINE_ALPHA: "0.7",
        NHM2_CENTERLINE_DTAU_DT: "0.7",
        NHM2_OUTPUT_DIR: "out",
      }),
    ).not.toThrow();
  });

  it("binds full-sweep artifacts and audits beneath NHM2_OUTPUT_DIR", () => {
    const root = path.join("workspace", "repo");
    const output = path.join("artifacts", "theory-runtime-jobs", "request_alpha");
    const resolved = resolveNhm2SweepOutputRoots(root, { NHM2_OUTPUT_DIR: output });

    expect(resolved).toEqual({
      sweepRoot: path.resolve(root, output),
      sweepAuditRoot: path.resolve(root, output, "audit"),
      runBound: true,
    });
  });

  it("derives expected clocking target from baseline anchor", () => {
    const target = deriveExpectedClockingTarget(
      {
        profileId: "stage1_centerline_alpha_0p995_v1",
        centerlineAlpha: 0.995,
        coordinateTimeS: 137755965.9171795,
        properTimeS: 137067186.0875936,
        properMinusCoordinateS: -688779.8295859098,
      },
      0.7,
    );
    expect(target.expectedProperToCoordinateRatio).toBe(0.7);
    expect(target.expectedSubjectiveEfficiency).toBeCloseTo(1.42857142857, 9);
    expect(target.expectedSavedDays).toBeCloseTo(478.3193261013, 6);
  });

  it("derives 0p5000 as an expected 2x target, not validated evidence", () => {
    const target = deriveExpectedClockingTarget(
      {
        profileId: "stage1_centerline_alpha_0p995_v1",
        centerlineAlpha: 0.995,
        coordinateTimeS: 137755965.9171795,
        properTimeS: 137067186.0875936,
        properMinusCoordinateS: -688779.8295859098,
      },
      0.5,
    );
    expect(target.expectedSubjectiveEfficiency).toBe(2);
    expect(target.expectedProperTimeS).toBeCloseTo(68877982.95858975, 6);
    expect(target.expectedSavedDays).toBeCloseTo(797.1988768355295, 6);
  });

  it("groups the alpha ladder into revalidation, bisection, and deep exploratory regions", () => {
    expect(classifyFrontierLadderGroup({ alpha: 0.995, tag: "0p995" })).toBe(
      "confirmed_revalidation_ladder",
    );
    expect(classifyFrontierLadderGroup({ alpha: 0.705, tag: "0p7050" })).toBe(
      "frontier_bisection_ladder",
    );
    expect(classifyFrontierLadderGroup({ alpha: 0.65, tag: "0p6500" })).toBe(
      "deep_exploratory_ladder",
    );
  });

  it("classifies selected transport runtime blockers before physics gates", () => {
    expect(
      classifyFrontierBlocker({
        runtimeBlockingReason: "selected_transport_timeout",
        runHealth: "failed_timeout",
        fullLoopStateRaw: "unavailable",
        fullLoopStateNormalized: "fail",
        gates: {
          baselineInvariance: "fail",
          clockingConsistency: "fail",
          antiSrSafety: "fail",
          decompositionConsistency: "fail",
          invariantGate: "fail",
          fullLoopAudit: "fail",
          evidenceLedger: "fail",
          promotionEligible: "fail",
        },
      }),
    ).toBe("selected_transport_runtime");

    expect(
      classifyFrontierBlocker({
        runtimeBlockingReason: null,
        runHealth: "healthy_fresh",
        fullLoopStateRaw: "pass",
        fullLoopStateNormalized: "pass",
        gates: {
          baselineInvariance: "pass",
          clockingConsistency: "fail",
          antiSrSafety: "pass",
          decompositionConsistency: "pass",
          invariantGate: "pass",
          fullLoopAudit: "pass",
          evidenceLedger: "pass",
          promotionEligible: "fail",
        },
      }),
    ).toBe("clocking_mismatch");
  });

  it("accepts coherent baseline clocking anchor", () => {
    expect(() =>
      assertBaselineClockingCoherence({
        profileId: "stage1_centerline_alpha_0p995_v1",
        centerlineAlpha: 0.995,
        coordinateTimeS: 137755965.9171795,
        properTimeS: 137067186.0875936,
        properMinusCoordinateS: -688779.8295859098,
      }),
    ).not.toThrow();
  });
});
