import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalDeveloperAccess, developerFingerprint, developerKeyPair, signDeveloperPayload } from "../apps/desktop/src/local-developer-access";
import { LocalDeveloperAccessController } from "../apps/desktop/src/local-developer-access-controller";
import { readDeveloperUsbDocument, writeDeveloperUsbDocument } from "../apps/desktop/src/local-developer-usb-files";
import { LocalDeveloperLeaseStore } from "../server/services/helix-account/local-developer-lease";
import { buildHelixAccountCapabilityPolicy, type HelixAccountSession } from "../shared/helix-account-session";
import { localDeveloperLeasePayloadSchema } from "../shared/local-developer-grant";
import { randomUUID } from "node:crypto";

// Synthetic vault port only; live qualification must separately exercise Windows protection.
const storage = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`test:${s}`),
  decryptString: (b: Buffer) => { if (!b.toString().startsWith("test:")) throw Error(); return b.toString().slice(5); } };
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "casimir-dev-grant-test-")); roots.push(root);
  let now = 1800000000000;
  const make = (id: string) => new LocalDeveloperAccess({ userDataPath: path.join(root, id), deviceId: id, storage, now: () => now });
  const issuer = make("issuer-device"), recipient = make("recipient-device");
  issuer.initializeIssuer("owner-profile");
  const request = recipient.request("friend-profile");
  const bundle = issuer.issue(request, "owner-profile");
  return { root, issuer, recipient, request, bundle, make, advance: (ms: number) => { now += ms; }, now: () => now };
}
describe("USB local developer qualification", () => {
  it("retains exact profile, survives vault reload, and exports no private key", () => {
    const f = fixture();
    f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    expect(f.make("recipient-device").active("friend-profile")?.payload.profileId).toBe("friend-profile");
    expect(JSON.stringify(f.bundle)).not.toMatch(/privateKey|password|token|cookie/i);
    expect(() => f.recipient.active("other-profile")).toThrow();
  });
  it("rejects copied grant on another device or key", () => {
    const f = fixture();
    expect(() => f.make("different-device").import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey))).toThrow();
    const otherRoot = mkdtempSync(path.join(tmpdir(), "casimir-dev-other-key-")); roots.push(otherRoot);
    const other = new LocalDeveloperAccess({ userDataPath: otherRoot, deviceId: "recipient-device", storage, now: f.now });
    expect(() => other.preview(f.bundle, "friend-profile")).toThrow();
  });
  it.each(["profileId", "deviceId", "expiresAt", "scope", "audience"])("rejects tampered %s", field => {
    const f = fixture(); const altered = structuredClone(f.bundle);
    (altered.grants[0].payload as any)[field] = field === "expiresAt" ? f.now() + 60000 : "poison";
    expect(() => f.recipient.import(altered, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey))).toThrow();
    expect(f.recipient.active("friend-profile")).toBeNull();
  });
  it("rejects unknown claims and substituted issuer key", () => {
    const f = fixture(); const altered: any = structuredClone(f.bundle);
    altered.grants[0].payload.environmentAuthority = true;
    expect(() => f.recipient.preview(altered, "friend-profile")).toThrow();
    altered.grants[0].payload = f.bundle.grants[0].payload;
    altered.issuerPublicKey = developerKeyPair().publicKey;
    expect(() => f.recipient.preview(altered, "friend-profile")).toThrow();
    expect(() => f.recipient.import(f.bundle, "friend-profile", "unapproved")).toThrow();
  });
  it("expires imported grants and denies clock rollback", () => {
    const f = fixture(); f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    f.advance(24 * 60 * 60 * 1000); expect(() => f.recipient.active("friend-profile")).toThrow();
    expect(f.recipient.status("friend-profile")).toMatchObject({ phase: "inactive",
      expiredAt: f.bundle.grants[0].payload.expiresAt });
    expect(f.recipient.status("other-profile").expiredAt).toBeNull();
    f.advance(-60000); expect(() => f.recipient.active("friend-profile")).toThrow(/clock_rollback/);
    expect(f.recipient.status("friend-profile").expiredAt).toBeNull();
  });
  it("applies revocation even when the corresponding grant is no longer importable", () => {
    const f = fixture(); f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    f.issuer.revoke(f.bundle.grants[0].payload.grantId, "owner-profile");
    f.recipient.importRevocations(f.issuer.bundle("owner-profile"));
    expect(() => f.recipient.active("friend-profile")).toThrow(/revoked/);
    expect(() => f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey))).toThrow(/rollback/);
  });
  it("does not auto-trust an issuer through its revocation bundle", () => {
    const f = fixture(); expect(() => f.recipient.importRevocations(f.bundle)).toThrow(/not_trusted/);
  });
  it("requires the issuer owner and supports individual local disable", () => {
    const f = fixture(); expect(() => f.issuer.issue(f.request, "other-profile")).toThrow();
    expect(() => f.issuer.revoke(f.bundle.grants[0].payload.grantId, "other-profile")).toThrow();
    f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    f.recipient.disable("friend-profile"); expect(f.recipient.active("friend-profile")).toBeNull();
    f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    expect(f.recipient.active("friend-profile")).not.toBeNull();
  });
  it("chooses the latest renewed grant, not the first expired grant", () => {
    const f = fixture(); f.advance(1000);
    const next = f.issuer.issue(f.recipient.request("friend-profile"), "owner-profile");
    f.recipient.import(next, "friend-profile", developerFingerprint(next.issuerPublicKey));
    expect(f.recipient.active("friend-profile")?.payload.grantId).toBe(next.grants[0].payload.grantId);
  });
  it("rejects unavailable protected storage", () => {
    const f = fixture(); const vault = new LocalDeveloperAccess({ userDataPath: f.root, deviceId: "device", storage: { ...storage, isEncryptionAvailable: () => false } });
    expect(() => vault.request("profile")).toThrow(/vault_unavailable/);
  });
  it("distinguishes unreadable protected data without replacing it", () => {
    const f = fixture(); const file = path.join(f.root, "recipient-device", "security", "local-developer.dpapi");
    writeFileSync(file, "invalid protected data");
    expect(() => f.make("recipient-device").request("friend-profile")).toThrow(/vault_unreadable/);
    expect(readFileSync(file, "utf8")).toBe("invalid protected data");
  });
  it("keeps an encrypted previous copy and refuses to overwrite a zero-filled live vault", () => {
    const f = fixture(); const file = path.join(f.root, "recipient-device", "security", "local-developer.dpapi");
    f.recipient.request("friend-profile");
    const previous = readFileSync(`${file}.previous`);
    expect(JSON.parse(storage.decryptString(previous)).device.publicKey).toBeTruthy();
    const damaged = Buffer.alloc(readFileSync(file).length);
    writeFileSync(file, damaged);
    expect(() => f.recipient.request("friend-profile")).toThrow(/vault_unreadable/);
    expect(readFileSync(file)).toEqual(damaged);
    expect(readFileSync(`${file}.previous`)).toEqual(previous);
  });
  it("distinguishes invalid saved format from an invalid key pair without replacing either", () => {
    const f = fixture(); const file = path.join(f.root, "recipient-device", "security", "local-developer.dpapi");
    const original = readFileSync(file);
    writeFileSync(file, storage.encryptString(JSON.stringify({ schema: "unexpected" })));
    const malformed = readFileSync(file);
    expect(() => f.make("recipient-device").request("friend-profile")).toThrow(/vault_schema_invalid/);
    expect(readFileSync(file)).toEqual(malformed);

    const wrongKey = JSON.parse(storage.decryptString(original));
    wrongKey.device.publicKey = developerKeyPair().publicKey;
    writeFileSync(file, storage.encryptString(JSON.stringify(wrongKey)));
    const modified = readFileSync(file);
    expect(() => f.make("recipient-device").request("friend-profile")).toThrow(/vault_key_invalid/);
    expect(readFileSync(file)).toEqual(modified);
  });
  it("rejects a signed but not-yet-valid or excessively long grant", () => {
    const f = fixture(); const otherKeys = developerKeyPair();
    for (const bad of [{ issuedAt: f.now() + 60000, expiresAt: f.now() + 120000 },
      { issuedAt: f.now(), expiresAt: f.now() + 25 * 60 * 60 * 1000 }]) {
      const bundle = structuredClone(f.bundle); bundle.issuerPublicKey = otherKeys.publicKey;
      bundle.grants[0].payload = { ...bundle.grants[0].payload, issuerId: developerFingerprint(otherKeys.publicKey), ...bad };
      bundle.grants[0].signature = signDeveloperPayload(bundle.grants[0].payload, otherKeys.privateKey);
      bundle.revocations.payload.issuerId = developerFingerprint(otherKeys.publicKey);
      bundle.revocations.signature = signDeveloperPayload(bundle.revocations.payload, otherKeys.privateKey);
      expect(() => f.recipient.preview(bundle, "friend-profile")).toThrow(/invalid_time/);
    }
  });
  it("reads bounded JSON and refuses overwrite", () => {
    const f = fixture(); const file = path.join(f.root, "grant.json");
    writeDeveloperUsbDocument(file, f.bundle); expect(readDeveloperUsbDocument(file)).toEqual(f.bundle);
    expect(() => writeDeveloperUsbDocument(file, f.bundle)).toThrow();
    const before = readFileSync(file); expect(readFileSync(file)).toEqual(before);
    expect(() => writeDeveloperUsbDocument(path.join(f.root, "oversized.json"), { text: "x".repeat(140000) })).toThrow();
    const oversized = path.join(f.root, "oversized.json"); writeFileSync(oversized, "x".repeat(140000));
    expect(() => readDeveloperUsbDocument(oversized)).toThrow();
  });
});

