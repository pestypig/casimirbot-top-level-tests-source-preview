import { describe, expect, it } from "vitest";
import { routeSolarModel } from "../server/services/vision/solar-model-registry";

describe("solar model registry", () => {
  it("routes native FastCam KHI work to the temporal detector, not an SDO foundation model", () => {
    const route = routeSolarModel({
      task: "dkist_416_khi_tracking",
      instrument: "DKIST_FastCam",
      passbandCenterNm: 416,
      spatialResolutionKm: 19,
      cadenceSeconds: 2.7,
      fieldOfViewClass: "fastcam_patch",
      requiresWorldCoordinates: true,
      requiredOutputSchema: "solar_khi_measurement/v1",
    });

    expect(route.selected.modelId).toBe("dkist-fastcam-416-khi-temporal-v1");
    expect(route.selected.measurementAuthority).toBe("deterministic_numerical_pipeline");
    expect(route.rejected).toContainEqual(expect.objectContaining({ modelId: "surya-sdo-context" }));
  });

  it("fails closed for unsupported instrument/scale combinations", () => {
    expect(() => routeSolarModel({
      task: "dkist_416_khi_tracking",
      instrument: "SDO_AIA",
      passbandCenterNm: 19.3,
      spatialResolutionKm: 900,
      cadenceSeconds: 12,
      fieldOfViewClass: "full_disk",
      requiresWorldCoordinates: true,
      requiredOutputSchema: "solar_khi_measurement/v1",
    })).toThrow("solar_model_route_unavailable");
  });
});
