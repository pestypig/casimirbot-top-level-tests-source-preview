import { describe, expect, it, vi } from "vitest";
import { clearDesktopEphemeralWebCaches } from "../apps/desktop/src/web-cache-lifecycle";

describe("packaged desktop ephemeral web-cache lifecycle", () => {
  it("clears only service-worker and CacheStorage data", async () => {
    const clearStorageData = vi.fn(async () => undefined);

    await clearDesktopEphemeralWebCaches({ clearStorageData });

    expect(clearStorageData).toHaveBeenCalledOnce();
    expect(clearStorageData).toHaveBeenCalledWith({
      storages: ["serviceworkers", "cachestorage"],
    });
    expect(JSON.stringify(clearStorageData.mock.calls)).not.toMatch(
      /cookies|localstorage|indexdb|password|credential/i,
    );
  });
});
