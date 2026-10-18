import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateHelixAskAuditNote,
  writeHelixAskAuditArtifacts,
} from "../scripts/lib/helix-audit-evidence";

const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

describe("helix ask audit evidence", () => {
  it("writes audit note with normalized artifact references and valid hashes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-"));
    const written = writeHelixAskAuditArtifacts({
      rootDir: root,
      timestamp: "20260221T170000Z",
      ticket: "HELIX-ASK",
      verifierOutput: {
        traceId: "trace-1",
        runId: "run-1",
        verdict: "PASS",
        certificate: {
          certificateHash: "a".repeat(64),
          integrityOk: true,
        },
      },
      traceExportJsonl: '{"id":"t-1"}\n',
      commands: ["POST /api/agi/adapter/run", "GET /api/agi/training-trace/export"],
    });

    const notePath = path.join(root, written.auditNotePath);
    expect(() => validateHelixAskAuditNote(notePath, root)).not.toThrow();

    const note = JSON.parse(fs.readFileSync(notePath, "utf8")) as {
      verify_artifact_path: string;
      trace_export_path: string;
      artifact_hashes: { verify_artifact_sha256: string; trace_export_sha256: string };
    };
    expect(note.verify_artifact_path).toContain("artifacts/verification/helix-casimir-");
    expect(note.trace_export_path).toContain("artifacts/verification/helix-training-trace-");
    expect(note.verify_artifact_path).not.toContain("\\");
    expect(note.trace_export_path).not.toContain("\\");
    expect(note.artifact_hashes.verify_artifact_sha256).toHaveLength(64);
    expect(note.artifact_hashes.trace_export_sha256).toHaveLength(64);
  });

  it("fails when required evidence fields are missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-missing-"));
    const notePath = path.join(root, "docs/audits/helix-results/HELIX-ASK-20260221T170001Z.json");
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.writeFileSync(notePath, JSON.stringify({ verdict: "PASS" }, null, 2));

    expect(() => validateHelixAskAuditNote(notePath, root)).toThrow(/missing_or_invalid_field/);
  });

  it("fails when verdict is not PASS", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-verdict-"));
    const verifyRel = "artifacts/verification/helix-casimir-20260221T170002Z.json";
    const traceRel = "artifacts/verification/helix-training-trace-20260221T170002Z.jsonl";
    const notePath = path.join(root, "docs/audits/helix-results/HELIX-ASK-20260221T170002Z.json");
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.mkdirSync(path.join(root, "artifacts/verification"), { recursive: true });
    fs.writeFileSync(path.join(root, verifyRel), "{}\n");
    fs.writeFileSync(path.join(root, traceRel), "{}\n");

    fs.writeFileSync(
      notePath,
      JSON.stringify(
        {
          ticket: "HELIX-ASK",
          created_at: new Date().toISOString(),
          trace_id: "t",
          run_id: "r",
          verdict: "FAIL",
          certificate_hash: "b".repeat(64),
          integrity_ok: true,
          verify_artifact_path: verifyRel,
          trace_export_path: traceRel,
          artifact_hashes: {
            verify_artifact_sha256: sha256("{}\n"),
            trace_export_sha256: sha256("{}\n"),
          },
          commands: [],
        },
        null,
        2,
      ),
    );

    expect(() => validateHelixAskAuditNote(notePath, root)).toThrow(/invalid_verdict:not_pass/);
  });

  it("fails when integrity flag is false", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-integrity-"));
    const verifyRel = "artifacts/verification/helix-casimir-20260221T170003Z.json";
    const traceRel = "artifacts/verification/helix-training-trace-20260221T170003Z.jsonl";
    const notePath = path.join(root, "docs/audits/helix-results/HELIX-ASK-20260221T170003Z.json");
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.mkdirSync(path.join(root, "artifacts/verification"), { recursive: true });
    fs.writeFileSync(path.join(root, verifyRel), "{}\n");
    fs.writeFileSync(path.join(root, traceRel), "{}\n");

    fs.writeFileSync(
      notePath,
      JSON.stringify(
        {
          ticket: "HELIX-ASK",
          created_at: new Date().toISOString(),
          trace_id: "t",
          run_id: "r",
          verdict: "PASS",
          certificate_hash: "c".repeat(64),
          integrity_ok: false,
          verify_artifact_path: verifyRel,
          trace_export_path: traceRel,
          artifact_hashes: {
            verify_artifact_sha256: sha256("{}\n"),
            trace_export_sha256: sha256("{}\n"),
          },
          commands: [],
        },
        null,
        2,
      ),
    );

    expect(() => validateHelixAskAuditNote(notePath, root)).toThrow(/invalid_integrity:not_true/);
  });

  it("fails when certificate hash is malformed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-cert-"));
    const verifyRel = "artifacts/verification/helix-casimir-20260221T170004Z.json";
    const traceRel = "artifacts/verification/helix-training-trace-20260221T170004Z.jsonl";
    const notePath = path.join(root, "docs/audits/helix-results/HELIX-ASK-20260221T170004Z.json");
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.mkdirSync(path.join(root, "artifacts/verification"), { recursive: true });
    fs.writeFileSync(path.join(root, verifyRel), "{}\n");
    fs.writeFileSync(path.join(root, traceRel), "{}\n");

    fs.writeFileSync(
      notePath,
      JSON.stringify(
        {
          ticket: "HELIX-ASK",
          created_at: new Date().toISOString(),
          trace_id: "t",
          run_id: "r",
          verdict: "PASS",
          certificate_hash: "abc123",
          integrity_ok: true,
          verify_artifact_path: verifyRel,
          trace_export_path: traceRel,
          artifact_hashes: {
            verify_artifact_sha256: sha256("{}\n"),
            trace_export_sha256: sha256("{}\n"),
          },
          commands: [],
        },
        null,
        2,
      ),
    );

    expect(() => validateHelixAskAuditNote(notePath, root)).toThrow(/missing_or_invalid_field:certificate_hash/);
  });

  it("fails when referenced artifact files are missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-missing-artifacts-"));
    const verifyRel = "artifacts/verification/helix-casimir-20260221T170005Z.json";
    const traceRel = "artifacts/verification/helix-training-trace-20260221T170005Z.jsonl";
    const notePath = path.join(root, "docs/audits/helix-results/HELIX-ASK-20260221T170005Z.json");
    fs.mkdirSync(path.dirname(notePath), { recursive: true });

    fs.writeFileSync(
      notePath,
      JSON.stringify(
        {
          ticket: "HELIX-ASK",
          created_at: new Date().toISOString(),
          trace_id: "t",
          run_id: "r",
          verdict: "PASS",
          certificate_hash: "d".repeat(64),
          integrity_ok: true,
          verify_artifact_path: verifyRel,
          trace_export_path: traceRel,
          artifact_hashes: {
            verify_artifact_sha256: "0".repeat(64),
            trace_export_sha256: "1".repeat(64),
          },
          commands: [],
        },
        null,
        2,
      ),
    );

    expect(() => validateHelixAskAuditNote(notePath, root)).toThrow(/missing_artifact/);
  });



  it("validates CRLF artifact bytes against LF-canonical hashes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-crlf-"));
    const verifyRel = "artifacts/verification/helix-casimir-20260221T170007Z.json";
    const traceRel = "artifacts/verification/helix-training-trace-20260221T170007Z.jsonl";
    const notePath = path.join(root, "docs/audits/helix-results/HELIX-ASK-20260221T170007Z.json");
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.mkdirSync(path.join(root, "artifacts/verification"), { recursive: true });

    const verifyLf = '{"verdict":"PASS"}\n';
    const traceLf = '{"trace":"t-1"}\n{"trace":"t-2"}\n';
    fs.writeFileSync(path.join(root, verifyRel), Buffer.from(verifyLf.replace(/\n/g, "\r\n"), "utf8"));
    fs.writeFileSync(path.join(root, traceRel), Buffer.from(traceLf.replace(/\n/g, "\r\n"), "utf8"));

    fs.writeFileSync(
      notePath,
      JSON.stringify(
        {
          ticket: "HELIX-ASK",
          created_at: new Date().toISOString(),
          trace_id: "t",
          run_id: "r",
          verdict: "PASS",
          certificate_hash: "f".repeat(64),
          integrity_ok: true,
          verify_artifact_path: verifyRel,
          trace_export_path: traceRel,
          artifact_hashes: {
            verify_artifact_sha256: sha256(verifyLf),
            trace_export_sha256: sha256(traceLf),
          },
          commands: [],
        },
        null,
        2,
      ),
    );

    expect(() => validateHelixAskAuditNote(notePath, root)).not.toThrow();
  });

  it("fails when referenced artifact hashes mismatch", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-audit-hash-"));
    const verifyRel = "artifacts/verification/helix-casimir-20260221T170006Z.json";
    const traceRel = "artifacts/verification/helix-training-trace-20260221T170006Z.jsonl";
    const notePath = path.join(root, "docs/audits/helix-results/HELIX-ASK-20260221T170006Z.json");
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.mkdirSync(path.join(root, "artifacts/verification"), { recursive: true });
    fs.writeFileSync(path.join(root, verifyRel), "{}\n");
    fs.writeFileSync(path.join(root, traceRel), "{}\n");

    fs.writeFileSync(
      notePath,
      JSON.stringify(
        {
          ticket: "HELIX-ASK",
          created_at: new Date().toISOString(),
          trace_id: "t",
          run_id: "r",
          verdict: "PASS",
          certificate_hash: "e".repeat(64),
          integrity_ok: true,
          verify_artifact_path: verifyRel,
          trace_export_path: traceRel,
          artifact_hashes: {
            verify_artifact_sha256: "0".repeat(64),
            trace_export_sha256: "1".repeat(64),
          },
          commands: [],
        },
        null,
        2,
      ),
    );

    expect(() => validateHelixAskAuditNote(notePath, root)).toThrow(/artifact_hash_mismatch/);
  });
});
