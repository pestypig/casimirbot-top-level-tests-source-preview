import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import baseline from "../apps/desktop/environment-packages/system-clock/reviewed-native-runtime.json";
import prepared from "../apps/desktop/environment-packages/system-clock/reviewed-prepared-runtime.json";
import { loadPrivateClockRuntimeArtifacts, loadPrivatePreparedClockRuntimeArtifacts } from "../apps/desktop/src/environment-private-runtime-artifacts";

const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const now = new Date("2026-09-26T12:00:00.000Z");
let root: string, output: string, original: string;
describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("private prepared runtime artifact custody", () => {
  beforeAll(() => {
    original = fs.realpathSync(".tmp/g16a-private-clock-runtime-20260926");
    loadPrivateClockRuntimeArtifacts(original, now);
    const evidence = JSON.parse(fs.readFileSync("docs/evidence/eh-g8-codex-first-paid-product-delivery-v1/launch-program/2026-09-26-g16a-prepared-native-transport.json", "utf8"));
    expect(sha(evidence.helper)).toBe(prepared.files["clock-prepared-bridge.exe"].sha256);
    for (const [name, expected] of Object.entries(prepared.sourceSha256)) expect(sha(path.join("apps/desktop/native", name))).toBe(expected);
    output = fs.mkdtempSync(path.join(fs.realpathSync(".tmp"), "g16a-prepared-artifacts-"));
    root = path.join(output, "runtime"); fs.mkdirSync(root);
    for (const name of Object.keys(baseline.files)) fs.copyFileSync(path.join(original, name), path.join(root, name));
    fs.copyFileSync(evidence.helper, path.join(root, "clock-prepared-bridge.exe"));
    fs.writeFileSync(".tmp/g16a-prepared-artifact-build-path.txt", path.join(output, "result.json"));
  });
  afterAll(() => {
    const loaded = loadPrivatePreparedClockRuntimeArtifacts(root, now);
    fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ root, loaded,
      inventory: fs.readdirSync(root).map(name => ({ name, bytes: fs.statSync(path.join(root, name)).size, sha256: sha(path.join(root, name)) })),
      baselineReviewSha256: sha("apps/desktop/environment-packages/system-clock/reviewed-native-runtime.json"),
      preparedReviewSha256: sha("apps/desktop/environment-packages/system-clock/reviewed-prepared-runtime.json"),
      loaderSha256: sha("apps/desktop/src/environment-private-runtime-artifacts.ts"), testSha256: sha("tests/desktop-environment-prepared-artifacts.spec.ts") }, null, 2));
  });
  it("loads explicit prepared configuration with frozen nested objects", () => {
    const loaded = loadPrivatePreparedClockRuntimeArtifacts(root, now);
    expect(loaded).toMatchObject({ protocol: 2, admittedUse: "private-host-validation", reviewRevision: prepared.revision,
      baselineReviewRevision: baseline.revision, preparedHelper: { path: path.join(root, "clock-prepared-bridge.exe"), sha256: prepared.files["clock-prepared-bridge.exe"].sha256 } });
    expect(loaded.runtime.helperSha256).toBe(baseline.files["clock-bridge.exe"].sha256);
    expect(Object.isFrozen(loaded)).toBe(true); expect(Object.isFrozen(loaded.runtime)).toBe(true); expect(Object.isFrozen(loaded.preparedHelper)).toBe(true);
  });
  it("keeps the legacy loader strict and the baseline inventory valid", () => {
    expect(() => loadPrivateClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_inventory_invalid");
    expect(loadPrivateClockRuntimeArtifacts(original, now).reviewRevision).toBe(baseline.revision);
  });
  it("rejects a missing prepared helper", () => {
    const file = path.join(root, "clock-prepared-bridge.exe"), held = path.join(output, "held.exe"); fs.renameSync(file, held);
    try { expect(() => loadPrivatePreparedClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_inventory_invalid"); }
    finally { fs.renameSync(held, file); }
  });
  it("rejects a directory-provided review instead of trusting it", () => {
    const file = path.join(root, "review.json"); fs.writeFileSync(file, JSON.stringify(prepared));
    try { expect(() => loadPrivatePreparedClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_inventory_invalid"); }
    finally { fs.unlinkSync(file); }
  });
  it.each(["node.exe", "clock-bridge.exe", "clock-prepared-bridge.exe"])("rejects same-size tampering of %s", name => {
    const file = path.join(root, name), fd = fs.openSync(file, "r+"), byte = Buffer.alloc(1); fs.readSync(fd, byte, 0, 1, 0);
    try { fs.writeSync(fd, Buffer.from([byte[0] ^ 1]), 0, 1, 0);
      expect(() => loadPrivatePreparedClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_artifact_changed");
    } finally { fs.writeSync(fd, byte, 0, 1, 0); fs.closeSync(fd); }
  });
  it("rejects a truncated helper", () => {
    const file = path.join(root, "clock-prepared-bridge.exe"), bytes = fs.readFileSync(file); fs.truncateSync(file, bytes.length - 1);
    try { expect(() => loadPrivatePreparedClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_artifact_changed"); }
    finally { fs.writeFileSync(file, bytes); }
  });
  it("rejects a hard-linked helper", () => {
    const link = path.join(output, "linked.exe"); fs.linkSync(path.join(root, "clock-prepared-bridge.exe"), link);
    try { expect(() => loadPrivatePreparedClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_path_invalid"); }
    finally { fs.unlinkSync(link); }
  });
  it.each([new Date("2026-09-25T23:59:59Z"), new Date(prepared.expiresAt), new Date(NaN)])("rejects an inadmissible review time %s", time => {
    expect(() => loadPrivatePreparedClockRuntimeArtifacts(root, time)).toThrow("private_clock_runtime_review_expired");
  });
  it("rejects a relative directory", () => {
    expect(() => loadPrivatePreparedClockRuntimeArtifacts(path.relative(process.cwd(), root), now)).toThrow("private_clock_runtime_path_invalid");
  });
  it("rejects an unsupported host architecture", () => {
    const actual = process; vi.stubGlobal("process", Object.create(actual, { arch: { value: "arm64" } }));
    try { expect(() => loadPrivatePreparedClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_host_unsupported"); }
    finally { vi.unstubAllGlobals(); }
  });
});
