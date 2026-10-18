import { expect, it, vi } from "vitest";
import { CodexConversationReader, codexMirrorTaskFromOwnerGrant, codexThreadIdFromPairedTaskRef,
  isRetryableCodexMirrorReadFailure } from "../../apps/desktop/src/codex-conversation-reader";

it("retains a frame only for a local read interruption after a separate exact-grant recheck", () => {
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_request_timeout")).toBe(true);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_transport_closed")).toBe(true);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_reader_or_transport_error")).toBe(true);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_turns_list_rejected")).toBe(true);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_owner_grant_changed")).toBe(false);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_task_changed")).toBe(false);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_target_binding_mismatch")).toBe(false);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_protocol_invalid")).toBe(false);
  expect(isRetryableCodexMirrorReadFailure("codex_mirror_initialize_rejected")).toBe(false);
});

it("reports the rejected app-server operation without exposing its raw error text", async () => {
  const reader = new CodexConversationReader("unused-test-binary") as unknown as {
    onData(chunk: Buffer): void;
    pending: Map<number, { resolve(value: unknown): void; reject(error: Error): void;
      timer: NodeJS.Timeout; method: string }>;
  };
  const result = new Promise<unknown>((resolve, reject) => {
    reader.pending.set(1, { resolve, reject, method: "thread/turns/list",
      timer: setTimeout(() => reject(new Error("test_timeout")), 1_000) });
  });
  reader.onData(Buffer.from('{"id":1,"error":{"message":"private local path or token"}}\n'));
  await expect(result).rejects.toThrow("codex_mirror_turns_list_rejected");
});

it("passes only the exact paired Codex task UUID to app-server", () => {
  const id = "01a0798b-b5bd-7bf2-946a-9a77e086316a";
  expect(codexThreadIdFromPairedTaskRef(`codex-task:${id}`)).toBe(id);
  expect(codexThreadIdFromPairedTaskRef(`codex-thread:local:${id}`)).toBe(id);
  expect(codexThreadIdFromPairedTaskRef(`codex:thread:${id}`)).toBe(id);
  expect(codexThreadIdFromPairedTaskRef(id)).toBeNull();
  expect(codexThreadIdFromPairedTaskRef(`other-agent:${id}`)).toBeNull();
  expect(codexThreadIdFromPairedTaskRef(`codex-thread:remote:${id}`)).toBeNull();
  expect(codexThreadIdFromPairedTaskRef(`codex-task:${id}/another-task`)).toBeNull();
});

it("admits only the exact owner-resolved mirror target and identifies a malformed field", () => {
  const id = "01a0798b-b5bd-7bf2-946a-9a77e086316a";
  const grant = { schema: "helix.codex_mirror_target.v1", binding_id: "binding:exact",
    task_id: `codex-thread:local:${id}`, room_visible: false };
  expect(codexMirrorTaskFromOwnerGrant(grant, "binding:exact")).toBe(id);
  expect(codexMirrorTaskFromOwnerGrant({ ...grant, task_id: id }, "binding:exact")).toBe(id);
  expect(() => codexMirrorTaskFromOwnerGrant({ ...grant, binding_id: "binding:other" }, "binding:exact"))
    .toThrow("codex_mirror_target_binding_mismatch");
  expect(() => codexMirrorTaskFromOwnerGrant({ ...grant, task_id: `other-agent:${id}` }, "binding:exact"))
    .toThrow("codex_mirror_target_task_invalid");
  expect(() => codexMirrorTaskFromOwnerGrant({ ...grant, room_visible: true }, "binding:exact"))
    .toThrow("codex_mirror_target_scope_invalid");
});

it("pages past internal turns to recover three visible turns without requesting full payloads", async () => {
  const reader = new CodexConversationReader("unused-test-binary");
  vi.spyOn(reader, "start").mockResolvedValue();
  const requests: Array<Record<string, unknown>> = [];
  vi.spyOn(reader as unknown as { request(method: string, params: Record<string, unknown>): Promise<unknown> }, "request")
    .mockImplementation(async (method, params) => {
      if (method === "thread/items/list") return { data: [], nextCursor: null };
      requests.push(params);
      const visible = (id: string) => ({ id, status: "completed", items: [
        { type: "userMessage", content: [{ type: "text", text: id }] },
        { type: "agentMessage", phase: "final_answer", text: `Answer ${id}` },
      ] });
      if (!params.cursor) return { data: [
        ...Array.from({ length: 7 }, (_, index) => ({ id: `internal:${index}`, items: [] })),
        visible("turn:three"),
      ], nextCursor: "older-page" };
      return { data: [visible("turn:two"), visible("turn:one")], nextCursor: null };
    });
  const result = await reader.readLastThree("01a0798b-b5bd-7bf2-946a-9a77e086316a");
  expect(result.map(turn => turn.id)).toEqual(["turn:one", "turn:two", "turn:three"]);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ limit: 8, itemsView: "summary", sortDirection: "desc" });
  expect(requests[1]).toMatchObject({ cursor: "older-page", limit: 8, itemsView: "summary" });
});

