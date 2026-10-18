import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendCodexMirrorDiagnostic } from "../../apps/desktop/src/codex-mirror-diagnostic-journal";

const directories: string[] = [];
const file = () => {
  const directory = mkdtempSync(path.join(tmpdir(), "casimir-mirror-journal-"));
  directories.push(directory);
  return path.join(directory, "mirror.log");
};
afterEach(() => {
  for (const directory of directories.splice(0)) {
    for (const name of readdirSync(directory)) unlinkSync(path.join(directory, name));
    rmdirSync(directory);
  }
});

it("records only bounded mirror codes, never arbitrary transcript or credential text", () => {
  const target = file();
  appendCodexMirrorDiagnostic(target, "panel_read:reader:codex_mirror_request_timeout");
  appendCodexMirrorDiagnostic(target, "closed:poll:codex_mirror_owner_grant_changed");
  appendCodexMirrorDiagnostic(target, "panel_read:reader:secret=example");
  appendCodexMirrorDiagnostic(target, "user-visible transcript");
  const contents = readFileSync(target, "utf8");
  expect(contents).toContain("panel_read:reader:codex_mirror_request_timeout");
  expect(contents).toContain("closed:poll:codex_mirror_owner_grant_changed");
  expect(contents).not.toContain("secret=");
  expect(contents).not.toContain("transcript");
});

it("rotates its own small journal after the cap instead of going permanently silent", () => {
  const target = file();
  for (let index = 0; index < 800; index++) {
    appendCodexMirrorDiagnostic(target, "panel_read:target_before:codex_mirror_target_transport_unavailable");
  }
  appendCodexMirrorDiagnostic(target, "panel_read:reader:codex_mirror_request_timeout");
  expect(statSync(target).size).toBeLessThan(64 * 1024);
  expect(readFileSync(target, "utf8")).toContain("panel_read:reader:codex_mirror_request_timeout");
});
