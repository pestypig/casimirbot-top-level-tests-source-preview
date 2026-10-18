import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MODULE_PATH = "../server/services/observability/tool-log-store";

const originalEnv = {
  TOOL_LOG_STDOUT: process.env.TOOL_LOG_STDOUT,
  TOOL_LOG_COMPACT_HIGH_VOLUME: process.env.TOOL_LOG_COMPACT_HIGH_VOLUME,
  TOOL_LOG_RECORD_MAX_FIELD_CHARS: process.env.TOOL_LOG_RECORD_MAX_FIELD_CHARS,
  TOOL_LOG_HIGH_VOLUME_FIELD_CHARS: process.env.TOOL_LOG_HIGH_VOLUME_FIELD_CHARS,
};

const applyEnv = (next: {
  TOOL_LOG_STDOUT?: string;
  TOOL_LOG_COMPACT_HIGH_VOLUME?: string;
  TOOL_LOG_RECORD_MAX_FIELD_CHARS?: string;
  TOOL_LOG_HIGH_VOLUME_FIELD_CHARS?: string;
}): void => {
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      (process.env as Record<string, string | undefined>)[key] = value;
    }
  }
};

describe("tool-log store compaction", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    applyEnv(originalEnv);
  });

  it("compacts high-volume Helix Ask records by clipping fields and dropping meta", async () => {
    applyEnv({
      TOOL_LOG_STDOUT: "0",
      TOOL_LOG_COMPACT_HIGH_VOLUME: "1",
    });
    const toolLogStore = await import(MODULE_PATH);
    toolLogStore.__resetToolLogStore();
    const long = "x".repeat(1200);

    toolLogStore.appendToolLog({
      tool: "helix.ask.event",
      version: "v1",
      paramsHash: "h1",
      durationMs: 1,
      ok: false,
      detail: long,
      message: long,
      text: long,
      error: long,
      meta: { payload: long },
    });

    const record = toolLogStore.getToolLogs({ limit: 1 })[0];
    expect(record).toBeTruthy();
    expect(record.meta).toBeUndefined();
    expect((record.detail ?? "").endsWith("...")).toBe(true);
    expect((record.message ?? "").endsWith("...")).toBe(true);
    expect((record.text ?? "").endsWith("...")).toBe(true);
    expect((record.error ?? "").endsWith("...")).toBe(true);
    expect((record.detail ?? "").length).toBeLessThanOrEqual(320);
    expect((record.message ?? "").length).toBeLessThanOrEqual(320);
    expect((record.text ?? "").length).toBeLessThanOrEqual(320);
    expect((record.error ?? "").length).toBeLessThanOrEqual(320);
  });

  it("retains meta for non-high-volume tools while clipping by record limit", async () => {
    applyEnv({
      TOOL_LOG_STDOUT: "0",
      TOOL_LOG_COMPACT_HIGH_VOLUME: "1",
    });
    const toolLogStore = await import(MODULE_PATH);
    toolLogStore.__resetToolLogStore();
    const long = "x".repeat(1800);

    toolLogStore.appendToolLog({
      tool: "demo.tool",
      version: "v1",
      paramsHash: "h2",
      durationMs: 1,
      ok: true,
      text: long,
      meta: { kept: true },
    });

    const record = toolLogStore.getToolLogs({ limit: 1 })[0];
    expect(record).toBeTruthy();
    expect(record.meta).toEqual({ kept: true });
    expect((record.text ?? "").endsWith("...")).toBe(true);
    expect((record.text ?? "").length).toBeLessThanOrEqual(1600);
  });
});
