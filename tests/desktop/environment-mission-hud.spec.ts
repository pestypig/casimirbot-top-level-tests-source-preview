import { describe, expect, it, vi } from "vitest";
import type { Rectangle } from "electron";
import {
  EnvironmentMissionHudController,
  type EnvironmentMissionHudWindow,
} from "../../apps/desktop/src/environment-mission-hud";
import { DESKTOP_ENVIRONMENT_MISSION_HUD_RENDER_CHANNEL } from "../../apps/desktop/src/channels";

const scope = {
  schema: "helix.environment_mission_activity_scope.v1" as const,
  profile_ref: "profile:owner", node_ref: "node:local", run_id: "run:one",
  room_ref: "room:one", environment_binding_ref: "binding:one",
  source_ref: "source:fabric", world_ref: "world:arena",
};
const identity = {
  mission_id: "mission:one", mission_revision: 2, binding_epoch: 3,
  producer_epoch_ref: "producer:one",
  action_authority_ref: "authority:one",
  client_process_id: 1234, scope,
};
const now = Date.parse("2026-09-30T12:00:00.000Z");
const frame = () => ({
  ...identity,
  schema: "helix.environment_mission_native_hud_frame.v1",
  observed_at: new Date(now).toISOString(),
  projections: [{
    schema: "helix.environment_mission_activity_projection.v1",
    surface: "overlay", activity_event_id: "activity:one", projection_sequence: 1,
    run_id: "run:one", event_kind: "checkpoint", outcome: "succeeded",
    label: "Checkpoint", summary: "Reached the safe ledge.", truncated: false,
    observed_at: new Date(now).toISOString(), provenance: "measured",
    content_role: "mission_activity_not_assistant_answer", answer_authority: false,
    assistant_answer: false, terminal_eligible: false, raw_content_included: false,
    private_reasoning_included: false, action_authority_granted: false,
  }],
  content_role: "mission_activity_not_assistant_answer",
  private_reasoning_included: false, raw_content_included: false,
  action_authority_granted: false, answer_authority: false,
  assistant_answer: false, terminal_eligible: false,
});
const makeWindow = () => ({
  isDestroyed: vi.fn(() => false), loadURL: vi.fn(async (_url: string) => {}),
  showInactive: vi.fn(), hide: vi.fn(), destroy: vi.fn(),
  setBounds: vi.fn((_bounds: Rectangle) => {}),
  setAlwaysOnTop: vi.fn((_flag: boolean, _level?: "floating") => {}),
  setFocusable: vi.fn((_flag: boolean) => {}),
  setIgnoreMouseEvents: vi.fn((_ignore: boolean, _options?: { forward: boolean }) => {}),
  setSkipTaskbar: vi.fn((_skip: boolean) => {}),
  webContents: { send: vi.fn((_channel: string, _payload?: unknown) => {}),
    setWindowOpenHandler: vi.fn((_handler: () => { action: "deny" }) => {}),
    on: vi.fn((_event: "will-navigate", _listener: (event: { preventDefault(): void }) => void) => {}),
  },
});

