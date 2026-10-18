import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagedAiDeviceLinkClient } from "../apps/desktop/src/managed-ai-device-link";
import { migration026 } from "../server/db/migrations/026_helix_accounts";
import { migration125 } from "../server/db/migrations/125_managed_ai_device_links";
import { migration130 } from "../server/db/migrations/130_managed_ai_device_text_consent";
import { ManagedAiDeviceLinkStore } from "../server/services/helix-account/managed-ai-device-link-store";
import { createManagedAiDeviceLinksRouter } from "../server/routes/managed-ai-device-links";
import { createManagedAiStatusRouter } from "../server/routes/managed-ai-status";
import { createManagedAiTextTurnRouter } from "../server/routes/managed-ai-text-turn";
import { managedAiClaimMessage, managedAiRequestMessage,
  MANAGED_AI_NATIVE_STATUS_PATH, MANAGED_AI_NATIVE_TEXT_PATH } from "../shared/managed-ai-device-link";

const origin = "http://127.0.0.1:58080";
const requestId = "link_95ad9f25-e4bb-4630-9ae4-4ba5f4de5103";
const grantId = "grant_95ad9f25-e4bb-4630-9ae4-4ba5f4de5103";
const credential = `cbma_${"a".repeat(43)}`;
const expiresAt = new Date(Date.now() + 600_000).toISOString();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (bytes: Buffer) => bytes.toString("utf8").replace(/^encrypted:/u, ""),
};
const response = (value: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
let root: string;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

describe("native website account connection", () => {
  it("completes the real HTTP approval and native claim against one account", async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "casimir-managed-link-"));
    const pg = newDb({ autoCreateForeignKeyIndices: true }).adapters.createPg();
    const pool = new pg.Pool() as unknown as Pool;
    const dbClient = await pool.connect();
    try {
      await migration026.run(dbClient, { enablePgvector: false });
      await migration125.run(dbClient, { enablePgvector: false });
      await migration130.run(dbClient, { enablePgvector: false });
    } finally { dbClient.release(); }
    await pool.query(`INSERT INTO helix_accounts (profile_id, display_name,
      account_type, provider) VALUES ('profile:website', 'Website Owner', 'user', 'google');`);
    const app = express();
    app.use(express.json());
    const store = new ManagedAiDeviceLinkStore({ pool });
    const answerTurn = vi.fn(async (input: { profileId: string; termId: string;
      requestId: string; prompt: string }) => ({
      requestId: input.requestId, responseId: "resp_fixture",
      text: "A bounded answer.", payer: "casimirbot_managed" as const,
      model: "gpt-6-luna" as const, priceRevision: "fixture-v1",
      reservedMicros: 40, reportedMicros: 10,
      inputTokens: 12, outputTokens: 4, remainingMicros: 900,
    }));
    app.use("/api/managed-ai", createManagedAiTextTurnRouter({
      enabled: () => true, deviceTextEnabled: () => true,
      deviceStore: store, resolveTerm: async () => "managed_ai_term:owner",
      service: { answer: answerTurn },
    }));
    app.use("/api/managed-ai", createManagedAiStatusRouter({ deviceStore: store,
      deviceLinksEnabled: () => true, usageStore: { usageForProfile: async () => [] } }));
    app.use("/api/managed-ai", createManagedAiDeviceLinksRouter({ store,
      enabled: () => true, textAuthorizationEnabled: () => true,
      lookupSession: async req =>
        req.get("cookie") === "website_owner=verified" ? { profileId: "profile:website" } : null }));
    const server = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>(resolve => server.once("listening", () => resolve()));
      const address = server.address();
      if (!address || typeof address === "string") throw Error("listen_failed");
      const localOrigin = `http://127.0.0.1:${address.port}`;
      const opened = vi.fn(async (_url: string) => undefined);
      const native = new ManagedAiDeviceLinkClient({ userDataPath: root,
        storage, origin: localOrigin, openExternal: opened });
      expect((await native.start("profile:local")).phase).toBe("pending");
      const approvedRequest = new URL(opened.mock.calls[0][0]).searchParams.get("request");
      expect(approvedRequest).toMatch(/^link_/u);
      await request(app).post(`/api/managed-ai/device-links/${approvedRequest}/approve`)
        .set("Host", "casimirbot.test").set("Origin", "http://casimirbot.test")
        .set("Sec-Fetch-Site", "same-origin")
        .set("Cookie", "website_owner=verified").send({}).expect(200);
      const restarted = new ManagedAiDeviceLinkClient({ userDataPath: root,
        storage, origin: localOrigin });
      expect((await restarted.check("profile:local")).phase).toBe("linked");
      expect((await restarted.check("profile:local")).managedTextAuthorized).toBe(false);
      await expect(restarted.answer("profile:local", "What is this?"))
        .rejects.toMatchObject({ code: "text_not_approved" });
      expect(answerTurn).not.toHaveBeenCalled();
      expect((await restarted.check("profile:local")).phase).toBe("linked");
      const listed = await request(app).get("/api/managed-ai/device-grants")
        .set("Cookie", "website_owner=verified").expect(200);
      expect(listed.body.grants).toHaveLength(1);
      expect(await restarted.disconnect("profile:local")).toMatchObject({
        phase: "unlinked", next: "connect" });
      expect(restarted.inspect("profile:local").phase).toBe("unlinked");
      expect((await request(app).get("/api/managed-ai/device-grants")
        .set("Cookie", "website_owner=verified").expect(200)).body.grants).toHaveLength(0);
      expect((await native.start("profile:local")).phase).toBe("pending");
      const textRequest = new URL(opened.mock.calls[1][0]).searchParams.get("request");
      await request(app).post(`/api/managed-ai/device-links/${textRequest}/approve`)
        .set("Host", "casimirbot.test").set("Origin", "http://casimirbot.test")
        .set("Sec-Fetch-Site", "same-origin")
        .set("Cookie", "website_owner=verified")
        .send({ managed_text_authorized: true }).expect(200);
      const textLinked = await restarted.check("profile:local");
      expect(textLinked).toMatchObject({ phase: "linked",
        managedTextAuthorized: true });
      expect(JSON.stringify(textLinked)).not.toContain("cbma_");
      expect((await request(app).get("/api/managed-ai/device-grants")
        .set("Cookie", "website_owner=verified").expect(200)).body.grants)
        .toEqual([expect.objectContaining({ managedTextAuthorized: true })]);
      const answered = await restarted.answer("profile:local", "What is this?");
      expect(answered).toMatchObject({ text: "A bounded answer.",
        payer: "casimirbot_managed", remainingMicros: 900 });
      expect(answered.requestId).toMatch(/^managed_ai:/u);
      expect(answerTurn).toHaveBeenCalledWith(expect.objectContaining({
        profileId: "profile:website", requestId: answered.requestId,
        prompt: "What is this?",
      }));
      expect(JSON.stringify(answered)).not.toContain("cbma_");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await pool.end();
    }
  });

  it("keeps keys out of the renderer and resumes an approved link after restart", async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "casimir-managed-link-"));
    let publicJwk: JsonWebKey | null = null;
    let approved = false;
    let textCalls = 0;
    let developerPreview = false;
    const opened = vi.fn(async (_url: string) => undefined);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/api/managed-ai/device-links") && init?.method === "POST") {
        publicJwk = JSON.parse(String(init.body)).public_jwk as JsonWebKey;
        const fingerprint = hash(JSON.stringify({ crv: "Ed25519", kty: "OKP", x: publicJwk.x }));
        return response({ request_id: requestId, expires_at: expiresAt,
          key_fingerprint: fingerprint }, 201);
      }
      if (endpoint.endsWith(requestId) && !init?.method)
        return response({ state: approved ? "approved" : "pending" });
      if (endpoint.endsWith(`${requestId}/claim`)) {
        const proof = JSON.parse(String(init?.body)).proof;
        expect(verify(null, Buffer.from(managedAiClaimMessage({ requestId,
          signedAt: proof.signed_at, nonce: proof.nonce })),
        createPublicKey({ key: publicJwk!, format: "jwk" }),
        Buffer.from(proof.signature, "base64url"))).toBe(true);
        return response({ grant_id: grantId, credential, expires_at: expiresAt,
          account_display_name: "Website Owner",
          scope: "casimir.managed_ai.status casimir.managed_ai.text" });
      }
      if (endpoint.endsWith(MANAGED_AI_NATIVE_STATUS_PATH)) {
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe(`Bearer ${credential}`);
        expect(verify(null, Buffer.from(managedAiRequestMessage({ method: "GET",
          path: MANAGED_AI_NATIVE_STATUS_PATH, bodySha256: hash(""),
          signedAt: headers.get("x-casimir-proof-signed-at")!,
          nonce: headers.get("x-casimir-proof-nonce")! })),
        createPublicKey({ key: publicJwk!, format: "jwk" }),
        Buffer.from(headers.get("x-casimir-proof-signature")!, "base64url"))).toBe(true);
        return response({ schema: "casimirbot.managed_ai_status.v1",
          available: false, reason: "offer_not_admitted",
          device_link: { state: "linked", grant_id: grantId, expires_at: expiresAt },
          allowance_preview: { payer: "casimirbot_managed",
            source_kind: developerPreview ? "developer" : "subscription",
            plan_tier: developerPreview ? null : "ai_5",
            processor_mode: developerPreview ? "unknown" : "test",
            state: "active", remaining_micros: 800000,
            period_ends_at: expiresAt } });
      }
      if (endpoint.endsWith(MANAGED_AI_NATIVE_TEXT_PATH)) {
        textCalls++;
        const body = String(init?.body);
        const submitted = JSON.parse(body) as { prompt: string; request_id: string };
        const headers = new Headers(init?.headers);
        expect(verify(null, Buffer.from(managedAiRequestMessage({ method: "POST",
          path: MANAGED_AI_NATIVE_TEXT_PATH, bodySha256: hash(body),
          signedAt: headers.get("x-casimir-proof-signed-at")!,
          nonce: headers.get("x-casimir-proof-nonce")! })),
        createPublicKey({ key: publicJwk!, format: "jwk" }),
        Buffer.from(headers.get("x-casimir-proof-signature")!, "base64url"))).toBe(true);
        if (textCalls > 1) throw Error("simulated lost response");
        return response({ schema: "casimirbot.managed_text_turn.v1",
          requestId: submitted.request_id, text: "Bounded reply",
          payer: "casimirbot_managed", model: "gpt-6-luna",
          inputTokens: 12, outputTokens: 5, remainingMicros: 700000 });
      }
      throw Error(`unexpected ${endpoint}`);
    }) as typeof fetch;
    const create = () => new ManagedAiDeviceLinkClient({ userDataPath: root,
      storage, fetchImpl, origin, openExternal: opened });
    const client = create();
    const started = await client.start("profile:local-owner");
    expect(started.phase).toBe("pending");
    expect(JSON.stringify(started)).not.toContain(credential);
    expect(opened).toHaveBeenCalledWith(`${origin}/account/connect?request=${requestId}`);
    expect((await create().check("profile:local-owner")).phase).toBe("pending");
    approved = true;
    const linked = await create().check("profile:local-owner");
    expect(linked.phase).toBe("linked");
    expect(linked.managedTextAuthorized).toBe(true);
    expect(linked.allowance).toMatchObject({ planTier: "ai_5",
      processorMode: "test", remainingMicros: 800000 });
    developerPreview = true;
    expect((await create().check("profile:local-owner")).allowance).toMatchObject({
      sourceKind: "developer", planTier: null, processorMode: "unknown",
    });
    expect(JSON.stringify(linked)).not.toContain(credential);
    expect((await create().check("profile:local-owner")).phase).toBe("linked");
    expect(await create().answer("profile:local-owner", "A short question"))
      .toMatchObject({ text: "Bounded reply", payer: "casimirbot_managed" });
    await expect(create().answer("profile:local-owner", "A second question"))
      .rejects.toMatchObject({ code: "outcome_unconfirmed",
        requestId: expect.stringMatching(/^managed_ai:/u) });
    expect(textCalls).toBe(2); // Never retry an uncertain paid request.
    expect(create().inspect("profile:other").phase).toBe("unlinked");
    const files = readFileSync(path.join(root, "managed-ai-device-links",
      `${hash("profile:local-owner")}.dpapi`), "utf8");
    expect(files).toContain("encrypted:");
    expect(await create().disconnect("profile:local-owner")).toMatchObject({
      phase: "unavailable", next: "disconnect" });
    expect(create().inspect("profile:local-owner").phase).toBe("linked");
  });

  it("reports disabled website support without storing a grant or opening approval", async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "casimir-managed-link-"));
    const opened = vi.fn(async (_url: string) => undefined);
    const client = new ManagedAiDeviceLinkClient({ userDataPath: root, storage, origin,
      openExternal: opened, fetchImpl: vi.fn(async () => response({ error: "unavailable" }, 404)) as typeof fetch });
    expect((await client.start("profile:local-owner")).phase).toBe("unavailable");
    expect(client.inspect("profile:local-owner").phase).toBe("unlinked");
    expect(opened).not.toHaveBeenCalled();
  });
});
