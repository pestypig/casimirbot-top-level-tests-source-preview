import { describe, expect, it, vi } from "vitest";
import {
  startDesktopTier1ScreenSession,
  stopDesktopTier1ScreenSession,
  type ContextLifecycleEvent,
} from "../client/src/lib/mission-overwatch";

describe("mission context session lifecycle", () => {
  it("emits started and stopped lifecycle events", async () => {
    const events: ContextLifecycleEvent[] = [];
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(stream),
      },
    });

    const next = await startDesktopTier1ScreenSession((event) => events.push(event));
    expect(next).toBe(stream);
    expect(events[0]?.eventType).toBe("context_session_requesting");
    expect(events[0]?.sessionState).toBe("requesting");
    expect(events.some((entry) => entry.eventType === "context_session_started")).toBe(true);

    stopDesktopTier1ScreenSession(stream, (event) => events.push(event));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(events.filter((entry) => entry.eventType === "context_session_stopped").length).toBeGreaterThanOrEqual(2);
  });

  it("emits error lifecycle event when capture fails", async () => {
    const events: ContextLifecycleEvent[] = [];
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    const next = await startDesktopTier1ScreenSession((event) => events.push(event));
    expect(next).toBeNull();
    expect(events.some((entry) => entry.eventType === "context_session_error")).toBe(true);
  });
});