describe("native environment mission HUD safety boundary", () => {
  it("does not construct a window for absent, stale or wrong game identity", async () => {
    let current = identity;
    let clock = now;
    let foreground = true;
    const createWindow = vi.fn(() => makeWindow() as EnvironmentMissionHudWindow);
    const controller = new EnvironmentMissionHudController({ createWindow,
      readCurrentIdentity: () => current,
      readVerifiedMinecraftWindow: () => ({ clientProcessId: 1234, foreground,
        bounds: { x: 100, y: 200, width: 900, height: 600 } }),
      now: () => clock });
    foreground = false;
    expect(await controller.display(frame())).toBe(false);
    foreground = true;
    current = { ...identity, mission_revision: 4 };
    expect(await controller.display(frame())).toBe(false);
    current = identity;
    current = { ...identity, producer_epoch_ref: "producer:rotated" };
    expect(await controller.display(frame())).toBe(false);
    current = { ...identity, action_authority_ref: "authority:revoked" };
    expect(await controller.display(frame())).toBe(false);
    current = identity;
    clock += 3_001;
    expect(await controller.display(frame())).toBe(false);
    expect(createWindow).not.toHaveBeenCalled();
  });

  it("creates a small transparent-content, click-through HUD only over the verified foreground client", async () => {
    const window = makeWindow();
    let target = { clientProcessId: 1234, foreground: true,
      bounds: { x: 100, y: 200, width: 900, height: 600 } };
    const controller = new EnvironmentMissionHudController({
      createWindow: () => window as EnvironmentMissionHudWindow,
      readCurrentIdentity: () => identity,
      readVerifiedMinecraftWindow: () => target,
      now: () => now,
    });
    expect(await controller.display(frame())).toBe(true);
    expect(window.loadURL).toHaveBeenCalledWith(expect.stringContaining("data:text/html"));
    const documentUrl = window.loadURL.mock.calls[0][0];
    expect(decodeURIComponent(documentUrl)).toContain("background:transparent");
    expect(decodeURIComponent(documentUrl)).not.toContain("Reached the safe ledge");
    expect(window.setBounds).toHaveBeenCalledWith({ x: 116, y: 216,
      width: 420, height: 235 });
    expect(window.setFocusable).toHaveBeenCalledWith(false);
    expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(window.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(window.webContents.send).toHaveBeenCalledWith(
      DESKTOP_ENVIRONMENT_MISSION_HUD_RENDER_CHANNEL,
      expect.arrayContaining([expect.objectContaining({ summary: "Reached the safe ledge." })]),
    );
    target = { ...target, foreground: false };
    expect(controller.tick()).toBe(false);
    expect(window.hide).toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalled();
  });

  it("fails closed when the game window is too small or the frame claims authority", async () => {
    let bounds = { x: 0, y: 0, width: 400, height: 250 };
    const createWindow = vi.fn(() => makeWindow() as EnvironmentMissionHudWindow);
    const controller = new EnvironmentMissionHudController({ createWindow,
      readCurrentIdentity: () => identity,
      readVerifiedMinecraftWindow: () => ({ clientProcessId: 1234,
        foreground: true, bounds }), now: () => now });
    expect(await controller.display(frame())).toBe(false);
    bounds = { x: 0, y: 0, width: 900, height: 600 };
    expect(await controller.display({ ...frame(), action_authority_granted: true })).toBe(false);
    expect(createWindow).not.toHaveBeenCalled();
  });

  it("does not show after identity revokes while the isolated window loads", async () => {
    let current = identity;
    const window = makeWindow();
    window.loadURL.mockImplementation(async () => { current = { ...identity, binding_epoch: 4 }; });
    const controller = new EnvironmentMissionHudController({
      createWindow: () => window as EnvironmentMissionHudWindow,
      readCurrentIdentity: () => current,
      readVerifiedMinecraftWindow: () => ({ clientProcessId: 1234,
        foreground: true, bounds: { x: 0, y: 0, width: 900, height: 600 } }),
      now: () => now,
    });
    expect(await controller.display(frame())).toBe(false);
    expect(window.showInactive).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalled();
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalled();
    const deny = window.webContents.setWindowOpenHandler.mock.calls[0][0];
    expect(deny()).toEqual({ action: "deny" });
    const preventDefault = vi.fn();
    const navigation = window.webContents.on.mock.calls[0][1];
    navigation({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("does not revive a stopped HUD when its renderer load finishes later", async () => {
    const window = makeWindow();
    let finishLoad: (() => void) | undefined;
    window.loadURL.mockImplementation(() => new Promise<void>(resolve => {
      finishLoad = resolve;
    }));
    const controller = new EnvironmentMissionHudController({
      createWindow: () => window as EnvironmentMissionHudWindow,
      readCurrentIdentity: () => identity,
      readVerifiedMinecraftWindow: () => ({ clientProcessId: 1234,
        foreground: true, bounds: { x: 0, y: 0, width: 900, height: 600 } }),
      now: () => now,
    });
    const pendingDisplay = controller.display(frame());
    expect(finishLoad).toBeDefined();
    controller.stop();
    finishLoad?.();
    await expect(pendingDisplay).resolves.toBe(false);
    expect(window.showInactive).not.toHaveBeenCalled();
    expect(window.webContents.send).not.toHaveBeenCalledWith(
      DESKTOP_ENVIRONMENT_MISSION_HUD_RENDER_CHANNEL, expect.anything());
  });

  it("does not let an obsolete load failure stop a newer HUD", async () => {
    const oldWindow = makeWindow();
    let failOldLoad: ((reason: Error) => void) | undefined;
    oldWindow.loadURL.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      failOldLoad = reject;
    }));
    const newWindow = makeWindow();
    const createWindow = vi.fn()
      .mockReturnValueOnce(oldWindow as EnvironmentMissionHudWindow)
      .mockReturnValueOnce(newWindow as EnvironmentMissionHudWindow);
    const controller = new EnvironmentMissionHudController({ createWindow,
      readCurrentIdentity: () => identity,
      readVerifiedMinecraftWindow: () => ({ clientProcessId: 1234,
        foreground: true, bounds: { x: 0, y: 0, width: 900, height: 600 } }),
      now: () => now });
    const oldDisplay = controller.display(frame());
    controller.stop();
    await expect(controller.display(frame())).resolves.toBe(true);
    failOldLoad?.(new Error("obsolete renderer failed"));
    await expect(oldDisplay).resolves.toBe(false);
    expect(newWindow.showInactive).toHaveBeenCalledOnce();
    expect(newWindow.destroy).not.toHaveBeenCalled();
  });

  it("fails closed when the native target attestor is unavailable", async () => {
    const createWindow = vi.fn(() => makeWindow() as EnvironmentMissionHudWindow);
    const controller = new EnvironmentMissionHudController({ createWindow,
      readCurrentIdentity: () => identity,
      readVerifiedMinecraftWindow: () => { throw new Error("native probe unavailable"); },
      now: () => now,
    });
    await expect(controller.display(frame())).resolves.toBe(false);
    expect(createWindow).not.toHaveBeenCalled();
  });
});
