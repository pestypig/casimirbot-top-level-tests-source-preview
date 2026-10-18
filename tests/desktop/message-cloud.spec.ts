import { describe, expect, it, vi } from "vitest";
import type { Rectangle } from "electron";
import { MessageCloudController, shouldThrottleRendererForMessageCloud, type MessageCloudWindow } from
  "../../apps/desktop/src/message-cloud";
import { DESKTOP_MESSAGE_CLOUD_RENDER_CHANNEL } from
  "../../apps/desktop/src/channels";

const frame = {
  schema: "helix.message_cloud_frame.v1" as const,
  helixConversationId: "chat:owner",
  turns: [{ id: "turn:one", prompt: "Read the catalog", delivery: "reported" as const,
    report: { status: "completed" as const, text: "20 public surfaces" } }],
};
const makeWindow = () => {
  let closed: (() => void) | undefined;
  let moved: (() => void) | undefined;
  let bounds: Rectangle = { x: 0, y: 0, width: 430, height: 505 };
  const window = {
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(async (_url: string) => {}),
    showInactive: vi.fn(), destroy: vi.fn(() => closed?.()),
    setBounds: vi.fn((next: Rectangle) => { bounds = { ...next }; }),
    getBounds: vi.fn(() => ({ ...bounds })),
    simulateNativeMove: (next: Rectangle) => { bounds = { ...next }; moved?.(); },
    setAlwaysOnTop: vi.fn(), setSkipTaskbar: vi.fn(),
    on: vi.fn((event: "closed" | "move", listener: () => void) => {
      if (event === "closed") closed = listener;
      else moved = listener;
    }),
    webContents: { id: 71, send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() },
  };
  return window;
};

