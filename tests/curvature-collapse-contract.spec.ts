import { describe, expect, it } from "vitest";
import { validateCurvatureCollapseContract } from "../scripts/validate-curvature-collapse-contract";

describe("curvature-collapse reproducibility contract", () => {
  it("validates the canonical v1 contract", () => {
    const result = validateCurvatureCollapseContract();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
