import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0, dirs.length)) rmSync(d, { recursive: true, force: true });
});

describe("voice weights manifest validator", () => {
  it("passes for example manifest", () => {
    const run = spawnSync("python", ["scripts/voice/verify_weights_manifest.py", "configs/voice/weights-manifest.example.json"], { encoding: "utf-8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("status=ok");
  });

  it("fails when required fields are missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "weights-manifest-"));
    dirs.push(dir);
    const manifest = join(dir, "manifest.json");
    writeFileSync(manifest, JSON.stringify({ model_id: "x" }));

    const run = spawnSync("python", ["scripts/voice/verify_weights_manifest.py", manifest], { encoding: "utf-8" });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("missing_field");
  });

  it("fails when commercial_use_allowed is false", () => {
    const dir = mkdtempSync(join(tmpdir(), "weights-manifest-"));
    dirs.push(dir);
    const manifest = join(dir, "manifest.json");
    writeFileSync(
      manifest,
      JSON.stringify({
        model_id: "nemo_tts_en_dottie_v1",
        source_url: "https://example.com/model",
        code_license: "Apache-2.0",
        weights_license: "CC-BY-4.0",
        commercial_use_allowed: false,
        attribution_required: true,
        evidence_links: ["https://example.com/license"],
        checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        created_at: "2026-02-24T00:00:00Z",
      }),
    );

    const run = spawnSync("python", ["scripts/voice/verify_weights_manifest.py", manifest], { encoding: "utf-8" });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("commercial_use_required");
  });
});
