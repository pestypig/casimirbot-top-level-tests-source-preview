import { describe, expect, it } from "vitest";
import { rendererLoadDiagnosticLabel } from "../apps/desktop/src/renderer-load-diagnostic";

describe("bounded desktop renderer diagnostics", () => {
  it("records lifecycle labels without granting readiness authority", () => {
    for (const kind of ["load_started", "load_finished", "ready_to_show", "preload_failed", "load_rejected"] as const)
      expect(rendererLoadDiagnosticLabel({ kind })).toBe(`renderer ${kind}`);
  });
  it("distinguishes navigation failure and its frame without a URL", () => {
    expect(rendererLoadDiagnosticLabel({ kind: "load_failed", errorCode: -6, isMainFrame: true }))
      .toBe("renderer load_failed code=-6 frame=main");
    expect(rendererLoadDiagnosticLabel({ kind: "load_failed", errorCode: -3, isMainFrame: false }))
      .toBe("renderer load_failed code=-3 frame=sub");
  });
  it("rejects unbounded numeric diagnostic values", () => {
    for (const errorCode of [NaN, Infinity, 1.5, 65536, -65536])
      expect(rendererLoadDiagnosticLabel({ kind: "load_failed", errorCode, isMainFrame: true }))
        .toBe("renderer load_failed code=unknown frame=main");
  });
  it("does not reflect unknown reasons or payloads", () => {
    expect(rendererLoadDiagnosticLabel({ kind: "renderer_gone", reason: "https://private.invalid/?token=secret\nforged", exitCode: Infinity }))
      .toBe("renderer renderer_gone reason=unknown code=unknown");
    expect(rendererLoadDiagnosticLabel({ kind: "renderer_gone", reason: "oom", exitCode: 9 }))
      .toBe("renderer renderer_gone reason=oom code=9");
  });
});
