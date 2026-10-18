import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe.skipIf(process.platform !== "win32")("CS4 saved Fabric server OS provider", () => {
  it("O5 executes the real provider with isolated files and process fixtures across recovery and denials", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "minecraft-server-lifecycle-fixture-"));
    const powershell = path.join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const digest = createHash("sha256").update(path.join(root, "mutex_busy").toLowerCase()).digest("hex");
    const holder = execFile(powershell, ["-NoProfile", "-NonInteractive", "-File",
      path.resolve("tests/fixtures/minecraft-server-mutex-holder.ps1"), "-MutexName", `Local\\CasimirBotFabricServer-${digest}`],
      { windowsHide: true, timeout: 35_000 });
    const holderClosed = new Promise<void>(resolve => holder.once("close", () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("fixture_mutex_ready_timeout")), 5000);
        holder.once("error", error => { clearTimeout(timer); reject(error); });
        holder.stdout!.on("data", data => { if (data.toString().includes("fixture_mutex_ready")) { clearTimeout(timer); resolve(); } });
      });
      const result = await promisify(execFile)(path.join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
          path.resolve("tests/fixtures/minecraft-local-server-lifecycle.ps1"),
          "-FixtureRoot", root, "-ProviderScript", path.resolve("scripts/helix-minecraft-start-fabric-server.ps1")],
        { windowsHide: true, timeout: 30_000, maxBuffer: 128 * 1024, encoding: "utf8" });
      const payload = JSON.parse(result.stdout);
      const cases = new Map<string, any>(payload.results.map((row: any) => [row.case, row]));
      expect(cases.size).toBe(17);
      expect(cases.get("start_reuse")).toMatchObject({ spawns: 1,
        first: { ok: true, server: { status: "listening", launcher_action: "launched_server", authority_widened: false } },
        second: { ok: true, server: { launcher_action: "reused_server" } } });
      expect(cases.get("timeout_reconcile")).toMatchObject({ spawns: 1,
        first: { ok: false, error: "minecraft_server_start_timeout", server: { status: "starting" } },
        second: { ok: true, server: { launcher_action: "reused_server" } } });
      expect(cases.get("exit_before_ready")).toMatchObject({ spawns: 1,
        first: { ok: false, error: "minecraft_server_exited_before_ready", server: { status: "stopped" } } });
      expect(cases.get("unknown_outcome")).toMatchObject({ spawns: 1,
        first: { ok: false }, second: { ok: false, error: "minecraft_server_start_outcome_unknown" } });
      expect(cases.get("pid_reuse")).toMatchObject({ spawns: 1,
        first: { ok: true }, second: { ok: false, error: "minecraft_server_port_owner_unverified" } });
      for (const [name, error] of Object.entries({ port_conflict: "minecraft_server_port_owner_unverified",
        wrong_port: "minecraft_server_address_mismatch", remote_bind: "minecraft_server_loopback_configuration_required",
        missing_eula: "minecraft_server_eula_acceptance_required", duplicate_eula: "minecraft_server_eula_acceptance_required",
        escaped_property: "minecraft_server_properties_ambiguous", corrupt_state: "minecraft_server_state_invalid",
        uppercase_ip: "minecraft_server_loopback_configuration_required", uppercase_eula: "minecraft_server_eula_acceptance_required",
        memory_ceiling: "minecraft_server_launch_memory_ceiling", mutex_busy: "minecraft_server_lifecycle_busy",
        missing_java: "minecraft_launcher_java21_required" })) {
        expect(cases.get(name), name).toMatchObject({ spawns: 0, first: { ok: false, error } });
      }
      expect(result.stdout).not.toContain(root);
      expect(result.stdout).not.toContain("fixture_lost_start_reply");
      expect(result.stdout).not.toContain("fixture-private-property");
    } finally {
      holder.stdin?.end("\n");
      await holderClosed;
      if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("minecraft-server-lifecycle-fixture-")) {
        throw new Error("fixture_cleanup_target_invalid");
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);
});
