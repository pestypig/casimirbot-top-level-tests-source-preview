import { afterEach, describe, expect, it, vi } from "vitest";
import * as activityDb from "../server/db/essence-activity";
import { recordActivityEvents } from "../server/services/essence/activity-log";

describe("recordActivityEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips writes when ownerId is missing", async () => {
    const insertSpy = vi.spyOn(activityDb, "insertActivitySamples");
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const sample = { ts: new Date().toISOString(), panelId: "Hull3DRenderer" };

    const count = await recordActivityEvents(null, [sample]);

    expect(count).toBe(0);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      "[activity-log] skip recordActivityEvents: missing ownerId (dropping 1 samples)",
    );
  });
});
