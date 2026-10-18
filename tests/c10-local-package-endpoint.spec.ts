import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ensureDatabase, getPool, resetDbClient } from '../server/db/client';
import {
  startEnvironmentConnectorPairing,
  approveEnvironmentConnectorPairing,
  claimEnvironmentConnectorPairing,
  authenticateEnvironmentConnectorDevice,
  rotateEnvironmentConnectorDeviceCredential,
  revokeEnvironmentConnectorDevice,
  EnvironmentConnectorPairingError,
} from '../server/services/environment-connectors/pairing/service';
import { resolveEnvironmentAdapterProfile } from '../server/services/situation-room/environment-adapter-registry';
import { listActiveEnvironmentConnectorBindings } from '../server/services/environment-connectors/bindings';
import { readEnvironmentConnectorCapabilityDescriptor } from '../server/services/environment-connectors/catalog';
import {
  dispatchDurableEnvironmentProbe, leaseDurableEnvironmentProbesForClaim,
  submitDurableEnvironmentProbeResult, DurableEnvironmentProbeError,
} from '../server/services/environment-connectors/probe/durable-broker';

// Deliberately load the installed archive, not the in-repository SDK. This
// fixture adapts fetch to real service functions, not to production HTTP routes.
let sdk: typeof import('../connectors/environment/sdk/typescript');
let clockExample: typeof import('../connectors/environment/examples/system-clock/connector');
let lastDevice: Awaited<ReturnType<typeof authenticateEnvironmentConnectorDevice>> | undefined;
const submissions: Array<Awaited<ReturnType<typeof submitDurableEnvironmentProbeResult>>> = [];
const packageId = 'connector_package_version:com.casimirbot.system.clock:1.0.0';
const capability = 'com.casimirbot.system.clock.read';
const now = new Date('2026-09-26T12:00:00.000Z');
let serviceNow = now;
const ownerId = 'profile:c10-clock-owner';
const roomId = 'shared_realtime_room:c10-clock';
const bindingId = 'room_source_binding:c10-clock';
const credentialId = 'room_source_credential:c10-clock';
const sourceId = 'source:room-ingress:c10-clock';
const worldId = 'system:c10-clock';
const denials: string[] = [];
const claimForDevice = (device: NonNullable<typeof lastDevice>, routeKey: string) => ({
  binding: device.binding, credentialId: device.binding.credential_id!,
  requestProjectionId: `device_transport:${device.deviceCredentialId}:c10-fixture`,
  producerEpoch: device.admission.producer_epoch_ref, sequence: 0, routeKey,
  bodyDigest: 'sha256:device_transport_server_authenticated', replay: null,
});
const serviceFetch: typeof fetch = async (url, init) => {
  const route = new URL(String(url)).pathname;
  const input = JSON.parse(String(init?.body ?? '{}'));
  try {
    if (route.endsWith('/pairing/claim')) {
      const claimed = await claimEnvironmentConnectorPairing({
        pairingSessionId: input.pairing_session_id, claimChallenge: input.claim_challenge,
        proofSignature: input.proof_signature, now: serviceNow,
      });
      return Response.json({
        device_id: claimed.deviceId, installation_id: claimed.installationId,
        environment_binding_id: claimed.environmentBindingId, catalog_snapshot: claimed.catalogSnapshot,
        device_credential: claimed.deviceCredential, device_credential_expires_at: claimed.deviceCredentialExpiresAt,
        scopes: claimed.scopes,
      });
    }
    if (route.includes('/device/')) {
      const authorization = new Headers(init?.headers).get('authorization') ?? '';
      const requiredScope = route.endsWith('/probes/pending') ? 'probe.poll'
        : route.endsWith('/probes/result') ? 'probe.result' : 'health.write';
      const device = await authenticateEnvironmentConnectorDevice({
        bearerToken: authorization.replace(/^Bearer /, ''), requiredScope, now: serviceNow,
      });
      lastDevice = device;
      const authority = { claim: claimForDevice(device, route), adapterAdmission: device.admission,
        expectedDeviceId: device.deviceId, expectedEnvironmentBindingId: device.environmentBindingId, now: serviceNow };
      if (route.endsWith('/probes/pending')) {
        const leases = await leaseDurableEnvironmentProbesForClaim({ ...authority, limit: 1 });
        return Response.json({ leases: leases.map(lease => ({ ...lease, request: null })) });
      }
      if (route.endsWith('/probes/result')) {
        const submitted = await submitDurableEnvironmentProbeResult({ ...authority, submission: input });
        submissions.push(submitted);
        return Response.json({ accepted: true, replayed: submitted.replayed, outcome: submitted.observation.outcome });
      }
      if (!route.endsWith('/device/heartbeat')) throw new Error(`unimplemented_fixture_route:${route}`);
      return Response.json({ health: 'online', command_execution: 'command_execution_not_enabled' });
    }
    if (!route.endsWith('/pairing/start')) throw new Error(`unimplemented_fixture_route:${route}`);
    const started = await startEnvironmentConnectorPairing({
      packageVersionId: input.package_version_id,
      devicePublicKeyPem: input.device_public_key_pem,
      deviceNonce: input.device_nonce,
      requestedCapabilityIds: input.requested_capability_ids,
      proofSignature: input.proof_signature,
      verificationUri: 'https://fixture.invalid/pair', now: serviceNow,
    });
    return Response.json({ ...started.session, claim_challenge: started.claimChallenge });
  } catch (error) {
    if (!(error instanceof EnvironmentConnectorPairingError) && !(error instanceof DurableEnvironmentProbeError)) throw error;
    denials.push(error.code);
    // Retain the typed server code in this test adapter; real HTTP error-body
    // formatting needs separate route/installed qualification.
    return Response.json({ message: error.code }, { status: error.statusCode });
  }
};
const begin = (overrides = {}, transport: typeof fetch = serviceFetch) => {
  const client = new sdk.HelixEnvironmentConnectorClient('https://fixture.invalid', transport);
  return client.startPairing({ packageVersionId: packageId, identity: sdk.createConnectorPairingIdentity(),
    requestedCapabilityIds: [capability], deviceNonce: crypto.randomBytes(24).toString('base64url'), ...overrides });
};
const sessionCount = async () => Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_pairing_sessions')).rows[0].count);