function session(): HelixAccountSession {
  return { session_id: "account_session:test-session", status: "active", profile: { profile_id: "friend-profile", auth_mode: "password_account" },
    account_policy: buildHelixAccountCapabilityPolicy("user") } as HelixAccountSession;
}
describe("native developer lease", () => {
  function fixtureLease() {
    let now = 1800000000000, mono = 0, enabled = true;
    const keys = developerKeyPair(), account = session();
    const store = new LocalDeveloperLeaseStore({ enabled: () => enabled, publicKey: () => keys.publicKey,
      deviceId: () => "device", now: () => now, monotonicNow: () => mono });
    const proof = () => {
      const payload = localDeveloperLeasePayloadSchema.parse({ schema: "casimir.local_developer_native_lease.v1", action: "activate",
        sessionId: account.session_id, profileId: account.profile.profile_id, deviceId: "device", grantId: randomUUID(),
        issuedAt: now, expiresAt: now + 30000, nonce: randomUUID() });
      return { payload, signature: signDeveloperPayload(payload, keys.privateKey) };
    };
    return { keys, store, account, proof, advance: (ms: number) => { now += ms; mono += ms; }, rollback: () => { now -= 60000; mono += 30001; }, disable: () => { enabled = false; } };
  }
  it("overlays developer policy without mutating profile or stored account policy", () => {
    const f = fixtureLease(); f.store.accept(f.proof(), f.account);
    const next = f.store.apply(f.account);
    expect(next.account_policy.account_type).toBe("developer"); expect(next.profile).toBe(f.account.profile);
    expect(f.account.account_policy.account_type).toBe("user");
    f.advance(30000); expect(f.store.apply(f.account)).toBe(f.account);
  });
  it("rejects replay, forged native proof and mismatched identities", () => {
    const f = fixtureLease(); const p = f.proof(); f.store.accept(p, f.account);
    expect(() => f.store.accept(p, f.account)).toThrow(/replayed/);
    const forged = f.proof(); forged.payload.profileId = "other";
    expect(() => f.store.accept(forged, f.account)).toThrow();
    forged.payload.profileId = f.account.profile.profile_id; forged.signature = "A".repeat(86);
    expect(() => f.store.accept(forged, f.account)).toThrow(/invalid/);
    expect(() => f.store.accept(f.proof(), { ...f.account, profile: { ...f.account.profile, auth_mode: "guest" } })).toThrow();
  });
  it("requires enabled installed runtime, bounded fresh proof and monotonic expiry", () => {
    const f = fixtureLease(); const p = f.proof(); p.payload.expiresAt += 1;
    expect(() => f.store.accept(p, f.account)).toThrow(/stale/);
    f.store.accept(f.proof(), f.account); f.rollback(); expect(f.store.apply(f.account)).toBe(f.account);
    f.disable(); expect(() => f.store.accept(f.proof(), f.account)).toThrow(/unavailable/);
  });
});

