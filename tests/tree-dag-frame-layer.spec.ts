import { describe, expect, it } from "vitest";
import { buildAstronomyFrameLayer } from "../server/modules/astronomy/reference-frames";

describe("Tree + DAG frame layer", () => {
  it("emits distinct frame realization, propagation, render-transform, and anchor edges", () => {
    const layer = buildAstronomyFrameLayer({
      catalog: [
        {
          id: "alpha-cen-a",
          label: "Alpha Centauri A",
          frame_id: "ICRS",
          frame_realization: "Gaia_CRF3",
          reference_epoch_tcb_jy: 2016.0,
          time_scale: "TCB",
          provenance_class: "observed",
          position_m: [1, 0, 0],
        },
      ],
      propagatedIds: ["alpha-cen-a"],
    });

    const edgeTypes = new Set(layer.edges.map((edge) => edge.type));
    expect(edgeTypes.has("realizes_frame")).toBe(true);
    expect(edgeTypes.has("epoch_propagates_to")).toBe(true);
    expect(edgeTypes.has("transforms_to_render")).toBe(true);
    expect(edgeTypes.has("anchored_by")).toBe(true);
  });
});
