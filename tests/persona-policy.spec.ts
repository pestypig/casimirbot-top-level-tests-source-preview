import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { personaPolicy } from "../server/auth/policy";
import type { JwtClaims } from "../server/auth/jwt";

const originalEnableAuth = process.env.ENABLE_AUTH;
const originalAllowAdmin = process.env.ALLOW_ADMIN;

const restoreEnv = (): void => {
  if (originalEnableAuth === undefined) {
    delete process.env.ENABLE_AUTH;
  } else {
    process.env.ENABLE_AUTH = originalEnableAuth;
  }
  if (originalAllowAdmin === undefined) {
    delete process.env.ALLOW_ADMIN;
  } else {
    process.env.ALLOW_ADMIN = originalAllowAdmin;
  }
};

describe("persona policy", () => {
  beforeEach(() => {
    process.env.ENABLE_AUTH = "1";
    process.env.ALLOW_ADMIN = "0";
  });

  afterEach(() => {
    restoreEnv();
  });

  it("defaults to allowing the token subject to manage their persona", () => {
    const claims: JwtClaims = { sub: "alice" };
    expect(personaPolicy.canAccess(claims, "alice", "plan")).toBe(true);
    expect(personaPolicy.canAccess(claims, "bob", "plan")).toBe(false);
  });

  it("respects explicit personaAcl entries with scoped permissions", () => {
    const claims: JwtClaims = {
      sub: "alice",
      personaAcl: [
        { id: "bob", scopes: ["plan"] },
        { id: "carol", scopes: ["memory:read"] },
      ],
    };
    expect(personaPolicy.canAccess(claims, "bob", "plan")).toBe(true);
    expect(personaPolicy.canAccess(claims, "bob", "memory:read")).toBe(false);
    const allowed = personaPolicy.allowedPersonas(claims, "memory:read");
    expect(allowed.has("alice")).toBe(true);
    expect(allowed.has("carol")).toBe(true);
    expect(allowed.has("bob")).toBe(false);
  });

  it("ingests persona_acl records", () => {
    const claims: JwtClaims = {
      sub: "root",
      persona_acl: {
        delta: ["plan"],
        echo: ["memory:read"],
      },
    };
    expect(personaPolicy.canAccess(claims, "delta", "plan")).toBe(true);
    expect(personaPolicy.canAccess(claims, "delta", "memory:read")).toBe(false);
    const allowed = personaPolicy.allowedPersonas(claims, "memory:read");
    expect(allowed.has("root")).toBe(true);
    expect(allowed.has("echo")).toBe(true);
    expect(allowed.has("delta")).toBe(false);
  });

  it("skips enforcement when ALLOW_ADMIN=1", () => {
    process.env.ALLOW_ADMIN = "1";
    const claims: JwtClaims = { sub: "noop" };
    expect(personaPolicy.canAccess(claims, "anyone", "plan")).toBe(true);
  });

  it("skips enforcement for admin role claims", () => {
    const claims: JwtClaims = { sub: "ops", role: "admin" };
    expect(personaPolicy.canAccess(claims, "charlie", "plan")).toBe(true);
    process.env.ALLOW_ADMIN = "0";
    const restrictedClaims: JwtClaims = { sub: "ops", role: "admin" };
    expect(personaPolicy.canAccess(restrictedClaims, "charlie", "memory:write")).toBe(true);
  });
});
