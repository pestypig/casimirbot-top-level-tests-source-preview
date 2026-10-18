import { describe, expect, it } from "vitest";
import { computeHaloBankTimeModel } from "../server/services/halobank/time-model";

describe("halobank horizons consistency gate", () => {
  it("returns deterministic FAIL gate for declared live ephemeris without explicit evidence", () => {
    const result = computeHaloBankTimeModel({
      question: "orbital alignment with horizons",
      timestamp: "2025-03-01T12:00:00Z",
      place: { lat: 10, lon: 20 },
      model: { orbitalAlignment: true, ephemerisSource: "live" },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.gate).toBe("halobank.horizons.consistency.v1");
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_RESIDUAL_EVIDENCE_INCOMPLETE");
    expect(result.ephemeris?.consistency.deterministic).toBe(true);
    expect(result.ephemeris?.provenance.class).toBe("live");
    expect(result.ephemeris?.provenance.claim_tier).toBe("diagnostic");
    expect(result.ephemeris?.provenance.evidence.verified).toBe(false);
  });


  it("returns PASS gate for live ephemeris with explicit evidence marker", () => {
    const result = computeHaloBankTimeModel({
      question: "orbital alignment with horizons",
      timestamp: "2025-03-01T12:00:00Z",
      place: { lat: 10, lon: 20 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:run-123",
        residualPpm: 0.5,
        residualSampleCount: 7,
        residualWindowHours: 72,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("PASS");
    expect(result.ephemeris?.consistency.firstFailId).toBeNull();
    expect(result.ephemeris?.provenance.evidence.verified).toBe(true);
    expect(result.ephemeris?.provenance.evidence.reference).toBe("artifact:jpl-horizons:run-123");
  });



  it("returns FAIL gate when residual is outside envelope despite complete evidence", () => {
    const result = computeHaloBankTimeModel({
      question: "orbital alignment with horizons",
      timestamp: "2025-03-01T12:00:00Z",
      place: { lat: 10, lon: 20 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:run-456",
        residualPpm: 7.4,
        residualSampleCount: 8,
        residualWindowHours: 72,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_RESIDUAL_DRIFT_OUT_OF_ENVELOPE");
    expect(result.ephemeris?.provenance.evidence.residualStatus).toBe("out_of_envelope");
  });


  it("returns FAIL gate for non-canonical evidence reference", () => {
    const result = computeHaloBankTimeModel({
      question: "orbital alignment with horizons",
      timestamp: "2025-03-01T12:00:00Z",
      place: { lat: 10, lon: 20 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "horizons-run-456",
        residualPpm: 1.1,
        residualSampleCount: 8,
        residualWindowHours: 72,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_EVIDENCE_REF_INVALID");
    expect(result.ephemeris?.provenance.evidence.verified).toBe(false);
  });



  it("returns FAIL gate when evidence window is below long-window calibration minimum", () => {
    const result = computeHaloBankTimeModel({
      question: "orbital alignment with horizons",
      timestamp: "2025-03-01T12:00:00Z",
      place: { lat: 10, lon: 20 },
      model: {
        orbitalAlignment: true,
        ephemerisSource: "live",
        ephemerisEvidenceVerified: true,
        ephemerisEvidenceRef: "artifact:jpl-horizons:run-457",
        residualPpm: 1.1,
        residualSampleCount: 8,
        residualWindowHours: 6,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_LONG_WINDOW_REQUIRED");
    expect(result.ephemeris?.provenance.evidence.residualWindowStatus).toBe("short_window");
  });

  it("returns FAIL gate with deterministic firstFail on fallback ephemeris", () => {
    const result = computeHaloBankTimeModel({
      question: "orbital alignment with fallback ephemeris",
      timestamp: "2025-03-01T12:00:00Z",
      place: { lat: 10, lon: 20 },
      model: { orbitalAlignment: true, ephemerisSource: "fallback" },
    });

    expect(result.ok).toBe(true);
    expect(result.ephemeris?.consistency.verdict).toBe("FAIL");
    expect(result.ephemeris?.consistency.firstFailId).toBe("HALOBANK_HORIZONS_FALLBACK_DIAGNOSTIC_ONLY");
    expect(result.ephemeris?.consistency.deterministic).toBe(true);
    expect(result.ephemeris?.provenance.class).toBe("fallback");
    expect(result.ephemeris?.provenance.certifying).toBe(false);
    expect(result.ephemeris?.provenance.note.toLowerCase()).toContain("diagnostic");
  });
});
