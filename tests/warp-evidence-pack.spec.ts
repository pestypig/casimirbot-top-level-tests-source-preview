import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";

const REQUIRED_DISCLAIMER =
  "This material reports diagnostic/reduced-order readiness signals and governance guardrails. It does not claim warp propulsion feasibility or near-term deployment.";

describe("warp evidence pack determinism", () => {
  it("produces deterministic bundle bytes for same inputs", () => {
    execSync("npm run warp:evidence:pack -- --out artifacts/evidence-a.json --first-fail FordRomanQI --first-fail-severity HARD --claim-tier reduced-order --proof-pack-ref api:/api/helix/pipeline/proofs --proof-pack-export artifacts/proof-pack.json --viability-status ADMISSIBLE", { stdio: "pipe" });
    execSync("npm run warp:evidence:pack -- --out artifacts/evidence-b.json --first-fail FordRomanQI --first-fail-severity HARD --claim-tier reduced-order --proof-pack-ref api:/api/helix/pipeline/proofs --proof-pack-export artifacts/proof-pack.json --viability-status ADMISSIBLE", { stdio: "pipe" });
    const a = fs.readFileSync("artifacts/evidence-a.json", "utf8");
    const b = fs.readFileSync("artifacts/evidence-b.json", "utf8");
    expect(a).toBe(b);
  });

  it("includes required evidence fields and disclaimer", () => {
    execSync("npm run warp:evidence:pack -- --out artifacts/evidence-fields.json --first-fail none --claim-tier diagnostic --proof-pack-export artifacts/proof-pack-export.json --viability-status INADMISSIBLE", { stdio: "pipe" });
    const pack = JSON.parse(fs.readFileSync("artifacts/evidence-fields.json", "utf8"));
    expect(pack.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(pack.proofPack).toEqual({ ref: "api:/api/helix/pipeline/proofs", export: "artifacts/proof-pack-export.json" });
    expect(pack.viabilitySnapshot).toEqual({
      status: "INADMISSIBLE",
      maturityPosture: "diagnostic -> reduced-order -> certified-as-governance-only",
    });
    expect(pack.firstFailReport).toEqual({ firstFail: "none", severity: "none" });
    expect(pack.claimTierSnapshot).toEqual({ claimTier: "diagnostic", posture: "governance-only" });
    expect(pack.requiredDisclaimer).toBe(REQUIRED_DISCLAIMER);
    expect(pack.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("defaults firstFail severity to unknown unless explicitly provided", () => {
    execSync("npm run warp:evidence:pack -- --out artifacts/evidence-severity-default.json --first-fail FordRomanQI --claim-tier reduced-order", { stdio: "pipe" });
    const pack = JSON.parse(fs.readFileSync("artifacts/evidence-severity-default.json", "utf8"));
    expect(pack.firstFailReport).toEqual({ firstFail: "FordRomanQI", severity: "unknown" });
  });

  it("uses explicit firstFail severity when provided", () => {
    execSync("npm run warp:evidence:pack -- --out artifacts/evidence-severity-explicit.json --first-fail FordRomanQI --first-fail-severity SOFT --claim-tier reduced-order", { stdio: "pipe" });
    const pack = JSON.parse(fs.readFileSync("artifacts/evidence-severity-explicit.json", "utf8"));
    expect(pack.firstFailReport).toEqual({ firstFail: "FordRomanQI", severity: "SOFT" });
  });
});
