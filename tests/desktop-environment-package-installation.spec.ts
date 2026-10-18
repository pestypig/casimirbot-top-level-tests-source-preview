import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTarGzip } from "../scripts/environment-packages/tar-archive.mjs";
import {
  packageHash, validatePackagePath, verifyEnvironmentPackageArchive,
  type ReviewedEnvironmentPackage,
} from "../apps/desktop/src/environment-package-archive";
import { EnvironmentPackageInstallationStore } from "../apps/desktop/src/environment-package-installation";
import {
  HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
  helixEnvironmentConnectorProbeResultSchema,
} from "../shared/helix-environment-connector";

const owner = { profileId: "profile:private-owner", deviceId: "desktop_device_private" };
const now = new Date("2026-09-26T12:00:00.000Z");
const roots: string[] = [];
const temp = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "casimirbot-install-test-"));
  roots.push(root); return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) {
    // Only remove exact test-created direct children of the OS temp directory.
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-install-test-")) throw new Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const fixture = (version = "1.0.0") => {
  const entries = [
    { name: "app/clock.cjs", bytes: Buffer.from(`module.exports = ${JSON.stringify(version)};\n`) },
    { name: "LICENSE", bytes: Buffer.from("private evaluation only\n") },
    { name: "THIRD_PARTY_NOTICES.txt", bytes: Buffer.from("test fixture\n") },
  ];
  const archive: Buffer = createTarGzip(entries);
  const review: ReviewedEnvironmentPackage = {
    schema: "casimirbot.environment_package_review.v1", packageId: "com.casimirbot.system.clock",
    version, publisher: "publisher:casimirbot", archiveSha256: packageHash(archive),
    files: Object.fromEntries(entries.map(entry => [entry.name, packageHash(entry.bytes)])),
    entryPoint: "app/clock.cjs", policyRevision: "private-fixture-v1", expiresAt: "2026-10-01T00:00:00.000Z",
    platforms: [process.platform], minNodeMajor: 24, privateOnly: true,
  };
  return { entries, archive, review };
};
const setup = () => {
  const root = temp();
  const authorize = vi.fn(async () => {}), stopAndFence = vi.fn(async () => () => {});
  const input = { userDataPath: root, authorize, stopAndFence, now: () => now };
  const store = new EnvironmentPackageInstallationStore(input);
  const write = (f: ReturnType<typeof fixture>) => {
    const file = path.join(root, `${f.review.archiveSha256}.tgz`);
    fs.writeFileSync(file, f.archive); return file;
  };
  const scope = (review: ReviewedEnvironmentPackage) => path.join(root, "environment-packages", "v1",
    packageHash(JSON.stringify([owner.profileId, owner.deviceId])), packageHash(review.packageId));
  return { root, store, authorize, stopAndFence, input, write, scope };
};
const mutateTar = (f: ReturnType<typeof fixture>, mutate: (tar: Buffer) => Buffer | void) => {
  const tar = gunzipSync(f.archive), changed = mutate(tar) ?? tar;
  const archive = gzipSync(changed);
  return { archive, review: { ...f.review, archiveSha256: packageHash(archive) } };
};
const checksum = (tar: Buffer) => {
  tar.fill(32, 148, 156);
  const sum = tar.subarray(0, 512).reduce((total, byte) => total + byte, 0);
  tar.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
};

