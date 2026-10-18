import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrivateEnvironmentLifecycle } from "../../apps/desktop/src/environment-private-lifecycle";
import { DESKTOP_PRIVATE_ENVIRONMENT_INVALIDATE_CHANNEL } from "../../apps/desktop/src/channels";

const root = path.dirname(process.argv[1]), resultPath = path.join(root, "result.json");
app.setPath("userData", path.join(root, "profile"));
app.disableHardwareAcceleration();
const page = pathToFileURL(path.join(root, "fixture.html")).href;
let window: BrowserWindow, stopCalls = 0, closeCalls = 0, quitCalls = 0, cleanupComplete = false;
let resumedAfterCleanup = false, mainFrameNavigation = false, payloadCount = -1;
const failures: string[] = [];
let revoked!: () => void; const revocation = new Promise<void>(resolve => { revoked = resolve; });
const lifecycle = new PrivateEnvironmentLifecycle<Electron.Session>({
  owner: () => ({ stop: async session => {
    if (session !== window.webContents.session) throw Error("fixture_session_mismatch"); stopCalls++; revoked();
  }, close: async () => { closeCalls++; await new Promise(resolve => setTimeout(resolve, 25)); cleanupComplete = true; } }),
  beginQuit: () => {}, resumeQuit: () => { resumedAfterCleanup = cleanupComplete; app.quit(); }, recordFailure: code => failures.push(code),
});
const fail = (code: string) => { fs.writeFileSync(resultPath, JSON.stringify({ passed: false, code })); app.exit(1); };
setTimeout(() => fail("fixture_timeout"), 35000).unref();
app.on("before-quit", event => {
  quitCalls++;
  if (!lifecycle.beforeQuit(event)) return;
  const passed = stopCalls === 1 && closeCalls === 1 && quitCalls >= 3 && cleanupComplete && resumedAfterCleanup &&
    mainFrameNavigation && payloadCount === 0 && failures.length === 0 && lifecycle.status().quit === "clean";
  fs.writeFileSync(resultPath, JSON.stringify({ passed, stopCalls, closeCalls, quitCalls, cleanupComplete,
    resumedAfterCleanup, mainFrameNavigation, payloadCount, failures, lifecycle: lifecycle.status() }, null, 2));
  if (!passed) app.exit(1);
});
void app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, "preload.cjs"), sandbox: true,
    contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("did-start-navigation", details => { if (details.isMainFrame) mainFrameNavigation = true; });
  ipcMain.handle(DESKTOP_PRIVATE_ENVIRONMENT_INVALIDATE_CHANNEL, (event, ...args: unknown[]) => {
    if (event.sender !== window.webContents || event.senderFrame?.url !== page || args.length) throw Error("fixture_sender_rejected");
    payloadCount = args.length; return lifecycle.invalidate(event.sender.session);
  });
  await window.loadURL(page);
  await window.webContents.executeJavaScript(`(() => {
    const event = new Event("helix-account-capability-policy-changed");
    Object.defineProperty(event, "detail", { get() { throw new Error("untrusted_detail_read"); } });
    window.dispatchEvent(event);
  })()`);
  await revocation;
  app.quit(); app.quit();
}).catch(() => fail("fixture_start_or_event_failed"));
