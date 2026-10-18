import { describe, expect, it } from "vitest";
import channel from "../apps/desktop/scripts/desktop-update-channel.cjs";

const { resolveDesktopUpdateChannel } = channel as {
  resolveDesktopUpdateChannel(input: { releaseMode: boolean; environment?: Record<string, string> }): {
    binaryRepository: string;
    publish: Array<Record<string, string>>;
  };
};

describe("desktop binary update channel", () => {
  it("keeps local packages out of every update channel", () => {
    expect(resolveDesktopUpdateChannel({ releaseMode: false })).toEqual({
      binaryRepository: "",
      publish: [],
    });
  });

  it("requires and binds a separate binary-only GitHub repository for signed releases", () => {
    expect(() => resolveDesktopUpdateChannel({
      releaseMode: true,
      environment: {},
    })).toThrow("CASIMIR_DESKTOP_BINARY_REPOSITORY is required");
    expect(() => resolveDesktopUpdateChannel({
      releaseMode: true,
      environment: { CASIMIR_DESKTOP_BINARY_REPOSITORY: "pestypig/casimirbot-" },
    })).toThrow("separate owner/repository");
    expect(resolveDesktopUpdateChannel({
      releaseMode: true,
      environment: { CASIMIR_DESKTOP_BINARY_REPOSITORY: "pestypig/casimirbot-desktop-releases" },
    })).toEqual({
      binaryRepository: "pestypig/casimirbot-desktop-releases",
      publish: [{
        provider: "github",
        owner: "pestypig",
        repo: "casimirbot-desktop-releases",
        releaseType: "draft",
      }],
    });
  });
});
