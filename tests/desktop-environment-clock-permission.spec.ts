import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PrivateClockMcpPermission } from "../apps/desktop/src/environment-private-clock-permission";
import { PRIVATE_CLOCK_INSTALL_REVIEW as review } from "../shared/environment-private-install";
import type { PrivateClockBrokerRequest } from "../apps/desktop/src/environment-private-clock-broker";
import type { PrivateEnvironmentState } from "../shared/desktop-environment-home";
import { desktopMcpClientRef } from "../server/auth/helix-desktop-mcp-identity";

const fixture = () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "casimirbot-clock-permission-")), session = {};
  const account = { sessionId: "account_session:fixture-owner", profileId: "profile:owner", accountType: "developer" as const };
  const deviceId = `desktop_device_${"a".repeat(22)}`, installationRef = "environment_installation:11111111-1111-4111-8111-111111111111";
  const identity = vi.fn(async () => ({ session, account }));
  const inspectInstallation = vi.fn(async (): Promise<PrivateEnvironmentState> => ({ schema: "casimirbot.private_environment_state.v1",
    packageId: review.packageId, version: review.version, artifactSha256: review.archiveSha256, status: "installed_stopped",
    installationRef, installAvailable: true, runtimeAvailable: false, connected: false, granted: false }));
  const transportReady = vi.fn(() => true), enabled = vi.fn(() => true);
  let now = Date.parse("2026-09-27T08:00:00Z");
  const input = { userDataPath: root, deviceId, enabled, transportReady, identity, inspectInstallation, now: () => now };
  const permission = new PrivateClockMcpPermission(input);
  const request: PrivateClockBrokerRequest = { schema: "casimir_private_clock_observe_request/1", accountSessionId: account.sessionId,
    clientRef: desktopMcpClientRef(deviceId, account.profileId, account.sessionId), requestId: "probe:permission-fixture", installationRef,
    expiresAt: new Date(now + 15000).toISOString() };
  return { root, session, account, identity, input, permission, request, installationRef, inspectInstallation, transportReady, enabled,
    expire: () => { now = Date.parse(review.expiresAt); } };
};
describe("native exact clock MCP permission", () => {
  it("defaults denied and inspection does not create permission files", async () => {
    const s = fixture(); expect(await s.permission.inspect(s.session)).toMatchObject({ allowed: false });
    await expect(s.permission.authorize(s.request)).rejects.toThrow("private_clock_permission_not_granted");
    expect(fs.readdirSync(s.root)).toEqual([]);
  });
  it("persists exact consent across restart without storing account/session secrets", async () => {
    const s = fixture(); await s.permission.grant(s.session, s.installationRef);
    const first = await s.permission.authorize(s.request), restarted = new PrivateClockMcpPermission(s.input);
    expect(await restarted.authorize(s.request)).toMatchObject({ grantRef: first.grantRef, session: s.session, installationRef: s.installationRef });
    const bytes = fs.readFileSync(path.join(s.root, "private-clock-mcp-permission.json"), "utf8");
    expect(bytes).not.toContain(s.account.sessionId); expect(bytes).not.toContain(s.account.profileId);
  });
  it.each(["accountSessionId", "clientRef", "installationRef"] as const)("denies a different %s", async field => {
    const s = fixture(); await s.permission.grant(s.session, s.installationRef);
    await expect(s.permission.authorize({ ...s.request, [field]: "different" })).rejects.toThrow("private_clock_permission_not_granted");
  });
  it("revokes live authority and keeps it revoked after restart", async () => {
    const s = fixture(); await s.permission.grant(s.session, s.installationRef);
    const held = await s.permission.authorize(s.request); s.permission.revoke(); expect(held.revoked.aborted).toBe(true);
    await expect(new PrivateClockMcpPermission(s.input).authorize(s.request)).rejects.toThrow("private_clock_permission_not_granted");
  });
  it("cancels on transport loss but preserves consent for a qualified reconnect", async () => {
    const s = fixture(); await s.permission.grant(s.session, s.installationRef);
    const held = await s.permission.authorize(s.request); s.transportReady.mockReturnValue(false); s.permission.transportChanged(false);
    expect(held.revoked.aborted).toBe(true); await expect(s.permission.authorize(s.request)).rejects.toThrow("private_clock_permission_not_granted");
    s.transportReady.mockReturnValue(true); s.permission.transportChanged(true);
    const resumed = await s.permission.authorize(s.request); expect(resumed.grantRef).toBe(held.grantRef); expect(resumed.revoked.aborted).toBe(false);
  });
  it("preserves consent on same-account refresh but withdraws it on sign-out", async () => {
    const s = fixture(); await s.permission.grant(s.session, s.installationRef);
    const held = await s.permission.authorize(s.request); await s.permission.invalidateAccount();
    expect(held.revoked.aborted).toBe(true); expect((await s.permission.authorize(s.request)).revoked.aborted).toBe(false);
    s.identity.mockRejectedValueOnce(Error("signed_out")); await s.permission.invalidateAccount();
    expect(await s.permission.inspect(s.session)).toMatchObject({ allowed: false });
  });
  it("denies an installation selection that differs from the native record", async () => {
    const s = fixture(); await expect(s.permission.grant(s.session, "environment_installation:22222222-2222-4222-8222-222222222222"))
      .rejects.toThrow("private_clock_permission_selection_changed");
    expect(fs.readdirSync(s.root)).toEqual([]);
  });
  it("cannot finish granting after revocation races installation inspection", async () => {
    const s = fixture(); let release!: (state: PrivateEnvironmentState) => void;
    const state = await s.inspectInstallation();
    s.inspectInstallation.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = s.permission.grant(s.session, s.installationRef);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    s.permission.revoke(); release(state);
    await expect(pending).rejects.toThrow("private_clock_permission_selection_changed");
    expect(await s.permission.inspect(s.session)).toMatchObject({ allowed: false });
  });
  it("does not renew the reviewed expiry or bypass disabled runtime", async () => {
    const s = fixture(); await s.permission.grant(s.session, s.installationRef); s.enabled.mockReturnValue(false);
    await expect(s.permission.authorize(s.request)).rejects.toThrow("private_clock_permission_unavailable");
    s.enabled.mockReturnValue(true); s.expire();
    await expect(s.permission.authorize(s.request)).rejects.toThrow("private_clock_permission_unavailable");
    await expect(s.permission.grant(s.session, s.installationRef)).rejects.toThrow("private_clock_permission_unavailable");
  });
  it("fails closed on corrupt persisted permission", async () => {
    const s = fixture(); await s.permission.grant(s.session, s.installationRef);
    const held = await s.permission.authorize(s.request);
    fs.writeFileSync(path.join(s.root, "private-clock-mcp-permission.json"), "invalid");
    await expect(s.permission.authorize(s.request)).rejects.toThrow("private_clock_permission_store_unavailable");
    expect(held.revoked.aborted).toBe(true);
  });
});
