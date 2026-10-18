import { beforeEach, describe, expect, it } from "vitest";
import { assertHullAllowed, isHullAllowed } from "../server/security/hull-guard";

describe("hull guard", () => {
  beforeEach(() => {
    delete process.env.HULL_MODE;
    delete process.env.HULL_OUTBOUND_GUARD;
    delete process.env.ENABLE_HULL_OUTBOUND_GUARD;
    delete process.env.HULL_ALLOW_HOSTS;
  });

  it("allows any host when hull mode disabled", () => {
    expect(isHullAllowed("https://example.com")).toBe(true);
    expect(() => assertHullAllowed("https://example.com")).not.toThrow();
  });

  it("does not block hosts for legacy hull mode alone", () => {
    process.env.HULL_MODE = "1";
    process.env.HULL_ALLOW_HOSTS = "127.0.0.1,localhost,*.hull";
    expect(isHullAllowed("https://api.example.com")).toBe(true);
    expect(() => assertHullAllowed("https://api.example.com")).not.toThrow();
  });

  it("blocks non-allowlist host when explicit outbound guard is enabled", () => {
    process.env.HULL_MODE = "1";
    process.env.HULL_OUTBOUND_GUARD = "1";
    process.env.HULL_ALLOW_HOSTS = "127.0.0.1,localhost,*.hull";
    expect(isHullAllowed("https://127.0.0.1")).toBe(true);
    expect(isHullAllowed("https://alpha.hull")).toBe(true);
    expect(isHullAllowed("https://api.example.com")).toBe(false);
    expect(() => assertHullAllowed("https://api.example.com")).toThrow(/HULL_OUTBOUND_GUARD/);
    try {
      assertHullAllowed("https://api.example.com");
    } catch (error) {
      const typed = error as { policy?: { reason?: string; capability?: string } };
      expect(typed.policy?.reason).toMatch(/HULL_OUTBOUND_GUARD/);
      expect(typed.policy?.capability).toBe("network_access");
    }
  });

  it("accepts scheme-qualified allowlist entries by normalizing them to hosts", () => {
    process.env.HULL_MODE = "1";
    process.env.HULL_OUTBOUND_GUARD = "1";
    process.env.HULL_ALLOW_HOSTS =
      "https://api.openai.com,https://*.hull,https://127.0.0.1:11434";
    expect(isHullAllowed("https://api.openai.com")).toBe(true);
    expect(isHullAllowed("https://alpha.hull")).toBe(true);
    expect(isHullAllowed("http://127.0.0.1:8080")).toBe(true);
  });
});
