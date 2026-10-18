import { expect, it, vi } from "vitest";
import { projectHostedRoomInterpreterCanaryResult, runHostedRoomInterpreterCanary } from
  "../apps/desktop/src/hosted-room-interpreter-canary";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const sessionId = "room_interpreter:22222222-2222-4222-8222-222222222222";
const requestId = "room_interpreter_turn:33333333-3333-4333-8333-333333333333";
const account = { sessionId: "account_session:12345678", profileId: "host",
  accountType: "developer" as const };
const lease = () => ({ schema: "helix.room_interpreter_mcp_lease.v1", room_id: roomId,
  interpreter_session_id: sessionId, generation: 2,
  lease_id: "room_interpreter_mcp_lease:44444444-4444-4444-8444-444444444444",
  expires_at: new Date(Date.now() + 180_000).toISOString(),
  bearer_token: `cb_room_int_mcp_${"a".repeat(43)}`,
  room_authority: "https://rooms.example.test", allowed_tools: ["helix_room_interpreter_status"],
  model_input: false, provider_calls: 0 });
const input = (fetchImpl: typeof fetch) => ({ origin: "http://127.0.0.1:8767/",
  desktopSecret: "private-secret", account, roomId, interpreterSessionId: sessionId,
  generation: 2, requestId, keyForProfile: () => "sk-private-test-key",
  readAccount: async () => account, fetchImpl });

it("preserves possible provider-send status without exposing native turn details", () => {
  expect(projectHostedRoomInterpreterCanaryResult({ ok: false, code: "outcome_unconfirmed",
    requestId, providerCalls: 1 })).toEqual({ ok: false,
    code: "room_hosted_interpreter_unconfirmed", providerRequestMayHaveBeenSent: true });
  expect(projectHostedRoomInterpreterCanaryResult({ ok: false, code: "mcp_unavailable",
    requestId, providerCalls: 0 })).toEqual({ ok: false,
    code: "room_hosted_interpreter_unconfirmed", providerRequestMayHaveBeenSent: false });
});

