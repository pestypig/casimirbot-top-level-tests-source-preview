import { afterEach, describe, expect, it, vi } from "vitest";
import { request as httpRequest } from "node:http";
import express from "express";
import { createAuth0WebAuthRouter } from "../server/routes/auth0-web-auth";
import { createDesktopSessionGuard, resolveDesktopSessionConfig } from "../server/security/desktop-session";
import {
  startAuth0LoopbackCallback,
  type Auth0LoopbackCallbackLease,
} from "../apps/desktop/src/auth0-loopback-callback";

const leases: Auth0LoopbackCallbackLease[] = [];
const state = "s".repeat(43);
const start = async (onCallback: (url: string) => void): Promise<Auth0LoopbackCallbackLease> => {
  const lease = await startAuth0LoopbackCallback({
    expectedState: state,
    port: 0,
    onCallback,
  });
  leases.push(lease);
  return lease;
};

afterEach(async () => {
  await Promise.all(leases.splice(0).map((lease) => lease.close()));
  vi.unstubAllEnvs();
});

describe("native Auth0 loopback return", () => {
  it("admits only one exact-state return and strips the browser-visible query", async () => {
    const received = vi.fn();
    const lease = await start(received);
    const wrongState = await fetch(`${lease.callbackUri}?code=valid-code-123&state=${"x".repeat(43)}`);
    expect(wrongState.status).toBe(400);
    expect(received).not.toHaveBeenCalled();

    const valid = await fetch(`${lease.callbackUri}?code=valid-code-123&state=${state}`, {
      redirect: "manual",
    });
    expect(valid.status).toBe(303);
    expect(valid.headers.get("location")).toBe(lease.callbackUri.replace("/callback", "/complete"));
    expect(valid.headers.get("referrer-policy")).toBe("no-referrer");
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toContain("code=valid-code-123");
    const complete = await fetch(valid.headers.get("location")!);
    expect(complete.status).toBe(200);
    expect(await complete.text()).not.toContain("valid-code-123");
    const replay = await fetch(`${lease.callbackUri}?code=valid-code-123&state=${state}`);
    expect(replay.status).toBe(404);
    expect(received).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong host, method, path and duplicate code without consuming", async () => {
    const received = vi.fn();
    const lease = await start(received);
    const url = `${lease.callbackUri}?code=valid-code-123&state=${state}`;
    expect((await fetch(url, { method: "POST" })).status).toBe(404);
    const wrongHostStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(url, { headers: { Host: "evil.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      request.on("error", reject);
      request.end();
    });
    expect(wrongHostStatus).toBe(404);
    expect((await fetch(url.replace("/callback", "/other"))).status).toBe(400);
    expect((await fetch(`${url}&code=second-code-456`)).status).toBe(400);
    expect(received).not.toHaveBeenCalled();
  });

  it("releases the port on close and fails closed when it is occupied", async () => {
    const lease = await start(vi.fn());
    const port = Number(new URL(lease.callbackUri).port);
    await expect(startAuth0LoopbackCallback({
      expectedState: state,
      port,
      onCallback: vi.fn(),
    })).rejects.toThrow("desktop_auth0_callback_port_unavailable");
    await lease.close();
    const next = await startAuth0LoopbackCallback({
      expectedState: state,
      port,
      onCallback: vi.fn(),
    });
    leases.push(next);
    expect(next.callbackUri).toBe(lease.callbackUri);
  });

  it("accepts the registered profile path without accepting the account-link path", async () => {
    const received = vi.fn();
    const lease = await startAuth0LoopbackCallback({
      expectedState: state,
      port: 0,
      callbackPath: "/api/auth/auth0/callback",
      onCallback: received,
    });
    leases.push(lease);
    expect(lease.callbackUri).toMatch(/\/api\/auth\/auth0\/callback$/u);
    expect((await fetch(`${new URL(lease.callbackUri).origin}/callback?code=valid-code-123&state=${state}`)).status).toBe(400);
    expect(received).not.toHaveBeenCalled();
    const result = await fetch(`${lease.callbackUri}?code=valid-code-123&state=${state}`, {
      redirect: "manual",
    });
    expect(result.status).toBe(303);
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(
      `${lease.callbackUri}?code=valid-code-123&state=${state}`,
    ));
    expect(received).toHaveBeenCalledTimes(1);
  });

  it("forwards the browser return to the keyed service and claims the session outside Chrome", async () => {
    const secret = "test-only-desktop-secret-123456789012345";
    const claimRef = "claim_" + "a".repeat(40);
    const sessionId = "account_session:12345678-1234-1234-1234-123456789abc";
    vi.stubEnv("CASIMIR_DESKTOP_HOST", "1");
    vi.stubEnv("CASIMIR_DESKTOP_SESSION_SECRET", secret);
    let completed = false;
    const controller = {
      start: vi.fn(),
      startDesktop: vi.fn(() => ({ authorizationUrl: "https://tenant.example/authorize?state=opaque",
        claimRef, expiresAt: "2030-01-01T00:00:00Z" })),
      complete: vi.fn(async () => {
        completed = true;
        return { receipt: { ok: true, session: { session_id: sessionId } },
          returnTo: "/desktop", desktopClaim: true };
      }),
      consumeDesktop: vi.fn(() => completed
        ? { state: "ready" as const, sessionId }
        : { state: "pending" as const }),
    };
    const app = express();
    app.use(createDesktopSessionGuard(resolveDesktopSessionConfig(process.env)));
    app.use("/api/auth", createAuth0WebAuthRouter({ controller }));
    const service = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const server = app.listen(0, "127.0.0.1", () => resolve(server));
    });
    try {
      const address = service.address();
      if (!address || typeof address === "string") throw new Error("No service address");
      const serviceOrigin = `http://127.0.0.1:${address.port}`;
      const startResponse = await fetch(`${serviceOrigin}/api/auth/auth0/desktop-start`, {
        method: "POST", headers: { "x-casimir-desktop-session": secret },
      });
      expect(startResponse.status).toBe(200);
      expect((await startResponse.json() as { claim_ref: string }).claim_ref).toBe(claimRef);

      let forwardedStatus: number | null = null;
      const forwarded = vi.fn(async (callbackUrl: string) => {
        const callback = new URL(callbackUrl);
        const response = await fetch(`${serviceOrigin}${callback.pathname}${callback.search}`, {
          headers: { "x-casimir-desktop-session": secret }, redirect: "manual",
        });
        forwardedStatus = response.status;
      });
      const lease = await startAuth0LoopbackCallback({
        expectedState: state, port: 0, callbackPath: "/api/auth/auth0/callback",
        onCallback: forwarded,
      });
      leases.push(lease);
      const browserReturn = await fetch(`${lease.callbackUri}?code=valid-code-123&state=${state}`, {
        redirect: "manual",
      });
      expect(browserReturn.status).toBe(303);
      expect(browserReturn.headers.get("set-cookie")).toBeNull();
      expect(browserReturn.headers.get("location")).toBe(`${new URL(lease.callbackUri).origin}/complete`);
      await vi.waitFor(() => expect(forwarded).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(forwardedStatus).toBe(200));
      await vi.waitFor(() => expect(completed).toBe(true));
      const claim = await fetch(`${serviceOrigin}/api/auth/auth0/desktop-claim`, {
        method: "POST",
        headers: { "x-casimir-desktop-session": secret, "Content-Type": "application/json" },
        body: JSON.stringify({ claim_ref: claimRef }),
      });
      expect(claim.status).toBe(200);
      expect(claim.headers.get("set-cookie")).toContain("helix_session=");
      expect(claim.headers.get("set-cookie")).toContain("HttpOnly");
      expect(controller.complete).toHaveBeenCalledWith({ code: "valid-code-123", state });
    } finally {
      await new Promise<void>((resolve, reject) =>
        service.close((error) => error ? reject(error) : resolve()));
    }
  });
});
