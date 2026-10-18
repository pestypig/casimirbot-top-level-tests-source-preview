import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { channel } from "node:diagnostics_channel";
import { signInLocalAccountSession } from "../../server/services/helix-account/account-session-store";
import { setHelixSessionCookie } from "../../server/services/helix-account/session-cookie";
import { hostedBudgetStore } from "../../server/services/helix-account/hosted-budget-store";
import { createDefaultReferenceCanvasService } from "../../server/services/reference-canvas/default-service";
import { createHostedReferenceCanvasRouter } from "../../server/routes/hosted-reference-canvas";
import { ensureDatabase, getPool } from "../../server/db/client";

/** Real account/room/budget/native services; synthetic login and local proof only. */
export async function startLocalCanvasFixture() {
  await ensureDatabase();
  const directory = mkdtempSync(path.join(tmpdir(), "casimir-local-canvas-"));
  const service = createDefaultReferenceCanvasService(path.join(directory, "canvas.json"));
  const app = express(); app.use(express.json({ limit: "16kb" }));
  app.post("/fixture/session", async (req, res) => {
    const receipt = await signInLocalAccountSession({ profile_id: String(req.body.profile_id), display_name: "Synthetic local test identity", account_type: req.body.account_type ?? "developer" });
    if (!receipt.session) return res.status(401).json({ error: "fixture_session_failed" });
    await getPool().query("UPDATE helix_account_sessions SET expires_at=$1 WHERE session_id=$2", [new Date(Date.now() + 3600000).toISOString(), receipt.session.session_id]);
    setHelixSessionCookie(res, receipt.session.session_id);
    res.json({ profile_id: receipt.session.profile.profile_id, synthetic: true });
  });
  app.use("/api/agi/hosted/v1", createHostedReferenceCanvasRouter({ service, localConfirmation: req => req.get("x-fixture-native-proof") === "synthetic-local-proof" }));
  app.use(express.static(path.resolve("public")));
  const server: Server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address() as { port: number }; const origin = `http://127.0.0.1:${address.port}`;
  let providerCalls = 0;
  const requestChannel = channel("undici:request:create");
  const observeRequest = (message: unknown) => { const host = new URL(String((message as { request: { origin: string } }).request.origin)).hostname; if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) providerCalls++; };
  requestChannel.subscribe(observeRequest);
  const hostId = `canvas-host-${randomUUID()}`; const guestId = `canvas-member-${randomUUID()}`;
  async function identity(profileId: string, accountType = "developer") {
    const response = await fetch(origin + "/fixture/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile_id: profileId, account_type: accountType }) });
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const session = await (await fetch(origin + "/api/agi/hosted/v1/session", { headers: { Cookie: cookie } })).json();
    return { profileId, cookie, csrf: session.csrf_token as string };
  }
  const host = await identity(hostId); const guest = await identity(guestId); await hostedBudgetStore.startTrial(hostId);
  const samples: Array<{ path: string; status: number; elapsedMs: number; requestBytes: number; responseBytes: number }> = [];
  async function call(actor: typeof host, suffix: string, body?: unknown, options: { key?: string; native?: boolean; csrf?: string; origin?: string } = {}) {
    const started = performance.now(); const serialized = body === undefined ? "" : JSON.stringify(body);
    const response = await fetch(origin + "/api/agi/hosted/v1" + suffix, { method: body === undefined ? "GET" : "POST", headers: { Cookie: actor.cookie, Origin: options.origin ?? origin, "X-CSRF-Token": options.csrf ?? actor.csrf, "Idempotency-Key": options.key ?? randomUUID(), ...(options.native ? { "x-fixture-native-proof": "synthetic-local-proof" } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: serialized }) });
    const text = await response.text(); samples.push({ path: suffix.replace(/_[0-9a-f-]{36}/g, "_id"), status: response.status, elapsedMs: performance.now() - started, requestBytes: Buffer.byteLength(serialized), responseBytes: Buffer.byteLength(text) });
    return { status: response.status, body: JSON.parse(text) };
  }
  async function journey() {
    const created = await call(host, "/rooms", { title: "Private synthetic fixture" });
    if (created.status !== 200) throw Error(JSON.stringify(created.body));
    const roomId = created.body.roomId; const prefix = `/rooms/${roomId}`;
    const invitation = await call(host, prefix + "/invites", { invitee_profile_id: guestId });
    const joined = await call(guest, "/invitations/accept", { invitation_id: invitation.body.invitation_id });
    if (joined.status !== 200) throw Error(JSON.stringify(joined.body));
    const share = await call(host, prefix + "/program-shares", {});
    const confirmed = await call(host, prefix + `/program-shares/${share.body.shareId}/confirm`, { expected_share_revision: share.body.revision }, { native: true });
    if (confirmed.status !== 200) throw Error(JSON.stringify(confirmed.body));
    return { roomId, prefix, share: confirmed.body };
  }
  return { app, server, origin, directory, service, host, guest, hostId, guestId, identity, call, journey, samples, providerCalls: () => providerCalls, close: async () => { requestChannel.unsubscribe(observeRequest); await service.drain(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); } };
}
