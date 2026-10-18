import { describe, expect, it, vi } from "vitest";
import { createLiveConnectionIpc } from "../apps/desktop/src/live-connection-ipc";

describe("native Gemini comparison admission", () => {
  it("requires a trusted developer frame and suppresses output after an account switch", async () => {
    const mainFrame = { url: "http://localhost/desktop" };
    const sender = { mainFrame, isDestroyed: () => false };
    const event = { sender, senderFrame: mainFrame };
    let account = { profileId: "owner", sessionId: "account_session:11111111",
      accountType: "user" as "user" | "developer" };
    let finish!: (value: { ok: true; code: "gemini_reflection_confirmed" }) => void;
    const probe = vi.fn(() => new Promise<{ ok: true; code: "gemini_reflection_confirmed" }>(
      resolve => { finish = resolve; }));
    const handle = createLiveConnectionIpc({ mainSender: () => sender,
      trustedUrl: url => url === mainFrame.url, readAccount: async () => account,
      store: { testGeminiPublicContext: probe } as never });
    expect(await handle(event, { action: "gemini_reflection_probe" }))
      .toEqual({ ok: false, code: "request_rejected" });
    expect(probe).not.toHaveBeenCalled();
    account = { ...account, accountType: "developer" };
    expect(await handle({ sender: { ...sender }, senderFrame: mainFrame },
      { action: "gemini_reflection_probe" })).toEqual({ ok: false, code: "request_rejected" });
    expect(await handle(event, { action: "gemini_reflection_probe", key: "renderer-key" }))
      .toEqual({ ok: false, code: "request_rejected" });
    const pending = handle(event, { action: "gemini_reflection_probe" });
    await vi.waitFor(() => expect(probe).toHaveBeenCalledWith("owner"));
    account = { ...account, profileId: "guest" };
    finish({ ok: true, code: "gemini_reflection_confirmed" });
    expect(await pending).toEqual({ ok: false, code: "account_changed" });
  });
});
