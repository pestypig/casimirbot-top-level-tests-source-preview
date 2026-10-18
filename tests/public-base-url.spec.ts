import { afterEach, describe, expect, it } from "vitest";
import { resolveCasimirPublicBaseUrl } from "../server/services/public-base-url";

const trackedKeys = [
  "CASIMIR_PUBLIC_BASE_URL",
  "PUBLIC_BASE_URL",
  "HELIX_PUBLIC_BASE_URL",
  "CASIMIRBOT_PUBLIC_URL",
  "CASIMIR_DESKTOP_HOST",
  "NODE_ENV",
] as const;

const originalEnvironment = Object.fromEntries(
  trackedKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of trackedKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Casimir public base URL", () => {
  it("requires HTTPS for ordinary production hosts", () => {
    process.env.NODE_ENV = "production";
    process.env.CASIMIR_PUBLIC_BASE_URL = "http://casimirbot.com";
    delete process.env.CASIMIR_DESKTOP_HOST;

    expect(() => resolveCasimirPublicBaseUrl()).toThrow(
      "invalid_casimir_public_base_url",
    );
  });

  it("admits only the guarded desktop 127.0.0.1 origin over production HTTP", () => {
    process.env.NODE_ENV = "production";
    process.env.CASIMIR_DESKTOP_HOST = "1";
    process.env.CASIMIR_PUBLIC_BASE_URL = "http://127.0.0.1:43121";

    expect(resolveCasimirPublicBaseUrl()).toBe("http://127.0.0.1:43121");

    process.env.CASIMIR_PUBLIC_BASE_URL = "http://localhost:43121";
    expect(() => resolveCasimirPublicBaseUrl()).toThrow(
      "invalid_casimir_public_base_url",
    );

    process.env.CASIMIR_PUBLIC_BASE_URL = "http://192.168.1.9:43121";
    expect(() => resolveCasimirPublicBaseUrl()).toThrow(
      "invalid_casimir_public_base_url",
    );
  });
});
