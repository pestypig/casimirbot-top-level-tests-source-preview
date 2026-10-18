import { describe, expect, it } from "vitest";
import { shouldUseSecureHelixSessionCookie } from
  "../server/services/helix-account/session-cookie";

describe("Helix session cookie transport policy", () => {
  it("keeps normal production sessions HTTPS-only", () => {
    expect(shouldUseSecureHelixSessionCookie({ NODE_ENV: "production" })).toBe(true);
  });

  it("permits the guarded packaged loopback host to retain its session", () => {
    expect(shouldUseSecureHelixSessionCookie({
      NODE_ENV: "production",
      CASIMIR_DESKTOP_HOST: "1",
    })).toBe(false);
  });

  it("does not mark development cookies secure", () => {
    expect(shouldUseSecureHelixSessionCookie({ NODE_ENV: "development" })).toBe(false);
  });

  it("does not treat arbitrary desktop-host values as enabled", () => {
    expect(shouldUseSecureHelixSessionCookie({
      NODE_ENV: "production",
      CASIMIR_DESKTOP_HOST: "yes",
    })).toBe(true);
  });
});
