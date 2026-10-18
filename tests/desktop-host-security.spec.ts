import { describe, expect, it, vi } from "vitest";
import type { Session } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { installDesktopSessionSecurity } from
  "../apps/desktop/src/security";

describe("desktop Electron session security", () => {
  it("denies browser permissions, device access, and renderer downloads", () => {
    let permissionCheck: ((...args: unknown[]) => boolean) | null = null;
    let permissionRequest:
      | ((webContents: unknown, permission: unknown, callback: (allowed: boolean) => void) => void)
      | null = null;
    let devicePermission: ((...args: unknown[]) => boolean) | null = null;
    let downloadListener: ((event: { preventDefault: () => void }) => void) | null = null;
    const targetSession = {
      setPermissionCheckHandler(handler: typeof permissionCheck) {
        permissionCheck = handler;
      },
      setPermissionRequestHandler(handler: typeof permissionRequest) {
        permissionRequest = handler;
      },
      setDevicePermissionHandler(handler: typeof devicePermission) {
        devicePermission = handler;
      },
      on(event: string, listener: typeof downloadListener) {
        if (event === "will-download") downloadListener = listener;
        return this;
      },
    } as unknown as Session;

    installDesktopSessionSecurity(targetSession);

    expect(permissionCheck?.()).toBe(false);
    const callback = vi.fn();
    permissionRequest?.(null, "media", callback);
    expect(callback).toHaveBeenCalledWith(false);
    expect(devicePermission?.()).toBe(false);
    const preventDefault = vi.fn();
    downloadListener?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("allows audio-only media capture for the exact private renderer origin", () => {
    let permissionCheck: ((...args: any[]) => boolean) | null = null;
    let permissionRequest:
      | ((...args: any[]) => void)
      | null = null;
    let devicePermission: ((...args: unknown[]) => boolean) | null = null;
    const targetSession = {
      setPermissionCheckHandler(handler: typeof permissionCheck) {
        permissionCheck = handler;
      },
      setPermissionRequestHandler(handler: typeof permissionRequest) {
        permissionRequest = handler;
      },
      setDevicePermissionHandler(handler: typeof devicePermission) {
        devicePermission = handler;
      },
      on() {
        return this;
      },
    } as unknown as Session;
    const trustedOrigin = "http://127.0.0.1:43117";
    const webContents = { getURL: () => `${trustedOrigin}/desktop` };

    installDesktopSessionSecurity(targetSession, {
      getTrustedRendererOrigin: () => trustedOrigin,
    });

    expect(permissionCheck?.(
      webContents,
      "media",
      trustedOrigin,
      { mediaType: "audio" },
    )).toBe(true);
    expect(permissionCheck?.(
      webContents,
      "media",
      trustedOrigin,
      { mediaType: "video" },
    )).toBe(false);
    expect(permissionCheck?.(
      webContents,
      "media",
      "http://127.0.0.1:43118",
      { mediaType: "audio" },
    )).toBe(false);

    const audioCallback = vi.fn();
    permissionRequest?.(
      webContents,
      "media",
      audioCallback,
      { requestingUrl: `${trustedOrigin}/desktop`, mediaTypes: ["audio"] },
    );
    expect(audioCallback).toHaveBeenCalledWith(true);

    const cameraCallback = vi.fn();
    permissionRequest?.(
      webContents,
      "media",
      cameraCallback,
      { requestingUrl: `${trustedOrigin}/desktop`, mediaTypes: ["video"] },
    );
    expect(cameraCallback).toHaveBeenCalledWith(false);
    expect(devicePermission?.()).toBe(false);
  });

  it("allows only exact-origin sanitized clipboard writes and never clipboard reads", () => {
    let check: (...args: any[]) => boolean;
    let request: (...args: any[]) => void;
    let origin: string | null = "http://127.0.0.1:43117";
    installDesktopSessionSecurity({
      setPermissionCheckHandler(handler: typeof check) { check = handler; },
      setPermissionRequestHandler(handler: typeof request) { request = handler; },
      setDevicePermissionHandler() {},
      on() {},
    } as unknown as Session, { getTrustedRendererOrigin: () => origin });
    const trusted = "http://127.0.0.1:43117";
    const contents = (url: string) => ({ getURL: () => url });
    const cases = [
      ["clipboard-sanitized-write", trusted, trusted, true],
      ["clipboard-read", trusted, trusted, false],
      ["deprecated-sync-clipboard-read", trusted, trusted, false],
      ["clipboard-sanitized-write", trusted, "http://127.0.0.1:43118", false],
      ["clipboard-sanitized-write", "https://example.com", trusted, false],
      ["clipboard-sanitized-write", trusted, "invalid", false],
    ] as const;
    for (const [permission, owner, requester, allowed] of cases) {
      expect(check!(contents(owner), permission, requester, {})).toBe(allowed);
      const callback = vi.fn();
      request!(contents(owner), permission, callback, { requestingUrl: requester });
      expect(callback).toHaveBeenCalledWith(allowed);
    }
    expect(check!(null, "clipboard-sanitized-write", trusted, {})).toBe(false);
    origin = null;
    expect(check!(contents(trusted), "clipboard-sanitized-write", trusted, {})).toBe(false);
  });

  it("keeps risky renderer features explicitly disabled", async () => {
    const mainSource = await readFile(
      path.resolve("apps/desktop/src/main.ts"),
      "utf8",
    );
    for (const declaration of [
      "webviewTag: false",
      "plugins: false",
      "safeDialogs: true",
      "spellcheck: false",
      "navigateOnDragDrop: false",
    ]) {
      expect(mainSource).toContain(declaration);
    }
  });

  it("rechecks the packaged Codex plugin before opening its consent surface", async () => {
    const mainSource = await readFile(
      path.resolve("apps/desktop/src/main.ts"),
      "utf8",
    );
    expect(mainSource).toContain("reinspectCodexPluginIntegration(");
    expect(mainSource).toContain("Codex plugin bundle changed after startup");
    expect(mainSource).toContain("shell.openExternal(");
    expect(mainSource).not.toContain("codex plugin marketplace add");
    expect(mainSource).not.toContain("codex plugin add");
  });

  it("admits the full MCP tunnel only after native developer-account revalidation", async () => {
    const [mainSource, executorSource] = await Promise.all([
      readFile(path.resolve("apps/desktop/src/main.ts"), "utf8"),
      readFile(
        path.resolve("apps/desktop/src/mcp-tunnel-transition-executor.ts"),
        "utf8",
      ),
    ]);
    expect(mainSource).toContain("parseDesktopMcpTunnelStartRequest(input)");
    expect(mainSource).toContain(
      "const account = await resolveActiveDesktopAccount(runtime, event.sender.session)",
    );
    expect(mainSource).toContain(
      "return startDesktopMcpTunnelForUserSession({",
    );
    expect(executorSource).toContain('input.requestedScope === "full_helix_agent"');
    expect(executorSource).toContain('input.accountType !== "developer"');
    expect(executorSource).toContain("mcp_tunnel_full_developer_account_required");
    for (const channel of [
      "DESKTOP_MCP_TUNNEL_CONFIGURE_CHANNEL",
      "DESKTOP_MCP_TUNNEL_STOP_CHANNEL",
      "DESKTOP_MCP_TUNNEL_CLEAR_CHANNEL",
      "DESKTOP_MCP_TUNNEL_OPEN_ADMIN_CHANNEL",
    ]) {
      const handler = mainSource.split(`ipcMain.handle(${channel},`)[1]?.split("ipcMain.handle(")[0];
      expect(handler, `${channel} must retain native developer authorization`).toContain(
        'assertDeveloperAccount(event.sender.session, "mcp_tunnel_developer_account_required"',
      );
    }
  });

  it("reveals an existing hidden desktop window on second-instance activation", async () => {
    const mainSource = await readFile(
      path.resolve("apps/desktop/src/main.ts"),
      "utf8",
    );
    expect(mainSource).toContain('app.on("second-instance"');
    expect(mainSource).toContain(
      "if (!mainWindow.isVisible()) mainWindow.show();",
    );
    expect(mainSource).toContain(
      "if (mainWindow.isMinimized()) mainWindow.restore();",
    );
    expect(mainSource).toContain("mainWindow.focus();");
  });

  it("auto-starts only the configured read-only tunnel after native developer revalidation", async () => {
    const mainSource = await readFile(
      path.resolve("apps/desktop/src/main.ts"),
      "utf8",
    );
    const executorSource = await readFile(
      path.resolve("apps/desktop/src/mcp-tunnel-transition-executor.ts"),
      "utf8",
    );
    expect(mainSource).toContain(
      "autoStartConfiguredDesktopMcpTunnelReadOnly({",
    );
    expect(mainSource).toContain("return resolveActiveDesktopAccount(");
    expect(executorSource).toContain('account.accountType !== "developer"');
    expect(executorSource).toContain(
      '"local_supervisor_coordination_and_device_check"',
    );
    expect(executorSource).not.toContain(
      'input.controller.start(account.sessionId, "full_helix_agent")',
    );
  });

  it("bounds desktop service startup and requires full packaged readiness", async () => {
    const [mainSource, buildSource, smokeSource] = await Promise.all([
      readFile(path.resolve("apps/desktop/src/main.ts"), "utf8"),
      readFile(
        path.resolve("apps/desktop/scripts/build-host.mjs"),
        "utf8",
      ),
      readFile(
        path.resolve("apps/desktop/scripts/smoke-packaged-launch.ps1"),
        "utf8",
      ),
    ]);
    expect(mainSource).toContain("const SERVICE_HEAP_LIMIT_MB = 1_024");
    expect(mainSource).toContain("AbortSignal.timeout(");
    expect(mainSource).toContain("desktop-service-startup.log");
    expect(mainSource).toContain("desktop-service-ready.json");
    expect(mainSource).toContain("const childExited = new Promise<void>");
    expect(mainSource).toContain("child.kill()");
    expect(buildSource).toContain(
      '"data/starsim/solar-reference-pack.v1.json"',
    );
    expect(buildSource).toContain(
      '"data/starsim/solar-product-registry.v1.json"',
    );
    expect(buildSource).toContain("requiredDataAssets");
    expect(smokeSource).toContain("casimir_desktop_service_ready_receipt/1");
    expect(smokeSource).toContain("FullReadinessReceipt = \"PASS\"");
    expect(smokeSource).toContain(
      "$ids = @(Get-ProcessTreeIds ([uint32]$rootProcess.Id))",
    );
    expect(smokeSource).toContain(
      "$ids -contains [uint32]$_.OwningProcess",
    );
    expect(smokeSource).toContain(
      "$expectedLoopbackListeners = if ($friendsCoordinationConfigured) { 5 } else { 4 }",
    );
    expect(smokeSource).toContain(
      "$listenerCount -eq $expectedLoopbackListeners",
    );
    expect(smokeSource).toContain("ServiceListenerReceipt = \"PASS\"");
    expect(smokeSource).toContain(
      "The ready receipt did not identify exactly one service listener.",
    );
    expect(smokeSource).toContain(
      "The packaged application did not reach full API readiness.",
    );
  });

  it("routes subscription management through the exact sanitized Stripe portal projection", async () => {
    const [mainSource, billingSchema] = await Promise.all([
      readFile(path.resolve("apps/desktop/src/main.ts"), "utf8"),
      readFile(path.resolve("shared/helix-billing-entitlement.ts"), "utf8"),
    ]);
    expect(mainSource).toContain("targetRef === HELIX_BILLING_PORTAL_TARGET");
    expect(mainSource).toContain("helixBillingPortalOperationSchema.safeParse");
    expect(mainSource).toContain("await shell.openExternal(hosted.data.hosted_url)");
    expect(billingSchema).toContain('url.hostname === "billing.stripe.com"');
    expect(billingSchema).toContain("customer_reference_included: z.literal(false)");
  });
});
