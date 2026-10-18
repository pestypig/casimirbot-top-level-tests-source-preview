import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { NativePrivateClockHost } from "../../apps/desktop/src/environment-private-clock-host";
import { loadPrivateClockRuntimeArtifacts } from "../../apps/desktop/src/environment-private-runtime-artifacts";
import { EnvironmentClockObservationJournal } from "../../apps/desktop/src/environment-clock-observation-journal";
import { WindowsClockNativeRunner } from "../../apps/desktop/src/environment-clock-native-runner";
import { WindowsPreparedClockSession } from "../../apps/desktop/src/environment-clock-prepared-runner";
import type { EnvironmentClockProcessRunner } from "../../apps/desktop/src/environment-clock-supervisor";
import { EnvironmentClockNativeStaging } from "../../apps/desktop/src/environment-clock-native-staging";
import { PRIVATE_CLOCK_INSTALL_REVIEW, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_PROFILE, PRIVATE_CLOCK_RUNTIME_REVISION } from "../../shared/environment-private-runtime";
import { HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_SYSTEM_CLOCK_READ_CAPABILITY } from "../../shared/helix-environment-connector";

export function createCrashHost(root: string, runtimeDirectory: string, archive: string, now = () => new Date(), diagnosticBuild?: string, preparedEvidence?: string) {
  let runtime = loadPrivateClockRuntimeArtifacts(runtimeDirectory);
  let preparedHelper: { path: string; sha256: string } | undefined;
  if (preparedEvidence) {
    assert(!diagnosticBuild);
    const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const folder = "docs/evidence/eh-g8-codex-first-paid-product-delivery-v1/launch-program";
    assert.equal(preparedEvidence, path.resolve(folder, "2026-09-26-g16a-prepared-native-transport.json"));
    const native = JSON.parse(fs.readFileSync(preparedEvidence, "utf8"));
    const host = JSON.parse(fs.readFileSync(path.join(folder, "2026-09-26-g16a-prepared-account-host.json"), "utf8").replace(/^\uFEFF/, ""));
    assert.equal(sha("apps/desktop/src/environment-private-clock-host.ts"), host.initialBuild.hostSha256);
    assert.equal(sha("apps/desktop/src/environment-clock-prepared-runner.ts"), host.initialBuild.runnerSha256);
    for (const [source, expected] of Object.entries(native.sourceHashes)) assert.equal(sha(source), expected);
    assert.equal(path.dirname(path.dirname(native.helper)), fs.realpathSync(".tmp"));
    assert(path.basename(path.dirname(native.helper)).startsWith("g16a-prepared-build-"));
    for (let cursor = native.helper;; cursor = path.dirname(cursor)) {
      assert(!fs.lstatSync(cursor).isSymbolicLink()); if (path.dirname(cursor) === cursor) break;
    }
    assert.equal(sha(native.helper), native.helperSha256);
    preparedHelper = { path: native.helper, sha256: native.helperSha256 };
  }
  if (diagnosticBuild) {
    const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(path.dirname(path.dirname(diagnosticBuild)), fs.realpathSync(".tmp"));
    const metadata = JSON.parse(fs.readFileSync(diagnosticBuild, "utf8"));
    const candidate = metadata.schema === "casimirbot.private_clock_candidate_build.v1";
    assert(path.basename(path.dirname(diagnosticBuild)).startsWith(candidate ? "g16a-clock-candidate-" : "g16a-bridge-phases-"));
    if (candidate) { assert.equal(metadata.candidateOnly, true); assert.equal(metadata.instrumented, false); }
    else { assert.equal(metadata.schema, "casimirbot.diagnostic_clock_host_build.v1"); assert.equal(metadata.diagnosticOnly, true); }
    assert.equal(path.dirname(metadata.helperPath), path.dirname(diagnosticBuild));
    assert.equal(sha(metadata.helperPath), metadata.helperSha256);
    const review = JSON.parse(fs.readFileSync("apps/desktop/environment-packages/system-clock/reviewed-native-runtime.json", "utf8"));
    const expected = { ...review.sourceSha256 };
    if (candidate) {
      const evidencePath = "docs/evidence/eh-g8-codex-first-paid-product-delivery-v1/launch-program/2026-09-26-g16a-native-read-buffer-candidate.json";
      const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8").replace(/^\uFEFF/, ""));
      assert.equal(metadata.sourceEvidence, evidencePath); assert.equal(metadata.sourceEvidenceSha256, sha(evidencePath));
      expected["EnvironmentClockIsolationLease.cs"] = evidence.artifacts.find((a: any) => a.path === "apps/desktop/native/EnvironmentClockIsolationLease.cs")?.sha256;
      assert.equal(fs.statSync(metadata.helperPath).size, metadata.helperBytes);
    }
    assert.deepEqual(metadata.sourceSha256, expected);
    for (const [name, hash] of Object.entries(expected)) assert.equal(sha(path.join("apps/desktop/native", name)), hash);
    if (!candidate) {
      assert.equal(path.dirname(path.dirname(metadata.tracePath)), fs.realpathSync(os.tmpdir()));
      assert(path.basename(path.dirname(metadata.tracePath)).startsWith("casimirbot-clock-phases-"));
      assert(fs.statSync(metadata.tracePath).size <= 65536);
    }
    for (const file of [diagnosticBuild, metadata.helperPath, ...(!candidate ? [metadata.tracePath] : [])])
      for (let cursor = file;; cursor = path.dirname(cursor)) {
        assert(!fs.lstatSync(cursor).isSymbolicLink()); if (path.dirname(cursor) === cursor) break;
      }
    runtime = { ...runtime, helperPath: metadata.helperPath, helperSha256: metadata.helperSha256 };
  }
  const account = { profileId: "profile:native-crash-fixture", sessionId: "account_session:native-crash-fixture-1234", accountType: "developer" as const };
  const identity = { profile_id: account.profileId, device_id: `desktop_device_${"k".repeat(22)}`,
    session_ref: createHash("sha256").update(account.sessionId).digest("hex"),
    artifact_sha256: PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256, review_revision: PRIVATE_CLOCK_INSTALL_REVIEW.policyRevision,
    credential_included: false, public_release: false };
  const counters = { runtimePolicyReads: 0 };
  const host = new NativePrivateClockHost({ userDataPath: root, deviceId: identity.device_id, runtime, preparedHelper,
    featureEnabled: () => true, runtimeEnabled: () => true, readAccount: async () => ({ ...account }),
    selectArchive: async () => archive, now,
    readPolicy: async () => ({ ...identity, schema: "casimirbot.private_environment_install_policy.v1",
      policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: PRIVATE_CLOCK_INSTALL_REVIEW.expiresAt,
      install_allowed: true, runtime_allowed: false }),
    readRuntimePolicy: async () => {
      counters.runtimePolicyReads++;
      const issued = now();
      return { ...identity, schema: "casimirbot.private_clock_runtime_policy.v1", policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION,
        runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE, capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
        issued_at: issued.toISOString(), expires_at: new Date(+issued + 30000).toISOString(),
        runtime_allowed: true, hosted_required: false, model_invoked: false };
    } });
  return { host, counters, runtime };
}

