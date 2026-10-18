import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const dirs: string[] = [];

const runPy = (script: string, env: Record<string, string>) => execFileSync("python", [script], {
  cwd: process.cwd(),
  env: { ...process.env, ...env },
  encoding: "utf-8",
});

afterEach(() => {
  for (const d of dirs.splice(0, dirs.length)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("prod TTS lane", () => {
  it("fails closed for non-allowlisted weights", () => {
    const dir = mkdtempSync(join(tmpdir(), "prod-tts-"));
    dirs.push(dir);
    const statusPath = join(dir, "status.json");
    expect(() => runPy("scripts/voice/prod/train_nemo_tts.py", {
      PROD_TTS_DRY_RUN: "1",
      PROD_TTS_STATUS_PATH: statusPath,
      PROD_TTS_BASE_WEIGHTS_ID: "invalid/not-allowed",
    })).toThrow();

    const status = JSON.parse(readFileSync(statusPath, "utf-8"));
    expect(status.status).toBe("blocked");
    expect(String(status.root_cause)).toContain("allowlist_rejected");
  });

  it("writes deterministic status and bundle integrity fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "prod-tts-"));
    dirs.push(dir);
    const statusPath = join(dir, "status.json");
    const evalPath = join(dir, "eval.json");
    const ckptDir = join(dir, "checkpoints");
    const bundleDir = join(dir, "bundle");

    const out = runPy("scripts/voice/prod/train_nemo_tts.py", {
      PROD_TTS_DRY_RUN: "1",
      PROD_TTS_STATUS_PATH: statusPath,
      PROD_TTS_CHECKPOINTS_DIR: ckptDir,
      PROD_TTS_DATASET_MANIFEST: join(dir, "missing-dataset.jsonl"),
      PROD_TTS_ARTIFACTS_DIR: dir,
    });
    expect(out).toContain("PROGRESS 0 4");
    expect(out).toContain("ARTIFACT");

    runPy("scripts/voice/prod/eval_nemo_tts.py", {
      PROD_TTS_STATUS_PATH: statusPath,
      PROD_TTS_EVAL_PATH: evalPath,
    });

    runPy("scripts/voice/prod/build_voice_bundle.py", {
      PROD_TTS_STATUS_PATH: statusPath,
      PROD_TTS_EVAL_PATH: evalPath,
      PROD_TTS_BUNDLE_DIR: bundleDir,
      PROD_TTS_COMMIT: "deadbeef",
    });

    const status = JSON.parse(readFileSync(statusPath, "utf-8"));
    expect(status.objective_status).toBe("ready_for_bundle");
    expect(status.status_json).toBe(statusPath);
    expect(
      String(status.dataset_manifest).includes("prod_tts_dataset_dry_run.jsonl")
      || String(status.dataset_manifest).includes("prod_tts_dataset_auto.jsonl"),
    ).toBe(true);
    expect(status.dataset_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(status.metrics.final_loss).toBe(0);

    const manifestPath = join(bundleDir, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.bundle_version).toBe("prod_tts_voice_bundle/1");
    expect(manifest.commit).toBe("deadbeef");
    expect(manifest.weights_refs.weights_license).toBeTruthy();
    expect(manifest.config_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.dataset_sha256).toMatch(/^[0-9a-f]{64}$/);

    const noArtifact = { ...manifest };
    delete noArtifact.artifact_sha256;
    const digest = createHash("sha256").update(JSON.stringify(noArtifact, null, 2)).digest("hex");
    expect(manifest.artifact_sha256).toBe(digest);
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.length).toBeGreaterThan(0);
  });

  it("fails closed when config is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "prod-tts-"));
    dirs.push(dir);
    const statusPath = join(dir, "status.json");
    expect(() => runPy("scripts/voice/prod/train_nemo_tts.py", {
      PROD_TTS_DRY_RUN: "1",
      PROD_TTS_STATUS_PATH: statusPath,
      PROD_TTS_CONFIG: join(dir, "missing.yaml"),
      PROD_TTS_ARTIFACTS_DIR: dir,
    })).toThrow();

    const status = JSON.parse(readFileSync(statusPath, "utf-8"));
    expect(status.status).toBe("blocked");
    expect(String(status.root_cause)).toContain("config_missing");
  });

  it("fails closed for non-dry real-run scaffold", () => {
    const dir = mkdtempSync(join(tmpdir(), "prod-tts-"));
    dirs.push(dir);
    const statusPath = join(dir, "status.json");
    const datasetPath = join(dir, "dataset.jsonl");
    writeFileSync(
      datasetPath,
      '{"audio_filepath":"sample.wav","text":"hello world"}\n',
      "utf-8",
    );
    expect(() => runPy("scripts/voice/prod/train_nemo_tts.py", {
      PROD_TTS_DRY_RUN: "0",
      PROD_TTS_STATUS_PATH: statusPath,
      PROD_TTS_DATASET_MANIFEST: datasetPath,
      PROD_TTS_ARTIFACTS_DIR: dir,
    })).toThrow();

    const status = JSON.parse(readFileSync(statusPath, "utf-8"));
    expect(status.status).toBe("blocked");
    expect([
      "dataset_no_valid_audio",
      "non_finite_loss:step=0",
      "runtime_dependency_missing:numpy,soundfile",
      "runtime_dependency_missing:numpy,soundfile,torch",
      "runtime_dependency_missing:soundfile",
      "runtime_dependency_missing:torch",
    ]).toContain(String(status.root_cause));
  });

  it("blocks bundle build when status digests are invalid", () => {
    const dir = mkdtempSync(join(tmpdir(), "prod-tts-"));
    dirs.push(dir);
    const statusPath = join(dir, "status.json");
    const artifactPath = join(dir, "fake.nemo");
    writeFileSync(artifactPath, "fake-model", "utf-8");
    writeFileSync(statusPath, JSON.stringify({
      status: "ok",
      root_cause: "none",
      artifacts: [artifactPath],
      config_sha256: "missing",
      dataset_sha256: "missing",
      selected_weights_id: "nvidia/nemo-tts-fastpitch-en",
      selected_weights: {
        weights_license: "NVIDIA Open Model License",
        code_license: "Apache-2.0",
        license_url: "https://developer.nvidia.com/ngc/nvidia-open-model-license",
      },
    }), "utf-8");

    expect(() => runPy("scripts/voice/prod/build_voice_bundle.py", {
      PROD_TTS_STATUS_PATH: statusPath,
      PROD_TTS_BUNDLE_DIR: join(dir, "bundle"),
      PROD_TTS_COMMIT: "deadbeef",
    })).toThrow();
  });

  it("allowlist entries include explicit license fields", () => {
    const payload = JSON.parse(readFileSync("configs/voice/prod_tts/weights_allowlist.json", "utf-8"));
    for (const weight of payload.weights) {
      expect(weight.commercial_use_allowed).toBe(true);
      expect(typeof weight.weights_license).toBe("string");
      expect(typeof weight.code_license).toBe("string");
      expect(typeof weight.license_url).toBe("string");
    }
  });
});
