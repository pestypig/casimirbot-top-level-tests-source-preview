import { describe, it, expect } from "vitest";
import { summarizeExecutionResults } from "../server/services/planner/chat-b";

describe("console summary normalization", () => {
  it("picks human-readable text from structured tool outputs", () => {
    const summary = summarizeExecutionResults([
      {
        id: "step-1",
        kind: "tool.call",
        ok: true,
        output: { excerpt: "Hello from README" },
        citations: [],
      },
    ] as any);
    expect(summary).toContain("Hello from README");
  });
});

