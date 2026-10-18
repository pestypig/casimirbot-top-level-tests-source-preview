import { describe, expect, it, vi } from "vitest";
import { continueManagedConversation, startManagedConversation,
  startAdmittedRoomInterpreterConversation, checkRoomInterpreterMcpLease,
  confirmSavedRoomMcpStatusCall,
  startAdmittedRoomInterpreterEvaluationConversation,
  continueAdmittedRoomInterpreterEvaluationConversation } from "../apps/desktop/src/managed-agent-conversation";

const key = "sk-test-never-real";
const sse = (rows: unknown[]) => new Response(rows.map(row => `data: ${JSON.stringify(row)}\n\n`).join(""),
  { headers: { "content-type": "text/event-stream" } });
const created = { type: "agent.session.created", session: { id: "sess_one" } };
const answer = { type: "agent.session.turn.output_text.done", item_id: "msg_one", text: "Answer" };
const complete = { type: "agent.session.turn.completed", turn: { subagent_id: null } };
const roomLeaseToken = `cb_room_int_mcp_${"a".repeat(43)}`;
const roomId = "shared_realtime_room:44444444-4444-4444-8444-444444444444";
const roomSessionId = "room_interpreter:11111111-1111-4111-8111-111111111111";
const hostMessageId = "room_message:55555555-5555-4555-8555-555555555555";
const guestMessageId = "room_message:66666666-6666-4666-8666-666666666666";
const roomTurn = { schema: "helix.room_interpreter_admitted_turn.v1", room_id: roomId,
  interpreter_session_id: roomSessionId, generation: 2, provider: "openai_agents_api",
  credential_source: "host_native_profile", expected_payer: "host_openai_project",
  usage_ceiling_turns: 1, model_input: true, trigger_message_id: guestMessageId,
  messages: [{ message_id: hostMessageId, author_participant_id: "shared_realtime_participant:77777777-7777-4777-8777-777777777777",
    release_id: "room_text_release:88888888-8888-4888-8888-888888888888", consent_revision: 1, text: "Host question" },
  { message_id: guestMessageId, author_participant_id: "shared_realtime_participant:99999999-9999-4999-8999-999999999999",
    release_id: "room_text_release:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", consent_revision: 2, text: "Guest correction" }] };
const roomLeaseScope = { roomId, interpreterSessionId: roomSessionId,
  generation: 2, expiresAt: new Date(Date.now() + 60_000).toISOString() };
const roomClaimScope = { requestId: "room_interpreter_turn:33333333-3333-4333-8333-333333333333",
  roomId, interpreterSessionId: roomSessionId,
  generation: 2, expiresAt: new Date(Date.now() + 12_000).toISOString() };
const roomMcpStatus = (overrides: Record<string, unknown> = {}) => new Response(JSON.stringify({
  jsonrpc: "2.0", id: 1, result: { structuredContent: {
    schema: "helix.room_interpreter_status_observation.v1", room_id: roomId,
    interpreter_session_id: roomSessionId, generation: 2, state: "configured",
    lease_expires_at: roomLeaseScope.expiresAt, shared_ai_active: false,
    model_input: false, provider_calls: 0, raw_content_included: false,
    answer_authority: false, terminal_eligible: false, ...overrides,
  } },
}), { headers: { "content-type": "application/json" } });

