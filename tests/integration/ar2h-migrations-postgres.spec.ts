import pg from 'pg';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Migration } from '../../server/db/migrations/migration';
import { runMigrations } from '../../server/db/migrator';

// Run only through a disposable, loopback-only PostgreSQL fixture runner.
// No application DATABASE_URL, provider credentials, or production data is read.
const fixtureUrl = process.env.CASIMIR_ONBOARDING_POSTGRES_TEST_URL;
const modules = import.meta.glob('../../server/db/migrations/[0-9]*.ts', { eager: true });
const migrations = Object.values(modules).flatMap(module =>
  Object.values(module as Record<string, Migration>)).sort((a, b) => a.id.localeCompare(b.id));
const baseline = migrations.filter(migration => Number(migration.id.slice(0, 3)) <= 79);
const owner = 'ar2h-upgrade-owner';
const guest = 'ar2h-upgrade-guest';
const room = 'ar2h-upgrade-room';

describe.skipIf(!fixtureUrl)('AR-2 real PostgreSQL 079 to 118 transition', () => {
  let pool: Pool;

  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
        !/^\/casimir_onboarding_fixture_[a-f0-9]{32}$/.test(url.pathname) ||
        url.username !== 'onboarding_fixture' || !url.port) {
      throw new Error('isolated_postgres_fixture_required');
    }
    vi.stubEnv('ENABLE_PGVECTOR', '0');
    // One retained connection keeps each fixture's SET search_path in effect.
    pool = new pg.Pool({ connectionString: fixtureUrl, max: 1, idleTimeoutMillis: 120_000,
      connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    const info = (await pool.query('SELECT current_database() AS name, version() AS version')).rows[0];
    expect(info.name).toBe(url.pathname.slice(1));
    expect(info.version).toMatch(/^PostgreSQL 17\./);
    expect(baseline).toHaveLength(79);
    expect(migrations).toHaveLength(118);
    // Refuse a reused database: cleanup belongs exclusively to the owned container.
    expect((await pool.query("SELECT to_regclass('public.schema_migrations') AS existing")).rows[0].existing).toBeNull();
  });

  afterAll(async () => { if (pool) await pool.end(); vi.unstubAllEnvs(); });

  async function createBaseline(schema: string) {
    // Schema names are fixed by the test, never supplied by the caller.
    if (!/^ar2h_(upgrade|retry|repair)$/.test(schema)) throw new Error('fixture_schema_required');
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`SET search_path TO ${schema}`);
    const client = await pool.connect();
    try {
      await client.query('CREATE TABLE schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      // Migration sources 001–079 match the September 1 artifact, as recorded in
      // resume-39. Reproduce its per-migration transaction and ledger semantics.
      for (const migration of baseline) {
        await client.query('BEGIN');
        try {
          await migration.run(client, { enablePgvector: false });
          await client.query('INSERT INTO schema_migrations(id) VALUES ($1)', [migration.id]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
      }
      await client.query(`INSERT INTO helix_accounts(profile_id, display_name, account_type, provider)
        VALUES ($1, 'Upgrade owner', 'developer', 'local'), ($2, 'Upgrade guest', 'user', 'local')`, [owner, guest]);
      await client.query(`INSERT INTO helix_shared_realtime_rooms(room_id,owner_profile_id,title,status)
        VALUES ($1,$2,'Preserved room','waiting_for_consent')`, [room, owner]);
      await client.query(`INSERT INTO helix_shared_realtime_room_members
        (room_id,slot_number,profile_id,participant_id,member_role,consent)
        VALUES ($1,1,$2,'upgrade-owner-participant','owner','{}'),
               ($1,2,$3,'upgrade-guest-participant','participant','{}')`, [room, owner, guest]);
      await client.query(`INSERT INTO helix_installed_devices(profile_id,device_id,label,platform,status)
        VALUES ($1,'upgrade-device','Existing device','windows','active')`, [owner]);
    } finally { client.release(); }
  }

  async function preservedRows() {
    return {
      accounts: (await pool.query(`SELECT profile_id, display_name, account_type, provider
        FROM helix_accounts ORDER BY profile_id`)).rows,
      rooms: (await pool.query(`SELECT room_id, owner_profile_id, title, status, max_participants
        FROM helix_shared_realtime_rooms ORDER BY room_id`)).rows,
      members: (await pool.query(`SELECT room_id, slot_number, profile_id, participant_id, member_role, consent
        FROM helix_shared_realtime_room_members ORDER BY room_id, slot_number`)).rows,
    };
  }

  it('preserves existing accounts, membership and consent; does not grant legacy device trust; reruns without ledger changes', async () => {
    await createBaseline('ar2h_upgrade');
    const before = await preservedRows();
    const ledgerBefore = (await pool.query('SELECT * FROM schema_migrations ORDER BY id')).rows;
    await runMigrations(pool);
    expect(await preservedRows()).toEqual(before);
    expect((await pool.query('SELECT full_harness_trusted,full_harness_trust_revision FROM helix_installed_devices')).rows)
      .toEqual([{ full_harness_trusted: false, full_harness_trust_revision: 0 }]);
    const ledgerAfter = (await pool.query('SELECT * FROM schema_migrations ORDER BY id')).rows;
    expect(ledgerAfter).toHaveLength(118);
    expect((await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'helix_shared_room_interpreter_configurations'::regclass
        AND conname = 'helix_shared_room_interpreter_configu_usage_ceiling_turns_check'`)).rows)
      .toEqual([]);
    expect(ledgerAfter.slice(0, 79)).toEqual(ledgerBefore);
    expect(ledgerAfter.map(row => row.id)).toEqual(migrations.map(migration => migration.id));
    expect((await pool.query('SELECT count(*)::integer AS n FROM helix_room_task_disclosures')).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT capacity_profile, max_participants
      FROM helix_shared_realtime_rooms WHERE room_id=$1`, [room])).rows)
      .toEqual([{ capacity_profile: 'two_person_voice', max_participants: 2 }]);
    await pool.query(`INSERT INTO helix_shared_realtime_rooms
      (room_id, owner_profile_id, title, status, max_participants, capacity_profile)
      VALUES ('ar2-three-human-room', $1, 'Three-human text room', 'text_ready', 3, 'three_human_text')`, [owner]);
    await pool.query(`INSERT INTO helix_accounts(profile_id, display_name, account_type, provider)
      VALUES ('ar2-upgrade-guest-b', 'Upgrade guest B', 'user', 'local')`);
    await pool.query(`INSERT INTO helix_shared_realtime_room_members
      (room_id, slot_number, profile_id, participant_id, member_role, consent)
      VALUES ('ar2-three-human-room', 1, $1, 'ar2-text-owner', 'owner', '{}'),
             ('ar2-three-human-room', 2, $2, 'ar2-text-guest-a', 'participant', '{}'),
             ('ar2-three-human-room', 3, 'ar2-upgrade-guest-b', 'ar2-text-guest-b', 'participant', '{}')`, [owner, guest]);
    await expect(pool.query(`INSERT INTO helix_shared_realtime_room_members
      (room_id, slot_number, profile_id, participant_id, member_role, consent)
      VALUES ('ar2-three-human-room', 4, $1, 'ar2-text-fourth', 'participant', '{}')`, [owner]))
      .rejects.toMatchObject({ code: '23514' });
    // pg.Pool discards a client after a rejected pool.query; the replacement
    // connection needs the fixture schema selected again.
    await pool.query('SET search_path TO ar2h_upgrade');
    await expect(pool.query(`INSERT INTO helix_shared_realtime_rooms
      (room_id, owner_profile_id, title, status, max_participants, capacity_profile)
      VALUES ('ar2-invalid-text-voice', $1, 'Invalid profile', 'ready', 3, 'three_human_text')`, [owner]))
      .rejects.toMatchObject({ code: '23514' });
    await pool.query('SET search_path TO ar2h_upgrade');
    await runMigrations(pool);
    expect((await pool.query('SELECT * FROM schema_migrations ORDER BY id')).rows).toEqual(ledgerAfter);
    expect((await pool.query(`SELECT capacity_profile, max_participants, status
      FROM helix_shared_realtime_rooms WHERE room_id='ar2-three-human-room'`)).rows)
      .toEqual([{ capacity_profile: 'three_human_text', max_participants: 3, status: 'text_ready' }]);
    expect((await pool.query(`SELECT slot_number, profile_id, member_role
      FROM helix_shared_realtime_room_members WHERE room_id='ar2-three-human-room'
      ORDER BY slot_number`)).rows).toEqual([
      { slot_number: 1, profile_id: owner, member_role: 'owner' },
      { slot_number: 2, profile_id: guest, member_role: 'participant' },
      { slot_number: 3, profile_id: 'ar2-upgrade-guest-b', member_role: 'participant' },
    ]);
    expect((await preservedRows()).rooms.find(row => row.room_id === room)).toEqual(before.rooms[0]);
  });

  it('rolls back a failed migration 117, retains earlier commits, then completes on retry', async () => {
    await createBaseline('ar2h_retry');
    const before = await preservedRows();
    await pool.query(`ALTER TABLE schema_migrations ADD CONSTRAINT fixture_reject_117
      CHECK (id <> '117_room_interpreter_two_turn_evaluation')`);
    await expect(runMigrations(pool)).rejects.toMatchObject({ code: '23514', constraint: 'fixture_reject_117' });
    const ledger = (await pool.query('SELECT * FROM schema_migrations ORDER BY id')).rows;
    expect(ledger).toHaveLength(116);
    expect((await pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='ar2h_retry' AND table_name='helix_shared_room_interpreter_configurations'
        AND column_name='evaluation_profile'`)).rows).toEqual([]);
    expect((await pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='ar2h_retry' AND table_name='helix_shared_realtime_rooms'
        AND column_name='capacity_profile'`)).rows).toHaveLength(1);
    expect(await preservedRows()).toEqual(before);
    await pool.query('ALTER TABLE schema_migrations DROP CONSTRAINT fixture_reject_117');
    await runMigrations(pool);
    const retried = (await pool.query('SELECT * FROM schema_migrations ORDER BY id')).rows;
    expect(retried).toHaveLength(118);
    expect(retried.slice(0, 116)).toEqual(ledger);
    expect(await preservedRows()).toEqual(before);
  });

  it('repairs an already-applied 117 after a failed 118 attempt and retry', async () => {
    await createBaseline('ar2h_repair');
    await pool.query(`ALTER TABLE schema_migrations ADD CONSTRAINT fixture_reject_118
      CHECK (id <> '118_room_interpreter_budget_postgres_constraint')`);
    await expect(runMigrations(pool)).rejects.toMatchObject({
      code: '23514', constraint: 'fixture_reject_118',
    });
    const ledger = (await pool.query('SELECT id FROM schema_migrations ORDER BY id')).rows;
    expect(ledger).toHaveLength(117);
    expect(ledger.at(-1)?.id).toBe('117_room_interpreter_two_turn_evaluation');
    expect((await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'helix_shared_room_interpreter_configurations'::regclass
        AND conname = 'helix_shared_room_interpreter_configu_usage_ceiling_turns_check'`)).rows)
      .toHaveLength(1);
    await pool.query('ALTER TABLE schema_migrations DROP CONSTRAINT fixture_reject_118');
    await runMigrations(pool);
    expect((await pool.query('SELECT id FROM schema_migrations ORDER BY id')).rows).toHaveLength(118);
    expect((await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'helix_shared_room_interpreter_configurations'::regclass
        AND conname = 'helix_shared_room_interpreter_configu_usage_ceiling_turns_check'`)).rows)
      .toEqual([]);
  });
});
