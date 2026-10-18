import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureDatabase, getPool, resetDbClient } from "../../server/db/client";
import { createSharedRealtimeRoom } from
  "../../server/services/helix-ask/realtime-room/room-store/rooms";
import { createSharedRealtimeRoomInvite, joinSharedRealtimeRoom } from
  "../../server/services/helix-ask/realtime-room/room-store/invites";
import { leaveOrCloseSharedRealtimeRoom } from
  "../../server/services/helix-ask/realtime-room/room-store/participants";
import { listSharedRealtimeRoomAuditEvents } from
  "../../server/services/helix-ask/realtime-room/room-store/audit";

const fixtureUrl = process.env.CASIMIR_ONBOARDING_POSTGRES_TEST_URL;
const owner = "ar2h-pg-owner";
const firstGuest = "ar2h-pg-guest-a";
const contenders = ["ar2h-pg-guest-b", "ar2h-pg-guest-c"] as const;

describe.skipIf(!fixtureUrl)("AR-2 final slot under real PostgreSQL contention", () => {
  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
        !/^\/casimir_onboarding_fixture_[a-f0-9]{32}$/.test(url.pathname) ||
        url.username !== "onboarding_fixture" || !url.port)
      throw new Error("isolated_postgres_fixture_required");
    vi.stubEnv("DATABASE_URL", fixtureUrl);
    vi.stubEnv("ENABLE_PGVECTOR", "0");
    await resetDbClient();
    await ensureDatabase();
    await getPool().query(`INSERT INTO helix_accounts
      (profile_id, display_name, account_type, provider)
      VALUES ($1, 'Owner', 'developer', 'local'),
        ($2, 'Guest A', 'user', 'local'),
        ($3, 'Guest B', 'user', 'local'),
        ($4, 'Guest C', 'user', 'local')`,
      [owner, firstGuest, ...contenders]);
  }, 30_000);

  afterAll(async () => { await resetDbClient(); vi.unstubAllEnvs(); });

  it("serializes two distinct invitations for one remaining slot", async () => {
    const room = await createSharedRealtimeRoom({ ownerProfileId: owner,
      capacityProfile: "three_human_text" });
    const firstInvite = await createSharedRealtimeRoomInvite({
      roomId: room.room_id, ownerProfileId: owner });
    await joinSharedRealtimeRoom({ roomId: room.room_id, profileId: firstGuest,
      inviteCode: firstInvite.inviteCode });
    const invitations = await Promise.all(contenders.map(async () =>
      createSharedRealtimeRoomInvite({ roomId: room.room_id, ownerProfileId: owner })));

    const held = await getPool().connect();
    await held.query("BEGIN");
    await held.query(`SELECT room_id FROM helix_shared_realtime_rooms
      WHERE room_id=$1 FOR UPDATE`, [room.room_id]);
    const joins = Promise.allSettled(contenders.map((profileId, index) =>
      joinSharedRealtimeRoom({ roomId: room.room_id, profileId,
        inviteCode: invitations[index]!.inviteCode })));
    try {
      const deadline = Date.now() + 5_000;
      let blocked = 0;
      while (Date.now() < deadline) {
        const { rows } = await getPool().query<{ n: number }>(`SELECT count(*)::integer AS n
          FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND pid<>pg_backend_pid()`);
        blocked = rows[0]?.n ?? 0;
        if (blocked >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBeGreaterThanOrEqual(2);
    } finally {
      await held.query("COMMIT");
      held.release();
    }
    const results = await joins;
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const { rows: members } = await getPool().query<{ slot_number: number;
      profile_id: string }>(`SELECT slot_number, profile_id FROM helix_shared_realtime_room_members
        WHERE room_id=$1 AND presence<>'left' ORDER BY slot_number`, [room.room_id]);
    expect(members.map(member => member.slot_number)).toEqual([1, 2, 3]);
    expect(members.slice(0, 2).map(member => member.profile_id)).toEqual([owner, firstGuest]);
    expect(contenders).toContain(members[2]?.profile_id);
    const { rows: invites } = await getPool().query<{ status: string }>(
      `SELECT status FROM helix_shared_realtime_room_invites
       WHERE room_id=$1 ORDER BY status`, [room.room_id]);
    expect(invites.map(invite => invite.status)).toEqual(["redeemed", "redeemed", "revoked"]);
  }, 15_000);

  it("records the actual slot when the third participant leaves", async () => {
    const room = await createSharedRealtimeRoom({ ownerProfileId: owner,
      capacityProfile: "three_human_text" });
    for (const profileId of [firstGuest, contenders[0]]) {
      const invite = await createSharedRealtimeRoomInvite({
        roomId: room.room_id, ownerProfileId: owner });
      await joinSharedRealtimeRoom({ roomId: room.room_id, profileId,
        inviteCode: invite.inviteCode });
    }
    await leaveOrCloseSharedRealtimeRoom({ roomId: room.room_id,
      profileId: contenders[0] });
    const departures = (await listSharedRealtimeRoomAuditEvents({
      roomId: room.room_id, profileId: owner }))
      .filter(event => event.event_type === "participant_left");
    expect(departures).toHaveLength(1);
    expect(departures[0]?.metadata.slot_number).toBe(3);
  });
});