describe("reviewed private package archive", () => {
  it("verifies exact compressed and file bytes without executing them", () => {
    const f = fixture();
    expect([...verifyEnvironmentPackageArchive(f.archive, f.review, now)]).toEqual(f.entries.map(e => [e.name, e.bytes]));
  });
  it.each(["../outside", "/absolute", "C:/absolute", "a\\b", "a//b", "a/./b", "a/../b", "a/CON.txt", "lpt1", "a/b."])("rejects unsafe path %s", name => {
    expect(() => validatePackagePath(name)).toThrow("package_path_invalid");
  });
  it("checks the compressed hash before decompression", () => {
    const f = fixture(); expect(() => verifyEnvironmentPackageArchive(Buffer.from("bad"), f.review, now)).toThrow("package_archive_hash_mismatch");
  });
  it("bounds expanded gzip size", () => {
    const f = fixture(), archive = gzipSync(Buffer.alloc(32 * 1024 * 1024 + 1));
    expect(() => verifyEnvironmentPackageArchive(archive, { ...f.review, archiveSha256: packageHash(archive) }, now)).toThrow("package_archive_invalid_or_oversized");
  });
  it.each(["link", "pax", "longname", "checksum", "filehash", "padding", "trailer", "alignment"])("rejects %s corruption even with a reviewed archive hash", kind => {
    const f = fixture();
    const changed = mutateTar(f, tar => {
      if (kind === "alignment") return Buffer.concat([tar, Buffer.alloc(1)]);
      if (kind === "link" || kind === "pax" || kind === "longname") { tar[156] = { link: 50, pax: 120, longname: 76 }[kind]!; checksum(tar); }
      if (kind === "checksum") tar[100] ^= 1;
      if (kind === "filehash") tar[512] ^= 1;
      if (kind === "padding") tar[900] = 1;
      if (kind === "trailer") tar[tar.length - 1] = 1;
    });
    expect(() => verifyEnvironmentPackageArchive(changed.archive, changed.review, now)).toThrow();
  });
  it("rejects undeclared, missing and duplicated files", () => {
    const f = fixture();
    for (const entries of [f.entries.slice(1), [...f.entries, f.entries[0]], [...f.entries, { name: "extra", bytes: Buffer.from("x") }]]) {
      const archive = createTarGzip(entries);
      expect(() => verifyEnvironmentPackageArchive(archive, { ...f.review, archiveSha256: packageHash(archive) }, now)).toThrow();
    }
  });
  it("rejects traversal in archive headers before any extraction", () => {
    const f = fixture(), changed = mutateTar(f, tar => { tar.fill(0, 0, 100); tar.write("../outside"); checksum(tar); });
    expect(() => verifyEnvironmentPackageArchive(changed.archive, changed.review, now)).toThrow("package_path_invalid");
  });
  it("rejects case collision, file/parent conflict and missing notices in the review", () => {
    const f = fixture();
    const missing = { ...f.review.files }; delete missing.LICENSE;
    for (const files of [missing, { ...f.review.files, license: packageHash("x") }, { ...f.review.files, app: packageHash("x") }]) {
      expect(() => verifyEnvironmentPackageArchive(f.archive, { ...f.review, files }, now)).toThrow("package_inventory_invalid");
    }
  });
  it("rejects expired and incompatible reviews", () => {
    const f = fixture();
    expect(() => verifyEnvironmentPackageArchive(f.archive, f.review, new Date(f.review.expiresAt))).toThrow("package_review_invalid_or_expired");
    expect(() => verifyEnvironmentPackageArchive(f.archive, { ...f.review, platforms: [] }, now)).toThrow("package_host_incompatible");
  });
});

describe("native private installation selection", () => {
  it("persists exact owner/device bytes across a new store, with no execution or grants", async () => {
    const s = setup(), f = fixture();
    const receipt = await s.store.install(owner, f.review, s.write(f));
    expect(receipt).toMatchObject({ ...owner, status: "installed_stopped", connected: false, granted: false, runtimeLaunchable: false });
    expect(await new EnvironmentPackageInstallationStore(s.input).inspect(owner, f.review)).toEqual(receipt);
    expect(await s.store.inspect({ ...owner, profileId: "other" }, f.review)).toBeNull();
    expect(await s.store.inspect({ ...owner, deviceId: "other" }, f.review)).toBeNull();
    expect(s.stopAndFence).toHaveBeenCalledTimes(1);
    expect(s.stopAndFence).toHaveBeenCalledWith(owner, f.review.packageId);
  });
  it("keeps an idempotent receipt and atomically selects an update after fencing", async () => {
    const s = setup(), first = fixture(), next = fixture("1.1.0");
    const initial = await s.store.install(owner, first.review, s.write(first));
    expect(await s.store.install(owner, first.review, s.write(first))).toEqual(initial);
    s.stopAndFence.mockImplementationOnce(async () => { expect(await s.store.inspect(owner, first.review)).toEqual(initial); return () => {}; });
    const updated = await s.store.install(owner, next.review, s.write(next));
    expect(updated.installationRef).toBe(initial.installationRef);
    expect(updated.artifactSha256).toBe(next.review.archiveSha256);
    expect(fs.existsSync(path.join(s.scope(first.review), "versions", first.review.archiveSha256))).toBe(true);
    await expect(s.store.inspect(owner, first.review)).rejects.toThrow("package_selected_version_mismatch");
  });
  it.each(["revoked", "expired", "fence"])("preserves prior selection when %s during update", async kind => {
    const s = setup(), first = fixture(), next = fixture("1.1.0");
    const initial = await s.store.install(owner, first.review, s.write(first));
    if (kind === "revoked") s.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("revoked"));
    if (kind === "expired") s.stopAndFence.mockImplementationOnce(async () => { s.input.now = () => new Date(next.review.expiresAt); return () => {}; });
    if (kind === "fence") s.stopAndFence.mockRejectedValueOnce(new Error("fence_failed"));
    await expect(s.store.install(owner, next.review, s.write(next))).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(path.join(s.scope(first.review), "selected.json"), "utf8"))).toEqual(initial);
    s.input.now = () => now;
    expect(await s.store.inspect(owner, first.review)).toEqual(initial);
  });
  it("denies concurrent writers and releases the lock after completion", async () => {
    const s = setup(), f = fixture(), archive = s.write(f);
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    s.stopAndFence.mockImplementationOnce(() => { entered(); return new Promise<() => void>(resolve => { release = () => resolve(() => {}); }); });
    const pending = s.store.install(owner, f.review, archive); await started;
    await expect(s.store.install(owner, f.review, archive)).rejects.toThrow("package_install_busy");
    release(); await pending;
    await expect(s.store.install(owner, f.review, archive)).resolves.toMatchObject({ status: "installed_stopped" });
  });
  it.each(["bytes", "empty_directory", "pointer", "hardlink"])("denies changed installed %s", async kind => {
    const s = setup(), f = fixture(); await s.store.install(owner, f.review, s.write(f));
    const scope = s.scope(f.review), content = path.join(scope, "versions", f.review.archiveSha256);
    const file = path.join(content, "app", "clock.cjs");
    if (kind === "bytes") fs.appendFileSync(file, "changed");
    if (kind === "empty_directory") fs.mkdirSync(path.join(content, "extra"));
    if (kind === "pointer") fs.writeFileSync(path.join(scope, "selected.json"), "{}");
    if (kind === "hardlink") fs.linkSync(file, path.join(s.root, "other-link"));
    await expect(s.store.inspect(owner, f.review)).rejects.toThrow();
  });
  it("rejects a junction scope before writing outside the trusted store", async () => {
    const s = setup(), outside = temp(), f = fixture();
    fs.symlinkSync(outside, path.join(s.root, "environment-packages"), "junction");
    await expect(s.store.install(owner, f.review, s.write(f))).rejects.toThrow("package_store_link_or_type_invalid");
    expect(fs.readdirSync(outside)).toEqual([]);
  });
  it("rechecks a scope replaced by a junction during the asynchronous fence", async () => {
    const s = setup(), outside = temp(), f = fixture();
    s.stopAndFence.mockImplementationOnce(async () => {
      const scope = s.scope(f.review); fs.rmdirSync(scope); fs.symlinkSync(outside, scope, "junction");
      return () => {};
    });
    await expect(s.store.install(owner, f.review, s.write(f))).rejects.toThrow("package_store_link_or_type_invalid");
    expect(fs.readdirSync(outside)).toEqual([]);
  });
  it("does not treat unselected staging or content as an installed app", async () => {
    const s = setup(), f = fixture();
    await s.store.inspect(owner, f.review);
    fs.mkdirSync(path.join(s.scope(f.review), ".stage-incomplete"));
    fs.mkdirSync(path.join(s.scope(f.review), "versions", f.review.archiveSha256), { recursive: true });
    expect(await s.store.inspect(owner, f.review)).toBeNull();
  });
  it("copies caller identity and review before awaiting authorization", async () => {
    const s = setup(), f = fixture(), mutableOwner = { ...owner }, review = structuredClone(f.review);
    s.authorize.mockImplementationOnce(async () => { mutableOwner.profileId = "other"; (review as { version: string }).version = "swapped"; });
    const receipt = await s.store.install(mutableOwner, review, s.write(f));
    expect(receipt.profileId).toBe(owner.profileId); expect(receipt.version).toBe(f.review.version);
  });
});

