import { describe, expect, it, vi } from "vitest";
import { recordNativeRoomInterpreterOutcome } from "../apps/desktop/src/room-interpreter-outcome";

const account = { profileId: "profile:owner", sessionId: "account_session:11111111",
  accountType: "developer" as const };
const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const requestId = "room_interpreter_turn:22222222-2222-4222-8222-222222222222";
const leaseId = "room_interpreter_mcp_lease:33333333-3333-4333-8333-333333333333";
const outcome = { kind: "completed" as const, text: "A bounded answer", providerSessionId: "agent_session_test" };
const base = { origin: "http://127.0.0.1:54321", desktopSecret: "native-test-secret",
  account, roomId, requestId, leaseId, outcome, readAccount: async () => account };
const success = () => new Response(JSON.stringify({ schema: "helix.room_interpreter_turn_status.v1",
  room_id: roomId, request_id: requestId, state: "completed", mission_authority: false,
  program_action: false, failure_code: null,
  reply: { content_role: "room_interpreter_reply", text: outcome.text,
    provider_session_id: outcome.providerSessionId, result_sha256: "a".repeat(64) } }));

describe("native room interpreter outcome projection", () => {
  it("posts only the exact claimed outcome under native account headers", async () => {
    const fetcher = vi.fn(async () => success());
    expect(await recordNativeRoomInterpreterOutcome({ ...base, fetchImpl: fetcher as typeof fetch }))
      .toEqual({ ok: true, state: "completed", replyText: outcome.text, failureCode: null });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/interpreter-turn-outcome`);
    expect(options.headers).toMatchObject({ "X-Casimir-Desktop-Session": "native-test-secret",
      "x-casimir-desktop-account-session": account.sessionId });
    expect(JSON.parse(String(options.body))).toEqual({ request_id: requestId, lease_id: leaseId,
      outcome: { kind: "completed", text: outcome.text, provider_session_id: outcome.providerSessionId } });
  });
  it("never confirms a lost response, wrong room or switched account", async () => {
    const lost = vi.fn(async () => { throw Error("lost"); });
    expect(await recordNativeRoomInterpreterOutcome({ ...base, fetchImpl: lost }))
      .toEqual({ ok: false, code: "outcome_unconfirmed" });
    expect(lost).toHaveBeenCalledTimes(1);
    const wrong = await recordNativeRoomInterpreterOutcome({ ...base,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ ...await success().json(), room_id: "room:other" }))) });
    expect(wrong).toEqual({ ok: false, code: "outcome_unconfirmed" });
    let reads = 0;
    const changed = await recordNativeRoomInterpreterOutcome({ ...base,
      readAccount: async () => ++reads === 1 ? account : { ...account, sessionId: "account_session:other" },
      fetchImpl: vi.fn(async () => success()) });
    expect(changed).toEqual({ ok: false, code: "account_changed" });
  });
});
