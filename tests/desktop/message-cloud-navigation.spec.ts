import { describe, expect, it } from "vitest";
import { shouldKeepMessageCloudOnNavigation } from "../../apps/desktop/src/message-cloud-navigation";

describe("Codex cloud navigation boundary", () => {
  const origin = "http://127.0.0.1:51996";

  it("keeps the cloud across desktop panel changes", () => {
    expect(shouldKeepMessageCloudOnNavigation(`${origin}/desktop?focus=star-watcher`, origin)).toBe(true);
    expect(shouldKeepMessageCloudOnNavigation(`${origin}/desktop?focus=agent-access`, origin)).toBe(true);
  });

  it("closes the cloud when the main frame leaves the desktop shell", () => {
    expect(shouldKeepMessageCloudOnNavigation(`${origin}/account`, origin)).toBe(false);
    expect(shouldKeepMessageCloudOnNavigation("https://example.com/desktop", origin)).toBe(false);
    expect(shouldKeepMessageCloudOnNavigation("not a url", origin)).toBe(false);
  });
});
