import { describe, expect, it } from "vitest";
import {
  buildF5DeviceAcceptanceReceipt,
  verifyF5DualExeAcceptance,
  type F5DeviceAcceptanceInput,
} from "../scripts/lib/helix-friends-voice-party-f5-acceptance";

const input = (role: "owner" | "friend", deviceLabel: string): F5DeviceAcceptanceInput => ({
  runId: "f5-live-run-01",
  role,
  deviceLabel,
  packageVersion: "0.1.0-alpha.11",
  executableSha256: "a".repeat(64),
  partyId: "voice_party:secret-raw-id",
  startedAt: "2026-08-31T20:00:00.000Z",
  endedAt: "2026-08-31T20:10:00.000Z",
  nativeReadyReceiptObserved: true,
  authenticatedCoordinationObserved: true,
  direct: { connected: true, localCandidateType: "host", remoteCandidateType: "srflx" },
  relay: { connected: true, localCandidateType: "relay", remoteCandidateType: "relay" },
  recoveryTransitions: ["connected", "degraded", "reconnecting", "active", "closed"],
  recoveredWithinWindow: true,
  cleanup: {
    microphoneTracksEnded: true,
    peerConnectionClosed: true,
    signalingPollingStopped: true,
    ephemeralCredentialsDisposed: true,
  },
});

describe("F5 dual-EXE physical acceptance evidence", () => {
  it("pairs distinct native-device attestations without retaining transport material", () => {
    const owner = buildF5DeviceAcceptanceReceipt(input("owner", "device-owner"));
    const friend = buildF5DeviceAcceptanceReceipt(input("friend", "device-friend"));
    const paired = verifyF5DualExeAcceptance(owner, friend);
    expect(paired).toMatchObject({
      ok: true,
      physical_acceptance_candidate: true,
      automated_media_proof: false,
      live_accepted: false,
      promotion_authority: false,
    });
    const serialized = JSON.stringify({ owner, friend, paired });
    expect(serialized).not.toContain("secret-raw-id");
    expect(serialized).not.toMatch(
      /"(?:sdp|candidate_address|session_cookie|bearer|turn_username|turn_credential)"/iu,
    );
  });

  it("rejects non-direct, non-relay, incomplete cleanup, and same-device evidence", () => {
    expect(() => buildF5DeviceAcceptanceReceipt({
      ...input("owner", "device-owner"),
      direct: { connected: true, localCandidateType: "relay", remoteCandidateType: "host" },
    })).toThrow("f5_direct_candidate_pair_not_proven");
    expect(() => buildF5DeviceAcceptanceReceipt({
      ...input("owner", "device-owner"),
      relay: { connected: true, localCandidateType: "srflx", remoteCandidateType: "relay" },
    })).toThrow("f5_relay_candidate_pair_not_proven");
    expect(() => buildF5DeviceAcceptanceReceipt({
      ...input("owner", "device-owner"),
      cleanup: { ...input("owner", "device-owner").cleanup, microphoneTracksEnded: false },
    })).toThrow("f5_cleanup_not_proven");
    const owner = buildF5DeviceAcceptanceReceipt(input("owner", "same-device"));
    const friend = buildF5DeviceAcceptanceReceipt(input("friend", "same-device"));
    expect(() => verifyF5DualExeAcceptance(owner, friend))
      .toThrow("f5_distinct_devices_not_proven");
    expect(() => verifyF5DualExeAcceptance(
      { ...buildF5DeviceAcceptanceReceipt(input("owner", "device-owner")), sdp: "forbidden" },
      buildF5DeviceAcceptanceReceipt(input("friend", "device-friend")),
    )).toThrow("f5_device_receipt_invalid");
  });
});
