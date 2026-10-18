import { describe, expect, it, vi } from "vitest";

import { createHelixAskExecutionObservability } from "../server/services/helix-ask/runtime/ask-execution-observability";

describe("helix ask execution observability", () => {
  it("records progress and event history with clipping and history bounds", () => {
    const logProgressRecord = vi.fn();
    const appendToolLog = vi.fn();
    const observability = createHelixAskExecutionObservability({
      askSessionId: "session-1",
      askTraceId: "trace-1",
      debugLogsEnabled: false,
      captureLiveHistory: true,
      eventHistoryLimit: 2,
      eventMaxChars: 20,
      eventFileLimit: 3,
      reportContext: null,
      logProgressRecord,
      appendToolLog,
      hashProgress: (value) => `hash:${value}`,
      consoleLog: vi.fn(),
    });

    observability.logProgress("Stage", "detail", Date.now() - 10, true);
    observability.logEvent("Event", "done", "abcdefghijklmnopqrstuvwxyz", Date.now() - 5, true, {
      key: "value",
    });
    observability.logEvent("Event2", "done", "tail", undefined, true);

    expect(logProgressRecord).toHaveBeenCalledOnce();
    expect(appendToolLog).toHaveBeenCalledTimes(2);
    expect(observability.liveEventHistory).toHaveLength(2);
    expect(observability.liveEventHistory[0]?.stage).toBe("Event");
    expect(String(observability.liveEventHistory[0]?.text)).toContain("...");
    expect(observability.liveEventHistory[1]?.stage).toBe("Event2");
  });

  it("formats file lists with dedupe and remainder counts", () => {
    const observability = createHelixAskExecutionObservability({
      askSessionId: "session-1",
      askTraceId: "trace-1",
      debugLogsEnabled: false,
      captureLiveHistory: false,
      eventHistoryLimit: 10,
      eventMaxChars: 100,
      eventFileLimit: 2,
      reportContext: null,
      logProgressRecord: vi.fn(),
      appendToolLog: vi.fn(),
      hashProgress: (value) => value,
      consoleLog: vi.fn(),
    });

    expect(
      observability.formatFileList(["a.ts", "a.ts", "b.ts", "c.ts"]),
    ).toBe("- a.ts\n- b.ts\n- ...and 1 more");
  });

  it("merges report block metadata into event payloads", () => {
    const appendToolLog = vi.fn();
    const observability = createHelixAskExecutionObservability({
      askSessionId: "session-1",
      askTraceId: "trace-1",
      debugLogsEnabled: false,
      captureLiveHistory: true,
      eventHistoryLimit: 10,
      eventMaxChars: 100,
      eventFileLimit: 2,
      reportContext: { blockIndex: 2, blockCount: 5 },
      logProgressRecord: vi.fn(),
      appendToolLog,
      hashProgress: (value) => value,
      consoleLog: vi.fn(),
    });

    observability.logEvent("Report", "done", "body", undefined, true, { local: true });

    expect(appendToolLog).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { blockIndex: 2, blockCount: 5, local: true },
      }),
    );
    expect(observability.liveEventHistory[0]?.meta).toEqual({
      blockIndex: 2,
      blockCount: 5,
      local: true,
    });
  });

  it("composes step start/end helpers through progress and event logging", () => {
    const logProgressRecord = vi.fn();
    const appendToolLog = vi.fn();
    const observability = createHelixAskExecutionObservability({
      askSessionId: "session-1",
      askTraceId: "trace-1",
      debugLogsEnabled: false,
      captureLiveHistory: true,
      eventHistoryLimit: 10,
      eventMaxChars: 100,
      eventFileLimit: 2,
      reportContext: null,
      logProgressRecord,
      appendToolLog,
      hashProgress: (value) => value,
      consoleLog: vi.fn(),
    });

    const startedAt = observability.logStepStart("Retrieval", "starting", { path: "repo" });
    observability.logStepEnd("Retrieval", "done", startedAt, true, { hits: 3 });

    expect(logProgressRecord).toHaveBeenCalledTimes(2);
    expect(appendToolLog).toHaveBeenCalledTimes(2);
    expect(observability.liveEventHistory).toHaveLength(4);
    expect(observability.liveEventHistory[0]?.detail).toBe("start");
    expect(observability.liveEventHistory[2]?.detail).toBe("done");
  });
});
