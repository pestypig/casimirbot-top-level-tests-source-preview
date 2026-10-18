import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCasimirDpPenroseRelationalCorrespondenceStage01 } from
  "../scripts/research/run-casimir-dp-penrose-relational-correspondence-stage0-1";

const configPath =
  "configs/research/casimir-dp-penrose-relational-correspondence-stage0-1.v1.json";
const reportPath =
  "docs/research/casimir-dp-penrose-relational-correspondence-stage0-1-report.md";
const receiptPath =
  "docs/research/casimir-dp-penrose-relational-correspondence-stage0-1-receipt.json";
const scratchRoots: string[] = [];

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

afterEach(() => {
  while (scratchRoots.length > 0) {
    const root = scratchRoots.pop();
    if (root != null && root.startsWith(tmpdir())) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("Penrose relational correspondence Stage-0.1 campaign", () => {
  it("keeps the maintained report content-addressed and fail closed", () => {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      input: { path: string; sha256: string };
      output: { path: string; sha256: string };
      overall_status: string;
      synthetic_benchmark_status: string;
      scientific_correspondence_status: string;
      first_failure_code: string;
      synthetic_first_failure_code: string | null;
      physical_reference_authority: {
        ready_packets: number;
        required_packets: number;
      };
      stage0_candidate_first_failure_remains: string;
      invariant_functional_status: unknown;
      proposed_collapse_rate_s: unknown;
      proposed_lifetime_distribution: unknown;
      proposed_coherence_prediction: unknown;
      proposed_casimir_modifier: unknown;
      model_comparison_admission: boolean;
      empirically_validated: boolean;
    };

    expect(receipt.input.path).toBe(configPath);
    expect(receipt.input.sha256).toBe(sha256(readFileSync(configPath)));
    expect(receipt.output.path).toBe(reportPath);
    expect(receipt.output.sha256).toBe(sha256(readFileSync(reportPath)));
    expect(receipt.overall_status).toBe("blocked");
    expect(receipt.synthetic_benchmark_status).toBe("pass");
    expect(receipt.scientific_correspondence_status).toBe(
      "blocked_pending_same_apparatus_reference_receipts",
    );
    expect(receipt.first_failure_code).toBe("PRC_REFERENCE_RECEIPTS_MISSING");
    expect(receipt.synthetic_first_failure_code).toBeNull();
    expect(receipt.physical_reference_authority).toEqual(
      expect.objectContaining({ ready_packets: 0, required_packets: 5 }),
    );
    expect(receipt.stage0_candidate_first_failure_remains).toBe(
      "PCT_BRANCH_CORRESPONDENCE_MISSING",
    );
    expect(receipt.proposed_collapse_rate_s).toBeNull();
    expect(receipt.invariant_functional_status).toBe("not_supplied");
    expect(receipt.proposed_lifetime_distribution).toBeNull();
    expect(receipt.proposed_coherence_prediction).toBeNull();
    expect(receipt.proposed_casimir_modifier).toBeNull();
    expect(receipt.model_comparison_admission).toBe(false);
    expect(receipt.empirically_validated).toBe(false);
  });

  it("replays deterministically without changing scientific standing", async () => {
    const scratchRoot = mkdtempSync(
      path.join(tmpdir(), "casimir-dp-penrose-stage0-1-"),
    );
    scratchRoots.push(scratchRoot);
    const replayReport = path.join(scratchRoot, "report.md");
    const replayReceipt = path.join(scratchRoot, "receipt.json");

    const replay = await runCasimirDpPenroseRelationalCorrespondenceStage01({
      configPath,
      reportPath: replayReport,
      receiptPath: replayReceipt,
    });

    expect(replay.receipt.generated_at).toBe("2026-08-11T20:30:00.000Z");
    expect(replay.result.synthetic_benchmark_status).toBe("pass");
    expect(replay.result.first_failure_code).toBe(
      "PRC_REFERENCE_RECEIPTS_MISSING",
    );
    expect(replay.result.proposed_collapse_rate_s).toBeNull();
    expect(replay.receipt.input.sha256).toBe(
      sha256(readFileSync(configPath)),
    );
    expect(readFileSync(replayReport, "utf8")).toBe(
      readFileSync(reportPath, "utf8"),
    );
    expect(JSON.parse(readFileSync(replayReceipt, "utf8"))).toEqual(
      replay.receipt,
    );
  });
});
