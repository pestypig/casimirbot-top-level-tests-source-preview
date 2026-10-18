import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTarGzip } from "../scripts/environment-packages/tar-archive.mjs";
import { packageHash, type ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";
import { EnvironmentPackageInstallationStore } from "../apps/desktop/src/environment-package-installation";
import { NativePrivateEnvironmentRemoval, type PrivateRemovalSelection } from "../apps/desktop/src/environment-private-removal";
import type { ActiveDesktopAccount } from "../apps/desktop/src/active-account-session";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-removal-admission-")) throw Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const setup = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "casimirbot-removal-admission-")); roots.push(root);
  const account: ActiveDesktopAccount = { profileId: "profile:removal-owner", sessionId: "session:removal-original", accountType: "developer" };
  const owner = { profileId: account.profileId, deviceId: "device-removal-original" };
  const entries = [{ name: "clock.cjs", bytes: Buffer.from("module.exports=1;\n") },
    { name: "LICENSE", bytes: Buffer.from("test fixture\n") }, { name: "THIRD_PARTY_NOTICES.txt", bytes: Buffer.from("test notices\n") }];
  const archive: Buffer = createTarGzip(entries);
  const review: ReviewedEnvironmentPackage = { schema: "casimirbot.environment_package_review.v1", privateOnly: true,
    packageId: "com.casimirbot.system.clock", publisher: "fixture", version: "1.0.0", archiveSha256: packageHash(archive),
    files: Object.fromEntries(entries.map(e => [e.name, packageHash(e.bytes)])), entryPoint: "clock.cjs",
    policyRevision: "fixture-v1", expiresAt: "2026-10-01T00:00:00Z", platforms: [process.platform], minNodeMajor: 20 };
  const archivePath = path.join(root, "fixture.tgz"); fs.writeFileSync(archivePath, archive);
  const release = vi.fn(), stopAndFence = vi.fn(async () => release);
  const install = new EnvironmentPackageInstallationStore({ userDataPath: root, authorize: async () => {}, stopAndFence,
    now: () => new Date("2026-09-26T00:00:00Z") });
  const record = await install.install(owner, review, archivePath);
  release.mockClear(); stopAndFence.mockClear();
  const scope = path.join(root, "environment-packages/v1", packageHash(JSON.stringify([owner.profileId, owner.deviceId])), packageHash(review.packageId));
  const pointer = path.join(scope, "selected.json"), content = path.join(scope, "versions", review.archiveSha256);
  const readAccount = vi.fn(async (): Promise<ActiveDesktopAccount> => ({ ...account }));
  const readDeviceId = vi.fn(() => owner.deviceId);
  const confirm = vi.fn(async (_selection: PrivateRemovalSelection): Promise<boolean> => true);
  const input = { userDataPath: root, review, readAccount, readDeviceId, confirm, stopAndFence };
  return { root, owner, account, review, record, pointer, content, scope, readAccount, readDeviceId, confirm, stopAndFence, release,
    input, controller: new NativePrivateEnvironmentRemoval(input) };
};

