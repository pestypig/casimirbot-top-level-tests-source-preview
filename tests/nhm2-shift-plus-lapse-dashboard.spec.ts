import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildShiftPlusLapseDashboardPayload,
  buildSourceMechanismConsumerConformanceSummary,
} from "../scripts/warp-shift-plus-lapse-dashboard";

const findPanel = (payload: any, panelId: string) =>
  payload.panels?.find((panel: any) => panel.panelId === panelId);

const findRow = (panel: any, rowId: string) =>
  panel?.rows?.find((row: any) => row.rowId === rowId);

const findGraphBlock = (payload: any, graphId: string) =>
  payload.graphSeriesBlocks?.find((graph: any) => graph.graphId === graphId);

describe("nhm2 shift-plus-lapse dashboard companion", () => {
  let payload: any;

  beforeAll(async () => {
    payload = await buildShiftPlusLapseDashboardPayload();
  }, 30000);

  it("builds all required dashboard panel groups", () => {
    expect(payload).toEqual(
      expect.objectContaining({
        artifactId: "nhm2_shift_plus_lapse_dashboard",
        dashboardId: "nhm2_unit_lapse_vs_mild_shift_plus_lapse_dashboard",
        dashboardStatus: "available",
        comparisonId: "nhm2_unit_lapse_vs_mild_shift_plus_lapse",
      }),
    );
    expect(payload.recommendedReadingOrder).toEqual([
      "proof_status_panel",
      "cabin_gravity_panel",
      "wall_safety_panel",
      "precision_panel",
    ]);
    expect(findPanel(payload, "proof_status_panel")).toBeTruthy();
    expect(findPanel(payload, "cabin_gravity_panel")).toBeTruthy();
    expect(findPanel(payload, "wall_safety_panel")).toBeTruthy();
    expect(findPanel(payload, "precision_panel")).toBeTruthy();
    expect(payload.renderedCardReadingOrder).toEqual([
      "dashboard_overview",
      "proof_status",
      "cabin_gravity",
      "wall_safety",
      "precision_provenance",
    ]);
    expect(payload.graphReadingOrder).toEqual([
      "cabin_gravity_profile_z",
      "clock_gradient_profile_z",
    ]);
  });

  it("keeps every visible metric row units-and-badge explicit", () => {
    const cabinPanel = findPanel(payload, "cabin_gravity_panel");
    const wallPanel = findPanel(payload, "wall_safety_panel");
    const rows = [...(cabinPanel?.rows ?? []), ...(wallPanel?.rows ?? [])];

    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(row).toEqual(
        expect.objectContaining({
          label: expect.any(String),
          units: expect.any(String),
          badgeId: expect.any(String),
          badgeIds: expect.any(Array),
          baselineSourceKind: expect.any(String),
          generalizedSourceKind: expect.any(String),
        }),
      );
    }

    expect(findRow(cabinPanel, "alphaGradientVec_m_inv")).toEqual(
      expect.objectContaining({
        units: "1/m",
        badgeId: "mixed_source",
        crossCaseSourceMismatch: true,
      }),
    );
    expect(findRow(wallPanel, "betaOutwardOverAlphaWallMax")).toEqual(
      expect.objectContaining({
        units: "dimensionless",
        badgeId: "wall_safety_brick_derived",
        crossCaseSourceMismatch: false,
      }),
    );
  });

  it("keeps proof status explicit and separate from cabin and wall diagnostics", () => {
    const proofPanel = findPanel(payload, "proof_status_panel");
    const cabinPanel = findPanel(payload, "cabin_gravity_panel");
    const wallPanel = findPanel(payload, "wall_safety_panel");
    const proofSurfaceRow = findRow(proofPanel, "authoritative_proof_surface");
    const familyStatusRow = findRow(proofPanel, "generalized_family_status");
    const transportStatusRow = findRow(
      proofPanel,
      "generalized_transport_status",
    );

    expect(proofPanel.sectionNote).toContain("Lane A remains authoritative");
    expect(proofPanel.sectionNote).toContain(
      "candidate authoritative solve family",
    );
    expect(proofPanel.sectionNote).toContain("transport-promotion gate");
    expect(proofPanel.sectionNote).toContain("not claimed by this dashboard");
    expect(proofPanel.sectionNote).toContain("bounded non-authoritative advisory only");
    expect(proofSurfaceRow).toEqual(
      expect.objectContaining({
        badgeId: "lane_a_unchanged",
        generalizedValue: "lane_a_eulerian_comoving_theta_minus_trk",
      }),
    );
    expect(familyStatusRow).toEqual(
      expect.objectContaining({
        badgeId: "lane_a_unchanged",
        generalizedValue: "candidate_authoritative_solve_family",
      }),
    );
    expect(transportStatusRow).toEqual(
      expect.objectContaining({
        badgeId: "reference_only",
        generalizedValue: "bounded_transport_fail_closed_reference_only",
      }),
    );
    expect(cabinPanel.sectionNote).toContain("local lapse diagnostics");
    expect(wallPanel.sectionNote).toContain("brick-derived");
  });

  it("serializes bounded source/mechanism route boundaries into the dashboard payload", () => {
    expect(payload.sourceMechanismPromotionContractStatus).toBe(
      "active_for_bounded_claims_only",
    );
    expect(payload.sourceMechanismSelectedPromotionRoute).toBe(
      "formal_exemption_route",
    );
    expect(payload.sourceMechanismExemptionRouteActivated).toBe(true);
    expect(payload.sourceMechanismNonAuthoritative).toBe(true);
    expect(payload.sourceMechanismFormulaEquivalent).toBe(false);
    expect(payload.sourceMechanismParityRouteStatus).toBe(
      "blocked_by_derivation_class_difference",
    );
    expect(payload.sourceMechanismActiveClaimSet).toEqual([
      "bounded_non_authoritative_source_annotation",
      "bounded_non_authoritative_mechanism_context",
      "bounded_non_authoritative_reduced_order_comparison",
    ]);
    expect(payload.sourceMechanismBlockedClaimSet).toEqual(
      expect.arrayContaining([
        "formula_equivalent_to_authoritative_direct_metric",
        "source_mechanism_layer_supports_viability_promotion",
        "cross_lane_promotion_beyond_reference_only_scope",
      ]),
    );
    expect(payload.sourceMechanismForbiddenPromotions).toEqual(
      expect.arrayContaining([
        "formula_equivalent_to_authoritative_direct_metric",
        "nhm2_shift_lapse_proof_promotion",
      ]),
    );
    expect(payload.sourceMechanismReferenceOnlyScope).toBe(true);
    expect(payload.generalizedFamilyAuthorityStatus).toBe(
      "candidate_authoritative_solve_family",
    );
    expect(payload.generalizedTransportCertificationStatus).toBe(
      "bounded_transport_fail_closed_reference_only",
    );
    expect(payload.sourceMechanismConsumerSummary).toContain(
      "candidate authoritative solve family",
    );
    expect(payload.sourceMechanismConsumerSummary).toContain(
      "transport-promotion gate",
    );
  });

  it("carries provenance warnings and comparison semantics through unchanged", () => {
    const precisionPanel = findPanel(payload, "precision_panel");
    const mismatchRow = findRow(precisionPanel, "crossCaseSourceMismatchCount");
    const parityRow = findRow(precisionPanel, "wallSafetySourceParity");

    expect(payload.provenanceWarnings).toHaveLength(5);
    expect(payload.comparisonSemantics).toEqual(
      expect.objectContaining({
        crossCaseSourceMismatchCount: 5,
        wallSafetySourceParity: true,
        cabinGravityUsesAnalyticCompanion: true,
      }),
    );
    expect(mismatchRow).toEqual(
      expect.objectContaining({
        generalizedValue: 5,
        badgeId: "source_mismatch",
      }),
    );
    expect(parityRow).toEqual(
      expect.objectContaining({
        badgeId: "wall_safety_brick_derived",
        generalizedValue: "brick_float32_direct",
      }),
    );
  });

  it("serializes provenance-aware graph source blocks for local cabin gravity and clock gradient", () => {
    const gravityGraph = findGraphBlock(payload, "cabin_gravity_profile_z");
    const clockGraph = findGraphBlock(payload, "clock_gradient_profile_z");

    expect(payload.graphRenderStatus).toBe("generated");
    expect(gravityGraph).toEqual(
      expect.objectContaining({
        graphId: "cabin_gravity_profile_z",
        quantitySymbol: "g_local(z)",
        quantityUnits: "m/s^2",
        sampleAxis: "z_zenith",
        sampleAxisLabel: "Cabin z_zenith offset (m)",
        sampleCount: 9,
        baselineSourceKind: "brick_float32_direct",
        generalizedSourceKind: "analytic_lapse_summary_companion",
        underResolutionDetected: true,
      }),
    );
    expect(gravityGraph.sampleDomain).toHaveLength(gravityGraph.sampleCount);
    expect(gravityGraph.baselineSeries).toHaveLength(gravityGraph.sampleCount);
    expect(gravityGraph.generalizedSeries).toHaveLength(gravityGraph.sampleCount);
    expect(gravityGraph.baselineBadgeIds).toContain("raw_brick");
    expect(gravityGraph.generalizedBadgeIds).toContain("analytic_companion");
    expect(gravityGraph.sharedBadgeIds).toEqual(
      expect.arrayContaining(["mixed_source", "source_mismatch"]),
    );
    expect(gravityGraph.graphNote).toContain("Presentation-only graph");

    expect(clockGraph).toEqual(
      expect.objectContaining({
        graphId: "clock_gradient_profile_z",
        quantitySymbol: "delta_tau_per_day(z)",
        quantityUnits: "s/day",
        sampleAxis: "z_zenith",
        sampleCount: 9,
        baselineSourceKind: "brick_float32_direct",
        generalizedSourceKind: "analytic_lapse_summary_companion",
        underResolutionDetected: true,
      }),
    );
    expect(clockGraph.sampleDomain).toHaveLength(clockGraph.sampleCount);
    expect(clockGraph.baselineSeries).toHaveLength(clockGraph.sampleCount);
    expect(clockGraph.generalizedSeries).toHaveLength(clockGraph.sampleCount);
    expect(clockGraph.baselineBadgeIds).toContain("raw_brick");
    expect(clockGraph.generalizedBadgeIds).toContain("analytic_companion");
    expect(clockGraph.sharedBadgeIds).toEqual(
      expect.arrayContaining(["mixed_source", "source_mismatch"]),
    );
    expect(clockGraph.graphNote).toContain("not route-time compression");
  });

  it("emits a rendered card family with the overview card as primary", () => {
    const artifactPath = path.join(
      process.cwd(),
      "artifacts",
      "research",
      "full-solve",
      "nhm2-shift-plus-lapse-dashboard-latest.json",
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const proofPanel = findPanel(artifact, "proof_status_panel");
    const precisionPanel = findPanel(artifact, "precision_panel");

    expect(artifact.dashboardStatus).toBe("available");
    expect(artifact.dashboardLayoutVersion).toBe("v2_measured_card_family");
    expect(artifact.renderedCardFamilyStatus).toBe("generated");
    expect(artifact.primaryRenderedCardId).toBe("dashboard_overview");
    expect(artifact.renderedCardStatus).toBe("generated_primary_overview");
    expect(artifact.renderedCardPath).toBe(
      "artifacts/research/full-solve/rendered/comparison_panel/2026-04-01/nhm2_shift_lapse-comparison_panel-dashboard_overview-card.png",
    );
    expect(artifact.renderedCardHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.renderedCardCategory).toBe("comparison_panel");
    expect(artifact.renderedCardRole).toBe("presentation");
    expect(artifact.renderedCardLayoutVersion).toBe("v2_measured_card_family");
    expect(artifact.graphRenderStatus).toBe("generated");
    expect(artifact.layoutBudget).toEqual(
      expect.objectContaining({
        dynamicCardHeight: true,
        measuredTextRenderer: "@napi-rs/canvas.measureText",
      }),
    );
    expect(artifact.badgeLegend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ badgeId: "lane_a_unchanged" }),
        expect.objectContaining({ badgeId: "reference_only" }),
        expect.objectContaining({ badgeId: "raw_brick" }),
        expect.objectContaining({ badgeId: "analytic_companion" }),
        expect.objectContaining({ badgeId: "mixed_source" }),
        expect.objectContaining({ badgeId: "source_mismatch" }),
        expect.objectContaining({ badgeId: "wall_safety_brick_derived" }),
        expect.objectContaining({ badgeId: "unresolved" }),
      ]),
    );
    expect(findRow(proofPanel, "generalized_transport_status")).toEqual(
      expect.objectContaining({
        badgeId: "reference_only",
      }),
    );
    expect(
      findRow(precisionPanel, "baselineDirectPipelineNestedProvenance"),
    ).toEqual(
      expect.objectContaining({
        baselineValue: "unresolved_gravity_gradient",
        badgeId: "unresolved",
      }),
    );
    expect(artifact.renderedCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: "dashboard_overview",
          sectionSource: "dashboard_summary",
          primary: true,
        }),
        expect.objectContaining({
          cardId: "proof_status",
          sectionSource: "proof_status_panel",
          primary: false,
        }),
        expect.objectContaining({
          cardId: "cabin_gravity",
          sectionSource: "cabin_gravity_panel",
          primary: false,
        }),
        expect.objectContaining({
          cardId: "wall_safety",
          sectionSource: "wall_safety_panel",
          primary: false,
        }),
        expect.objectContaining({
          cardId: "precision_provenance",
          sectionSource: "precision_panel",
          primary: false,
        }),
      ]),
    );
    expect(artifact.graphRenders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          graphId: "cabin_gravity_profile_z",
          sourcePanel: "cabin_gravity_panel",
          sourceSeriesBlock: "cabin_gravity_profile_z",
          authoritativeStatus: "non_authoritative",
        }),
        expect.objectContaining({
          graphId: "clock_gradient_profile_z",
          sourcePanel: "cabin_gravity_panel",
          sourceSeriesBlock: "clock_gradient_profile_z",
          authoritativeStatus: "non_authoritative",
        }),
      ]),
    );
    for (const card of artifact.renderedCards) {
      expect(card.hash).toMatch(/^[a-f0-9]{64}$/);
      const cardPath = path.join(process.cwd(), card.path);
      expect(fs.existsSync(cardPath)).toBe(true);
      expect(fs.statSync(cardPath).size).toBeGreaterThan(0);
    }
    for (const graph of artifact.graphRenders) {
      expect(graph.hash).toMatch(/^[a-f0-9]{64}$/);
      const graphPath = path.join(process.cwd(), graph.path);
      expect(fs.existsSync(graphPath)).toBe(true);
      expect(fs.statSync(graphPath).size).toBeGreaterThan(0);
    }
    expect(artifact.legacyMonolithicCardStatus).toBe("deprecated_not_generated");
    expect(artifact.sourceMechanismConsumerConformance).toEqual(
      expect.objectContaining({
        consumerConformanceStatus: "conformant",
        conformanceDataMode: "artifact_coupled",
        stalenessRisk: "possible_latest_artifact_drift",
        referenceOnlyScopePreserved: true,
        laneAAuthorityPreserved: true,
      }),
    );
    expect(artifact.sourceMechanismConsumerConformance.referenceOnlyMissingOnSurfaces).toEqual(
      [],
    );
    expect(artifact.sourceMechanismConsumerConformance.laneAAuthorityMissingOnSurfaces).toEqual(
      [],
    );
    expect(artifact.sourceMechanismConsumerConformance.checkedSurfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surfaceId: "proof_pack_alias_json",
          status: "conformant",
          inspectionMode: "direct_content",
          dataMode: "artifact_coupled",
          laneAAuthorityPresent: true,
        }),
        expect.objectContaining({
          surfaceId: "shift_plus_lapse_dashboard_json",
          status: "conformant",
          inspectionMode: "direct_content",
          dataMode: "artifact_coupled",
          laneAAuthorityPresent: true,
        }),
        expect.objectContaining({
          surfaceId: "shift_plus_lapse_dashboard_cards",
          surfaceType: "rendered_card_family",
          inspectionMode: "pre_raster_render_source",
          dataMode: "artifact_coupled",
          laneAAuthorityPresent: true,
          referenceOnlyPresent: true,
          checkedTargets: [
            "dashboard_overview",
            "proof_status",
            "precision_provenance",
          ],
        }),
        expect.objectContaining({
          surfaceId: "shift_plus_lapse_dashboard_graphs",
          surfaceType: "rendered_graph_family",
          inspectionMode: "pre_raster_render_source",
          dataMode: "artifact_coupled",
          laneAAuthorityPresent: true,
          referenceOnlyPresent: true,
          checkedTargets: [
            "cabin_gravity_profile_z",
            "clock_gradient_profile_z",
          ],
        }),
      ]),
    );
    const legacyCardPath = path.join(process.cwd(), artifact.legacyMonolithicCardPath);
    expect(fs.existsSync(legacyCardPath)).toBe(false);
  });

  it("writes a consumer-conformance artifact that confirms proof-pack and dashboard bounded-route discipline", () => {
    const artifactPath = path.join(
      process.cwd(),
      "artifacts",
      "research",
      "full-solve",
      "nhm2-source-mechanism-consumer-conformance-latest.json",
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    expect(artifact.sourceMechanismConsumerConformance).toEqual(
      expect.objectContaining({
        consumerConformanceStatus: "conformant",
        conformanceDataMode: "artifact_coupled",
        stalenessRisk: "possible_latest_artifact_drift",
        referenceOnlyScopePreserved: true,
        laneAAuthorityPreserved: true,
      }),
    );
    expect(artifact.sourceMechanismConsumerConformance.activeClaimSet).toEqual([
      "bounded_non_authoritative_source_annotation",
      "bounded_non_authoritative_mechanism_context",
      "bounded_non_authoritative_reduced_order_comparison",
    ]);
    expect(artifact.sourceMechanismConsumerConformance.blockedClaimSet).toEqual(
      expect.arrayContaining([
        "formula_equivalent_to_authoritative_direct_metric",
        "source_mechanism_layer_supports_viability_promotion",
      ]),
    );
    expect(artifact.sourceMechanismConsumerConformance.nonConformantSurfaces).toEqual([]);
  });

  it("downgrades consumer conformance when checked Lane A authority markers are removed", () => {
    const proofPackArtifactPath = path.join(
      process.cwd(),
      "artifacts",
      "research",
      "full-solve",
      "warp-york-control-family-proof-pack-latest.json",
    );
    const proofPackAuditPath = path.join(
      process.cwd(),
      "docs",
      "audits",
      "research",
      "warp-york-control-family-proof-pack-latest.md",
    );
    const dashboardAuditPath = path.join(
      process.cwd(),
      "docs",
      "audits",
      "research",
      "warp-nhm2-shift-plus-lapse-dashboard-latest.md",
    );
    const proofPackArtifact = JSON.parse(fs.readFileSync(proofPackArtifactPath, "utf8"));
    const proofPackMarkdown = fs.readFileSync(proofPackAuditPath, "utf8");
    const dashboardAuditMarkdown = fs.readFileSync(dashboardAuditPath, "utf8");
    const mutatedPayload = {
      ...payload,
      panels: payload.panels.map((panel: any) =>
        panel.panelId === "proof_status_panel"
          ? {
              ...panel,
              sectionNote: panel.sectionNote.replace(
                "Lane A remains authoritative.",
                "Authority wording removed.",
              ),
            }
          : panel,
      ),
    };
    const summary = buildSourceMechanismConsumerConformanceSummary({
      dashboard: mutatedPayload,
      proofPackArtifact: {
        ...proofPackArtifact,
        sourceMechanismMaturity: {
          ...proofPackArtifact.sourceMechanismMaturity,
          laneAAuthoritative: false,
        },
      },
      proofPackMarkdown: proofPackMarkdown.replace(
        "| laneAAuthoritative | true |",
        "| laneAAuthoritative | false |",
      ),
      dashboardAuditMarkdown: dashboardAuditMarkdown.replace(
        "- proofNote: Lane A remains authoritative.",
        "- proofNote: authority wording removed.",
      ),
    });
    expect(summary.consumerConformanceStatus).toBe("non_conformant");
    expect(summary.laneAAuthorityPreserved).toBe(false);
    expect(summary.laneAAuthorityMissingOnSurfaces).toEqual(
      expect.arrayContaining([
        "proof_pack_alias_json",
        "proof_pack_audit_markdown",
        "shift_plus_lapse_dashboard_json",
        "shift_plus_lapse_dashboard_audit_markdown",
      ]),
    );
  });

  it("publishes the rendered card family into render taxonomy as comparison_panel entries without transport inheritance", () => {
    const taxonomyPath = path.join(
      process.cwd(),
      "artifacts",
      "research",
      "full-solve",
      "render-taxonomy-latest.json",
    );
    const taxonomyArtifact = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
    const entries = taxonomyArtifact.renderEntries.filter((render: any) =>
      `${render.renderId}`.startsWith(
        "nhm2_shift_lapse:comparison_panel:diagnostics_dashboard:",
      ),
    );
    expect(entries.map((entry: any) => entry.variant).sort()).toEqual([
      "cabin_gravity",
      "dashboard_overview",
      "precision_provenance",
      "proof_status",
      "wall_safety",
    ]);
    expect(entries).toHaveLength(5);
    for (const entry of entries) {
      expect(entry).toEqual(
        expect.objectContaining({
          renderCategory: "comparison_panel",
          renderRole: "presentation",
          fieldId: "diagnostics_dashboard",
          baseImagePolicy: "diagnostic_card_canvas",
          baseImageSource: "none",
          inheritsTransportContext: false,
          contextCompositionMode: "none",
        }),
      );
    }
    expect(
      taxonomyArtifact.fieldFamilies.find(
        (family: any) => family.fieldId === "diagnostics_dashboard",
      ),
    ).toEqual(
      expect.objectContaining({
        defaultCategory: "comparison_panel",
        defaultRole: "presentation",
      }),
    );
  });

  it("publishes provenance-aware graph renders into render taxonomy without transport inheritance", () => {
    const taxonomyPath = path.join(
      process.cwd(),
      "artifacts",
      "research",
      "full-solve",
      "render-taxonomy-latest.json",
    );
    const taxonomyArtifact = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
    const graphEntries = taxonomyArtifact.renderEntries.filter(
      (entry: any) =>
        String(entry.renderId).startsWith("nhm2_shift_lapse:comparison_panel:") &&
        ["cabin_gravity_profile_z", "clock_gradient_profile_z"].includes(entry.fieldId),
    );
    expect(graphEntries.map((entry: any) => entry.fieldId).sort()).toEqual([
      "cabin_gravity_profile_z",
      "clock_gradient_profile_z",
    ]);
    for (const entry of graphEntries) {
      expect(entry).toEqual(
        expect.objectContaining({
          renderCategory: "comparison_panel",
          renderRole: "presentation",
          authoritativeStatus: "non_authoritative",
          baseImagePolicy: "diagnostic_graph_canvas",
          baseImageSource: "none",
          inheritsTransportContext: false,
          contextCompositionMode: "none",
        }),
      );
    }
    expect(
      taxonomyArtifact.fieldFamilies.find(
        (family: any) => family.fieldId === "cabin_gravity_profile_z",
      ),
    ).toEqual(
      expect.objectContaining({
        defaultCategory: "comparison_panel",
        defaultRole: "presentation",
      }),
    );
    expect(
      taxonomyArtifact.fieldFamilies.find(
        (family: any) => family.fieldId === "clock_gradient_profile_z",
      ),
    ).toEqual(
      expect.objectContaining({
        defaultCategory: "comparison_panel",
        defaultRole: "presentation",
      }),
    );
  });
});
