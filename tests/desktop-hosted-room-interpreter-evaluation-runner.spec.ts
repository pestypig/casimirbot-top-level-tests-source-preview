import { expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { HostedRoomInterpreterEvaluationRunner, projectHostedRoomEvaluationResult } from
  "../apps/desktop/src/hosted-room-interpreter-evaluation-runner";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const interpreterId = "room_interpreter:22222222-2222-4222-8222-222222222222";
const requestId = "room_interpreter_turn:33333333-3333-4333-8333-333333333333";
const leaseId = "room_interpreter_mcp_lease:44444444-4444-4444-8444-444444444444";
const participantId = "shared_realtime_participant:55555555-5555-4555-8555-555555555555";
const messageId = "room_message:66666666-6666-4666-8666-666666666666";

it("projects only a positive exact-turn room MCP observation", () => {
  const receipt = { eventId: "evt_room", itemId: "mcp_room", turnId: "turn_room" };
  expect(projectHostedRoomEvaluationResult({ ok: true, code: "completed",
    providerCalls: 1, roomMcpStatusCallObserved: true,
    roomMcpStatusCallReceipt: receipt,
    roomMcpSavedItemConfirmed: true })).toMatchObject({
    ok: true, code: "room_hosted_interpreter_evaluation_completed",
    roomMcpStatusCallObserved: true, roomMcpStatusCallReceipt: receipt,
    roomMcpSavedItemConfirmed: true });
  expect(projectHostedRoomEvaluationResult({ ok: true, code: "completed",
    providerCalls: 1 })).not.toHaveProperty("roomMcpStatusCallObserved");
});

it("records an uncertain stopped provider attempt once and never submits the same request again", async () => {
  const account = { profileId: "profile:owner", sessionId: "account_session:12345678",
    accountType: "developer" as const };
  const controller = new AbortController();
  const expiresAt = new Date(Date.now() + 300_000).toISOString();
  const claimExpiresAt = new Date(Date.now() + 10_000).toISOString();
  const turn = { schema: "helix.room_interpreter_admitted_turn.v2", room_id: roomId,
    interpreter_session_id: interpreterId, generation: 2, provider: "openai_agents_api",
    credential_source: "host_native_profile", expected_payer: "host_openai_project",
    usage_ceiling_turns: 2, model_input: true, trigger_message_id: messageId,
    turn_ordinal: 1, prior_reply: null,
    messages: [{ message_id: messageId, author_participant_id: participantId,
      author_role: "participant", release_id: "room_text_release:77777777-7777-4777-8777-777777777777",
      consent_revision: 1, text: "A released question" }] };
  const operations: Array<Record<string, unknown>> = [];
  const response = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" } });
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    operations.push(body);
    if (body.operation === "lease") return response({
      schema: "helix.room_interpreter_mcp_lease.v1", room_id: roomId,
      interpreter_session_id: interpreterId, generation: 2, lease_id: leaseId,
      expires_at: expiresAt, bearer_token: `cb_room_int_mcp_${"a".repeat(43)}`,
      room_authority: "https://rooms.test",
      allowed_tools: ["helix_room_interpreter_status"], model_input: false, provider_calls: 0 });
    if (body.operation === "evaluation_claim") return response({
      schema: "helix.hosted_room_interpreter_evaluation_claim.v1",
      request_id: requestId, turn_ordinal: 1, lease_id: leaseId,
      claim_expires_at: claimExpiresAt, turn, provider_calls: 0 });
    if (body.operation === "evaluation_preflight") return response({
      schema: "helix.hosted_room_interpreter_evaluation_preflight.v1",
      room_id: roomId, request_id: requestId, turn_ordinal: 1,
      lease_id: leaseId, claim_expires_at: claimExpiresAt,
      context_current: true, model_input: false, provider_calls: 0 });
    if (body.operation === "evaluation_outcome") return response({
      schema: "helix.room_interpreter_evaluation_status.v1",
      request_id: requestId, first_request_id: null, room_id: roomId,
      interpreter_session_id: interpreterId, generation: 2, turn_ordinal: 1,
      requested_by_participant_id: participantId, trigger_message_id: messageId,
      state: "failed", finished_at: new Date().toISOString(),
      failure_code: "network_uncertain", reply: null,
      mission_authority: false, program_action: false });
    throw Error("unexpected_exchange_operation");
  }) as typeof fetch;
  const start = vi.fn(async () => { controller.abort(); throw Error("provider_response_lost"); });
  const runner = new HostedRoomInterpreterEvaluationRunner({ checkLease: async () => true,
    start, deleteSession: async () => true });
  const input = { origin: "http://127.0.0.1:39009", desktopSecret: "private-desktop-secret",
    account, roomId, interpreterSessionId: interpreterId, generation: 2,
    requestId, turnOrdinal: 1 as const, keyForProfile: () => "sk-owner-fixture",
    readAccount: async () => account, fetchImpl, signal: controller.signal };
  expect(await runner.run(input)).toMatchObject({ ok: false,
    code: "provider_failed", providerCalls: 1 });
  expect(operations.find(operation => operation.operation === "evaluation_outcome"))
    .toMatchObject({ outcome: { kind: "failed", code: "network_uncertain" } });
  expect(await runner.run({ ...input, signal: undefined })).toMatchObject({ ok: false,
    code: "not_ready", providerCalls: 0 });
  expect(start).toHaveBeenCalledTimes(1);
});

