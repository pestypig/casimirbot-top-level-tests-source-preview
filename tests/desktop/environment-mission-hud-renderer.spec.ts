// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderMissionHudEvents } from
  "../../apps/desktop/src/environment-mission-hud-renderer";

const projection = (summary: string) => ({
  schema: "helix.environment_mission_activity_projection.v1",
  surface: "overlay", activity_event_id: "activity:one", projection_sequence: 1,
  run_id: "run:one", event_kind: "checkpoint", outcome: "succeeded",
  label: "Checkpoint", summary, truncated: false,
  observed_at: "2026-09-30T12:00:00.000Z", provenance: "measured",
  content_role: "mission_activity_not_assistant_answer", answer_authority: false,
  assistant_answer: false, terminal_eligible: false, raw_content_included: false,
  private_reasoning_included: false, action_authority_granted: false,
});

describe("isolated mission HUD text renderer", () => {
  beforeEach(() => { document.body.innerHTML = '<ol id="events"></ol>'; });
  const list = () => document.getElementById("events") as HTMLOListElement;

  it("renders public text as text nodes, never executable markup", () => {
    expect(renderMissionHudEvents(list(), [projection('<img src=x onerror="alert(1)">')]))
      .toBe(true);
    expect(document.querySelector("#events img")).toBeNull();
    expect(document.querySelector("#events")?.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("does not render authority claims or malformed activity, and clears promptly", () => {
    expect(renderMissionHudEvents(list(), [
      { ...projection("forged"), action_authority_granted: true },
    ])).toBe(false);
    expect(document.querySelector("#events")?.textContent).toBe("");
    expect(renderMissionHudEvents(list(), [projection("Safe ledge")])).toBe(true);
    expect(document.querySelector("#events")?.textContent).toContain("Safe ledge");
    list().replaceChildren();
    expect(document.querySelector("#events")?.textContent).toBe("");
  });
});
