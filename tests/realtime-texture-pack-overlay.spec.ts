import { describe, expect, it, vi } from "vitest";
import {
  buildLocalPassthroughProjectionFrame,
  buildRealtimeTexturePackConfig,
  buildRealtimeTexturePackTransformRequest,
} from "../shared/realtime-texture-pack";
import {
  RealtimeTexturePackOverlayController,
  type TexturePackOverlayWindow,
} from "../apps/desktop/src/realtime-texture-pack-overlay";
import { DESKTOP_TEXTURE_PACK_OVERLAY_RENDER_CHANNEL } from "../apps/desktop/src/channels";

const makeWindow = () => {
  const sent: Array<[string, unknown]> = [];
  const window = {
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(async () => undefined),
    showInactive: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    setBounds: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setFocusable: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setSkipTaskbar: vi.fn(),
    webContents: {
      send: vi.fn((channel: string, payload?: unknown) => sent.push([channel, payload])),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    },
  } as unknown as TexturePackOverlayWindow;
  return { window, sent };
};

const makeFixture = () => {
  const config = buildRealtimeTexturePackConfig({
    sessionId: "texture-session:test",
    sourceId: "texture-source:test",
    sourceSurface: "window",
  });
  const request = buildRealtimeTexturePackTransformRequest({
    config,
    requestId: "texture-request:test:1",
    sourceFrameId: "source-frame:test:1",
    sourceCapturedAt: "2026-08-27T12:00:00.000Z",
    sourceImageDataUrl: "data:image/jpeg;base64,AA==",
  });
  const frame = buildLocalPassthroughProjectionFrame({
    request,
    projectionFrameId: "projection:test:1",
    completedAt: "2026-08-27T12:00:00.100Z",
  });
  return { config, frame };
};

describe("RealtimeTexturePackOverlayController", () => {
  it("creates a non-focusable click-through overlay and forwards a current frame", async () => {
    const fixture = makeFixture();
    const native = makeWindow();
    const controller = new RealtimeTexturePackOverlayController({
      createWindow: () => native.window,
      getDisplayBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
      now: () => new Date("2026-08-27T12:00:00.200Z"),
    });

    const shown = await controller.show(fixture.config);
    const updated = controller.updateFrame(fixture.frame);

    expect(shown.overlay_visible).toBe(true);
    expect(native.window.setFocusable).toHaveBeenCalledWith(false);
    expect(native.window.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(native.window.showInactive).toHaveBeenCalledTimes(1);
    expect(native.sent).toContainEqual([
      DESKTOP_TEXTURE_PACK_OVERLAY_RENDER_CHANNEL,
      fixture.frame.projection_image_data_url,
    ]);
    expect(updated.last_projection_frame_id).toBe(fixture.frame.projection_frame_id);
  });

  it("reveals the original without stopping capture and rejects a mismatched session", async () => {
    const fixture = makeFixture();
    const native = makeWindow();
    const controller = new RealtimeTexturePackOverlayController({
      createWindow: () => native.window,
      getDisplayBounds: () => ({ x: 0, y: 0, width: 1280, height: 720 }),
      now: () => new Date("2026-08-27T12:00:00.200Z"),
    });
    await controller.show(fixture.config);

    const revealed = controller.revealOriginal(true);
    expect(revealed.status).toBe("reveal_original");
    expect(revealed.capture_active).toBe(true);
    expect(native.window.hide).toHaveBeenCalledTimes(1);
    expect(() => controller.updateFrame({ ...fixture.frame, session_id: "wrong" })).toThrow(
      "realtime_texture_pack_session_mismatch",
    );
    controller.stop();
    expect(native.window.destroy).toHaveBeenCalledTimes(1);
  });

  it("hides instead of displaying a stale frame", async () => {
    const fixture = makeFixture();
    const native = makeWindow();
    const controller = new RealtimeTexturePackOverlayController({
      createWindow: () => native.window,
      getDisplayBounds: () => ({ x: 0, y: 0, width: 1280, height: 720 }),
      now: () => new Date("2026-08-27T12:00:05.000Z"),
    });
    await controller.show(fixture.config);

    const state = controller.updateFrame(fixture.frame);
    expect(state.status).toBe("degraded");
    expect(state.overlay_visible).toBe(false);
    expect(state.failure_reason).toBe("realtime_texture_pack_stale_frame");
    expect(native.window.hide).toHaveBeenCalledTimes(1);
    expect(native.sent.some(([channel]) => channel === DESKTOP_TEXTURE_PACK_OVERLAY_RENDER_CHANNEL)).toBe(false);
  });
});
