import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { validateVoiceBundle } from "../server/services/voice-bundle/validator";

const dirs: string[] = [];
const hash = (s: string) => createHash("sha256").update(Buffer.from(s)).digest("hex");

const makeBundle = () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-bundle-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const d of dirs.splice(0, dirs.length)) rmSync(d, { recursive: true, force: true });
});

describe("validateVoiceBundle", () => {
  it("validates a complete bundle", () => {
    const dir = makeBundle();
    writeFileSync(join(dir, "model.bin"), "model-data");
    writeFileSync(join(dir, "sample.wav"), "sample-data");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      bundle_version: "voice_bundle/1",
      voice_profile_id: "dottie_default",
      display_name: "Dottie",
      created_at: "2026-02-23T00:00:00Z",
      files: [
        { path: "model.bin", sha256: hash("model-data"), bytes: 10 },
        { path: "sample.wav", sha256: hash("sample-data"), bytes: 11 },
      ],
    }));

    const result = validateVoiceBundle(dir);
    expect(result).toEqual({ ok: true, profileId: "dottie_default", filesValidated: 2 });
  });

  it("returns deterministic failure for checksum mismatch", () => {
    const dir = makeBundle();
    writeFileSync(join(dir, "model.bin"), "model-data");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      bundle_version: "voice_bundle/1",
      voice_profile_id: "dottie_default",
      display_name: "Dottie",
      created_at: "2026-02-23T00:00:00Z",
      files: [{ path: "model.bin", sha256: "bad", bytes: 10 }],
    }));

    const result = validateVoiceBundle(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("checksum_mismatch");
  });

  it("returns deterministic failure for required file missing", () => {
    const dir = makeBundle();
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      bundle_version: "voice_bundle/1",
      voice_profile_id: "dottie_default",
      display_name: "Dottie",
      created_at: "2026-02-23T00:00:00Z",
      files: [{ path: "model.bin", sha256: hash("model-data"), bytes: 10 }],
    }));

    const result = validateVoiceBundle(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("required_file_missing");
  });

  it("returns deterministic failure for bytes mismatch", () => {
    const dir = makeBundle();
    writeFileSync(join(dir, "model.bin"), "model-data");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      bundle_version: "voice_bundle/1",
      voice_profile_id: "dottie_default",
      display_name: "Dottie",
      created_at: "2026-02-23T00:00:00Z",
      files: [{ path: "model.bin", sha256: hash("model-data"), bytes: 9 }],
    }));

    const result = validateVoiceBundle(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("bytes_mismatch");
  });

  it("promotes prod_tts_voice_bundle/1 into a serving voice_bundle/1 with provenance", () => {
    const root = makeBundle();
    const sourceDir = join(root, "checkpoints", "prod_tts_voice_bundle");
    const targetRoot = join(root, "bundles");
    const modelPath = join(sourceDir, "model.nemo");
    const samplePath = join(sourceDir, "sample.wav");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(modelPath, "nemo-model");
    writeFileSync(samplePath, "sample-data");
    writeFileSync(join(sourceDir, "manifest.json"), JSON.stringify({
      bundle_version: "prod_tts_voice_bundle/1",
      commit: "b357dba3",
      config_sha256: hash("cfg"),
      dataset_sha256: hash("dataset"),
      artifact_sha256: hash("artifact"),
      weights_refs: { id: "nvidia/nemo-tts-fastpitch-en" },
      files: [
        { path: "model.nemo", sha256: hash("nemo-model"), bytes: 10 },
        { path: "sample.wav", sha256: hash("sample-data"), bytes: 11 },
      ],
    }, null, 2));

    execFileSync("python", ["scripts/voice/prod/promote_voice_bundle.py", "--input-manifest", join(sourceDir, "manifest.json"), "--output-root", targetRoot, "--voice-profile-id", "dottie_default", "--display-name", "Dottie"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    const promotedDir = join(targetRoot, "dottie_default", "voice_bundle");
    const promoted = validateVoiceBundle(promotedDir);
    expect(promoted).toEqual({ ok: true, profileId: "dottie_default", filesValidated: 2 });
  });

  it("fails closed when source file checksum does not match source manifest", () => {
    const root = makeBundle();
    const sourceDir = join(root, "checkpoints", "prod_tts_voice_bundle");
    const targetRoot = join(root, "bundles");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "model.nemo"), "nemo-model");
    writeFileSync(join(sourceDir, "manifest.json"), JSON.stringify({
      bundle_version: "prod_tts_voice_bundle/1",
      files: [
        { path: "model.nemo", sha256: hash("wrong-model"), bytes: 10 },
      ],
    }, null, 2));

    expect(() => execFileSync("python", [
      "scripts/voice/prod/promote_voice_bundle.py",
      "--input-manifest",
      join(sourceDir, "manifest.json"),
      "--output-root",
      targetRoot,
      "--voice-profile-id",
      "dottie_default",
      "--display-name",
      "Dottie",
    ], { cwd: process.cwd(), encoding: "utf-8" })).toThrow();

    const promotedManifest = join(targetRoot, "dottie_default", "voice_bundle", "manifest.json");
    expect(existsSync(promotedManifest)).toBe(false);
  });

  it("fails closed when source manifest path escapes source bundle root", () => {
    const root = makeBundle();
    const sourceDir = join(root, "checkpoints", "prod_tts_voice_bundle");
    const targetRoot = join(root, "bundles");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(root, "escape.bin"), "escape-data");
    writeFileSync(join(sourceDir, "manifest.json"), JSON.stringify({
      bundle_version: "prod_tts_voice_bundle/1",
      files: [
        { path: "../escape.bin", sha256: hash("escape-data"), bytes: 11 },
      ],
    }, null, 2));

    expect(() => execFileSync("python", [
      "scripts/voice/prod/promote_voice_bundle.py",
      "--input-manifest",
      join(sourceDir, "manifest.json"),
      "--output-root",
      targetRoot,
      "--voice-profile-id",
      "dottie_default",
      "--display-name",
      "Dottie",
    ], { cwd: process.cwd(), encoding: "utf-8" })).toThrow();

    const promotedManifest = join(targetRoot, "dottie_default", "voice_bundle", "manifest.json");
    expect(existsSync(promotedManifest)).toBe(false);
  });
});