it("projects visible commentary but never internal reasoning or tool payloads", async () => {
  const reader = new CodexConversationReader("unused-test-binary");
  vi.spyOn(reader, "start").mockResolvedValue();
  const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  vi.spyOn(reader as unknown as { request(method: string, params: Record<string, unknown>): Promise<unknown> }, "request")
    .mockImplementation(async (method, params) => {
      requests.push({ method, params });
      if (method === "thread/turns/list") return { data: [{ id: "turn:one", status: "completed", items: [
        { type: "userMessage", content: [{ type: "text", text: "Check the build" }] },
        { type: "agentMessage", phase: "final_answer", text: "The build passed." },
      ] }], nextCursor: null };
      if (method === "thread/items/list") return { data: [
        { startedAtMs: 4, item: { type: "agentMessage", phase: "final_answer", text: "The build passed." } },
        { startedAtMs: 3, item: { type: "reasoning", text: "private reasoning" } },
        { startedAtMs: 2, item: { type: "agentMessage", phase: "commentary", text: "Verifying output." } },
        { startedAtMs: 1, item: { type: "commandExecution", command: "secret command payload" } },
      ], nextCursor: null };
      throw new Error(`Unexpected method: ${method}`);
    });
  const turns = await reader.readLastThree("01a0798b-b5bd-7bf2-946a-9a77e086316a");
  expect(turns).toMatchObject([{ user: "Check the build", assistant: "The build passed.",
    updates: ["Verifying output."] }]);
  expect(JSON.stringify(turns)).not.toContain("private reasoning");
  expect(JSON.stringify(turns)).not.toContain("secret command payload");
  expect(requests.find(request => request.method === "thread/items/list")?.params)
    .toMatchObject({ limit: 16, sortDirection: "desc", turnId: "turn:one" });
});

it("bounds activity detail reads to one page without losing the visible turn", async () => {
  const reader = new CodexConversationReader("unused-test-binary");
  vi.spyOn(reader, "start").mockResolvedValue();
  const requests: string[] = [];
  vi.spyOn(reader as unknown as { request(method: string, params: Record<string, unknown>): Promise<unknown> }, "request")
    .mockImplementation(async (method) => {
      requests.push(method);
      if (method === "thread/turns/list") return { data: [{ id: "turn:one", status: "completed", items: [
        { type: "userMessage", content: [{ type: "text", text: "Check the build" }] },
        { type: "agentMessage", phase: "final_answer", text: "The build passed." },
      ] }], nextCursor: null };
      if (method === "thread/items/list") return { data: [
        { startedAtMs: 1, item: { type: "agentMessage", phase: "commentary", text: "Checking." } },
      ], nextCursor: "more-internal-items" };
      throw new Error(`Unexpected method: ${method}`);
    });
  const turns = await reader.readRecent("01a0798b-b5bd-7bf2-946a-9a77e086316a", 3, 1);
  expect(turns).toMatchObject([{ user: "Check the build", assistant: "The build passed.",
    updates: ["Checking."] }]);
  expect(requests).toEqual(["thread/turns/list", "thread/items/list"]);
});

it("does not spawn a replacement after stop cancels a pending restart", async () => {
  const reader = new CodexConversationReader("unused-test-binary") as unknown as
    CodexConversationReader & { closing: Promise<boolean> | null };
  let finishClosing!: (closed: boolean) => void;
  reader.closing = new Promise(resolve => { finishClosing = resolve; });
  const pending = reader.start();
  reader.stop();
  finishClosing(true);
  await expect(pending).rejects.toThrow("codex_mirror_start_cancelled");
});

it("preserves UTF-8 transcript text when app-server splits a character across chunks", async () => {
  const reader = new CodexConversationReader("unused-test-binary") as unknown as {
    onData(chunk: Buffer): void;
    pending: Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>;
  };
  const result = new Promise<unknown>((resolve, reject) => {
    reader.pending.set(1, { resolve, reject, timer: setTimeout(() => reject(new Error("test_timeout")), 1_000) });
  });
  const line = Buffer.from('{"id":1,"result":{"text":"café"}}\n', "utf8");
  const split = line.indexOf(Buffer.from("é", "utf8")) + 1;
  reader.onData(line.subarray(0, split));
  reader.onData(line.subarray(split));
  await expect(result).resolves.toEqual({ text: "café" });
});
