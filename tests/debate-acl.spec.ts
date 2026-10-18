import type { Request } from "express";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveDebatePersonaId } from "../server/routes/agi.debate";

type AuthenticatedRequest = Request & { auth?: { sub?: string; role?: string } };

describe("debate persona resolution", () => {
  const originalAuth = process.env.ENABLE_AUTH;
  const originalAdmin = process.env.ALLOW_ADMIN;

  beforeEach(() => {
    process.env.ENABLE_AUTH = "1";
    process.env.ALLOW_ADMIN = "0";
  });

  afterEach(() => {
    process.env.ENABLE_AUTH = originalAuth;
    process.env.ALLOW_ADMIN = originalAdmin;
  });

  it("falls back to requester persona when restricted", () => {
    const req = { auth: { sub: "persona:alice" } } as AuthenticatedRequest;
    const resolved = resolveDebatePersonaId(req, "");
    expect(resolved).toBe("persona:alice");
  });

  it("preserves explicit persona when provided", () => {
    const req = { auth: { sub: "persona:alice" } } as AuthenticatedRequest;
    const resolved = resolveDebatePersonaId(req, "persona:bob");
    expect(resolved).toBe("persona:bob");
  });
});
