import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveConnectionStore } from "../apps/desktop/src/live-connection-store";
import { createLiveConnectionIpc } from "../apps/desktop/src/live-connection-ipc";

const roots: string[] = [];
const secret = "sk-fixture_abcdefghijklmnopqrstuvwxyz";
const turnA = "managed-turn:11111111-1111-4111-8111-111111111111";
const turnB = "managed-turn:22222222-2222-4222-8222-222222222222";
const turnC = "managed-turn:33333333-3333-4333-8333-333333333333";
const storage = { isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value).map(byte => byte ^ 0x55),
  decryptString: (value: Buffer) => Buffer.from(value).map(byte => byte ^ 0x55).toString() };
const setup = (fetchImpl = vi.fn(async () => new Response("{}", {status: 200}))) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "live-connection-")); roots.push(root);
  return { root, fetchImpl, store: new LiveConnectionStore({userDataPath: root, storage, launcherKey: "sk-launcher_abcdefghijklmnopqrstuvwxyz", fetchImpl}) };
};
afterEach(() => { for(const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
describe("native personal live connection", () => {
  const stream = (rows: unknown[]) => new Response(rows.map(row => `data: ${JSON.stringify(row)}\n\n`).join(""),
    {headers:{"content-type":"text/event-stream"}});
  const completed = {type:"agent.session.turn.completed",turn:{subagent_id:null}};
  it("honors Stop for the exact turn even when Stop arrives before Send admission",async()=>{
    const {store,fetchImpl}=setup(); store.save("owner",secret);
    const stopped=await store.stopConversation("owner","account_session:11111111",turnA);
    expect(stopped.code).toBe("conversation_stopped");
    expect((await store.sendConversation("owner","account_session:11111111","Never sent",turnA)).code).toBe("conversation_stopped");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.conversationView("owner","account_session:11111111")).toEqual({active:false,messages:[]});
  });
  it("cancels the exact provider session and suppresses a late follow-up",async()=>{
    const fetchImpl=vi.fn(async(url:string,options:RequestInit):Promise<Response>=>{
      if(options.method==="DELETE") return new Response("{}");
      if(options.method==="POST" && url.endsWith("/events")) return new Response("",{status:202});
      if(options.method==="GET" && url.endsWith("/sess_stop")) return new Response(JSON.stringify({
        id:"sess_stop",object:"agent.session",status:"idle",required_actions:[],environment:{type:"none"},
        metadata:{casimirbot_scope:"personal_agent_tools_v2"}}));
      if(options.method==="GET") return new Promise<Response>((_resolve,reject)=>{
        options.signal?.addEventListener("abort",()=>reject(Error("aborted")),{once:true});
      });
      return stream([{type:"agent.session.created",session:{id:"sess_stop"}},
        {type:"agent.session.turn.output_text.done",text:"First"},completed]);
    });
    const {store}=setup(fetchImpl as never); store.save("owner",secret);
    await store.sendConversation("owner","account_session:11111111","One",turnA);
    const pending=store.sendConversation("owner","account_session:11111111","Two",turnB);
    await vi.waitFor(()=>expect(fetchImpl.mock.calls.some(([url,options])=>url.endsWith("/events?stream=true") && options.method==="GET")).toBe(true));
    expect((await store.stopConversation("owner","account_session:11111111",turnC)).code).toBe("request_rejected");
    expect((await store.stopConversation("owner","account_session:22222222",turnB)).code).toBe("request_rejected");
    const stopped=await store.stopConversation("owner","account_session:11111111",turnB);
    expect(stopped).toMatchObject({ok:true,code:"conversation_stopped",cleanupConfirmed:true});
    expect((await pending).code).toBe("conversation_stopped");
    expect(store.conversationView("owner","account_session:11111111")).toEqual({active:false,messages:[]});
    const cancel=fetchImpl.mock.calls.find(([url,options])=>url.endsWith("/sess_stop/events") && options.method==="POST");
    expect(JSON.parse(cancel![1].body as string).events).toEqual([{type:"agent.session.input.cancel"}]);
    expect(fetchImpl.mock.calls.some(([url,options])=>url.endsWith("/sess_stop") && options.method==="DELETE")).toBe(true);
  });
  it("deletes an idle managed session before normal quit and denies new turns",async()=>{
    const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>options.method==="DELETE"
      ? new Response("{}") : stream([{type:"agent.session.created",session:{id:"sess_quit"}},
        {type:"agent.session.turn.output_text.done",text:"Answer"},completed]));
    const {store}=setup(fetchImpl as never); store.save("owner",secret);
    expect((await store.sendConversation("owner","account_session:11111111","Question",turnA)).ok).toBe(true);
    expect(await store.closeAllConversations()).toBe(true);
    expect(fetchImpl.mock.calls.some(([url,options])=>url.endsWith("/sess_quit") && options.method==="DELETE")).toBe(true);
    expect(store.conversationView("owner","account_session:11111111")).toEqual({active:false,messages:[]});
    expect((await store.sendConversation("owner","account_session:11111111","After quit",turnB)).code).toBe("request_rejected");
    expect((await store.testChat("owner")).code).toBe("request_rejected");
    expect(store.save("owner","sk-new_abcdefghijklmnopqrstuvwxyz").code).toBe("request_rejected");
  });
  it("reports uncertain normal-quit cleanup when an in-flight session has no provider ID",async()=>{
    const fetchImpl=vi.fn((_url:string,options:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
      options.signal?.addEventListener("abort",()=>reject(Error("aborted")),{once:true});
    }));
    const {store}=setup(fetchImpl as never); store.save("owner",secret);
    const pending=store.sendConversation("owner","account_session:11111111","Question",turnA);
    await vi.waitFor(()=>expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(await store.closeAllConversations()).toBe(false);
    expect((await pending).code).toBe("conversation_stopped");
    expect((await store.sendConversation("owner","account_session:11111111","After quit",turnB)).code).toBe("request_rejected");
  });
  it("aborts a pending one-off chat probe before normal quit and records uncertain cleanup",async()=>{
    const fetchImpl=vi.fn((_url:string,options:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
      options.signal?.addEventListener("abort",()=>reject(Error("aborted")),{once:true});
    }));
    const {store}=setup(fetchImpl as never);store.save("owner",secret);
    const probe=store.testChat("owner");
    await vi.waitFor(()=>expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(await store.closeAllConversations()).toBe(false);
    expect(await probe).toMatchObject({code:"account_changed",cleanupConfirmed:false});
  });
  it("does not hang normal quit if a provider ignores cancellation",async()=>{
    let release!:(value:Response)=>void;
    const fetchImpl=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
    const root=mkdtempSync(path.join(os.tmpdir(),"live-connection-"));roots.push(root);
    const store=new LiveConnectionStore({userDataPath:root,storage,fetchImpl,quitCleanupTimeoutMs:15});
    store.save("owner",secret);
    const pending=store.sendConversation("owner","account_session:11111111","Question",turnA);
    await vi.waitFor(()=>expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(await store.closeAllConversations()).toBe(false);
    release(new Response("{}",{status:503}));
    expect((await pending).code).toBe("conversation_stopped");
  });
  it("keeps a managed conversation within one account session and never returns its provider session ID",async()=>{
    const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
      if(options.method==="DELETE") return new Response("{}");
      if(options.method==="POST" && url.endsWith("/events")) return new Response("",{status:202});
      return stream([...(url.endsWith("/sessions")?[{type:"agent.session.created",session:{id:"sess_private"}}]:[]),
        {type:"agent.session.turn.output_text.done",text:"Private answer"},completed]);
    });
    const {store}=setup(fetchImpl as never); store.save("owner",secret);
    const first=await store.sendConversation("owner","account_session:11111111","Hello",turnA);
    expect(first.code).toBe("conversation_ready");
    expect(first.conversation?.messages).toEqual([{role:"user",text:"Hello",turnId:turnA},
      {role:"assistant",text:"Private answer",turnId:turnA}]);
    expect(JSON.stringify(first)).not.toContain("sess_private");
    expect(store.conversationView("owner","account_session:22222222")).toEqual({active:false,messages:[]});
    expect(store.conversationView("guest","account_session:11111111")).toEqual({active:false,messages:[]});
    await vi.waitFor(()=>expect(fetchImpl.mock.calls.some(([url,options])=>url.endsWith("/sess_private") && options.method==="DELETE")).toBe(true));
  });
  it("continues a managed session and clears it after an uncertain follow-up",async()=>{
    let followup=0;
    const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
      if(options.method==="DELETE") return new Response("{}");
      if(options.method==="POST" && url.endsWith("/events")) return new Response("",{status:202});
      if(options.method==="GET" && url.endsWith("/sess_private")) return new Response(JSON.stringify({
        id:"sess_private",object:"agent.session",status:"idle",required_actions:[],environment:{type:"none"},
        metadata:{casimirbot_scope:"personal_agent_tools_v2"}}));
      if(options.method==="GET") { followup++; return stream(followup===1?
        [{type:"agent.session.turn.output_text.done",text:"Second"},completed]:[{type:"agent.session.idle"}]); }
      return stream([{type:"agent.session.created",session:{id:"sess_private"}},
        {type:"agent.session.turn.output_text.done",text:"First"},completed]);
    });
    const {store}=setup(fetchImpl as never); store.save("owner",secret);
    await store.sendConversation("owner","account_session:11111111","One",turnA);
    const second=await store.sendConversation("owner","account_session:11111111","Two",turnB);
    expect(second.conversation?.messages.map(item=>item.text)).toEqual(["One","First","Two","Second"]);
    expect(await store.sendConversation("owner","account_session:11111111","Three",turnC))
      .toMatchObject({ok:false,code:"conversation_incomplete",diagnostic:"stream_ended"});
    expect(store.conversationView("owner","account_session:11111111")).toEqual({active:false,messages:[]});
  });
  it("invalidates a pending managed answer when the key changes",async()=>{
    let release!: (value:Response)=>void;
    const fetchImpl=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
    const {store}=setup(fetchImpl); store.save("owner",secret);
    const pending=store.sendConversation("owner","account_session:11111111","Hello",turnA);
    store.save("owner","sk-replacement_abcdefghijklmnopqrstuvwxyz");
    release(stream([{type:"agent.session.created",session:{id:"sess_private"}},
      {type:"agent.session.turn.output_text.done",text:"Stale"},completed]));
    expect((await pending).code).toBe("account_changed");
    expect(store.conversationView("owner","account_session:11111111")).toEqual({active:false,messages:[]});
  });
  it("protects persisted bytes, separates profiles and survives restart", () => {
    const {store, root} = setup();
    const result = store.save("owner", secret);
    expect(result).toEqual({ok:true, code:"saved", state:{configured:true, source:"saved"}});
    expect(JSON.stringify(result)).not.toContain(secret);
    const file = path.join(root,"provider-connections",readdirSync(path.join(root,"provider-connections"))[0]);
    expect(readFileSync(file).toString()).not.toContain(secret);
    const restarted = new LiveConnectionStore({userDataPath:root,storage});
    expect(restarted.keyForProfile("owner")).toBe(secret);
    expect(restarted.keyForProfile("guest")).toBeNull();
  });
  it("keeps Gemini and OpenAI credentials separate under the same protected profile", () => {
    const { store, root } = setup();
    const geminiKey = "AIzaFixtureGeminiKey_1234567890abcdef";
    expect(store.save("owner", secret).ok).toBe(true);
    const result = store.saveGemini("owner", geminiKey);
    expect(result).toEqual({ ok: true, code: "gemini_saved", state: { configured: true, source: "saved" } });
    expect(JSON.stringify(result)).not.toContain(geminiKey);
    const files = readdirSync(path.join(root, "provider-connections"));
    expect(files).toHaveLength(2);
    for (const file of files) expect(readFileSync(path.join(root, "provider-connections", file)).toString())
      .not.toContain(geminiKey);
    const restarted = new LiveConnectionStore({ userDataPath: root, storage });
    expect(restarted.geminiKeyForProfile("owner")).toBe(geminiKey);
    expect(restarted.geminiKeyForProfile("guest")).toBeNull();
    expect(restarted.keyForProfile("owner")).toBe(secret);
    expect(restarted.disconnectGemini("owner").ok).toBe(true);
    expect(restarted.geminiKeyForProfile("owner")).toBeNull();
    expect(restarted.keyForProfile("owner")).toBe(secret);
  });
  it("rejects malformed Gemini keys and unavailable protected storage", () => {
    const { store, root } = setup();
    expect(store.saveGemini("owner", "not a key").code).toBe("gemini_invalid_key_format");
    expect(readdirSync(root)).toEqual([]);
    const unavailable = new LiveConnectionStore({ userDataPath: root,
      storage: { ...storage, isEncryptionAvailable: () => false } });
    expect(unavailable.saveGemini("owner", "AIzaFixtureGeminiKey_1234567890abcdef").code)
      .toBe("storage_unavailable");
  });
  it("accepts opaque printable Gemini keys while rejecting whitespace and control characters", () => {
    const { store } = setup();
    expect(store.saveGemini("owner", "auth.key:with+punctuation/123").ok).toBe(true);
    expect(store.saveGemini("owner", "auth.key:with\nnewline/123").code).toBe("gemini_invalid_key_format");
    expect(store.saveGemini("owner", "auth.key:with space/123").code).toBe("gemini_invalid_key_format");
  });
  it("tests a saved Gemini key through the fixed read-only provider endpoint without returning its body", async () => {
    const key = "AIzaFixtureGeminiKey_1234567890abcdef";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ secret: key }), { status: 200 }));
    const { store } = setup(fetchImpl);
    expect((await store.testGemini("owner")).code).toBe("gemini_missing_key");
    store.saveGemini("owner", key);
    const result = await store.testGemini("owner");
    expect(result).toEqual({ ok: true, code: "gemini_test_confirmed",
      state: { configured: true, source: "saved" } });
    expect(JSON.stringify(result)).not.toContain(key);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      expect.objectContaining({ method: "GET", redirect: "error",
        headers: { "x-goog-api-key": key } }));
  });
  it("rejects a stale Gemini check after the profile key changes", async () => {
    let release!: (response: Response) => void;
    const { store } = setup(vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
    store.saveGemini("owner", "AIzaFixtureGeminiKey_1234567890abcdef");
    const check = store.testGemini("owner");
    store.disconnectGemini("owner");
    release(new Response("{}"));
    expect((await check).code).toBe("account_changed");
  });
  it("disconnects without silently restoring an inherited key", () => {
    const {store, root}=setup(); store.save("owner",secret); store.disconnect("owner");
    expect(store.keyForProfile("owner")).toBeNull();
    expect(new LiveConnectionStore({userDataPath:root,storage,launcherKey:secret}).keyForProfile("owner")).toBeNull();
  });
  it("fails closed when encryption is unavailable", () => {
    const {root}=setup();
    const store=new LiveConnectionStore({userDataPath:root,storage:{...storage,isEncryptionAvailable:()=>false}});
    expect(store.save("owner",secret)).toEqual({ok:false,code:"storage_unavailable"});
    expect(readdirSync(root)).toEqual([]);
  });
  it.each([[401,"authentication_failed"],[403,"model_access_denied"],[404,"model_access_denied"],[429,"rate_limited"],[500,"provider_error"]])("redacts HTTP %s failures", async(status,code)=>{
    const {store,fetchImpl}=setup(vi.fn(async()=>new Response(secret,{status:Number(status)})));
    store.save("owner",secret);
    const result=await store.test("owner","gpt-realtime-2.1");
    expect(result.code).toBe(code); expect(JSON.stringify(result)).not.toContain(secret);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/models/gpt-realtime-2.1",expect.objectContaining({method:"GET",redirect:"error"}));
  });
  it("does not start calls or accept arbitrary endpoints and models", async()=>{
    const {store,fetchImpl}=setup();
    expect((await store.test("owner","https://untrusted.test" as never)).code).toBe("request_rejected");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.test("owner","gpt-realtime-2.1-mini")).code).toBe("model_access_confirmed");
  });
  it("rejects stale model tests after key replacement",async()=>{
    let resolve!: (r:Response)=>void;
    const {store}=setup(vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
    const test=store.test("owner","gpt-realtime-2.1"); store.save("owner",secret); resolve(new Response("{}"));
    expect((await test).code).toBe("account_changed");
  });
  it("rejects foreign windows, subframes, unknown fields and signed-out accounts",async()=>{
    const {store}=setup(); const mainFrame={url:"http://localhost/desktop"};
    const sender={mainFrame,isDestroyed:()=>false};
    const readAccount=vi.fn(async()=>({profileId:"owner",sessionId:"account_session:12345678",accountType:"user" as const}));
    const handle=createLiveConnectionIpc({store,mainSender:()=>sender,trustedUrl:u=>u===mainFrame.url,readAccount});
    expect((await handle({sender:{...sender},senderFrame:mainFrame},{action:"save",key:secret})).code).toBe("request_rejected");
    expect((await handle({sender,senderFrame:{...mainFrame}},{action:"save",key:secret})).code).toBe("request_rejected");
    expect((await handle({sender,senderFrame:mainFrame},{action:"save",key:secret,profileId:"guest"})).code).toBe("request_rejected");
    expect(readAccount).not.toHaveBeenCalled();
    readAccount.mockRejectedValueOnce(Error(secret));
    expect(await handle({sender,senderFrame:mainFrame},{action:"inspect"})).toEqual({ok:false,code:"sign_in_required"});
    expect((await handle({sender,senderFrame:mainFrame},{action:"save",key:secret})).ok).toBe(true);
  });
  it("admits Gemini key changes only from the trusted current profile frame", async () => {
    const { store } = setup();
    const mainFrame = { url: "http://localhost/desktop" };
    const sender = { mainFrame, isDestroyed: () => false };
    let account = { profileId: "owner", sessionId: "account_session:11111111", accountType: "user" as const };
    const handle = createLiveConnectionIpc({ store, mainSender: () => sender,
      trustedUrl: url => url === mainFrame.url, readAccount: async () => account });
    const key = "AIzaFixtureGeminiKey_1234567890abcdef";
    expect((await handle({ sender: { ...sender }, senderFrame: mainFrame },
      { action: "gemini_save", key })).code).toBe("request_rejected");
    expect((await handle({ sender, senderFrame: mainFrame },
      { action: "gemini_save", key, profileId: "guest" })).code).toBe("request_rejected");
    expect((await handle({ sender, senderFrame: mainFrame }, { action: "gemini_save", key })).ok).toBe(true);
    expect((await handle({ sender, senderFrame: mainFrame }, { action: "gemini_test", url: "https://other.example" })).code)
      .toBe("request_rejected");
    expect((await handle({ sender, senderFrame: mainFrame }, { action: "gemini_test" })).code)
      .toBe("gemini_test_confirmed");
    account = { ...account, profileId: "guest" };
    expect((await handle({ sender, senderFrame: mainFrame }, { action: "gemini_inspect" })).state)
      .toEqual({ configured: false, source: "none" });
    expect(store.geminiKeyForProfile("owner")).toBe(key);
  });
  it("suppresses a managed reply if the desktop account switches while it is running",async()=>{
    const {store}=setup();
    const mainFrame={url:"http://localhost/desktop"};
    const sender={mainFrame,isDestroyed:()=>false};
    const readAccount=vi.fn().mockResolvedValueOnce({profileId:"owner",sessionId:"account_session:11111111",accountType:"user"})
      .mockResolvedValueOnce({profileId:"guest",sessionId:"account_session:22222222",accountType:"user"});
    vi.spyOn(store,"sendConversation").mockResolvedValue({ok:true,code:"conversation_ready",conversation:{active:true,
      messages:[{role:"assistant",text:"Owner-only answer"}]}});
    const stop=vi.spyOn(store,"stopConversation").mockResolvedValue({ok:true,code:"conversation_stopped"});
    const handle=createLiveConnectionIpc({store,mainSender:()=>sender,trustedUrl:url=>url===mainFrame.url,readAccount});
    const result=await handle({sender,senderFrame:mainFrame},{action:"conversation_send",prompt:"Question",turn_id:turnA});
    expect(result).toEqual({ok:false,code:"account_changed"});
    expect(JSON.stringify(result)).not.toContain("Owner-only answer");
    expect(stop).toHaveBeenCalledWith("owner","account_session:11111111",turnA);
  });
  it("rejects renderer-selected provider sessions or room context",async()=>{
    const {store}=setup();
    const mainFrame={url:"http://localhost/desktop"};
    const sender={mainFrame,isDestroyed:()=>false};
    const readAccount=vi.fn(async()=>({profileId:"owner",sessionId:"account_session:11111111",accountType:"user" as const}));
    const handle=createLiveConnectionIpc({store,mainSender:()=>sender,trustedUrl:url=>url===mainFrame.url,readAccount});
    expect(await handle({sender,senderFrame:mainFrame},{action:"conversation_send",prompt:"Question",turn_id:turnA,sessionId:"foreign"}))
      .toEqual({ok:false,code:"request_rejected"});
    expect(await handle({sender,senderFrame:mainFrame},{action:"conversation_send",prompt:"Question",turn_id:turnA,roomId:"another-room"}))
      .toEqual({ok:false,code:"request_rejected"});
    expect(readAccount).not.toHaveBeenCalled();
  });
  it("configures a room only from the trusted developer frame with a current profile key", async () => {
    const { store } = setup();
    const mainFrame = { url: "http://localhost/desktop" };
    const sender = { mainFrame, isDestroyed: () => false };
    let account = { profileId: "owner", sessionId: "account_session:11111111", accountType: "developer" as const };
    const readAccount = vi.fn(async () => account);
    const configure = vi.fn(async () => ({ ok: true, code: "room_interpreter_configured" as const }));
    const handle = createLiveConnectionIpc({ store, mainSender: () => sender,
      trustedUrl: url => url === mainFrame.url, readAccount, configureRoomInterpreter: configure });
    const request = { action: "room_interpreter_configure", room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
      interpreter_session_id: "room_interpreter:22222222-2222-4222-8222-222222222222", generation: 1 };
    const event = { sender, senderFrame: mainFrame };
    expect((await handle({ sender: { ...sender }, senderFrame: mainFrame }, request)).code).toBe("request_rejected");
    expect((await handle(event, { ...request, key: secret })).code).toBe("request_rejected");
    expect((await handle(event, { ...request, generation: 0 })).code).toBe("request_rejected");
    expect(configure).not.toHaveBeenCalled();
    store.disconnect("owner");
    expect((await handle(event, request)).code).toBe("missing_key");
    expect(configure).not.toHaveBeenCalled();
    store.save("owner", secret);
    expect(await handle(event, request)).toEqual({ ok: true, code: "room_interpreter_configured" });
    expect(configure).toHaveBeenCalledWith(account, request.room_id, request.interpreter_session_id, 1);
    account = { ...account, accountType: "user" as const };
    expect((await handle(event, request)).code).toBe("request_rejected");
  });
  it("selects a hosted room key only through the trusted developer native callback", async () => {
    const { store } = setup();
    const mainFrame = { url: "http://localhost/desktop" };
    const sender = { mainFrame, isDestroyed: () => false };
    const account = { profileId: "owner", sessionId: "account_session:11111111", accountType: "developer" as const };
    const select = vi.fn(async () => ({ ok: true, code: "room_hosted_interpreter_key_selected" as const }));
    const handle = createLiveConnectionIpc({ store, mainSender: () => sender,
      trustedUrl: url => url === mainFrame.url, readAccount: async () => account,
      selectHostedRoomInterpreterKey: select });
    const value = { action: "room_hosted_interpreter_key_select",
      room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
      interpreter_session_id: "room_interpreter:22222222-2222-4222-8222-222222222222", generation: 1 };
    expect((await handle({ sender: { ...sender }, senderFrame: mainFrame }, value)).code).toBe("request_rejected");
    expect((await handle({ sender, senderFrame: mainFrame }, { ...value, api_key: secret })).code)
      .toBe("request_rejected");
    store.disconnect("owner");
    expect((await handle({ sender, senderFrame: mainFrame }, value)).code).toBe("missing_key");
    store.save("owner", secret);
    expect(await handle({ sender, senderFrame: mainFrame }, value)).toEqual({ ok: true,
      code: "room_hosted_interpreter_key_selected" });
    expect(select).toHaveBeenCalledWith(account, value.room_id, value.interpreter_session_id, 1);
  });
});
