import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MODULE_PATH = "../server/services/observability/tool-log-store";

const originalEnv = {
  TOOL_LOG_STDOUT: process.env.TOOL_LOG_STDOUT,
  TOOL_LOG_STDOUT_VERBOSE: process.env.TOOL_LOG_STDOUT_VERBOSE,
  TOOL_LOG_STDOUT_MAX_FIELD_CHARS: process.env.TOOL_LOG_STDOUT_MAX_FIELD_CHARS,
};

const applyEnv = (next: {
  TOOL_LOG_STDOUT?: string;
  TOOL_LOG_STDOUT_VERBOSE?: string;
  TOOL_LOG_STDOUT_MAX_FIELD_CHARS?: string;
}): void => {
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      (process.env as Record<string, string | undefined>)[key] = value;
    }
  }
};

describe("tool-log stdout throttling", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    applyEnv(originalEnv);
  });

  it("suppresses high-volume Helix Ask stream/event logs on stdout by default", async () => {
    applyEnv({
      TOOL_LOG_STDOUT: "1",
      TOOL_LOG_STDOUT_VERBOSE: "0",
    });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const toolLogStore = await import(MODULE_PATH);
    toolLogStore.__resetToolLogStore();

    toolLogStore.appendToolLog({
      tool: "helix.ask.stream",
      version: "v1",
      paramsHash: "h1",
      durationMs: 1,
      ok: true,
      text: "stream output",
    });
    toolLogStore.appendToolLog({
      tool: "helix.ask.event",
      version: "v1",
      paramsHash: "h2",
      durationMs: 1,
      ok: true,
      text: "event output",
    });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("still logs non-Helix tool calls and truncates long fields", async () => {
    applyEnv({
      TOOL_LOG_STDOUT: "1",
      TOOL_LOG_STDOUT_VERBOSE: "0",
      TOOL_LOG_STDOUT_MAX_FIELD_CHARS: "24",
    });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const toolLogStore = await import(MODULE_PATH);
    toolLogStore.__resetToolLogStore();
    const longText = "x".repeat(260);

    toolLogStore.appendToolLog({
      tool: "demo.tool",
      version: "v1",
      paramsHash: "h1",
      durationMs: 2,
      ok: false,
      text: longText,
      error: longText,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const line = String(infoSpy.mock.calls[0]?.[0] ?? "");
    const payload = JSON.parse(line) as { tool?: string; text?: string; error?: string; type?: string };
    expect(payload.type).toBe("tool_call");
    expect(payload.tool).toBe("demo.tool");
    expect(payload.text?.endsWith("...")).toBe(true);
    expect(payload.error?.endsWith("...")).toBe(true);
    expect((payload.text ?? "").length).toBeLessThan(longText.length);
    expect((payload.error ?? "").length).toBeLessThan(longText.length);
  });

  it("emits full Helix Ask logs when verbose stdout is enabled", async () => {
    applyEnv({
      TOOL_LOG_STDOUT: "1",
      TOOL_LOG_STDOUT_VERBOSE: "1",
    });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const toolLogStore = await import(MODULE_PATH);
    toolLogStore.__resetToolLogStore();

    toolLogStore.appendToolLog({
      tool: "helix.ask.event",
      version: "v1",
      paramsHash: "h3",
      durationMs: 3,
      ok: true,
      text: "verbose event payload",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const line = String(infoSpy.mock.calls[0]?.[0] ?? "");
    const payload = JSON.parse(line) as { tool?: string; text?: string };
    expect(payload.tool).toBe("helix.ask.event");
    expect(payload.text).toBe("verbose event payload");
  });
});