// Seed an already-admitted owner/source prerequisite. This does not prove the
// browser consent/manifest onboarding journey; approval and claim stay real.
const seedClockSource = async () => {
  const db = getPool();
  const record = resolveEnvironmentAdapterProfile({ domainAdapter: 'system.clock.connector.v1', worldId });
  await db.query("INSERT INTO helix_accounts (profile_id, display_name, account_type, provider) VALUES ($1, 'Clock owner', 'developer', 'local')", [ownerId]);
  await db.query("INSERT INTO helix_shared_realtime_rooms (room_id, owner_profile_id, title, status) VALUES ($1, $2, 'Clock fixture', 'active')", [roomId, ownerId]);
  await db.query("INSERT INTO helix_shared_realtime_room_members (room_id, slot_number, profile_id, participant_id, member_role, presence, consent) VALUES ($1, 1, $2, 'participant:c10-owner', 'owner', 'present', '{}'::jsonb)", [roomId, ownerId]);
  await db.query("UPDATE helix_shared_realtime_room_members SET consent = '{\"consent_version\":1,\"consent_receipt_ref\":\"consent:c10\"}'::jsonb WHERE room_id = $1", [roomId]);
  await db.query(`INSERT INTO helix_room_source_bindings (binding_id, room_id, owner_profile_id, source_id, world_id, domain_adapter, source_label, scopes)
    VALUES ($1, $2, $3, $4, $5, 'system.clock.connector.v1', 'Clock', $6::jsonb)`,
    [bindingId, roomId, ownerId, sourceId, worldId, JSON.stringify(['manifest:write', 'heartbeat:write', 'probe_requests:read', 'probe_results:write'])]);
  await db.query(`INSERT INTO helix_room_source_credentials (credential_id, binding_id, token_hash, token_prefix, expires_at)
    VALUES ($1, $2, $3, 'fixture', '2099-01-01T00:00:00.000Z')`, [credentialId, bindingId, crypto.randomBytes(32).toString('hex')]);
  await db.query(`INSERT INTO helix_environment_adapter_admissions
    (admission_id, binding_id, credential_id, producer_epoch, room_id, source_id, world_id, domain_adapter,
     adapter_profile_id, adapter_profile_version, adapter_contract_hash, manifest_id, manifest_hash, source_family, mechanics_collection_ids)
    VALUES ('environment_adapter_admission:c10-clock', $1, $2, 'c10-clock-epoch', $3, $4, $5, 'system.clock.connector.v1',
      $6, $7, $8, 'manifest:c10-clock', $9, $10, '[]'::jsonb)`,
    [bindingId, credentialId, roomId, sourceId, worldId, record.profile.profile_id, record.profile.profile_version, record.contract_hash,
      `sha256:${'a'.repeat(64)}`, record.profile.source_family]);
};
const prepareApproved = async () => {
  const client = new sdk.HelixEnvironmentConnectorClient('https://fixture.invalid', serviceFetch);
  const identity = sdk.createConnectorPairingIdentity();
  const started = await client.startPairing({ packageVersionId: packageId, identity, requestedCapabilityIds: [capability] });
  const approval = await approveEnvironmentConnectorPairing({ userCode: started.session.user_code, ownerProfileId: ownerId,
    roomId, roomSourceBindingId: bindingId, approvedCapabilityIds: [capability], now: serviceNow });
  const claim = { pairingSessionId: started.session.pairing_session_id, claimChallenge: started.claimChallenge, identity };
  return { client, approval, claim };
};
const prepareClockRead = async () => {
  const { client, claim } = await prepareApproved();
  const receipt = await client.claimPairing(claim);
  await client.heartbeat();
  const device = lastDevice!;
  const [connector] = await listActiveEnvironmentConnectorBindings({
    ownerProfileId: ownerId, roomId, roomSourceBindingId: bindingId, sourceId,
    adapterAdmissionId: device.admission.admission_id, adapterContractHash: device.admission.adapter_contract_hash,
    manifestHash: device.admission.manifest_hash, producerEpochRef: device.admission.producer_epoch_ref, capabilityId: capability,
  });
  expect(connector?.deviceId).toBe(receipt.deviceId);
  const dispatched = await dispatchDurableEnvironmentProbe({
    tenantId: 'first_party_browser_session', ownerSubjectId: 'first_party_subject:c10-fixture', ownerProfileId: ownerId,
    executionAuthorityKind: 'first_party_shared_room', runId: 'first_party_shared_room:c10-fixture',
    turnId: 'ask:c10-clock', providerExecutionId: 'fixture:no-provider', toolCallId: 'tool:c10-clock',
    roomId, sourceId, producerEpochRef: device.admission.producer_epoch_ref, adapterAdmission: device.admission,
    connector, descriptor: readEnvironmentConnectorCapabilityDescriptor(capability)!, arguments: { clock: 'monotonic' },
    freshnessRequirementMs: 5000, timeoutMs: 5000, idempotencyKey: 'c10-clock-request', now: serviceNow,
  });
  const leases = await client.poll();
  expect(leases).toHaveLength(1);
  const lease = leases[0];
  expect(lease.capability_request.probe_request_id).toBe(dispatched.requestId);
  const result = clockExample.handleSystemClockLease(lease, () => 12345.9, serviceNow);
  return { client, receipt, lease, result };
};

