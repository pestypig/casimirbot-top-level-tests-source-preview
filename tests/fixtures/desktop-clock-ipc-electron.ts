import { app, BrowserWindow, ipcMain, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrivateEnvironmentDesktopOwner } from "../../apps/desktop/src/environment-private-desktop-owner";
import { NativePrivateClockHost } from "../../apps/desktop/src/environment-private-clock-host";
import { PrivateEnvironmentLifecycle } from "../../apps/desktop/src/environment-private-lifecycle";
import { createPrivateClockIpcHandlers } from "../../apps/desktop/src/environment-private-clock-ipc";
import { loadPrivatePreparedClockRuntimeArtifacts } from "../../apps/desktop/src/environment-private-runtime-artifacts";
import { PRIVATE_CLOCK_INSTALL_REVIEW as review, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_PROFILE, PRIVATE_CLOCK_RUNTIME_REVISION } from "../../shared/environment-private-runtime";
import * as channels from "../../apps/desktop/src/channels";

const root = path.dirname(process.argv[1]), input = JSON.parse(fs.readFileSync(path.join(root, "input.json"), "utf8"));
const resultPath = path.join(root, "result.json"), page = pathToFileURL(path.join(root, "fixture.html")).href;
app.setPath("userData", input.userData); app.disableHardwareAcceleration();
const account = { profileId: "profile:electron-clock-ipc", sessionId: "account_session:electron-clock-ipc-fixture", accountType: "developer" as const };
const deviceId = `desktop_device_${"e".repeat(22)}`;
const identity = () => ({ profile_id: account.profileId, device_id: deviceId,
  session_ref: createHash("sha256").update(account.sessionId).digest("hex"), artifact_sha256: review.archiveSha256,
  review_revision: review.policyRevision, credential_included: false, public_release: false });
let window: BrowserWindow, host: NativePrivateClockHost, owner: PrivateEnvironmentDesktopOwner<Electron.Session>;
let admitted = true, accountAvailable = true, accountReads = 0, report: Record<string, unknown> | undefined;
const failures: string[] = [];
let revokeDone!: () => void; const revoked = new Promise<void>(resolve => { revokeDone = resolve; });
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error: any) { if (error.code === "ESRCH") return false; throw error; } };
const lifecycle = new PrivateEnvironmentLifecycle<Electron.Session>({ owner: () => owner,
  beginQuit: () => {}, resumeQuit: () => app.quit(), recordFailure: code => failures.push(code) });
