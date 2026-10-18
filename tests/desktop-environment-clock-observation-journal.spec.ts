import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentClockObservationJournal, type ClockObservationContext } from "../apps/desktop/src/environment-clock-observation-journal";
import { EnvironmentClockSupervisor, EnvironmentClockError } from "../apps/desktop/src/environment-clock-supervisor";
import type { ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";
import { HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA,
  HELIX_SYSTEM_CLOCK_READ_CAPABILITY, type HelixEnvironmentConnectorProbeResult } from "../shared/helix-environment-connector";

const now = new Date("2026-09-26T12:00:00.000Z"), roots: string[] = [];
const executionRef = () => `environment_execution:${randomUUID()}`;
const context = (): ClockObservationContext => ({
  owner: { profileId: "profile:journal", deviceId: "device:journal" },
  installation: { schema: "casimirbot.environment_package_installation.v1", installationRef: `environment_installation:${randomUUID()}`,
    profileId: "profile:journal", deviceId: "device:journal", packageId: "com.casimirbot.system.clock", version: "1.0.0-private.1",
    artifactSha256: "a".repeat(64), policyRevision: "fixture:journal", installedAt: now.toISOString(), status: "installed_stopped",
    connected: false, granted: false, runtimeLaunchable: false },
  request: { schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, probe_request_id: "probe:journal", capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
    capability_version: 1, catalog_snapshot_id: "catalog:journal", arguments: { clock: "monotonic" },
    constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
    created_at: now.toISOString(), deadline_at: new Date(now.getTime() + 5000).toISOString(), assistant_answer: false, raw_content_included: false },
});
const result = (c: ClockObservationContext): HelixEnvironmentConnectorProbeResult => ({
  schema: HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA, probe_request_id: c.request.probe_request_id,
  capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, outcome: "succeeded", summary: "fixture clock",
  result: { uptime_ms: 42 }, side_effects_performed: false, commands_executed: [], environment_mutation_performed: false,
  deterministic: true, model_invoked: false, assistant_answer: false, raw_content_included: false, created_at: now.toISOString(),
});
const setup = () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "casimirbot-clock-journal-")); roots.push(root);
  return { root, c: context(), journal: new EnvironmentClockObservationJournal(root) };
};
const requestRoot = (root: string) => {
  const version = path.join(root, "clock-observations", "v1");
  const owner = path.join(version, fs.readdirSync(version)[0]);
  return path.join(owner, fs.readdirSync(owner)[0]);
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-clock-journal-")) throw Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("durable clock observation journal", () => {
  it("discovers a saved request after reconstruction without rewriting records", () => {
    const s = setup(); expect(s.journal.latestRequest(s.c)).toEqual({ request: null, legacyRecords: 0 });
    const accepted = s.journal.commit(s.journal.begin(s.c, executionRef(), 0), result(s.c));
    const root = requestRoot(s.root), before = fs.readdirSync(root).map(name => [name, fs.readFileSync(path.join(root, name), "utf8")]);
    const fresh = new EnvironmentClockObservationJournal(s.root);
    expect(fresh.latestRequest(s.c)).toEqual({ request: s.c.request, legacyRecords: 0 });
    expect(fresh.lookup(s.c)).toEqual({ state: "accepted", fresh: false, receipt: accepted });
    expect(fs.readdirSync(root).map(name => [name, fs.readFileSync(path.join(root, name), "utf8")])).toEqual(before);
  });
  it("discovers the newer uncertain request instead of an older success", () => {
    const s = setup(); s.journal.commit(s.journal.begin(s.c, executionRef(), 0), result(s.c));
    const next = structuredClone(s.c); next.request.probe_request_id = "probe:next";
    next.request.created_at = new Date(now.getTime() + 1000).toISOString();
    s.journal.begin(next, executionRef(), 1);
    const found = s.journal.latestRequest(s.c);
    expect(found.request).toEqual(next.request);
    expect(s.journal.lookup({ ...s.c, request: found.request! })).toEqual({ state: "uncertain", fresh: false });
  });
  it.each(["profile", "device", "installation", "artifact", "policy"])("discovery does not cross %s scope", kind => {
    const s = setup(); s.journal.commit(s.journal.begin(s.c, executionRef(), 0), result(s.c));
    const other = structuredClone(s.c);
    if (kind === "profile") other.owner.profileId = other.installation.profileId = "profile:other";
    if (kind === "device") other.owner.deviceId = other.installation.deviceId = "device:other";
    if (kind === "installation") other.installation.installationRef = `environment_installation:${randomUUID()}`;
    if (kind === "artifact") other.installation.artifactSha256 = "b".repeat(64);
    if (kind === "policy") other.installation.policyRevision = "policy:other";
    expect(s.journal.latestRequest(other)).toEqual({ request: null, legacyRecords: 0 });
  });
  it("keeps legacy exact-request recovery and replay rejection without inventing request details", () => {
    const s = setup(), receipt = s.journal.commit(s.journal.begin(s.c, executionRef(), 0), result(s.c));
    fs.unlinkSync(path.join(requestRoot(s.root), "request.json"));
    expect(s.journal.latestRequest(s.c)).toEqual({ request: null, legacyRecords: 1 });
    expect(s.journal.lookup(s.c)).toEqual({ state: "accepted", fresh: false, receipt });
    expect(() => s.journal.begin(s.c, executionRef(), 1)).toThrow("clock_request_already_recorded");
  });
  it.each(["changed-request", "hard-link", "oversized", "moved-root", "corrupt-result"])("discovery rejects %s", kind => {
    const s = setup(); s.journal.commit(s.journal.begin(s.c, executionRef(), 0), result(s.c));
    const root = requestRoot(s.root), file = path.join(root, "request.json");
    if (kind === "changed-request") fs.writeFileSync(file, JSON.stringify({ ...s.c.request, catalog_snapshot_id: "changed" }) + "\n");
    if (kind === "hard-link") fs.linkSync(file, path.join(s.root, "alias.json"));
    if (kind === "oversized") fs.writeFileSync(file, "x".repeat(65537));
    if (kind === "moved-root") fs.renameSync(root, path.join(path.dirname(root), "f".repeat(64)));
    if (kind === "corrupt-result") fs.writeFileSync(path.join(root, "accepted.json"), "{");
    expect(() => s.journal.latestRequest(s.c)).toThrow(/clock_(journal|request)/);
  });
  it("recovers a committed observation as history and refuses duplicate execution after reconstruction", () => {
    const s = setup(); expect(s.journal.lookup(s.c)).toEqual({ state: "absent", fresh: false });
    const ticket = s.journal.begin(s.c, executionRef(), 3), accepted = s.journal.commit(ticket, result(s.c));
    const fresh = new EnvironmentClockObservationJournal(s.root);
    expect(fresh.lookup(s.c)).toEqual({ state: "accepted", fresh: false, receipt: accepted });
    expect(() => fresh.begin(s.c, executionRef(), 4)).toThrow("clock_request_already_recorded");
  });
  it("retains an interrupted claim and permits only a distinct explicitly requested observation", () => {
    const s = setup(); s.journal.begin(s.c, executionRef(), 0);
    const fresh = new EnvironmentClockObservationJournal(s.root);
    expect(fresh.lookup(s.c)).toEqual({ state: "uncertain", fresh: false });
    expect(() => fresh.begin(s.c, executionRef(), 1)).toThrow("clock_request_uncertain");
    const next = structuredClone(s.c); next.request.probe_request_id = "probe:new-explicit-request";
    expect(fresh.commit(fresh.begin(next, executionRef(), 1), result(next)).result.probe_request_id).toBe(next.request.probe_request_id);
  });
  it.each(["body", "installation", "artifact", "policy"])("rejects a changed %s under the same request ID", kind => {
    const s = setup(); s.journal.begin(s.c, executionRef(), 0);
    const changed = structuredClone(s.c);
    if (kind === "body") changed.request.catalog_snapshot_id = "catalog:other";
    if (kind === "installation") changed.installation.installationRef = `environment_installation:${randomUUID()}`;
    if (kind === "artifact") changed.installation.artifactSha256 = "b".repeat(64);
    if (kind === "policy") changed.installation.policyRevision = "fixture:other";
    expect(() => s.journal.begin(changed, executionRef(), 1)).toThrow("clock_request_conflict");
    expect(() => s.journal.lookup(changed)).toThrow("clock_request_conflict");
  });
  it.each(["profile", "device"])("keeps another %s separate", kind => {
    const s = setup(); s.journal.commit(s.journal.begin(s.c, executionRef(), 0), result(s.c));
    const other = structuredClone(s.c);
    if (kind === "profile") other.owner.profileId = other.installation.profileId = "profile:other";
    else other.owner.deviceId = other.installation.deviceId = "device:other";
    expect(s.journal.lookup(other)).toEqual({ state: "absent", fresh: false });
  });
  it.each(["claim-corrupt", "result-corrupt", "oversized", "hard-link", "changed-result", "crossed-claim"])("denies %s persisted evidence", kind => {
    const s = setup(); s.journal.commit(s.journal.begin(s.c, executionRef(), 0), result(s.c));
    const root = requestRoot(s.root), claim = path.join(root, "claim.json"), accepted = path.join(root, "accepted.json");
    if (kind === "claim-corrupt") fs.writeFileSync(claim, "{");
    if (kind === "result-corrupt") fs.writeFileSync(accepted, "{");
    if (kind === "oversized") fs.writeFileSync(accepted, "x".repeat(82 * 1024));
    if (kind === "hard-link") fs.linkSync(accepted, path.join(s.root, "alias.json"));
    if (kind === "changed-result") { const parsed = JSON.parse(fs.readFileSync(accepted, "utf8")); parsed.receipt.result.result.uptime_ms++;
      fs.writeFileSync(accepted, JSON.stringify(parsed)); }
    if (kind === "crossed-claim") { const parsed = JSON.parse(fs.readFileSync(claim, "utf8")); parsed.binding.ownerRef = "f".repeat(64);
      fs.writeFileSync(claim, JSON.stringify(parsed)); }
    expect(() => s.journal.lookup(s.c)).toThrow(/clock_(journal|request)/);
    expect(() => s.journal.begin(s.c, executionRef(), 1)).toThrow(/clock_(journal|request)/);
  });
  it("preserves an empty reservation after interrupted claim persistence", () => {
    const s = setup(); vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw Error("injected storage failure"); });
    expect(() => s.journal.begin(s.c, executionRef(), 0)).toThrow("clock_journal_unavailable");
    vi.restoreAllMocks();
    // Claim file may be zero bytes; remove it to reproduce death just after mkdir.
    fs.unlinkSync(path.join(requestRoot(s.root), "claim.json"));
    expect(s.journal.lookup(s.c)).toEqual({ state: "uncertain", fresh: false });
    expect(() => s.journal.begin(s.c, executionRef(), 1)).toThrow("clock_request_uncertain");
  });
  it("does not publish a result when its atomic rename fails", () => {
    const s = setup(), ticket = s.journal.begin(s.c, executionRef(), 0);
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw Error("injected rename failure"); });
    expect(() => s.journal.commit(ticket, result(s.c))).toThrow("clock_journal_unavailable");
    vi.restoreAllMocks();
    expect(new EnvironmentClockObservationJournal(s.root).lookup(s.c)).toEqual({ state: "uncertain", fresh: false });
    expect(() => s.journal.commit(ticket, result(s.c))).toThrow("clock_journal_ticket_invalid");
  });
  it("denies wrong result correlation and does not reuse abandoned tickets", () => {
    const s = setup(), ticket = s.journal.begin(s.c, executionRef(), 0);
    expect(() => s.journal.commit(ticket, { ...result(s.c), probe_request_id: "probe:wrong" })).toThrow("clock_journal_result_invalid");
    expect(() => s.journal.commit(ticket, result(s.c))).toThrow("clock_journal_ticket_invalid");
    expect(s.journal.lookup(s.c).state).toBe("uncertain");
  });
  it("caps history without deleting prior request identities", () => {
    const s = setup(); s.journal.begin(s.c, executionRef(), 0);
    const parent = path.dirname(requestRoot(s.root));
    for (let i = 1; i < 1024; i++) fs.mkdirSync(path.join(parent, String(i).padStart(64, "0")));
    const next = structuredClone(s.c); next.request.probe_request_id = "probe:over-cap";
    expect(() => s.journal.begin(next, executionRef(), 0)).toThrow("clock_journal_capacity_reached");
    expect(fs.readdirSync(parent)).toHaveLength(1024);
  });
});

