import { describe, expect, it } from "vitest";

import {
  repairGlobalTerminalSources,
  repairTerminalVisibleSources,
} from "../server/services/helix-ask/surface/terminal-citation-repair";
import {
  buildObjectiveTerminalSourcesRepairContext,
  collectTerminalCitationHints,
  shouldAddSourcesMissingReason,
} from "../server/services/helix-ask/surface/terminal-sources-gate";

describe("helix ask terminal sources gate helpers", () => {
  it("collects normalized citation contract hints from debug payload", () => {
    const hints = collectTerminalCitationHints({
      citation_contract_sources: [
        "server/routes/agi.plan.ts",
        "server/routes/agi.plan.ts",
        "./docs/helix-ask-flow.md",
      ],
    });

    expect(hints).toEqual(["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"]);
  });

  it("detects when terminal sources are still missing", () => {
    expect(
      shouldAddSourcesMissingReason({
        visibleSourcesRequired: true,
        hasSourcesLine: false,
      }),
    ).toBe(true);
    expect(
      shouldAddSourcesMissingReason({
        visibleSourcesRequired: false,
        hasSourcesLine: false,
      }),
    ).toBe(false);
  });

  it("builds a filtered objective terminal source repair context from debug payload", () => {
    const context = buildObjectiveTerminalSourcesRepairContext({
      debugPayload: {
        objective_mini_answers: [
          { evidence_refs: ["server/routes/agi.plan.ts", "docs/skip.md"] },
        ],
        objective_retrieval_selected_files: [{ files: ["server/services/helix-ask/format.ts"] }],
      },
      planAllowedCitations: ["server/routes/agi.plan.ts", "server/services/helix-ask/format.ts"],
      normalizeConstraintPath: (value) => value.replace(/\\/g, "/").trim(),
    });

    expect(context.allowlist).toEqual([
      "server/routes/agi.plan.ts",
      "server/services/helix-ask/format.ts",
    ]);
    expect(context.lineCandidates).toEqual([
      "server/routes/agi.plan.ts",
      "server/services/helix-ask/format.ts",
    ]);
    expect(context.filtered).toBe(true);
  });
});

describe("helix ask terminal citation repair helpers", () => {
  it("repairs a terminal sources line using the allowlist and candidate sources", () => {
    const repaired = repairTerminalVisibleSources({
      text: "Repo-grounded answer.\n\nSources: docs/skip.md",
      allowlist: ["server/routes/agi.plan.ts", "server/services/helix-ask/format.ts"],
      lineCandidates: ["server/routes/agi.plan.ts"],
    });

    expect(repaired.applied).toBe(true);
    expect(repaired.text).toContain("Sources: server/routes/agi.plan.ts");
    expect(repaired.text).not.toContain("docs/skip.md");
  });

  it("repairs global terminal sources only when the gate requires them", () => {
    const repaired = repairGlobalTerminalSources({
      text: "Repo answer.",
      visibleSourcesRequired: true,
      sourcesMissingReasonPresent: true,
      allowedSources: ["server/routes/agi.plan.ts"],
    });

    expect(repaired.applied).toBe(true);
    expect(repaired.text).toContain("Sources: server/routes/agi.plan.ts");

    const skipped = repairGlobalTerminalSources({
      text: "Repo answer.",
      visibleSourcesRequired: false,
      sourcesMissingReasonPresent: true,
      allowedSources: ["server/routes/agi.plan.ts"],
    });
    expect(skipped.applied).toBe(false);
    expect(skipped.text).toBe("Repo answer.");
  });
});