describe.skipIf(!process.env.G16A_CLOCK_PACKAGE)("reviewed real private clock artifact (explicit local package required)", () => {
  it("installs the reviewed external SDK bundle and executes its tokenless clock handler", async () => {
    const directory = process.env.G16A_CLOCK_PACKAGE!;
    if (!path.isAbsolute(directory)) throw new Error("absolute_artifact_path_required");
    const review: ReviewedEnvironmentPackage = JSON.parse(fs.readFileSync(path.resolve("apps/desktop/environment-packages/system-clock/reviewed-private.json"), "utf8"));
    const s = setup(), receipt = await s.store.install(owner, review, path.join(directory, "clock.tgz"));
    const entry = path.join(s.scope(review), "versions", review.archiveSha256, review.entryPoint);
    const request = { schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, probe_request_id: "probe:private-clock",
      capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, catalog_snapshot_id: "catalog:private-clock",
      arguments: { clock: "monotonic" }, constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
      created_at: now.toISOString(), deadline_at: new Date(now.getTime() + 5000).toISOString(), assistant_answer: false, raw_content_included: false };
    // Trusted local build test only: this does not attest an OS sandbox/supervisor.
    const run = (value: string) => spawnSync(process.execPath, [entry], { input: value, encoding: "utf8", timeout: 7000, maxBuffer: 64 * 1024,
      cwd: path.toNamespacedPath(path.dirname(entry)), env: { SystemRoot: process.env.SystemRoot } });
    const result = run(JSON.stringify(request));
    expect(result.error?.message).toBeUndefined();
    if (result.status !== 0) throw new Error(`private_clock_failed: ${result.stderr}`);
    expect(result.stderr).toBe(""); expect(result.status).toBe(0);
    const observation = helixEnvironmentConnectorProbeResultSchema.parse(JSON.parse(result.stdout));
    expect(observation).toMatchObject({ probe_request_id: request.probe_request_id, outcome: "succeeded", model_invoked: false, side_effects_performed: false });
    expect(observation.result.uptime_ms).toBeGreaterThanOrEqual(0);
    for (const input of ["{}", JSON.stringify({ ...request, token: "must-not-enter-child" }), "x".repeat(65537)]) {
      const rejected = run(input); expect(rejected.status).toBe(2); expect(rejected.stdout).toBe("");
    }
    expect(receipt.runtimeLaunchable).toBe(false);
  });
});
