import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isValidDesktopProviderCredentialKey,
  loadOrCreateDesktopProviderCredentialKey,
  loadOrCreateDesktopProviderCredentialKeyring,
  resolveProviderCredentialKeyVaultPath,
  rotateDesktopProviderCredentialKey,
  type ProviderCredentialKeyStoragePort,
} from "../apps/desktop/src/provider-credential-key";
import { buildDesktopServiceEnvironment } from
  "../apps/desktop/src/service-environment";

const roots: string[] = [];

const createRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), "casimir-provider-key-"));
  roots.push(root);
  return root;
};

const createStorage = (): ProviderCredentialKeyStoragePort => ({
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, "utf8").map((byte) => byte ^ 0xa5),
  decryptString: (value) => {
    return Buffer.from(value).map((byte) => byte ^ 0xa5).toString("utf8");
  },
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("desktop provider credential key", () => {
  it("creates one protected key and reuses it across launches", () => {
    const root = createRoot();
    const storage = createStorage();
    const first = loadOrCreateDesktopProviderCredentialKey({
      userDataPath: root,
      storage,
    });
    const second = loadOrCreateDesktopProviderCredentialKey({
      userDataPath: root,
      storage,
    });

    expect(second).toBe(first);
    expect(isValidDesktopProviderCredentialKey(first)).toBe(true);
    const persisted = readFileSync(
      resolveProviderCredentialKeyVaultPath(root),
      "utf8",
    );
    expect(persisted).not.toContain(first);
  });

  it("migrates an existing valid deployment key into protected storage", () => {
    const root = createRoot();
    const configuredKey = Buffer.alloc(32, 7).toString("base64url");
    const resolved = loadOrCreateDesktopProviderCredentialKey({
      userDataPath: root,
      storage: createStorage(),
      configuredKey,
    });
    expect(resolved).toBe(configuredKey);
    expect(readFileSync(resolveProviderCredentialKeyVaultPath(root), "utf8"))
      .not.toContain(configuredKey);
  });

  it("migrates the legacy protected key file to the bounded keyring schema", () => {
    const root = createRoot();
    const storage = createStorage();
    const legacyKey = Buffer.alloc(32, 8).toString("base64url");
    const vaultPath = resolveProviderCredentialKeyVaultPath(root);
    mkdirSync(path.dirname(vaultPath), { recursive: true });
    writeFileSync(
      vaultPath,
      storage.encryptString(JSON.stringify({
        schemaVersion: "casimir_desktop_provider_credential_key/1",
        key: legacyKey,
      })),
      { flag: "wx" },
    );

    const keyring = loadOrCreateDesktopProviderCredentialKeyring({
      userDataPath: root,
      storage,
    });
    const migrated = JSON.parse(
      storage.decryptString(readFileSync(vaultPath)).toString(),
    ) as Record<string, unknown>;

    expect(keyring).toEqual({ activeKey: legacyKey, retiredKeys: [] });
    expect(migrated.schemaVersion).toBe(
      "casimir_desktop_provider_credential_keyring/2",
    );
    expect(readFileSync(vaultPath, "utf8")).not.toContain(legacyKey);
  });

  it("fails closed when secure storage is unavailable or corrupt", () => {
    const unavailable = createRoot();
    expect(() => loadOrCreateDesktopProviderCredentialKey({
      userDataPath: unavailable,
      storage: {
        ...createStorage(),
        isEncryptionAvailable: () => false,
      },
    })).toThrow("desktop_provider_credential_key_vault_unavailable");

    const corrupt = createRoot();
    const vaultPath = resolveProviderCredentialKeyVaultPath(corrupt);
    mkdirSync(path.dirname(vaultPath), { recursive: true });
    writeFileSync(vaultPath, "not-protected", { flag: "wx" });
    expect(() => loadOrCreateDesktopProviderCredentialKey({
      userDataPath: corrupt,
      storage: createStorage(),
    })).toThrow("desktop_provider_credential_key_vault_invalid");
    expect(readFileSync(vaultPath, "utf8")).toBe("not-protected");
  });

  it("rejects an invalid configured key instead of silently replacing it", () => {
    expect(() => loadOrCreateDesktopProviderCredentialKey({
      userDataPath: createRoot(),
      storage: createStorage(),
      configuredKey: "short-secret",
    })).toThrow("desktop_provider_credential_key_configured_invalid");
  });

  it("passes only an ephemeral broker session to the service", () => {
    const token = Buffer.alloc(32, 3).toString("base64url");
    const environment = buildDesktopServiceEnvironment({
      processEnv: {
        SystemRoot: "C:\\Windows",
        HELIX_PROVIDER_CREDENTIAL_ENCRYPTION_KEY:
          Buffer.alloc(32, 9).toString("base64url"),
      },
      userDataPath: "C:\\Users\\test\\AppData\\Roaming\\CasimirBot",
      serviceOrigin: "http://127.0.0.1:32123",
      providerCredentialBroker: {
        origin: "http://127.0.0.1:32124",
        token,
      },
      mcpTransitionBroker: {
        origin: "http://127.0.0.1:32125",
        token: Buffer.alloc(32, 4).toString("base64url"),
      },
      friendsPartiesCoordinationBroker: null,
      deviceId: `desktop_device_${Buffer.alloc(16, 2).toString("base64url")}`,
    });

    expect(environment.HELIX_PROVIDER_CREDENTIAL_BROKER_ORIGIN).toBe(
      "http://127.0.0.1:32124",
    );
    expect(environment.HELIX_PROVIDER_CREDENTIAL_BROKER_TOKEN).toBe(token);
    expect(environment.HELIX_PROVIDER_CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
  });

  it("rotates the active key while retaining bounded migration keys", () => {
    const root = createRoot();
    const storage = createStorage();
    const original = loadOrCreateDesktopProviderCredentialKeyring({
      userDataPath: root,
      storage,
    });
    const rotated = rotateDesktopProviderCredentialKey({
      userDataPath: root,
      storage,
    });
    const reloaded = loadOrCreateDesktopProviderCredentialKeyring({
      userDataPath: root,
      storage,
    });

    expect(rotated.activeKey).not.toBe(original.activeKey);
    expect(rotated.retiredKeys).toContain(original.activeKey);
    expect(reloaded).toEqual(rotated);
  });
});
