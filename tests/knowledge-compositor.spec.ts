import { describe, expect, it } from "vitest";
import type { KnowledgeProjectExport } from "@shared/knowledge";
import { composeKnowledgeAppendix } from "../server/services/planner/knowledge-compositor";

const buildProject = (): KnowledgeProjectExport[] => [
  {
    project: { id: "project:test", name: "Test Bundle", hashSlug: "test-bundle", tags: ["docs"] },
    summary: "Warp safety bundle.",
    files: [
      {
        id: "file:drive",
        name: "drive.md",
        mime: "text/markdown",
        size: 256,
        kind: "text",
        preview: "Warp drive safety procedures and bubble shaping instructions.",
      },
      {
        id: "file:noise",
        name: "noise.txt",
        mime: "text/plain",
        size: 180,
        kind: "text",
        preview: "Ambient noise playlist track listing.",
      },
    ],
  },
];

describe("knowledge compositor", () => {
  it("selects best matching attachments and emits citations", () => {
    const appendix = composeKnowledgeAppendix({
      goal: "Need warp bubble instructions for drive safety.",
      knowledgeContext: buildProject(),
      maxSnippets: 2,
    });
    expect(appendix.text).toContain("drive.md");
    expect(appendix.citations).toContain("test-bundle/drive.md");
    // non-matching snippet should appear after the drive snippet
    const driveIndex = appendix.text.indexOf("drive.md");
    const noiseIndex = appendix.text.indexOf("noise.txt");
    expect(driveIndex).toBeGreaterThan(-1);
    expect(noiseIndex).toBeGreaterThan(driveIndex);
  });

  it("respects char limits", () => {
    const appendix = composeKnowledgeAppendix({
      goal: "summaries",
      knowledgeContext: buildProject(),
      maxChars: 220,
    });
    expect(appendix.text.length).toBeLessThanOrEqual(220);
  });

  it("returns empty payload when no knowledge context is provided", () => {
    const appendix = composeKnowledgeAppendix({
      goal: "anything",
      knowledgeContext: undefined,
    });
    expect(appendix.text).toBe("");
    expect(appendix.citations).toHaveLength(0);
  });
});
