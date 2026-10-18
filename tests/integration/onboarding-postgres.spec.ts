import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PairingLedgerRepository } from "../../server/services/local-supervisor/pairing-ledger-repository";
import { PairingTransitionService } from "../../server/services/local-supervisor/pairing-transition-service";
import { createPairingLedgerRow, pairingApprovalSchema, acceptPairingLedgerRow } from "../../server/services/local-supervisor/pairing-ledger-contract";
import { ephemeralPairingVault } from "../../server/services/local-supervisor/__tests__/pairing-vault-fixture";
import { InstalledSecurityStore } from "../../server/services/helix-account/installed-security-store";

// Test-process migration selection only. The actual database pool, transaction
// primitive, repositories and transition policy remain the production code.
vi.mock("../../server/db/migrator", () => ({ runMigrations: async (pool: Pool) => {
  const { migration026 } = await import("../../server/db/migrations/026_helix_accounts");
  const { migration070 } = await import("../../server/db/migrations/070_installed_security_devices");
  const { migration081 } = await import("../../server/db/migrations/081_installed_device_full_harness_trust");
  const { migration087 } = await import("../../server/db/migrations/087_pairing_ledger");
  const client = await pool.connect();
  try { for (const migration of [migration026, migration070, migration081, migration087]) {
    await migration.run(client, { enablePgvector: false });
  } } finally { client.release(); }
} }));

const fixtureUrl = process.env.CASIMIR_ONBOARDING_POSTGRES_TEST_URL;
const actor = { issuer: "fixture-issuer", profileId: "fixture-owner", installationId: "fixture-install",
  clientId: "fixture-client", taskId: "fixture-task" };
const owner = { sessionId: "fixture-session", profileId: actor.profileId };
const deviceId = "desktop_device_AAAAAAAAAAAAAAAAAAAAAA";
const at = (seconds: number) => new Date(Date.parse("2026-09-13T12:00:00Z") + seconds * 1000);

