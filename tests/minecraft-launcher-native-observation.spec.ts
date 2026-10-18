import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe.skipIf(process.platform !== "win32")("real Windows Launcher observation port", () => {
  it("reads an isolated native fixture and excludes disabled controls", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "casimir-launcher-observation-"));
    const handleFile = path.join(root, "window.json");
    const powershell = path.join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const fixture = spawn(powershell, ["-NoProfile", "-STA", "-File",
      path.resolve("tests/fixtures/minecraft-launcher-observation-window.ps1"), "-HandleFile", handleFile],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let fixtureError = "";
    fixture.stderr.on("data", chunk => { fixtureError += String(chunk).slice(0, 2000); });
    const closed = new Promise<void>(resolve => fixture.once("close", () => resolve()));
    try {
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (await fs.stat(handleFile).then(() => true, () => false)) { ready = true; break; }
        if (fixture.exitCode !== null) throw new Error(`Isolated fixture exited: ${fixtureError}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(ready).toBe(true);
      const { stdout } = await promisify(execFile)(powershell, ["-NoProfile", "-Mta", "-NonInteractive", "-File",
        path.resolve("tests/fixtures/minecraft-launcher-native-observation.ps1"), "-ProviderScript",
        path.resolve("scripts/helix-minecraft-launch-fabric-loopback.ps1"), "-HandleFile", handleFile],
        { windowsHide: true, timeout: 10_000, encoding: "utf8" });
      const observation = JSON.parse(stdout).observation;
      expect(observation.apartment_state).toBe("MTA");
      expect(observation.button_names).toContain("fixture-selected-profile fabric-loader-fixture");
      expect(observation.button_names).not.toContain("disabled fixture control");
      expect(observation.disabled_button_count).toBeGreaterThanOrEqual(1);
    } finally {
      // Only the child created above is stopped; no process-name matching or
      // user application cleanup. Temp removal is scoped to this mkdtemp root.
      if (fixture.exitCode === null) fixture.kill();
      await closed;
      const temp = path.resolve(os.tmpdir());
      const relative = path.relative(temp, root);
      if (relative.startsWith("casimir-launcher-observation-") && !relative.includes(path.sep)) {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  }, 20_000);
});
