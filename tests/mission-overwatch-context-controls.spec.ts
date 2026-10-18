import { describe, expect, it } from "vitest";
import {
  canStartContextSession,
  shouldEmitContextCallout,
  type MissionContextControls,
} from "../client/src/lib/mission-overwatch";

describe("mission overwatch context controls", () => {
  const baseControls: MissionContextControls = {
    tier: "tier1",
    voiceMode: "normal",
    muteWhileTyping: true,
  };

  it("allows context session start only for tier1 idle/error", () => {
    expect(canStartContextSession({ tier: "tier0", sessionState: "idle" })).toBe(false);
    expect(canStartContextSession({ tier: "tier1", sessionState: "idle" })).toBe(true);
    expect(canStartContextSession({ tier: "tier1", sessionState: "error" })).toBe(true);
    expect(canStartContextSession({ tier: "tier1", sessionState: "active" })).toBe(false);
  });

  it("suppresses callouts when session inactive or tier0", () => {
    expect(
      shouldEmitContextCallout({
        controls: { ...baseControls, tier: "tier0" },
        sessionState: "active",
        classification: "critical",
        isUserTyping: false,
      }),
    ).toBe(false);

    expect(
      shouldEmitContextCallout({
        controls: baseControls,
        sessionState: "idle",
        classification: "critical",
        isUserTyping: false,
      }),
    ).toBe(false);
  });

  it("respects voice mode and typing rules", () => {
    expect(
      shouldEmitContextCallout({
        controls: { ...baseControls, voiceMode: "off" },
        sessionState: "active",
        classification: "critical",
        isUserTyping: false,
      }),
    ).toBe(false);

    expect(
      shouldEmitContextCallout({
        controls: { ...baseControls, voiceMode: "critical_only" },
        sessionState: "active",
        classification: "warn",
        isUserTyping: false,
      }),
    ).toBe(false);

    expect(
      shouldEmitContextCallout({
        controls: { ...baseControls, voiceMode: "critical_only" },
        sessionState: "active",
        classification: "critical",
        isUserTyping: false,
      }),
    ).toBe(true);

    expect(
      shouldEmitContextCallout({
        controls: baseControls,
        sessionState: "active",
        classification: "action",
        isUserTyping: true,
      }),
    ).toBe(false);
  });
});
