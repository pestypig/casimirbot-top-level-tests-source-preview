import { describe, expect, it } from "vitest";
import { isDesktopMcpTransitionSameOrigin } from
  "../server/routes/desktop-mcp-tunnel-transition";

describe("desktop MCP transition consent origin boundary", () => {
  it("admits only an exact same-origin browser mutation", () => {
    const valid = {
      fetchSite: "same-origin",
      origin: "http://127.0.0.1:43123",
      host: "127.0.0.1:43123",
      protocol: "http",
    };
    expect(isDesktopMcpTransitionSameOrigin(valid)).toBe(true);
    for (const invalid of [
      { ...valid, fetchSite: "cross-site" },
      { ...valid, origin: null },
      { ...valid, origin: "not-a-url" },
      { ...valid, origin: "https://127.0.0.1:43123" },
      { ...valid, origin: "http://127.0.0.1:43124" },
      { ...valid, origin: "http://user:password@127.0.0.1:43123" },
      { ...valid, origin: "http://127.0.0.1:43123/path" },
      { ...valid, origin: "http://127.0.0.1:43123/?token=secret" },
    ]) expect(isDesktopMcpTransitionSameOrigin(invalid)).toBe(false);
  });
});
