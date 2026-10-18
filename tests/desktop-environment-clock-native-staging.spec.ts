import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentClockNativeStaging } from "../apps/desktop/src/environment-clock-native-staging";
import { packageHash, type ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-clock-stage-"))
      throw Error("fixture_cleanup_scope_invalid");
    // These roots contain small byte fixtures only, never actual executable builds.
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const fixture = () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "casimirbot-clock-stage-")); roots.push(root);
  const userDataPath = path.join(root, "user"); fs.mkdirSync(userDataPath);
  const runtimePath = path.join(root, "runtime.fixture"), entryPath = path.join(root, "entry.fixture");
  const runtime = Buffer.from("small non-executable runtime byte fixture"), entry = Buffer.from("small clock byte fixture");
  fs.writeFileSync(runtimePath, runtime); fs.writeFileSync(entryPath, entry);
  const review = { schema: "casimirbot.environment_package_review.v1",
    packageId: "com.casimirbot.system.clock", version: "1.0.0-private.1", publisher: "publisher:fixture",
    archiveSha256: "a".repeat(64), files: { "clock.cjs": packageHash(entry), LICENSE: "b".repeat(64),
      "THIRD_PARTY_NOTICES.txt": "c".repeat(64) }, entryPoint: "clock.cjs", policyRevision: "fixture:1",
    expiresAt: "2026-10-01T00:00:00.000Z", platforms: ["win32"], minNodeMajor: 24, privateOnly: true } satisfies ReviewedEnvironmentPackage;
  const input = { userDataPath, owner: { profileId: "profile:fixture", deviceId: "device:fixture" }, review,
    runtimePath, runtimeSha256: packageHash(runtime), now: () => new Date("2026-09-26T12:00:00Z") };
  return { root, entryPath, input, stage: new EnvironmentClockNativeStaging(input) };
};
const inventory = (root: string) => fs.readdirSync(root).sort().map(name => ({ name,
  hash: packageHash(fs.readFileSync(path.join(root, name))), modified: fs.statSync(path.join(root, name)).mtimeMs }));

