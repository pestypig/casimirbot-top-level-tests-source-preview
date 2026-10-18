import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildNhm2CampaignFrontierDisposition,
} from "../shared/contracts/nhm2-campaign-frontier-disposition.v1";
import {
  buildNhm2CampaignProfileRunManifest,
  isNhm2CampaignProfileRunManifest,
} from "../shared/contracts/nhm2-campaign-profile-run-manifest.v1";
import {
  buildNhm2CampaignProfileSearch,
} from "../shared/contracts/nhm2-campaign-profile-search.v1";
import {
  buildNhm2MetricMomentumRemediationTargets,
} from "../shared/contracts/nhm2-metric-momentum-remediation-targets.v1";
import type { Nhm2MetricRequiredMomentumDemandAuditV1 } from "../shared/contracts/nhm2-metric-required-momentum-demand-audit.v1";
import type { Nhm2ObserverRobustEnergyConditionArtifactV1 } from "../shared/contracts/nhm2-observer-robust-energy-conditions.v1";
import type { Nhm2QeiWorldlineDossierV1 } from "../shared/contracts/nhm2-qei-worldline-dossier.v1";
import { publishNhm2CampaignProfileRunManifest } from "../tools/nhm2/build-campaign-profile-run-manifest";
import { publishNhm2TileSourceMaterialEvidenceReceipts } from "../tools/nhm2/publish-tile-source-material-evidence-receipts";

const demandAudit = (): Nhm2MetricRequiredMomentumDemandAuditV1 =>
  ({
    contractVersion: "nhm2_metric_required_momentum_demand_audit/v1",
    generatedAt: "2026-06-19T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p995_v1",
    runId: "profile-run-manifest-test",
    momentumFrameProjectionReceiptRef: "projection-receipt.json",
    projectionEvidenceRef: "projection-evidence.json",
    projectionApplicabilityStatus: "applicable",
    ratioPolicy: "use_audit_same_chart_ratios_as_local_frame_reduced_order",
    components: [
      {
        regionId: "hull",
        componentId: "T02",
        projectedMetricRequiredMomentumToEnergyRatio: 10,
        causalMomentumToEnergyRatioLimit: 1,
        exceedanceFactor: 10,
        status: "fail",
        blockers: ["metric_required_momentum_density_causal_bound_exceeded"],
      },
    ],
    summary: {
      allProjectedRatiosAvailable: true,
      anyProjectedMetricRequiredCausalMomentumBoundViolation: true,
      worstRegionId: "hull",
      worstComponentId: "T02",
      worstProjectedMetricRequiredMomentumToEnergyRatio: 10,
      worstExceedanceFactor: 10,
      currentMetricProfileFalsified: true,
      falsifierScope: "current_metric_profile_under_declared_projection",
      firstBlocker: "hull:T02:metric_required_momentum_density_causal_bound_exceeded",
      blockerCount: 1,
    },
    claimBoundary: {
      diagnosticOnly: true,
      metricDemandAuditDoesNotValidatePhysicalSource: true,
      reducedOrderProjectionDoesNotReplaceFullAdmTetrad: true,
      currentProfileFalsifierDoesNotProveUniversalMetricImpossibility: true,
      transportClaimAllowed: false,
    },
  }) as Nhm2MetricRequiredMomentumDemandAuditV1;

