import fs from "node:fs";
import path from "node:path";
import { EnvironmentClockObservationJournal, type ClockObservationContext } from "../../apps/desktop/src/environment-clock-observation-journal";
import { HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA,
  HELIX_SYSTEM_CLOCK_READ_CAPABILITY, type HelixEnvironmentConnectorProbeResult } from "../../shared/helix-environment-connector";

export const crashTime = new Date("2026-09-26T12:00:00.000Z");
export const crashContext = (): ClockObservationContext => ({
  owner: { profileId: "profile:process-crash-fixture", deviceId: "device:process-crash-fixture" },
  installation: { schema: "casimirbot.environment_package_installation.v1",
    installationRef: "environment_installation:00000000-0000-4000-8000-000000000001",
    profileId: "profile:process-crash-fixture", deviceId: "device:process-crash-fixture",
    packageId: "com.casimirbot.system.clock", version: "1.0.0-private.1", artifactSha256: "a".repeat(64),
    policyRevision: "fixture:process-crash", installedAt: crashTime.toISOString(), status: "installed_stopped",
    connected: false, granted: false, runtimeLaunchable: false },
  request: { schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, probe_request_id: "probe:process-crash",
    capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, catalog_snapshot_id: "catalog:crash",
    arguments: { clock: "monotonic" }, constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
    created_at: crashTime.toISOString(), deadline_at: new Date(+crashTime + 5000).toISOString(),
    assistant_answer: false, raw_content_included: false },
});
export const crashResult = (): HelixEnvironmentConnectorProbeResult => ({
  schema: HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA, probe_request_id: crashContext().request.probe_request_id,
  capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, outcome: "succeeded",
  summary: "Controlled crash-history fixture; not an actual clock observation", result: { uptime_ms: 42 },
  side_effects_performed: false, commands_executed: [], environment_mutation_performed: false,
  deterministic: true, model_invoked: false, assistant_answer: false, raw_content_included: false,
  created_at: crashTime.toISOString(),
});
export const crashExecutionRef = "environment_execution:00000000-0000-4000-8000-000000000002";

if (process.argv[2] === "--crash-fixture") {
  const root = fs.realpathSync(process.argv[3]), boundary = process.argv[4];
  if (!path.basename(root).startsWith("case-") ||
      !["reservation", "claim", "pending", "accepted"].includes(boundary)) throw Error("fixture_scope_invalid");
  const pause = () => {
    fs.writeFileSync(path.join(root, "boundary.json"), JSON.stringify({ boundary, pid: process.pid }), { flag: "wx" });
    // The parent kills this exact child after observing the synchronized boundary.
    // Finite wait prevents a leaked child if the test controller itself fails.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000);
    process.exit(71);
  };
  if (boundary === "reservation") {
    const original = fs.mkdirSync;
    fs.mkdirSync = ((...args: Parameters<typeof fs.mkdirSync>) => {
      const result = original(...args);
      if (path.relative(root, String(args[0])).split(path.sep).length === 4) pause();
      return result;
    }) as typeof fs.mkdirSync;
  }
  if (boundary === "pending") {
    const original = fs.renameSync;
    fs.renameSync = (source, destination) => {
      if (path.basename(String(source)) === "accepted.pending") pause();
      original(source, destination);
    };
  }
  const journal = new EnvironmentClockObservationJournal(root);
  const ticket = journal.begin(crashContext(), crashExecutionRef, 7);
  if (boundary === "claim") pause();
  const receipt = journal.commit(ticket, crashResult());
  if (boundary === "accepted") pause();
  fs.writeFileSync(path.join(root, "delivered.json"), JSON.stringify(receipt), { flag: "wx" });
}
