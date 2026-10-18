// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { installPrivateEnvironmentRevocation } from "../apps/desktop/src/environment-private-revocation";

describe("private environment preload account signal", () => {
  it("requests revocation with no payload and never reads event-supplied identity or grants", async () => {
    const invalidate = vi.fn(async () => ({})), remove = installPrivateEnvironmentRevocation(window, invalidate);
    const event = new Event("helix-account-capability-policy-changed");
    Object.defineProperty(event, "detail", { get: () => { throw Error("must not inspect untrusted policy"); } });
    try {
      window.dispatchEvent(event); await Promise.resolve();
      expect(invalidate).toHaveBeenCalledTimes(1); expect(invalidate).toHaveBeenCalledWith();
    } finally { remove(); }
    window.dispatchEvent(new Event("helix-account-capability-policy-changed")); expect(invalidate).toHaveBeenCalledTimes(1);
  });
  it("does not react to unrelated events and handles rejected revocation transport", async () => {
    const invalidate = vi.fn(async () => { throw Error("main unavailable"); }), remove = installPrivateEnvironmentRevocation(window, invalidate);
    try {
      window.dispatchEvent(new Event("click")); expect(invalidate).not.toHaveBeenCalled();
      window.dispatchEvent(new Event("helix-account-capability-policy-changed")); await Promise.resolve(); await Promise.resolve();
      expect(invalidate).toHaveBeenCalledTimes(1);
    } finally { remove(); }
  });
});
