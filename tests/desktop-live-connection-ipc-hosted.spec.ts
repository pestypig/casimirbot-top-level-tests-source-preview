import { expect, it, vi } from "vitest";
import { createLiveConnectionIpc } from "../apps/desktop/src/live-connection-ipc";
import type { LiveConnectionStore } from "../apps/desktop/src/live-connection-store";

const account = { profileId: "host-profile", sessionId: "account_session:12345678",
  accountType: "developer" as const };
const request = { action: "room_hosted_interpreter_run",
  room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
  interpreter_session_id: "room_interpreter:22222222-2222-4222-8222-222222222222",
  generation: 2, request_id: "room_interpreter_turn:33333333-3333-4333-8333-333333333333" };
const sender = { mainFrame: { url: "http://127.0.0.1:8767/" },
  isDestroyed: () => false };
const event = { sender, senderFrame: sender.mainFrame };
const store = { keyForProfile: () => "sk-private-fixture", inspect: () => ({
  configured: true, source: "saved" as const }) } as unknown as LiveConnectionStore;

it("rejects a renderer attempt when the attended room canary is disabled", async () => {
  const run = vi.fn();
  const handler = createLiveConnectionIpc({ mainSender: () => sender,
    trustedUrl: () => true, readAccount: async () => account, store,
    hostedRoomInterpreterEnabled: () => false,
    runHostedRoomInterpreter: run });
  expect(await handler(event, request)).toEqual({ ok: false,
    code: "room_hosted_interpreter_not_enabled" });
  expect(run).not.toHaveBeenCalled();
  expect(await handler(event, { action: "inspect" })).toMatchObject({
    roomHostedInterpreterCanaryEnabled: false });
});

it("serializes duplicate owner clicks for the exact hosted turn", async () => {
  let finish!: (value: { ok: true; code: "room_hosted_interpreter_completed" }) => void;
  const run = vi.fn(async () => new Promise<{ ok: true; code: "room_hosted_interpreter_completed" }>(
    resolve => { finish = resolve; }));
  const handler = createLiveConnectionIpc({ mainSender: () => sender,
    trustedUrl: () => true, readAccount: async () => account, store,
    hostedRoomInterpreterEnabled: () => true,
    runHostedRoomInterpreter: run });
  const first = handler(event, request);
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  expect(await handler(event, request)).toEqual({ ok: false, code: "room_hosted_interpreter_busy" });
  finish({ ok: true, code: "room_hosted_interpreter_completed" });
  expect(await first).toEqual({ ok: true, code: "room_hosted_interpreter_completed" });
  expect(run).toHaveBeenCalledTimes(1);
});

it("stops only the active exact room turn for its current account session", async () => {
  let currentAccount = account;
  let activeSignal: AbortSignal | undefined;
  const run = vi.fn(async (_account: unknown, _roomId: string, _sessionId: string,
    _generation: number, _requestId: string, signal: AbortSignal) => {
    activeSignal = signal;
    return new Promise<{ ok: false; code: "room_hosted_interpreter_unconfirmed" }>(resolve => {
      signal.addEventListener("abort", () => resolve({ ok: false,
        code: "room_hosted_interpreter_unconfirmed" }), { once: true });
    });
  });
  const handler = createLiveConnectionIpc({ mainSender: () => sender,
    trustedUrl: () => true, readAccount: async () => currentAccount, store,
    hostedRoomInterpreterEnabled: () => true, runHostedRoomInterpreter: run });
  const first = handler(event, request);
  await vi.waitFor(() => expect(activeSignal).toBeDefined());
  const stop = { action: "room_hosted_interpreter_stop", room_id: request.room_id,
    request_id: request.request_id };
  expect(await handler(event, { ...stop,
    request_id: "room_interpreter_turn:99999999-9999-4999-8999-999999999999" }))
    .toEqual({ ok: false, code: "room_hosted_interpreter_not_running" });
  expect(activeSignal?.aborted).toBe(false);
  currentAccount = { ...account, sessionId: "account_session:other123" };
  expect(await handler(event, stop)).toEqual({ ok: false,
    code: "room_hosted_interpreter_not_running" });
  expect(activeSignal?.aborted).toBe(false);
  currentAccount = account;
  expect(await handler(event, stop)).toEqual({ ok: true,
    code: "room_hosted_interpreter_stop_requested" });
  expect(activeSignal?.aborted).toBe(true);
  expect(await first).toEqual({ ok: false, code: "room_hosted_interpreter_unconfirmed" });
  expect(await handler(event, stop)).toEqual({ ok: false,
    code: "room_hosted_interpreter_not_running" });
});

