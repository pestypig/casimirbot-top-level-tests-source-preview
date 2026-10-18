import { describe, expect, it } from "vitest";
import { DEFAULT_EVOLUTION_CONFIG, loadEvolutionConfig } from "../server/services/evolution/config";

describe("evolution config loader", () => {
  it("uses deterministic defaults", () => {
    const result = loadEvolutionConfig();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual(DEFAULT_EVOLUTION_CONFIG);
      expect(result.config.weights.wI).toBe(0.25);
      expect(result.config.thresholds.passMin).toBe(75);
    }
  });

  it("merges explicit values through schema", () => {
    const result = loadEvolutionConfig({ version: 1, thresholds: { passMin: 80 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.thresholds.passMin).toBe(80);
      expect(result.config.thresholds.diagnosticMin).toBe(65);
    }
  });

  it("returns stable validation code for malformed payload", () => {
    const result = loadEvolutionConfig({ version: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("EVOLUTION_CONFIG_INVALID");
      expect(result.message).toContain("schema validation");
    }
  });
});