describe("native removal current-owner confirmation", () => {
  it("derives the selection without exposing account, session, device or local paths", async () => {
    const s = await setup(), result = await s.controller.inspect();
    expect(result).toEqual({ status: "selected", selection: { packageId: s.review.packageId, version: s.review.version,
      artifactSha256: s.review.archiveSha256, installationRef: s.record.installationRef } });
    expect(JSON.stringify(result)).not.toMatch(/profile:|session:|device-removal|AppData/);
    expect(s.confirm).not.toHaveBeenCalled(); expect(s.stopAndFence).not.toHaveBeenCalled();
  });
  it("confirms the exact native selection, shares the fence and preserves user history", async () => {
    const s = await setup(), history = path.join(s.root, "history.jsonl"); fs.writeFileSync(history, "historical only");
    const result = await s.controller.remove();
    expect(result).toMatchObject({ status: "removed", receipt: { selected: false, codeFilesRemoved: true, removedFileCount: 3 } });
    expect(s.confirm).toHaveBeenCalledTimes(1); expect(s.confirm.mock.calls[0][0].installationRef).toBe(s.record.installationRef);
    expect(Object.isFrozen(s.confirm.mock.calls[0][0])).toBe(true);
    expect(s.stopAndFence).toHaveBeenCalledWith(s.owner, s.review.packageId); expect(s.release).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(s.pointer)).toBe(false); expect(fs.existsSync(s.content)).toBe(false);
    expect(fs.readFileSync(history, "utf8")).toBe("historical only");
    expect(await s.controller.remove()).toEqual({ status: "not_installed" }); expect(s.confirm).toHaveBeenCalledTimes(1);
  });
  it("cancelled confirmation leaves selection and bytes untouched without stopping runtime", async () => {
    const s = await setup(); s.confirm.mockResolvedValue(false);
    expect(await s.controller.remove()).toEqual({ status: "cancelled" });
    expect(fs.existsSync(s.pointer)).toBe(true); expect(fs.existsSync(s.content)).toBe(true); expect(s.stopAndFence).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "user", "missing-session", "bad-device"])("rejects %s before confirmation", async kind => {
    const s = await setup();
    if (kind === "anonymous") s.readAccount.mockRejectedValue(Error("signed out"));
    if (kind === "user") s.readAccount.mockResolvedValue({ ...s.account, accountType: "user" });
    if (kind === "missing-session") s.readAccount.mockResolvedValue({ ...s.account, sessionId: "" });
    if (kind === "bad-device") s.readDeviceId.mockReturnValue("");
    expect(await s.controller.remove()).toMatchObject({ status: "unavailable" });
    expect(s.confirm).not.toHaveBeenCalled(); expect(s.stopAndFence).not.toHaveBeenCalled(); expect(fs.existsSync(s.pointer)).toBe(true);
  });
  it.each(["profile", "session", "role", "device", "sign-out", "invalidate"])("rejects %s while the confirmation is open", async kind => {
    const s = await setup();
    s.confirm.mockImplementationOnce(async () => {
      if (kind === "profile") s.readAccount.mockResolvedValue({ ...s.account, profileId: "profile:replacement" });
      if (kind === "session") s.readAccount.mockResolvedValue({ ...s.account, sessionId: "session:replacement" });
      if (kind === "role") s.readAccount.mockResolvedValue({ ...s.account, accountType: "user" });
      if (kind === "device") s.readDeviceId.mockReturnValue("device:replacement");
      if (kind === "sign-out") s.readAccount.mockRejectedValue(Error("signed out"));
      if (kind === "invalidate") s.controller.invalidate();
      return true;
    });
    expect(await s.controller.remove()).toMatchObject({ status: "unavailable" });
    expect(s.stopAndFence).not.toHaveBeenCalled(); expect(fs.existsSync(s.pointer)).toBe(true);
  });
  it.each(["account", "invalidate", "fence-failure"])("rejects %s at the mutation fence without deleting selection", async kind => {
    const s = await setup(); s.stopAndFence.mockImplementationOnce(async () => {
      if (kind === "account") s.readAccount.mockResolvedValue({ ...s.account, sessionId: "session:replacement" });
      if (kind === "invalidate") s.controller.invalidate();
      if (kind === "fence-failure") throw Error("private native details");
      return s.release;
    });
    expect(await s.controller.remove()).toMatchObject({ status: "unavailable" });
    expect(fs.existsSync(s.pointer)).toBe(true); expect(fs.existsSync(s.content)).toBe(true);
    expect(s.release).toHaveBeenCalledTimes(kind === "fence-failure" ? 0 : 1);
  });
  it("prevents overlapping confirmations and rejects a late answer even after identity returns", async () => {
    const s = await setup(); let enter!: () => void, answer!: (value: boolean) => void;
    const entered = new Promise<void>(r => { enter = r; });
    s.confirm.mockImplementationOnce(async () => { enter(); return new Promise<boolean>(r => { answer = r; }); });
    const pending = s.controller.remove(); await entered;
    expect(await s.controller.remove()).toEqual({ status: "unavailable", error: "private_removal_busy" });
    s.controller.invalidate(); answer(true);
    expect(await pending).toEqual({ status: "unavailable", error: "private_removal_cancelled" });
    expect(s.stopAndFence).not.toHaveBeenCalled(); expect(fs.existsSync(s.pointer)).toBe(true);
    expect(await s.controller.remove()).toMatchObject({ status: "removed" }); expect(s.confirm).toHaveBeenCalledTimes(2);
  });
  it("rejects selection replacement while native confirmation is open", async () => {
    const s = await setup(); s.confirm.mockImplementationOnce(async () => {
      fs.writeFileSync(s.pointer, JSON.stringify({ ...s.record, installationRef: "environment_installation:00000000-0000-0000-0000-000000000000" }));
      return true;
    });
    expect(await s.controller.remove()).toEqual({ status: "unavailable", error: "package_removal_selection_mismatch" });
    expect(s.stopAndFence).not.toHaveBeenCalled(); expect(fs.existsSync(s.pointer)).toBe(true);
  });
  it("allows expired-review cleanup and reports altered code retained, without needing install policy", async () => {
    const s = await setup();
    const controller = new NativePrivateEnvironmentRemoval({ ...s.input, review: { ...s.review, expiresAt: "2000-01-01T00:00:00Z" } });
    fs.appendFileSync(path.join(s.content, "clock.cjs"), "modified");
    expect(await controller.inspect()).toMatchObject({ status: "selected" });
    expect(await controller.remove()).toMatchObject({ status: "removed", receipt: { codeFilesRemoved: false, selected: false,
      cleanupError: "package_removal_cleanup_incomplete" } });
    expect(fs.existsSync(s.pointer)).toBe(false); expect(fs.existsSync(s.content)).toBe(true);
  });
  it("snapshots native review and initial account instead of following mutable callback objects", async () => {
    const s = await setup(); (s.review as { archiveSha256: string }).archiveSha256 = "a".repeat(64);
    const mutable = { ...s.account }; s.readAccount.mockImplementation(async () => mutable);
    s.confirm.mockImplementation(async () => { mutable.sessionId = "session:replacement"; return true; });
    expect(await s.controller.remove()).toEqual({ status: "unavailable", error: "private_removal_identity_changed" });
    expect(s.confirm.mock.calls[0][0].artifactSha256).toBe(s.record.artifactSha256);
    expect(fs.existsSync(s.pointer)).toBe(true);
  });
  it("hides unexpected native confirmation error details", async () => {
    const s = await setup(); s.confirm.mockRejectedValue(Error("secret native path/session"));
    expect(await s.controller.remove()).toEqual({ status: "unavailable", error: "private_removal_unavailable" });
    expect(s.stopAndFence).not.toHaveBeenCalled(); expect(fs.existsSync(s.pointer)).toBe(true);
  });
  it("rejects device replacement while an account read is in flight", async () => {
    const s = await setup(); s.readAccount.mockImplementationOnce(async () => {
      s.readDeviceId.mockReturnValue("device:replacement"); return { ...s.account };
    });
    expect(await s.controller.remove()).toEqual({ status: "unavailable", error: "private_removal_identity_changed" });
    expect(s.confirm).not.toHaveBeenCalled(); expect(fs.existsSync(s.pointer)).toBe(true);
  });
  it("does not turn install or mutation authorization into removal-inspection authority", async () => {
    const s = await setup(); const store = new EnvironmentPackageInstallationStore({ userDataPath: s.root,
      authorize: async () => {}, authorizeRemoval: async () => {}, stopAndFence: s.stopAndFence });
    await expect(store.inspectForRemoval(s.owner, s.review)).rejects.toThrow("package_removal_authorization_required");
  });
});