describe("Message Codex cloud display boundary", () => {
  it("keeps only a visible session-activity cloud's renderer polling awake", () => {
    expect(shouldThrottleRendererForMessageCloud({ visible: false, source: null })).toBe(true);
    expect(shouldThrottleRendererForMessageCloud({ visible: true, source: "codex_mirror" })).toBe(true);
    expect(shouldThrottleRendererForMessageCloud({ visible: true, source: "cloud_agent_dm" })).toBe(true);
    expect(shouldThrottleRendererForMessageCloud({ visible: true, source: "session_activity" })).toBe(false);
    expect(shouldThrottleRendererForMessageCloud({ visible: false, source: "session_activity" })).toBe(true);
  });
  it("opens a draggable display from a bounded frame and closes without task authority", async () => {
    const window = makeWindow();
    const onVisibilityChange = vi.fn();
    const controller = new MessageCloudController({
      createWindow: () => window as unknown as MessageCloudWindow,
      initialBounds: () => ({ x: 100, y: 120, width: 430, height: 505 }),
      onVisibilityChange,
    });
    expect(controller.isVisible()).toBe(false);
    expect(await controller.show(frame)).toBe(true);
    expect(controller.isVisible()).toBe(true);
    expect(controller.status()).toEqual({ visible: true, source: "message_codex",
      helixConversationId: "chat:owner" });
    expect(window.loadURL).toHaveBeenCalledWith(expect.stringContaining("data:text/html"));
    const html = decodeURIComponent(window.loadURL.mock.calls[0][0]);
    expect(html).toContain("-webkit-app-region:drag");
    expect(html).toContain("-webkit-app-region:no-drag");
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("20 public surfaces");
    expect(window.webContents.send).toHaveBeenCalledWith(DESKTOP_MESSAGE_CLOUD_RENDER_CHANNEL, frame);
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, "pop-up-menu");
    expect(controller.isOverlaySender(71)).toBe(true);
    expect(controller.isOverlaySender(72)).toBe(false);
    expect(controller.movementDiagnostic()).toEqual({
      initial: { x: 100, y: 120, width: 430, height: 505 },
      current: { x: 100, y: 120, width: 430, height: 505 },
      moveEvents: 0, displaced: false,
    });
    controller.stop();
    expect(controller.isVisible()).toBe(false);
    expect(controller.status()).toEqual({ visible: false, source: null,
      helixConversationId: null });
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(onVisibilityChange.mock.calls.map(call => call[0])).toEqual([true, false]);
  });

  it("rejects oversized or malformed frames before creating a window", async () => {
    const createWindow = vi.fn(() => makeWindow() as unknown as MessageCloudWindow);
    const controller = new MessageCloudController({ createWindow,
      initialBounds: () => ({ x: 0, y: 0, width: 430, height: 505 }),
      onVisibilityChange: vi.fn() });
    expect(await controller.show({ ...frame, turns: Array(4).fill(frame.turns[0]) })).toBe(false);
    expect(await controller.show({ ...frame, turns: [{ ...frame.turns[0],
      report: { status: "completed", text: "x", executionAuthority: true } }] })).toBe(false);
    expect(createWindow).not.toHaveBeenCalled();
  });

  it("reports the exact Helix chat for a floating Codex mirror when switching tasks", async () => {
    const controller = new MessageCloudController({
      createWindow: () => makeWindow() as unknown as MessageCloudWindow,
      initialBounds: () => ({ x: 0, y: 0, width: 430, height: 505 }),
      onVisibilityChange: vi.fn(),
    });
    const mirror = (chatId: string) => ({
      schema: "helix.codex_conversation_cloud_frame.v1",
      taskId: "01a0eded-a444-7330-9313-fbbbe61285dd",
      helixConversationId: chatId, turns: [],
    });
    expect(await controller.show(mirror("chat:first"))).toBe(true);
    expect(controller.status()).toEqual({ visible: true, source: "codex_mirror",
      helixConversationId: "chat:first" });
    expect(await controller.show(mirror("chat:second"))).toBe(true);
    expect(controller.status()).toEqual({ visible: true, source: "codex_mirror",
      helixConversationId: "chat:second" });
    controller.stop();
  });

  it("opens only an explicitly clicked web link outside the cloud", async () => {
    const window = makeWindow();
    const openExternal = vi.fn(async (_url: string) => {});
    const controller = new MessageCloudController({
      createWindow: () => window as unknown as MessageCloudWindow,
      initialBounds: () => ({ x: 0, y: 0, width: 430, height: 505 }),
      onVisibilityChange: vi.fn(), openExternal,
    });
    expect(await controller.show(frame)).toBe(true);
    const handler = window.webContents.setWindowOpenHandler.mock.calls[0][0] as
      (details: { url: string }) => { action: string };
    expect(handler({ url: "https://example.com/details" })).toEqual({ action: "deny" });
    expect(handler({ url: "javascript:alert(1)" })).toEqual({ action: "deny" });
    expect(handler({ url: "https://user:secret@example.com/" })).toEqual({ action: "deny" });
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith("https://example.com/details");
    controller.stop();
  });

  it("uses one native window when updates arrive while the overlay loads", async () => {
    let finishLoad: (() => void) | undefined;
    const window = makeWindow();
    window.loadURL.mockImplementation(() => new Promise<void>(resolve => { finishLoad = resolve; }));
    const createWindow = vi.fn(() => window as unknown as MessageCloudWindow);
    const controller = new MessageCloudController({ createWindow,
      initialBounds: () => ({ x: 0, y: 0, width: 430, height: 505 }),
      onVisibilityChange: vi.fn() });
    const first = controller.show(frame);
    const updated = { ...frame, turns: [{ ...frame.turns[0], delivery: "picked_up" as const }] };
    const second = controller.show(updated);
    finishLoad?.();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(createWindow).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenCalledWith(DESKTOP_MESSAGE_CLOUD_RENDER_CHANNEL, updated);
  });

  it("distinguishes a native move event from a changed window position", async () => {
    const window = makeWindow();
    const controller = new MessageCloudController({
      createWindow: () => window as unknown as MessageCloudWindow,
      initialBounds: () => ({ x: 100, y: 120, width: 430, height: 505 }),
      onVisibilityChange: vi.fn(),
    });
    expect(await controller.show(frame)).toBe(true);
    window.simulateNativeMove({ x: 100, y: 120, width: 430, height: 505 });
    expect(controller.movementDiagnostic()).toMatchObject({ moveEvents: 1, displaced: false });
    window.simulateNativeMove({ x: 175, y: 165, width: 430, height: 505 });
    expect(controller.movementDiagnostic()).toEqual({
      initial: { x: 100, y: 120, width: 430, height: 505 },
      current: { x: 175, y: 165, width: 430, height: 505 },
      moveEvents: 2, displaced: true,
    });
    controller.stop();
    expect(controller.movementDiagnostic()).toBeNull();
  });

  it("emits opt-in native bounds receipts without any message text", async () => {
    vi.stubEnv("CASIMIR_MESSAGE_CLOUD_DRAG_DIAGNOSTICS", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const window = makeWindow();
      const controller = new MessageCloudController({
        createWindow: () => window as unknown as MessageCloudWindow,
        initialBounds: () => ({ x: 100, y: 120, width: 430, height: 505 }),
        onVisibilityChange: vi.fn(),
      });
      expect(await controller.show(frame)).toBe(true);
      window.simulateNativeMove({ x: 175, y: 165, width: 430, height: 505 });
      expect(log.mock.calls.map(call => call[0])).toEqual([
        "[message-cloud] initial_bounds", "[message-cloud] native_move",
      ]);
      expect(log.mock.calls[1][1]).toContain('"displaced":true');
      expect(JSON.stringify(log.mock.calls)).not.toContain(frame.turns[0].prompt);
      controller.stop();
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
