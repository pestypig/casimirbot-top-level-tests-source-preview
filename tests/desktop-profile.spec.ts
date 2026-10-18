import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRIVATE_PROFILE_PIN_FILE, PRIVATE_PROFILE_PIN_SCHEMA, resolveDesktopProfile } from "../apps/desktop/src/desktop-profile";

const fixtures: string[] = [];
afterEach(() => { for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const localAppDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "casimir-profile-test-"));
  fixtures.push(localAppDataPath);
  const root = path.join(localAppDataPath, "CasimirBot-private-validation");
  const profile = path.join(root, "local-mvp-retained");
  fs.mkdirSync(profile, { recursive: true });
  const pinFile = path.join(root, PRIVATE_PROFILE_PIN_FILE);
  const input = { privateLocalMvp: true, localAppDataPath, defaultUserDataPath: path.join(localAppDataPath, "default"), overridePath: null };
  const pin = (profileDirectory: string) => fs.writeFileSync(pinFile, JSON.stringify({ schema: PRIVATE_PROFILE_PIN_SCHEMA, profileDirectory }));
  return { root, profile, pinFile, input, pin };
}
describe("desktop profile continuity", () => {
  it("reuses the same existing profile for direct launch and launcher across builds without touching stored data", () => {
    const f = fixture(); f.pin("local-mvp-retained");
    fs.writeFileSync(path.join(f.profile, "saved-data-sentinel"), "unchanged fixture");
    const direct = resolveDesktopProfile(f.input);
    const launcher = resolveDesktopProfile({ ...f.input, overridePath: f.profile });
    expect(direct).toEqual(launcher);
    expect(direct.userDataPath).toBe(fs.realpathSync(f.profile));
    expect(direct.windowTitle).toContain("Private preview · local-mvp-retained");
    expect(fs.readFileSync(path.join(f.profile, "saved-data-sentinel"), "utf8")).toBe("unchanged fixture");
    expect(fs.existsSync(f.input.defaultUserDataPath)).toBe(false);
  });
  it("keeps an explicit isolated test separate without changing the retained selection", () => {
    const f = fixture(); f.pin("local-mvp-retained");
    const isolated = path.join(f.root, "isolated-test"); fs.mkdirSync(isolated);
    const before = fs.readFileSync(f.pinFile, "utf8");
    expect(resolveDesktopProfile({ ...f.input, overridePath: isolated })).toEqual({ userDataPath: isolated, windowTitle: "CasimirBot — Isolated test · isolated-test" });
    expect(fs.readFileSync(f.pinFile, "utf8")).toBe(before);
    expect(resolveDesktopProfile(f.input).userDataPath).toBe(fs.realpathSync(f.profile));
  });
  it("does not fall back to an empty profile when a private selection is absent or lost", () => {
    const f = fixture();
    expect(() => resolveDesktopProfile(f.input)).toThrow("No private preview profile selected");
    f.pin("missing");
    expect(() => resolveDesktopProfile(f.input)).toThrow("Saved private preview profile is missing");
    expect(fs.existsSync(f.input.defaultUserDataPath)).toBe(false);
    expect(fs.existsSync(path.join(f.root, "missing"))).toBe(false);
  });
  it.each(["../other", "..", "C:\\other", "nested/other", "\\\\server\\share"])("rejects invalid pinned directory %s", directory => {
    const f = fixture(); f.pin(directory);
    expect(() => resolveDesktopProfile(f.input)).toThrow("profile record is invalid");
  });
  it("rejects a junction escaping the profile root", () => {
    const f = fixture(); const outside = path.join(f.input.localAppDataPath, "outside"); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(f.root, "linked"), "junction"); f.pin("linked");
    expect(() => resolveDesktopProfile(f.input)).toThrow("must stay inside");
  });
  it("preserves the installed application's existing default without consulting private pins", () => {
    const f = fixture(); fs.writeFileSync(f.pinFile, "invalid private test data");
    expect(resolveDesktopProfile({ ...f.input, privateLocalMvp: false })).toEqual({ userDataPath: f.input.defaultUserDataPath, windowTitle: "CasimirBot" });
  });
});
