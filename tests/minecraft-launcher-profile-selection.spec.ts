import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe.skipIf(process.platform !== "win32")("current Launcher selection admission", () => {
  it("uses the real exact-profile guard with isolated public UI observations", async () => {
    const { stdout } = await promisify(execFile)(path.join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
        path.resolve("tests/fixtures/minecraft-launcher-profile-selection.ps1"), "-ProviderScript",
        path.resolve("scripts/helix-minecraft-launch-fabric-loopback.ps1")],
      { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024, encoding: "utf8" });
    const cases = new Map<string, any>(JSON.parse(stdout).cases.map((row: any) => [row.case, row]));
    expect(cases.size).toBe(12);
    expect(cases.get("current_selection")).toEqual({ case: "current_selection", ok: true });
    expect(cases.get("multiline_selection")).toEqual({ case: "multiline_selection", ok: true });
    for (const name of ["wrong_profile", "wrong_version", "missing", "ambiguous", "case_mismatch", "populated_wrong_profile"]) {
      expect(cases.get(name)).toMatchObject({ ok: false, error: "minecraft_fabric_profile_selection_required" });
    }
    expect(cases.get("wrong_process")).toMatchObject({ ok: false, error: "minecraft_launcher_profile_window_mismatch" });
    expect(cases.get("unavailable")).toMatchObject({ ok: false, error: "minecraft_launcher_profile_observation_unavailable" });
    expect(cases.get("empty_observation")).toMatchObject({ ok: false, error: "minecraft_launcher_profile_observation_unavailable" });
    expect(cases.get("window_frame_loading")).toMatchObject({ ok: false, error: "minecraft_launcher_profile_loading" });
    expect(stdout).not.toContain("fixture_private_observation_failure");
  });
});
