import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTarGzip } from "../scripts/environment-packages/tar-archive.mjs";
import { packageHash, type ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";
import { EnvironmentPackageInstallationStore } from "../apps/desktop/src/environment-package-installation";

const owner = { profileId: "profile:removal", deviceId: "desktop_device_removal" };
const roots: string[] = [];
const temp = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "casimirbot-removal-test-")); roots.push(root); return root; };
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-removal-test-")) throw Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const setup = async () => {
  const root = temp();
  const entries = [{ name: "app/clock.cjs", bytes: Buffer.from("module.exports = 1;\n") },
    { name: "LICENSE", bytes: Buffer.from("fixture only\n") }, { name: "THIRD_PARTY_NOTICES.txt", bytes: Buffer.from("fixture notices\n") }];
  const archive: Buffer = createTarGzip(entries);
  const review: ReviewedEnvironmentPackage = { schema: "casimirbot.environment_package_review.v1", packageId: "com.casimirbot.system.clock",
    version: "1.0.0", publisher: "fixture", archiveSha256: packageHash(archive), files: Object.fromEntries(entries.map(e => [e.name, packageHash(e.bytes)])),
    entryPoint: "app/clock.cjs", policyRevision: "fixture-v1", expiresAt: "2026-10-01T00:00:00Z", platforms: [process.platform], minNodeMajor: 20, privateOnly: true };
  const archivePath = path.join(root, "fixture.tgz"); fs.writeFileSync(archivePath, archive);
  const release = vi.fn(), stopAndFence = vi.fn(async () => release), authorize = vi.fn(async () => {});
  const authorizeRemoval = vi.fn(async () => {});
  const input = { userDataPath: root, authorize, authorizeRemoval, stopAndFence, now: () => new Date("2026-09-26T12:00:00Z") };
  const store = new EnvironmentPackageInstallationStore(input);
  const record = await store.install(owner, review, archivePath);
  const scope = path.join(root, "environment-packages/v1", packageHash(JSON.stringify([owner.profileId, owner.deviceId])), packageHash(review.packageId));
  const content = path.join(scope, "versions", review.archiveSha256), pointer = path.join(scope, "selected.json");
  release.mockClear(); stopAndFence.mockClear(); authorize.mockClear();
  return { root, review, archivePath, input, store, record, scope, content, pointer, release, stopAndFence, authorize, authorizeRemoval };
};

