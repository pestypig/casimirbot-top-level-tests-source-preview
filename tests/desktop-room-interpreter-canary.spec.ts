import { describe, expect, it, vi } from "vitest";
import { runNativeRoomInterpreterCanary } from "../apps/desktop/src/room-interpreter-canary";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const interpreterSessionId = "room_interpreter:22222222-2222-4222-8222-222222222222";
const requestId = "room_interpreter_turn:33333333-3333-4333-8333-333333333333";
const leaseId = "room_interpreter_mcp_lease:44444444-4444-4444-8444-444444444444";
const account = { profileId: "profile:owner", sessionId: "account_session:11111111",
  accountType: "developer" as const };
const token = `cb_room_int_mcp_${"a".repeat(43)}`;
const expiresAt = new Date(Date.now() + 90_000).toISOString();
const claimExpiry = new Date(Date.now() + 12_000).toISOString();
const turn = { schema: "helix.room_interpreter_admitted_turn.v1", room_id: roomId,
  interpreter_session_id: interpreterSessionId, generation: 2, provider: "openai_agents_api",
  credential_source: "host_native_profile", expected_payer: "host_openai_project",
  usage_ceiling_turns: 1, model_input: true,
  trigger_message_id: "room_message:55555555-5555-4555-8555-555555555555",
  messages: [{ message_id: "room_message:55555555-5555-4555-8555-555555555555",
    author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
    release_id: "room_text_release:77777777-7777-4777-8777-777777777777",
    consent_revision: 1, text: "What happened?" }] };
const json = (body: unknown) => new Response(JSON.stringify(body),
  { headers: { "content-type": "application/json" } });
const lease = () => json({ schema: "helix.room_interpreter_mcp_lease.v1", room_id: roomId,
  interpreter_session_id: interpreterSessionId, generation: 2, lease_id: leaseId,
  expires_at: expiresAt, bearer_token: token, allowed_tools: ["helix_room_interpreter_status"],
  model_input: false, provider_calls: 0 });
const status = () => json({ jsonrpc: "2.0", id: 1, result: { structuredContent: {
  schema: "helix.room_interpreter_status_observation.v1", room_id: roomId,
  interpreter_session_id: interpreterSessionId, generation: 2, state: "configured",
  lease_expires_at: expiresAt, shared_ai_active: false, model_input: false,
  provider_calls: 0, raw_content_included: false, answer_authority: false,
  terminal_eligible: false } } });
const claim = () => json({ schema: "helix.room_interpreter_claimed_turn.v1",
  request_id: requestId, lease_id: leaseId,
  claim_expires_at: claimExpiry,
  turn, provider_calls: 0 });
const preflight = () => json({ schema: "helix.room_interpreter_claim_preflight.v1",
  room_id: roomId, request_id: requestId, lease_id: leaseId,
  claim_expires_at: claimExpiry, context_current: true, model_input: false, provider_calls: 0 });
const outcome = () => json({ schema: "helix.room_interpreter_turn_status.v1", request_id: requestId,
  room_id: roomId, state: "completed", mission_authority: false, program_action: false,
  failure_code: null, reply: { content_role: "room_interpreter_reply", text: "Observed answer",
    provider_session_id: "sess_one", result_sha256: "a".repeat(64) } });
const sse = () => new Response([
  { type: "agent.session.created", session: { id: "sess_one" } },
  { type: "agent.session.turn.output_text.done", item_id: "msg", text: "Observed answer" },
  { type: "agent.session.turn.completed", turn: { subagent_id: null } },
].map(item => `data: ${JSON.stringify(item)}\n\n`).join(""),
{ headers: { "content-type": "text/event-stream" } });
const base = { origin: "http://127.0.0.1:54321", desktopSecret: "native-secret",
  account, roomId, interpreterSessionId, generation: 2, requestId,
  roomAuthority: "https://room.example", keyForProfile: () => "sk-test-key",
  readAccount: async () => account };
const mcpUrl = "https://room.example/mcp/room-interpreter";

