import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NativePrivateClockHost } from "../apps/desktop/src/environment-private-clock-host";
import { EnvironmentClockNativeStaging } from "../apps/desktop/src/environment-clock-native-staging";
import { EnvironmentPackageInstallationStore } from "../apps/desktop/src/environment-package-installation";
import { loadPrivateClockRuntimeArtifacts } from "../apps/desktop/src/environment-private-runtime-artifacts";
import { PRIVATE_CLOCK_INSTALL_REVIEW, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_PROFILE, PRIVATE_CLOCK_RUNTIME_REVISION } from "../shared/environment-private-runtime";
import { HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_SYSTEM_CLOCK_READ_CAPABILITY } from "../shared/helix-environment-connector";

describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("private clock startup qualification", () => {
  it.each(["on-demand", "pre-staged"] as const)("qualifies first-use and explicitly requested reused startup: %s", async preparation => {
    if (!process.env.G16A_CLOCK_PACKAGE) throw Error("G16A_CLOCK_PACKAGE required");
    const runtime = loadPrivateClockRuntimeArtifacts(fs.realpathSync(".tmp/g16a-private-clock-runtime-20260926"));
    const userDataPath = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "casimirbot-clock-startup-"));
    const reportPath = path.join(fs.realpathSync(".tmp"), `g16a-startup-comparison-${randomUUID()}.json`);
    fs.writeFileSync(".tmp/g16a-startup-comparison-path.txt", reportPath + "\n");
    const account = { profileId: "profile:startup", sessionId: "account_session:startup-12345678", accountType: "developer" as const };
    const identity = { profile_id: account.profileId, device_id: `desktop_device_${"s".repeat(22)}`,
      session_ref: createHash("sha256").update(account.sessionId).digest("hex"),
      artifact_sha256: PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256, review_revision: PRIVATE_CLOCK_INSTALL_REVIEW.policyRevision,
      credential_included: false, public_release: false };
    const results: Array<Record<string, unknown>> = [];
    let start = 0, leaseRoot: string | undefined, watch: fs.FSWatcher | undefined;
    let events: Array<{ phase: string; elapsedMs: number }> = [];
    const event = (phase: string) => events.push({ phase, elapsedMs: Date.now() - start });
    const original = EnvironmentClockNativeStaging.prototype.prepare;
    const observer = vi.spyOn(EnvironmentClockNativeStaging.prototype, "prepare").mockImplementation(function(this: EnvironmentClockNativeStaging, entry) {
      event("staging:start");
      try {
        leaseRoot = original.call(this, entry);
        watch?.close();
        watch = fs.watch(leaseRoot, (_type, name) => {
          if (name?.toString() !== "clock-isolation.journal") return;
          try {
            const phase = fs.readFileSync(path.join(leaseRoot!, "clock-isolation.journal"), "utf8").split("\n")[3];
            if (["intent", "created", "granted", "running", "cleaned", "collision"].includes(phase) &&
                events.at(-1)?.phase !== `lease:${phase}`) event(`lease:${phase}`);
          } catch { /* Atomic publication can make the fixed record transiently unavailable. */ }
        });
        return leaseRoot;
      } finally { event("staging:end"); }
    });
    const host = new NativePrivateClockHost({ userDataPath, deviceId: identity.device_id, runtime,
      featureEnabled: () => true, runtimeEnabled: () => true, readAccount: async () => account,
      selectArchive: async () => path.join(process.env.G16A_CLOCK_PACKAGE!, "clock.tgz"),
      readPolicy: async () => ({ ...identity, schema: "casimirbot.private_environment_install_policy.v1",
        policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: PRIVATE_CLOCK_INSTALL_REVIEW.expiresAt,
        install_allowed: true, runtime_allowed: false }),
      readRuntimePolicy: async () => {
        event("policy"); const now = new Date();
        return { ...identity, schema: "casimirbot.private_clock_runtime_policy.v1", policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION,
          runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE, capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
          issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 30000).toISOString(),
          runtime_allowed: true, hosted_required: false, model_invoked: false };
      } });
    const persist = () => fs.writeFileSync(reportPath, JSON.stringify({ schema: "casimirbot.private_clock_startup_comparison.v1",
      capturedAt: new Date().toISOString(), userDataPath, runtime, preparation, results,
      diagnosticsOnly: true, accountReaders: "controlled fixtures", deadlineMs: 5000,
      phaseTimes: "filesystem notifications may coalesce; elapsed since each explicit request" }, null, 2) + "\n");
    try {
      expect(await host.installer.install()).toMatchObject({ status: "installed_stopped", runtimeAvailable: false });
      if (preparation === "pre-staged") {
        const owner = { profileId: account.profileId, deviceId: identity.device_id };
        const review = { ...PRIVATE_CLOCK_INSTALL_REVIEW, schema: "casimirbot.environment_package_review.v1" as const, privateOnly: true as const };
        const store = new EnvironmentPackageInstallationStore({ userDataPath,
          authorize: async who => { expect(who).toEqual(owner); }, stopAndFence: async () => { throw Error("diagnostic read must not mutate installation"); } });
        const entry = await store.resolveNativeEntry(owner, review);
        const staging = new EnvironmentClockNativeStaging({ userDataPath, owner, review, runtimePath: runtime.executable, runtimeSha256: runtime.sha256 });
        const preparedRoot = original.call(staging, entry.entryPath);
        // File preparation only: no helper/profile/clock request has run.
        expect(fs.existsSync(path.join(preparedRoot, "clock-isolation.journal"))).toBe(false);
        expect(fs.existsSync(path.join(preparedRoot, "clock-isolation.lock"))).toBe(false);
        expect(host.status()).toMatchObject({ running: false, fenced: false });
      }
      for (const mode of ["first-use", "reused"] as const) {
        // Two deliberately distinct requests, never an automatic replay of an
        // uncertain observation. A prior failure is retained and fails this test.
        events = []; start = Date.now();
        const request = { schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, probe_request_id: `probe:startup-${randomUUID()}`,
          capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, catalog_snapshot_id: "catalog:private-clock",
          arguments: { clock: "monotonic" }, constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
          created_at: new Date(start).toISOString(), deadline_at: new Date(start + 5000).toISOString(),
          assistant_answer: false, raw_content_included: false };
        let outcome = "succeeded", code: string | undefined;
        try { expect((await host.observe(request)).result.outcome).toBe("succeeded"); }
        catch (error: any) { outcome = "failed"; code = error.code ?? "test_error"; }
        const elapsedMs = Date.now() - start;
        watch?.close(); watch = undefined;
        const status = host.status();
        const phase = leaseRoot ? fs.readFileSync(path.join(leaseRoot, "clock-isolation.journal"), "utf8").split("\n")[3] : null;
        const record: Record<string, unknown> = { mode, requestId: request.probe_request_id, outcome, code, elapsedMs,
          events: [...events], leaseRoot, leasePhase: phase, status };
        results.push(record); persist();
        expect(status).toMatchObject({ admissionPending: false, running: false, fenced: false });
        expect(phase).toBe("cleaned");
        const history = await host.recoverObservation(request);
        record.history = history; persist();
        expect(history.fresh).toBe(false);
        expect(history.state).toBe(outcome === "succeeded" ? "accepted" : "uncertain");
      }
      expect(results.map(r => r.outcome)).toEqual(["succeeded", "succeeded"]);
    } finally {
      observer.mockRestore(); watch?.close();
      try { await host.close(); } finally { persist(); }
    }
  }, 30000);
});