describe("native developer controller consent", () => {
  it("activates an exact private profile with one native review and one public USB backup", async () => {
    const f = fixture(); const vault = f.make("self-device");
    const confirmed: string[] = []; const published: string[] = []; const saved: object[] = [];
    const nativeKeys = developerKeyPair();
    const account = { ...session(), session_id: "account_session:self",
      profile: { ...session().profile, profile_id: "self-profile" } } as HelixAccountSession;
    const leaseStore = new LocalDeveloperLeaseStore({ enabled: () => true,
      publicKey: () => nativeKeys.publicKey, deviceId: () => "self-device",
      now: f.now, monotonicNow: () => 0 });
    const controller = new LocalDeveloperAccessController({ enabled: true,
      vault, deviceId: "self-device", nativePrivateKey: nativeKeys.privateKey,
      readAccount: async () => ({ sessionId: "account_session:self", profileId: "self-profile", accountType: "user" }),
      confirm: async (title) => { confirmed.push(title); return true; },
      readDocument: async () => null, saveDocument: async () => { throw Error("unexpected picker"); },
      saveOwnGrant: async document => { saved.push(document); return true; },
      publish: async proof => { leaseStore.accept(proof, account);
        published.push((proof as { payload: { action: string } }).payload.action); }, now: f.now });
    expect(await controller.invoke("activate-self")).toMatchObject({ phase: "active", ownsIssuer: true });
    expect(confirmed).toEqual(["Activate private developer access"]);
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved[0])).not.toMatch(/privateKey|password|token|cookie/i);
    expect(vault.active("self-profile")?.payload.deviceId).toBe("self-device");
    expect(published).toEqual(["activate"]);
    expect(leaseStore.apply(account).account_policy.account_type).toBe("developer");
    expect(await controller.invoke("activate-self")).toMatchObject({ phase: "active" });
    expect(confirmed).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });
  it("does not silently activate when native review or USB backup is unavailable", async () => {
    const f = fixture(); const vault = f.make("self-device");
    let approve = false; const published: string[] = [];
    const controller = new LocalDeveloperAccessController({ enabled: true,
      vault, deviceId: "self-device", nativePrivateKey: developerKeyPair().privateKey,
      readAccount: async () => ({ sessionId: "account_session:self", profileId: "self-profile", accountType: "user" }),
      confirm: async () => approve, readDocument: async () => null,
      saveDocument: async () => false, saveOwnGrant: async () => false,
      publish: async proof => { published.push((proof as { payload: { action: string } }).payload.action); }, now: f.now });
    expect(await controller.invoke("activate-self")).toMatchObject({ phase: "inactive", issuerInitialized: false });
    approve = true;
    expect(await controller.invoke("activate-self")).toMatchObject({ phase: "unavailable",
      detail: expect.stringContaining("backup was not saved") });
    expect(vault.status("self-profile").issuerInitialized).toBe(true);
    expect(vault.active("self-profile")).toBeNull();
    expect(published).not.toContain("activate");
  });
  it("checks the USB destination before creating an issuer or issuing a grant", async () => {
    const f = fixture(); const vault = f.make("self-device");
    const controller = new LocalDeveloperAccessController({ enabled: true,
      vault, deviceId: "self-device", nativePrivateKey: developerKeyPair().privateKey,
      readAccount: async () => ({ sessionId: "account_session:self", profileId: "self-profile", accountType: "user" }),
      confirm: async () => true, readDocument: async () => null,
      saveDocument: async () => { throw Error("unexpected picker"); },
      ensureOwnGrantDestination: async () => { throw Error("developer_usb_unavailable"); },
      saveOwnGrant: async () => { throw Error("unexpected save"); },
      publish: async () => { throw Error("unexpected lease"); }, now: f.now });
    expect(await controller.invoke("activate-self")).toMatchObject({ phase: "unavailable",
      detail: expect.stringContaining("Connect the developer USB drive") });
    expect(vault.status("self-profile")).toMatchObject({ phase: "inactive", issuerInitialized: false });
  });
  it("does not clear a live lease for a transient account read failure, but clears on confirmed sign-out", async () => {
    const f = fixture();
    f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    const actions: string[] = [];
    let readFailure: "none" | "transient" | "signed-out" = "none";
    const controller = new LocalDeveloperAccessController({ enabled: true,
      vault: f.recipient, deviceId: "recipient-device", nativePrivateKey: developerKeyPair().privateKey,
      readAccount: async () => {
        if (readFailure === "transient") throw Error("developer_owner_window_unavailable");
        if (readFailure === "signed-out") throw Error("developer_account_required");
        return { sessionId: "account_session:test-session", profileId: "friend-profile", accountType: "user" } as const;
      },
      confirm: async () => false, readDocument: async () => null,
      saveDocument: async () => false,
      publish: async proof => { actions.push((proof as { payload: { action: string } }).payload.action); }, now: f.now });
    await controller.refresh();
    expect(actions).toEqual(["activate"]);
    readFailure = "transient";
    await controller.refresh();
    expect(actions).toEqual(["activate"]);
    readFailure = "none";
    expect(await controller.invoke("inspect")).toMatchObject({ phase: "active", nativeLease: {
      lastRefreshIssue: { reason: "account_unavailable" } } });
    expect(actions).toEqual(["activate", "activate"]);
    readFailure = "signed-out";
    await controller.refresh();
    expect(actions).toEqual(["activate", "activate", "clear"]);
  });
  it("records a failed native lease publication and retries without claiming acknowledgement", async () => {
    const f = fixture();
    f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    let attempts = 0;
    const controller = new LocalDeveloperAccessController({ enabled: true,
      vault: f.recipient, deviceId: "recipient-device", nativePrivateKey: developerKeyPair().privateKey,
      readAccount: async () => ({ sessionId: "account_session:test-session", profileId: "friend-profile", accountType: "user" }),
      confirm: async () => false, readDocument: async () => null, saveDocument: async () => false,
      publish: async () => { if (++attempts === 1) throw Error("transport unavailable"); }, now: f.now });
    await controller.refresh();
    expect(attempts).toBe(1);
    expect(await controller.invoke("inspect")).toMatchObject({ phase: "active", nativeLease: {
      lastAcknowledgedAt: f.now(), lastRefreshIssue: { reason: "lease_publish_failed" },
    } });
    expect(attempts).toBe(2);
  });
  it("does not clear on a transient vault read failure but clears a signed revocation", async () => {
    const f = fixture();
    f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    const actions: string[] = [];
    const controller = new LocalDeveloperAccessController({ enabled: true,
      vault: f.recipient, deviceId: "recipient-device", nativePrivateKey: developerKeyPair().privateKey,
      readAccount: async () => ({ sessionId: "account_session:test-session", profileId: "friend-profile", accountType: "user" }),
      confirm: async () => false, readDocument: async () => null, saveDocument: async () => false,
      publish: async proof => { actions.push((proof as { payload: { action: string } }).payload.action); }, now: f.now });
    await controller.refresh();
    expect(actions).toEqual(["activate"]);
    vi.spyOn(f.recipient, "active").mockImplementationOnce(() => { throw Error("developer_vault_unavailable"); });
    await controller.refresh();
    expect(actions).toEqual(["activate"]);
    expect(await controller.invoke("inspect")).toMatchObject({ phase: "active", nativeLease: {
      lastRefreshIssue: { reason: "vault_unavailable" },
    } });
    f.issuer.revoke(f.bundle.grants[0].payload.grantId, "owner-profile");
    f.recipient.importRevocations(f.issuer.bundle("owner-profile"));
    await controller.refresh();
    expect(actions).toEqual(["activate", "activate", "clear"]);
  });
  it("explains an expired imported grant without restoring developer policy", async () => {
    const f = fixture();
    f.recipient.import(f.bundle, "friend-profile", developerFingerprint(f.bundle.issuerPublicKey));
    f.advance(24 * 60 * 60 * 1000);
    let published = 0;
    const controller = new LocalDeveloperAccessController({ enabled: true,
      vault: f.recipient, deviceId: "recipient-device",
      nativePrivateKey: developerKeyPair().privateKey,
      readAccount: async () => ({ sessionId: "account_session:test-session",
        profileId: "friend-profile", accountType: "user" }),
      confirm: async () => false, readDocument: async () => null,
      saveDocument: async () => false, publish: async () => { published++; }, now: f.now });
    expect(await controller.invoke("inspect")).toMatchObject({ phase: "inactive",
      detail: expect.stringContaining("previously imported USB developer grant expired") });
    expect(published).toBe(0);
  });
  it("does not offer issuer creation in a public/disabled build", async () => {
    const f = fixture(); let reads = 0, confirms = 0;
    const controller = new LocalDeveloperAccessController({ enabled: false, vault: f.recipient, deviceId: "recipient-device",
      nativePrivateKey: developerKeyPair().privateKey, readAccount: async () => { reads++; throw Error(); },
      confirm: async () => { confirms++; return true; }, readDocument: async () => null,
      saveDocument: async () => true, publish: async () => {}, now: f.now });
    expect((await controller.invoke("initialize-issuer")).phase).toBe("unavailable");
    expect((await controller.invoke("activate-self")).phase).toBe("unavailable");
    expect(reads).toBe(0); expect(confirms).toBe(0);
  });
  it("denies a profile switch during native approval", async () => {
    const f = fixture(); const vault = f.make("new-device"); let switched = false;
    const controller = new LocalDeveloperAccessController({ enabled: true, vault, deviceId: "new-device",
      nativePrivateKey: developerKeyPair().privateKey, readAccount: async () => ({
        sessionId: switched ? "account_session:new-session" : "account_session:test-session",
        profileId: switched ? "new-profile" : "old-profile", accountType: "user" }),
      confirm: async () => { switched = true; return true; }, readDocument: async () => null,
      saveDocument: async () => true, publish: async () => {}, now: f.now });
    expect((await controller.invoke("initialize-issuer")).phase).toBe("unavailable");
    expect(vault.status("old-profile").issuerInitialized).toBe(false);
  });
  it("cancellation does not initialize an issuer or publish developer access", async () => {
    const f = fixture(); const keys = developerKeyPair(); const clean = f.make("clean-device");
    let published = 0;
    const controller = new LocalDeveloperAccessController({ enabled: true, vault: clean, deviceId: "clean-device",
      nativePrivateKey: keys.privateKey, readAccount: async () => ({ sessionId: "account_session:test-session", profileId: "profile", accountType: "user" }),
      confirm: async () => false, readDocument: async () => null, saveDocument: async () => false,
      publish: async () => { published++; }, now: f.now });
    const result = await controller.invoke("initialize-issuer");
    expect(result.phase).toBe("inactive"); expect(clean.status("profile").issuerInitialized).toBe(false);
    expect(published).toBe(0);
  });
});
