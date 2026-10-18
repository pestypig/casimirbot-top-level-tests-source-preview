import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), clientQuery: vi.fn(),
  roomsAccess: vi.fn(), membership: vi.fn() }));
vi.mock("../server/db/client", () => ({ ensureDatabase: vi.fn(async () => undefined),
  getPool: () => ({ query: mocks.poolQuery,
    connect: async () => ({ query: mocks.clientQuery, release: () => undefined }) }) }));
vi.mock("../server/services/helix-account/account-session-store", () => ({
  hasActiveSharedRealtimeRoomsAccessForProfile: mocks.roomsAccess,
}));
vi.mock("../server/services/helix-ask/realtime-room/room-store/rooms", () => ({
  readSharedRealtimeRoomMembership: mocks.membership,
}));

import { changeDiscordStream, heartbeatDiscordStream } from
  "../server/services/discord/discord-stream-selection";

const profileId = "owner-profile";
const roomId = "shared_realtime_room:ce03ad8e-d0cb-4d73-8324-94b069f8e8c8";
const guildId = "1326743635819237396";
const channelId = "1326743635819237399";
const sourceRef = "codex-thread:01a120f1-66fb-7923-baa7-2c3569addfa2";
const deviceRef = `desktop:${"a".repeat(64)}`;
const approvalId = "ce03ad8e-d0cb-4d73-8324-94b069f8e8c8";
const selection = { mode: "all", source_refs: [sourceRef] };
let state: Record<string, unknown> | null;
let insertParameters: unknown[] | null;

beforeEach(() => {
  mocks.poolQuery.mockReset(); mocks.clientQuery.mockReset();
  mocks.roomsAccess.mockReset(); mocks.membership.mockReset();
  mocks.roomsAccess.mockResolvedValue(true);
  mocks.membership.mockResolvedValue({ role: "owner", presence: "present",
    roomStatus: "open" });
  mocks.poolQuery.mockImplementation(async (sql: string) =>
    sql.includes("SELECT session_json") ? { rows: [{ session_json: {
      status: "active", linked_profile_id: profileId,
      shared_live_room_id: roomId, guild_id: guildId, text_channel_id: channelId,
    } }] } : { rows: [], rowCount: 1 });
  state = null; insertParameters = null;
  mocks.clientQuery.mockImplementation(async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("SELECT source_ref FROM helix_discord_stream_grants"))
      return { rows: [{ source_ref: sourceRef }] };
    if (sql.includes("SELECT * FROM helix_discord_stream_state"))
      return { rows: state ? [state] : [] };
    if (sql.includes("SELECT room_id FROM helix_discord_stream_state"))
      return { rows: [] };
    if (sql.includes("INSERT INTO helix_discord_stream_state"))
      insertParameters = parameters ?? null;
    return { rows: [], rowCount: 1 };
  });
});

it("issues an eight-hour owner approval separately from the heartbeat", async () => {
  const started = Date.now();
  const result = await changeDiscordStream({ profileId, roomId, request: {
    device_ref: deviceRef, expected_revision: 0, selection, duration_hours: 8,
  } });
  expect(result.approval_duration_hours).toBe(8);
  expect(result.approval_id).toMatch(/^[0-9a-f-]{36}$/u);
  expect(Date.parse(result.approval_expires_at)).toBeGreaterThanOrEqual(started + 8 * 3_600_000);
  expect(insertParameters?.[9]).toBeInstanceOf(Date);
  expect(insertParameters?.[10]).toBe(8);
});

it("resumes only the exact approved source snapshot without extending its expiry", async () => {
  const expiresAt = new Date(Date.now() + 60 * 60_000);
  state = { revision: 3, active: false, device_ref: deviceRef,
    guild_id: guildId, channel_id: channelId, source_mode: "all",
    source_refs: [sourceRef], approval_id: approvalId,
    approval_expires_at: expiresAt, approval_duration_hours: 8 };
  const result = await changeDiscordStream({ profileId, roomId, request: {
    device_ref: deviceRef, expected_revision: 3, selection,
    resume_approval_id: approvalId,
  } });
  expect(result.revision).toBe(4);
  expect(result.approval_id).toBe(approvalId);
  expect(result.approval_expires_at).toBe(expiresAt.toISOString());
  expect(insertParameters?.[9]).toBe(expiresAt);

  state.approval_expires_at = new Date(Date.now() - 1000);
  await expect(changeDiscordStream({ profileId, roomId, request: {
    device_ref: deviceRef, expected_revision: 3, selection,
    resume_approval_id: approvalId,
  } })).rejects.toMatchObject({ code: "discord_stream_approval_expired_or_changed" });
});

it("requires an unexpired approval as well as a live heartbeat", async () => {
  await heartbeatDiscordStream({ profileId, roomId, request: {
    device_ref: deviceRef, expected_revision: 1,
  } });
  expect(mocks.poolQuery.mock.calls[1][0]).toContain("approval_expires_at>now()");
});
