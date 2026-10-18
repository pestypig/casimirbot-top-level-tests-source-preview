import { describe, expect, it } from "vitest";
import {
  minecraftProcessBlocksPrivateRestart,
  parsePrivateDevChannelState,
} from "../apps/desktop/src/private-dev-update";

describe("private development restart handoff", () => {
  it("offers a staged update without claiming it is already running", () => {
    const state = parsePrivateDevChannelState({
      current: "release-r55", pending: "release-r56", rollback: "release-r54",
      profileSelected: true, lastHandoff: null,
    }, "release-r55");
    expect(state).toMatchObject({ phase: "ready", runningBuild: "release-r55",
      selectedBuild: "release-r55", pendingBuild: "release-r56",
      rollbackBuild: "release-r54", profileSelected: true });
  });

  it("fails closed if a different build is running", () => {
    const state = parsePrivateDevChannelState({ current: "release-r56", pending: null,
      rollback: "release-r55", profileSelected: true }, "release-r55");
    expect(state.phase).toBe("error");
    expect(state.errorCode).toBe("private_channel_running_build_mismatch");
  });

  it("reports a failed handoff while retaining the verified staged candidate", () => {
    const state = parsePrivateDevChannelState({ current: "release-r56", pending: "release-r57",
      rollback: "release-r55", profileSelected: true,
      lastHandoffError: { code: "private_channel_invalid_handoff_request", at: "2026-10-07T04:45:00Z" },
    }, "release-r56");
    expect(state.phase).toBe("ready");
    expect(state.errorCode).toBe("private_channel_invalid_handoff_request");
  });

  it("rejects malformed channel state", () => {
    expect(() => parsePrivateDevChannelState({ current: "../../other" }, "release-r55"))
      .toThrow("private_channel_status_invalid");
  });

  it("blocks a Minecraft/Fabric process and unknown Java command line", () => {
    expect(minecraftProcessBlocksPrivateRestart(["javaw.exe net.minecraft.client.main.Main"])).toBe(true);
    expect(minecraftProcessBlocksPrivateRestart(["java.exe -Dfabric.loader=1 server.jar"])).toBe(true);
    expect(minecraftProcessBlocksPrivateRestart([null])).toBe(true);
    expect(minecraftProcessBlocksPrivateRestart(["java.exe com.example.OtherApp"])).toBe(false);
  });
});
