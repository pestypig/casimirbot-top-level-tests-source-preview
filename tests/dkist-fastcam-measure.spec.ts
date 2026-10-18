import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SolarKhiMeasurementInputV1Schema } from "@shared/contracts/solar-khi-observation.v1";
import { measureSolarKhiBoundary } from "../server/services/essence/solar-khi-analysis";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const writeBoundaryFrame = (target: string, width = 96, height = 64): void => {
  const pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distanceToDip = Math.min(...[15, 25, 35, 45, 55, 65, 75].map((dip) => Math.abs(x - dip)));
      pixels[y * width + x] = distanceToDip === 0 ? 70 : distanceToDip === 1 ? 150 : 240;
    }
  }
  fs.writeFileSync(target, Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii"), pixels]));
};

describe("DKIST FastCam manual measurement adapter", () => {
  it("samples native frames and emits provenance-bound deterministic measurement input", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dkist-fastcam-measure-"));
    tempRoots.push(root);
    const frames = path.join(root, "frames");
    fs.mkdirSync(frames);
    const cadenceS = 2.7;
    const growthRate = 0.03;
    const frameCount = 8;
    for (let index = 0; index < frameCount; index += 1) {
      writeBoundaryFrame(path.join(frames, `frame-${String(index).padStart(3, "0")}.pgm`));
    }

    const annotation = {
      schema_version: "solar_khi_manual_trace/v1",
      observation_id: "dkist-fastcam-manual-test",
      boundary_id: "boundary-01",
      reconstruction: "mfbd",
      native_km_per_pixel: 6,
      effective_resolution_km: 19,
      cadence_s: cadenceS,
      flow_speed_km_s: 3,
      minimum_dip_prominence: 0.04,
      reference_polyline_px: [
        { x_px: 10, y_px: 32 },
        { x_px: 45, y_px: 32 },
        { x_px: 80, y_px: 32 },
      ],
      frames: Array.from({ length: frameCount }, (_unused, frameIndex) => {
        const time = frameIndex * cadenceS;
        const amplitude = 0.8 * Math.exp(growthRate * time);
        return {
          frame_index: frameIndex,
          boundary_polyline_px: Array.from({ length: 15 }, (_point, pointIndex) => {
            const x = 10 + pointIndex * 5;
            return { x_px: x, y_px: 32 + amplitude * Math.sin((2 * Math.PI * (x - 10)) / 20) };
          }),
          ridge_position_px: 5 + (1_200 / 6_000) * time,
        };
      }),
    };
    const annotationPath = path.join(root, "trace.json");
    const outputPath = path.join(root, "measurement.json");
    fs.writeFileSync(annotationPath, JSON.stringify(annotation));

    const result = spawnSync("python", [
      path.join(process.cwd(), "tools", "dkist_fastcam_measure.py"),
      "--source", frames,
      "--annotation", annotationPath,
      "--output", outputPath,
    ], { encoding: "utf8" });

    expect(result.status, result.stderr).toBe(0);
    const input = SolarKhiMeasurementInputV1Schema.parse(JSON.parse(fs.readFileSync(outputPath, "utf8")));
    expect(input.frames).toHaveLength(frameCount);
    expect(input.frames[0].intensity_along_boundary).toHaveLength(71);
    expect(input.extraction_provenance).toMatchObject({
      native_width_px: 96,
      native_height_px: 64,
      interpolation: "bilinear_native_pixel_grid",
      resampled_image_forbidden: true,
      manual_trace_authority: true,
    });
    expect(input.extraction_provenance?.source_content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const measured = measureSolarKhiBoundary(input);
    expect(measured.wavelength_m).toBeGreaterThanOrEqual(25_000);
    expect(measured.wavelength_m).toBeLessThanOrEqual(170_000);
    expect(measured.growth_rate_s_inv).toBeCloseTo(growthRate, 2);
    expect(measured.phase_speed_m_s).toBeCloseTo(1_200, 6);
    expect(measured.range_checks).toEqual({
      wavelength_published_range: true,
      growth_rate_published_range: true,
      phase_speed_published_range: true,
    });
    expect(measured.extraction_provenance).toEqual(input.extraction_provenance);
  });
});
