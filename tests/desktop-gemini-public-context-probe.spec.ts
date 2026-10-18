import { describe, expect, it, vi } from "vitest";
import { probeGeminiPublicContext } from "../apps/desktop/src/gemini-public-context-probe";

const secret = "fixture-gemini-key-never-returned";
const answer = (text: string, extra: unknown[] = []) => new Response(JSON.stringify({
  status: "completed", steps: [...extra, { type: "model_output", content: [{ type: "text", text }] }],
}), { status: 200 });

describe("native Gemini public-context comparison", () => {
  it("makes exactly two bounded calls and records an actual public Theory tool result", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      fetchImpl.mock.calls.length === 1 ? answer("Baseline") : answer("Grounded", [
        { type: "mcp_server_tool_call", name: "casimir_theory_badges_reflect",
          server_name: "casimirbot_public_context" },
        { type: "mcp_server_tool_result", name: "casimir_theory_badges_reflect",
          server_name: "casimirbot_public_context", result: { hidden: "not rendered" } },
      ]));
    const result = await probeGeminiPublicContext({ key: secret, fetchImpl: fetchImpl as typeof fetch });
    expect(result).toMatchObject({ ok: true, comparison: { baseline: { answer: "Baseline" },
      withContext: { answer: "Grounded", toolCalls: ["casimir_theory_badges_reflect"],
        toolResults: ["casimir_theory_badges_reflect"] } } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [firstUrl, firstOptions] = fetchImpl.mock.calls[0];
    expect(firstUrl).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(firstOptions.headers).toMatchObject({ "x-goog-api-key": secret });
    expect(firstOptions.redirect).toBe("error");
    const firstBody = JSON.parse(firstOptions.body as string);
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body as string);
    expect(firstBody.input).toBe("Can fermions and bosons occupy the same space?");
    expect(firstBody).toMatchObject({ store: false, generation_config: { max_output_tokens: 900 } });
    expect(firstBody.tools).toBeUndefined();
    expect(secondBody).toMatchObject({ input: firstBody.input, tools: [{
      type: "mcp_server", name: "casimirbot_public_context",
      url: "https://casimirbot.com/mcp/public-context",
      allowed_tools: { mode: "auto", tools: ["casimir_theory_badges_reflect"] },
    }] });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("not rendered");
  });

  it("does not claim tool use from an answer alone", async () => {
    const fetchImpl = vi.fn(async () => answer("No observed tool call"));
    const result = await probeGeminiPublicContext({ key: secret, fetchImpl: fetchImpl as typeof fetch });
    expect(result).toMatchObject({ ok: true, comparison: { withContext: {
      toolCalls: [], toolResults: [] } } });
  });

  it("stops after provider denial without reading or returning its untrusted body", async () => {
    const fetchImpl = vi.fn(async () => new Response(secret, { status: 403 }));
    const result = await probeGeminiPublicContext({ key: secret, fetchImpl: fetchImpl as typeof fetch });
    expect(result).toEqual({ ok: false, code: "permission_denied", providerHttpStatus: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP 400 as a request compatibility failure rather than blaming the key", async () => {
    const fetchImpl = vi.fn(async () => new Response("opaque provider details", { status: 400 }));
    expect(await probeGeminiPublicContext({ key: secret, fetchImpl: fetchImpl as typeof fetch }))
      .toEqual({ ok: false, code: "provider_error", providerHttpStatus: 400 });
  });
});