describe.skipIf(process.platform !== "win32")("native clock immutable staging", () => {
  it("publishes verified bytes and reuses them across a fresh owner without rewriting lease records", () => {
    const s = fixture(), root = s.stage.prepare(s.entryPath);
    expect(fs.readdirSync(root).sort()).toEqual(["clock.cjs", "node.exe", "staging.json"]);
    expect(fs.readFileSync(path.join(root, "clock.cjs"))).toEqual(fs.readFileSync(s.entryPath));
    expect(fs.readFileSync(path.join(root, "node.exe"))).toEqual(fs.readFileSync(s.input.runtimePath));
    // Native recovery, not staging, must decide whether an opaque journal is valid.
    fs.writeFileSync(path.join(root, "clock-isolation.journal"), "retained native recovery state");
    const before = inventory(root);
    expect(new EnvironmentClockNativeStaging(s.input).prepare(s.entryPath)).toBe(root);
    expect(inventory(root)).toEqual(before);
    expect(fs.readFileSync(path.join(root, "staging.json"), "utf8")).not.toContain("profile:fixture");
  });
  it.each(["profile", "device", "runtime", "package", "policy"])("isolates a changed %s tuple", kind => {
    const s = fixture(), first = s.stage.prepare(s.entryPath), before = inventory(first);
    const changed = structuredClone({ ...s.input, now: undefined });
    if (kind === "profile") changed.owner.profileId = "profile:second";
    if (kind === "device") changed.owner.deviceId = "device:second";
    if (kind === "package") changed.review.archiveSha256 = "d".repeat(64);
    if (kind === "policy") changed.review.policyRevision = "fixture:2";
    if (kind === "runtime") {
      changed.runtimePath = path.join(s.root, "second-runtime.fixture");
      fs.writeFileSync(changed.runtimePath, "second runtime fixture");
      changed.runtimeSha256 = packageHash(fs.readFileSync(changed.runtimePath));
    }
    const second = new EnvironmentClockNativeStaging({ ...changed, now: s.input.now }).prepare(s.entryPath);
    expect(second).not.toBe(first); expect(inventory(first)).toEqual(before);
  });
  it.each(["node.exe", "clock.cjs", "staging.json"])("rejects changed published %s without repairing it", file => {
    const s = fixture(), root = s.stage.prepare(s.entryPath);
    fs.writeFileSync(path.join(root, file), "changed"); const before = inventory(root);
    expect(() => s.stage.prepare(s.entryPath)).toThrow(/clock_staging_(hash_mismatch|record_invalid)/);
    expect(inventory(root)).toEqual(before);
  });
  it.each(["entry", "runtime"])("rejects changed %s source even when a cached root exists", file => {
    const s = fixture(), root = s.stage.prepare(s.entryPath), before = inventory(root);
    fs.writeFileSync(file === "entry" ? s.entryPath : s.input.runtimePath, "changed source");
    expect(() => s.stage.prepare(s.entryPath)).toThrow("clock_staging_hash_mismatch");
    expect(inventory(root)).toEqual(before);
  });
  it.each(["source", "published"])("rejects a %s hard link", kind => {
    const s = fixture();
    const file = kind === "source" ? s.entryPath : path.join(s.stage.prepare(s.entryPath), "clock.cjs");
    fs.linkSync(file, path.join(s.root, "hard-link.fixture"));
    expect(() => s.stage.prepare(s.entryPath)).toThrow("clock_staging_path_invalid");
  });
  it("rejects a junction ancestor without modifying the linked target", () => {
    const s = fixture(), alias = path.join(s.root, "alias");
    fs.symlinkSync(s.input.userDataPath, alias, "junction");
    expect(() => new EnvironmentClockNativeStaging({ ...s.input, userDataPath: alias }).prepare(s.entryPath))
      .toThrow("clock_staging_path_invalid");
    expect(fs.readdirSync(s.input.userDataPath)).toEqual([]);
  });
  it("rejects an unexpected published file and preserves it", () => {
    const s = fixture(), root = s.stage.prepare(s.entryPath);
    fs.writeFileSync(path.join(root, "unreviewed.cjs"), "must never run"); const before = inventory(root);
    expect(() => s.stage.prepare(s.entryPath)).toThrow("clock_staging_inventory_invalid");
    expect(inventory(root)).toEqual(before);
  });
  it("never publishes a partial copy and retries from intact sources", () => {
    const s = fixture();
    vi.spyOn(fs, "writeSync").mockImplementationOnce(() => { throw Error("injected disk write failure with host path"); });
    expect(() => s.stage.prepare(s.entryPath)).toThrow("clock_staging_unavailable");
    vi.restoreAllMocks();
    const parent = path.join(s.input.userDataPath, "clock-runtime", "v1");
    expect(fs.readdirSync(parent)).toEqual([]);
    const root = s.stage.prepare(s.entryPath);
    expect(fs.readdirSync(parent)).toEqual([path.basename(root)]);
  });
  it("rejects expiry between copying and publication", () => {
    const s = fixture(); let calls = 0;
    const now = () => new Date(++calls < 3 ? "2026-09-26T12:00:00Z" : "2026-10-01T00:00:00Z");
    const staging = new EnvironmentClockNativeStaging({ ...s.input, now });
    expect(() => staging.prepare(s.entryPath)).toThrow("clock_staging_unavailable");
    expect(fs.readdirSync(path.join(s.input.userDataPath, "clock-runtime", "v1"))).toEqual([]);
  });
  it("does not trust an incomplete published directory or erase an orphan stage", () => {
    const s = fixture(), root = s.stage.prepare(s.entryPath);
    fs.unlinkSync(path.join(root, "staging.json"));
    const orphan = path.join(path.dirname(root), ".stage-previous"); fs.mkdirSync(orphan);
    fs.writeFileSync(path.join(orphan, "clock.cjs"), "incomplete");
    expect(() => s.stage.prepare(s.entryPath)).toThrow("clock_staging_unavailable");
    expect(fs.existsSync(path.join(root, "staging.json"))).toBe(false);
    expect(fs.readFileSync(path.join(orphan, "clock.cjs"), "utf8")).toBe("incomplete");
  });
  it("owns the configuration snapshot instead of observing later caller mutations", () => {
    const s = fixture(); s.input.owner.profileId = "profile:changed"; s.input.review.archiveSha256 = "f".repeat(64);
    const record = JSON.parse(fs.readFileSync(path.join(s.stage.prepare(s.entryPath), "staging.json"), "utf8"));
    expect(record.ownerRef).toBe(packageHash(JSON.stringify(["profile:fixture", "device:fixture"])));
    expect(record.artifactSha256).toBe("a".repeat(64));
  });
});
