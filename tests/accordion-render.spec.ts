import fs from "node:fs";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { helixRelativisticMapRouter } from "../server/routes/helix/relativistic-map";
import { buildObservableUniverseAccordionEtaProjection } from "../shared/observable-universe-accordion-projections";
import { OBSERVABLE_UNIVERSE_NHM2_ETA_POLICY } from "../shared/observable-universe-accordion-projections-constants";
import { buildObservableUniverseAccordionEtaSurface } from "../shared/observable-universe-accordion-surfaces";

const readJson = (relativePath: string): unknown =>
  JSON.parse(fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8"));

const loadProjection = () => {
  const projection = buildObservableUniverseAccordionEtaProjection({
    boundaryArtifact: readJson(
      OBSERVABLE_UNIVERSE_NHM2_ETA_POLICY.sourceBoundaryArtifactPath,
    ),
    defaultMissionTimeComparison: readJson(
      OBSERVABLE_UNIVERSE_NHM2_ETA_POLICY.sourceDefaultMissionTimeComparisonArtifactPath,
    ),
    supportedFloorMissionTimeComparison: readJson(
      OBSERVABLE_UNIVERSE_NHM2_ETA_POLICY.sourceSupportedFloorMissionTimeComparisonArtifactPath,
    ),
    supportedBandCeilingReferenceMissionTimeComparison: readJson(
      OBSERVABLE_UNIVERSE_NHM2_ETA_POLICY.sourceSupportedBandCeilingReferenceArtifactPath,
    ),
    evidenceFloorMissionTimeComparison: readJson(
      OBSERVABLE_UNIVERSE_NHM2_ETA_POLICY.sourceEvidenceFloorMissionTimeComparisonArtifactPath,
    ),
  });
  if (!projection) throw new Error("expected projection");
  return projection;
};

describe("accordion render frame metadata", () => {
  it("preserves direction while remapping only radius", () => {
    const projection = loadProjection();
    const surface = buildObservableUniverseAccordionEtaSurface({
      contract: projection,
      catalog: [
        {
          id: "alpha-cen-a",
          position_m: [3, 4, 0],
          canonical_position_m: [3, 4, 0],
          provenance_class: "observed",
          source_epoch_tcb_jy: 2016.0,
          render_epoch_tcb_jy: 2026.0,
          frame_id: "ICRS",
          frame_realization: "Gaia_CRF3",
          dynamic_state: "propagated_star",
          render_transform_id: "accordion_direction_preserving_radius_remap_v1",
          propagation_limitations: [],
        },
      ],
      estimateKind: "proper_time",
      canonicalFrameId: "ICRS",
      canonicalFrameRealization: "Gaia_CRF3",
      renderEpoch_tcb_jy: 2026.0,
      propagationApplied: true,
      hiddenAnchorCount: 3,
      hiddenAnchorsUsed: true,
    });

    expect(surface.status).toBe("computed");
    if (surface.status !== "computed") return;
    expect(surface.canonicalFrame.id).toBe("ICRS");
    expect(surface.renderFrame.id).toBe("sol_centered_accordion_render");
    expect(surface.propagationApplied).toBe(true);
    expect(surface.hiddenAnchorCount).toBe(3);
    expect(surface.entries[0].outputPosition_m[0] / surface.entries[0].mappedRadius_m).toBeCloseTo(0.6, 10);
    expect(surface.entries[0].outputPosition_m[1] / surface.entries[0].mappedRadius_m).toBeCloseTo(0.8, 10);
  });

  it("keeps hidden anchors out of the visible route targets while exposing frame metadata", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/helix/relativistic-map", helixRelativisticMapRouter);

    const res = await request(app)
      .post("/api/helix/relativistic-map/project")
      .send({
        projectionKind: "sun_centered_accessibility",
        sourceModel: "warp_worldline_route_time",
        etaMode: "proper_time",
        renderEpoch_tcb_jy: 2026.0,
        catalog: [
          {
            id: "alpha-cen-a",
            label: "Alpha Centauri A",
            reference_epoch_tcb_jy: 2016.0,
            frame_id: "ICRS",
            frame_realization: "Gaia_CRF3",
            provenance_class: "observed",
            astrometry: {
              ra_deg: 219.9,
              dec_deg: -60.8,
              parallax_mas: 747.17,
              proper_motion_ra_masyr: -3679.25,
              proper_motion_dec_masyr: 473.67,
              radial_velocity_kms: -22.4,
            },
          },
        ],
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.projection.hiddenAnchorCount).toBeGreaterThan(0);
    expect(res.body.projection.entries).toHaveLength(1);
    expect(res.body.projection.entries[0].frame_id).toBe("ICRS");
    expect(res.body.projection.entries[0].dynamic_state).toBe("propagated_star");
    expect(res.body.projection.frameLayer.nodes.some((node: any) => node.kind === "anchor" && node.hidden === true)).toBe(true);
  });
});
