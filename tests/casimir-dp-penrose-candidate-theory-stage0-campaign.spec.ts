import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCasimirDpPenroseCandidateTheoryStage0 } from
  "../scripts/research/run-casimir-dp-penrose-candidate-theory-stage0";

const configPath =
  "configs/research/casimir-dp-penrose-candidate-theory-stage0.v1.json";
const reportPath =
  "docs/research/casimir-dp-penrose-candidate-theory-stage0-report.md";
const receiptPath =
  "docs/research/casimir-dp-penrose-candidate-theory-stage0-receipt.json";
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

describe("Penrose candidate canonical campaign", () => {
  it("keeps the maintained report content-addressed and fail closed", () => {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      input: { path: string; sha256: string };
      output: { path: string; sha256: string };
      candidate_status: string;
      first_failure_code: string;
      maturity: string;
      numerical_output: unknown;
      model_comparison_admission: boolean;
      empirically_validated: boolean;
      final_gates: Record<string, string>;
    };

    expect(receipt.input.path).toBe(configPath);
    expect(receipt.input.sha256).toBe(sha256(readFileSync(configPath)));
    expect(receipt.output.path).toBe(reportPath);
    expect(receipt.output.sha256).toBe(sha256(readFileSync(reportPath)));
    expect(receipt.candidate_status).toBe("blocked");
    expect(receipt.first_failure_code).toBe(
      "PCT_BRANCH_CORRESPONDENCE_MISSING",
    );
    expect(receipt.maturity).toBe("stage0_exploratory");
    expect(receipt.numerical_output).toBeNull();
    expect(receipt.model_comparison_admission).toBe(false);
    expect(receipt.empirically_validated).toBe(false);
    expect(receipt.final_gates).toEqual(
      expect.objectContaining({
        measured_evidence: "not_ready",
        collapse_identification: "blocked",
        manifold_dynamics: "blocked",
        integrated_pilot: "not_authorized",
      }),
    );
  });

  it("replays deterministically without changing the scientific standing", async () => {
    const scratchRoot = mkdtempSync(
      path.join(tmpdir(), "casimir-dp-penrose-candidate-"),
    );
    scratchRoots.push(scratchRoot);
    const replayReport = path.join(scratchRoot, "report.md");
    const replayReceipt = path.join(scratchRoot, "receipt.json");

    const replay = await runCasimirDpPenroseCandidateTheoryStage0({
      configPath,
      reportPath: replayReport,
      receiptPath: replayReceipt,
    });

    expect(replay.receipt.generated_at).toBe("2026-08-11T18:20:00.000Z");
    expect(replay.result.candidate_status).toBe("blocked");
    expect(replay.result.first_failure_code).toBe(
      "PCT_BRANCH_CORRESPONDENCE_MISSING",
    );
    expect(replay.result.numerical_output).toBeNull();
    expect(replay.receipt.input.sha256).toBe(sha256(readFileSync(configPath)));
    expect(replay.receipt.output.sha256).toBe(
      sha256(readFileSync(reportPath)),
    );
    expect(readFileSync(replayReport, "utf8")).toBe(
      readFileSync(reportPath, "utf8"),
    );
    expect(JSON.parse(readFileSync(replayReceipt, "utf8"))).toEqual(
      replay.receipt,
    );
  });
});

