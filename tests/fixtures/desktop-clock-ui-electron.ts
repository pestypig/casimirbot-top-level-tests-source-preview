import { app, BrowserWindow, ipcMain, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseActiveDesktopAccount } from "../../apps/desktop/src/active-account-session";
import { createPrivateRemovalIpcHandlers } from "../../apps/desktop/src/environment-private-removal-ipc";
import { PRIVATE_CLOCK_INSTALL_REVIEW } from "../../shared/environment-private-install";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createPrivateEnvironmentAppOwner, readPrivateEnvironmentAccount, readPrivateEnvironmentPolicy } from "../../apps/desktop/src/environment-private-app";
import { NativePrivateClockHost } from "../../apps/desktop/src/environment-private-clock-host";
import { WindowsPreparedClockSession } from "../../apps/desktop/src/environment-clock-prepared-runner";
import { EnvironmentClockNativeStaging } from "../../apps/desktop/src/environment-clock-native-staging";
import { PrivateEnvironmentLifecycle } from "../../apps/desktop/src/environment-private-lifecycle";
import { createPrivateClockIpcHandlers } from "../../apps/desktop/src/environment-private-clock-ipc";
import * as channels from "../../apps/desktop/src/channels";
import { loadPrivatePreparedClockRuntimeArtifacts } from "../../apps/desktop/src/environment-private-runtime-artifacts";

const root = path.dirname(process.argv[1]);
const input = JSON.parse(fs.readFileSync(path.join(root, "input.json"), "utf8"));
const removalMode = input.mode === "removal";
const pickerSwitchMode = input.mode === "picker-account-switch";
const historySwitchMode = input.mode === "history-account-switch";
const connectionRevokeHomeMode = input.mode === "connection-revoke-home";
const connectionRevokeMode = input.mode === "connection-revoke" || connectionRevokeHomeMode;
const connectionMode = input.mode === "connections" || connectionRevokeMode;
const keyboardMode = input.mode === "home-keyboard";
const retiredMode = input.mode === "expired-remove" || input.mode === "withdrawn-remove";
const restartMode = input.mode === "restart-prime" || input.mode === "restart-recover" || retiredMode;
const recovering = input.mode === "restart-recover" || retiredMode;
const flagsEnabled = input.mode !== "withdrawn-remove";
let nativeExpiryDenied = false;
let pickerSelections = 0, nativeSpawnCount = 0;
let confirmRemoval = false;
const removalResults: unknown[] = [], confirmations: unknown[] = [];
let removalEvidence: Record<string, unknown> | undefined;
const keyboardSteps: {name:string;focused:string}[]=[];
app.setPath("userData", input.userData); app.disableHardwareAcceleration();
const resultPath = path.join(root, restartMode ? `result-${input.mode}.json` : "result.json");
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error: any) { if (error.code === "ESRCH") return false; throw error; } };
const latch = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const prepared = latch<number>(), releaseReadiness = latch<void>(), revoked = latch<void>();
const pickerOpened = latch<void>(), releasePicker = latch<void>();
const installResponses: {status:string;error?:string;installationRef?:string}[] = [];
let holdReadiness = false, stage = "startup", closing = false, window: BrowserWindow;
let composition: ReturnType<typeof createPrivateEnvironmentAppOwner<Electron.Session>>;
const children: number[] = [], timings: number[] = [], observations: unknown[] = [], failures: string[] = [];
const historyResponses: { argumentCount: number; value: any }[] = [];
const nativeDiagnostics: unknown[] = [];
const accountTransport: { kind: string; elapsedMs: number; ok: boolean }[] = [];
const timed = async <T,>(kind: string, operation: () => Promise<T>): Promise<T> => {
  const started = Date.now(); try { const result = await operation(); accountTransport.push({ kind, elapsedMs: Date.now() - started, ok: true }); return result; }
  catch (error) { accountTransport.push({ kind, elapsedMs: Date.now() - started, ok: false }); throw error; }
};
const transport = WindowsPreparedClockSession.prototype as unknown as { spawn: (mode: string) => ChildProcessWithoutNullStreams };
const originalSpawn = transport.spawn;
transport.spawn = function (mode) {
  nativeSpawnCount++;
  const started = Date.now(), child = originalSpawn.call(this, mode); let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 4096) stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length); });
  child.once("close", (code, signal) => nativeDiagnostics.push({ mode, code, signal, elapsedMs: Date.now() - started,
    typedErrors: stderr.split(/\r?\n/).filter(line => /^clock_[a-z_]+$/.test(line)) }));
  return child;
};
const originalStage = EnvironmentClockNativeStaging.prototype.prepare;
EnvironmentClockNativeStaging.prototype.prepare = function (entry) {
  const started = Date.now(); try { return originalStage.call(this, entry); }
  finally { nativeDiagnostics.push({ phase: "staging", elapsedMs: Date.now() - started }); }
};
let report: Record<string, unknown> = { passed: false };
const originalPrepare = NativePrivateClockHost.prototype.prepare;
NativePrivateClockHost.prototype.prepare = async function () {
  const started = Date.now(); let result;
  try { result = await originalPrepare.call(this); }
  catch (error) {
    const code = (error as { code?: unknown })?.code;
    nativeDiagnostics.push({ phase: "host_prepare_failed", elapsedMs: Date.now() - started,
      code: typeof code === "string" && /^clock_[a-z_]+$/.test(code) ? code : "untyped" }); throw error;
  }
  const pid = this.status().pid;
  if (!pid || !alive(pid)) throw Error("fixture_prepared_child_missing");
  children.push(pid); timings.push(Date.now() - started);
  if (holdReadiness) { prepared.resolve(pid); await releaseReadiness.promise; }
  return result;
};
const lifecycle = new PrivateEnvironmentLifecycle<Electron.Session>({ owner: () => composition?.owner,
  beginQuit: () => { closing = true; releaseReadiness.resolve(); }, resumeQuit: () => app.quit(), recordFailure: code => failures.push(code) });
