import { describe, expect, it } from "vitest";
import { listPromptProfiles } from "../server/services/essence/prompt-variants";
import { PATCH_PROMPT_FRAMEWORK } from "../server/services/proposals/prompt-presets";

describe("essence prompt variants", () => {
  it("uses the shared patch prompt framework export for default profile", () => {
    const [profile] = listPromptProfiles();

    expect(profile).toBeDefined();
    expect(profile.baseTemplate).toBe(PATCH_PROMPT_FRAMEWORK);
    expect(profile.baseTemplate.length).toBeGreaterThan(0);
  });
});
