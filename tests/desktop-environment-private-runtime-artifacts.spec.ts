import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import reviewed from "../apps/desktop/environment-packages/system-clock/reviewed-native-runtime.json";
import { loadPrivateClockRuntimeArtifacts } from "../apps/desktop/src/environment-private-runtime-artifacts";
import { NativePrivateClockHost } from "../apps/desktop/src/environment-private-clock-host";
import { EnvironmentClockNativeStaging } from "../apps/desktop/src/environment-clock-native-staging";
import { PRIVATE_CLOCK_INSTALL_REVIEW, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_PROFILE, PRIVATE_CLOCK_RUNTIME_REVISION } from "../shared/environment-private-runtime";
import { HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_SYSTEM_CLOCK_READ_CAPABILITY } from "../shared/helix-environment-connector";

const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const now = new Date("2026-09-26T12:00:00.000Z");
let base: string, root: string, approved: string;
describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("reviewed private native clock artifacts", () => {
  beforeAll(() => {
    if (!process.env.G16A_CLOCK_PACKAGE) throw Error("G16A_CLOCK_PACKAGE required for exact reviewed clock");
    approved = fs.realpathSync(path.resolve(".tmp/g16a-private-clock-runtime-20260926"));
    const temp = fs.realpathSync(path.resolve(".tmp"));
    base = fs.mkdtempSync(path.join(temp, "g16a-native-artifact-tests-"));
    expect(path.dirname(fs.realpathSync(base))).toBe(temp);
    root = path.join(base, "fixture"); fs.mkdirSync(root);
    for (const name of ["node.exe", "clock-bridge.exe"] as const) {
      expect(sha(path.join(approved, name))).toBe(reviewed.files[name].sha256);
      fs.copyFileSync(path.join(approved, name), path.join(root, name));
    }
    fs.writeFileSync(".tmp/g16a-native-artifact-test-path.txt", base + "\n");
    // Retain one runtime/helper fixture for exact provenance; no old EXE cleanup.
  });
  it("loads only the frozen artifact tuple and returns immutable native configuration", () => {
    const runtime = loadPrivateClockRuntimeArtifacts(root, now);
    expect(runtime).toEqual({ executable: path.join(root, "node.exe"), sha256: reviewed.files["node.exe"].sha256,
      helperPath: path.join(root, "clock-bridge.exe"), helperSha256: reviewed.files["clock-bridge.exe"].sha256,
      reviewRevision: reviewed.revision, runtimeProfile: PRIVATE_CLOCK_RUNTIME_PROFILE, expiresAt: reviewed.expiresAt });
    expect(Object.isFrozen(runtime)).toBe(true);
  });
  it.each(["node.exe", "clock-bridge.exe"] as const)("rejects same-size changed %s bytes", name => {
    const file = path.join(root, name), fd = fs.openSync(file, "r+");
    const original = Buffer.alloc(1); fs.readSync(fd, original, 0, 1, 0);
    try {
      fs.writeSync(fd, Buffer.from([original[0] ^ 1]), 0, 1, 0);
      expect(() => loadPrivateClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_artifact_changed");
    } finally { fs.writeSync(fd, original, 0, 1, 0); fs.closeSync(fd); }
  });
  it("rejects oversized bytes instead of trusting a filename", () => {
    const file = path.join(root, "clock-bridge.exe");
    try {
      fs.appendFileSync(file, "x");
      expect(() => loadPrivateClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_artifact_changed");
    } finally { fs.truncateSync(file, reviewed.files["clock-bridge.exe"].bytes); }
  });
  it("denies a directory-provided approval manifest", () => {
    const candidate = path.join(root, "reviewed-native-runtime.json");
    fs.writeFileSync(candidate, JSON.stringify({ runtime_allowed: true, files: {} }));
    try { expect(() => loadPrivateClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_inventory_invalid"); }
    finally { fs.unlinkSync(candidate); }
  });
  it("denies a missing runtime", () => {
    const empty = path.join(base, "empty"); fs.mkdirSync(empty);
    expect(() => loadPrivateClockRuntimeArtifacts(empty, now)).toThrow("private_clock_runtime_inventory_invalid");
  });
  it("rejects a hard-linked executable", () => {
    const alias = path.join(base, "helper-alias.exe"); fs.linkSync(path.join(root, "clock-bridge.exe"), alias);
    try { expect(() => loadPrivateClockRuntimeArtifacts(root, now)).toThrow("private_clock_runtime_path_invalid"); }
    finally { fs.unlinkSync(alias); }
  });
  it("rejects a junction directory", () => {
    const alias = path.join(base, "junction"); fs.symlinkSync(root, alias, "junction");
    expect(() => loadPrivateClockRuntimeArtifacts(alias, now)).toThrow("private_clock_runtime_path_invalid");
    // Keep the fixture link; never traverse it for cleanup.
  });
  it.each(["2026-09-25T23:59:59Z", "2026-10-01T00:00:00Z", "invalid"])("rejects the review at %s", timestamp => {
    expect(() => loadPrivateClockRuntimeArtifacts(root, new Date(timestamp))).toThrow("private_clock_runtime_review_expired");
  });
  it("does not accept a relative root or disclose OS path errors", () => {
    expect(() => loadPrivateClockRuntimeArtifacts("relative", now)).toThrow("private_clock_runtime_path_invalid");
    expect(() => loadPrivateClockRuntimeArtifacts(path.join(base, "missing"), now)).toThrow("private_clock_runtime_artifacts_unavailable");
  });
  it("runs the composed clock using the exact loaded helper/runtime without compiling a new helper", async () => {
    const runtime = loadPrivateClockRuntimeArtifacts(approved);
    const userDataPath = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "casimirbot-reviewed-clock-"));
    const account = { profileId: "profile:reviewed-artifact", sessionId: "account_session:reviewed-artifact-1234", accountType: "developer" as const };
    const identity = { profile_id: account.profileId, device_id: `desktop_device_${"d".repeat(22)}`,
      session_ref: createHash("sha256").update(account.sessionId).digest("hex"), artifact_sha256: PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256,
      review_revision: PRIVATE_CLOCK_INSTALL_REVIEW.policyRevision, credential_included: false, public_release: false };
    let observationStarted = 0;
    const policyTimings: Array<{ checkpoint: number; elapsedMs: number }> = [];
    const stagingTimings: Array<{ startMs: number; durationMs: number }> = [];
    const leaseTimings: Array<{ phase: string; elapsedMs: number }> = [];
    let leaseWatcher: fs.FSWatcher | undefined;
    const originalPrepare = EnvironmentClockNativeStaging.prototype.prepare;
    const prepareObserver = vi.spyOn(EnvironmentClockNativeStaging.prototype, "prepare").mockImplementation(function(this: EnvironmentClockNativeStaging, entryPath) {
      const started = Date.now();
      try {
        const leaseRoot = originalPrepare.call(this, entryPath);
        // Observe only the test-owned fixed journal. Notifications may coalesce;
        // these are timing diagnostics, never authority or exact phase durations.
        leaseWatcher = fs.watch(leaseRoot, (_event, filename) => {
          if (filename?.toString() !== "clock-isolation.journal") return;
          try {
            const phase = fs.readFileSync(path.join(leaseRoot, "clock-isolation.journal"), "utf8").split("\n")[3];
            if (["intent", "created", "granted", "running", "cleaned", "collision"].includes(phase) &&
                leaseTimings.at(-1)?.phase !== phase)
              leaseTimings.push({ phase, elapsedMs: Date.now() - observationStarted });
          } catch { /* Atomic publication may transiently make the record unavailable. */ }
        });
        return leaseRoot;
      }
      finally { stagingTimings.push({ startMs: started - observationStarted, durationMs: Date.now() - started }); }
    });
    const host = new NativePrivateClockHost({ userDataPath, deviceId: identity.device_id, runtime,
      featureEnabled: () => true, runtimeEnabled: () => true, readAccount: async () => account,
      selectArchive: async () => path.join(process.env.G16A_CLOCK_PACKAGE!, "clock.tgz"),
      readPolicy: async () => ({ ...identity, schema: "casimirbot.private_environment_install_policy.v1",
        policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: PRIVATE_CLOCK_INSTALL_REVIEW.expiresAt,
        install_allowed: true, runtime_allowed: false }),
      readRuntimePolicy: async () => {
        policyTimings.push({ checkpoint: policyTimings.length + 1, elapsedMs: Date.now() - observationStarted });
        const now = new Date();
        return { ...identity, schema: "casimirbot.private_clock_runtime_policy.v1", policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION,
          runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE, capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
          issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 30000).toISOString(),
          runtime_allowed: true, hosted_required: false, model_invoked: false };
      } });
    try {
      expect(await host.installer.install()).toMatchObject({ status: "installed_stopped", runtimeAvailable: false });
      const start = new Date();
      observationStarted = start.getTime();
      const observation = await host.observe({ schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA,
        probe_request_id: `probe:artifact-${randomUUID()}`, capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
        capability_version: 1, catalog_snapshot_id: "catalog:private-clock", arguments: { clock: "monotonic" },
        constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 }, created_at: start.toISOString(),
        deadline_at: new Date(start.getTime() + 5000).toISOString(), assistant_answer: false, raw_content_included: false });
      expect(observation.result.outcome).toBe("succeeded"); expect(host.status().running).toBe(false);
      fs.writeFileSync(path.join(base, "actual-host.json"), JSON.stringify({ approved, userDataPath, runtime,
        installationRef: observation.installationRef, executionRef: observation.executionRef, outcome: observation.result.outcome,
        policyTimings, stagingTimings, leaseTimings, observationElapsedMs: Date.now() - observationStarted,
        loaderSourceSha256: sha("apps/desktop/src/environment-private-runtime-artifacts.ts"),
        frozenReviewSha256: sha("apps/desktop/environment-packages/system-clock/reviewed-native-runtime.json") }, null, 2) + "\n");
    } catch (error: any) {
      fs.writeFileSync(path.join(base, "actual-host-error.json"), JSON.stringify({ code: error.code ?? "test_error",
        policyTimings, stagingTimings, leaseTimings, userDataPath, elapsedMs: Date.now() - observationStarted }, null, 2) + "\n");
      throw error;
    } finally { prepareObserver.mockRestore(); try { await host.close(); } finally { leaseWatcher?.close(); } }
    // Negative cases restored their fixture; approved bytes were never modified.
    for (const name of ["node.exe", "clock-bridge.exe"] as const) {
      expect(sha(path.join(root, name))).toBe(reviewed.files[name].sha256);
      expect(sha(path.join(approved, name))).toBe(reviewed.files[name].sha256);
    }
  }, 20000);
});
