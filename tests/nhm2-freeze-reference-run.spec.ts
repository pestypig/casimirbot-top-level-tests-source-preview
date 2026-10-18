import { describe, expect, it } from "vitest";

import { renderPortableInvocation } from "../tools/nhm2/freeze-reference-run";

describe("NHM2 reference-run command provenance", () => {
  it("removes workstation roots while retaining repo-relative command identity", () => {
    const repoRoot =
      "C:\\Users\\operator\\Desktop\\CasimirBot checkout\\CasimirBot";
    const rendered = renderPortableInvocation(
      [
        "C:\\Program Files\\nodejs\\node.exe",
        `${repoRoot}\\tools\\nhm2\\build-candidate-profile-campaign-run.ts`,
        "--profile-search",
        "artifacts/research/full-solve/profile-search/search.json",
      ],
      repoRoot,
    );

    expect(rendered).toBe(
      "node.exe tools/nhm2/build-candidate-profile-campaign-run.ts --profile-search artifacts/research/full-solve/profile-search/search.json",
    );
    expect(rendered).not.toContain("C:\\Users\\operator");
    expect(rendered).not.toContain("Program Files");
  });
});
