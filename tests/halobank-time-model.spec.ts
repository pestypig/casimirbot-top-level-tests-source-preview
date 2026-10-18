import { describe, expect, it } from "vitest";
import { computeHaloBankTimeModel } from "../server/services/halobank/time-model";

describe("halobank time model", () => {
  it("computes deterministic state for same input", () => {
    const input = {
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006, label: "NYC" },
      durationMs: 60_000,
    };
    const a = computeHaloBankTimeModel(input);
    const b = computeHaloBankTimeModel(input);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a).toEqual(b);
  });

  it("computes duration-weighted exposure deltas", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 0, lon: 0 },
      durationMs: 60_000,
      compare: {
        timestamp: "2025-03-01T12:00:00.000Z",
        place: { lat: 0, lon: 0 },
        durationMs: 120_000,
      },
    });

    expect(result.ok).toBe(true);
    const deltas = result.comparison?.deltas;
    expect(deltas).toBeDefined();
    expect(deltas?.dDuration_s).toBeCloseTo(60, 8);
    expect(deltas?.dGravExposure_ns).toBeCloseTo((result.primary?.voxel.grav_ns_per_1s ?? 0) * 60, 6);
    expect(deltas?.dKinExposure_ns).toBeCloseTo((result.primary?.voxel.kin_ns_per_1s ?? 0) * 60, 6);
    expect(deltas?.dCombExposure_ns).toBeCloseTo((result.primary?.voxel.combined_ns_per_1s ?? 0) * 60, 6);
  });

  it("marks declared live ephemeris as unverified without explicit evidence", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: { orbitalAlignment: true, ephemerisSource: "live" },
    });
    expect(result.ok).toBe(true);
    expect(result.ephemeris?.requested).toBe(true);
    expect(result.ephemeris?.source).toBe("live");
    expect(result.ephemeris?.provenance.claim_tier).toBe("diagnostic");
    expect(result.ephemeris?.provenance.certifying).toBe(false);
    expect(result.ephemeris?.provenance.evidence.declaredSourceClass).toBe("live");
    expect(result.ephemeris?.provenance.evidence.verified).toBe(false);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_RESIDUAL_EVIDENCE_INCOMPLETE");
    expect(result.ephemeris?.consistency.deterministic).toBe(true);
  });


  it("returns PASS for live ephemeris only with explicit verification evidence", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:2025-03-01T12:00:00Z",
        residualPpm: 1.75,
        residualSampleCount: 9,
        residualWindowHours: 72,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("PASS");
    expect(result.ephemeris?.consistency.firstFailId).toBeNull();
    expect(result.ephemeris?.provenance.evidence.verified).toBe(true);
    expect(result.ephemeris?.provenance.evidence.reference).toContain("artifact:jpl-horizons");
    expect(result.ephemeris?.provenance.evidence.residualStatus).toBe("within_envelope");
    expect(result.ephemeris?.provenance.claim_tier_recommendation).toBe("reduced-order");
  });


  it("returns FAIL when residual evidence is out of bounded envelope", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:2025-03-01T12:00:00Z",
        residualPpm: 9.25,
        residualSampleCount: 12,
        residualWindowHours: 72,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_RESIDUAL_DRIFT_OUT_OF_ENVELOPE");
    expect(result.ephemeris?.provenance.evidence.residualStatus).toBe("out_of_envelope");
    expect(result.ephemeris?.provenance.claim_tier_recommendation).toBe("diagnostic");
  });

  it("keeps conservative diagnostic downgrade when residual evidence is incomplete", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:2025-03-01T12:00:00Z",
        residualPpm: 2.2,
        residualSampleCount: 2,
        residualWindowHours: 72,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_RESIDUAL_EVIDENCE_INCOMPLETE");
    expect(result.ephemeris?.provenance.evidence.residualStatus).toBe("incomplete_evidence");
    expect(result.ephemeris?.provenance.claim_tier_recommendation).toBe("diagnostic");
  });


  it("fails deterministically when evidence reference is non-canonical", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "jpl-horizons-run-123",
        residualPpm: 0.8,
        residualSampleCount: 7,
        residualWindowHours: 72,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_EVIDENCE_REF_INVALID");
    expect(result.ephemeris?.provenance.claim_tier_recommendation).toBe("diagnostic");
  });

  it("fails deterministically when residual sample count is non-integer", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:run-123",
        residualPpm: 0.8,
        residualSampleCount: 7.5,
        residualWindowHours: 72,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_NONDETERMINISTIC_RESIDUAL_INPUT");
    expect(result.ephemeris?.provenance.evidence.residualStatus).toBe("incomplete_evidence");
  });





  it("fails deterministically when residual calibration window is non-integer", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:run-123",
        residualPpm: 0.8,
        residualSampleCount: 7,
        residualWindowHours: 72.5,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_NONDETERMINISTIC_RESIDUAL_INPUT");
    expect(result.ephemeris?.provenance.evidence.residualWindowStatus).toBe("incomplete_evidence");
  });

  it("fails deterministically when residual calibration window is shorter than long-window minimum", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:2025-03-01T12:00:00Z",
        residualPpm: 0.8,
        residualSampleCount: 9,
        residualWindowHours: 12,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_LONG_WINDOW_REQUIRED");
    expect(result.ephemeris?.provenance.evidence.residualWindowStatus).toBe("short_window");
    expect(result.ephemeris?.provenance.claim_tier_recommendation).toBe("diagnostic");
  });

  it("passes when long-window residual calibration evidence is complete and bounded", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:2025-03-01T12:00:00Z",
        residualPpm: 0.8,
        residualSampleCount: 9,
        residualWindowHours: 72,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("PASS");
    expect(result.ephemeris?.consistency.firstFailId).toBeNull();
    expect(result.ephemeris?.provenance.evidence.residualWindowStatus).toBe("long_window");
    expect(result.ephemeris?.provenance.evidence.residualLongWindowMinHours).toBe(24);
  });

  it("marks fallback ephemeris as diagnostic non-certifying with deterministic fail id", () => {
    const result = computeHaloBankTimeModel({
      timestamp: "2025-03-01T12:00:00.000Z",
      place: { lat: 40.7128, lon: -74.006 },
      model: { orbitalAlignment: true, ephemerisSource: "fallback" },
    });
    expect(result.ok).toBe(true);
    expect(result.ephemeris?.source).toBe("fallback");
    expect(result.ephemeris?.provenance.claim_tier).toBe("diagnostic");
    expect(result.ephemeris?.provenance.certifying).toBe(false);
    expect(result.ephemeris?.provenance.note.toLowerCase()).toContain("non-certifying");
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_FALLBACK_DIAGNOSTIC_ONLY");
    expect(result.ephemeris?.consistency.deterministic).toBe(true);
  });

  it("returns actionable validation when parsing is insufficient", () => {
    const result = computeHaloBankTimeModel({ question: "what are the tides" });
    expect(result.ok).toBe(false);
    expect(result.message?.toLowerCase()).toContain("validation");
  });
});
