import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  startDesktopMcpTunnelScopeRouter,
  type DesktopMcpTunnelScopeRouter,
} from "../apps/desktop/src/mcp-tunnel-scope-router";

const closeCallbacks: Array<() => Promise<void>> = [];

const startUpstream = async () => {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      method: request.method ?? "",
      url: request.url ?? "",
      body: Buffer.concat(chunks).toString("utf8"),
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ path: request.url }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  closeCallbacks.push(() => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  ));
  const address = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${address.port}`, requests };
};

describe("desktop MCP tunnel stable scope router", () => {
  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  it("changes only the loopback target while preserving one public route", async () => {
    const upstream = await startUpstream();
    const router: DesktopMcpTunnelScopeRouter =
      await startDesktopMcpTunnelScopeRouter({
        runtimeOrigin: upstream.origin,
      });
    closeCallbacks.push(router.close);

    const first = await fetch(`${router.origin}/mcp?session=stable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1 }),
    });
    expect(first.status).toBe(200);
    expect(upstream.requests[0]).toMatchObject({
      method: "POST",
      url: "/mcp/local-supervisor-coordination?session=stable",
    });

    const originBefore = router.origin;
    router.setScope("full_helix_agent");
    const second = await fetch(`${router.origin}/mcp?session=stable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2 }),
    });
    expect(second.status).toBe(200);
    expect(router.origin).toBe(originBefore);
    expect(router.getScope()).toBe("full_helix_agent");
    expect(upstream.requests[1]).toMatchObject({
      method: "POST",
      url: "/mcp?session=stable",
    });
  });

  it("fails closed for non-MCP paths", async () => {
    const upstream = await startUpstream();
    const router = await startDesktopMcpTunnelScopeRouter({
      runtimeOrigin: upstream.origin,
    });
    closeCallbacks.push(router.close);
    const response = await fetch(`${router.origin}/api/account/session`);
    expect(response.status).toBe(404);
    expect(upstream.requests).toHaveLength(0);
  });
});
