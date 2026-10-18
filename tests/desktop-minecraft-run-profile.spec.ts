import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearDesktopMinecraftRunProfile,
  inspectDesktopMinecraftRunProfile,
  saveDesktopMinecraftRunProfile,
  saveDesktopMinecraftPlayerGameDirectory,
} from "../apps/desktop/src/minecraft-run-profile";

describe("desktop Minecraft run profile", () => {
  let root: string | null = null;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it("persists and clears an exact profile-owned dedicated server selection", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "desktop-minecraft-profile-"));
    const userDataPath = path.join(root, "user-data");
    const runDirectory = path.join(root, "combat-c0-server");
    const playerGameDirectory = path.join(root, ".minecraft-helix-c0");
    await mkdir(path.join(runDirectory, "config"), { recursive: true });
    await writeFile(path.join(runDirectory, "server.properties"), "server-port=25566\n");
    await mkdir(path.join(playerGameDirectory, "config"), { recursive: true });
    await mkdir(path.join(playerGameDirectory, "mods"), { recursive: true });

    expect(inspectDesktopMinecraftRunProfile({
      userDataPath,
      ownerProfileId: "profile:owner",
    }).configured).toBe(false);
    expect(saveDesktopMinecraftRunProfile({
      userDataPath,
      ownerProfileId: "profile:owner",
      runDirectory,
    })).toMatchObject({
      configured: true,
      label: "combat-c0-server",
      runDirectory: path.win32.resolve(runDirectory),
      playerGameDirectory: null,
    });
    expect(saveDesktopMinecraftPlayerGameDirectory({
      userDataPath,
      ownerProfileId: "profile:owner",
      playerGameDirectory,
    })).toMatchObject({
      configured: true,
      runDirectory: path.win32.resolve(runDirectory),
      playerGameDirectory: path.win32.resolve(playerGameDirectory),
    });
    expect(inspectDesktopMinecraftRunProfile({
      userDataPath,
      ownerProfileId: "profile:other",
    }).configured).toBe(false);
    expect(clearDesktopMinecraftRunProfile({
      userDataPath,
      ownerProfileId: "profile:owner",
    }).configured).toBe(false);
  });
});