describe.skipIf(!fixtureUrl)("O5 isolated real PostgreSQL pairing and trust contention", () => {
  let pool: Pool;
  let commit: typeof import("../../server/db/client").commitPairingLedgerWrites;
  let repo: PairingLedgerRepository;
  let service: PairingTransitionService<string>;
  let secret: string;
  let seconds: number;
  let flush: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
        !/^\/casimir_onboarding_fixture_[a-f0-9]+$/.test(url.pathname) ||
        url.username !== "onboarding_fixture" || !url.port) {
      throw new Error("isolated_postgres_fixture_required");
    }
    vi.stubEnv("DATABASE_URL", fixtureUrl!);
    const database = await import("../../server/db/client");
    await database.ensureDatabase();
    pool = database.getPool(); commit = database.commitPairingLedgerWrites;
    const info = (await pool.query("SELECT current_database() AS name, version() AS version")).rows[0];
    expect(info.name).toBe(url.pathname.slice(1));
    expect(info.version).toMatch(/^PostgreSQL 17\./);
  }, 30_000);

  afterAll(async () => { if (pool) await pool.end(); vi.unstubAllEnvs(); });
  beforeEach(async () => {
    await pool.query("TRUNCATE helix_accounts, helix_account_events CASCADE");
    await pool.query(`INSERT INTO helix_accounts
      (profile_id,display_name,account_type,provider,created_at,updated_at)
      VALUES ($1,'Fixture','developer','local',$2,$2)`, [actor.profileId, at(0)]);
    await pool.query(`INSERT INTO helix_account_sessions
      (session_id,profile_id,status,memory_scope,account_policy,created_at,updated_at,expires_at)
      VALUES ($1,$2,'active','profile','{"account_type":"developer"}'::jsonb,$3,$3,$4)`,
    [owner.sessionId, owner.profileId, at(0), at(86400)]);
    seconds = 1; secret = crypto.randomBytes(32).toString("base64url");
    flush = vi.fn(async () => {}); // PostgreSQL COMMIT is the durability boundary.
    repo = new PairingLedgerRepository(pool, ephemeralPairingVault(), flush, commit);
    service = new PairingTransitionService(repo, {
      destination: async credential => {
        if (credential !== "fixture-provider") throw new Error("fixture_provider_required");
        return actor;
      },
      humanOwner: async credential => {
        if (credential !== "fixture-human") throw new Error("fixture_human_required");
        return actor.profileId;
      },
    }, () => at(seconds));
  });

  function row(id: string, digest: string) {
    return createPairingLedgerRow({ id, requestDigest: digest.repeat(64),
      acceptanceSecretDigest: crypto.createHash("sha256").update(secret).digest("hex"),
      consentReceiptId: "fixture-human-consent",
      approval: pairingApprovalSchema.parse({ destination: actor, chatId: "fixture-chat", environment: null,
        scope: "exact_chat_steering", policyRevision: 1 }),
    }, at(0));
  }

  async function lock(table: "helix_pairing_ledger" | "helix_installed_devices", key: string): Promise<PoolClient> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(table === "helix_pairing_ledger"
        ? "SELECT pairing_id FROM helix_pairing_ledger WHERE pairing_id=$1 FOR UPDATE"
        : "SELECT device_id FROM helix_installed_devices WHERE device_id=$1 FOR UPDATE", [key]);
      return client;
    } catch (error) { await client.query("ROLLBACK"); client.release(); throw error; }
  }

  async function blocked(count: number) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await pool.query(`SELECT count(*)::integer AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`);
      if (result.rows[0].n >= count) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("expected_real_postgres_lock_contention_not_observed");
  }

  it("O2/O5 accepts concurrent duplicate requests once under an observed row lock", async () => {
    const initial = row("fixture-original", "a"); await repo.insert(initial);
    const held = await lock("helix_pairing_ledger", initial.id);
    const requests = Promise.allSettled([service.accept("fixture-provider", { id: initial.id, secret }),
      service.accept("fixture-provider", { id: initial.id, secret })]);
    try { await blocked(2); } finally { await held.query("COMMIT"); held.release(); }
    const results = await requests;
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    expect(results[0]).toEqual(results[1]);
    expect(await repo.read(actor.profileId, initial.id)).toMatchObject({ revision: 2,
      acceptedAt: at(1).toISOString(), pairingExpiresAt: initial.pairingExpiresAt, acceptanceSecret: null });
    expect((await pool.query("SELECT count(*)::integer AS n FROM helix_pairing_ledger")).rows[0].n).toBe(1);
  });

  it("O2/O5 rejects recovery and replay after revocation contends with acceptance", async () => {
    const initial = row("fixture-original", "a"); await repo.insert(initial);
    const held = await lock("helix_pairing_ledger", initial.id);
    const acceptance = Promise.allSettled([service.accept("fixture-provider", { id: initial.id, secret })]);
    let revocation: Promise<unknown> | undefined;
    try {
      await blocked(1);
      revocation = service.revoke("fixture-human", initial.id);
      await blocked(2);
    } finally { await held.query("COMMIT"); held.release(); }
    await acceptance;
    expect(await revocation).toMatchObject({ state: "revoked", revision: 3 });
    expect(await repo.read(actor.profileId, initial.id)).toMatchObject({ revision: 3,
      acceptedAt: at(1).toISOString(), revokedAt: at(1).toISOString(),
      pairingExpiresAt: initial.pairingExpiresAt, acceptanceSecret: null });
    await expect(service.recover("fixture-provider", initial.id)).rejects.toThrow("pairing_revoked");
    await expect(service.accept("fixture-provider", { id: initial.id, secret })).rejects.toThrow("pairing_revoked");
  });

  async function replacement() {
    const initial = row("fixture-original", "a"); await repo.insert(initial);
    const predecessor = acceptPairingLedgerRow(initial, actor, at(1));
    await repo.compareAndSwap(predecessor, 1);
    seconds = 3;
    const pending = createPairingLedgerRow({ ...row("fixture-replacement", "b"),
      approval: pairingApprovalSchema.parse({ ...predecessor.approval, policyRevision: 2,
        replacement: { pairingId: predecessor.id, revision: predecessor.revision } }) }, at(2));
    await repo.insert(pending);
    return { predecessor, pending };
  }

  it("O2/O5 lets exactly one replacement consume a predecessor under real transaction contention", async () => {
    const { predecessor, pending } = await replacement();
    const competitor = { ...pending, id: "fixture-competitor", requestDigest: "c".repeat(64) };
    await repo.insert(competitor);
    const held = await lock("helix_pairing_ledger", predecessor.id);
    const requests = Promise.allSettled([service.accept("fixture-provider", { id: pending.id, secret }),
      service.accept("fixture-provider", { id: competitor.id, secret })]);
    try { await blocked(2); } finally { await held.query("COMMIT"); held.release(); }
    const results = await requests;
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: new Error("pairing_replacement_conflict") });
    const winner = (results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>).value.id;
    const loser = winner === pending.id ? competitor.id : pending.id;
    expect(await repo.read(actor.profileId, predecessor.id)).toMatchObject({ revision: 3, supersession: { pairingId: winner } });
    expect(await repo.read(actor.profileId, loser)).toMatchObject({ revision: 1, acceptedAt: null });
  });

  it("O2/O5 rolls back both replacement writes when the transaction backend dies between them", async () => {
    const { predecessor, pending } = await replacement();
    const held = await lock("helix_pairing_ledger", pending.id);
    const result = service.accept("fixture-provider", { id: pending.id, secret }).then(
      value => ({ ok: true, value }), () => ({ ok: false }));
    try {
      await blocked(1);
      // The first write exists only inside the blocked transaction. Other
      // connections must still see both original rows before terminating it.
      expect(await repo.read(actor.profileId, predecessor.id)).toEqual(predecessor);
      expect(await repo.read(actor.profileId, pending.id)).toEqual(pending);
      const target = (await pool.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND query LIKE 'UPDATE helix_pairing_ledger%'`)).rows;
      expect(target).toHaveLength(1);
      await pool.query("SELECT pg_terminate_backend($1)", [target[0].pid]);
      expect(await result).toEqual({ ok: false });
    } finally { await held.query("ROLLBACK"); held.release(); }
    expect(await repo.read(actor.profileId, predecessor.id)).toEqual(predecessor);
    expect(await repo.read(actor.profileId, pending.id)).toEqual(pending);
    const accepted = await service.accept("fixture-provider", { id: pending.id, secret });
    expect(accepted).toMatchObject({ state: "accepted", revision: 2, pairingExpiresAt: pending.pairingExpiresAt });
    expect(await service.accept("fixture-provider", { id: pending.id, secret })).toEqual(accepted);
  });

  it("O5 preserves a later trust revoke after actual locked duplicate grants", async () => {
    const security = new InstalledSecurityStore({ pool, now: () => at(seconds), persist: async () => {} });
    await security.registerDevice({ session: owner, deviceId });
    const request = { session: owner, deviceId, trusted: true, expectedPolicyRevision: 0 };
    const held = await lock("helix_installed_devices", deviceId);
    const requests = Promise.allSettled([security.setFullHarnessTrust(request), security.setFullHarnessTrust(request)]);
    try { await blocked(2); } finally { await held.query("COMMIT"); held.release(); }
    const results = await requests;
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "device_trust_revision_changed" } });
    await security.setFullHarnessTrust({ ...request, trusted: false, expectedPolicyRevision: 1 });
    await expect(security.setFullHarnessTrust(request)).rejects.toMatchObject({ code: "device_trust_revision_changed" });
    expect(await security.inspectFullHarnessTrust({ profileId: owner.profileId, deviceId }))
      .toMatchObject({ trusted: false, policy_revision: 2, environment_authority_granted: false });
    const events = (await pool.query(`SELECT event_type FROM helix_account_events
      WHERE event_type IN ('full_harness_device_trust_granted','full_harness_device_trust_revoked')`)).rows;
    expect(events.map(event => event.event_type).sort()).toEqual(["full_harness_device_trust_granted", "full_harness_device_trust_revoked"]);
  });
});