it("admits only an enabled bounded AR-2 ordinal and stops its exact native run", async () => {
  const evaluation = { ...request, action: "room_hosted_interpreter_evaluation_run",
    turn_ordinal: 2 };
  let activeSignal: AbortSignal | undefined;
  const run = vi.fn(async (_account: unknown, _roomId: string, _sessionId: string,
    _generation: number, _requestId: string, _ordinal: 1 | 2, signal: AbortSignal) => {
    activeSignal = signal;
    return new Promise<{ ok: false; code: "room_hosted_interpreter_evaluation_unconfirmed" }>(resolve => {
      signal.addEventListener("abort", () => resolve({ ok: false,
        code: "room_hosted_interpreter_evaluation_unconfirmed" }), { once: true });
    });
  });
  const handler = createLiveConnectionIpc({ mainSender: () => sender,
    trustedUrl: () => true, readAccount: async () => account, store,
    hostedRoomEvaluationEnabled: () => true, runHostedRoomEvaluation: run });
  expect(await handler(event, { ...evaluation, turn_ordinal: 3 }))
    .toEqual({ ok: false, code: "request_rejected" });
  expect(await handler(event, { ...evaluation, extra: "untrusted" }))
    .toEqual({ ok: false, code: "request_rejected" });
  const first = handler(event, evaluation);
  await vi.waitFor(() => expect(activeSignal).toBeDefined());
  expect(run).toHaveBeenCalledWith(account, request.room_id,
    request.interpreter_session_id, 2, request.request_id, 2, activeSignal);
  expect(await handler(event, evaluation)).toEqual({ ok: false,
    code: "room_hosted_interpreter_busy" });
  expect(await handler(event, { action: "room_hosted_interpreter_stop",
    room_id: request.room_id, request_id: request.request_id }))
    .toEqual({ ok: true, code: "room_hosted_interpreter_stop_requested" });
  expect(activeSignal?.aborted).toBe(true);
  expect(await first).toEqual({ ok: false,
    code: "room_hosted_interpreter_evaluation_unconfirmed" });
});

it("aborts an active hosted turn and closes retained context before replacing its key", async () => {
  let currentAccount = account;
  let finishCleanup!: (confirmed: boolean) => void;
  const cleanup = vi.fn(async () => new Promise<boolean>(resolve => { finishCleanup = resolve; }));
  const save = vi.fn(() => ({ ok: true as const, code: "saved" as const }));
  const profileStore = { keyForProfile: () => "sk-original-fixture-key", save,
    disconnect: vi.fn() } as unknown as LiveConnectionStore;
  let activeSignal: AbortSignal | undefined;
  const run = vi.fn(async (_account: unknown, _roomId: string, _sessionId: string,
    _generation: number, _requestId: string, signal: AbortSignal) => {
    activeSignal = signal;
    return new Promise<{ ok: false; code: "room_hosted_interpreter_unconfirmed" }>(resolve => {
      signal.addEventListener("abort", () => resolve({ ok: false,
        code: "room_hosted_interpreter_unconfirmed" }), { once: true });
    });
  });
  const handler = createLiveConnectionIpc({ mainSender: () => sender,
    trustedUrl: () => true, readAccount: async () => currentAccount, store: profileStore,
    hostedRoomInterpreterEnabled: () => true, runHostedRoomInterpreter: run,
    closeRetainedRoomConversations: cleanup });
  const running = handler(event, request);
  await vi.waitFor(() => expect(activeSignal).toBeDefined());
  currentAccount = { ...account, sessionId: "account_session:new-owner-session" };

  const replacement = "sk-" + "a".repeat(20);
  const changing = handler(event, { action: "save", key: replacement });
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalledWith(account.profileId,
    "sk-original-fixture-key"));
  expect(activeSignal?.aborted).toBe(true);
  expect(await handler(event, request)).toEqual({ ok: false, code: "room_hosted_interpreter_busy" });
  expect(await handler(event, { action: "disconnect" })).toEqual({ ok: false,
    code: "conversation_busy" });
  expect(save).not.toHaveBeenCalled();
  finishCleanup(true);
  expect(await changing).toMatchObject({ ok: true, code: "saved", cleanupConfirmed: false });
  expect(save).toHaveBeenCalledWith(account.profileId, replacement);
  expect(await running).toMatchObject({ ok: false });
});
