import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  runStarSimSolarReferenceRun,
  starSimSolarReferenceRunPlanSchema,
} from "../shared/starsim-solar-reference-run";

const planPath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "starsim-solar-reference",
  "solar-reference-plan.fixture.json",
);

function plan() {
  return starSimSolarReferenceRunPlanSchema.parse(
    JSON.parse(readFileSync(planPath, "utf8")),
  );
}

function outPath(name: string) {
  return join(tmpdir(), `${name}-${Date.now()}-${Math.random()}.json`);
}

describe("StarSim solar reference run", () => {
  it("fixture_only plan emits fixture_only artifact", () => {
    const artifact = runStarSimSolarReferenceRun({
      plan: plan(),
      outPath: outPath("solar-reference-fixture"),
    });
    expect(artifact.reproducibilityStatus).toBe("fixture_only");
    expect(artifact.evidence.claimTier).toBe("fixture_only_solar_reference");
  });

  it("external runtime with unavailable solver fails clearly and cannot fall back", () => {
    const external = plan();
    external.runtimePolicy = {
      runtimeKind: "local",
      allowFixtureFallback: false,
      requireExternalHashes: true,
      failIfSolverUnavailable: true,
    };
    expect(() =>
      runStarSimSolarReferenceRun({ plan: external, outPath: outPath("solar-reference-local") }),
    ).toThrow(/unavailable/);
  });

  it("accepts MESA metadata with profile and inlist hashes in fixture mode", () => {
    const artifact = runStarSimSolarReferenceRun({
      plan: plan(),
      outPath: outPath("solar-reference-metadata"),
    });
    expect(artifact.mesaMetadata.profileHash).toBeTruthy();
    expect(artifact.mesaMetadata.inlistHash).toBeTruthy();
  });

  it("links profile validation, benchmark, and Stage 2 gate refs", () => {
    const artifact = runStarSimSolarReferenceRun({
      plan: plan(),
      outPath: outPath("solar-reference-links"),
    });
    expect(artifact.fusionProfileValidationRef).toContain("profile-validation");
    expect(artifact.benchmarkReportRef).toContain("benchmark");
    expect(artifact.stage2GateReportRef).toContain("stage2-gate");
  });

  it("preserves proxy-only QST boundaries", () => {
    const artifact = runStarSimSolarReferenceRun({
      plan: plan(),
      outPath: outPath("solar-reference-qst"),
    });
    expect(artifact.qstBoundary.spacetimeCL).toBe("proxy_only");
    expect(artifact.qstBoundary.mayPromoteToCL4).toBe(false);
  });
});
