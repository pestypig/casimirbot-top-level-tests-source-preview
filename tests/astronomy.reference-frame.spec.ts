import { describe, expect, it } from "vitest";
import { buildAstronomyFrameLayer } from "../server/modules/astronomy/reference-frames";

describe("astronomy reference-frame layer", () => {
  it("declares the hidden inertial scaffold and keeps anchors hidden", () => {
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

    expect(layer.contractVersion).toBe("astronomy_frame_layer/v1");
    expect(layer.canonical_frame_id).toBe("ICRS");
    expect(layer.render_frame_id).toBe("sol_centered_accordion_render");
    expect(layer.hidden_anchor_count).toBeGreaterThan(0);
    expect(layer.nodes.some((node) => node.id === "frame:ICRS")).toBe(true);
    expect(layer.nodes.some((node) => node.id === "frame:ICRF3_radio")).toBe(true);
    expect(layer.nodes.some((node) => node.id === "frame:Gaia_CRF3_optical")).toBe(true);
    expect(layer.nodes.some((node) => node.kind === "anchor" && node.hidden === true)).toBe(true);
  });
});
