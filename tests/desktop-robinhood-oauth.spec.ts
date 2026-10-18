import { describe, expect, it } from "vitest";
import { isAllowedDesktopRobinhoodAuthorizationUrl } from
  "../apps/desktop/src/robinhood-oauth";

const authorizationUrl = (): string => {
  const url = new URL("https://robinhood.com/oauth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "client_12345678");
  url.searchParams.set(
    "redirect_uri",
    "http://127.0.0.1:43121/api/agi/brokerage-connections/robinhood/oauth/callback",
  );
  url.searchParams.set("code_challenge", "c".repeat(43));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", "https://agent.robinhood.com/mcp/trading");
  url.searchParams.set("state", "s".repeat(43));
  url.searchParams.set("scope", "internal");
  return url.toString();
};

describe("desktop Robinhood OAuth external navigation", () => {
  it("admits the exact discovered PKCE request", () => {
    expect(isAllowedDesktopRobinhoodAuthorizationUrl(authorizationUrl())).toBe(true);
  });

  it.each([
    ["lookalike origin", (url: URL) => { url.hostname = "robinhood.com.example"; }],
    ["non-loopback callback", (url: URL) => {
      url.searchParams.set("redirect_uri", "https://example.com/callback");
    }],
    ["wrong resource", (url: URL) => {
      url.searchParams.set("resource", "https://example.com/mcp");
    }],
    ["missing PKCE", (url: URL) => { url.searchParams.delete("code_challenge"); }],
    ["unexpected query", (url: URL) => { url.searchParams.set("next", "https://example.com"); }],
  ])("rejects %s", (_label, mutate) => {
    const url = new URL(authorizationUrl());
    mutate(url);
    expect(isAllowedDesktopRobinhoodAuthorizationUrl(url.toString())).toBe(false);
  });
});
