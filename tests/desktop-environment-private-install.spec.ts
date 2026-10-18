import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePrivateEnvironmentInstaller } from "../apps/desktop/src/environment-private-install";
import { PRIVATE_CLOCK_INSTALL_REVIEW, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import type { ActiveDesktopAccount } from "../apps/desktop/src/active-account-session";
import { privateEnvironmentStateSchema } from "../shared/desktop-environment-home";

const now = new Date("2026-09-26T12:00:00Z");
const account: ActiveDesktopAccount = { profileId: "profile:native-install", sessionId: "account_session:native-test-1234", accountType: "developer" };
const deviceId = `desktop_device_${"a".repeat(22)}`;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-native-install-")) throw Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "casimirbot-native-install-")); roots.push(root);
  const policy = { schema: "casimirbot.private_environment_install_policy.v1", profile_id: account.profileId, device_id: deviceId,
    session_ref: createHash("sha256").update(account.sessionId).digest("hex"), policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION,
    expires_at: "2026-10-01T00:00:00.000Z", artifact_sha256: PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256,
    review_revision: PRIVATE_CLOCK_INSTALL_REVIEW.policyRevision, install_allowed: true, runtime_allowed: false,
    credential_included: false, public_release: false };
  const readAccount = vi.fn(async () => ({ ...account })), readPolicy = vi.fn(async (): Promise<unknown> => ({ ...policy }));
  const selectArchive = vi.fn(async (): Promise<string | null> => null);
  const input = { userDataPath: root, deviceId, executable: process.execPath, featureEnabled: () => true,
    readAccount, readPolicy, selectArchive, now: () => now };
  return {root, policy, input, readAccount, readPolicy, selectArchive, controller: new NativePrivateEnvironmentInstaller(input)};
};
describe("native private environment account and artifact boundary", () => {
  it("shows an uninstalled package without granting execution or exposing paths/session identity", async () => {
    const s = setup(), state = await s.controller.inspect();
    expect(state).toMatchObject({status:"not_installed",installAvailable:true,runtimeAvailable:false,connected:false,granted:false});
    expect(JSON.stringify(state)).not.toMatch(/account_session|AppData|profile:|desktop_device/);
    expect(s.selectArchive).not.toHaveBeenCalled();
  });
  it.each(["user", "disabled", "profile", "session", "device", "artifact", "revision", "expired", "runtime"])("denies %s before opening the picker", async kind => {
    const s = setup();
    if (kind === "user") s.readAccount.mockResolvedValue({ ...account, accountType: "user" });
    if (kind === "disabled") s.input.featureEnabled = () => false;
    if (kind === "profile") s.policy.profile_id = "profile:other";
    if (kind === "session") s.policy.session_ref = "f".repeat(64);
    if (kind === "device") s.policy.device_id = `desktop_device_${"b".repeat(22)}`;
    if (kind === "artifact") s.policy.artifact_sha256 = "a".repeat(64);
    if (kind === "revision") s.policy.policy_revision = "old";
    if (kind === "expired") s.policy.expires_at = now.toISOString();
    if (kind === "runtime") s.policy.runtime_allowed = true;
    expect(await s.controller.install()).toMatchObject({ status: "unavailable", installAvailable:false, runtimeAvailable:false });
    expect(s.selectArchive).not.toHaveBeenCalled();
    expect(fs.readdirSync(s.root)).toEqual([]);
  });
  it("cancels native file selection without creating an installation", async () => {
    const s = setup();
    expect(await s.controller.install()).toMatchObject({status:"not_installed",cancelled:true});
    expect(s.selectArchive).toHaveBeenCalledTimes(1);
  });
  it("denies an account switch while the native picker is open", async () => {
    const s = setup();
    s.selectArchive.mockImplementation(async () => {
      s.readAccount.mockResolvedValue({ ...account, sessionId: "account_session:replacement-1234" });
      return path.join(s.root,"must-not-read.tgz");
    });
    expect(await s.controller.install()).toMatchObject({status:"unavailable",error:"private_install_identity_or_policy_changed"});
    expect(fs.readdirSync(s.root)).toEqual([]);
  });
  it("does not relay service error content to the renderer", async () => {
    const s = setup(); s.readPolicy.mockRejectedValue(Error("untrusted response body / local path"));
    expect(await s.controller.inspect()).toMatchObject({status:"unavailable",error:"private_install_unavailable"});
  });
  it.each(["sign-out", "session", "role"] as const)("rejects %s while policy is in flight before opening the picker", async change => {
    const s = setup();
    s.readPolicy.mockImplementationOnce(async () => {
      if (change === "sign-out") s.readAccount.mockRejectedValue(Error("fixture sign-out"));
      if (change === "session") s.readAccount.mockResolvedValue({ ...account, sessionId: "account_session:replacement-5678" });
      if (change === "role") s.readAccount.mockResolvedValue({ ...account, accountType: "user" });
      return { ...s.policy }; // The service response still matches the earlier account.
    });
    expect(await s.controller.install()).toMatchObject({ status: "unavailable", runtimeAvailable: false });
    expect(s.selectArchive).not.toHaveBeenCalled(); expect(fs.readdirSync(s.root)).toEqual([]);
  });
  it("freezes the initial account before a policy callback mutates its returned object", async () => {
    const s = setup(), mutable = { ...account };
    s.readAccount.mockImplementation(async () => mutable);
    s.readPolicy.mockImplementation(async () => {
      mutable.sessionId = "account_session:replacement-5678";
      return { ...s.policy, session_ref: createHash("sha256").update(mutable.sessionId).digest("hex") };
    });
    expect(await s.controller.install()).toMatchObject({ status: "unavailable", runtimeAvailable: false });
    expect(s.selectArchive).not.toHaveBeenCalled(); expect(fs.readdirSync(s.root)).toEqual([]);
  });
  it("rechecks artifact review expiry after asynchronous policy resolution", async () => {
    const s = setup(); let currentTime = now;
    s.input.now = () => currentTime;
    s.policy.expires_at = "2026-10-02T00:00:00.000Z";
    s.readPolicy.mockImplementationOnce(async () => {
      currentTime = new Date("2026-10-01T00:00:00.000Z"); return { ...s.policy };
    });
    expect(await s.controller.install()).toMatchObject({ status: "unavailable", runtimeAvailable: false });
    expect(s.selectArchive).not.toHaveBeenCalled(); expect(fs.readdirSync(s.root)).toEqual([]);
  });
});
describe.skipIf(!process.env.G16A_CLOCK_PACKAGE)("native install controller with exact reviewed private archive", () => {
  const inventory = (root: string): Array<{path: string; sha256: string}> => {
    const walk = (folder: string): string[] => fs.readdirSync(folder, {withFileTypes:true})
      .flatMap(entry => entry.isDirectory() ? walk(path.join(folder,entry.name)) : [path.join(folder,entry.name)]);
    return walk(root).sort().map(file => ({path:path.relative(root,file),sha256:createHash("sha256").update(fs.readFileSync(file)).digest("hex")}));
  };
  it("installs through three current policy checks and recovers the same stopped receipt", async () => {
    const s = setup(); s.selectArchive.mockResolvedValue(path.join(process.env.G16A_CLOCK_PACKAGE!, "clock.tgz"));
    const state = await s.controller.install();
    expect(privateEnvironmentStateSchema.parse(state).artifactSha256).toBe(PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256);
    expect(state).toMatchObject({status:"installed_stopped",runtimeAvailable:false,connected:false,granted:false});
    expect(s.readPolicy).toHaveBeenCalledTimes(3);
    expect(await new NativePrivateEnvironmentInstaller(s.input).inspect()).toEqual(state);
  });
  it("withholds the selection if the final policy check is withdrawn", async () => {
    const s = setup(); s.selectArchive.mockResolvedValue(path.join(process.env.G16A_CLOCK_PACKAGE!, "clock.tgz"));
    s.readPolicy.mockResolvedValueOnce(s.policy).mockResolvedValueOnce(s.policy).mockRejectedValueOnce(Error("withdrawn"));
    expect(await s.controller.install()).toMatchObject({status:"unavailable",runtimeAvailable:false});
    expect(await s.controller.inspect()).toMatchObject({status:"not_installed"});
  });

  describe.each(["after-picker", "before-commit"] as const)("preservation %s", stage => {
    it.each(["profile", "session", "sign-out", "role", "approval"] as const)(
      "rejects %s changes without changing the previous installation", async boundary => {
        const s = setup();
        const archive = path.join(process.env.G16A_CLOCK_PACKAGE!, "clock.tgz");
        s.selectArchive.mockResolvedValue(archive);
        const installed = await s.controller.install();
        expect(installed.status).toBe("installed_stopped");
        const before = inventory(s.root);
        expect(before).toHaveLength(5);

        let changed = false, accountReads = 0;
        let current: ActiveDesktopAccount = account;
        s.readAccount.mockImplementation(async () => {
          accountReads++;
          // Each admission now reads the account before and after policy I/O.
          if (stage === "before-commit" && accountReads === 5) changed = true;
          if (changed && boundary === "sign-out") throw Error("synthetic_session_revoked");
          current = changed && boundary === "profile" ? {...account,profileId:"profile:replacement"}
            : changed && boundary === "session" ? {...account,sessionId:"account_session:replacement-1234"}
            : changed && boundary === "role" ? {...account,accountType:"user"} : account;
          return current;
        });
        s.readPolicy.mockImplementation(async () => {
          if (changed && boundary === "approval") throw Error("synthetic_policy_withdrawn");
          // Both responses agree on the new identity. Denial must bind to the
          // original installation request, not merely detect a mixed response.
          return {...s.policy,profile_id:current.profileId,
            session_ref:createHash("sha256").update(current.sessionId).digest("hex")};
        });
        s.selectArchive.mockImplementation(async () => {
          if (stage === "after-picker") changed = true;
          return archive;
        });

        const rejected = await s.controller.install();
        expect(rejected).toMatchObject({status:"unavailable",installAvailable:false,runtimeAvailable:false,connected:false,granted:false});
        expect(accountReads).toBe(stage === "before-commit" ? 5 : 3);
        expect(inventory(s.root)).toEqual(before);

        // Returning to the original identity needs no reinstall or migration.
        s.readAccount.mockResolvedValue({...account});
        s.readPolicy.mockResolvedValue({...s.policy});
        expect(await new NativePrivateEnvironmentInstaller(s.input).inspect()).toEqual(installed);
        expect(inventory(s.root)).toEqual(before);
      },
    );
  });
});