describe.skipIf(!process.env.C10_INSTALLED_PACKAGE)('C10 installed private package to real local pairing service (requires external archive)', () => {
  beforeAll(async () => {
    const installed = process.env.C10_INSTALLED_PACKAGE;
    if (!installed || !path.isAbsolute(installed)) throw new Error('C10_INSTALLED_PACKAGE must name the externally installed private archive');
    sdk = await import(/* @vite-ignore */ pathToFileURL(path.join(installed, 'dist/connectors/environment/sdk/typescript/index.js')).href);
    clockExample = await import(/* @vite-ignore */ pathToFileURL(path.join(installed, 'dist/connectors/environment/examples/system-clock/connector.js')).href);
  });
  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', `pg-mem://c10-local-${crypto.randomUUID()}`);
    vi.stubEnv('HELIX_LOCAL_PG_MEM_PERSIST', '0');
    denials.length = 0;
    submissions.length = 0;
    lastDevice = undefined;
    serviceNow = now;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    await resetDbClient();
    await ensureDatabase();
    await seedClockSource();
  });
  afterEach(async () => { await resetDbClient(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('accepts the external SDK signature for registered system-clock without granting authority', async () => {
    const started = await begin();
    expect(started.session).toMatchObject({ status: 'pending', credential_included: false, requested_capability_ids: [capability] });
    expect(await sessionCount()).toBe(1);
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_connector_devices')).rows[0].count)).toBe(0);
  });
  it.each(['connector_package_version:example.unknown:1.0.0', 'connector_package_version:com.casimirbot.system.clock:99.0.0'])('rejects unregistered package/version %s', async (packageVersionId) => {
    await expect(begin({ packageVersionId })).rejects.toThrow('pairing_package_unknown');
    expect(denials).toEqual(['pairing_package_unknown']);
    expect(await sessionCount()).toBe(0);
  });
  it('rejects a capability outside the selected package', async () => {
    await expect(begin({ requestedCapabilityIds: ['example.ungranted.action'] })).rejects.toThrow('pairing_capability_denied');
    expect(await sessionCount()).toBe(0);
  });
  it('rejects a different signing identity', async () => {
    const identity = sdk.createConnectorPairingIdentity();
    identity.privateKey = sdk.createConnectorPairingIdentity().privateKey;
    await expect(begin({ identity })).rejects.toThrow('pairing_proof_invalid');
    expect(await sessionCount()).toBe(0);
  });
  it('rejects replayed signed pairing nonce without a second session', async () => {
    const input = { identity: sdk.createConnectorPairingIdentity(), deviceNonce: 'c10-nonce-replayed-0123456789' };
    await begin(input);
    await expect(begin(input)).rejects.toThrow('pairing_replay');
    expect(await sessionCount()).toBe(1);
  });
  it('rejects expired approval before creating a device', async () => {
    const started = await begin();
    await expect(approveEnvironmentConnectorPairing({
      userCode: started.session.user_code, ownerProfileId: 'owner:fixture', roomId: 'room:fixture',
      roomSourceBindingId: 'binding:fixture', approvedCapabilityIds: [capability],
      now: new Date(now.getTime() + 10 * 60 * 1000 + 1),
    })).rejects.toMatchObject({ code: 'pairing_session_expired', statusCode: 410 });
  });

  it.each([
    { ownerProfileId: 'profile:wrong-owner', roomId },
    { ownerProfileId: ownerId, roomId: 'shared_realtime_room:wrong-room' },
  ])('rejects crossed owner/room approval %j without an installation', async (identity) => {
    const started = await begin();
    await expect(approveEnvironmentConnectorPairing({ userCode: started.session.user_code, ...identity,
      roomSourceBindingId: bindingId, approvedCapabilityIds: [capability], now: serviceNow,
    })).rejects.toMatchObject({ code: 'pairing_binding_unavailable' });
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_connector_installations')).rows[0].count)).toBe(0);
  });
  it('claims exactly one approved clock device and authenticates its SDK heartbeat', async () => {
    const { client, approval, claim } = await prepareApproved();
    const receipt = await client.claimPairing(claim);
    expect(receipt.installationId).toBe(approval.installationId);
    expect(receipt.scopes).toEqual(expect.arrayContaining(['probe.poll', 'probe.result', 'health.write']));
    expect(JSON.stringify(receipt)).not.toContain('helix_env_device_');
    await expect(client.heartbeat()).resolves.toEqual({ health: 'online', commandExecution: 'command_execution_not_enabled' });
    const rows = await getPool().query('SELECT consent_capability_ids FROM helix_environment_connector_bindings WHERE device_id = $1', [receipt.deviceId]);
    expect(rows.rows[0].consent_capability_ids).toEqual([capability]);
    await expect(client.claimPairing(claim)).rejects.toThrow('pairing_session_already_claimed');
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_connector_device_credentials')).rows[0].count)).toBe(1);
  });
  it('rejects a claim signed by another device before issuing credentials', async () => {
    const { client, claim } = await prepareApproved();
    await expect(client.claimPairing({ ...claim, identity: sdk.createConnectorPairingIdentity() })).rejects.toThrow('pairing_proof_invalid');
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_connector_device_credentials')).rows[0].count)).toBe(0);
    await expect(client.claimPairing(claim)).resolves.toHaveProperty('deviceId');
  });
  it('rejects an expired approved claim before issuing credentials', async () => {
    const { client, claim } = await prepareApproved();
    serviceNow = new Date(now.getTime() + 10 * 60 * 1000 + 1);
    await expect(client.claimPairing(claim)).rejects.toThrow('pairing_session_expired');
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_connector_device_credentials')).rows[0].count)).toBe(0);
  });
  it('rejects heartbeat scope removal and credential expiry at the real service boundary', async () => {
    const { client, claim } = await prepareApproved();
    const receipt = await client.claimPairing(claim);
    await getPool().query("UPDATE helix_environment_connector_device_credentials SET scopes = '[\"probe.poll\"]'::jsonb WHERE device_id = $1", [receipt.deviceId]);
    await expect(client.heartbeat()).rejects.toThrow('device_credential_invalid');
    await getPool().query("UPDATE helix_environment_connector_device_credentials SET scopes = '[\"health.write\"]'::jsonb WHERE device_id = $1", [receipt.deviceId]);
    serviceNow = new Date(receipt.deviceCredentialExpiresAt);
    await expect(client.heartbeat()).rejects.toThrow('device_credential_expired');
  });
  it('keeps rotated and revoked device authority separate from the external SDK instance', async () => {
    const { client, claim } = await prepareApproved();
    const receipt = await client.claimPairing(claim);
    const rotated = await rotateEnvironmentConnectorDeviceCredential({ ownerProfileId: ownerId, deviceId: receipt.deviceId, now: serviceNow });
    await expect(client.heartbeat()).rejects.toThrow('device_revoked');
    const replacement = new sdk.HelixEnvironmentConnectorClient('https://fixture.invalid', serviceFetch, rotated.credential);
    await expect(replacement.heartbeat()).resolves.toHaveProperty('commandExecution', 'command_execution_not_enabled');
    await revokeEnvironmentConnectorDevice({ ownerProfileId: ownerId, deviceId: receipt.deviceId, now: serviceNow });
    await expect(replacement.heartbeat()).rejects.toThrow('device_revoked');
  });
  it('accepts one external clock result with correlated nonterminal evidence and idempotent replay', async () => {
    const { client, lease, result } = await prepareClockRead();
    expect(result).toMatchObject({ result: { uptime_ms: 12345 }, model_invoked: false, side_effects_performed: false, commands_executed: [] });
    await client.submit(lease, result);
    expect(submissions[0]).toMatchObject({ replayed: false, observation: {
      capability_id: capability, outcome: 'succeeded', provenance_valid: true, eligible_for_current_turn_reentry: true,
      result: { uptime_ms: 12345 }, answer_authority: false, terminal_eligible: false,
    } });
    await client.submit(lease, result);
    expect(submissions[1]).toMatchObject({ replayed: true, observation: { evidence_ref: submissions[0].observation.evidence_ref } });
    await expect(client.poll()).resolves.toEqual([]);
    await expect(client.submit(lease, { ...result, result: { ...result.result, uptime_ms: 54321 } })).rejects.toThrow('probe_result_conflict');
    expect(submissions).toHaveLength(2);
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_probe_results')).rows[0].count)).toBe(1);
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_probe_observations')).rows[0].count)).toBe(1);
  });
  it('rejects a changed clock lease token and a revoked device before accepting any result', async () => {
    const { client, receipt, lease, result } = await prepareClockRead();
    await expect(client.submit({ ...lease, lease_token: 'helix_probe_lease_wrong_012345678901234567890' }, result)).rejects.toThrow('probe_lease_invalid');
    expect(submissions).toHaveLength(0);
    await revokeEnvironmentConnectorDevice({ ownerProfileId: ownerId, deviceId: receipt.deviceId, now: serviceNow });
    await expect(client.submit(lease, result)).rejects.toThrow('device_revoked');
    expect(submissions).toHaveLength(0);
  });
  it.each([
    { probe_request_id: 'environment_probe_request:wrong' },
    { capability_id: 'example.ungranted.read' },
    { capability_version: 2 },
    { commands_executed: ['not-an-allowed-read'] },
  ])('denies altered result correlation/read-only envelope %j without persisting evidence', async (overrides) => {
    const { client, lease, result } = await prepareClockRead();
    await expect(client.submit(lease, { ...result, ...overrides })).rejects.toThrow('schema_validation_failed');
    expect(submissions).toHaveLength(0);
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_probe_results')).rows[0].count)).toBe(0);
    await client.submit(lease, result);
    expect(submissions[0].observation.eligible_for_current_turn_reentry).toBe(true);
  });
  it('denies a result after transport scope removal without consuming its valid lease', async () => {
    const { client, receipt, lease, result } = await prepareClockRead();
    await getPool().query("UPDATE helix_environment_connector_device_credentials SET scopes = '[\"probe.poll\"]'::jsonb WHERE device_id = $1", [receipt.deviceId]);
    await expect(client.submit(lease, result)).rejects.toThrow('device_credential_invalid');
    expect(Number((await getPool().query('SELECT count(*) AS count FROM helix_environment_probe_results')).rows[0].count)).toBe(0);
  });
  it('records a deadline-late clock result as ineligible evidence instead of current-turn success', async () => {
    const { client, lease, result } = await prepareClockRead();
    serviceNow = new Date(now.getTime() + 5001);
    await client.submit(lease, result);
    expect(submissions[0].observation).toMatchObject({
      eligible_for_current_turn_reentry: false, late_result_disposition: 'late_after_timeout', answer_authority: false,
    });
  });
});
