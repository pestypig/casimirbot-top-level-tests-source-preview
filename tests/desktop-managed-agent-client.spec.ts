import { describe, expect, it, vi } from "vitest";
import { probeManagedAgent } from "../apps/desktop/src/managed-agent-client";

const key = "sk-test-only-never-a-real-key";
const events = (rows: unknown[]) => new Response(rows.map(row => `data: ${JSON.stringify(row)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
const started = { type: "agent.session.created", session: { id: "sess_fixture" } };
const text = { type: "agent.session.turn.output_text.done", text: "READY", item_id: "msg_fixture" };
const completed = { type: "agent.session.turn.completed", turn: { subagent_id: null } };
describe("native managed-agent qualification", () => {
  it("requires completed provider output and removes only its temporary session", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(events([started, text, completed])).mockResolvedValueOnce(new Response("{}"));
    const result = await probeManagedAgent({ key, fetchImpl: fetcher });
    expect(result).toEqual({ ok: true, code: "agent_chat_confirmed", cleanupConfirmed: true });
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.environment).toEqual({ type: "none" });
    expect(request.agent.tools).toEqual([]);
    expect(request.input).toBe("Connection check. Reply READY.");
    expect(fetcher.mock.calls[1][0]).toBe("https://api.openai.com/v1/agents/sessions/sess_fixture");
    expect(fetcher.mock.calls[1][1].method).toBe("DELETE");
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it.each([[401,"authentication_failed"],[403,"agents_permission_denied"],[429,"rate_limited"],[500,"provider_error"]])("sanitizes HTTP %s", async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(key, { status: Number(status) }));
    expect(await probeManagedAgent({ key, fetchImpl: fetcher })).toEqual({ ok: false, code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    [started, text, {type:"agent.session.idle"}],
    [started, completed],
    [started, text, {type:"agent.session.turn.completed",turn:{subagent_id:"child"}}],
    [started, {type:"agent.session.requires_action"}],
  ])("does not mistake partial, idle, subagent or tool events for completion", async (...rows) => {
    const fetcher=vi.fn().mockResolvedValueOnce(events(rows)).mockImplementation(async()=>new Response("{}"));
    const result=await probeManagedAgent({key,fetchImpl:fetcher});
    expect(result.ok).toBe(false);
    expect(result.code).toBe("agent_incomplete");
    expect(fetcher.mock.calls.at(-1)?.[1].method).toBe("DELETE");
  });
  it("reports cleanup failure without exposing provider response bodies", async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(events([started,text,completed])).mockResolvedValueOnce(new Response(key,{status:503}));
    expect(await probeManagedAgent({key,fetchImpl:fetcher})).toEqual({ok:true,code:"agent_chat_confirmed",cleanupConfirmed:false});
  });
  it("cancels and deletes a known probe session when its caller aborts",async()=>{
    let streamController!:ReadableStreamDefaultController<Uint8Array>;
    let observed!:()=>void;
    const reading=new Promise<void>(resolve=>{observed=resolve;});
    const body=new ReadableStream<Uint8Array>({
      start(controller){streamController=controller;controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(started)}\n\n`));},
      pull(){observed();},
    });
    const fetcher=vi.fn(async(_url:string,options:RequestInit)=>{
      if(options.method==="DELETE" || _url.endsWith("/events"))return new Response("{}",{status:202});
      options.signal?.addEventListener("abort",()=>streamController.error(Error("aborted")),{once:true});
      return new Response(body,{headers:{"content-type":"text/event-stream"}});
    });
    const controller=new AbortController();
    const pending=probeManagedAgent({key,fetchImpl:fetcher as never,signal:controller.signal});
    await reading;
    controller.abort();
    const result=await pending;
    expect(result).toMatchObject({ok:false,cleanupConfirmed:true});
    expect(fetcher.mock.calls.some(([url,options])=>url.endsWith("/sess_fixture") && options.method==="DELETE")).toBe(true);
  });
});
