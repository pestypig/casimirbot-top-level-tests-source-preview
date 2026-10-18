import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { startDesktopProviderCredentialBroker } from "../apps/desktop/src/provider-credential-broker";

describe("live connection broker configuration", () => {
  it("uses each fresh native lookup, never the launcher fallback after denial", async () => {
    let saved: string | null = "sk-first_fixture_abcdefghijklmnopqrstuvwxyz";
    const fetchImpl = vi.fn(async () => new Response("v=0\r\nanswer", {status:200}));
    const broker = await startDesktopProviderCredentialBroker({
      keyring:{activeKey:randomBytes(32).toString("base64url"),retiredKeys:[]},
      openAiApiKey:"sk-launcher_fixture_abcdefghijklmnopqrstuvwxyz",
      resolveOpenAiApiKey:async requester => requester === "requester:realtime:owner" ? saved : null,
      fetchImpl,
    });
    try {
      const call=async(requester="requester:realtime:owner")=>fetch(`${broker.origin}/v1/openai/realtime/sdp`,{
        method:"POST",headers:{Authorization:`Bearer ${broker.token}`,"Content-Type":"application/json"},
        body:JSON.stringify({offerSdp:"v=0\r\no=fixture",model:"gpt-realtime-2.1",voice:"marin",safetyIdentifier:requester}),
      });
      expect((await call()).status).toBe(200);
      saved="sk-replacement_fixture_abcdefghijklmnopqrstuvwxyz";
      expect((await call()).status).toBe(200);
      expect((fetchImpl.mock.calls[1] as unknown as [string,RequestInit])[1].headers).toMatchObject({Authorization:`Bearer ${saved}`});
      expect((await call("requester:realtime:guest")).status).toBe(409);
      saved=null; expect((await call()).status).toBe(409);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally { await broker.close(); }
  });
});
