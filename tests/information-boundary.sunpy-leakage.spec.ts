import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { ingestSunpyCoherenceBridge } from "../server/services/essence/sunpy-coherence-bridge";
import { runSolarVideoCoherenceJob } from "../server/services/essence/solar-video-coherence";

const isoPlusMs = (baseIso: string, deltaMs: number): string => new Date(Date.parse(baseIso) + deltaMs).toISOString();
const sha256Prefixed = (input: Buffer | string) => `sha256:${createHash("sha256").update(input).digest("hex")}`;

describe("information boundary: SunPy bridge leakage sentinels", () => {
  it("keeps features_hash invariant to HEK mutations in observables-only mode", async () => {
    const prevSentinel = process.env.SUNPY_LEAKAGE_SENTINEL;
    process.env.SUNPY_LEAKAGE_SENTINEL = "1";
    const t0Iso = "2025-01-01T00:00:00.000Z";
    const basePayload: any = {
      instrument: "AIA",
      wavelength_A: 193,
      meta: {
        start: t0Iso,
        end: isoPlusMs(t0Iso, 10 * 60 * 1000),
        cadence_s: 60,
      },
      frames: [
        { index: 0, obstime: t0Iso },
        { index: 1, obstime: isoPlusMs(t0Iso, 60_000) },
        { index: 2, obstime: isoPlusMs(t0Iso, 6 * 60_000) },
      ],
      events: [
        {
          event_type: "FL",
          start_time: isoPlusMs(t0Iso, 2 * 60_000),
          end_time: isoPlusMs(t0Iso, 3 * 60_000),
          goes_class: "M1.2",
          peak_flux: 1.2e-5,
        },
      ],
    };

    const mutatedPayload: any = {
      ...basePayload,
      events: [
        {
          event_type: "FL",
          start_time: isoPlusMs(t0Iso, 2 * 60_000),
          end_time: isoPlusMs(t0Iso, 3 * 60_000),
          goes_class: "X9.3",
          peak_flux: 9.3e-4,
        },
        {
          event_type: "AR",
          start_time: isoPlusMs(t0Iso, 60_000),
          end_time: isoPlusMs(t0Iso, 2 * 60_000),
          noaa_ar: 12345,
        },
      ],
    };

    let summaryA: Awaited<ReturnType<typeof ingestSunpyCoherenceBridge>> = null;
    let summaryB: Awaited<ReturnType<typeof ingestSunpyCoherenceBridge>> = null;
    try {
      summaryA = await ingestSunpyCoherenceBridge(basePayload, {
        sessionId: "ib-test-obs-A",
        sessionType: "test",
        hostMode: "sun_like",
        emitEvents: false,
        includeEventFeatures: false,
      });
      summaryB = await ingestSunpyCoherenceBridge(mutatedPayload, {
        sessionId: "ib-test-obs-B",
        sessionType: "test",
        hostMode: "sun_like",
        emitEvents: false,
        includeEventFeatures: false,
      });
    } finally {
      if (prevSentinel === undefined) {
        delete process.env.SUNPY_LEAKAGE_SENTINEL;
      } else {
        process.env.SUNPY_LEAKAGE_SENTINEL = prevSentinel;
      }
    }

    expect(summaryA?.data_cutoff_iso).toBe(summaryA?.information_boundary?.data_cutoff_iso);
    expect(summaryA?.inputs_hash).toBe(summaryA?.information_boundary?.inputs_hash);
    expect(summaryA?.features_hash).toBe(summaryA?.information_boundary?.features_hash);

    expect(summaryB?.data_cutoff_iso).toBe(summaryB?.information_boundary?.data_cutoff_iso);
    expect(summaryB?.inputs_hash).toBe(summaryB?.information_boundary?.inputs_hash);
    expect(summaryB?.features_hash).toBe(summaryB?.information_boundary?.features_hash);

    expect(summaryA?.information_boundary?.mode).toBe("observables");
    expect(summaryB?.information_boundary?.mode).toBe("observables");
    expect(summaryA?.information_boundary?.labels_used_as_features).toBe(false);
    expect(summaryB?.information_boundary?.labels_used_as_features).toBe(false);
    expect(summaryA?.information_boundary?.event_features_included).toBe(false);
    expect(summaryB?.information_boundary?.event_features_included).toBe(false);
    expect(summaryA?.data_cutoff_iso).toBe(summaryB?.data_cutoff_iso);
    expect(summaryA?.inputs_hash).toBe(summaryB?.inputs_hash);
    expect(summaryA?.features_hash).toBe(summaryB?.features_hash);
    expect(summaryA?.information_boundary?.inputs_hash).toBe(summaryB?.information_boundary?.inputs_hash);
    expect(summaryA?.information_boundary?.features_hash).toBe(summaryB?.information_boundary?.features_hash);

    expect(summaryA?.bins?.length).toBe(summaryB?.bins?.length);
    for (let i = 0; i < (summaryA?.bins?.length ?? 0); i += 1) {
      const a = summaryA!.bins[i];
      const b = summaryB!.bins[i];
      expect(a.eventCount).toBe(0);
      expect(b.eventCount).toBe(0);
      expect(a.data_cutoff_iso).toBe(a.information_boundary.data_cutoff_iso);
      expect(b.data_cutoff_iso).toBe(b.information_boundary.data_cutoff_iso);
      expect(a.inputs_hash).toBe(a.information_boundary.inputs_hash);
      expect(b.inputs_hash).toBe(b.information_boundary.inputs_hash);
      expect(a.features_hash).toBe(a.information_boundary.features_hash);
      expect(b.features_hash).toBe(b.information_boundary.features_hash);
      expect(a.information_boundary?.mode).toBe("observables");
      expect(b.information_boundary?.mode).toBe("observables");
      expect(a.information_boundary?.labels_used_as_features).toBe(false);
      expect(b.information_boundary?.labels_used_as_features).toBe(false);
      expect(a.information_boundary?.event_features_included).toBe(false);
      expect(b.information_boundary?.event_features_included).toBe(false);
      expect(a.data_cutoff_iso).toBe(b.data_cutoff_iso);
      expect(a.inputs_hash).toBe(b.inputs_hash);
      expect(a.features_hash).toBe(b.features_hash);
      expect(a.information_boundary?.inputs_hash).toBe(b.information_boundary?.inputs_hash);
      expect(a.information_boundary?.features_hash).toBe(b.information_boundary?.features_hash);
    }
  });

  it("changes hashes when labels are used as features (mixed mode)", async () => {
    const t0Iso = "2025-01-01T00:00:00.000Z";
    const basePayload: any = {
      instrument: "AIA",
      wavelength_A: 193,
      meta: { start: t0Iso, end: isoPlusMs(t0Iso, 10 * 60 * 1000), cadence_s: 60 },
      frames: [
        { index: 0, obstime: t0Iso },
        { index: 1, obstime: isoPlusMs(t0Iso, 60_000) },
        { index: 2, obstime: isoPlusMs(t0Iso, 6 * 60_000) },
      ],
      events: [
        {
          event_type: "FL",
          start_time: isoPlusMs(t0Iso, 2 * 60_000),
          end_time: isoPlusMs(t0Iso, 3 * 60_000),
          goes_class: "M1.2",
          peak_flux: 1.2e-5,
        },
      ],
    };
    const mutatedPayload: any = {
      ...basePayload,
      events: [
        {
          event_type: "FL",
          start_time: isoPlusMs(t0Iso, 2 * 60_000),
          end_time: isoPlusMs(t0Iso, 3 * 60_000),
          goes_class: "X9.3",
          peak_flux: 9.3e-4,
        },
      ],
    };

    const summaryA = await ingestSunpyCoherenceBridge(basePayload, {
      sessionId: "ib-test-mixed-A",
      sessionType: "test",
      hostMode: "sun_like",
      emitEvents: false,
      includeEventFeatures: true,
    });
    const summaryB = await ingestSunpyCoherenceBridge(mutatedPayload, {
      sessionId: "ib-test-mixed-B",
      sessionType: "test",
      hostMode: "sun_like",
      emitEvents: false,
      includeEventFeatures: true,
    });

    expect(summaryA?.data_cutoff_iso).toBe(summaryA?.information_boundary?.data_cutoff_iso);
    expect(summaryA?.inputs_hash).toBe(summaryA?.information_boundary?.inputs_hash);
    expect(summaryA?.features_hash).toBe(summaryA?.information_boundary?.features_hash);

    expect(summaryB?.data_cutoff_iso).toBe(summaryB?.information_boundary?.data_cutoff_iso);
    expect(summaryB?.inputs_hash).toBe(summaryB?.information_boundary?.inputs_hash);
    expect(summaryB?.features_hash).toBe(summaryB?.information_boundary?.features_hash);

    expect(summaryA?.information_boundary?.mode).toBe("mixed");
    expect(summaryB?.information_boundary?.mode).toBe("mixed");
    expect(summaryA?.information_boundary?.labels_used_as_features).toBe(true);
    expect(summaryB?.information_boundary?.labels_used_as_features).toBe(true);
    expect(summaryA?.information_boundary?.event_features_included).toBe(true);
    expect(summaryB?.information_boundary?.event_features_included).toBe(true);
    expect(summaryA?.data_cutoff_iso).toBe(summaryB?.data_cutoff_iso);
    expect(summaryA?.inputs_hash).not.toBe(summaryB?.inputs_hash);
    expect(summaryA?.features_hash).not.toBe(summaryB?.features_hash);
    expect(summaryA?.bins?.length).toBe(summaryB?.bins?.length);
    expect(summaryA?.bins?.length).toBeGreaterThan(0);

    const a0 = summaryA!.bins[0].information_boundary;
    const b0 = summaryB!.bins[0].information_boundary;
    expect(a0?.mode).toBe("mixed");
    expect(b0?.mode).toBe("mixed");
    expect(a0?.inputs_hash).not.toBe(b0?.inputs_hash);
    expect(a0?.features_hash).not.toBe(b0?.features_hash);
  });

  it("propagates contract fields for solar video coherence artifacts (observables)", async () => {
    const base64Png1x1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XU2cAAAAASUVORK5CYII=";
    const buffer = Buffer.from(base64Png1x1, "base64");
    const t0Iso = "2025-01-01T00:00:00.000Z";
    const timestampMs = Date.parse(t0Iso);

    const resultA = await runSolarVideoCoherenceJob({
      buffer,
      mime: "image/png",
      gridSize: 64,
      maxFrames: 1,
      sampleStride: 1,
      instrumentTag: "ib-test-png",
      sessionId: "ib-test-video-A",
      sessionType: "test",
      hostMode: "sun_like",
      timestampMs,
    });
    const resultB = await runSolarVideoCoherenceJob({
      buffer,
      mime: "image/png",
      gridSize: 64,
      maxFrames: 1,
      sampleStride: 1,
      instrumentTag: "ib-test-png",
      sessionId: "ib-test-video-B",
      sessionType: "test",
      hostMode: "sun_like",
      timestampMs,
    });

    const expectedInputsHash = sha256Prefixed(buffer);
    const mapToBuffer = (arr: Float32Array) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const expectedFeaturesHash = sha256Prefixed(
      Buffer.concat([
        Buffer.from(`grid:${resultA.map.gridSize};v1;`, "utf8"),
        mapToBuffer(resultA.map.coherence),
        mapToBuffer(resultA.map.phaseDispersion),
        mapToBuffer(resultA.map.energy),
      ]),
    );

    expect(resultA.data_cutoff_iso).toBe(new Date(timestampMs).toISOString());
    expect(resultA.inputs_hash).toBe(expectedInputsHash);
    expect(resultA.features_hash).toBe(expectedFeaturesHash);
    expect(resultA.data_cutoff_iso).toBe(resultA.information_boundary.data_cutoff_iso);
    expect(resultA.inputs_hash).toBe(resultA.information_boundary.inputs_hash);
    expect(resultA.features_hash).toBe(resultA.information_boundary.features_hash);
    expect(resultA.information_boundary.mode).toBe("observables");
    expect(resultA.information_boundary.labels_used_as_features).toBe(false);
    expect(resultA.information_boundary.event_features_included).toBe(false);

    expect(resultB.data_cutoff_iso).toBe(resultA.data_cutoff_iso);
    expect(resultB.inputs_hash).toBe(resultA.inputs_hash);
    expect(resultB.features_hash).toBe(resultA.features_hash);
  });
});
