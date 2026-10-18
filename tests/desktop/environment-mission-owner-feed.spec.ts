import { describe, expect, it, vi } from "vitest";
import { OwnerMissionHudFeed, buildNativeMissionHudFrame } from
  "../../apps/desktop/src/environment-mission-owner-feed";

const now = Date.parse("2026-09-30T12:00:00Z");
const selection = { roomId: "room:one", missionId: "mission:one",
  missionRevision: 2, bindingEpoch: 3, runId: "run:one" };
const sessionIdentity = {
  mission_id: "mission:one", mission_revision: 2, binding_epoch: 3,
  producer_epoch_ref: "producer:one", action_authority_ref: "authority:one",
  scope: { schema: "helix.environment_mission_activity_scope.v1",
    profile_ref: "profile:one", node_ref: "node:one", run_id: "run:one",
    room_ref: "room:one", environment_binding_ref: "binding:one",
    source_ref: "source:one", world_ref: "world:one" },
};
const event = (sequence: number) => ({
  schema: "helix.environment_mission_activity_projection.v1",
  surface: "overlay", activity_event_id: `activity:${sequence}`,
  projection_sequence: sequence, run_id: "run:one",
  event_kind: "checkpoint", outcome: "succeeded",
  label: "Checkpoint", summary: `Event ${sequence}`, truncated: false,
  observed_at: new Date(now - sequence * 100).toISOString(),
  provenance: "measured",
  content_role: "mission_activity_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false, private_reasoning_included: false,
  action_authority_granted: false,
});
const page = (projections: unknown[], more = false, cursor = "poll:one") => ({
  schema: "helix.verified_owner_mission_activity_page.v1",
  run_id: "run:one", session_identity: sessionIdentity, projections,
  next_cursor: more ? "next:one" : null, poll_cursor: cursor,
  has_more: more, complete_for_query: !more,
  content_role: "mission_activity_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false, private_reasoning_included: false,
  action_authority_granted: false,
});

describe("native HUD protected owner feed", () => {
  it("traverses owner pagination, keeps only latest public events, then polls", async () => {
    const readPage = vi.fn().mockResolvedValueOnce(page([event(1), event(2)], true))
      .mockResolvedValueOnce(page([event(3), event(4)]))
      .mockResolvedValueOnce(page([event(5)], false, "poll:two"));
    const feed = new OwnerMissionHudFeed(selection, readPage);
    const first = await feed.refresh();
    expect(readPage.mock.calls.slice(0, 2)).toEqual([[null], ["next:one"]]);
    expect(first?.projections.map(item => item.activity_event_id)).toEqual(
      ["activity:2", "activity:3", "activity:4"]);
    expect((await feed.refresh())?.projections.map(item => item.activity_event_id)).toEqual(
      ["activity:3", "activity:4", "activity:5"]);
    expect(readPage.mock.calls[2]).toEqual(["poll:one"]);
    expect(feed.currentIdentity()).toEqual(sessionIdentity);
    const frame = buildNativeMissionHudFrame({ snapshot: first!,
      player: { clientProcessId: 4242,
        clientProcessStartedAt: "2026-09-30T11:00:00Z" }, nowMs: now });
    expect(frame).toEqual(expect.objectContaining({
      client_process_id: 4242, action_authority_ref: "authority:one",
      action_authority_granted: false, private_reasoning_included: false }));
  });

  it("clears on wrong owner selection, producer rotation, invalid projection or read failure", async () => {
    for (const invalid of [
      { ...page([]), session_identity: { ...sessionIdentity,
        mission_revision: 4 } },
      { ...page([]), session_identity: { ...sessionIdentity,
        scope: { ...sessionIdentity.scope, room_ref: "room:foreign" } } },
      page([{ ...event(1), raw_content_included: true }]),
    ]) {
      const feed = new OwnerMissionHudFeed(selection, async () => invalid);
      expect(await feed.refresh()).toBeNull();
      expect(feed.currentIdentity()).toBeNull();
    }
    const readPage = vi.fn().mockResolvedValueOnce(page([event(1)]))
      .mockResolvedValueOnce({ ...page([]), session_identity: {
        ...sessionIdentity, producer_epoch_ref: "producer:rotated" } });
    const feed = new OwnerMissionHudFeed(selection, readPage);
    expect(await feed.refresh()).not.toBeNull();
    expect(await feed.refresh()).toBeNull();
    expect(feed.currentIdentity()).toBeNull();
    const failing = new OwnerMissionHudFeed(selection, async () => {
      throw new Error("forbidden");
    });
    expect(await failing.refresh()).toBeNull();
  });

  it("revalidates retained source-backed events and drops those no longer projected", async () => {
    let clock = now;
    const readPage = vi.fn().mockResolvedValueOnce(page([event(1)], false, "poll:one"))
      .mockResolvedValueOnce(page([], false, "poll:two"))
      .mockResolvedValueOnce(page([], false, "poll:three"));
    const feed = new OwnerMissionHudFeed(selection, readPage, () => clock);
    expect((await feed.refresh())?.projections).toHaveLength(1);
    clock += 1_000;
    expect((await feed.refresh())?.projections).toHaveLength(1);
    clock += 4_000;
    expect((await feed.refresh())?.projections).toEqual([]);
    expect(readPage.mock.calls).toEqual([[null], ["poll:one"], [null]]);
  });

  it("continues a bounded multi-poll catch-up without exposing partial pages", async () => {
    let clock = now;
    const readPage = vi.fn()
      .mockResolvedValueOnce({ ...page([event(1)], true), next_cursor: "next:1" })
      .mockResolvedValueOnce({ ...page([event(2)], true), next_cursor: "next:2" })
      .mockResolvedValueOnce({ ...page([event(3)], true), next_cursor: "next:3" })
      .mockResolvedValueOnce({ ...page([event(4)], true), next_cursor: "next:4" })
      .mockResolvedValueOnce(page([event(5)], false, "poll:five"));
    const feed = new OwnerMissionHudFeed(selection, readPage, () => clock);
    expect(await feed.refresh()).toBeNull();
    expect(feed.currentIdentity()).toBeNull();
    clock += 1_000;
    expect((await feed.refresh())?.projections.map(item => item.activity_event_id)).toEqual(
      ["activity:3", "activity:4", "activity:5"],
    );
    expect(readPage.mock.calls).toEqual([
      [null], ["next:1"], ["next:2"], ["next:3"], ["next:4"],
    ]);
  });

  it("abandons unfinished pagination at the full-revalidation deadline", async () => {
    let clock = now;
    const readPage = vi.fn()
      .mockResolvedValueOnce({ ...page([event(1)], true), next_cursor: "next:1" })
      .mockResolvedValueOnce({ ...page([event(2)], true), next_cursor: "next:2" })
      .mockResolvedValueOnce({ ...page([event(3)], true), next_cursor: "next:3" })
      .mockResolvedValueOnce({ ...page([event(4)], true), next_cursor: "next:4" })
      .mockResolvedValueOnce(page([event(5)], false, "poll:recent"));
    const feed = new OwnerMissionHudFeed(selection, readPage, () => clock);
    expect(await feed.refresh()).toBeNull();
    clock += 5_000;
    expect((await feed.refresh())?.projections.map(item => item.activity_event_id)).toEqual(
      ["activity:5"],
    );
    expect(readPage.mock.calls[4]).toEqual([null]);
  });
});