describe("native managed conversation transport", () => {
  it("sends a real initial prompt with bounded personal tools", async () => {
    const fetcher = vi.fn().mockResolvedValue(sse([created,
      { type: "agent.session.turn.output_text.done", item_id: "child", subagent_id: "child", text: "Private child" },
      answer, complete]));
    expect(await startManagedConversation({ key, prompt: "How are you?", fetchImpl: fetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.input).toBe("How are you?");
    expect(sent.agent.tools).toEqual([{ type: "function", name: "casimirbot_read_native_clock",
      description: expect.any(String), parameters: { type: "object", properties: {},
        required: [], additionalProperties: false } }, { type: "function",
      name: "casimirbot_list_personal_capabilities", description: expect.any(String),
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false } }, { type: "function",
      name: "casimirbot_read_public_reasoning_context", description: expect.any(String),
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
      { type: "mcp", server_label: "casimirbot_public_context",
        transport: { type: "http", server_url: "https://casimirbot.com/mcp/public-context" },
        connection_origin: "service", required: true,
        allowed_tools: ["casimir_civilization_bounds_reflect", "casimir_theory_badges_reflect",
          "casimir_moral_graph_reflect"] }, { type: "function",
      name: "casimirbot_request_bound_codex_handoff", description: expect.any(String),
      parameters: { type: "object", properties: { instruction: expect.any(Object) },
        required: ["instruction"], additionalProperties: false } }]);
    expect(sent.metadata).toEqual({ casimirbot_scope: "personal_agent_tools_v2" });
    expect(sent.environment).toEqual({ type: "none" });
  });
  it("reports only completed public MCP calls from the completed personal turn", async () => {
    const publicCall = (turnId: string, name: string, status = "completed") => ({
      type: "agent.session.turn.item.done", turn_id: turnId,
      item: { type: "mcp_call", turn_id: turnId, server_label: "casimirbot_public_context",
        name, status, output: [{ type: "text", text: "bounded public context" }] },
    });
    const fetcher = vi.fn().mockResolvedValue(sse([created,
      publicCall("other_turn", "casimir_theory_badges_reflect"),
      publicCall("turn_one", "casimir_civilization_bounds_reflect", "failed"),
      publicCall("turn_one", "casimir_moral_graph_reflect"), answer,
      { ...complete, turn_id: "turn_one", turn: { id: "turn_one", subagent_id: null } }]));
    expect(await startManagedConversation({ key, prompt: "Who is affected?", fetchImpl: fetcher }))
      .toMatchObject({ ok: true, publicContextMcpTools: ["casimir_moral_graph_reflect"] });
  });
  it("answers one owner-scoped native clock function call and links its evidence to the completed turn", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.requires_action" }, answer,
      { ...complete, turn_id: "turn_one", turn: { id: "turn_one", subagent_id: null } }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess_one", object: "agent.session",
        status: "requires_action", environment: { type: "none" },
        metadata: { casimirbot_scope: "personal_agent_tools_v2" }, required_actions: [{
          type: "function_call", turn_id: "turn_one", call_id: "call_one",
          name: "casimirbot_read_native_clock", arguments: {},
        }] })))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    const result = await startManagedConversation({ key, prompt: "What time is it here?", fetchImpl: fetcher });
    expect(result, JSON.stringify({ result, calls: fetcher.mock.calls.map(call => ({url: call[0], method: call[1]?.method})) })).toMatchObject({ ok: true, sessionId: "sess_one", text: "Answer",
      nativeToolObservation: { schema: "casimirbot.personal_native_clock_observation.v1",
        source: "desktop_native_clock", evidenceRef: expect.stringMatching(/^native-clock:/) } });
    const submitted = JSON.parse(fetcher.mock.calls[2][1].body).events[0];
    expect(submitted).toMatchObject({ type: "agent.session.input.tool_result",
      turn_id: "turn_one", call_id: "call_one", success: true });
    expect(JSON.parse(submitted.output)).toEqual((result as Extract<typeof result, {ok: true}>).nativeToolObservation);
  });
  it("returns a bounded personal capability inventory without claiming MCP or pairing access", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.requires_action" }, answer,
      { ...complete, turn_id: "turn_one", turn: { id: "turn_one", subagent_id: null } }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess_one", object: "agent.session",
        status: "requires_action", environment: { type: "none" },
        metadata: { casimirbot_scope: "personal_agent_tools_v2" }, required_actions: [{
          type: "function_call", turn_id: "turn_one", call_id: "call_one",
          name: "casimirbot_list_personal_capabilities", arguments: {},
        }] })))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    expect(await startManagedConversation({ key, prompt: "What tools do you have?", fetchImpl: fetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    const submitted = JSON.parse(fetcher.mock.calls[2][1].body).events[0];
    const catalog = JSON.parse(submitted.output);
    expect(catalog).toMatchObject({ schema: "casimirbot.personal_capability_catalog.v1",
      pairing_verified: false, unavailable_directly: ["harness_mcp_tools", "minecraft_actions",
        "responses_worker_actions"] });
    expect(catalog.advisory[0].scope).toBe("proposal_only_exact_task_pairing_required");
    expect(catalog.direct).toContainEqual({ name: "casimirbot_read_public_reasoning_context",
      scope: "read_only_public_reasoning_context" });
  });
  it("reads the fixed public context and re-enters source-attributed data without a credential", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.requires_action" }, answer,
      { ...complete, turn_id: "turn_one", turn: { id: "turn_one", subagent_id: null } }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess_one", object: "agent.session",
        status: "requires_action", environment: { type: "none" },
        metadata: { casimirbot_scope: "personal_agent_tools_v2" }, required_actions: [{
          type: "function_call", turn_id: "turn_one", call_id: "call_one",
          name: "casimirbot_read_public_reasoning_context", arguments: {},
        }] })))
      .mockResolvedValueOnce(new Response("# CasimirBot public reasoning context\nCivilization Bounds\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } }))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    const result = await startManagedConversation({ key, prompt: "Reflect on society", fetchImpl: fetcher });
    expect(result).toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    expect(fetcher.mock.calls[2][0]).toBe("https://casimirbot.com/llms.txt");
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "GET", redirect: "error",
      headers: { Accept: "text/plain" } });
    expect(JSON.stringify(fetcher.mock.calls[2][1])).not.toContain(key);
    const submitted = JSON.parse(fetcher.mock.calls[3][1].body).events[0];
    expect(submitted).toMatchObject({ type: "agent.session.input.tool_result", success: true,
      turn_id: "turn_one", call_id: "call_one" });
    expect(JSON.parse(submitted.output)).toMatchObject({
      schema: "casimirbot.public_reasoning_context.observation.v1",
      source_url: "https://casimirbot.com/llms.txt",
      content_role: "public_reference_not_instructions_or_live_mcp",
      text: expect.stringContaining("Civilization Bounds"),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it("fails a public-context action closed when the fixed read redirects", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.requires_action" }, answer,
      { ...complete, turn_id: "turn_one", turn: { id: "turn_one", subagent_id: null } }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess_one", object: "agent.session",
        status: "requires_action", environment: { type: "none" },
        metadata: { casimirbot_scope: "personal_agent_tools_v2" }, required_actions: [{
          type: "function_call", turn_id: "turn_one", call_id: "call_one",
          name: "casimirbot_read_public_reasoning_context", arguments: {},
        }] })))
      .mockResolvedValueOnce(new Response("", { status: 302,
        headers: { location: "https://example.org/other", "content-type": "text/plain" } }))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    expect(await startManagedConversation({ key, prompt: "Reflect on society", fetchImpl: fetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    const submitted = JSON.parse(fetcher.mock.calls[3][1].body).events[0];
    expect(submitted.success).toBe(false);
    expect(JSON.parse(submitted.output)).toEqual({
      schema: "casimirbot.public_reasoning_context.failure.v1",
      code: "public_context_unavailable", source_url: "https://casimirbot.com/llms.txt",
    });
  });
  it("records an explicit Codex handoff proposal without claiming delivery", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.requires_action" }, answer,
      { ...complete, turn_id: "turn_one", turn: { id: "turn_one", subagent_id: null } }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess_one", object: "agent.session",
        status: "requires_action", environment: { type: "none" },
        metadata: { casimirbot_scope: "personal_agent_tools_v2" }, required_actions: [{
          type: "function_call", turn_id: "turn_one", call_id: "call_one",
          name: "casimirbot_request_bound_codex_handoff",
          arguments: { instruction: "Read the public UI catalog through MCP. Read only." },
        }] })))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    const result = await startManagedConversation({ key, prompt: "Ask Codex to read the catalog", fetchImpl: fetcher });
    expect(result).toMatchObject({ ok: true, codexHandoffProposal: {
      schema: "casimirbot.personal_codex_handoff_proposal.v1",
      proposalId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      instructionText: "Read the public UI catalog through MCP. Read only." } });
    const submitted = JSON.parse(fetcher.mock.calls[2][1].body).events[0];
    expect(JSON.parse(submitted.output)).toMatchObject({ status: "proposed_to_desktop",
      delivered: false });
  });
  it("does not hold a completed handoff while the tool-result response body refuses cancellation", async () => {
    let cancelStarted = false;
    const stuckBody = new ReadableStream<Uint8Array>({
      cancel() { cancelStarted = true; return new Promise<void>(() => undefined); },
    });
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.requires_action" }, answer,
      { ...complete, turn_id: "turn_one", turn: { id: "turn_one", subagent_id: null } }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess_one", object: "agent.session",
        status: "requires_action", environment: { type: "none" },
        metadata: { casimirbot_scope: "personal_agent_tools_v2" }, required_actions: [{
          type: "function_call", turn_id: "turn_one", call_id: "call_one",
          name: "casimirbot_request_bound_codex_handoff",
          arguments: { instruction: "Read the public UI catalog through MCP. Read only." },
        }] })))
      .mockResolvedValueOnce(new Response(stuckBody, { status: 202 }));
    const outcome = await Promise.race([
      startManagedConversation({ key, prompt: "Ask Codex to read the catalog", fetchImpl: fetcher }),
      new Promise(resolve => setTimeout(() => resolve("hung"), 250)),
    ]);
    expect(cancelStarted).toBe(true);
    expect(outcome).toMatchObject({ ok: true, codexHandoffProposal: {
      instructionText: "Read the public UI catalog through MCP. Read only.",
    } });
  });
  it("does not hold a completed answer while SSE reader cancellation refuses to settle", async () => {
    let cancelStarted = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode([created, answer, complete]
          .map(row => `data: ${JSON.stringify(row)}\n\n`).join("")));
      },
      cancel() { cancelStarted = true; return new Promise<void>(() => undefined); },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(stream,
      { headers: { "content-type": "text/event-stream" } }));
    const outcome = await Promise.race([
      startManagedConversation({ key, prompt: "How are you?", fetchImpl: fetcher }),
      new Promise(resolve => setTimeout(() => resolve("hung"), 250)),
    ]);
    expect(cancelStarted).toBe(true);
    expect(outcome).toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
  });
  it("rejects a provider action outside the one read-only personal tool", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.requires_action" }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess_one", object: "agent.session",
        status: "requires_action", environment: { type: "none" },
        metadata: { casimirbot_scope: "personal_agent_tools_v2" }, required_actions: [{
          type: "function_call", turn_id: "turn_one", call_id: "call_one",
          name: "execute_program_action", arguments: {},
        }] })))
      .mockResolvedValueOnce(new Response(""))
      .mockResolvedValueOnce(new Response(""));
    expect(await startManagedConversation({ key, prompt: "Do something", fetchImpl: fetcher }))
      .toEqual({ ok: false, code: "incomplete", diagnostic: "stream_interrupted" });
    expect(fetcher.mock.calls.some(call => call[1].body &&
      String(call[1].body).includes("agent.session.input.tool_result"))).toBe(false);
  });
  it("does not accept idle, partial, failed, or mismatched session streams", async () => {
    for (const rows of [
      [created, answer, { type: "agent.session.idle" }],
      [created, answer, { type: "agent.session.turn.failed", turn: { subagent_id: null } }],
      [created, complete],
    ]) {
      const fetcher = vi.fn().mockResolvedValue(sse(rows));
      expect((await startManagedConversation({ key, prompt: "Question", fetchImpl: fetcher })).ok).toBe(false);
    }
    const fetcher = vi.fn().mockResolvedValue(sse([created, { type: "agent.session.created", session: { id: "sess_other" } }, answer, complete]));
    expect((await startManagedConversation({ key, prompt: "Question", fetchImpl: fetcher })).ok).toBe(false);
  });
  it("cleans up a known session after a malformed stream", async () => {
    const malformed = new Response(`data: ${JSON.stringify(created)}\n\ndata: {bad json}\n\n`,
      { headers: { "content-type": "text/event-stream" } });
    const fetcher = vi.fn().mockResolvedValueOnce(malformed)
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("{}"));
    expect(await startManagedConversation({ key, prompt: "Question", fetchImpl: fetcher }))
      .toEqual({ ok: false, code: "incomplete", diagnostic: "stream_interrupted" });
    expect(fetcher.mock.calls[1][0]).toBe("https://api.openai.com/v1/agents/sessions/sess_one/events");
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[1][1].body).events[0].type).toBe("agent.session.input.cancel");
    expect(fetcher.mock.calls[2][0]).toBe("https://api.openai.com/v1/agents/sessions/sess_one");
    expect(fetcher.mock.calls[2][1].method).toBe("DELETE");
  });
  it("reports a content-free terminal diagnostic when the provider ends a turn without an answer", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(sse([created,
      { type: "agent.session.turn.failed", turn: { subagent_id: null }, error: { message: key } }]))
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("{}"));
    const result = await startManagedConversation({ key, prompt: "Question", fetchImpl: fetcher });
    expect(result).toEqual({ ok: false, code: "incomplete", diagnostic: "provider_terminal_event" });
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it("subscribes before sending a follow-up and preserves a stable request identity", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      id: "sess_one", object: "agent.session", status: "idle", required_actions: [],
      environment: { type: "none" },
    }))).mockResolvedValueOnce(sse([answer, complete]))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    expect(await continueManagedConversation({ key, sessionId: "sess_one", prompt: "And then?",
      idempotencyKey: "request_12345", fetchImpl: fetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    expect(fetcher.mock.calls.map(call => call[1].method)).toEqual(["GET", "GET", "POST"]);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/agents/sessions/sess_one");
    expect(fetcher.mock.calls[1][0]).toContain("sess_one/events?stream=true");
    expect(fetcher.mock.calls[2][1].headers["Idempotency-Key"]).toBe("request_12345");
    expect(JSON.parse(fetcher.mock.calls[2][1].body).events[0].input[0].content[0].text).toBe("And then?");
  });
  it("continues the personal native-tool session without inheriting room MCP scope", async () => {
    const idle = { id: "sess_one", object: "agent.session", status: "idle",
      required_actions: [], environment: { type: "none" },
      metadata: { casimirbot_scope: "personal_agent_tools_v2" } };
    const pendingAction = { ...idle, status: "requires_action", required_actions: [{
      type: "function_call", turn_id: "turn_next", call_id: "call_next",
      name: "casimirbot_read_native_clock", arguments: {},
    }] };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(idle)))
      .mockResolvedValueOnce(sse([{ type: "agent.session.requires_action" }, answer,
        { ...complete, turn_id: "turn_next", turn: { id: "turn_next", subagent_id: null } }]))
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pendingAction)))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    const result = await continueManagedConversation({ key, sessionId: "sess_one",
      prompt: "And now?", idempotencyKey: "request_12345", personalNativeClock: true,
      fetchImpl: fetcher });
    expect(result).toMatchObject({ ok: true, text: "Answer",
      nativeToolObservation: { source: "desktop_native_clock" } });
    expect(fetcher.mock.calls.map(call => call[1].method))
      .toEqual(["GET", "GET", "POST", "GET", "POST"]);
    const submitted = JSON.parse(fetcher.mock.calls[4][1].body).events[0];
    expect(submitted).toMatchObject({ type: "agent.session.input.tool_result",
      turn_id: "turn_next", call_id: "call_next" });
    const wrongScope = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ...idle, metadata: { casimirbot_scope: "room_interpreter" },
    })));
    expect(await continueManagedConversation({ key, sessionId: "sess_one",
      prompt: "And now?", idempotencyKey: "request_12345", personalNativeClock: true,
      fetchImpl: wrongScope })).toEqual({ ok: false, code: "provider_error" });
    expect(wrongScope).toHaveBeenCalledTimes(1);
    const omittedScope = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(idle)));
    expect(await continueManagedConversation({ key, sessionId: "sess_one",
      prompt: "And now?", idempotencyKey: "request_12345", fetchImpl: omittedScope }))
      .toEqual({ ok: false, code: "provider_error" });
    expect(omittedScope).toHaveBeenCalledTimes(1);
  });
  it("does not steer an active, action-pending, failed, or different session", async () => {
    for (const session of [
      { id: "sess_one", object: "agent.session", status: "in_progress", required_actions: [], environment: { type: "none" } },
      { id: "sess_one", object: "agent.session", status: "requires_action", required_actions: [{ type: "function_call" }], environment: { type: "none" } },
      { id: "sess_one", object: "agent.session", status: "failed", required_actions: [], environment: { type: "none" } },
      { id: "sess_other", object: "agent.session", status: "idle", required_actions: [], environment: { type: "none" } },
    ]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(session)));
      expect(await continueManagedConversation({ key, sessionId: "sess_one", prompt: "Next room turn",
        idempotencyKey: "request_12345", fetchImpl: fetcher }))
        .toEqual({ ok: false, code: "provider_error" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1].method).toBe("GET");
    }
  });
  it("keeps room and personal continuations on their own provider sessions", async () => {
    const binding = { ownerProfileId: "profile:owner", roomAuthority: "https://room.example",
      roomId, interpreterSessionId: roomSessionId, generation: 2,
      firstRequestId: roomClaimScope.requestId };
    const metadata = { casimirbot_scope: "room_interpreter",
      casimirbot_owner_profile_id: "profile:owner",
      casimirbot_room_authority: "https://room.example", casimirbot_room_id: roomId,
      casimirbot_interpreter_id: roomSessionId, casimirbot_generation: "2",
      casimirbot_first_request_id: roomClaimScope.requestId };
    const idle = { id: "sess_one", object: "agent.session", status: "idle",
      required_actions: [], environment: { type: "none" }, metadata };
    const roomFetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(idle)))
      .mockResolvedValueOnce(sse([answer, complete]))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    expect(await continueManagedConversation({ key, sessionId: "sess_one",
      prompt: "Released guest correction", idempotencyKey: "request_12345",
      roomBinding: binding, fetchImpl: roomFetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    expect(roomFetcher.mock.calls.map(call => call[1].method)).toEqual(["GET", "GET", "POST"]);
    for (const wrongBinding of [undefined, { ...binding, roomId:
      "shared_realtime_room:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { ...binding, ownerProfileId: "profile:other" },
      { ...binding, roomAuthority: "https://another.example" },
      { ...binding, interpreterSessionId:
        "room_interpreter:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { ...binding, generation: 3 },
      { ...binding, firstRequestId:
        "room_interpreter_turn:cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]) {
      const rejected = vi.fn().mockResolvedValue(new Response(JSON.stringify(idle)));
      expect(await continueManagedConversation({ key, sessionId: "sess_one",
        prompt: "Released guest correction", idempotencyKey: "request_12345",
        roomBinding: wrongBinding, fetchImpl: rejected }))
        .toEqual({ ok: false, code: "provider_error" });
      expect(rejected).toHaveBeenCalledTimes(1);
    }
    const personal = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...idle, metadata: {},
    })));
    expect(await continueManagedConversation({ key, sessionId: "sess_one",
      prompt: "Released guest correction", idempotencyKey: "request_12345",
      roomBinding: binding, fetchImpl: personal }))
      .toEqual({ ok: false, code: "provider_error" });
    expect(personal).toHaveBeenCalledTimes(1);
    const invalid = vi.fn();
    expect(await continueManagedConversation({ key, sessionId: "sess_one",
      prompt: "Released guest correction", idempotencyKey: "request_12345",
      roomBinding: { ...binding, roomAuthority: "http://127.0.0.1" }, fetchImpl: invalid }))
      .toEqual({ ok: false, code: "invalid_request" });
    expect(invalid).not.toHaveBeenCalled();
  });
  it("keeps an admitted three-member correction in the first room-bound Agents session", async () => {
    const ownerProfileId = "profile:owner";
    const firstTurn = { ...roomTurn, schema: "helix.room_interpreter_admitted_turn.v2",
      usage_ceiling_turns: 2, turn_ordinal: 1, prior_reply: null };
    const firstFetcher = vi.fn().mockResolvedValueOnce(roomMcpStatus())
      .mockResolvedValueOnce(sse([created, answer, complete]));
    expect(await startAdmittedRoomInterpreterEvaluationConversation({ key, ownerProfileId,
      turn: firstTurn, mcpUrl: "https://room.example/mcp/room-interpreter",
      leaseToken: roomLeaseToken, leaseScope: roomLeaseScope,
      claimScope: roomClaimScope, fetchImpl: firstFetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    const firstSent = JSON.parse(firstFetcher.mock.calls[1][1].body);
    expect(JSON.parse(firstSent.input)).toMatchObject({ schema: "helix.room_interpreter_prompt.v2",
      request_id: roomClaimScope.requestId, turn_ordinal: 1, prior_reply: null,
      messages: roomTurn.messages });
    expect(firstSent.agent.tools).toHaveLength(1);
    const correctionMessage = { message_id: "room_message:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      author_participant_id: "shared_realtime_participant:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      author_role: "participant", release_id: "room_text_release:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      consent_revision: 1, text: "Guest B corrects the answer" };
    const correctionTurn = { ...firstTurn, turn_ordinal: 2,
      trigger_message_id: correctionMessage.message_id,
      messages: [...roomTurn.messages, correctionMessage], prior_reply: {
        request_id: roomClaimScope.requestId, provider_session_id: "sess_one",
        result_sha256: "e".repeat(64),
      } };
    const correctionClaim = { ...roomClaimScope,
      requestId: "room_interpreter_turn:22222222-2222-4222-8222-222222222222" };
    const roomBinding = { ownerProfileId, roomAuthority: "https://room.example",
      roomId, interpreterSessionId: roomSessionId, generation: 2,
      firstRequestId: roomClaimScope.requestId };
    const idle = { id: "sess_one", object: "agent.session", status: "idle",
      required_actions: [], environment: { type: "none" }, metadata: firstSent.metadata };
    const correctionFetcher = vi.fn().mockResolvedValueOnce(roomMcpStatus())
      .mockResolvedValueOnce(new Response(JSON.stringify(idle)))
      .mockResolvedValueOnce(sse([
        { type: "agent.session.turn.item.done", event_id: "evt_correction",
          turn_id: "turn_correction",
          item: { type: "mcp_call", id: "mcp_correction", turn_id: "turn_correction",
            server_label: "casimirbot_room_interpreter", name: "helix_room_interpreter_status",
            status: "completed", error: null,
            output: { schema: "helix.room_interpreter_status_observation.v1" } } },
        answer, { ...complete, turn_id: "turn_correction",
          turn: { id: "turn_correction", subagent_id: null } },
      ]))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    expect(await continueAdmittedRoomInterpreterEvaluationConversation({ key,
      turn: correctionTurn, mcpUrl: "https://room.example/mcp/room-interpreter",
      leaseToken: roomLeaseToken, leaseScope: roomLeaseScope,
      claimScope: correctionClaim, roomBinding, fetchImpl: correctionFetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer",
        roomMcpStatusCallObserved: true,
        roomMcpStatusCallReceipt: { eventId: "evt_correction",
          itemId: "mcp_correction", turnId: "turn_correction" } });
    expect(correctionFetcher.mock.calls.map(call => call[1].method))
      .toEqual(["POST", "GET", "GET", "POST"]);
    const submitted = JSON.parse(correctionFetcher.mock.calls[3][1].body);
    expect(JSON.parse(submitted.events[0].input[0].content[0].text))
      .toMatchObject({ schema: "helix.room_interpreter_prompt.v2", turn_ordinal: 2,
        request_id: correctionClaim.requestId, prior_reply: correctionTurn.prior_reply,
        messages: correctionTurn.messages });
    const wrongMetadata = vi.fn().mockResolvedValueOnce(roomMcpStatus())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...idle,
        metadata: { ...firstSent.metadata, casimirbot_room_id: "shared_realtime_room:wrong" } })));
    expect(await continueAdmittedRoomInterpreterEvaluationConversation({ key,
      turn: correctionTurn, mcpUrl: "https://room.example/mcp/room-interpreter",
      leaseToken: roomLeaseToken, leaseScope: roomLeaseScope,
      claimScope: correctionClaim, roomBinding, fetchImpl: wrongMetadata }))
      .toEqual({ ok: false, code: "provider_error" });
    expect(wrongMetadata).toHaveBeenCalledTimes(2);
  });
  it("reports only a completed exact room MCP call from the completed provider turn", async () => {
    const firstTurn = { ...roomTurn, schema: "helix.room_interpreter_admitted_turn.v2",
      usage_ceiling_turns: 2, turn_ordinal: 1, prior_reply: null };
    const call = (overrides: Record<string, unknown> = {}) => ({
      type: "agent.session.turn.item.done", event_id: "evt_room_one",
      turn_id: "turn_room_one",
      item: { type: "mcp_call", id: "mcp_room_one", turn_id: "turn_room_one",
        server_label: "casimirbot_room_interpreter", name: "helix_room_interpreter_status",
        status: "completed", error: null,
        output: { schema: "helix.room_interpreter_status_observation.v1" }, ...overrides },
    });
    const completed = { ...complete, turn_id: "turn_room_one",
      turn: { id: "turn_room_one", subagent_id: null } };
    const run = async (rows: unknown[]) => {
      const fetcher = vi.fn().mockResolvedValueOnce(roomMcpStatus())
        .mockResolvedValueOnce(sse([created, ...rows, answer, completed]));
      return startAdmittedRoomInterpreterEvaluationConversation({ key,
        ownerProfileId: "profile:owner", turn: firstTurn,
        mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
        leaseScope: roomLeaseScope, claimScope: roomClaimScope, fetchImpl: fetcher });
    };
    expect(await run([call()])).toEqual({ ok: true, sessionId: "sess_one", text: "Answer",
      roomMcpStatusCallObserved: true,
      roomMcpStatusCallReceipt: { eventId: "evt_room_one",
        itemId: "mcp_room_one", turnId: "turn_room_one" } });
    for (const item of [
      call({ name: "other_tool" }), call({ server_label: "other_server" }),
      call({ status: "failed" }), call({ error: "denied" }),
      call({ output: null }), call({ output: "" }), call({ output: {} }),
      call({ turn_id: "turn_other" }), call({ id: "" }),
      { ...call(), event_id: "" },
    ]) {
      expect(await run([item])).toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    }
    const otherTurn = { ...call(), turn_id: "turn_other",
      item: { ...call().item, turn_id: "turn_other" } };
    expect(await run([otherTurn])).toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
  });
  it("re-enters the exact saved room MCP item across bounded provider pages", async () => {
    const receipt = { eventId: "evt_room_one", itemId: "mcp_room_one",
      turnId: "turn_room_one" };
    const page = (data: unknown[], has_more: boolean, last_id: string) =>
      new Response(JSON.stringify({ object: "list", data, has_more, last_id }));
    const saved = { id: receipt.itemId, turn_id: receipt.turnId, type: "mcp_call",
      server_label: "casimirbot_room_interpreter", name: "helix_room_interpreter_status",
      status: "completed", error: null,
      output: { schema: "helix.room_interpreter_status_observation.v1" } };
    const fetcher = vi.fn().mockResolvedValueOnce(page([{ id: "msg_prior" }], true, "msg_prior"))
      .mockResolvedValueOnce(page([saved], false, receipt.itemId));
    expect(await confirmSavedRoomMcpStatusCall({ key, sessionId: "sess_one",
      receipt, fetchImpl: fetcher })).toBe(true);
    expect(String(fetcher.mock.calls[1][0])).toContain("after=msg_prior");
    for (const item of [{ ...saved, turn_id: "turn_other" },
      { ...saved, output: null }, { ...saved, status: "failed" }]) {
      const wrong = vi.fn().mockResolvedValue(page([item], false, receipt.itemId));
      expect(await confirmSavedRoomMcpStatusCall({ key, sessionId: "sess_one",
        receipt, fetchImpl: wrong })).toBe(false);
    }
  });
  it("does not expose provider bodies or credentials on HTTP failure", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(key, { status: 401 }));
    const result = await startManagedConversation({ key, prompt: "Question", fetchImpl: fetcher });
    expect(result).toEqual({ ok: false, code: "authentication_failed" });
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it("uses only the leased room-status MCP on a separate environment-free Agents API turn", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(roomMcpStatus())
      .mockResolvedValueOnce(sse([created, answer, complete]));
    const result = await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn: roomTurn,
      mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
      leaseScope: roomLeaseScope, claimScope: roomClaimScope, fetchImpl: fetcher });
    expect(result).toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    expect(fetcher.mock.calls[0][0]).toBe("https://room.example/mcp/room-interpreter");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${roomLeaseToken}`);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).params.name).toBe("helix_room_interpreter_status");
    const sent = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(sent.environment).toEqual({ type: "none" });
    expect(JSON.parse(sent.input)).toEqual({ schema: "helix.room_interpreter_prompt.v1",
      request_id: roomClaimScope.requestId,
      room_id: roomId, interpreter_session_id: roomSessionId, generation: 2,
      trigger_message_id: guestMessageId, messages: roomTurn.messages });
    expect(sent.metadata).toEqual({ casimirbot_scope: "room_interpreter",
      casimirbot_owner_profile_id: "profile:owner",
      casimirbot_room_authority: "https://room.example",
      casimirbot_room_id: roomId, casimirbot_interpreter_id: roomSessionId,
      casimirbot_generation: "2", casimirbot_first_request_id: roomClaimScope.requestId });
    expect(sent.agent.tools).toEqual([{ type: "mcp", server_label: "casimirbot_room_interpreter",
      transport: { type: "http", server_url: "https://room.example/mcp/room-interpreter",
        authorization: `Bearer ${roomLeaseToken}` }, connection_origin: "service",
      allowed_tools: ["helix_room_interpreter_status"], required: true }]);
    expect(sent.agent.tools).toHaveLength(1);
  });
  it("preserves host and two guest roles in the exact three-author Agents API input", async () => {
    const thirdMessageId = "room_message:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const turn = { ...roomTurn, trigger_message_id: thirdMessageId,
      messages: [
        { ...roomTurn.messages[0], author_role: "owner" },
        { ...roomTurn.messages[1], author_role: "participant" },
        { message_id: thirdMessageId,
          author_participant_id: "shared_realtime_participant:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          author_role: "participant",
          release_id: "room_text_release:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          consent_revision: 1, text: "Guest B disagrees with the proposed route" },
      ],
    };
    const fetcher = vi.fn().mockResolvedValueOnce(roomMcpStatus())
      .mockResolvedValueOnce(sse([created, answer, complete]));
    expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn,
      mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
      leaseScope: roomLeaseScope, claimScope: roomClaimScope, fetchImpl: fetcher }))
      .toEqual({ ok: true, sessionId: "sess_one", text: "Answer" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetcher.mock.calls[1][1].body);
    const prompt = JSON.parse(sent.input);
    expect(prompt.messages).toEqual(turn.messages);
    expect(prompt.messages.map((message: { author_role: string }) => message.author_role))
      .toEqual(["owner", "participant", "participant"]);
    expect(sent.environment).toEqual({ type: "none" });
    expect(JSON.stringify(sent)).not.toContain(key);
    expect(JSON.stringify(sent)).not.toContain("Unreleased host-only note");
    expect(sent.agent.tools).toHaveLength(1);
    expect(sent.agent.tools[0].allowed_tools).toEqual(["helix_room_interpreter_status"]);
  });
  it("does not send room text to OpenAI when the HTTPS MCP endpoint rejects or misbinds the lease", async () => {
    for (const preflight of [new Response("{}", { status: 401 }),
      roomMcpStatus({ room_id: "room:other" }), roomMcpStatus({ generation: 3 }),
      roomMcpStatus({ state: "configuration_pending" })]) {
      const fetcher = vi.fn().mockResolvedValue(preflight);
      expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn: roomTurn,
        mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
        leaseScope: roomLeaseScope, claimScope: roomClaimScope, fetchImpl: fetcher }))
        .toEqual({ ok: false, code: "mcp_unavailable" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe("https://room.example/mcp/room-interpreter");
    }
  });
  it("can check the exact lease before claiming a turn and rejects unsafe targets without sending", async () => {
    const fetcher = vi.fn().mockResolvedValue(roomMcpStatus());
    expect(await checkRoomInterpreterMcpLease({ mcpUrl: "https://room.example/mcp/room-interpreter",
      leaseToken: roomLeaseToken, leaseScope: roomLeaseScope, fetchImpl: fetcher })).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const rejected = vi.fn();
    expect(await checkRoomInterpreterMcpLease({ mcpUrl: "http://127.0.0.1/mcp/room-interpreter",
      leaseToken: roomLeaseToken, leaseScope: roomLeaseScope, fetchImpl: rejected })).toBe(false);
    expect(rejected).not.toHaveBeenCalled();
  });
  it("rejects the current zero-turn release and mismatched room lease before any provider call", async () => {
    const fetcher = vi.fn();
    expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "",
      turn: roomTurn, mcpUrl: "https://room.example/mcp/room-interpreter",
      leaseToken: roomLeaseToken, leaseScope: roomLeaseScope,
      claimScope: roomClaimScope, fetchImpl: fetcher }))
      .toEqual({ ok: false, code: "invalid_request" });
    for (const turn of [{ ...roomTurn, model_input: false },
      { ...roomTurn, messages: [{ ...roomTurn.messages[0], private_ask_text: "Do not send" }] },
      { ...roomTurn, messages: [roomTurn.messages[0]] }]) {
      expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn,
        mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
        leaseScope: roomLeaseScope, claimScope: roomClaimScope, fetchImpl: fetcher })).toEqual({ ok: false, code: "invalid_request" });
    }
    expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn: roomTurn,
      mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
      leaseScope: { ...roomLeaseScope, roomId: "room:other" }, claimScope: roomClaimScope, fetchImpl: fetcher }))
      .toEqual({ ok: false, code: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects stale generations, expired leases, duplicate releases and unreleased triggers", async () => {
    const fetcher = vi.fn();
    const invalidCases = [
      { turn: { ...roomTurn, room_id: "room:44444444-4444-4444-8444-444444444444" }, leaseScope: roomLeaseScope },
      { turn: { ...roomTurn, generation: 3 }, leaseScope: roomLeaseScope },
      { turn: roomTurn, leaseScope: { ...roomLeaseScope, interpreterSessionId: "room_interpreter:22222222-2222-4222-8222-222222222222" } },
      { turn: roomTurn, leaseScope: { ...roomLeaseScope, expiresAt: new Date(Date.now() - 1_000).toISOString() } },
      { turn: { ...roomTurn, messages: [{ ...roomTurn.messages[0] },
        { ...roomTurn.messages[1], release_id: roomTurn.messages[0].release_id }] }, leaseScope: roomLeaseScope },
      { turn: { ...roomTurn, trigger_message_id: "message:unreleased" }, leaseScope: roomLeaseScope },
    ];
    for (const { turn, leaseScope } of invalidCases) {
      expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn,
        mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
        leaseScope, claimScope: roomClaimScope, fetchImpl: fetcher })).toEqual({ ok: false, code: "invalid_request" });
    }
    for (const claimScope of [
      { ...roomClaimScope, roomId: "room:other" },
      { ...roomClaimScope, expiresAt: new Date(Date.now() - 1_000).toISOString() },
      { ...roomClaimScope, requestId: "room_interpreter_turn:invalid" },
    ]) {
      expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn: roomTurn,
        mcpUrl: "https://room.example/mcp/room-interpreter", leaseToken: roomLeaseToken,
        leaseScope: roomLeaseScope, claimScope, fetchImpl: fetcher }))
        .toEqual({ ok: false, code: "invalid_request" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["http://room.example/mcp/room-interpreter", "https://localhost/mcp/room-interpreter",
    "https://127.0.0.1/mcp/room-interpreter", "https://room.example/mcp",
    "https://room.example/mcp/room-interpreter?token=bad"])("rejects unsafe room MCP URL %s before a provider call", async mcpUrl => {
    const fetcher = vi.fn();
    expect(await startAdmittedRoomInterpreterConversation({ key, ownerProfileId: "profile:owner", turn: roomTurn, mcpUrl,
      leaseToken: roomLeaseToken, leaseScope: roomLeaseScope, claimScope: roomClaimScope, fetchImpl: fetcher }))
      .toEqual({ ok: false, code: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
