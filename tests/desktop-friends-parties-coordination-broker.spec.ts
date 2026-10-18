import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startDesktopFriendsPartiesCoordinationBroker } from
  "../apps/desktop/src/friends-parties-coordination-broker";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) =>
    server.close(() => resolve()),
  )));
});

const startRemote = async (): Promise<string> => {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/account/session/friends-parties-coordination/exchange") {
      if (req.headers.authorization !== "Bearer native-access-secret") {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": "helix_session=domain-session-secret; Path=/; HttpOnly; SameSite=Lax",
        "Cache-Control": "no-store, private",
      });
      res.end(JSON.stringify({
        schema: "helix.friends_parties.coordination_session.v1",
        ok: true,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        profile_ref: "social_profile:sha256:0123456789abcdef01234567",
      }));
      return;
    }
    if (req.url === "/api/agi/friends-parties") {
      if (req.headers.cookie !== "helix_session=domain-session-secret") {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, private",
      });
      res.end(JSON.stringify({
        schema: "helix.friends_parties.response.v1",
        ok: true,
        profile: { handle: "remote-friend" },
      }));
      return;
    }
    res.writeHead(404).end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const brokerCall = async (
  origin: string,
  token: string,
  path: string,
  body: unknown,
) => fetch(`${origin}${path}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

describe("desktop Friends & Parties coordination broker", () => {
  it("holds the domain session in native memory and proxies only the bound local profile", async () => {
    const remoteOrigin = await startRemote();
    const broker = await startDesktopFriendsPartiesCoordinationBroker({
      remoteOrigin,
      allowInsecureLoopback: true,
    });
    try {
      const bootstrap = await brokerCall(broker.origin, broker.token, "/v1/bootstrap", {
        accessToken: "native-access-secret",
        localProfileId: "profile:local-owner",
        localSessionId: "account_session:local-owner",
      });
      expect(bootstrap.status).toBe(200);
      const bootstrapBody = await bootstrap.json();
      expect(bootstrapBody).toMatchObject({
        ok: true,
        ready: true,
        bearer_included: false,
        session_cookie_included: false,
      });
      expect(JSON.stringify(bootstrapBody)).not.toContain("native-access-secret");
      expect(JSON.stringify(bootstrapBody)).not.toContain("domain-session-secret");

      const proxied = await brokerCall(broker.origin, broker.token, "/v1/proxy", {
        localProfileId: "profile:local-owner",
        localSessionId: "account_session:local-owner",
        method: "GET",
        path: "/api/agi/friends-parties",
        body: null,
      });
      const proxiedBody = await proxied.json();
      expect(proxiedBody).toMatchObject({
        ok: true,
        upstream_status: 200,
        upstream_body: {
          schema: "helix.friends_parties.response.v1",
          ok: true,
        },
      });
      expect(JSON.stringify(proxiedBody)).not.toContain("domain-session-secret");

      const wrongProfile = await brokerCall(broker.origin, broker.token, "/v1/proxy", {
        localProfileId: "profile:other",
        localSessionId: "account_session:local-owner",
        method: "GET",
        path: "/api/agi/friends-parties",
        body: null,
      });
      expect(wrongProfile.status).toBe(401);
      expect(await wrongProfile.json()).toMatchObject({
        error: "coordination_session_unavailable",
      });
    } finally {
      await broker.close();
    }
  });

  it("rejects non-Friends paths before any upstream request", async () => {
    const remoteOrigin = await startRemote();
    const broker = await startDesktopFriendsPartiesCoordinationBroker({
      remoteOrigin,
      allowInsecureLoopback: true,
    });
    try {
      await brokerCall(broker.origin, broker.token, "/v1/bootstrap", {
        accessToken: "native-access-secret",
        localProfileId: "profile:local-owner",
        localSessionId: "account_session:local-owner",
      });
      const result = await brokerCall(broker.origin, broker.token, "/v1/proxy", {
        localProfileId: "profile:local-owner",
        localSessionId: "account_session:local-owner",
        method: "GET",
        path: "/api/account/session",
        body: null,
      });
      expect(result.status).toBe(400);
      expect(await result.json()).toMatchObject({ error: "coordination_path_invalid" });
    } finally {
      await broker.close();
    }
  });
});