describe("owner-scoped package removal storage", () => {
  it("requires explicit removal authority, never install authority alone", async () => {
    const s = await setup(); const store = new EnvironmentPackageInstallationStore({ ...s.input, authorizeRemoval: undefined });
    await expect(store.remove(owner, s.review, s.record.installationRef)).rejects.toThrow("package_removal_authorization_required");
    expect(fs.existsSync(s.pointer)).toBe(true); expect(s.stopAndFence).not.toHaveBeenCalled();
  });
  it("waits for the shared fence, revokes selection, removes code and preserves data/history/other versions", async () => {
    const s = await setup(); let ready!: () => void, allow!: () => void;
    const entered = new Promise<void>(r => { ready = r; });
    s.stopAndFence.mockImplementation(async () => { ready(); await new Promise<void>(r => { allow = r; }); return s.release; });
    const history = path.join(s.root, "clock-observations.jsonl"), data = path.join(s.scope, "user-notes.txt");
    const old = path.join(s.scope, "versions", "a".repeat(64)); fs.mkdirSync(old); fs.writeFileSync(path.join(old, "old.txt"), "older version");
    fs.writeFileSync(history, "historical observation"); fs.writeFileSync(data, "owned notes");
    const pending = s.store.remove(owner, s.review, s.record.installationRef); await entered;
    expect(fs.existsSync(s.pointer)).toBe(true); expect(fs.existsSync(s.content)).toBe(true);
    await expect(s.store.install(owner, s.review, s.archivePath)).rejects.toThrow("package_install_busy");
    await expect(s.store.remove(owner, s.review, s.record.installationRef)).rejects.toThrow("package_install_busy");
    allow(); const removed = await pending;
    expect(removed).toMatchObject({ selected: false, codeFilesRemoved: true, removedFileCount: 3, userDataPreserved: true, observationHistoryPreserved: true });
    expect(fs.existsSync(s.pointer)).toBe(false); expect(fs.existsSync(s.content)).toBe(false);
    expect(fs.readFileSync(history, "utf8")).toBe("historical observation"); expect(fs.readFileSync(data, "utf8")).toBe("owned notes");
    expect(fs.readFileSync(path.join(old, "old.txt"), "utf8")).toBe("older version");
    expect(s.release).toHaveBeenCalledTimes(1);
    const removedRecords = fs.readdirSync(s.scope).filter(x => x.startsWith(".removed-")); expect(removedRecords).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(s.scope, removedRecords[0]), "utf8"))).toEqual(s.record);
  });
  it("allows owner cleanup after review expiry/installation withdrawal without authorizing a new install", async () => {
    const s = await setup(); s.input.now = () => new Date("2026-10-02T00:00:00Z"); s.authorize.mockRejectedValue(Error("install_withdrawn"));
    await expect(s.store.remove(owner, s.review, s.record.installationRef)).resolves.toMatchObject({ codeFilesRemoved: true });
    expect(s.authorize).not.toHaveBeenCalled(); expect(s.authorizeRemoval).toHaveBeenCalledTimes(2);
    await expect(s.store.install(owner, s.review, s.archivePath)).rejects.toThrow("package_review_invalid_or_expired");
  });
  it.each(["reference", "version", "artifact", "owner"])("rejects mismatched %s without removing another installation", async kind => {
    const s = await setup(), review = { ...s.review, files: { ...s.review.files } }, target = { ...owner };
    if (kind === "version") review.version = "2.0.0";
    if (kind === "artifact") review.archiveSha256 = "b".repeat(64);
    if (kind === "owner") target.profileId = "profile:other";
    const ref = kind === "reference" ? "environment_installation:00000000-0000-0000-0000-000000000000" : s.record.installationRef;
    await expect(s.store.remove(target, review, ref)).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(s.pointer, "utf8"))).toEqual(s.record); expect(s.stopAndFence).not.toHaveBeenCalled();
  });
  it.each(["fence", "revocation", "selection"])("preserves selection when %s fails before deselection", async kind => {
    const s = await setup();
    if (kind === "fence") s.stopAndFence.mockRejectedValueOnce(Error("cleanup_unconfirmed"));
    if (kind === "revocation") s.authorizeRemoval.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("account_changed"));
    if (kind === "selection") s.stopAndFence.mockImplementationOnce(async () => { fs.writeFileSync(s.pointer, JSON.stringify({ ...s.record, installedAt: "2026-09-26T13:00:00Z" })); return s.release; });
    await expect(s.store.remove(owner, s.review, s.record.installationRef)).rejects.toThrow();
    expect(fs.existsSync(s.pointer)).toBe(true); expect(fs.existsSync(s.content)).toBe(true);
    if (kind !== "fence") expect(s.release).toHaveBeenCalledTimes(1);
  });
  it.each(["modified", "unknown", "hardlink", "locked"])("deselects but retains %s content explicitly", async kind => {
    const s = await setup(), file = path.join(s.content, "app/clock.cjs");
    if (kind === "modified") fs.appendFileSync(file, "changed");
    if (kind === "unknown") fs.writeFileSync(path.join(s.content, "personal.txt"), "preserve");
    if (kind === "hardlink") fs.linkSync(file, path.join(s.root, "outside-link"));
    if (kind === "locked") {
      const unlink = fs.unlinkSync; vi.spyOn(fs, "unlinkSync").mockImplementation(target => { if (String(target) === file) throw Error("injected_sharing_violation"); unlink(target); });
    }
    expect(await s.store.remove(owner, s.review, s.record.installationRef)).toMatchObject({ selected: false, codeFilesRemoved: false, removedFileCount: 0, cleanupError: "package_removal_cleanup_incomplete" });
    expect(fs.existsSync(file)).toBe(true); expect(fs.existsSync(s.pointer)).toBe(false);
    const reopened = new EnvironmentPackageInstallationStore(s.input);
    expect(await reopened.inspect(owner, s.review)).toBeNull();
    await expect(reopened.resolveNativeEntry(owner, s.review)).rejects.toThrow("package_not_installed");
  });
  it("rejects a scope changed to a junction while awaiting the fence", async () => {
    const s = await setup(), outside = temp(), sentinel = path.join(outside, "selected.json"); fs.writeFileSync(sentinel, "untouched");
    s.stopAndFence.mockImplementationOnce(async () => { fs.renameSync(s.scope, `${s.scope}-saved`); fs.symlinkSync(outside, s.scope, "junction"); return s.release; });
    await expect(s.store.remove(owner, s.review, s.record.installationRef)).rejects.toThrow("package_store_link_or_type_invalid");
    expect(fs.readFileSync(sentinel, "utf8")).toBe("untouched"); expect(s.release).toHaveBeenCalledTimes(1);
  });
  it("reinstallation requires fresh admission and creates a new installation identity", async () => {
    const s = await setup(); await s.store.remove(owner, s.review, s.record.installationRef);
    const next = await s.store.install(owner, s.review, s.archivePath);
    expect(next.installationRef).not.toBe(s.record.installationRef);
    expect(next).toMatchObject({ connected: false, granted: false, runtimeLaunchable: false }); expect(s.authorize).toHaveBeenCalled();
    await expect(s.store.remove(owner, s.review, s.record.installationRef)).rejects.toThrow("package_removal_selection_mismatch");
  });
  it("keeps partial deletion unselected and rejects reuse of incomplete cached bytes", async () => {
    const s = await setup(), unlink = fs.unlinkSync;
    vi.spyOn(fs, "unlinkSync").mockImplementation(file => {
      if (String(file) === path.join(s.content, "LICENSE")) throw Error("injected_sharing_violation");
      unlink(file);
    });
    const removed = await s.store.remove(owner, s.review, s.record.installationRef);
    expect(removed).toMatchObject({ selected: false, codeFilesRemoved: false, removedFileCount: 1, cleanupError: "package_removal_cleanup_incomplete" });
    expect(fs.existsSync(path.join(s.content, "app/clock.cjs"))).toBe(false);
    expect(fs.existsSync(path.join(s.content, "LICENSE"))).toBe(true);
    expect(await new EnvironmentPackageInstallationStore(s.input).inspect(owner, s.review)).toBeNull();
    await expect(s.store.install(owner, s.review, s.archivePath)).rejects.toThrow("package_installed_bytes_changed");
    expect(fs.existsSync(s.pointer)).toBe(false);
  });
  it("snapshots caller identity and inventory before awaiting removal authorization", async () => {
    const s = await setup(), target = { ...owner }, review = { ...s.review, files: { ...s.review.files } };
    let entered!: () => void, allow!: () => void;
    const ready = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { allow = r; });
    s.authorizeRemoval.mockImplementationOnce(async () => { entered(); await gate; });
    const pending = s.store.remove(target, review, s.record.installationRef); await ready;
    target.profileId = "profile:replacement";
    review.archiveSha256 = "b".repeat(64);
    (review.files as Record<string, string>)["../outside"] = "c".repeat(64);
    allow(); await expect(pending).resolves.toMatchObject({ codeFilesRemoved: true, artifactSha256: s.review.archiveSha256 });
    expect(s.authorizeRemoval.mock.calls[0]).toEqual([owner, s.review, s.record.installationRef]);
  });
});