describe("nhm2_campaign_profile_run_manifest/v1", () => {
  it("queues only screened candidates and requires all frozen campaign evidence", () => {
    const targets = buildNhm2MetricMomentumRemediationTargets({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricRequiredMomentumDemandAudit: demandAudit(),
      metricRequiredMomentumDemandAuditRef: "demand-audit.json",
    });
    const disposition = buildNhm2CampaignFrontierDisposition({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricMomentumRemediationTargets: targets,
      metricMomentumRemediationTargetsRef: "targets.json",
    });
    const search = buildNhm2CampaignProfileSearch({
      generatedAt: "2026-06-19T00:00:00.000Z",
      campaignFrontierDisposition: disposition,
      campaignFrontierDispositionRef: "disposition.json",
      metricMomentumRemediationTargets: targets,
      metricMomentumRemediationTargetsRef: "targets.json",
      candidateSpecs: [
        {
          alphaCenterline: 0.7,
          proposalKind: "alpha_only",
          projectedT0iSuppressionFactor: 1,
        },
        {
          alphaCenterline: 0.9,
          proposalKind: "combined_metric_redesign",
          projectedT0iSuppressionFactor: 20,
        },
      ],
    });
    const manifest = buildNhm2CampaignProfileRunManifest({
      generatedAt: "2026-06-19T00:00:00.000Z",
      profileSearch: search,
      profileSearchRef: "profile-search.json",
      runRootBase: "artifacts/test-profile-runs",
    });

    const rejected = manifest.candidates.find(
      (candidate) => candidate.proposalKind === "alpha_only",
    );
    const queued = manifest.candidates.find(
      (candidate) => candidate.proposalKind === "combined_metric_redesign",
    );

    expect(rejected?.manifestStatus).toBe("not_queued_rejected_by_profile_screen");
    expect(rejected?.queuedForFrozenCampaign).toBe(false);
    expect(rejected?.requiredEvidence.every((entry) => entry.required === false)).toBe(true);

    expect(queued?.manifestStatus).toBe("queued_full_campaign_required");
    expect(queued?.queuedForFrozenCampaign).toBe(true);
    expect(queued?.priorityRank).toBe(1);
    expect(queued?.nextCommand).toContain("--selected-profile-id");
    expect(queued?.requiredEvidence.every((entry) => entry.status === "required_missing")).toBe(true);
    expect(queued?.requiredEvidence.map((entry) => entry.evidenceId)).toEqual([
      "candidate_metric_profile_spec",
      "metric_required_full_regional_tensor",
      "projected_momentum_demand_audit",
      "metric_momentum_remediation_targets",
      "source_tile_counterpart_compatibility",
      "regional_full_tensor_residuals",
      "switching_covariant_conservation",
      "frequency_convergence",
      "dynamic_effective_geometry_agreement",
      "qei_worldline_dossier",
      "observer_family_energy_conditions",
      "horizon_blueshift_particle_stability",
      "time_dependent_source_campaign",
      "tile_source_material_evidence_receipts",
      "tile_source_physical_validation_plan",
      "tile_source_evidence_gap_roadmap",
      "tile_source_falsification_report",
      "tile_source_authority_handoff",
      "tile_source_material_coupon_test_plan",
      "tile_source_material_coupon_operating_budget",
      "tile_source_force_gap_pull_in_test_plan",
      "tile_source_force_gap_load_budget",
      "tile_source_roughness_patch_test_plan",
      "tile_source_roughness_patch_operating_budget",
      "tile_source_active_control_test_plan",
      "tile_source_active_control_operating_budget",
      "tile_source_fatigue_layer_scaling_test_plan",
      "tile_source_fatigue_layer_scaling_operating_budget",
      "tile_source_full_apparatus_tensor_test_plan",
      "tile_source_full_apparatus_tensor_operating_budget",
      "tile_source_operating_budget_readiness",
    ]);
    expect(manifest.summary).toMatchObject({
      candidateCount: 2,
      queuedCandidateCount: 1,
      rejectedCandidateCount: 1,
      nextCandidateProfileId:
        "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1",
      firstBlocker: "candidate_metric_profile_spec_missing_for_frozen_campaign_run",
      manifestComplete: false,
    });
    expect(manifest.claimBoundary).toMatchObject({
      diagnosticOnly: true,
      runManifestDoesNotEvaluateCampaign: true,
      queuedCandidateDoesNotValidateProfile: true,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      routeEtaClaimAllowed: false,
      propulsionClaimAllowed: false,
    });
    expect(isNhm2CampaignProfileRunManifest(manifest)).toBe(true);
  });

  it("does not treat literal none as a blocking evidence reason", () => {
    const targets = buildNhm2MetricMomentumRemediationTargets({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricRequiredMomentumDemandAudit: demandAudit(),
      metricRequiredMomentumDemandAuditRef: "demand-audit.json",
    });
    const search = buildNhm2CampaignProfileSearch({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricMomentumRemediationTargets: targets,
      candidateSpecs: [
        {
          alphaCenterline: 0.9,
          proposalKind: "combined_metric_redesign",
          projectedT0iSuppressionFactor: 20,
        },
      ],
    });
    const candidateProfileId =
      "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";
    const manifest = buildNhm2CampaignProfileRunManifest({
      generatedAt: "2026-06-19T00:00:00.000Z",
      profileSearch: search,
      candidateEvidenceRefs: {
        [candidateProfileId]: {
          time_dependent_source_campaign: {
            artifactRef: "candidate/nhm2-time-dependent-source-campaign.json",
            blockers: ["none"],
          },
        },
      },
    });
    const campaignEvidence = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "time_dependent_source_campaign",
    );

    expect(campaignEvidence?.status).toBe("provided");
    expect(campaignEvidence?.blockers).toEqual([]);
  });

  it("marks provided candidate evidence refs without treating the manifest as complete", () => {
    const targets = buildNhm2MetricMomentumRemediationTargets({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricRequiredMomentumDemandAudit: demandAudit(),
      metricRequiredMomentumDemandAuditRef: "demand-audit.json",
    });
    const disposition = buildNhm2CampaignFrontierDisposition({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricMomentumRemediationTargets: targets,
      metricMomentumRemediationTargetsRef: "targets.json",
    });
    const search = buildNhm2CampaignProfileSearch({
      generatedAt: "2026-06-19T00:00:00.000Z",
      campaignFrontierDisposition: disposition,
      campaignFrontierDispositionRef: "disposition.json",
      metricMomentumRemediationTargets: targets,
      metricMomentumRemediationTargetsRef: "targets.json",
      candidateSpecs: [
        {
          alphaCenterline: 0.9,
          proposalKind: "combined_metric_redesign",
          projectedT0iSuppressionFactor: 20,
        },
      ],
    });
    const candidateProfileId =
      "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";
    const manifest = buildNhm2CampaignProfileRunManifest({
      generatedAt: "2026-06-19T00:00:00.000Z",
      profileSearch: search,
      candidateEvidenceRefs: {
        [candidateProfileId]: {
          candidate_metric_profile_spec: {
            artifactRef: "candidate/nhm2-candidate-metric-profile-spec.json",
            blockers: ["candidate_executable_shift_field_evaluator_missing"],
          },
          metric_required_full_regional_tensor: {
            artifactRef: "candidate/nhm2-metric-required-full-regional-tensor.json",
            blockers: ["candidate_metric_required_full_tensor_screen_not_full_adm_route"],
          },
          projected_momentum_demand_audit:
            "candidate/nhm2-metric-required-momentum-demand-audit.json",
          metric_momentum_remediation_targets:
            "candidate/nhm2-metric-momentum-remediation-targets.json",
        },
      },
    });
    const candidate = manifest.candidates[0];

    expect(
      candidate.requiredEvidence.find(
        (entry) => entry.evidenceId === "candidate_metric_profile_spec",
      ),
    ).toMatchObject({
      status: "provided_blocked",
      artifactRef: "candidate/nhm2-candidate-metric-profile-spec.json",
      blockers: ["candidate_executable_shift_field_evaluator_missing"],
    });
    expect(
      candidate.requiredEvidence.find(
        (entry) => entry.evidenceId === "metric_required_full_regional_tensor",
      ),
    ).toMatchObject({
      status: "provided_blocked",
      artifactRef: "candidate/nhm2-metric-required-full-regional-tensor.json",
      blockers: ["candidate_metric_required_full_tensor_screen_not_full_adm_route"],
    });
    expect(
      candidate.requiredEvidence.find(
        (entry) => entry.evidenceId === "projected_momentum_demand_audit",
      ),
    ).toMatchObject({
      status: "provided",
      artifactRef: "candidate/nhm2-metric-required-momentum-demand-audit.json",
      blockers: [],
    });
    expect(
      candidate.requiredEvidence.find(
        (entry) => entry.evidenceId === "metric_momentum_remediation_targets",
      ),
    ).toMatchObject({
      status: "provided",
      artifactRef: "candidate/nhm2-metric-momentum-remediation-targets.json",
      blockers: [],
    });
    expect(
      candidate.requiredEvidence.find(
        (entry) => entry.evidenceId === "qei_worldline_dossier",
      )?.status,
    ).toBe("required_missing");
    expect(manifest.summary).toMatchObject({
      queuedCandidateCount: 1,
      firstBlocker: "candidate_executable_shift_field_evaluator_missing",
      manifestComplete: false,
    });
    expect(manifest.claimBoundary.transportClaimAllowed).toBe(false);
    expect(isNhm2CampaignProfileRunManifest(manifest)).toBe(true);
  });

  it("discovers tile-source material evidence artifacts and preserves their blockers", () => {
    const targets = buildNhm2MetricMomentumRemediationTargets({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricRequiredMomentumDemandAudit: demandAudit(),
      metricRequiredMomentumDemandAuditRef: "demand-audit.json",
    });
    const search = buildNhm2CampaignProfileSearch({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricMomentumRemediationTargets: targets,
      candidateSpecs: [
        {
          alphaCenterline: 0.9,
          proposalKind: "combined_metric_redesign",
          projectedT0iSuppressionFactor: 20,
        },
      ],
    });
    const dir = mkdtempSync(join(tmpdir(), "nhm2-run-manifest-material-"));
    const candidateId =
      "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";
    const runRoot = join(dir, "runs", candidateId);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(
      join(dir, "profile-search.json"),
      `${JSON.stringify(search, null, 2)}\n`,
      "utf8",
    );
    publishNhm2TileSourceMaterialEvidenceReceipts({
      repoRoot: dir,
      outDir: join("runs", candidateId),
      generatedAt: "2026-06-19T00:00:00.000Z",
      selectedProfileId: candidateId,
    });

    const manifest = publishNhm2CampaignProfileRunManifest({
      repoRoot: dir,
      profileSearchPath: "profile-search.json",
      outPath: "manifest.json",
      runRootBase: "runs",
      auditOnly: true,
    });
    const material = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_material_evidence_receipts",
    );
    const validationPlan = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_physical_validation_plan",
    );
    const gapRoadmap = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_evidence_gap_roadmap",
    );
    const falsificationReport = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_falsification_report",
    );
    const authorityHandoff = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_authority_handoff",
    );
    const activeControlPlan = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_active_control_test_plan",
    );
    const activeControlBudget = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_active_control_operating_budget",
    );
    const materialCouponBudget = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_material_coupon_operating_budget",
    );
    const forceGapLoadBudget = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_force_gap_load_budget",
    );
    const roughnessPatchBudget = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_roughness_patch_operating_budget",
    );
    const fatigueLayerScalingBudget = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_fatigue_layer_scaling_operating_budget",
    );
    const fullApparatusPlan = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_full_apparatus_tensor_test_plan",
    );
    const fullApparatusBudget = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_full_apparatus_tensor_operating_budget",
    );
    const operatingBudgetReadiness = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "tile_source_operating_budget_readiness",
    );

    expect(material).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-material-evidence-receipts.json"),
      blockers: ["material_coupon_receipt_missing"],
    });
    expect(validationPlan).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-physical-validation-plan.json"),
      blockers: ["material_coupon_receipt_missing"],
    });
    expect(gapRoadmap).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-evidence-gap-roadmap.json"),
    });
    expect(gapRoadmap?.blockers.some((blocker) => blocker.endsWith("_evidence_gap_open"))).toBe(true);
    expect(falsificationReport).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-falsification-report.json"),
    });
    expect(falsificationReport?.blockers).toEqual(
      expect.arrayContaining(["tile_source_falsification_report_review"]),
    );
    expect(authorityHandoff).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-authority-handoff.json"),
    });
    expect(authorityHandoff?.blockers).toEqual(
      expect.arrayContaining(["tile_source_authority_handoff_blocked"]),
    );
    expect(activeControlPlan).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-active-control-test-plan.json"),
    });
    expect(activeControlBudget).toMatchObject({
      status: "provided_blocked",
      artifactRef: join(
        "runs",
        candidateId,
        "nhm2-tile-source-active-control-operating-budget.json",
      ),
    });
    expect(activeControlBudget?.blockers).toEqual(
      expect.arrayContaining(["active_control_receipt_missing_for_operating_budget"]),
    );
    expect(materialCouponBudget).toMatchObject({
      status: "provided_blocked",
      artifactRef: join(
        "runs",
        candidateId,
        "nhm2-tile-source-material-coupon-operating-budget.json",
      ),
    });
    expect(materialCouponBudget?.blockers).toEqual(
      expect.arrayContaining(["material_coupon_receipt_missing_for_operating_budget"]),
    );
    expect(forceGapLoadBudget).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-force-gap-load-budget.json"),
    });
    expect(forceGapLoadBudget?.blockers).toEqual(
      expect.arrayContaining(["force_gap_receipt_missing_for_load_budget"]),
    );
    expect(roughnessPatchBudget).toMatchObject({
      status: "provided_blocked",
      artifactRef: join(
        "runs",
        candidateId,
        "nhm2-tile-source-roughness-patch-operating-budget.json",
      ),
    });
    expect(roughnessPatchBudget?.blockers).toEqual(
      expect.arrayContaining(["roughness_patch_receipt_missing_for_operating_budget"]),
    );
    expect(fatigueLayerScalingBudget).toMatchObject({
      status: "provided_blocked",
      artifactRef: join(
        "runs",
        candidateId,
        "nhm2-tile-source-fatigue-layer-scaling-operating-budget.json",
      ),
    });
    expect(fatigueLayerScalingBudget?.blockers).toEqual(
      expect.arrayContaining([
        "fatigue_layer_scaling_receipt_missing_for_operating_budget",
      ]),
    );
    expect(activeControlPlan?.blockers.some((blocker) => blocker.endsWith("_required"))).toBe(true);
    expect(fullApparatusPlan).toMatchObject({
      status: "provided_blocked",
      artifactRef: join("runs", candidateId, "nhm2-tile-source-full-apparatus-tensor-test-plan.json"),
    });
    expect(fullApparatusPlan?.blockers.some((blocker) => blocker.endsWith("_required"))).toBe(true);
    expect(fullApparatusBudget).toMatchObject({
      status: "provided_blocked",
      artifactRef: join(
        "runs",
        candidateId,
        "nhm2-tile-source-full-apparatus-tensor-operating-budget.json",
      ),
    });
    expect(fullApparatusBudget?.blockers).toEqual(
      expect.arrayContaining(["full_apparatus_tensor_receipt_missing_for_operating_budget"]),
    );
    expect(operatingBudgetReadiness).toMatchObject({
      status: "provided_blocked",
      artifactRef: join(
        "runs",
        candidateId,
        "nhm2-tile-source-operating-budget-readiness.json",
      ),
    });
    expect(operatingBudgetReadiness?.blockers).toEqual(
      expect.arrayContaining([
        "material_coupon:material_coupon_receipt_missing_for_operating_budget",
        "full_apparatus_tensor:full_apparatus_tensor_receipt_missing_for_operating_budget",
      ]),
    );
  });

  it("marks observer evidence as blocked when observer-family violations are present", () => {
    const targets = buildNhm2MetricMomentumRemediationTargets({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricRequiredMomentumDemandAudit: demandAudit(),
      metricRequiredMomentumDemandAuditRef: "demand-audit.json",
    });
    const search = buildNhm2CampaignProfileSearch({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricMomentumRemediationTargets: targets,
      candidateSpecs: [
        {
          alphaCenterline: 0.9,
          proposalKind: "combined_metric_redesign",
          projectedT0iSuppressionFactor: 20,
        },
      ],
    });
    const observerArtifact: Nhm2ObserverRobustEnergyConditionArtifactV1 = {
      contractVersion: "nhm2_observer_robust_energy_conditions/v1",
      generatedAt: "2026-06-19T00:00:00.000Z",
      laneId: "nhm2_shift_lapse",
      selectedProfileId:
        "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1",
      tensorRef: "source.json",
      observerFamilies: [
        {
          familyId: "boosted_timelike_grid",
          status: "fail",
          worstCase: {
            condition: "WEC",
            value: -1,
          },
          blockers: [],
        },
        {
          familyId: "continuous_optimizer",
          status: "not_run",
          optimizerUsed: false,
          blockers: ["continuous_optimizer_not_implemented"],
        },
      ],
      summary: {
        eulerianOnly: false,
        robustCheckComplete: false,
        anyViolation: true,
        missedViolationRisk: "high",
      },
      literatureRefs: [
        "le_2026_observer_robust_warp_energy_conditions",
        "santiago_schuster_visser_2021_generic_warp_nec",
      ],
      claimBoundary: {
        diagnosticOnly: true,
        friendlyObserverCannotProveWec: true,
      },
    };
    const dir = mkdtempSync(join(tmpdir(), "nhm2-run-manifest-"));
    const candidateId =
      "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";
    const runRoot = join(dir, "runs", candidateId);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(
      join(dir, "profile-search.json"),
      `${JSON.stringify(search, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(runRoot, "nhm2-observer-robust-energy-conditions.json"),
      `${JSON.stringify(observerArtifact, null, 2)}\n`,
      "utf8",
    );

    const manifest = publishNhm2CampaignProfileRunManifest({
      repoRoot: dir,
      profileSearchPath: "profile-search.json",
      outPath: "manifest.json",
      runRootBase: "runs",
      auditOnly: true,
    });
    const observer = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "observer_family_energy_conditions",
    );

    expect(observer?.status).toBe("provided_blocked");
    expect(observer?.blockers).toEqual(
      expect.arrayContaining([
        "observer_robust_check_incomplete",
        "observer_family_energy_condition_violation",
        "boosted_timelike_grid:WEC:observer_energy_condition_violation",
        "continuous_optimizer:continuous_optimizer_not_implemented",
      ]),
    );
    expect(manifest.summary.firstBlocker).toBe("candidate_metric_profile_spec_missing_for_frozen_campaign_run");
    expect(observerArtifact.summary.anyViolation).toBe(true);
  });

  it("keeps observer evidence provided when only the continuous optimizer is unimplemented", () => {
    const targets = buildNhm2MetricMomentumRemediationTargets({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricRequiredMomentumDemandAudit: demandAudit(),
      metricRequiredMomentumDemandAuditRef: "demand-audit.json",
    });
    const search = buildNhm2CampaignProfileSearch({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricMomentumRemediationTargets: targets,
      candidateSpecs: [
        {
          alphaCenterline: 0.9,
          proposalKind: "combined_metric_redesign",
          projectedT0iSuppressionFactor: 20,
        },
      ],
    });
    const observerArtifact: Nhm2ObserverRobustEnergyConditionArtifactV1 = {
      contractVersion: "nhm2_observer_robust_energy_conditions/v1",
      generatedAt: "2026-06-19T00:00:00.000Z",
      laneId: "nhm2_shift_lapse",
      selectedProfileId:
        "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1",
      tensorRef: "source.json",
      observerFamilies: [
        {
          familyId: "boosted_timelike_grid",
          status: "pass",
          sampleCount: 16,
          worstCase: {
            condition: "WEC",
            value: 1,
          },
          blockers: [],
        },
        {
          familyId: "algebraic_type_i",
          status: "pass",
          sampleCount: 4,
          worstCase: {
            condition: "DEC",
            value: 1,
          },
          blockers: [],
        },
        {
          familyId: "continuous_optimizer",
          status: "not_run",
          optimizerUsed: false,
          blockers: ["continuous_optimizer_not_implemented"],
        },
      ],
      summary: {
        eulerianOnly: false,
        robustCheckComplete: true,
        anyViolation: false,
        missedViolationRisk: "medium",
      },
      literatureRefs: [
        "le_2026_observer_robust_warp_energy_conditions",
        "santiago_schuster_visser_2021_generic_warp_nec",
      ],
      claimBoundary: {
        diagnosticOnly: true,
        friendlyObserverCannotProveWec: true,
      },
    };
    const dir = mkdtempSync(join(tmpdir(), "nhm2-run-manifest-"));
    const candidateId =
      "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";
    const runRoot = join(dir, "runs", candidateId);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(
      join(dir, "profile-search.json"),
      `${JSON.stringify(search, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(runRoot, "nhm2-observer-robust-energy-conditions.json"),
      `${JSON.stringify(observerArtifact, null, 2)}\n`,
      "utf8",
    );

    const manifest = publishNhm2CampaignProfileRunManifest({
      repoRoot: dir,
      profileSearchPath: "profile-search.json",
      outPath: "manifest.json",
      runRootBase: "runs",
      auditOnly: true,
    });
    const observer = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "observer_family_energy_conditions",
    );

    expect(observer?.status).toBe("provided");
    expect(observer?.blockers).toEqual([]);
  });

  it("marks QEI worldline evidence as blocked when nested worldline margins fail", () => {
    const targets = buildNhm2MetricMomentumRemediationTargets({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricRequiredMomentumDemandAudit: demandAudit(),
      metricRequiredMomentumDemandAuditRef: "demand-audit.json",
    });
    const search = buildNhm2CampaignProfileSearch({
      generatedAt: "2026-06-19T00:00:00.000Z",
      metricMomentumRemediationTargets: targets,
      candidateSpecs: [
        {
          alphaCenterline: 0.9,
          proposalKind: "combined_metric_redesign",
          projectedT0iSuppressionFactor: 20,
        },
      ],
    });
    const qeiArtifact: Nhm2QeiWorldlineDossierV1 = {
      contractVersion: "nhm2_qei_worldline_dossier/v1",
      generatedAt: "2026-06-19T00:00:00.000Z",
      laneId: "nhm2_shift_lapse",
      selectedProfileId:
        "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1",
      worldlines: [
        {
          worldlineId: "qei:wall:atlas",
          regionId: "wall",
          chartId: "comoving_cartesian",
          samplingFunction: {
            kind: "lorentzian",
            tauSeconds: 1e-10,
            normalized: true,
          },
          sampledRho: {
            valueSI: 0.05,
            status: "computed",
          },
          bound: {
            valueSI: 0,
            status: "literature_bound",
          },
          margin: {
            valueSI: -0.05,
            pass: false,
          },
          consistency: {
            tauVsDuty: "pass",
            tauVsLightCrossing: "pass",
            tauVsModulation: "pass",
          },
          blockers: ["qei_margin_failed"],
        },
      ],
      summary: {
        hasWallWorldline: true,
        allMarginsPass: false,
        anyProxy: false,
        dossierComplete: false,
      },
      literatureRefs: ["ford_roman_1996_quantum_inequality"],
      claimBoundary: {
        diagnosticOnly: true,
        scalarMarginCannotSubstituteForDossier: true,
      },
    };
    const dir = mkdtempSync(join(tmpdir(), "nhm2-run-manifest-"));
    const candidateId =
      "stage1_centerline_alpha_0p9000_combined_metric_redesign_campaign_screen_v1";
    const runRoot = join(dir, "runs", candidateId);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(
      join(dir, "profile-search.json"),
      `${JSON.stringify(search, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(runRoot, "nhm2-qei-worldline-dossier.json"),
      `${JSON.stringify(qeiArtifact, null, 2)}\n`,
      "utf8",
    );

    const manifest = publishNhm2CampaignProfileRunManifest({
      repoRoot: dir,
      profileSearchPath: "profile-search.json",
      outPath: "manifest.json",
      runRootBase: "runs",
      auditOnly: true,
    });
    const qei = manifest.candidates[0]?.requiredEvidence.find(
      (entry) => entry.evidenceId === "qei_worldline_dossier",
    );

    expect(qei?.status).toBe("provided_blocked");
    expect(qei?.blockers).toEqual(
      expect.arrayContaining([
        "qei_worldline_dossier_incomplete",
        "qei_margin_not_pass",
        "qei:wall:atlas:qei_margin_failed",
      ]),
    );
    expect(manifest.summary.firstBlocker).toBe(
      "candidate_metric_profile_spec_missing_for_frozen_campaign_run",
    );
  });
});
