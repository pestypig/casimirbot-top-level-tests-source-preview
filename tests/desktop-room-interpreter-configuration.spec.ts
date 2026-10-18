import { describe, expect, it, vi } from "vitest";
import { configureNativeRoomInterpreter, selectNativeHostedRoomInterpreterKey } from
  "../apps/desktop/src/room-interpreter-configuration";

const account = { profileId: "profile:owner", sessionId: "account_session:11111111",
  accountType: "developer" as const };
const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const preparationSessionId = "room_interpreter:22222222-2222-4222-8222-222222222222";
const configuredSessionId = "room_interpreter:33333333-3333-4333-8333-333333333333";
const success = () => new Response(JSON.stringify({ schema: "helix.room_interpreter_native_configuration.v1",
  room_id: roomId, shared_ai_active: false, model_input: false, provider_calls: 0,
  session: { room_id: roomId, interpreter_session_id: configuredSessionId,
    generation: 2, state: "configured", credential_source: "host_native_profile",
    expected_payer: "host_openai_project", usage_ceiling_turns: 1 } }),
{ headers: { "Content-Type": "application/json" } });
const base = { origin: "http://127.0.0.1:54321", desktopSecret: "native-test-secret",
  account, roomId, preparationSessionId, generation: 1,
  hasCurrentProfileKey: () => true, readAccount: async () => account };

describe("native room interpreter configuration request", () => {
  it("sends only exact identities under authenticated loopback headers, never the provider key", async () => {
    const fetcher = vi.fn(async () => success());
    expect(await configureNativeRoomInterpreter({ ...base, fetchImpl: fetcher as typeof fetch }))
      .toEqual({ ok: true, code: "room_interpreter_configured" });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:54321/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/interpreter-configure`);
    expect(options.headers).toMatchObject({ "X-Casimir-Desktop-Session": "native-test-secret",
      "x-casimir-desktop-account-session": account.sessionId });
    expect(JSON.parse(String(options.body))).toEqual({ interpreter_session_id: preparationSessionId, generation: 1 });
    expect(JSON.stringify(options)).not.toContain("sk-fixture-key");
  });
  it("rejects missing or changed owner credentials and non-loopback targets before sending", async () => {
    const fetcher = vi.fn();
    for (const change of [
      { hasCurrentProfileKey: () => false },
      { readAccount: async () => ({ ...account, sessionId: "account_session:other" }) },
      { origin: "https://service.example" },
      { roomId: "room:other" },
      { roomId: "room:11111111-1111-4111-8111-111111111111" },
    ]) {
      const result = await configureNativeRoomInterpreter({ ...base, ...change, fetchImpl: fetcher });
      expect(result.ok).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never reports configuration from a failed or mismatched server response", async () => {
    const denied = await configureNativeRoomInterpreter({ ...base,
      fetchImpl: vi.fn(async () => new Response("{}", { status: 409 })) });
    expect(denied.code).toBe("room_interpreter_configuration_rejected");
    const invalid = await configureNativeRoomInterpreter({ ...base,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ schema: "unexpected" }))) });
    expect(invalid.code).toBe("room_interpreter_configuration_unconfirmed");
  });
});

describe("native hosted interpreter key selection", () => {
  const hostedSuccess = () => new Response(JSON.stringify({
    schema: "helix.hosted_room_interpreter_native_selection.v1", room_id: roomId,
    shared_ai_active: false, model_input: false, provider_calls: 0,
    session: { room_id: roomId, interpreter_session_id: configuredSessionId,
      generation: 2, state: "configured", credential_source: "host_native_profile",
      expected_payer: "host_openai_project", usage_ceiling_turns: 1,
      shared_ai_active: false, provider_calls: 0 },
  }), { status: 200 });

  it("sends only exact room metadata from native main and checks account and key again", async () => {
    const fetcher = vi.fn(async () => hostedSuccess());
    const readAccount = vi.fn(async () => account);
    expect(await selectNativeHostedRoomInterpreterKey({ ...base, readAccount,
      fetchImpl: fetcher as typeof fetch })).toEqual({ ok: true,
      code: "room_hosted_interpreter_key_selected" });
    expect(readAccount).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:54321/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/hosted-interpreter-key-select`);
    expect(options.headers).toMatchObject({ "X-Casimir-Desktop-Session": "native-test-secret",
      "x-casimir-desktop-account-session": account.sessionId });
    expect(JSON.parse(String(options.body))).toEqual({ interpreter_session_id: preparationSessionId, generation: 1 });
    expect(JSON.stringify(options)).not.toMatch(/sk-fixture-key|Authorization|Bearer/u);
  });

  it("denies missing key, changed account and malformed response without claiming selection", async () => {
    const fetcher = vi.fn(async () => hostedSuccess());
    expect((await selectNativeHostedRoomInterpreterKey({ ...base,
      hasCurrentProfileKey: () => false, fetchImpl: fetcher as typeof fetch })).code).toBe("missing_key");
    expect((await selectNativeHostedRoomInterpreterKey({ ...base,
      readAccount: async () => ({ ...account, sessionId: "other" }),
      fetchImpl: fetcher as typeof fetch })).code).toBe("account_changed");
    expect(fetcher).not.toHaveBeenCalled();
    const changed = vi.fn().mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, sessionId: "other" });
    expect((await selectNativeHostedRoomInterpreterKey({ ...base, readAccount: changed,
      fetchImpl: fetcher as typeof fetch })).code).toBe("account_changed");
    expect((await selectNativeHostedRoomInterpreterKey({ ...base,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ schema: "wrong" }))) })).code)
      .toBe("room_interpreter_configuration_unconfirmed");
    const missingSessionId = await selectNativeHostedRoomInterpreterKey({ ...base,
      fetchImpl: vi.fn(async () => {
        const body = await hostedSuccess().json() as { session: Record<string, unknown> };
        delete body.session.interpreter_session_id;
        return new Response(JSON.stringify(body));
      }) as typeof fetch });
    expect(missingSessionId.code).toBe("room_interpreter_configuration_unconfirmed");
  });
});
