import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { capturePrivateClockRuntimeContext } from "../apps/desktop/src/environment-private-runtime-access";
import { PRIVATE_CLOCK_INSTALL_REVIEW, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_PROFILE, PRIVATE_CLOCK_RUNTIME_REVISION } from "../shared/environment-private-runtime";
import { HELIX_SYSTEM_CLOCK_READ_CAPABILITY } from "../shared/helix-environment-connector";
import type { ActiveDesktopAccount } from "../apps/desktop/src/active-account-session";
import type { ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const setup = () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const account: ActiveDesktopAccount = { profileId: "profile:runtime", sessionId: "account_session:runtime-1234", accountType: "developer" };
  const deviceId = `desktop_device_${"a".repeat(22)}`;
  const review: ReviewedEnvironmentPackage = { ...PRIVATE_CLOCK_INSTALL_REVIEW, schema: "casimirbot.environment_package_review.v1", privateOnly: true };
  const install = { schema: "casimirbot.private_environment_install_policy.v1", profile_id: account.profileId, device_id: deviceId,
    session_ref: hash(account.sessionId), policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: "2026-10-01T00:00:00.000Z",
    artifact_sha256: review.archiveSha256, review_revision: review.policyRevision, install_allowed: true,
    runtime_allowed: false, credential_included: false, public_release: false };
  const runtime = { schema: "casimirbot.private_clock_runtime_policy.v1", profile_id: account.profileId, device_id: deviceId,
    session_ref: hash(account.sessionId), policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION,
    issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 30000).toISOString(),
    artifact_sha256: review.archiveSha256, review_revision: review.policyRevision, runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE,
    capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, runtime_allowed: true, hosted_required: false,
    model_invoked: false, credential_included: false, public_release: false };
  const input = { review, readDeviceId: () => deviceId, featureEnabled: () => true, runtimeEnabled: () => true,
    readAccount: vi.fn(async () => ({ ...account })), readPolicy: vi.fn(async (): Promise<unknown> => ({ ...install })),
    readRuntimePolicy: vi.fn(async (): Promise<unknown> => ({ ...runtime })), now: () => now };
  return { now, account, install, runtime, input };
};

