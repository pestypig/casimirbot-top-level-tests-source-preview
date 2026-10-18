import { describe, expect, it, vi } from "vitest";
import { createPrivateRemovalIpcHandlers } from "../apps/desktop/src/environment-private-removal-ipc";
const setup = () => {
  const frame = { url: "http://127.0.0.1:43121/desktop" }, session = {};
  const sender = { session, mainFrame: frame, isDestroyed: () => false };
  const owner = { inspectRemoval: vi.fn(async (_session: object): Promise<unknown> => ({ status: "not_installed" })),
    removePackage: vi.fn(async (_session: object): Promise<unknown> => ({ status: "cancelled" })) };
  const handlers = createPrivateRemovalIpcHandlers({ mainSender: () => sender, isTrustedUrl: url => url === frame.url,
    owner: () => owner as never });
  return { frame, sender, session, owner, handlers, event: { sender, senderFrame: frame } };
};
describe("removal IPC boundary", () => {
  it("routes only the trusted session and no renderer arguments", async () => {
    const s = setup(); expect(await s.handlers.inspect(s.event)).toEqual({ status: "not_installed" });
    expect(await s.handlers.remove(s.event)).toEqual({ status: "cancelled" });
    expect(s.owner.inspectRemoval).toHaveBeenCalledWith(s.session); expect(s.owner.removePackage).toHaveBeenCalledWith(s.session);
  });
  it.each(["foreign-window", "subframe", "missing-frame", "destroyed", "arguments"])("rejects %s before owner access", async kind => {
    const s = setup(); const event = { ...s.event, senderFrame: s.event.senderFrame as {url: string} | null };
    if (kind === "foreign-window") event.sender = { ...s.sender };
    if (kind === "subframe") event.senderFrame = { ...s.frame };
    if (kind === "missing-frame") event.senderFrame = null;
    if (kind === "destroyed") s.sender.isDestroyed = () => true;
    expect(await s.handlers.remove(event, ...(kind === "arguments" ? [{ path: "forbidden", profileId: "other" }] : [])))
      .toEqual({ status: "unavailable", error: "private_removal_unavailable" });
    expect(s.owner.removePackage).not.toHaveBeenCalled();
  });
  it("rejects a navigated main frame", async () => {
    const s = setup(); const handlers = createPrivateRemovalIpcHandlers({ mainSender: () => s.sender, isTrustedUrl: () => false, owner: () => s.owner as never });
    expect(await handlers.remove(s.event)).toMatchObject({ status: "unavailable" }); expect(s.owner.removePackage).not.toHaveBeenCalled();
  });
  it.each(["throw", "invalid-result"])("sanitizes %s", async kind => {
    const s = setup();
    if (kind === "throw") s.owner.removePackage.mockRejectedValue(Error("private local path"));
    else s.owner.removePackage.mockResolvedValue({ status: "cancelled", sessionId: "secret" });
    expect(await s.handlers.remove(s.event)).toEqual({ status: "unavailable", error: "private_removal_unavailable" });
  });
});