describe("native one-turn room interpreter orchestration", () => {
  it("rejects an unrelated or private MCP authority before requesting a lease", async () => {
    const fetcher = vi.fn();
    for (const roomAuthority of ["https://room.example/mcp/room-interpreter",
      "http://127.0.0.1:54321", "https://127.0.0.1", "https://room.example@evil.example",
      "https://room.example?target=other"]) {
      expect(await runNativeRoomInterpreterCanary({ ...base, roomAuthority,
        fetchImpl: fetcher as typeof fetch })).toEqual({ ok: false,
        code: "authority_invalid", requestId, providerCalls: 0 });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("checks the remote lease before consuming a claim or sending paid model input", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => { urls.push(url);
      return urls.length === 1 ? lease() : new Response("{}", { status: 401 }); });
    expect(await runNativeRoomInterpreterCanary({ ...base, fetchImpl: fetcher as typeof fetch }))
      .toEqual({ ok: false, code: "mcp_unavailable", requestId, providerCalls: 0 });
    expect(urls).toEqual([
      `http://127.0.0.1:54321/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/interpreter-mcp-lease`,
      "https://room.example/mcp/room-interpreter",
    ]);
  });
  it("cancels the local lease when stopped before provider admission", async () => {
    const abort = new AbortController();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      abort.abort();
      expect(init.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    });
    expect(await runNativeRoomInterpreterCanary({ ...base, signal: abort.signal,
      fetchImpl: fetcher as typeof fetch })).toEqual({ ok: false,
        code: "lease_unconfirmed", requestId, providerCalls: 0 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("runs exactly one admitted provider turn and records only its conversational result", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      if (url.endsWith("/interpreter-mcp-lease")) return lease();
      if (url === mcpUrl) return status();
      if (url.endsWith("/interpreter-turn-claim")) return claim();
      if (url.endsWith("/interpreter-turn-preflight")) return preflight();
      if (url === "https://api.openai.com/v1/agents/sessions" && init.method === "POST") return sse();
      if (url.endsWith("/interpreter-turn-outcome")) return outcome();
      if (init.method === "DELETE") return new Response("{}");
      throw Error(`unexpected ${url}`);
    });
    expect(await runNativeRoomInterpreterCanary({ ...base, fetchImpl: fetcher as typeof fetch }))
      .toEqual({ ok: true, code: "completed", requestId, providerCalls: 1 });
    expect(urls.slice(0, 7)).toEqual([
      expect.stringContaining("/interpreter-mcp-lease"), mcpUrl,
      expect.stringContaining("/interpreter-turn-claim"),
      expect.stringContaining("/interpreter-turn-preflight"), mcpUrl,
      "https://api.openai.com/v1/agents/sessions", expect.stringContaining("/interpreter-turn-outcome"),
    ]);
    const providerRequest = fetcher.mock.calls.find(([url]) => url === "https://api.openai.com/v1/agents/sessions");
    expect(JSON.parse(String(providerRequest?.[1].body)).agent.tools).toHaveLength(1);
    const resultRequest = fetcher.mock.calls.find(([url]) => url.endsWith("/interpreter-turn-outcome"));
    expect(JSON.parse(String(resultRequest?.[1].body)).outcome).toEqual({
      kind: "completed", text: "Observed answer", provider_session_id: "sess_one" });
  });
  it("does not submit to the provider if the host signs out after the turn claim", async () => {
    let accountReads = 0;
    const readAccount = async () => ++accountReads <= 5 ? account : {
      ...account, sessionId: "account_session:signed_out" };
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith("/interpreter-mcp-lease")) return lease();
      if (url === mcpUrl) return status();
      if (url.endsWith("/interpreter-turn-claim")) return claim();
      throw Error(`unexpected provider or outcome request: ${url}`);
    });
    expect(await runNativeRoomInterpreterCanary({ ...base, readAccount,
      fetchImpl: fetcher as typeof fetch }))
      .toEqual({ ok: false, code: "account_changed", requestId, providerCalls: 0 });
    expect(urls).toEqual([
      expect.stringContaining("/interpreter-mcp-lease"), mcpUrl,
      expect.stringContaining("/interpreter-turn-claim"),
    ]);
  });
  it("withholds released text if a claimed room context is revoked before dispatch", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith("/interpreter-mcp-lease")) return lease();
      if (url === mcpUrl) return status();
      if (url.endsWith("/interpreter-turn-claim")) return claim();
      if (url.endsWith("/interpreter-turn-preflight")) return new Response("{}", { status: 409 });
      if (url.endsWith("/interpreter-turn-outcome")) return json({
        schema: "helix.room_interpreter_turn_status.v1", request_id: requestId,
        room_id: roomId, state: "failed", reply: null, failure_code: "context_changed",
        mission_authority: false, program_action: false });
      throw Error(`unexpected provider request: ${url}`);
    });
    expect(await runNativeRoomInterpreterCanary({ ...base, fetchImpl: fetcher as typeof fetch }))
      .toEqual({ ok: false, code: "context_changed", requestId, providerCalls: 0 });
    expect(urls).toEqual([
      expect.stringContaining("/interpreter-mcp-lease"), mcpUrl,
      expect.stringContaining("/interpreter-turn-claim"),
      expect.stringContaining("/interpreter-turn-preflight"),
      expect.stringContaining("/interpreter-turn-outcome"),
    ]);
  });
  it("records a failed claimed turn after stop aborts preflight", async () => {
    const abort = new AbortController();
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      if (url.endsWith("/interpreter-mcp-lease")) return lease();
      if (url === mcpUrl) return status();
      if (url.endsWith("/interpreter-turn-claim")) return claim();
      if (url.endsWith("/interpreter-turn-preflight")) {
        abort.abort();
        expect(init.signal?.aborted).toBe(true);
        throw new DOMException("aborted", "AbortError");
      }
      if (url.endsWith("/interpreter-turn-outcome")) {
        expect(init.signal?.aborted).toBe(false);
        expect(JSON.parse(String(init.body)).outcome).toEqual({
          kind: "failed", code: "context_changed",
        });
        return json({ schema: "helix.room_interpreter_turn_status.v1",
          request_id: requestId, room_id: roomId, state: "failed", reply: null,
          failure_code: "context_changed", mission_authority: false, program_action: false });
      }
      throw Error(`unexpected provider request: ${url}`);
    });
    expect(await runNativeRoomInterpreterCanary({ ...base, signal: abort.signal,
      fetchImpl: fetcher as typeof fetch })).toEqual({ ok: false,
        code: "context_changed", requestId, providerCalls: 0 });
    expect(urls.some(url => url.includes("api.openai.com"))).toBe(false);
    expect(urls.at(-1)).toContain("/interpreter-turn-outcome");
  });
});