const fail = (code: string) => { fs.writeFileSync(resultPath, JSON.stringify({ passed: false, code })); app.exit(1); };
setTimeout(() => fail("fixture_timeout"), 50000).unref();
app.on("before-quit", event => {
  if (!lifecycle.beforeQuit(event)) return;
  fs.writeFileSync(resultPath, JSON.stringify({ ...report, cleanup: lifecycle.status(), failures }, null, 2));
  if (!report?.passed || lifecycle.status().quit !== "clean" || failures.length) app.exit(1);
});
void app.whenReady().then(async () => {
  const artifacts = loadPrivatePreparedClockRuntimeArtifacts(input.runtimeDirectory);
  owner = new PrivateEnvironmentDesktopOwner<Electron.Session>({ createOwner: access => {
    host = new NativePrivateClockHost({ userDataPath: input.userData, deviceId, runtime: artifacts.runtime,
      preparedHelper: artifacts.preparedHelper, runtimeEnabled: () => admitted, ...access });
    return { installer: host.installer, clock: host };
  }, accessForSession: current => {
    if (current !== session.defaultSession) throw Error("fixture_session_rejected");
    return { featureEnabled: () => true,
      readAccount: async () => { accountReads++; if (!accountAvailable) throw Error("fixture_signed_out"); return { ...account }; },
      readPolicy: async () => ({ ...identity(), schema: "casimirbot.private_environment_install_policy.v1",
        policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: review.expiresAt, install_allowed: true, runtime_allowed: false }),
      readRuntimePolicy: async () => { const now = Date.now(); return { ...identity(), schema: "casimirbot.private_clock_runtime_policy.v1",
        policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION, issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30000).toISOString(),
        runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE, capability_id: "com.casimirbot.system.clock.read", runtime_allowed: true, hosted_required: false, model_invoked: false }; },
      selectArchive: async () => input.archive };
  } });
  const installed = await owner.install(session.defaultSession);
  if (installed.status !== "installed_stopped") throw Error("fixture_install_failed");
  window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, "preload.cjs"), sandbox: true,
    contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  const handlers = createPrivateClockIpcHandlers<Electron.Session>({ mainSender: () => window.webContents,
    isTrustedUrl: url => url === page, runtimeAdmitted: () => admitted, owner: () => owner });
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_PREPARE_CHANNEL, handlers.prepare);
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_OBSERVE_CHANNEL, handlers.observe);
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_HISTORY_CHANNEL, handlers.history);
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_STOP_CHANNEL, handlers.stop);
  ipcMain.handle(channels.DESKTOP_PRIVATE_ENVIRONMENT_INVALIDATE_CHANNEL, async (event, ...args: unknown[]) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page || args.length)
      throw Error("fixture_sender_rejected");
    const result = await lifecycle.invalidate(event.sender.session); revokeDone(); return result;
  });
  await window.loadURL(page);
  const journey = await window.webContents.executeJavaScript(`(async () => {
    const bridge = window.casimirDesktop, started = Date.now();
    const ready = await bridge.preparePrivateClock(), preparationMs = Date.now() - started;
    const now = Date.now(), request = { schema: "helix.environment_connector.probe_request.v1",
      probe_request_id: "probe:electron-ipc-" + now, capability_id: "com.casimirbot.system.clock.read", capability_version: 1,
      catalog_snapshot_id: "catalog:electron-ipc", arguments: { clock: "monotonic" },
      constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
      created_at: new Date(now).toISOString(), deadline_at: new Date(now + 5000).toISOString(), assistant_answer: false, raw_content_included: false };
    const at = Date.now(), receipt = await bridge.observePrivateClock(request), observationMs = Date.now() - at;
    const history = await bridge.recoverPrivateClockObservation(request);
    let invalidDenied = false;
    try { await bridge.observePrivateClock({ ...request, executable: "untrusted.exe" }); }
    catch (error) { invalidDenied = String(error).includes("private_clock_ipc_request_invalid"); }
    await bridge.stopPrivateClock();
    return { ready, preparationMs, observationMs, receipt, history, invalidDenied };
  })()`);
  if (journey.history.fresh !== false || JSON.stringify(journey.history.receipt) !== JSON.stringify(journey.receipt) || !journey.invalidDenied)
    throw Error("fixture_journey_failed");
  admitted = false;
  const denied = await window.webContents.executeJavaScript(`(async () => {
    let denied = false; try { await window.casimirDesktop.preparePrivateClock(); }
    catch (error) { denied = String(error).includes("private_runtime_not_qualified"); }
    await window.casimirDesktop.stopPrivateClock(); return denied;
  })()`);
  if (!denied) throw Error("fixture_default_admission_failed");
  admitted = true; await window.webContents.executeJavaScript("window.casimirDesktop.preparePrivateClock()");
  const pid = host!.status().pid!, reads = accountReads; accountAvailable = false;
  await window.webContents.executeJavaScript('window.dispatchEvent(new Event("helix-account-capability-policy-changed"))');
  await revoked;
  if (alive(pid) || reads !== accountReads) throw Error("fixture_revocation_failed");
  report = { passed: true, journey, disabledAdmissionDenied: denied, stopWhenDisabled: true,
    revokedChildAbsent: true, noAdditionalAccountReadOnRevocation: true, artifacts };
  app.quit();
}).catch(() => fail("fixture_journey_or_start_failed"));