it("does not consume a hosted turn or call OpenAI when the canonical MCP status is unavailable", async () => {
  const requests: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${String(url)}`);
    if (String(url).startsWith("http://127.0.0.1")) {
      const operation = JSON.parse(String(init?.body)).operation;
      expect(operation).toBe("lease");
      expect(new Headers(init?.headers).get("X-Casimir-Desktop-Session")).toBe("private-secret");
      return new Response(JSON.stringify(lease()), { status: 201,
        headers: { "Content-Type": "application/json" } });
    }
    return new Response("unavailable", { status: 503 });
  }) as typeof fetch;
  expect(await runHostedRoomInterpreterCanary(input(fetchImpl))).toEqual({ ok: false,
    code: "mcp_unavailable", requestId, providerCalls: 0 });
  expect(requests).toHaveLength(2);
  expect(requests.some(value => value.includes("api.openai.com"))).toBe(false);
});

it("rejects account changes before making a hosted lease", async () => {
  const fetchImpl = vi.fn() as unknown as typeof fetch;
  expect(await runHostedRoomInterpreterCanary({ ...input(fetchImpl),
    readAccount: async () => ({ ...account, sessionId: "account_session:changed123" }) }))
    .toMatchObject({ ok: false, code: "account_changed", providerCalls: 0 });
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("cancels an in-flight hosted lease before any provider submission", async () => {
  const abort = new AbortController();
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body)).operation).toBe("lease");
    abort.abort();
    expect(init?.signal?.aborted).toBe(true);
    throw new DOMException("aborted", "AbortError");
  }) as typeof fetch;
  expect(await runHostedRoomInterpreterCanary({ ...input(fetchImpl), signal: abort.signal }))
    .toEqual({ ok: false, code: "lease_unconfirmed", requestId, providerCalls: 0 });
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it("reconciles a claimed turn after stop aborts hosted preflight", async () => {
  const abort = new AbortController();
  const roomLease = lease();
  const claimExpiry = new Date(Date.now() + 12_000).toISOString();
  const operations: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target === "https://rooms.example.test/mcp/room-interpreter")
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1,
        result: { structuredContent: { schema: "helix.room_interpreter_status_observation.v1",
          room_id: roomId, interpreter_session_id: sessionId, generation: 2,
          state: "configured", lease_expires_at: roomLease.expires_at,
          shared_ai_active: false, model_input: false, provider_calls: 0,
          raw_content_included: false, answer_authority: false, terminal_eligible: false } } }),
      { status: 200, headers: { "Content-Type": "application/json" } });
    if (!target.startsWith("http://127.0.0.1")) throw Error("provider must not be called");
    const body = JSON.parse(String(init?.body)); operations.push(body.operation);
    if (body.operation === "lease") return new Response(JSON.stringify(roomLease), { status: 201 });
    if (body.operation === "claim") return new Response(JSON.stringify({
      schema: "helix.hosted_room_interpreter_claimed_turn.v1", request_id: requestId,
      lease_id: roomLease.lease_id, claim_expires_at: claimExpiry, provider_calls: 0,
      turn: { schema: "helix.room_interpreter_admitted_turn.v1", room_id: roomId,
        interpreter_session_id: sessionId, generation: 2, provider: "openai_agents_api",
        credential_source: "host_native_profile", expected_payer: "host_openai_project",
        usage_ceiling_turns: 1, model_input: true,
        trigger_message_id: "room_message:55555555-5555-4555-8555-555555555555",
        messages: [{ message_id: "room_message:55555555-5555-4555-8555-555555555555",
          author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
          release_id: "room_text_release:77777777-7777-4777-8777-777777777777",
          consent_revision: 1, text: "Guest-approved question" }] },
    }), { status: 200 });
    if (body.operation === "preflight") {
      abort.abort();
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    }
    if (body.operation === "outcome") {
      expect(init?.signal?.aborted).toBe(false);
      expect(body.outcome).toEqual({ kind: "failed", code: "context_changed" });
      return new Response(JSON.stringify({ schema: "helix.room_interpreter_turn_status.v1",
        room_id: roomId, request_id: requestId, state: "failed",
        mission_authority: false, program_action: false, reply: null,
        failure_code: "context_changed" }), { status: 200 });
    }
    throw Error("unexpected local operation");
  }) as typeof fetch;
  expect(await runHostedRoomInterpreterCanary({ ...input(fetchImpl), signal: abort.signal }))
    .toEqual({ ok: false, code: "context_changed", requestId, providerCalls: 0 });
  expect(operations).toEqual(["lease", "claim", "preflight", "outcome"]);
});

it("sends one attributed three-author turn after hosted lease, claim and consent preflight", async () => {
  const roomLease = lease();
  const claimExpiry = new Date(Date.now() + 12_000).toISOString();
  const ownerMessageId = "room_message:44444444-4444-4444-8444-444444444444";
  const guestMessageId = "room_message:55555555-5555-4555-8555-555555555555";
  const secondGuestMessageId = "room_message:88888888-8888-4888-8888-888888888888";
  const providerPosts: unknown[] = [];
  const operations: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target.startsWith("http://127.0.0.1")) {
      const body = JSON.parse(String(init?.body)); operations.push(body.operation);
      if (body.operation === "lease") return new Response(JSON.stringify(roomLease), { status: 201 });
      if (body.operation === "claim") return new Response(JSON.stringify({
        schema: "helix.hosted_room_interpreter_claimed_turn.v1", request_id: requestId,
        lease_id: roomLease.lease_id, claim_expires_at: claimExpiry, provider_calls: 0,
        turn: { schema: "helix.room_interpreter_admitted_turn.v1", room_id: roomId,
          interpreter_session_id: sessionId, generation: 2, provider: "openai_agents_api",
          credential_source: "host_native_profile", expected_payer: "host_openai_project",
          usage_ceiling_turns: 1, model_input: true, trigger_message_id: secondGuestMessageId,
          messages: [{ message_id: ownerMessageId,
            author_participant_id: "shared_realtime_participant:44444444-4444-4444-8444-444444444444",
            author_role: "owner", release_id: "room_text_release:44444444-4444-4444-8444-444444444444",
            consent_revision: 1, text: "Owner proposal" },
          { message_id: guestMessageId,
            author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
            author_role: "participant",
            release_id: "room_text_release:77777777-7777-4777-8777-777777777777",
            consent_revision: 1, text: "Guest A correction" },
          { message_id: secondGuestMessageId,
            author_participant_id: "shared_realtime_participant:99999999-9999-4999-8999-999999999999",
            author_role: "participant", release_id: "room_text_release:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            consent_revision: 1, text: "Guest B disagreement" }] },
      }), { status: 200 });
      if (body.operation === "preflight") return new Response(JSON.stringify({
        schema: "helix.hosted_room_interpreter_claim_preflight.v1", room_id: roomId,
        request_id: requestId, lease_id: roomLease.lease_id,
        claim_expires_at: claimExpiry, context_current: true, model_input: false,
        provider_calls: 0,
      }), { status: 200 });
      if (body.operation === "outcome") {
        expect(body.outcome).toMatchObject({ kind: "completed", text: "Attribution preserved.",
          providerSessionId: "agent_session_123" });
        return new Response(JSON.stringify({ schema: "helix.room_interpreter_turn_status.v1",
          room_id: roomId, request_id: requestId, state: "completed",
          mission_authority: false, program_action: false, failure_code: null,
          reply: { text: "Attribution preserved." } }), { status: 200 });
      }
      throw Error("unexpected local operation");
    }
    if (target === "https://rooms.example.test/mcp/room-interpreter") {
      expect(new Headers(init?.headers).get("Authorization"))
        .toBe(`Bearer ${roomLease.bearer_token}`);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1,
        result: { structuredContent: { schema: "helix.room_interpreter_status_observation.v1",
          room_id: roomId, interpreter_session_id: sessionId, generation: 2,
          state: "configured", lease_expires_at: roomLease.expires_at,
          shared_ai_active: false, model_input: false, provider_calls: 0,
          raw_content_included: false, answer_authority: false, terminal_eligible: false } } }),
      { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target === "https://api.openai.com/v1/agents/sessions" && init?.method === "POST") {
      providerPosts.push(JSON.parse(String(init.body)));
      const frames = [
        { type: "agent.session.turn.output_text.done", session_id: "agent_session_123",
          item_id: "answer", text: "Attribution preserved." },
        { type: "agent.session.turn.completed", session_id: "agent_session_123",
          turn: { subagent_id: null } },
      ].map(value => `data: ${JSON.stringify(value)}\n\n`).join("");
      return new Response(frames, { status: 200,
        headers: { "Content-Type": "text/event-stream" } });
    }
    if (target === "https://api.openai.com/v1/agents/sessions/agent_session_123" &&
        init?.method === "DELETE") return new Response(null, { status: 204 });
    throw Error(`unexpected URL ${target}`);
  }) as typeof fetch;
  expect(await runHostedRoomInterpreterCanary(input(fetchImpl))).toEqual({ ok: true,
    code: "completed", requestId, providerCalls: 1 });
  expect(operations).toEqual(["lease", "claim", "preflight", "outcome"]);
  expect(providerPosts).toHaveLength(1);
  const providerInput = JSON.parse((providerPosts[0] as { input: string }).input);
  expect(providerInput).toMatchObject({ room_id: roomId, trigger_message_id: secondGuestMessageId });
  expect(providerInput.messages.map((message: { author_role: string; text: string }) =>
    [message.author_role, message.text])).toEqual([
    ["owner", "Owner proposal"], ["participant", "Guest A correction"],
    ["participant", "Guest B disagreement"],
  ]);
  expect(JSON.stringify(providerPosts[0])).not.toContain("sk-private-test-key");
});