it("deletes a retained correction session on quit and rejects a stale replacement key", async () => {
  const remove = vi.fn(async () => true);
  const runner = new HostedRoomInterpreterEvaluationRunner({ deleteSession: remove });
  const key = "sk-owner-fixture";
  const retained = (runner as unknown as { retained: Map<string, unknown> }).retained;
  retained.set("owner:room:session:1", {
    binding: { ownerProfileId: "profile:owner" },
    providerSessionId: "session_room_first_turn",
    keyHash: crypto.createHash("sha256").update(key).digest("hex"),
  });
  retained.set("owner:room:session:2", {
    binding: { ownerProfileId: "profile:rotated" },
    providerSessionId: "session_room_other_turn",
    keyHash: crypto.createHash("sha256").update("sk-original-key").digest("hex"),
  });

  expect(await runner.closeRetainedConversations(profile =>
    profile === "profile:owner" ? key : "sk-replacement-key")).toBe(false);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith({ key, sessionId: "session_room_first_turn" });
  expect(retained.size).toBe(0);
  expect(await runner.run({ origin: "http://127.0.0.1:39009", desktopSecret: "secret",
    account: { profileId: "profile:owner", sessionId: "account_session:12345678",
      accountType: "developer" }, roomId, interpreterSessionId: interpreterId,
    generation: 1, requestId, turnOrdinal: 1, keyForProfile: () => key,
    readAccount: async () => ({ profileId: "profile:owner", sessionId: "account_session:12345678",
      accountType: "developer" }) })).toMatchObject({ ok: false, code: "not_ready", providerCalls: 0 });
});

it("clears only the disconnected profile's retained correction session", async () => {
  const remove = vi.fn(async () => true);
  const runner = new HostedRoomInterpreterEvaluationRunner({ deleteSession: remove });
  const retained = (runner as unknown as { retained: Map<string, unknown> }).retained;
  const key = "sk-owner-fixture";
  for (const profile of ["profile:owner", "profile:other"]) retained.set(profile, {
    binding: { ownerProfileId: profile },
    providerSessionId: profile === "profile:owner" ? "session_owner" : "session_other",
    keyHash: crypto.createHash("sha256").update(key).digest("hex"),
  });
  expect(await runner.closeRetainedForProfile("profile:owner", key)).toBe(true);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith({ key, sessionId: "session_owner" });
  expect(retained.has("profile:owner")).toBe(false);
  expect(retained.has("profile:other")).toBe(true);
  expect(await runner.closeRetainedForProfile("profile:other", null)).toBe(false);
  expect(retained.size).toBe(0);
  expect(remove).toHaveBeenCalledTimes(1);
});
