import { describe, expect, it } from "vitest";
import { generateChecklistAddendum } from "../server/services/evolution/checklist-generator";

describe("evolution checklist addendum", () => {
  it("is deterministic and stably sorted", () => {
    const one = generateChecklistAddendum({ patchId: "patch:1", touchedPaths: ["shared/x.ts", "server/a.ts"] });
    const two = generateChecklistAddendum({ patchId: "patch:1", touchedPaths: ["server/a.ts", "shared/x.ts"] });
    expect(one).toEqual(two);
    expect(one.schema_version).toBe("helix_agent_patch_checklist_addendum/1");
    expect(one.mandatory_reads).toEqual([...one.mandatory_reads].sort());
  });
});
