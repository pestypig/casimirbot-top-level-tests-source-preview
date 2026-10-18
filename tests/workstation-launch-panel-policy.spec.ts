import { describe, expect, it } from "vitest";
import { isUserLaunchPanel } from "@/lib/workstation/launchPanelPolicy";

describe("workstation launch panel policy", () => {
  it("includes retrieval-first production panels", () => {
    expect(isUserLaunchPanel("docs-viewer")).toBe(true);
    expect(isUserLaunchPanel("mission-ethos")).toBe(true);
    expect(isUserLaunchPanel("agi-essence-console")).toBe(true);
  });

  it("excludes unfinished warp/nhm2 launch surfaces", () => {
    expect(isUserLaunchPanel("alcubierre-viewer")).toBe(false);
    expect(isUserLaunchPanel("nhm2-solve-state")).toBe(false);
    expect(isUserLaunchPanel("warp-ledger")).toBe(false);
  });
});

