import { afterEach, expect, it, vi } from "vitest";
import type { BrowserWindow, Session } from "electron";
import { createDesktopHostedRoomConnection } from "../apps/desktop/src/desktop-hosted-room-registration";
import type { HostedRoomInterpreterEvaluationRunner } from
  "../apps/desktop/src/hosted-room-interpreter-evaluation-runner";
import type { LiveConnectionStore } from "../apps/desktop/src/live-connection-store";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const interpreterSessionId = "room_interpreter:22222222-2222-4222-8222-222222222222";
const requestId = "room_interpreter_turn:33333333-3333-4333-8333-333333333333";
const account = { profileId: "profile:owner", sessionId: "account_session:12345678",
  accountType: "developer" as const };
const makeWindow = (sessionId: string) => {
  const session = { id: sessionId } as unknown as Session;
  const mainFrame = { url: "http://127.0.0.1:39009/desktop" };
  const webContents = { session, mainFrame, isDestroyed: () => false };
  return { window: { webContents, isDestroyed: () => false } as unknown as BrowserWindow,
    event: { sender: webContents, senderFrame: mainFrame }, session };
};

afterEach(() => vi.unstubAllEnvs());

it("binds a room evaluation to the current trusted native window and account", async () => {
  vi.stubEnv("HELIX_HOSTED_ROOM_INTERPRETER_EVALUATION_ENABLED", "1");
  const owner = makeWindow("owner");
  const other = makeWindow("other");
  let current: BrowserWindow | null = owner.window;
  const run = vi.fn(async (input: { readAccount: () => Promise<typeof account> }) => {
    expect(await input.readAccount()).toEqual(account);
    return { ok: true as const, code: "completed" as const, providerCalls: 1 as const };
  });
  const handler = createDesktopHostedRoomConnection({
    origin: "http://127.0.0.1:39009", desktopSecret: "native-secret",
    mainWindow: () => current, isQuitting: () => false,
    trustedUrl: url => url === owner.event.senderFrame.url,
    readAccount: async session => {
      if (session !== owner.session) throw Error("wrong_account_session");
      return account;
    },
    store: { keyForProfile: () => "sk-owner-fixture" } as unknown as LiveConnectionStore,
    runner: { run, closeRetainedForProfile: vi.fn() } as unknown as HostedRoomInterpreterEvaluationRunner,
  });
  const request = { action: "room_hosted_interpreter_evaluation_run", room_id: roomId,
    interpreter_session_id: interpreterSessionId, generation: 1, request_id: requestId,
    turn_ordinal: 1 };
  expect(await handler(owner.event, request)).toMatchObject({ ok: true,
    code: "room_hosted_interpreter_evaluation_completed" });
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0]?.[0]).toMatchObject({ origin: "http://127.0.0.1:39009",
    desktopSecret: "native-secret", account, roomId, interpreterSessionId,
    generation: 1, requestId, turnOrdinal: 1 });

  current = other.window;
  expect(await handler(owner.event, { ...request,
    request_id: "room_interpreter_turn:44444444-4444-4444-8444-444444444444" }))
    .toEqual({ ok: false, code: "request_rejected" });
  expect(run).toHaveBeenCalledTimes(1);
});
