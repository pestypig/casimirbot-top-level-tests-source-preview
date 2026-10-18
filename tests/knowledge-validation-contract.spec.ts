import { describe, expect, it } from "vitest";
import { buildKnowledgeValidator, KNOWLEDGE_VALIDATION_FAIL_REASON, KnowledgeValidationError } from "../server/services/knowledge/validation";

describe("knowledge validation contract", () => {
  it("adds validation audit metadata and claim tier on accepted payloads", () => {
    const validate = buildKnowledgeValidator({
      enabled: true,
      promptHintsEnabled: false,
      contextBytes: 8_192,
      maxFilesPerProject: 8,
      allowedMime: ["text/markdown", "text/plain"],
    });

    const projects = [
      {
        project: { id: "project:ok", name: "OK", hashSlug: "ok" },
        files: [
          {
            id: "file:ok",
            name: "ok.md",
            mime: "text/markdown",
            size: 256,
            hashSlug: "ok-md",
            kind: "text" as const,
            preview: "okay",
          },
        ],
      },
    ];

    const validated = validate(projects);
    const audit = (validated?.[0] as { audit?: { validation?: { claim_tier?: string; provenance?: { stage?: string }; status?: string } } })?.audit?.validation;
    expect(audit?.claim_tier).toBe("diagnostic");
    expect(audit?.provenance?.stage).toBe("validation");
    expect(audit?.status).toBe("accepted");
  });

  it("returns deterministic fail_reason id for disallowed mime", () => {
    const validate = buildKnowledgeValidator({
      enabled: true,
      promptHintsEnabled: false,
      contextBytes: 8_192,
      maxFilesPerProject: 8,
      allowedMime: ["text/markdown"],
    });

    expect(() =>
      validate([
        {
          project: { id: "project:mime", name: "Mime", hashSlug: "mime" },
          files: [
            {
              id: "file:mime",
              name: "mime.pdf",
              mime: "application/pdf",
              size: 512,
              hashSlug: "mime-pdf",
              kind: "text",
            },
          ],
        },
      ]),
    ).toThrowError(KnowledgeValidationError);

    try {
      validate([
        {
          project: { id: "project:mime", name: "Mime", hashSlug: "mime" },
          files: [
            {
              id: "file:mime",
              name: "mime.pdf",
              mime: "application/pdf",
              size: 512,
              hashSlug: "mime-pdf",
              kind: "text",
            },
          ],
        },
      ]);
    } catch (error) {
      const validationError = error as KnowledgeValidationError;
      expect(validationError.failReason).toBe(KNOWLEDGE_VALIDATION_FAIL_REASON.disallowedMime);
      expect(validationError.audit?.branch).toBe("mime");
      return;
    }

    throw new Error("expected disallowed mime to throw");
  });

  it("returns deterministic fail_reason id for budget overflow", () => {
    const validate = buildKnowledgeValidator({
      enabled: true,
      promptHintsEnabled: false,
      contextBytes: 128,
      maxFilesPerProject: 8,
      allowedMime: ["text/markdown"],
    });

    try {
      validate([
        {
          project: { id: "project:budget", name: "Budget", hashSlug: "budget" },
          files: [
            {
              id: "file:budget",
              name: "budget.md",
              mime: "text/markdown",
              size: 4_096,
              hashSlug: "budget-md",
              kind: "text",
              preview: "x".repeat(800),
            },
          ],
        },
      ]);
    } catch (error) {
      const validationError = error as KnowledgeValidationError;
      expect(validationError.failReason).toBe(KNOWLEDGE_VALIDATION_FAIL_REASON.budgetOverflow);
      expect(validationError.audit?.branch).toBe("budget");
      expect(validationError.status).toBe(413);
      return;
    }

    throw new Error("expected budget overflow to throw");
  });
});
