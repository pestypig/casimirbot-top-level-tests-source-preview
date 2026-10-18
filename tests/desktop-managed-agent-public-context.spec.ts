import { describe, expect, it, vi } from "vitest";
import { readManagedAgentPublicContext } from
  "../apps/desktop/src/managed-agent-public-context";

describe("native managed-agent public context read", () => {
  it("rejects oversized, non-text and empty responses without returning content", async () => {
    for (const response of [
      new Response("x".repeat(8_193), { headers: { "content-type": "text/plain" } }),
      new Response("{}", { headers: { "content-type": "application/json" } }),
      new Response("  ", { headers: { "content-type": "text/plain" } }),
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(response);
      expect(await readManagedAgentPublicContext({ fetchImpl })).toBeNull();
      expect(fetchImpl).toHaveBeenCalledWith("https://casimirbot.com/llms.txt",
        expect.objectContaining({ method: "GET", redirect: "error",
          headers: { Accept: "text/plain" } }));
    }
  });
});
