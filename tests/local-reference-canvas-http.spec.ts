import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { startLocalCanvasFixture } from "./helpers/local-reference-canvas-http";
import { hostedBudgetStore } from "../server/services/helix-account/hosted-budget-store";
import { ReferenceCanvasService } from "../server/services/reference-canvas/service";
import { resetDbClient, getPool, ensureDatabase, flushLocalDatabaseSnapshotIfEnabled } from "../server/db/client";

let databaseDirectory: string;
beforeAll(() => { databaseDirectory = mkdtempSync(path.join(tmpdir(), "casimir-canvas-db-")); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("CASIMIR_LOCAL_HOSTED_MVP", "1"); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("HELIX_LOCAL_DB_PATH", path.join(databaseDirectory, "snapshot.json")); });
afterAll(async () => { await resetDbClient(); vi.unstubAllEnvs(); rmSync(databaseDirectory, { recursive: true, force: true }); });
describe("private no-model room/canvas actual loopback HTTP", () => {
  it("expired trial preserves protected result, Stop and Revoke without allowing another effect", async () => {
    const f = await startLocalCanvasFixture();
    try {
      const { prefix, share } = await f.journey();
      const offerBody = { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .25, y: .75 } };
      const first = await f.call(f.host, prefix + "/action-offers", offerBody);
      const request = await f.call(f.guest, prefix + "/action-requests", { offer_id: first.body.offerId, expected_offer_revision: 1 });
      await f.service.drain();
      const unused = await f.call(f.host, prefix + "/action-offers", { ...offerBody, expected_document_revision: 1 });
      expect(unused.status).toBe(200);
      // Only this isolated fixture's sponsor term is expired; no clock,
      // account session, real profile or native review expiry is changed.
      const pool = getPool();
      const row = await pool.query("SELECT state_json FROM helix_local_hosted_budget_state WHERE state_id='local'");
      const state = typeof row.rows[0].state_json === "string" ? JSON.parse(row.rows[0].state_json) : row.rows[0].state_json;
      const term = state.terms.find((t: { profileId: string }) => t.profileId === f.hostId);
      term.endsAt = new Date(Date.now() - 1000).toISOString();
      await pool.query("UPDATE helix_local_hosted_budget_state SET state_json=$1::jsonb WHERE state_id='local'", [JSON.stringify(state)]);
      expect((await hostedBudgetStore.termStatus(f.hostId)).eligible).toBe(false);
      const result = await f.call(f.guest, prefix + `/action-requests/${request.body.request_id}`);
      expect(result).toMatchObject({ status: 200, body: { status: "succeeded" } });
      const stopped = await f.call(f.host, prefix + `/action-requests/${request.body.request_id}/stop`, {});
      expect(stopped).toMatchObject({ status: 200, body: { committed_content_preserved: true } });
      const revoked = await f.call(f.host, prefix + `/action-offers/${unused.body.offerId}/revoke`, { expected_offer_revision: 1 });
      expect(revoked).toMatchObject({ status: 200, body: { revoked: true } });
      const denied = await f.call(f.guest, prefix + "/action-requests", { offer_id: unused.body.offerId, expected_offer_revision: 1 });
      expect(denied).toMatchObject({ status: 409, body: { error: "sponsor_ineligible" } });
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(1);
      const budget = await hostedBudgetStore.termStatus(f.hostId);
      expect(budget.successfulEffects).toBe(1); expect(budget.unresolvedEffects).toBe(0);
    } finally { await f.close(); }
  }, 60000);
  it("two authenticated identities create/join/share/grant, concurrent request commits once, restart/retry/status preserve effect", async () => {
    const f = await startLocalCanvasFixture();
    try {
      const { prefix, share, roomId } = await f.journey();
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(0);
      const offer = await f.call(f.host, prefix + "/action-offers", { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .25, y: .75 } });
      expect(offer.status).toBe(200); expect(offer.body.nonce).toBeUndefined(); expect(offer.body.grantId).toBeUndefined();
      const input = { offer_id: offer.body.offerId, expected_offer_revision: offer.body.revision }; const key = randomUUID();
      const [first, second] = await Promise.all([f.call(f.guest, prefix + "/action-requests", input, { key }), f.call(f.guest, prefix + "/action-requests", input, { key })]);
      expect(first.status).toBe(200); expect(second.body.request_id).toBe(first.body.request_id);
      await f.service.drain();
      const result = await f.call(f.guest, prefix + `/action-requests/${first.body.request_id}`);
      expect(result.body.status).toBe("succeeded"); expect(result.body.ownerId).toBe(f.hostId); expect(result.body.requesterId).toBe(f.guestId); expect(result.body.provider_calls).toBe(0); expect(result.body.documentRevision).toBe(1);
      const document = await f.call(f.host, prefix + `/program-shares/${share.shareId}/document`);
      expect(document.body.document.markers).toHaveLength(1); expect(document.body.document.markers[0]).toMatchObject({ effectId: result.body.effectId, color: "blue", coordinates: { x: .25, y: .75 } });
      await flushLocalDatabaseSnapshotIfEnabled(); await resetDbClient(); await ensureDatabase();
      const restarted = new ReferenceCanvasService(f.service.deps);
      expect((await restarted.readResult((await f.service.deps.resolveActor(decodeURIComponent(f.guest.cookie.split("=")[1])))!, roomId, first.body.request_id)).effectId).toBe(result.body.effectId);
      const retry = await f.call(f.guest, prefix + "/action-requests", input, { key }); expect(retry).toMatchObject({ status: 200, body: { request_id: first.body.request_id } });
      expect((await f.call(f.guest, prefix + "/action-requests", { ...input, expected_offer_revision: 99 }, { key })).body.error).toBe("idempotency_conflict");
      expect((await f.call(f.guest, prefix + "/action-requests", input)).body.error).toBe("grant_used");
      const stopped = await f.call(f.host, prefix + `/action-requests/${first.body.request_id}/stop`, {}); expect(stopped.body.committed_content_preserved).toBe(true); expect(stopped.body.status).toBe("succeeded");
      expect((await hostedBudgetStore.termStatus(f.hostId)).successfulEffects).toBe(1);
      expect(f.providerCalls()).toBe(0);
      // Raw synthetic-local samples, no cookies/session/CSRF/native proof exported.
      if (process.env.CANVAS_EVIDENCE_PATH) writeFileSync(path.resolve(process.env.CANVAS_EVIDENCE_PATH), JSON.stringify({ scope: "synthetic local HTTP qualification; actual isolated database snapshot reopen and native document reconstruction", providerCalls: f.providerCalls(), providerInstrumentation: "undici request creation plus no provider import/call in canvas route composition", result: result.body, observedMarkerCount: document.body.document.markers.length, budget: await hostedBudgetStore.termStatus(f.hostId), samples: f.samples }, null, 2));
    } finally { await f.close(); }
  }, 60000);
  it("fails closed for owner/room/revision/CSRF/private policy and expired/revoked grants", async () => {
    const f = await startLocalCanvasFixture();
    try {
      const { prefix, share } = await f.journey();
      const body = { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .2, y: .3 } };
      expect((await f.call(f.guest, prefix + "/action-offers", { ...body, requester_profile_id: f.hostId })).status).toBe(403);
      expect((await f.call(f.host, prefix + "/action-offers", { ...body, expected_document_revision: 9 })).body.error).toBe("stale_revision");
      expect((await f.call(f.host, prefix + "/action-offers", body, { csrf: "wrong" })).body.error).toBe("csrf_required");
      expect((await f.call(f.host, prefix + "/action-offers", body, { origin: "https://wrong.invalid" })).body.error).toBe("same_origin_required");
      expect((await f.call(f.host, prefix + "/action-offers", { ...body, coordinates: { x: 2, y: .3 } })).status).toBe(400);
      const revoked = await f.call(f.host, prefix + "/action-offers", body);
      await f.call(f.host, prefix + `/action-offers/${revoked.body.offerId}/revoke`, { expected_offer_revision: 1 });
      expect((await f.call(f.guest, prefix + "/action-requests", { offer_id: revoked.body.offerId, expected_offer_revision: 1 })).body.error).toBe("grant_revoked");
      const expired = await f.call(f.host, prefix + "/action-offers", body);
      f.service.deps.store.transaction(s => { s.offers[expired.body.offerId].expiresAt = Date.now(); });
      expect((await f.call(f.guest, prefix + "/action-requests", { offer_id: expired.body.offerId, expected_offer_revision: 1 })).body.error).toBe("grant_expired");
      const valid = await f.call(f.host, prefix + "/action-offers", body);
      expect((await f.call(f.guest, "/rooms/wrong-room/action-requests", { offer_id: valid.body.offerId, expected_offer_revision: 1 })).status).toBe(403);
      expect((await f.call(f.host, prefix + "/action-requests", { offer_id: valid.body.offerId, expected_offer_revision: 1 })).status).toBe(403);
      const publicUser = await f.identity(`canvas-public-${randomUUID()}`, "user"); expect((await f.call(publicUser, prefix)).status).toBe(401);
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(0);
    } finally { await f.close(); }
  }, 60000);
  it("Stop before native commit fences effect and accounting even after sponsor cancellation", async () => {
    const f = await startLocalCanvasFixture();
    try {
      const { prefix, share } = await f.journey();
      let release!: () => void; let ready!: () => void; const waiting = new Promise<void>(r => { ready = r; });
      f.service.deps.beforeCommit = async () => { ready(); await new Promise<void>(r => { release = r; }); };
      const offer = await f.call(f.host, prefix + "/action-offers", { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .4, y: .6 } });
      const accepted = await f.call(f.guest, prefix + "/action-requests", { offer_id: offer.body.offerId, expected_offer_revision: 1 }); await waiting;
      await hostedBudgetStore.cancelTerm(f.hostId);
      const started = performance.now(); const stopped = await f.call(f.host, prefix + `/action-requests/${accepted.body.request_id}/stop`, {});
      expect(performance.now() - started).toBeLessThan(1000); expect(stopped.body.status).toBe("canceled"); release(); await f.service.drain();
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(0);
      const finalResult = await f.call(f.host, prefix + `/action-requests/${accepted.body.request_id}`);
      expect(finalResult.body).toMatchObject({ status: "canceled", stopRequested: true, provider_calls: 0 });
      expect(finalResult.body.effectId).toBeUndefined();
      expect(await hostedBudgetStore.termStatus(f.hostId)).toMatchObject({ successfulEffects: 0, unresolvedEffects: 0 });
    } finally { await f.close(); }
  }, 60000);
  it("lost postcommit observation holds unknown, never repeats mutation, owner read reconciles exact effect", async () => {
    const f = await startLocalCanvasFixture();
    try {
      const { prefix, share } = await f.journey(); f.service.deps.afterCommit = async () => { throw Error("synthetic_lost_native_read"); };
      const offer = await f.call(f.host, prefix + "/action-offers", { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .5, y: .5 } });
      const key = randomUUID(); const body = { offer_id: offer.body.offerId, expected_offer_revision: 1 };
      const accepted = await f.call(f.guest, prefix + "/action-requests", body, { key }); await f.service.drain();
      expect((await f.call(f.guest, prefix + `/action-requests/${accepted.body.request_id}`)).body.status).toBe("outcome_unknown");
      const held = await hostedBudgetStore.termStatus(f.hostId); expect(held.successfulEffects).toBe(0); expect(held.unresolvedEffects).toBe(1);
      expect((await f.call(f.guest, prefix + "/action-requests", body, { key })).body.request_id).toBe(accepted.body.request_id);
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(1);
      const reconciled = await f.call(f.host, prefix + `/action-requests/${accepted.body.request_id}/reconcile`, {}); expect(reconciled.body.status).toBe("succeeded");
      expect((await hostedBudgetStore.termStatus(f.hostId)).successfulEffects).toBe(1);
    } finally { await f.close(); }
  }, 60000);
  it.each(["session", "epoch", "revision", "revoke", "deadline"])("rechecks %s at native boundary after durable admission", async failure => {
    const f = await startLocalCanvasFixture();
    let release: (() => void) | undefined;
    try {
      const { prefix, share } = await f.journey();
      let ready!: () => void; const waiting = new Promise<void>(resolve => { ready = resolve; });
      f.service.deps.beforeCommit = async () => { ready(); await new Promise<void>(resolve => { release = resolve; }); };
      const offer = await f.call(f.host, prefix + "/action-offers", { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .4, y: .6 } });
      const request = await f.call(f.guest, prefix + "/action-requests", { offer_id: offer.body.offerId, expected_offer_revision: 1 }); await waiting;
      if (failure === "session") await getPool().query("UPDATE helix_account_sessions SET status='signed_out' WHERE session_id=$1", [decodeURIComponent(f.guest.cookie.split("=")[1])]);
      if (failure === "revoke") await f.call(f.host, prefix + `/action-offers/${offer.body.offerId}/revoke`, { expected_offer_revision: 1 });
      if (["epoch", "revision", "deadline"].includes(failure)) f.service.deps.store.transaction(state => {
        if (failure === "epoch") state.documents[share.documentId].connectorEpoch++;
        if (failure === "revision") state.documents[share.documentId].revision++;
        if (failure === "deadline") state.requests[request.body.request_id].deadline = Date.now() - 1;
      });
      release!(); release = undefined; await f.service.drain();
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(0);
      expect((await f.call(f.host, prefix + `/action-requests/${request.body.request_id}`)).body.status).not.toBe("succeeded");
      expect((await hostedBudgetStore.termStatus(f.hostId)).successfulEffects).toBe(0);
    } finally { release?.(); await f.close(); }
  }, 60000);
  it("intentional lease return preserves expired grant and rejects guest renewal", async () => {
    const f = await startLocalCanvasFixture();
    try {
      const { prefix, share, roomId } = await f.journey();
      const offer = await f.call(f.host, prefix + "/action-offers", { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .25, y: .75 } });
      f.service.deps.store.transaction(state => { state.rooms[roomId].leaseExpiresAt = Date.now() - 1; state.offers[offer.body.offerId].expiresAt = Date.now() - 1; });
      expect((await f.call(f.host, prefix)).body.available).toBe(false);
      expect((await f.call(f.guest, prefix + "/resume", {})).status).toBe(403);
      expect((await f.call(f.host, prefix + "/resume", {})).status).toBe(200);
      expect((await f.call(f.host, prefix)).body.available).toBe(true);
      expect((await f.call(f.guest, prefix + "/action-requests", { offer_id: offer.body.offerId, expected_offer_revision: 1 })).body.error).toBe("grant_expired");
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(0);
    } finally { await f.close(); }
  }, 60000);
  it("ambiguous dispatched no-effect holds capacity until the owner verifies the native absence", async () => {
    const f = await startLocalCanvasFixture();
    try {
      const { prefix, share } = await f.journey();
      f.service.deps.fenceActors = async () => { throw Error("synthetic_lost_release_outcome"); };
      const offer = await f.call(f.host, prefix + "/action-offers", { share_id: share.shareId, requester_profile_id: f.guestId, expected_document_revision: 0, coordinates: { x: .5, y: .5 } });
      const accepted = await f.call(f.guest, prefix + "/action-requests", { offer_id: offer.body.offerId, expected_offer_revision: 1 }); await f.service.drain();
      expect((await f.call(f.guest, prefix + `/action-requests/${accepted.body.request_id}`)).body.status).toBe("outcome_unknown");
      expect((await hostedBudgetStore.termStatus(f.hostId)).unresolvedEffects).toBe(1);
      expect(f.service.deps.store.read().documents[share.documentId].markers).toHaveLength(0);
      expect((await f.call(f.host, prefix + `/action-requests/${accepted.body.request_id}/reconcile`, {})).body.status).toBe("canceled");
      const budget = await hostedBudgetStore.termStatus(f.hostId); expect(budget.unresolvedEffects).toBe(0); expect(budget.successfulEffects).toBe(0);
    } finally { await f.close(); }
  }, 60000);
});
