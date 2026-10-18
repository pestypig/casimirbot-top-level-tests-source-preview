import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const readRepoFile = (relPath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");

const STRICT_KEYS = [
  "theta_strict_mode",
  "theta_strict_ok",
  "theta_strict_reason",
  "qi_rho_source",
  "qi_strict_mode",
  "qi_strict_ok",
  "qi_strict_reason",
  "qi_metric_derived",
  "qi_metric_source",
  "qi_metric_reason",
  "ts_metric_derived",
  "ts_metric_source",
  "ts_metric_reason",
] as const;

const THETA_METRIC_KEYS = [
  "theta_metric_derived",
  "theta_metric_source",
  "theta_metric_reason",
  "theta_audit",
] as const;

const METRIC_CONTRACT_KEYS = [
  "metric_t00_observer",
  "metric_t00_normalization",
  "metric_t00_unit_system",
  "metric_t00_contract_status",
  "metric_t00_contract_reason",
] as const;

describe("proof-pack strict parity", () => {
  it("documents strict keys in proof-pack contract", () => {
    const doc = readRepoFile("docs/proof-pack.md");
    for (const key of STRICT_KEYS) {
      expect(doc).toContain(`\`${key}\``);
    }
    for (const key of THETA_METRIC_KEYS) {
      expect(doc).toContain(`\`${key}\``);
    }
    for (const key of METRIC_CONTRACT_KEYS) {
      expect(doc).toContain(`\`${key}\``);
    }
  });

  it("emits strict keys in backend proof-pack payload", async () => {
    vi.resetModules();
    const pipeline = await import("../server/energy-pipeline");
    const proofPack = await import("../server/helix-proof-pack");
    const state = pipeline.initializePipelineState();
    const pack = proofPack.buildProofPack(state);

    for (const key of STRICT_KEYS) {
      const value = pack.values[key];
      expect(value).toBeDefined();
      expect(typeof value.source).toBe("string");
      expect(typeof value.proxy).toBe("boolean");
    }
    for (const key of THETA_METRIC_KEYS) {
      const value = pack.values[key];
      expect(value).toBeDefined();
      expect(typeof value.source).toBe("string");
      expect(typeof value.proxy).toBe("boolean");
    }
    for (const key of METRIC_CONTRACT_KEYS) {
      if (pack.values[key] !== undefined) {
        const value = pack.values[key];
        expect(typeof value.source).toBe("string");
        expect(typeof value.proxy).toBe("boolean");
      }
    }
  });

  it("surfaces strict keys in WarpProofPanel rows", () => {
    const panel = readRepoFile("client/src/components/WarpProofPanel.tsx");
    for (const key of STRICT_KEYS) {
      expect(panel).toContain(`label="${key}"`);
    }
    for (const key of THETA_METRIC_KEYS) {
      expect(panel).toContain(`label="${key}"`);
    }
    for (const key of METRIC_CONTRACT_KEYS) {
      expect(panel).toContain(`label="${key}"`);
    }
  });

  it("surfaces TS strict status in operator-facing panels", () => {
    const front = readRepoFile("client/src/components/FrontProofsLedger.tsx");
    const warpProof = readRepoFile("client/src/components/WarpProofPanel.tsx");
    const timeLattice = readRepoFile(
      "client/src/components/TimeDilationLatticePanel.tsx",
    );

    expect(front).toContain("TS strict congruence");
    expect(warpProof).toContain('label="ts_metric_derived"');
    expect(warpProof).toContain("TS strict congruence");
    expect(timeLattice).toContain("TS metric-derived");
    expect(timeLattice).toContain("source=");
  });
});
