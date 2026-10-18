import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startDesktopProviderCredentialBroker } from
  "../apps/desktop/src/provider-credential-broker";
import type { DesktopProviderCredentialKeyring } from
  "../apps/desktop/src/provider-credential-key";
import {
  decryptStoredProviderCredentialForStorage,
  encryptProviderCredential,
  encryptProviderCredentialForStorage,
  readProviderCredentialEncryptionKeyIdForStorage,
} from "../server/services/brokerage/provider-credential-vault";

const brokers: Array<{ close: () => Promise<void> }> = [];

const key = (): string => crypto.randomBytes(32).toString("base64url");

const startBroker = async (keyring: DesktopProviderCredentialKeyring) => {
  const broker = await startDesktopProviderCredentialBroker({ keyring });
  brokers.push(broker);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("HELIX_PROVIDER_CREDENTIAL_ENCRYPTION_KEY", "");
  vi.stubEnv("HELIX_PROVIDER_CREDENTIAL_BROKER_ORIGIN", broker.origin);
  vi.stubEnv("HELIX_PROVIDER_CREDENTIAL_BROKER_TOKEN", broker.token);
  return broker;
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
});

describe("desktop provider credential broker", () => {
  it("keeps the master key out of the service while resolving one v2 envelope", async () => {
    const activeKey = key();
    const broker = await startBroker({ activeKey, retiredKeys: [] });
    const aad = "fal-connection\nconnection:test\nprofile:owner";
    const secret = "provider-secret-that-must-not-escape";

    const envelope = await encryptProviderCredentialForStorage(
      { api_key: secret },
      aad,
    );

    expect(envelope.encryptedValue).toMatch(/^v2:/u);
    expect(envelope.encryptedValue).not.toContain(secret);
    expect(envelope.keyId).toBe(broker.activeKeyId);
    expect(process.env.HELIX_PROVIDER_CREDENTIAL_ENCRYPTION_KEY).toBe("");
    await expect(decryptStoredProviderCredentialForStorage(
      envelope.encryptedValue,
      aad,
      envelope.keyId,
    )).resolves.toEqual({ api_key: secret });
  });

  it("rejects an untrusted caller and an identity-crossed envelope", async () => {
    const broker = await startBroker({ activeKey: key(), retiredKeys: [] });
    const unauthorized = await fetch(`${broker.origin}/v1/key-id`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
    });
    expect(unauthorized.status).toBe(401);

    const envelope = await encryptProviderCredentialForStorage(
      { token: "secret" },
      "provider\nconnection:one\nprofile:owner",
    );
    await expect(decryptStoredProviderCredentialForStorage(
      envelope.encryptedValue,
      "provider\nconnection:two\nprofile:owner",
      envelope.keyId,
    )).rejects.toThrow();
  });

  it("migrates a legacy environment-key envelope through a retired key", async () => {
    const retiredKey = key();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("HELIX_PROVIDER_CREDENTIAL_ENCRYPTION_KEY", retiredKey);
    const aad = "robinhood-connection\nconnection:legacy\nprofile:owner";
    const legacy = encryptProviderCredential({ token: "legacy" }, aad);

    const broker = await startBroker({
      activeKey: key(),
      retiredKeys: [retiredKey],
    });
    await expect(decryptStoredProviderCredentialForStorage(
      legacy.encryptedValue,
      aad,
      legacy.keyId,
    )).resolves.toEqual({ token: "legacy" });
    await expect(readProviderCredentialEncryptionKeyIdForStorage())
      .resolves.toBe(broker.activeKeyId);

    const migrated = await encryptProviderCredentialForStorage(
      { token: "legacy" },
      aad,
    );
    expect(migrated.encryptedValue).toMatch(/^v2:/u);
    expect(migrated.keyId).toBe(broker.activeKeyId);
  });

  it("fails closed after the native broker stops", async () => {
    const broker = await startBroker({ activeKey: key(), retiredKeys: [] });
    await broker.close();
    brokers.splice(brokers.indexOf(broker), 1);
    await expect(encryptProviderCredentialForStorage(
      { token: "secret" },
      "provider\nconnection:test\nprofile:owner",
    )).rejects.toThrow("provider_credential_broker_unavailable");
  });

  it("mints only an ephemeral GPT Live secret while the long-lived key stays native", async () => {
    const openAiApiKey = "openai-long-lived-key-must-not-cross";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: "sess_native_broker",
      value: "ephemeral-client-secret",
      expires_at: 1_788_360_000,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const broker = await startDesktopProviderCredentialBroker({
      keyring: { activeKey: key(), retiredKeys: [] },
      openAiApiKey,
      fetchImpl,
    });
    brokers.push(broker);

    const response = await fetch(
      `${broker.origin}/v1/openai/realtime/client-secret`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${broker.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-realtime-2.1", voice: "marin" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      schema: "casimir_desktop_provider_credential_broker/1",
      ok: true,
      providerSessionRef: "sess_native_broker",
      ephemeralClientSecret: "ephemeral-client-secret",
      ephemeralClientSecretExpiresAtMs: 1_788_360_000_000,
    });
    expect(JSON.stringify(payload)).not.toContain(openAiApiKey);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${openAiApiKey}`,
        }),
      }),
    );
  });

  it("exchanges GPT Live SDP inside the native boundary", async () => {
    const openAiApiKey = "openai-long-lived-key-must-not-cross";
    const fetchImpl = vi.fn(async () => new Response("v=0\r\nanswer", {
      status: 200,
      headers: { location: "/v1/realtime/calls/rtc_native_broker_123" },
    }));
    const broker = await startDesktopProviderCredentialBroker({
      keyring: { activeKey: key(), retiredKeys: [] },
      openAiApiKey,
      fetchImpl,
    });
    brokers.push(broker);

    const response = await fetch(`${broker.origin}/v1/openai/realtime/sdp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${broker.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        offerSdp: "v=0\r\noffer",
        model: "gpt-realtime-2.1",
        voice: "marin",
        safetyIdentifier: "requester:realtime:native",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      schema: "casimir_desktop_provider_credential_broker/1",
      ok: true,
      answerSdp: "v=0\r\nanswer",
      providerCallId: "rtc_native_broker_123",
    });
    const providerRequest = fetchImpl.mock.calls[0][1];
    expect(providerRequest?.headers).toMatchObject({
      Authorization: `Bearer ${openAiApiKey}`,
    });
    expect(providerRequest?.body).toBeInstanceOf(FormData);
    const session = JSON.parse(String(providerRequest?.body?.get("session")));
    expect(session).toMatchObject({
      model: "gpt-realtime-2.1",
      tools: [],
      tool_choice: "none",
    });
    expect(JSON.stringify(payload)).not.toContain(openAiApiKey);
  });
});
