import { describe, expect, it } from "vitest";

import { buildNhm2TileEffectiveFullTensorSourceArtifact } from "../shared/contracts/nhm2-tile-effective-full-tensor-source.v1";
import { renderTileCounterpartSourceIndependenceAudit } from "../tools/nhm2/audit-tile-counterpart-source-independence";

const profile = "stage1_centerline_alpha_0p995_v1";

describe("tile counterpart source independence audit", () => {
  it("renders source-side independence and metric-ref blockers", () => {
    const artifact = buildNhm2TileEffectiveFullTensorSourceArtifact({
      generatedAt: "2026-05-05T00:00:00.000Z",
      runId: "run-1",
      selectedProfileId: profile,
      expectedProfileId: profile,
      laneId: "nhm2_shift_lapse",
      sourceModel: {
        sourceModelId: "bad",
        sourceModelVersion: "v1",
        sourceModelClass: "metric_echo_forbidden",
        sourceSideOnly: false,
        notDerivedFromMetricRequiredTensor: false,
        metricRequiredInputRefs: ["metric.required.hull"],
        sourceInputRefs: [],
        qeiDossierRef: null,
        conservationRef: null,
      },
      regions: ["global", "hull", "wall", "exterior_shell"].map((regionId) => ({
        regionId: regionId as "global" | "hull" | "wall" | "exterior_shell",
        status: "fail" as const,
        tensorAuthorityMode: "metric_echo_forbidden" as const,
        tensor: {},
        symmetry: { declared: false, kind: "unknown" as const, lowerComponentsDerivedBySymmetry: false },
        chartRef: "comoving_cartesian",
        unitsRef: "J/m^3",
        regionMaskRef: null,
        aggregationMode: "unknown" as const,
        normalizationBasis: "unknown" as const,
        sampleCount: null,
        sourceSupport: { supportKernelId: null, cycleAverageStatus: "unknown" as const, dutyCycleStatus: "unknown" as const, lightCrossingConsistencyStatus: "unknown" as const },
        provenance: { producerModule: null, producerFunction: null, derivationMode: "metric_echo" as const, inputRefs: [], preAggregationValueRefs: [], notDerivedFromMetricRequiredTensor: false },
        blockers: [],
      })),
      literatureRefs: [],
    });
    const markdown = renderTileCounterpartSourceIndependenceAudit("source.json", artifact);
    expect(markdown).toContain("Source-side only: `false`");
    expect(markdown).toContain("metric.required.hull");
    expect(markdown).toContain("metric_echo_not_source_tensor");
    expect(markdown).not.toMatch(/NHM2 is validated|full warp solved/i);
  });
});
