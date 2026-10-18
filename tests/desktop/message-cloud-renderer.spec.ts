// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderMessageCloud } from "../../apps/desktop/src/message-cloud-renderer";

const turn = (id: string, text: string) => ({ id, prompt: text, delivery: "reported" as const,
  report: { status: "completed" as const, text } });
const frame = (turns: ReturnType<typeof turn>[]) => ({
  schema: "helix.message_cloud_frame.v1", helixConversationId: "chat:owner", turns,
});

describe("isolated Message Codex cloud renderer", () => {
  it("shows exact pairing and keeps Cloud Agent replies distinct from Codex reports", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><p id="hint"></p><ol id="turns"></ol></div>';
    renderMessageCloud(list(), { ...frame([]), turns: [{ ...turn("api:one", "Cloud reply"), author: "cloud_agent" }],
      source: "cloud_agent_dm", pairing: { status: "active", taskId: "task:exact", bindingId: "binding:exact" } });
    expect(document.querySelector("h1")?.textContent).toBe("Cloud Agent DM");
    expect(document.querySelector("#hint")?.textContent).toContain("Task: task:exact");
    expect(list().textContent).toContain("Cloud agent · reply");
    renderMessageCloud(list(), { ...frame([turn("codex:one", "Task report")]),
      pairing: { status: "revoked", taskId: null } });
    expect(list().textContent).not.toContain("Cloud reply");
    expect(document.querySelector("#hint")?.textContent).toContain("Codex pairing: revoked");
    expect(document.querySelector("#hint")?.textContent).toContain("Task: not verified");
  });
  beforeEach(() => { document.body.innerHTML = '<ol id="turns"></ol>'; });
  const list = () => document.getElementById("turns") as HTMLOListElement;

  it("renders task text literally and keeps only the selected three turns", () => {
    expect(renderMessageCloud(list(), frame([turn("one", '<img src=x onerror="alert(1)">')]))).toBe(true);
    expect(list().querySelector("img")).toBeNull();
    expect(list().textContent).toContain('<img src=x onerror="alert(1)">');
    expect(renderMessageCloud(list(), frame([turn("two", "Second"), turn("three", "Third")]))).toBe(true);
    expect(list().querySelectorAll(".turn:not(.leaving)")).toHaveLength(2);
    expect(list().querySelector(".leaving")?.getAttribute("data-turn-id")).toBe("one");
  });

  it("shows the Codex report without repeating the long MCP request", () => {
    const reported = { ...turn("one", "20 public surfaces"),
      prompt: "Read the CasimirBot public UI catalog through MCP and report the exact evidence reference" };
    expect(renderMessageCloud(list(), frame([reported]))).toBe(true);
    expect(list().textContent).toContain("Codex · task report");
    expect(list().textContent).toContain("20 public surfaces");
    expect(list().textContent).not.toContain("Read the CasimirBot public UI catalog");
    expect(list().querySelector(".prompt")).toBeNull();
  });

  it("rejects extra authority fields and evaporates stale bubbles upward", () => {
    vi.useFakeTimers();
    try {
      renderMessageCloud(list(), frame([turn("one", "First")]));
      expect(renderMessageCloud(list(), { ...frame([]), executionAuthority: true })).toBe(false);
      expect(list().textContent).toContain("First");
      renderMessageCloud(list(), frame([turn("two", "Second")]));
      expect(list().querySelector(".leaving")).not.toBeNull();
      vi.advanceTimersByTime(670);
      expect(list().querySelector('[data-turn-id="one"]')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("renders the exact-task conversation separately and clears it on task switch", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><p id="hint"></p><ol id="turns"></ol></div>';
    const mirror = (taskId: string, id: string, answer: string) => ({
      schema: "helix.codex_conversation_cloud_frame.v1", taskId,
      turns: [{ id, user: "Can you help?", assistant: answer,
        assistantPhase: "final_answer", status: "completed" }],
    });
    const first = "01a0798b-b5bd-7bf2-946a-9a77e086316a";
    const second = "01a0798b-b5bd-7bf2-946a-9a77e086316b";
    expect(renderMessageCloud(list(), mirror(first, "turn:one", '<script>alert(1)</script>'))).toBe(true);
    expect(list().querySelector("script")).toBeNull();
    expect(list().textContent).toContain('<script>alert(1)</script>');
    expect(document.querySelector("#cloud h1")?.textContent).toBe("Codex conversation");
    expect(renderMessageCloud(list(), mirror(first, "turn:one", "Updated answer"))).toBe(true);
    expect(list().querySelectorAll('[data-turn-id="turn:one"]')).toHaveLength(1);
    expect(list().textContent).toContain("Updated answer");
    expect(renderMessageCloud(list(), { ...mirror(first, "turn:one", "Updated answer"),
      sourceStatus: "reconnecting" })).toBe(true);
    expect(document.querySelector("#hint")?.textContent).toContain("Reconnecting to Codex");
    expect(list().querySelectorAll('[data-turn-id="turn:one"]')).toHaveLength(1);
    expect(renderMessageCloud(list(), { ...mirror(first, "turn:one", "Updated answer"),
      sourceStatus: "live" })).toBe(true);
    expect(document.querySelector("#hint")?.textContent).not.toContain("Reconnecting to Codex");
    expect(renderMessageCloud(list(), mirror(second, "turn:two", "New task answer"))).toBe(true);
    expect(list().textContent).not.toContain("alert(1)");
    expect(list().textContent).toContain("New task answer");
  });

  it("shows a delegated assistant-only turn without inventing a user prompt", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><p id="hint"></p><ol id="turns"></ol></div>';
    expect(renderMessageCloud(list(), { schema: "helix.codex_conversation_cloud_frame.v1",
      taskId: "01a0f46c-b125-7370-a99d-52bcaf93d345", turns: [{ id: "turn:delegated",
        user: "", assistant: "The exact pairing is active.", assistantPhase: "final_answer",
        status: "completed" }] })).toBe(true);
    expect(list().textContent).toContain("The exact pairing is active.");
    expect(list().textContent).not.toContain("You");
    expect(list().querySelector(".prompt")).toBeNull();
  });

  it("shows all attributed activity by default and filters lanes without deleting their turns", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><select id="lane-filter" hidden></select><p id="hint"></p><ol id="turns"></ol></div>';
    const activity = { ...frame([]), source: "session_activity", codexSourceStatus: "live",
      responsesWorkerStatus: "not_connected",
      pairing: { status: "active", taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a" },
      turns: [
        { id: "agent:reply", lane: "cloud_agent_dm", kind: "answer", author: "cloud_agent",
          prompt: "", delivery: "reported", report: { status: "completed", text: "Cloud reply" } },
        { id: "codex:reply", lane: "codex_task", kind: "answer", author: "codex_task",
          prompt: "", delivery: "reported", report: { status: "completed", text: "Codex reply" } },
      ] };
    expect(renderMessageCloud(list(), activity)).toBe(true);
    expect(document.querySelector("h1")?.textContent).toBe("Session activity");
    expect(list().textContent).toContain("Cloud reply");
    expect(list().textContent).toContain("Codex reply");
    expect(document.querySelector("#hint")?.textContent).toContain("Responses worker: not connected");
    const filter = document.getElementById("lane-filter") as HTMLSelectElement;
    expect(filter.hidden).toBe(false);
    filter.value = "cloud_agent_dm";
    filter.dispatchEvent(new Event("change"));
    expect(list().querySelector<HTMLLIElement>('[data-lane="codex_task"]')?.hidden).toBe(true);
    expect(list().querySelector<HTMLLIElement>('[data-lane="cloud_agent_dm"]')?.hidden).toBe(false);
    expect(renderMessageCloud(list(), { ...activity, codexSourceStatus: "unpaired",
      pairing: { status: "revoked", taskId: null }, turns: activity.turns.slice(0, 1) })).toBe(true);
    expect(list().textContent).not.toContain("Codex reply");
    expect(document.querySelector("#hint")?.textContent).toContain("Codex: pairing revoked");
    expect(document.querySelector("#hint")?.textContent).toContain("Responses worker: not connected");
  });

  it("renders a participating Responses worker as a separately attributed proposal", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><select id="lane-filter" hidden></select><p id="hint"></p><ol id="turns"></ol></div>';
    expect(renderMessageCloud(list(), { ...frame([]), source: "session_activity",
      responsesWorkerStatus: "live", turns: [{ id: "response:decision", lane: "responses_worker",
        kind: "decision", author: "responses_worker", prompt: "", delivery: "reported",
        report: { status: "completed", text: "Checkpoint proposal: hold safe." } }] })).toBe(true);
    expect(list().textContent).toContain("Adapter AI · Responses");
    expect(list().textContent).toContain("Decision proposal");
    expect(list().textContent).toContain("Checkpoint proposal: hold safe.");
    expect(document.querySelector("#hint")?.textContent).toContain("Responses worker: live");
  });

  it("keeps all adapter runs in All and isolates one run in the activity selector", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><select id="lane-filter" hidden></select><p id="hint"></p><ol id="turns"></ol></div>';
    const worker = (id: string, chatId: string, runId: string) => ({
      id, lane: "responses_worker", kind: "decision", author: "responses_worker",
      prompt: "", delivery: "reported", report: { status: "completed", text: `Choice ${id}. No action started.` },
      sourceRun: { helixConversationId: chatId, chatTitle: `Chat ${id}`,
        runId, adapterRef: `source:${id}`, adapterLabel: "Minecraft · Responses" },
    });
    const activity = { ...frame([]), source: "session_activity",
      responsesWorkerStatus: "activity_recorded",
      turns: [worker("one", "chat:first", "run:first"), worker("two", "chat:second", "run:second")] };
    expect(renderMessageCloud(list(), activity)).toBe(true);
    expect(list().textContent).toContain("Choice one");
    expect(list().textContent).toContain("Choice two");
    const filter = document.getElementById("lane-filter") as HTMLSelectElement;
    expect(Array.from(filter.options).map(option => option.textContent)).toContain(
      "Adapter AI · Minecraft · Responses · source:two · run:seco · Chat two");
    filter.value = 'run:["chat:second","run:second","source:two"]';
    filter.dispatchEvent(new Event("change"));
    expect(list().querySelector<HTMLLIElement>('[data-turn-id="one"]')?.hidden).toBe(true);
    expect(list().querySelector<HTMLLIElement>('[data-turn-id="two"]')?.hidden).toBe(false);
    filter.value = "all";
    filter.dispatchEvent(new Event("change"));
    expect(list().querySelector<HTMLLIElement>('[data-turn-id="one"]')?.hidden).toBe(false);
  });

  it("labels every Codex entry by saved chat and filters one chat without removing the others", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><select id="lane-filter" hidden></select><p id="hint"></p><ol id="turns"></ol></div>';
    const codex = (id: string, chatId: string, title: string, text: string) => ({
      id, lane: "codex_task", kind: "answer", author: "codex_task", prompt: "",
      delivery: "reported", report: { status: "completed", text },
      sourceChat: { helixConversationId: chatId, title, taskId: `task:${id}`, status: "live" },
    });
    const activity = { ...frame([]), source: "session_activity", activityScope: "saved_codex_chats",
      turns: [codex("one", "chat:first", "Harness testing", "First answer"),
        codex("two", "chat:second", "Civilization review", "Second answer")] };
    expect(renderMessageCloud(list(), activity)).toBe(true);
    expect(list().textContent).toContain("Codex task · Harness testing · chat:fir");
    expect(list().textContent).toContain("Codex task · Civilization review · chat:sec");
    expect(document.querySelector("#hint")?.textContent).toContain("owner-approved saved Codex chats");
    const filter = document.getElementById("lane-filter") as HTMLSelectElement;
    expect(Array.from(filter.options).map(option => option.textContent)).toContain(
      "Codex · Civilization review · chat:sec");
    filter.value = "chat:chat:second";
    filter.dispatchEvent(new Event("change"));
    expect(list().querySelector<HTMLLIElement>('[data-turn-id="one"]')?.hidden).toBe(true);
    expect(list().querySelector<HTMLLIElement>('[data-turn-id="two"]')?.hidden).toBe(false);
    filter.value = "all";
    filter.dispatchEvent(new Event("change"));
    expect(list().querySelector<HTMLLIElement>('[data-turn-id="one"]')?.hidden).toBe(false);
    expect(renderMessageCloud(list(), { ...activity, turns: [activity.turns[0], {
      ...activity.turns[1], sourceChat: { ...activity.turns[1].sourceChat, status: "reconnecting" },
    }] })).toBe(true);
    expect(list().textContent).toContain("Civilization review · chat:sec · reconnecting");
  });

  it("explains an empty chat-scoped feed and updates the reason when mirror availability changes", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><select id="lane-filter" hidden></select><p id="hint"></p><ol id="turns"></ol></div>';
    const activity = { ...frame([]), source: "session_activity",
      pairing: { status: "active", taskId: null, bindingId: "binding:exact" }, turns: [] };
    expect(renderMessageCloud(list(), { ...activity, codexSourceStatus: "unpaired" })).toBe(true);
    expect(list().textContent).toContain("no exact Codex pairing");
    expect(renderMessageCloud(list(), { ...activity, codexSourceStatus: "unavailable" })).toBe(true);
    expect(list().textContent).toContain("could not be read");
    expect(list().textContent).not.toContain("no exact Codex pairing");
    expect(renderMessageCloud(list(), { ...activity, codexSourceStatus: "unavailable",
      codexSourceReason: "task_reference_invalid" })).toBe(true);
    expect(list().textContent).toContain("task reference unsupported");
    expect(renderMessageCloud(list(), { ...activity, codexSourceStatus: "unavailable",
      pairing: { status: "expired", taskId: null }, turns: [] })).toBe(true);
    expect(document.querySelector("#hint")?.textContent).toContain("Codex: pairing expired");
    expect(list().textContent).toContain("Reapprove the exact task in Agent Access");
  });

  it("formats safe answer structure, links, and math without interpreting raw HTML", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><p id="hint"></p><ol id="turns"></ol></div>';
    const answer = '## Result\n\n**Ready** with [details](https://example.com) and $x^2$.\n\n' +
      '[unsafe](javascript:alert(1)) <img src=x onerror=alert(1)>';
    expect(renderMessageCloud(list(), { schema: "helix.codex_conversation_cloud_frame.v1",
      taskId: "01a0f46c-b125-7370-a99d-52bcaf93d345", turns: [{ id: "turn:format",
        user: "", assistant: answer, assistantPhase: "final_answer", status: "completed" }] })).toBe(true);
    expect(list().querySelector("h4")?.textContent).toBe("Result");
    expect(list().querySelector("strong")?.textContent).toBe("Ready");
    expect(list().querySelector('a[href^="https://example.com"]')?.textContent).toBe("details");
    expect(list().querySelector('a[href^="javascript:"]')).toBeNull();
    expect(list().querySelector("math")).not.toBeNull();
    expect(list().querySelector("img")).toBeNull();
  });

  it("does not reset manual reading position on each mirror poll", () => {
    document.body.innerHTML = '<div id="cloud"><h1></h1><p id="hint"></p><ol id="turns"></ol></div>';
    Object.defineProperty(list(), "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(list(), "clientHeight", { configurable: true, value: 300 });
    const mirror = (taskId: string) => ({ schema: "helix.codex_conversation_cloud_frame.v1", taskId,
      turns: [{ id: "turn:one", user: "Read this", assistant: "A long answer", assistantPhase: "final_answer", status: "completed" }] });
    const first = "01a0798b-b5bd-7bf2-946a-9a77e086316a";
    renderMessageCloud(list(), mirror(first));
    expect(list().scrollTop).toBe(900);
    const existingBubble = list().querySelector('[data-turn-id="turn:one"]');
    const append = vi.spyOn(list(), "append");
    list().scrollTop = 120;
    renderMessageCloud(list(), mirror(first));
    expect(list().scrollTop).toBe(120);
    expect(list().querySelector('[data-turn-id="turn:one"]')).toBe(existingBubble);
    expect(append).not.toHaveBeenCalled();
    append.mockRestore();
    renderMessageCloud(list(), mirror("01a0798b-b5bd-7bf2-946a-9a77e086316b"));
    expect(list().scrollTop).toBe(900);
  });
});
