import { describe, expect, it } from "vitest";
import { buildSpawnExecution, extractStopReason } from "../scripts/helix-ask-quake-weight-tuning";

describe("helix quake weight tuning stop reason extraction", () => {
  it("prefers debug stop reasons and falls back to row.stop_reason", () => {
    expect(
      extractStopReason({
        stop_reason: "fallback",
        debug: { agent_stop_reason: "clocka_tool_cap", controller_stop_reason: "controller" },
      }),
    ).toBe("clocka_tool_cap");

    expect(
      extractStopReason({
        stop_reason: "fallback",
        debug: { controller_stop_reason: "clocka_tool_cap" },
      }),
    ).toBe("clocka_tool_cap");

    expect(extractStopReason({ stop_reason: "clocka_tool_cap" })).toBe("clocka_tool_cap");
  });
});

describe("helix quake weight tuning command runner portability", () => {
  it("uses shell-enabled spawn execution for Windows", () => {
    const execution = buildSpawnExecution("npx", ["tsx", "scripts/helix-ask-versatility-record.ts"], "win32");

    expect(execution.shell).toBe(true);
    expect(execution.command).toBe("npx tsx scripts/helix-ask-versatility-record.ts");
    expect(execution.args).toEqual([]);
  });

  it("uses direct command + args execution for non-Windows platforms", () => {
    const execution = buildSpawnExecution("npx", ["tsx", "scripts/helix-ask-versatility-record.ts"], "linux");

    expect(execution.shell).toBe(false);
    expect(execution.command).toBe("npx");
    expect(execution.args).toEqual(["tsx", "scripts/helix-ask-versatility-record.ts"]);
  });
});