async function victim() {
  const root = fs.realpathSync(process.argv[3]), boundary = process.argv[4];
  const preparedEvidence = process.argv[8] || undefined;
  if (!path.basename(root).startsWith("g16a-host-crash-") || !["prepared", "before-commit", "after-commit"].includes(boundary) ||
    (boundary === "prepared" && !preparedEvidence))
    throw Error("fixture_scope_invalid");
  const { host, counters } = createCrashHost(root, process.argv[5], process.argv[6], undefined, process.argv[7] || undefined, preparedEvidence);
  const installed = await host.installer.install();
  if (installed.status !== "installed_stopped") throw Error("fixture_install_failed");
  let preparationMs: number | undefined;
  if (preparedEvidence) {
    const before = Date.now();
    try { await host.prepare(); }
    catch (error: any) {
      fs.writeFileSync(path.join(root, `${boundary}-failure.json`), JSON.stringify({ code: error.code, phase: "prepare", elapsedMs: Date.now() - before })); throw error;
    }
    preparationMs = Date.now() - before;
    if (boundary === "prepared") {
      fs.writeFileSync(path.join(root, `${boundary}.json`), JSON.stringify({ boundary, pid: process.pid,
        clockPid: host.status().pid, preparationMs, runtimePolicyReads: counters.runtimePolicyReads,
        installationRef: installed.installationRef, requestCreated: false }), { flag: "wx" });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000); process.exit(71);
    }
    counters.runtimePolicyReads = 0;
  }
  const started = Date.now();
  const request = { schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, probe_request_id: `probe:host-crash-${randomUUID()}`,
    capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, catalog_snapshot_id: "catalog:private-clock",
    arguments: { clock: "monotonic" }, constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
    created_at: new Date(started).toISOString(), deadline_at: new Date(started + 5000).toISOString(),
    assistant_answer: false, raw_content_included: false };
  let clockPid: number | undefined, runnerCalls = 0;
  const phases: { phase: string; elapsedMs: number }[] = [];
  const phase = (name: string) => phases.push({ phase: name, elapsedMs: Date.now() - started });
  const originalPrepare = EnvironmentClockNativeStaging.prototype.prepare;
  EnvironmentClockNativeStaging.prototype.prepare = function(entry) {
    phase("staging:start");
    try { return originalPrepare.call(this, entry); } finally { phase("staging:end"); }
  };
  const runnerPrototype: EnvironmentClockProcessRunner = preparedEvidence ? WindowsPreparedClockSession.prototype : WindowsClockNativeRunner.prototype;
  const originalRun = runnerPrototype.run;
  runnerPrototype.run = async function(input) {
    runnerCalls++; phase("runner:start");
    try { return await originalRun.call(this, { ...input,
      onSpawn: pid => { clockPid = pid; phase("clock:prepared-pid"); input.onSpawn(pid); },
      beforeExecute: async () => { phase("native:prepared"); await input.beforeExecute(); phase("native:admitted"); },
    }); } finally { phase("runner:end"); }
  };
  const originalCommit = EnvironmentClockObservationJournal.prototype.commit;
  EnvironmentClockObservationJournal.prototype.commit = function(ticket, result) {
    const receipt = boundary === "after-commit" ? originalCommit.call(this, ticket, result) : undefined;
    fs.writeFileSync(path.join(root, `${boundary}.json`), JSON.stringify({ boundary, pid: process.pid, clockPid,
      request, result, receipt, installationRef: installed.installationRef, runnerCalls,
      runtimePolicyReads: counters.runtimePolicyReads, preparationMs, elapsedMs: Date.now() - started, phases }), { flag: "wx" });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000);
    process.exit(71);
  };
  try {
    await host.observe(request);
    fs.writeFileSync(path.join(root, `${boundary}-delivered.json`), "true", { flag: "wx" });
  } catch (error: any) {
    fs.writeFileSync(path.join(root, `${boundary}-failure.json`), JSON.stringify({ pid: process.pid, clockPid, code: error.code ?? "fixture_failure",
      elapsedMs: Date.now() - started, status: host.status(), runtimePolicyReads: counters.runtimePolicyReads, phases }));
    throw error;
  } finally { await host.close(); }
}
if (process.argv[2] === "--host-crash-fixture") void victim().catch(() => { process.exitCode = 1; });