app.on("before-quit", event => {
  if (!lifecycle.beforeQuit(event)) return;
  fs.writeFileSync(resultPath, JSON.stringify({ ...report, stage, preparationMs: timings, observations,
    children: children.map(pid => ({ pid, absent: !alive(pid) })), cleanup: lifecycle.status(), failures, nativeDiagnostics, accountTransport,
    removalMode, removalEvidence, removalResults, confirmations, pickerSelections, nativeSpawnCount, hostPid:process.pid,
    historyResponses, installResponses, ...(keyboardMode ? {keyboardSteps} : {}) }, null, 2));
  if (!report.passed || failures.length || lifecycle.status().quit !== "clean") app.exit(1);
});
const fail = async (error: unknown) => {
  const message = error instanceof Error ? error.message : "fixture_unknown";
  report = { passed: false, code: /^[a-z0-9_]+$/.test(message) ? message
    : message.match(/\b(?:clock|private_clock|private_environment|private_runtime)_[a-z0-9_]{1,120}\b/)?.[0] ?? "fixture_unexpected", at: stage };
  if (window && !window.isDestroyed()) {
    report.visibleFailure = await js<string>("document.querySelector('[aria-label=\"Private clock check\"]')?.textContent ?? ''").catch(() => "unavailable");
    fs.writeFileSync(path.join(root, "failure.png"), (await window.webContents.capturePage()).toPNG());
  }
  releaseReadiness.resolve(); releasePicker.resolve(); app.quit();
};
setTimeout(() => fail(Error("fixture_timeout")), removalMode ? 120000 : 80000).unref();
const js = <T,>(code: string) => window.webContents.executeJavaScript(code) as Promise<T>;
const captureCheck = async (name: string) => {
  if(connectionMode || keyboardMode) {
    // Prime a hidden compositor before retaining this fixture's current frame.
    await window.webContents.capturePage();
    // Hidden-window animation clocks can otherwise leave a transient opacity
    // frame. Capture the settled layout; animation timing is not under test.
    await js(`document.getAnimations().forEach(animation=>{if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();})`);
    window.webContents.invalidate();
  }
  // DOM assertions can precede compositor presentation. Frame the result and
  // let it paint before retaining a screenshot as visual evidence.
  await js<void>(`new Promise(resolve => {
    document.querySelector('[aria-label="${name === "removed.png" ? "Local package removal" : "Private clock check"}"]')?.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250)));
  })`);
  fs.writeFileSync(path.join(root, name), (await window.webContents.capturePage()).toPNG());
};
const waitText = (text: string) => js<void>(`new Promise((resolve,reject)=>{
  const until=Date.now()+20000; const tick=()=>{ if(document.body.textContent.includes(${JSON.stringify(text)})) return resolve();
  if(document.querySelector('[role="alert"]')?.textContent)return reject(Error('fixture_ui_error'));
  if(Date.now()>until)return reject(Error('fixture_text_timeout'));setTimeout(tick,50); };tick(); })`);
const click = (name: string) => js<void>(`new Promise((resolve,reject)=>{const until=Date.now()+15000;const tick=()=>{
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)});
  if(button&&!button.disabled){button.click();return resolve();}
  if(Date.now()>until)return reject(Error('fixture_button_unavailable'));setTimeout(tick,50);};tick();})`);
