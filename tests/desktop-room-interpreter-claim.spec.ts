import { describe, expect, it, vi } from "vitest";
import { claimNativeRoomInterpreterTurn } from "../apps/desktop/src/room-interpreter-claim";

const account = { profileId: "profile:owner", sessionId: "account_session:11111111",
  accountType: "developer" as const };
const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const requestId = "room_interpreter_turn:22222222-2222-4222-8222-222222222222";
const leaseId = "room_interpreter_mcp_lease:33333333-3333-4333-8333-333333333333";
const base = { origin: "http://127.0.0.1:54321", desktopSecret: "native-test-secret",
  account, roomId, requestId, leaseId, hasCurrentProfileKey: () => true,
  readAccount: async () => account };
const success = () => new Response(JSON.stringify({
  schema: "helix.room_interpreter_claimed_turn.v1", request_id: requestId,
  lease_id: leaseId, claim_expires_at: new Date(Date.now() + 12_000).toISOString(), provider_calls: 0,
  turn: { schema: "helix.room_interpreter_admitted_turn.v1", room_id: roomId,
    interpreter_session_id: "room_interpreter:44444444-4444-4444-8444-444444444444",
    generation: 2, provider: "openai_agents_api", credential_source: "host_native_profile",
    expected_payer: "host_openai_project", usage_ceiling_turns: 1, model_input: true,
    trigger_message_id: "room_message:55555555-5555-4555-8555-555555555555",
    messages: [{ message_id: "room_message:55555555-5555-4555-8555-555555555555",
      author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
      release_id: "room_text_release:77777777-7777-4777-8777-777777777777",
      consent_revision: 1, text: "What do we know?" }] },
}), { headers: { "Content-Type": "application/json" } });

describe("native one-way room interpreter claim", () => {
  it("sends exact identifiers with native headers and returns admitted text only to native main", async () => {
    const fetcher = vi.fn(async () => success());
    const result = await claimNativeRoomInterpreterTurn({ ...base, fetchImpl: fetcher as typeof fetch });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.messages[0]?.text).toBe("What do we know?");
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:54321/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/interpreter-turn-claim`);
    expect(options.headers).toMatchObject({ "X-Casimir-Desktop-Session": "native-test-secret",
      "x-casimir-desktop-account-session": account.sessionId });
    expect(JSON.parse(String(options.body))).toEqual({ request_id: requestId, lease_id: leaseId });
  });
  it("rejects absent key, changed account and remote target before a claim", async () => {
    const fetcher = vi.fn();
    for (const change of [{ hasCurrentProfileKey: () => false },
      { readAccount: async () => ({ ...account, sessionId: "account_session:other" }) },
      { origin: "https://service.example" }]) {
      expect((await claimNativeRoomInterpreterTurn({ ...base, ...change, fetchImpl: fetcher })).ok).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps a lost, stale or account-switched claim unconfirmed without retry", async () => {
    const lost = vi.fn(async () => { throw new Error("network"); });
    expect(await claimNativeRoomInterpreterTurn({ ...base, fetchImpl: lost }))
      .toEqual({ ok: false, code: "claim_unconfirmed" });
    expect(lost).toHaveBeenCalledTimes(1);
    const stale = vi.fn(async () => new Response(JSON.stringify({
      ...await success().json(), claim_expires_at: new Date(Date.now() - 1_000).toISOString() })));
    expect((await claimNativeRoomInterpreterTurn({ ...base, fetchImpl: stale as typeof fetch })).ok).toBe(false);
    let reads = 0;
    const switched = await claimNativeRoomInterpreterTurn({ ...base,
      readAccount: async () => ++reads === 1 ? account : { ...account, sessionId: "account_session:other" },
      fetchImpl: vi.fn(async () => success()) });
    expect(switched).toEqual({ ok: false, code: "account_changed" });
  });
});
