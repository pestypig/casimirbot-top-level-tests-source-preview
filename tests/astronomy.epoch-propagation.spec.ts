import { describe, expect, it } from "vitest";
import { propagateAstronomyCatalogEntry } from "../server/modules/astronomy/epoch-propagation";

describe("astronomy epoch propagation", () => {
  it("propagates nearby stars away from the reference epoch", () => {
    const source = propagateAstronomyCatalogEntry(
      {
        id: "alpha-cen-a",
        frame_id: "ICRS",
        frame_realization: "Gaia_CRF3",
        reference_epoch_tcb_jy: 2016.0,
        time_scale: "TCB",
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
      2016.0,
    );
    const propagated = propagateAstronomyCatalogEntry(
      {
        id: "alpha-cen-a",
        frame_id: "ICRS",
        frame_realization: "Gaia_CRF3",
        reference_epoch_tcb_jy: 2016.0,
        time_scale: "TCB",
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
      2026.0,
    );

    expect(propagated.propagation_applied).toBe(true);
    expect(propagated.dynamic_state).toBe("propagated_star");
    expect(propagated.canonical_position_m).not.toEqual(source.canonical_position_m);
  });

  it("keeps hidden extragalactic anchors effectively static", () => {
    const anchor = propagateAstronomyCatalogEntry(
      {
        id: "3C273",
        frame_id: "ICRF3_radio",
        frame_realization: "ICRF3_S/X",
        reference_epoch_tcb_jy: 2016.0,
        time_scale: "TCB",
        provenance_class: "observed",
        astrometry: {
          ra_deg: 187.2779,
          dec_deg: 2.0524,
        },
      },
      2026.0,
      { hiddenAnchor: true },
    );

    expect(anchor.propagation_applied).toBe(false);
    expect(anchor.dynamic_state).toBe("static_anchor");
    expect(anchor.propagation_limitations).toEqual([]);
  });

  it("surfaces missing radial velocity as a propagation limitation", () => {
    const propagated = propagateAstronomyCatalogEntry(
      {
        id: "epsilon-eridani",
        frame_id: "ICRS",
        frame_realization: "Gaia_CRF3",
        reference_epoch_tcb_jy: 2016.0,
        time_scale: "TCB",
        provenance_class: "observed",
        astrometry: {
          ra_deg: 53.232,
          dec_deg: -9.458,
          parallax_mas: 310.94,
          proper_motion_ra_masyr: -975.17,
          proper_motion_dec_masyr: 19.49,
        },
      },
      2026.0,
    );

    expect(propagated.propagation_limitations).toContain(
      "radial_velocity_missing_perspective_acceleration_ignored",
    );
  });
});
