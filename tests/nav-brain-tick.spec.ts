import { describe, expect, it, vi } from "vitest";
import { createFixedHzBrainLoop } from "../client/src/lib/nav/brain-tick";

describe("fixed hz brain loop", () => {
  it("ticks at fixed cadence with drift compensation", () => {
    vi.useFakeTimers();
    let now = 0;
    const ticks: Array<{ tick: number; dt_s: number; drift_ms: number }> = [];

    const loop = createFixedHzBrainLoop({
      hz: 10,
      now: () => now,
      onTick: (ctx) => ticks.push({ tick: ctx.tick, dt_s: ctx.dt_s, drift_ms: ctx.drift_ms }),
    });

    loop.start();
    now = 99;
    vi.advanceTimersByTime(99);
    expect(ticks).toHaveLength(0);

    now = 100;
    vi.advanceTimersByTime(1);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.dt_s).toBeCloseTo(0.1, 6);

    now = 450;
    vi.advanceTimersByTime(350);
    expect(ticks.length).toBeGreaterThanOrEqual(4);

    loop.stop();
    vi.useRealTimers();
  });

  it("clamps hz to safe 10-20 range", () => {
    vi.useFakeTimers();
    let now = 0;
    const dt: number[] = [];

    const loop = createFixedHzBrainLoop({
      hz: 200,
      now: () => now,
      onTick: ({ dt_s }) => dt.push(dt_s),
    });

    loop.start();
    now = 50;
    vi.advanceTimersByTime(50);
    expect(dt[0]).toBeCloseTo(0.05, 6);

    loop.stop();
    vi.useRealTimers();
  });
});
