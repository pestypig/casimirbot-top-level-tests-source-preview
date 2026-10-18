import { describe, expect, it } from "vitest";
import { roomServiceNavigationUrl, readRoomServiceTarget, roomServiceReturnPath } from "../shared/helix-room-service-navigation";
import { encodeWorkstationViewStateSearch } from "../shared/workstation-view-state";

const request = { authority: "https://rooms.example", room_id: "shared_realtime_room:exact" };
describe("room service navigation boundary", () => {
  it("constructs only the configured service's exact room entry", () => {
    expect(roomServiceNavigationUrl(request, "https://rooms.example/")).toBe(
      "https://rooms.example/desktop?service_room=shared_realtime_room%3Aexact");
    expect(readRoomServiceTarget(new URL(roomServiceNavigationUrl(request, request.authority)).search)).toBe(request.room_id);
  });
  it.each([undefined, "http://rooms.example", "https://user:password@rooms.example", "https://rooms.example/path",
    "https://rooms.example?token=secret", "https://rooms.example#secret", "https://other.example"])("rejects invalid or changed configured authority %s", authority => {
    expect(() => roomServiceNavigationUrl(request, authority)).toThrow();
  });
  it.each([{ ...request, authority: "https://attacker.example" }, { ...request, url: "https://attacker.example" },
    { ...request, room_id: "../../other" }, { ...request, access_token: "secret" }, { ...request, room_id: "shared_realtime_room:a?token=secret" }])("rejects overridden destinations and secret-bearing payloads", input => {
    expect(() => roomServiceNavigationUrl(input, request.authority)).toThrow();
  });
  it("rejects duplicate or invalid URL selectors and preserves selection during workspace layout changes", () => {
    expect(readRoomServiceTarget("?service_room=shared_realtime_room:a&service_room=shared_realtime_room:b")).toBeNull();
    expect(readRoomServiceTarget("?service_room=../bad")).toBeNull();
    expect(readRoomServiceTarget("?unrelated=true")).toBeNull();
    const search = encodeWorkstationViewStateSearch({ panels: ["account-session"], focusPanel: "account-session" }, roomServiceReturnPath(request.room_id).split("?")[1]);
    expect(readRoomServiceTarget(search)).toBe(request.room_id);
  });
});