describe("supervisor durable observation ordering", () => {
  const host = () => {
    const s = setup();
    const review: ReviewedEnvironmentPackage = { schema: "casimirbot.environment_package_review.v1",
      packageId: s.c.installation.packageId, version: s.c.installation.version, publisher: "publisher:fixture",
      archiveSha256: s.c.installation.artifactSha256, policyRevision: s.c.installation.policyRevision,
      files: { "clock.cjs": "d".repeat(64), LICENSE: "e".repeat(64), "THIRD_PARTY_NOTICES.txt": "f".repeat(64) },
      entryPoint: "clock.cjs", expiresAt: "2026-10-01T00:00:00.000Z", platforms: [process.platform], minNodeMajor: 24, privateOnly: true };
    const run = vi.fn(async (input: any) => {
      expect(s.journal.lookup(s.c).state).toBe("uncertain");
      await input.beforeExecute(); return Buffer.from(JSON.stringify(result(s.c)));
    });
    const authorize = vi.fn(async () => {});
    const input = { executable: process.execPath, review,
      resolveEntry: async () => ({ entryPath: path.join(s.root, "clock.cjs"), installation: s.c.installation }),
      authorize, now: () => now, processRunner: { run }, observationJournal: s.journal };
    return { ...s, run, authorize, input, supervisor: new EnvironmentClockSupervisor(input) };
  };
  it("persists before returning and retrieves authorized non-fresh history without running again", async () => {
    const s = host(), accepted = await s.supervisor.observe(s.c.owner, s.c.request);
    const reconstructed = new EnvironmentClockSupervisor({ ...s.input, observationJournal: new EnvironmentClockObservationJournal(s.root) });
    expect(await reconstructed.recoverObservation(s.c.owner, s.c.request)).toEqual({ state: "accepted", fresh: false, receipt: accepted });
    await expect(reconstructed.observe(s.c.owner, s.c.request)).rejects.toThrow("clock_request_already_recorded");
    expect(s.run).toHaveBeenCalledTimes(1);
    expect(s.authorize.mock.calls.map(call => call[1])).toEqual(["execute", "execute", "accept", "accept", "execute"]);
  });
  it("discovers the latest authorized history without execution or a supplied request", async () => {
    const s = host(), receipt = await s.supervisor.observe(s.c.owner, s.c.request);
    expect(await new EnvironmentClockSupervisor(s.input).discoverObservation(s.c.owner)).toEqual({
      state: "latest", fresh: false, legacyRecords: 0, request: s.c.request, history: { state: "accepted", fresh: false, receipt } });
    expect(s.run).toHaveBeenCalledTimes(1);
    s.authorize.mockRejectedValue(Error("withdrawn"));
    await expect(s.supervisor.discoverObservation(s.c.owner)).rejects.toThrow("clock_admission_or_execution_failed");
    expect(s.run).toHaveBeenCalledTimes(1);
  });
  it("does not return discovered history after Stop during current authorization", async () => {
    const s = host(); await s.supervisor.observe(s.c.owner, s.c.request);
    let release!: () => void, entered!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const waiting = new Promise<void>(resolve => { release = resolve; });
    s.authorize.mockImplementationOnce(async () => { entered(); await waiting; });
    const pending = s.supervisor.discoverObservation(s.c.owner).catch(error => error);
    await reached; await s.supervisor.stop(s.c.owner); release();
    expect((await pending).code).toBe("clock_fenced"); expect(s.run).toHaveBeenCalledTimes(1);
  });
  it("rejects persistence failure instead of returning success or rerunning", async () => {
    const s = host(); vi.spyOn(s.journal, "commit").mockImplementationOnce(() => { throw new EnvironmentClockError("clock_journal_unavailable"); });
    await expect(s.supervisor.observe(s.c.owner, s.c.request)).rejects.toThrow("clock_journal_unavailable");
    await expect(new EnvironmentClockSupervisor(s.input).observe(s.c.owner, s.c.request)).rejects.toThrow("clock_request_uncertain");
    expect(s.run).toHaveBeenCalledTimes(1);
  });
  it("does not persist rejected evidence or disclose history after permission withdrawal", async () => {
    const s = host(); s.authorize.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("withdrawn"));
    await expect(s.supervisor.observe(s.c.owner, s.c.request)).rejects.toThrow("clock_admission_or_execution_failed");
    expect(s.journal.lookup(s.c).state).toBe("uncertain");
    s.authorize.mockRejectedValue(Error("withdrawn"));
    const lookup = vi.spyOn(s.journal, "lookup");
    await expect(s.supervisor.recoverObservation(s.c.owner, s.c.request)).rejects.toThrow("clock_admission_or_execution_failed");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("does not reserve storage before execution admission", async () => {
    const s = host(); s.authorize.mockRejectedValue(Error("denied"));
    await expect(s.supervisor.observe(s.c.owner, s.c.request)).rejects.toThrow("clock_admission_or_execution_failed");
    expect(fs.readdirSync(s.root)).toEqual([]); expect(s.run).not.toHaveBeenCalled();
  });
  it("allows expired-request history only as non-fresh, never another execution", async () => {
    const s = host(); await s.supervisor.observe(s.c.owner, s.c.request);
    const later = new EnvironmentClockSupervisor({ ...s.input, now: () => new Date(now.getTime() + 60000) });
    expect(await later.recoverObservation(s.c.owner, s.c.request)).toMatchObject({ state: "accepted", fresh: false });
    await expect(later.observe(s.c.owner, s.c.request)).rejects.toThrow("clock_deadline_expired");
    expect(s.run).toHaveBeenCalledTimes(1);
  });
  it("rejects history when Stop invalidates an in-flight history admission", async () => {
    const s = host(); await s.supervisor.observe(s.c.owner, s.c.request);
    let release!: () => void, reached!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    s.authorize.mockImplementationOnce(async () => { reached(); await waiting; });
    const history = s.supervisor.recoverObservation(s.c.owner, s.c.request).catch(error => error);
    await entered; await s.supervisor.stop(s.c.owner); release();
    expect((await history).code).toBe("clock_fenced"); expect(s.run).toHaveBeenCalledTimes(1);
  });
});
