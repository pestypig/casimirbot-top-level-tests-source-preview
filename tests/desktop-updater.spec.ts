import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    handlers,
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: true,
      allowDowngrade: true,
      disableWebInstaller: false,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      }),
      checkForUpdates: vi.fn(async () => ({})),
      downloadUpdate: vi.fn(async () => []),
      quitAndInstall: vi.fn(),
    },
  };
});

vi.mock("electron", () => ({ app: { getVersion: () => "0.1.0", getPath: () => "C:/ignored-user-data", isPackaged: true } }));

import { DesktopUpdateController } from "../apps/desktop/src/updater";
import { getDesktopUpdatePublisher, isEligibleDesktopUpdateInstall } from "../apps/desktop/src/updater";
import { verifyDesktopUpdateCandidate } from "../apps/desktop/src/desktop-update-manifest";

const mockBridge = updaterMock.autoUpdater as unknown as ConstructorParameters<
  typeof DesktopUpdateController
>[4];
const journalPaths: string[] = [];
let stagedInstallerPath = "";
const stagedBytes = "signed installer bytes";
const stagedSha256 = createHash("sha256").update(stagedBytes).digest("hex");
const binaryRepository = "pestypig/casimirbot-desktop-releases";
const newJournalPath = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "casimir-updater-test-"));
  const filePath = path.join(root, `${randomUUID()}.json`);
  journalPaths.push(root);
  return filePath;
};
const createController = (
  packaged: boolean,
  publish: (state: unknown) => void,
  feedConfigured: boolean,
  version = "0.1.0",
  journalPath = newJournalPath(),
) => new DesktopUpdateController(
  packaged,
  publish as never,
  feedConfigured,
  version,
  mockBridge,
  binaryRepository,
  journalPath,
  async (candidate: Parameters<typeof verifyDesktopUpdateCandidate>[0]) => ({
    fileName: `CasimirBot-${candidate.version}-x64-setup.exe`,
    sha256: stagedSha256,
    version: candidate.version,
  }),
  () => "CasimirBot LLC",
);

describe("DesktopUpdateController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    updaterMock.handlers.clear();
    updaterMock.autoUpdater.checkForUpdates.mockResolvedValue({});
    const root = mkdtempSync(path.join(os.tmpdir(), "casimir-staged-installer-"));
    journalPaths.push(root);
    stagedInstallerPath = path.join(root, "CasimirBot-0.1.1-x64-setup.exe");
    writeFileSync(stagedInstallerPath, stagedBytes);
    updaterMock.autoUpdater.downloadUpdate.mockResolvedValue([stagedInstallerPath]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const journalPath of journalPaths.splice(0)) rmSync(journalPath, { recursive: true, force: true });
  });

  it("does not offer or schedule updates for an unpacked package without a feed", async () => {
    const controller = createController(true, vi.fn(), false);
    controller.initialize();

    expect(controller.getState().phase).toBe("unavailable");
    expect(controller.getState().canCheck).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(updaterMock.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("does not enable native updating for an unpackaged build even if a feed exists", () => {
    const controller = createController(false, vi.fn(), true);
    controller.initialize();

    expect(controller.getState().phase).toBe("unavailable");
    expect(controller.getState().canCheck).toBe(false);
    expect(updaterMock.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("checks automatically but requires explicit download and install choices", async () => {
    const publish = vi.fn();
    const controller = createController(true, publish, true);
    controller.initialize();

    expect(updaterMock.autoUpdater.autoDownload).toBe(false);
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(updaterMock.autoUpdater.allowPrerelease).toBe(false);
    expect(updaterMock.autoUpdater.allowDowngrade).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(updaterMock.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    updaterMock.handlers.get("update-available")?.({ version: "0.1.1", files: [] });
    expect(controller.getState()).toMatchObject({
      phase: "available",
      availableVersion: "0.1.1",
      canDownload: true,
      canInstall: false,
    });

    expect(updaterMock.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    await controller.download();
    expect(updaterMock.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);

    expect(controller.getState()).toMatchObject({ phase: "downloaded", canInstall: true });
    expect(publish).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
    expect(updaterMock.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    // No updater callback or automatic close behavior may install it.
    expect(updaterMock.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    controller.install();
    expect(updaterMock.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("uses published GitHub release discovery for prefixed alpha tags", () => {
    updaterMock.autoUpdater.allowPrerelease = true;
    const controller = createController(true, vi.fn(), true, "0.1.0-alpha.11");
    controller.initialize();

    expect(updaterMock.autoUpdater.allowPrerelease).toBe(false);
    expect(controller.getState()).toMatchObject({ phase: "idle", canCheck: true });
  });

  it("refuses to enable installation when staged bytes differ from the signed manifest", async () => {
    writeFileSync(stagedInstallerPath, "corrupted installer bytes");
    const controller = createController(true, vi.fn(), true);
    controller.initialize();
    updaterMock.handlers.get("update-available")?.({ version: "0.1.1", files: [] });

    await controller.download();

    expect(controller.getState()).toMatchObject({
      phase: "error",
      errorCode: "checksum_verification_failed",
      canInstall: false,
    });
    expect(updaterMock.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("retries a failed background check at the periodic interval", async () => {
    updaterMock.autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error("ECONNRESET"));
    const controller = createController(true, vi.fn(), true);
    controller.initialize();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(controller.getState()).toMatchObject({
      phase: "error",
      errorCode: "update_network_error",
      canCheck: true,
    });
    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
    expect(updaterMock.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("requires a packaged Windows build with the exact signed binary feed", () => {
    const config = [
      "provider: github",
      "owner: pestypig",
      "repo: casimirbot-desktop-releases",
      "publisherName:",
      "  - CasimirBot LLC",
    ].join("\n");
    const eligible = {
      packaged: true,
      platform: "win32",
      resourcesPath: "C:/install/resources",
      expectedBinaryRepository: binaryRepository,
      appUpdateConfig: config,
    };
    expect(isEligibleDesktopUpdateInstall(eligible)).toBe(true);
    expect(isEligibleDesktopUpdateInstall({ ...eligible, packaged: false })).toBe(false);
    expect(isEligibleDesktopUpdateInstall({ ...eligible, platform: "linux" })).toBe(false);
    expect(isEligibleDesktopUpdateInstall({ ...eligible, expectedBinaryRepository: "pestypig/casimirbot-" })).toBe(false);
    expect(isEligibleDesktopUpdateInstall({ ...eligible, appUpdateConfig: config.replace("CasimirBot LLC", "") })).toBe(false);
    expect(getDesktopUpdatePublisher(config)).toBe("CasimirBot LLC");
  });

  it("journals restart handoff and reports when the previous version returns", async () => {
    const journalPath = newJournalPath();
    const controller = createController(true, vi.fn(), true, "0.1.0", journalPath);
    controller.initialize();
    updaterMock.handlers.get("update-available")?.({ version: "0.1.1" });
    await controller.download();

    controller.install();

    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({
      schema: "casimir_desktop_update_handoff/1",
      fromVersion: "0.1.0",
      toVersion: "0.1.1",
    });
    const relaunched = createController(true, vi.fn(), true, "0.1.0", journalPath);
    relaunched.initialize();
    expect(relaunched.getState()).toMatchObject({
      phase: "error",
      errorCode: "update_install_incomplete",
      availableVersion: "0.1.1",
    });
    expect(updaterMock.autoUpdater.allowDowngrade).toBe(false);
  });
});