const historyInventory = () => {
  const base = path.join(input.userData, "clock-observations");
  const walk = (folder: string): {path: string;sha256: string}[] => fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry => {
    const file=path.join(folder,entry.name); if(entry.isSymbolicLink())throw Error("fixture_history_link");
    return entry.isDirectory()?walk(file):[{path:path.relative(base,file),sha256:createHash("sha256").update(fs.readFileSync(file)).digest("hex")}];
  });
  return walk(base).sort((a,b)=>a.path.localeCompare(b.path));
};
const requireTrusted = (event: Electron.IpcMainInvokeEvent, args: unknown[]) => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      new URL(event.senderFrame.url).origin !== input.origin || args.length) throw Error("fixture_sender_rejected");
};
void app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) throw Error("fixture_instance_owned");
  const current = session.defaultSession;
  if (!recovering) {
    stage = "local_test_sign_in";
    const signed = await current.fetch(`${input.origin}/api/account/session/sign-in`, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile_id: input.profileId, display_name: "Clock UI fixture", account_type: "developer" }) });
    if (!signed.ok) throw Error("fixture_test_sign_in_failed");
  } else {
    stage = "restart_current_identity";
    const response = await current.fetch(`${input.origin}/api/account/session`, {credentials:"include",cache:"no-store"});
    const account = response.ok ? parseActiveDesktopAccount(await response.json()) : null;
    if(!account || account.profileId!==input.profileId || account.accountType!=="developer") throw Error("fixture_restart_identity_not_recovered");
  }
  if(input.mode === "expired-remove") {
    // Isolated test process only. Timers, Windows time and service time are unchanged.
    const expires = Date.parse(PRIVATE_CLOCK_INSTALL_REVIEW.expiresAt);
    const ActualDate = Date;
    globalThis.Date = new Proxy(ActualDate, {
      construct: (target,args,newTarget) => Reflect.construct(target,args.length ? args : [expires],newTarget),
      apply: () => new ActualDate(expires).toString(),
      get: (target,key,receiver) => key === "now" ? () => expires : Reflect.get(target,key,receiver),
    });
    try { loadPrivatePreparedClockRuntimeArtifacts(input.runtimeDirectory); }
    catch(error) { nativeExpiryDenied = (error as {code?:string}).code === "private_clock_runtime_review_expired"; }
    if(!nativeExpiryDenied) throw Error("fixture_expiry_not_enforced");
  }
  // Do not inspect or export a cookie/session token. Production account parsing
  // consumes the normal response privately for each native operation.
  composition = createPrivateEnvironmentAppOwner<Electron.Session>({ userDataPath: input.userData,
    deviceId: input.deviceId, installExecutable: process.execPath, runtimeDirectory: input.runtimeDirectory,
    homeEnabled: () => flagsEnabled && !closing, runtimeEnabled: () => flagsEnabled && !closing,
    accessForSession: native => ({ featureEnabled: () => flagsEnabled && !closing,
      readAccount: () => timed("private_identity", () => readPrivateEnvironmentAccount({ origin: input.origin,
        fetch: (url, options) => native.fetch(url, options) })),
      readPolicy: () => timed("install_policy", () => readPrivateEnvironmentPolicy({ origin: input.origin, kind: "install", fetch: (url, options) => native.fetch(url, options) })),
      readRuntimePolicy: () => timed("runtime_policy", () => readPrivateEnvironmentPolicy({ origin: input.origin, kind: "runtime", fetch: (url, options) => native.fetch(url, options) })),
      selectArchive: async () => {
        pickerSelections++;
        if (pickerSwitchMode && pickerSelections === 1) { pickerOpened.resolve(); await releasePicker.promise; }
        return input.archive;
      },
      readRemovalAccount: async () => {
        const response = await native.fetch(`${input.origin}/api/account/session`, { method: "GET", credentials: "include", cache: "no-store", signal: AbortSignal.timeout(5000) });
        const account = response.ok ? parseActiveDesktopAccount(await response.json()) : null;
        if (!account) throw Error("fixture_current_account_required"); return account;
      },
      confirmRemoval: async selection => { confirmations.push({ selection, accepted: confirmRemoval }); return confirmRemoval; },
    }),
  });
  window = new BrowserWindow({ show: false, width: 1120, height: 1000, webPreferences: { preload: path.join(root, "preload.cjs"),
    sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
  window.webContents.on("will-navigate", (event, url) => { if (new URL(url).origin !== input.origin) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const handlers = createPrivateClockIpcHandlers<Electron.Session>({ mainSender: () => window.webContents,
    isTrustedUrl: url => new URL(url).origin === input.origin, runtimeAdmitted: composition.runtimeAdmitted, owner: () => composition.owner });
  ipcMain.handle(channels.DESKTOP_PRIVATE_ENVIRONMENT_STATE_CHANNEL, (event, ...args) => { requireTrusted(event, args); return composition.owner.inspect(event.sender.session); });
  ipcMain.handle(channels.DESKTOP_PRIVATE_ENVIRONMENT_INSTALL_CHANNEL, async (event, ...args) => {
    requireTrusted(event, args); const result = await composition.owner.install(event.sender.session);
    installResponses.push(result); return result;
  });
  if (removalMode || restartMode || connectionMode || keyboardMode) {
    const removal = createPrivateRemovalIpcHandlers<Electron.Session>({ mainSender: () => window.webContents,
      isTrustedUrl: url => new URL(url).origin === input.origin, owner: () => composition.owner });
    ipcMain.handle(channels.DESKTOP_PRIVATE_ENVIRONMENT_REMOVAL_STATE_CHANNEL, removal.inspect);
    ipcMain.handle(channels.DESKTOP_PRIVATE_ENVIRONMENT_REMOVE_CHANNEL, async (event, ...args) => {
      const result = await removal.remove(event,...args); removalResults.push(result); return result;
    });
  }
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_PREPARE_CHANNEL, handlers.prepare);
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_OBSERVE_CHANNEL, async (event, ...args) => {
    const start = Date.now();
    try { const receipt = await handlers.observe(event, ...args); observations.push({ request: args[0], receipt, observationMs: Date.now() - start }); return receipt; }
    catch (error) { const code = error instanceof Error ? error.message : "untyped";
      nativeDiagnostics.push({ phase: "observe_failed", elapsedMs: Date.now() - start, code: /^[a-z_]+$/.test(code) ? code : "untyped" }); throw error; }
  });
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_HISTORY_CHANNEL, async (event, ...args) => {
    const value = await handlers.history(event, ...args);
    historyResponses.push({ argumentCount: args.length, value }); return value;
  });
  ipcMain.handle(channels.DESKTOP_PRIVATE_CLOCK_STOP_CHANNEL, handlers.stop);
  ipcMain.handle(channels.DESKTOP_PRIVATE_ENVIRONMENT_INVALIDATE_CHANNEL, async (event, ...args) => {
    requireTrusted(event, args); const stopped = await lifecycle.invalidate(event.sender.session); revoked.resolve(); return stopped;
  });
  if(keyboardMode) {
    stage="home_keyboard_start";
    await window.loadURL(input.origin);
    await waitText("Not installed");
    await waitText("No selected clock package.");
    window.show(); window.focus(); window.webContents.focus();
    await js(`new Promise((resolve,reject)=>{const until=Date.now()+5000;const check=()=>{
      if(document.hasFocus())return resolve();if(Date.now()>until)return reject(Error('fixture_window_focus_unavailable'));setTimeout(check,25);};check();})`);
    const focus = (selector:string) => js<void>(`{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('fixture_focus_target_missing');element.focus();}`);
    const key = async (keyCode:string, shift=false) => {
      const modifiers: Electron.InputEvent["modifiers"] = shift ? ["shift"] : [];
      window.webContents.sendInputEvent({type:"rawKeyDown",keyCode,modifiers});
      if(keyCode==="Enter"||keyCode==="Space")
        window.webContents.sendInputEvent({type:"char",keyCode:keyCode==="Enter"?"\r":" ",modifiers});
      window.webContents.sendInputEvent({type:"keyUp",keyCode,modifiers});
      await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    };
    const expectFocus = async (name:string, selector:string) => {
      const result=await js<{matches:boolean;focused:string}>(`({matches:document.activeElement===document.querySelector(${JSON.stringify(selector)}),
        focused:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim()||document.activeElement?.tagName||'none'})`);
      keyboardSteps.push({name,focused:result.focused});
      if(!result.matches)throw Error(`fixture_keyboard_${name}_focus_wrong`);
    };
    const trigger='button[aria-label="Options for System Clock"]';
    const first='[role="menuitem"]:first-child',last='[role="menuitem"]:last-child';
    const details='[aria-label="System Clock details"]';
    stage="home_keyboard_menu";
    await focus(trigger);await key("Enter");await expectFocus("enter_opens_first",first);
    await key("Down");await expectFocus("down_selects_last",last);
    await key("Enter");await expectFocus("enter_opens_configuration",details);
    await key("Tab");await expectFocus("details_tab_close",`${details} button`);
    await key("Enter");await expectFocus("close_returns_options",trigger);
    await key("Space");await expectFocus("space_opens_first",first);
    await key("End");await expectFocus("end_selects_last",last);
    await key("Home");await expectFocus("home_selects_first",first);
    await key("Tab");await expectFocus("tab_leaves_menu",'article button[data-home-tile-primary]');
    if(await js<boolean>(`Boolean(document.querySelector('[role="menu"]'))`))throw Error("fixture_keyboard_tab_menu_retained");
    await key("Tab",true);await expectFocus("shift_tab_returns_options",trigger);
    await key("Up");await expectFocus("up_opens_last",last);
    await key("Tab",true);await expectFocus("shift_tab_leaves_menu",'[data-home-tile-primary]:nth-child(3)');
    await key("Tab");await expectFocus("tab_reaches_options",trigger);
    await key("Down");await expectFocus("down_opens_first",first);
    // Exercise the same focused menu at another ordinary desktop viewport,
    // allowing Chromium to repaint the full surface before visual inspection.
    window.setSize(1024,900);
    await captureCheck("home-keyboard-menu.png");
    await key("Escape");await expectFocus("escape_returns_options",trigger);
    stage="home_keyboard_controller_coexistence";
    await focus('button[aria-pressed="false"]');await key("Enter");
    await expectFocus("controller_opt_in_focus",'[data-home-tile-primary]');
    await key("Enter");await expectFocus("store_transition_focus",'article button[data-home-tile-primary]');
    await focus(trigger);await key("Enter");await key("Escape");await expectFocus("controller_escape_preserves_options",trigger);
    await key("Enter");await key("End");await key("Enter");await expectFocus("controller_details_focus",details);
    await key("Tab");await key("Enter");await expectFocus("controller_details_return",trigger);
    await key("Enter");await key("Tab");await expectFocus("controller_tab_leaves_menu",'article button[data-home-tile-primary]');
    await captureCheck("home-keyboard-store.png");
    stage="home_keyboard_account_invalidation";
    await focus(trigger);await key("Enter");await expectFocus("before_signout_menu",first);
    const signedOut=await current.fetch(`${input.origin}/api/account/session/sign-out`,{method:"POST",credentials:"include"});
    if(!signedOut.ok)throw Error("fixture_keyboard_signout_failed");
    await js(`window.dispatchEvent(new Event('helix-account-capability-policy-changed'))`);
    await waitText("The private catalog is unavailable.");
    if(await js<boolean>(`Boolean(document.querySelector('[role="menu"], [role="menuitem"], button[aria-pressed="true"]'))`))
      throw Error("fixture_keyboard_authority_ui_retained");
    if(nativeSpawnCount||pickerSelections||observations.length||installResponses.length)throw Error("fixture_keyboard_unexpected_native_action");
    report={passed:true,accountInvalidationClosedMenu:true,noNativeEffects:true,
      inputScope:"Electron sendInputEvent into Chromium, with DOM focus only to position each separate scenario; no physical keyboard or controller",
      identityScope:"disposable local test account, not Auth0",startupScope:"production Home and preload with fixture host/service, not installed/full main"};
    stage="quit";app.quit();return;
  }
  if(connectionRevokeMode) {
    stage="offline_binding_precondition";
    const seeded=await current.fetch(`${input.origin}/fixture/binding`,{method:"POST",credentials:"include"});
    if(!seeded.ok)throw Error("fixture_binding_seed_failed");
    const {bindingRef}=await seeded.json() as {bindingRef:string};
    const readiness=async()=>{
      const response=await current.fetch(`${input.origin}/api/account/session/agent-connections/readiness?client_profile=standard_mcp`,{credentials:"include",cache:"no-store"});
      if(!response.ok)throw Error("fixture_revoke_readiness_unavailable");return await response.json() as any;
    };
    const before=await readiness();
    if(before.oauth_binding_ref!==bindingRef||before.readiness.client_authorization!=="active"||
       before.readiness.client_presence!=="offline"||before.readiness.agent_ready)throw Error("fixture_offline_precondition_wrong");
    await window.loadURL(`${input.origin}/#connections`);await waitText("Not installed");
    if(connectionRevokeHomeMode) {
      await js(`document.querySelector('button[aria-label="Options for System Clock"]').click()`);
      await click("Configure connection");
    } else await js(`document.querySelector('button[aria-label="Configure connection"]').click()`);
    await waitText("AI app to inspect");
    await js(`{const select=document.querySelector('[aria-label="External AI connection"] select');select.value='standard_mcp';select.dispatchEvent(new Event('change',{bubbles:true}));}`);
    if(connectionRevokeHomeMode) {
      await click("Check connection status");await waitText("Account connection status checked. Package access is separate.");
      if(!await js<boolean>(`document.querySelector('[aria-label="External AI connection"] dl')?.textContent.includes('active')`))
        throw Error("fixture_home_binding_snapshot_missing");
    }
    await click("Open connection setup");await waitText("Disconnect");
    const saved=await js<{selected_profile:string;viewed_step:string}>(`JSON.parse(localStorage.getItem('helix.agent_connection_setup.v1'))`);
    if(saved.selected_profile!=="standard_mcp"||saved.viewed_step==="ready")throw Error("fixture_offline_setup_not_proven");
    stage="offline_disconnect_cancel";
    await click("Disconnect");await waitText("This revokes the profile binding");await click("Cancel");
    if((await readiness()).oauth_binding_ref!==bindingRef)throw Error("fixture_cancel_revoked_binding");
    stage="offline_disconnect_confirm";
    await click("Disconnect");await waitText("This revokes the profile binding");
    await js(`document.querySelector('#agent-connection-setup-title')?.scrollIntoView({block:'start'})`);
    await captureCheck("offline-disconnect.png");
    await click("Confirm disconnect");await waitText("Authorize agent access");
    const after=await readiness();
    if(after.oauth_binding_ref!==null||after.readiness.client_authorization!=="missing"||after.readiness.client_presence!=="offline")
      throw Error("fixture_revoked_readiness_wrong");
    if(connectionRevokeHomeMode) {
      if(!await js<boolean>(`(()=>{const section=document.querySelector('[aria-label="External AI connection"]');
        return Boolean(section&&!section.querySelector('dl')&&section.textContent.includes('Connection status has not been checked.'));})()`))
        throw Error("fixture_revoked_home_snapshot_retained");
      await js(`document.querySelector('[aria-label="External AI connection"]').scrollIntoView({block:'center'})`);
      await captureCheck("revoked-home-connection.png");
    }
    const listing=await current.fetch(`${input.origin}/api/account/session/agent-bindings`,{credentials:"include",cache:"no-store"});
    const links=await listing.json() as {oauth_ready:boolean;bindings:{binding_ref:string;status:string}[]};
    if(!listing.ok||links.oauth_ready||links.bindings.find(row=>row.binding_ref===bindingRef)?.status!=="revoked")throw Error("fixture_store_not_revoked");
    if(await js<boolean>(`[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Disconnect'||button.textContent.trim()==='Confirm disconnect')`))
      throw Error("fixture_revoked_control_retained");
    const signedOut=await current.fetch(`${input.origin}/api/account/session/sign-out`,{method:"POST",credentials:"include"});
    if(!signedOut.ok)throw Error("fixture_revoke_signout_failed");
    const denied=await current.fetch(`${input.origin}/api/account/session/agent-bindings/${encodeURIComponent(bindingRef)}`,{method:"DELETE",credentials:"include"});
    if(denied.status!==401)throw Error("fixture_signed_out_revoke_allowed");
    if(nativeSpawnCount||pickerSelections||observations.length||installResponses.length)throw Error("fixture_revoke_native_effect");
    report={passed:true,bindingRef,clientPreference:"standard_mcp",offlineSetupStep:saved.viewed_step,cancelPreservedBinding:true,
      ...(connectionRevokeHomeMode?{homeSnapshotClearedOnRevoke:true}:{}),
      revokedInActualStore:true,authorizationAfter:"missing",signedOutRevokeStatus:denied.status,noNativeEffects:true,
      identityScope:"real disposable local account; controlled external identity inserted through real link store, not OAuth verification",
      startupScope:"production Ask menu/setup, readiness/revocation routes and link store with fixture host/service; no live client or installed acceptance"};
    stage="quit";app.quit();return;
  }
  if(connectionMode) {
    stage="connection_home";
    await window.loadURL(`${input.origin}/#connections`);
    await waitText("Not installed");
    await js(`document.querySelector('button[aria-label="Options for System Clock"]').click()`);
    await click("Configure connection");
    await click("Check connection status");
    await waitText("Account connection status checked. Package access is separate.");
    const homeReadiness=await js<string>(`document.querySelector('[aria-label="External AI connection"] dl').textContent`);
    if(!homeReadiness.includes("missing")||!homeReadiness.includes("offline"))throw Error("fixture_home_readiness_wrong");
    await js(`document.querySelector('[aria-label="External AI connection"]').scrollIntoView({block:'center'})`);
    await captureCheck("connection-home.png");
    await click("Open connection setup");
    await waitText("Authorize agent access");
    const setupProfile=()=>js<string>(`JSON.parse(localStorage.getItem('helix.agent_connection_setup.v1')).selected_profile`);
    if(await setupProfile()!=="codex_app")throw Error("fixture_home_handoff_wrong");
    await click("Close details");
    stage="connection_ask";
    await js(`document.querySelector('button[aria-label="Configure connection"]').click()`);
    await waitText("AI app to inspect");
    await js(`{const select=document.querySelector('[role="dialog"] select');select.value='standard_mcp';select.dispatchEvent(new Event('change',{bubbles:true}));}`);
    await click("Check connection status");
    await waitText("Account connection status checked. Package access is separate.");
    const askReadiness=await js<string>(`document.querySelector('[role="dialog"] dl').textContent`);
    if(!askReadiness.includes("missing")||!askReadiness.includes("offline"))throw Error("fixture_ask_readiness_wrong");
    await captureCheck("connection-ask.png");
    await click("Open connection setup");
    await waitText("Authorize agent access");
    if(await setupProfile()!=="standard_mcp")throw Error("fixture_ask_handoff_wrong");
    if(await js<boolean>(`Boolean(document.querySelector('[role="dialog"]'))`))throw Error("fixture_setup_dialog_not_closed");
    await js(`document.querySelector('button[aria-label="Configure connection"]').click()`);
    await waitText("AI app to inspect");
    stage="connection_sign_out";
    const signedOut=await current.fetch(`${input.origin}/api/account/session/sign-out`,{method:"POST",credentials:"include"});
    if(!signedOut.ok)throw Error("fixture_connection_sign_out_failed");
    await js(`window.dispatchEvent(new Event('helix-account-capability-policy-changed'))`);
    await waitText("The private catalog is unavailable.");
    await waitText("Sign in to CasimirBot");
    if(await js<boolean>(`Boolean(document.querySelector('[role="dialog"]'))`))throw Error("fixture_signed_out_dialog_retained");
    const denial=await current.fetch(`${input.origin}/api/account/session/agent-connections/readiness?client_profile=standard_mcp`,{credentials:"include",cache:"no-store"});
    if(denial.status!==401)throw Error("fixture_signed_out_readiness_not_denied");
    if(nativeSpawnCount||pickerSelections||observations.length||installResponses.length)throw Error("fixture_connection_unexpected_native_action");
    report={passed:true,homeReadiness,askReadiness,coldHomeClient:"codex_app",warmAskClient:"standard_mcp",
      signOutClosedDialog:true,readinessDeniedAfterSignOut:true,noNativeEffects:true,
      identityScope:"actual disposable local test account, not Auth0",startupScope:"Electron fixture with production UI/routes, not full main or installed candidate"};
    stage="quit";app.quit();return;
  }
  if (recovering) {
    stage="restart_recovery";
    const checkpoint=JSON.parse(fs.readFileSync(path.join(root,"restart-checkpoint.json"),"utf8"));
    if(checkpoint.schema!=="casimirbot.clock_restart_checkpoint.v1" || checkpoint.sourceHostPid===process.pid)
      throw Error("fixture_restart_checkpoint_invalid");
    await window.loadURL(input.origin);
    if(retiredMode) {
      stage="retired_owner_cleanup";
      await waitText(`System Clock ${PRIVATE_CLOCK_INSTALL_REVIEW.version} is installed.`);
      const before=historyInventory();
      if(!isDeepStrictEqual(before,checkpoint.history))throw Error("fixture_retired_history_changed");
      const denied = await js<{prepare:string;install:string;history:string}>(`(async()=>{
        const code=value=>typeof value==='string' ? value.match(/(?:private_clock|private_runtime|private_install|private_environment)_[a-z0-9_]+/)?.[0] ?? 'untyped' : 'untyped';
        const denied=async work=>{try{const result=await work();return result?.status==='unavailable' ? code(result.error) : 'allowed';}catch(error){return code(error?.message);}};
        return {prepare:await denied(()=>window.casimirDesktop.preparePrivateClock()),
          install:await denied(()=>window.casimirDesktop.installPrivateEnvironmentPackage()),
          history:await denied(()=>window.casimirDesktop.recoverPrivateClockObservation())};
      })()`);
      const expectedDenial = input.mode === "expired-remove" ? "private_clock_runtime_review_expired" : "private_runtime_not_qualified";
      const expectedInstallDenial = input.mode === "expired-remove" ? expectedDenial : "private_install_disabled";
      if(denied.prepare!==expectedDenial||denied.history!==expectedDenial||denied.install!==expectedInstallDenial||
        nativeSpawnCount||pickerSelections||observations.length)
        throw Error("fixture_retired_execution_allowed");
      await click("Remove clock package"); await waitText("Removal canceled.");
      const kept=await composition.owner.inspectRemoval(current);
      if(kept.status!=="selected"||kept.selection.installationRef!==checkpoint.installationRef)throw Error("fixture_retired_cancel_changed_selection");
      confirmRemoval=true;
      await click("Remove clock package"); await waitText("Package removed. Saved observations and personal data were kept.");
      const receipt=removalResults.at(-1) as {status?:string;receipt?:{codeFilesRemoved?:boolean;selected?:boolean;removedFileCount?:number;installationRef?:string}};
      if(receipt?.status!=="removed"||receipt.receipt?.codeFilesRemoved!==true||receipt.receipt.selected!==false||
        receipt.receipt.removedFileCount!==4||receipt.receipt.installationRef!==checkpoint.installationRef)
        throw Error("fixture_retired_removal_incomplete");
      if(!isDeepStrictEqual(before,historyInventory())||nativeSpawnCount||pickerSelections||observations.length)
        throw Error("fixture_retired_cleanup_changed_history_or_executed");
      report={passed:true,retiredRemovalPassed:true,retiredMode:input.mode,identityRecoveredWithoutSignIn:true,
        installationRef:checkpoint.installationRef,nativeExpiryDenied,privateFlagsEnabled:flagsEnabled,
        denied,cancelPreservedSelection:true,codeFilesRemoved:4,historyUnchanged:true,historyBefore:before,
        clockScope:input.mode==="expired-remove"?"Date API advanced only inside isolated recovery Electron process; service and Windows clocks unchanged":"private flags disabled in recovery Electron and service",
        identityScope:"same retained local test session; standard production account route; no recovery sign-in",
        confirmationScope:"controlled confirmation callback; not attended native dialog"};
      stage="quit";app.quit();return;
    }
    await waitText("Installed · stopped");
    await waitText(`System Clock ${PRIVATE_CLOCK_INSTALL_REVIEW.version} is installed.`);
    const installed=await composition.owner.inspect(current);
    if(installed.status!=="installed_stopped" || installed.installationRef!==checkpoint.installationRef ||
      installed.connected || installed.granted || installed.runtimeAvailable)throw Error("fixture_restart_installation_changed");
    if(!isDeepStrictEqual(historyInventory(),checkpoint.history))throw Error("fixture_restart_history_changed");
    // Exercise the real Home control with no renderer-retained request.
    await click("Load last request history"); await waitText("Saved observation — not current.");
    await waitText("Historical process uptime");
    const discovered=historyResponses[0]?.value, history=discovered?.history;
    if(historyResponses.length!==1 || historyResponses[0].argumentCount!==0 || discovered?.state!=="latest" ||
      discovered.fresh!==false || !isDeepStrictEqual(discovered.request,checkpoint.request) ||
      history?.state!=="accepted" || history.fresh!==false || !isDeepStrictEqual(history.receipt,checkpoint.receipt))
      throw Error("fixture_restart_history_not_recovered");
    if(children.length || nativeSpawnCount || observations.length || pickerSelections)throw Error("fixture_restart_replayed_or_reinstalled");
    if(!isDeepStrictEqual(historyInventory(),checkpoint.history))throw Error("fixture_restart_recovery_changed_history");
    report={passed:true,restartLeg:"recover",identityRecoveredWithoutSignIn:true,installationRef:installed.installationRef,
      historicalReceiptRecovered:true,fresh:false,replayed:false,historyUnchanged:true,sourceHostPid:checkpoint.sourceHostPid,
      homeHistoryRecovered:true,historyRecoveryScope:"Home explicit latest-history button after restart; its native IPC receipt is compared exactly with the checkpoint",
      identityScope:"same local test session; Electron retained its own profile; no cookie/token inspection or seeding",
      startupScope:"fresh fixture Electron process; runner evidence identifies warm or cold local-service mode"};
    stage="quit";app.quit();return;
  }
  if (pickerSwitchMode) {
    const ownerB = `${input.profileId}-other`;
    const packageRoot = (profileId: string) => path.join(input.userData, "environment-packages", "v1",
      createHash("sha256").update(JSON.stringify([profileId,input.deviceId])).digest("hex"),
      createHash("sha256").update(PRIVATE_CLOCK_INSTALL_REVIEW.packageId).digest("hex"));
    const selectionExists = (profileId: string) => fs.existsSync(path.join(packageRoot(profileId),"selected.json"));
    const signIn = async (profileId: string) => {
      const response = await current.fetch(`${input.origin}/api/account/session/sign-in`, { method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({profile_id:profileId,display_name:"Picker switch fixture",account_type:"developer"}) });
      if(!response.ok) throw Error("fixture_switch_sign_in_failed");
      const account=await readPrivateEnvironmentAccount({origin:input.origin,fetch:(url,options)=>current.fetch(url,options)});
      if(account.profileId!==profileId || account.accountType!=="developer") throw Error("fixture_switch_identity_wrong");
    };
    stage="picker_open_as_a";
    await window.loadURL(input.origin); await waitText("Not installed");
    await click("Install reviewed package"); await pickerOpened.promise;
    if(installResponses.length || pickerSelections!==1) throw Error("fixture_picker_not_held");
    stage="picker_account_replaced";
    await signIn(ownerB);
    // No renderer event or manual owner invalidation: fresh native account reads
    // must reject the old operation even when the UI has not noticed the switch.
    releasePicker.resolve();
    const deadline=Date.now()+15000;
    while(!installResponses.length && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
    const stale=installResponses[0];
    if(stale?.status!=="unavailable" || stale.error!=="private_install_identity_or_policy_changed")
      throw Error("fixture_stale_picker_not_rejected");
    if(selectionExists(input.profileId)||selectionExists(ownerB)||nativeSpawnCount||observations.length)
      throw Error("fixture_stale_picker_created_effect");
    const codeFilesBeforeFresh=Object.keys(PRIVATE_CLOCK_INSTALL_REVIEW.files).some(file=>
      [input.profileId,ownerB].some(profile=>fs.existsSync(path.join(packageRoot(profile),"versions",PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256,file))));
    if(codeFilesBeforeFresh) throw Error("fixture_stale_picker_wrote_code");
    stage="fresh_b_install";
    await window.loadURL(input.origin); await waitText("Not installed");
    await click("Install reviewed package"); await waitText("Read clock once");
    const installedB=await composition.owner.inspect(current);
    if(installedB.status!=="installed_stopped"||!installedB.installationRef||!selectionExists(ownerB)||selectionExists(input.profileId))
      throw Error("fixture_fresh_owner_install_failed");
    const packageFiles=Object.entries(PRIVATE_CLOCK_INSTALL_REVIEW.files).map(([name,expected])=>{
      const file=path.join(packageRoot(ownerB),"versions",PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256,name);
      const sha256=createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      if(sha256!==expected)throw Error("fixture_fresh_package_hash_mismatch");
      return {path:file,sha256};
    });
    const selectionPath=path.join(packageRoot(ownerB),"selected.json");
    const selectedHash=createHash("sha256").update(fs.readFileSync(selectionPath)).digest("hex");
    stage="return_a_no_inheritance";
    await signIn(input.profileId); await window.loadURL(input.origin); await waitText("Not installed");
    const currentA=await composition.owner.inspect(current);
    if(currentA.status!=="not_installed"||selectionExists(input.profileId)||
      createHash("sha256").update(fs.readFileSync(selectionPath)).digest("hex")!==selectedHash||
      Number(pickerSelections)!==2||nativeSpawnCount||observations.length||installResponses.length!==2)
      throw Error("fixture_owner_selection_crossed");
    report={passed:true,pickerAccountSwitchPassed:true,staleInstallDenial:stale.error,
      staleRequestCreatedNoSelectionOrCode:true,rendererRevocationEventDispatched:false,
      freshOwnerInstallRef:installedB.installationRef,originalOwnerStillUninstalled:true,
      secondOwnerSelectionUnchanged:true,packageFiles,selectionPath,selectionSha256:selectedHash,
      identityScope:"two actual isolated local test accounts; no Auth0 or session-store inspection",
      pickerScope:"held native callback returning fixed reviewed archive; no real file dialog",
      startupScope:"production Home/preload/owner/HTTP-route/store chain with fixture bootstrap"};
    stage="quit";app.quit();return;
  }
  stage = "ui_install"; await window.loadURL(input.origin); await waitText("Not installed");
  await click("Install reviewed package"); await waitText("Read clock once");
  stage = "ui_read"; await click("Read clock once"); await waitText("Read completed; clock stopped.");
  if (observations.length !== 1 || children.some(alive)) throw Error("fixture_read_or_cleanup_failed");
  const readText = await js<string>("document.querySelector('[aria-label=\"Private clock check\"]').textContent");
  await captureCheck("read.png");
  stage = "ui_history"; await click("Load last request history"); await waitText("Saved observation — not current.");
  if (observations.length !== 1) throw Error("fixture_history_replayed");
  const historyText = await js<string>("document.querySelector('[aria-label=\"Private clock check\"]').textContent");
  await captureCheck("history.png");
  if(historySwitchMode){
    const before=historyInventory(), initial=observations[0] as {request:unknown;receipt:unknown};
    const accountA=await composition.owner.inspect(current);
    if(accountA.status!=="installed_stopped"||!accountA.installationRef||!before.length)throw Error("fixture_history_prime_missing");
    const spawnsBefore=nativeSpawnCount;
    const signIn=async(profileId:string)=>{
      const response=await current.fetch(`${input.origin}/api/account/session/sign-in`,{method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({profile_id:profileId,display_name:"History switch fixture",account_type:"developer"})});
      if(!response.ok)throw Error("fixture_history_sign_in_failed");
      const account=await readPrivateEnvironmentAccount({origin:input.origin,fetch:(url,options)=>current.fetch(url,options)});
      if(account.profileId!==profileId||account.accountType!=="developer")throw Error("fixture_history_account_wrong");
    };
    stage="history_other_owner_install";
    await signIn(`${input.profileId}-other`); await window.loadURL(input.origin); await waitText("Not installed");
    await click("Install reviewed package"); await waitText("Read clock once");
    const accountB=await composition.owner.inspect(current);
    if(accountB.status!=="installed_stopped"||!accountB.installationRef||accountB.installationRef===accountA.installationRef)
      throw Error("fixture_history_installation_crossed");
    stage="history_other_owner_empty";
    await click("Load last request history"); await waitText("No saved clock requests for this installation.");
    const empty=historyResponses.at(-1);
    if(empty?.argumentCount!==0||!isDeepStrictEqual(empty.value,{state:"empty",fresh:false,legacyRecords:0}))
      throw Error("fixture_history_discovery_leaked");
    const exact=await js<unknown>(`window.casimirDesktop.recoverPrivateClockObservation(${JSON.stringify(initial.request)})`);
    if(!isDeepStrictEqual(exact,{state:"absent",fresh:false}))throw Error("fixture_history_exact_lookup_leaked");
    const otherText=await js<string>("document.querySelector('[aria-label=\"Private clock check\"]').textContent");
    if(otherText.includes("Historical process uptime")||otherText.includes("Observed process uptime"))throw Error("fixture_history_ui_leaked");
    stage="history_original_owner_recovered";
    await signIn(input.profileId); await window.loadURL(input.origin); await waitText("Read clock once");
    await click("Load last request history"); await waitText("Saved observation — not current.");
    const recovered=historyResponses.at(-1), after=historyInventory();
    if(recovered?.argumentCount!==0||recovered.value?.state!=="latest"||recovered.value?.fresh!==false||
      recovered.value?.history?.state!=="accepted"||recovered.value?.history?.fresh!==false||
      !isDeepStrictEqual(recovered.value.request,initial.request)||!isDeepStrictEqual(recovered.value.history.receipt,initial.receipt)||
      !isDeepStrictEqual(before,after)||observations.length!==1||nativeSpawnCount!==spawnsBefore||children.some(alive)||pickerSelections!==2)
      throw Error("fixture_history_account_recovery_failed");
    report={passed:true,historyAccountSwitchPassed:true,originalOwnerInstallation:accountA.installationRef,
      otherOwnerInstallation:accountB.installationRef,otherOwnerDiscovery:empty.value,otherOwnerExactLookup:exact,
      originalReceiptRecovered:true,historyBefore:before,historyAfter:after,historyHashesUnchanged:true,
      noRecoverySpawnOrRead:true,spawnsBeforeSwitch:spawnsBefore,readText,historyText,otherText,
      identityScope:"two actual isolated local accounts A to B to A; no Auth0",
      startupScope:"production Home/preload/native owner/journal and actual account routes; fixture bootstrap and controlled archive picker"};
    stage="quit";app.quit();return;
  }
  if(restartMode){
    stage="restart_checkpoint";
    await waitText(`System Clock ${PRIVATE_CLOCK_INSTALL_REVIEW.version} is installed.`);
    const installed=await composition.owner.inspect(current);
    if(installed.status!=="installed_stopped" || !installed.installationRef || children.some(alive))throw Error("fixture_restart_not_quiescent");
    const observation=observations[0] as {request:unknown;receipt:unknown};
    const history=historyInventory();
    if(!history.length || pickerSelections!==1 || observations.length!==1)throw Error("fixture_restart_checkpoint_missing");
    fs.writeFileSync(path.join(root,"restart-checkpoint.json"),JSON.stringify({schema:"casimirbot.clock_restart_checkpoint.v1",
      sourceHostPid:process.pid,installationRef:installed.installationRef,request:observation.request,receipt:observation.receipt,history},null,2));
    report={passed:true,restartLeg:"prime",installationRef:installed.installationRef,checkpointSaved:true,exactlyOneObservation:true,
      identityScope:"local test session intentionally retained for restart; no explicit sign-out"};
    stage="quit";app.quit();return;
  }
  if (removalMode) {
    stage = "removal_cancel";
    await waitText(`System Clock ${PRIVATE_CLOCK_INSTALL_REVIEW.version} is installed.`);
    const before = historyInventory();
    const initial = await composition.owner.inspectRemoval(current);
    if (initial.status !== "selected") throw Error("fixture_removal_selection_missing");
    await click("Remove clock package"); await waitText("Removal canceled.");
    const kept = await composition.owner.inspectRemoval(current);
    if (kept.status !== "selected" || kept.selection.installationRef !== initial.selection.installationRef || children.some(alive))
      throw Error("fixture_cancel_changed_installation");
    stage = "removal_prepared_child";
    await js("window.casimirDesktop.preparePrivateClock()");
    const runningPid = children.at(-1)!; if (!alive(runningPid)) throw Error("fixture_removal_child_missing");
    confirmRemoval = true;
    await click("Remove clock package"); await waitText("Package removed. Saved observations and personal data were kept.");
    if (alive(runningPid)) throw Error("fixture_removal_child_alive");
    const removed = await composition.owner.inspectRemoval(current);
    if (removed.status !== "not_installed") throw Error("fixture_removed_selection_retained");
    const finalRemoval = removalResults.at(-1) as {status?:string;receipt?:{codeFilesRemoved?:boolean;selected?:boolean}};
    if (finalRemoval?.status !== "removed" || finalRemoval.receipt?.codeFilesRemoved !== true || finalRemoval.receipt.selected !== false)
      throw Error("fixture_code_removal_incomplete");
    const after = historyInventory(); if (!before.length || JSON.stringify(after) !== JSON.stringify(before)) throw Error("fixture_removal_history_changed");
    const denied = await js<boolean>("window.casimirDesktop.preparePrivateClock().then(()=>false,()=>true)");
    if (!denied || children.some(alive)) throw Error("fixture_removed_execution_allowed");
    await captureCheck("removed.png");
    stage = "removal_reinstall";
    await waitText("Not installed"); await click("Install reviewed package"); await waitText("Read clock once");
    // Wait for the independently authenticated cleanup view before asserting its selection.
    await waitText(`System Clock ${initial.selection.version} is installed.`);
    const installed = await composition.owner.inspectRemoval(current);
    if (installed.status !== "selected" || installed.selection.installationRef === initial.selection.installationRef)
      throw Error("fixture_reinstall_identity_reused");
    if (JSON.stringify(historyInventory()) !== JSON.stringify(before)) throw Error("fixture_reinstall_history_changed");
    removalEvidence = { cancelledSelectionPreserved:true,preparedPid:runningPid,preparedChildStopped:true,codeFilesRemoved:true,
      historyBefore:before,historyAfter:after,removedPreparationDenied:denied,oldInstallationRef:initial.selection.installationRef,
      newInstallationRef:installed.selection.installationRef,historySurvivesReinstall:true,nativeDialogUsed:false };
  }
  stage = "prepared_session_revocation"; holdReadiness = true; await click("Read clock once");
  const pid = await prepared.promise;
  const signedOut = await current.fetch(`${input.origin}/api/account/session/sign-out`, { method: "POST", credentials: "include" });
  if (!signedOut.ok) throw Error("fixture_sign_out_failed");
  await js('window.dispatchEvent(new Event("helix-account-capability-policy-changed"))');
  await revoked.promise;
  if (alive(pid)) throw Error("fixture_revocation_child_alive");
  releaseReadiness.resolve(); await waitText("The private catalog is unavailable."); await waitText("Clock stopped.");
  const revokedText = await js<string>("document.querySelector('[aria-label=\"Private clock check\"]').textContent");
  if (revokedText.includes("Observed process uptime") || revokedText.includes("Historical process uptime")) throw Error("fixture_revoked_result_visible");
  stage = "revoked_native_admission";
  const denied = await js<boolean>("window.casimirDesktop.preparePrivateClock().then(()=>false,()=>true)");
  if (!denied || children.length !== (removalMode ? 3 : 2) || observations.length !== 1) throw Error("fixture_revoked_admission_failed");
  await click("Stop clock"); await waitText("Clock stopped.");
  await captureCheck("revoked.png");
  report = { passed: true, readText, historyText, revokedText, revokedAdmissionDenied: denied,
    exactlyOneObservation: true, explicitUiInstall: true, readinessDeliveryHeldForRevocation: true,
    identityScope: "actual local test account/session, not Auth0", startupScope: "fixture bootstrap with production component chain, not full desktop main" };
  stage = "quit"; app.quit();
}).catch(fail);