describe("separate private native clock runtime admission", () => {
  it("requires current install and distinct runtime policies, returning a frozen native context", async () => {
    const s = setup(), admitted = await capturePrivateClockRuntimeContext(s.input);
    expect(admitted).toMatchObject({ account: s.account, runtimeProfile: PRIVATE_CLOCK_RUNTIME_PROFILE,
      policyRevision: PRIVATE_CLOCK_RUNTIME_REVISION, expiresAt: s.runtime.expires_at });
    expect(Object.isFrozen(admitted)).toBe(true); expect(Object.isFrozen(admitted.account)).toBe(true);
    expect(s.input.readAccount).toHaveBeenCalledTimes(3);
    expect(s.input.readPolicy).toHaveBeenCalledTimes(1); expect(s.input.readRuntimePolicy).toHaveBeenCalledTimes(1);
  });
  it("does not interpret the existing install-only response as runtime permission", async () => {
    const s = setup(); s.input.readRuntimePolicy.mockResolvedValue(s.install);
    await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow("private_runtime_policy_invalid");
  });
  it("requires the native runtime feature switch before requesting any policy", async () => {
    const s = setup(); s.input.runtimeEnabled = () => false;
    await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow("private_runtime_disabled");
    expect(s.input.readPolicy).not.toHaveBeenCalled(); expect(s.input.readRuntimePolicy).not.toHaveBeenCalled();
  });
  it.each(["profile", "session", "device", "artifact", "review", "revision", "runtime-profile", "capability", "runtime-denied", "hosted", "model", "extra"])(
    "rejects a %s policy mismatch", async kind => {
      const s = setup(); const policy: any = { ...s.runtime };
      if (kind === "profile") policy.profile_id = "profile:other";
      if (kind === "session") policy.session_ref = "f".repeat(64);
      if (kind === "device") policy.device_id = `desktop_device_${"b".repeat(22)}`;
      if (kind === "artifact") policy.artifact_sha256 = "a".repeat(64);
      if (kind === "review") policy.review_revision = "review:other";
      if (kind === "revision") policy.policy_revision = "runtime:other";
      if (kind === "runtime-profile") policy.runtime_profile = "unconfined";
      if (kind === "capability") policy.capability_id = "environment.mutate";
      if (kind === "runtime-denied") policy.runtime_allowed = false;
      if (kind === "hosted") policy.hosted_required = true;
      if (kind === "model") policy.model_invoked = true;
      if (kind === "extra") policy.launch_command = "untrusted";
      s.input.readRuntimePolicy.mockResolvedValue(policy);
      await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow(/private_runtime_(identity_or_policy_changed|policy_invalid)/);
    },
  );
  it.each(["expired", "future", "long-lease"])("rejects %s runtime admission", async kind => {
    const s = setup();
    if (kind === "expired") s.runtime.expires_at = s.now.toISOString();
    if (kind === "future") s.runtime.issued_at = new Date(s.now.getTime() + 1000).toISOString();
    if (kind === "long-lease") s.runtime.expires_at = new Date(s.now.getTime() + 30001).toISOString();
    await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow("private_runtime_identity_or_policy_changed");
  });
  it.each(["sign-out", "profile", "session", "role", "device", "runtime-feature", "home-feature"])(
    "rejects %s during runtime-policy lookup", async change => {
      const s = setup();
      s.input.readRuntimePolicy.mockImplementationOnce(async () => {
        if (change === "sign-out") s.input.readAccount.mockRejectedValue(Error("fixture sign-out"));
        if (change === "profile") s.input.readAccount.mockResolvedValue({ ...s.account, profileId: "profile:other" });
        if (change === "session") s.input.readAccount.mockResolvedValue({ ...s.account, sessionId: "account_session:other-1234" });
        if (change === "role") s.input.readAccount.mockResolvedValue({ ...s.account, accountType: "user" });
        if (change === "device") s.input.readDeviceId = () => `desktop_device_${"b".repeat(22)}`;
        if (change === "runtime-feature") s.input.runtimeEnabled = () => false;
        if (change === "home-feature") s.input.featureEnabled = () => false;
        return { ...s.runtime };
      });
      await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow();
    },
  );
  it("keeps the original operation session when all subsequent policy responses match a replacement", async () => {
    const s = setup(), initial = await capturePrivateClockRuntimeContext(s.input);
    const next = { ...s.account, sessionId: "account_session:replacement-1234" };
    s.input.readAccount.mockResolvedValue(next); s.install.session_ref = s.runtime.session_ref = hash(next.sessionId);
    await expect(capturePrivateClockRuntimeContext(s.input, initial)).rejects.toThrow("private_install_identity_or_policy_changed");
    expect(s.input.readRuntimePolicy).toHaveBeenCalledTimes(1);
  });
  it("checks artifact review expiry after runtime lookup", async () => {
    const s = setup();
    s.input.readRuntimePolicy.mockImplementationOnce(async () => {
      s.input.now = () => new Date("2026-10-01T00:00:00.000Z"); return { ...s.runtime };
    });
    await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow("package_review_invalid_or_expired");
  });
  it("rejects native review drift even when server responses agree on the original artifact", async () => {
    const s = setup(); s.input.review = { ...s.input.review, archiveSha256: "c".repeat(64) };
    await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow("private_runtime_identity_or_policy_changed");
  });
  it.each(["readAccount", "readPolicy", "readRuntimePolicy"] as const)("sanitizes untrusted %s failures", async reader => {
    const s = setup(); s.input[reader].mockRejectedValue(Error("untrusted response with host path or credential"));
    await expect(capturePrivateClockRuntimeContext(s.input)).rejects.toThrow("private_runtime_unavailable");
  });
});
