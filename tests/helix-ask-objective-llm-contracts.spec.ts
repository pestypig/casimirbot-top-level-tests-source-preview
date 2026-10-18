import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyHelixAskObjectiveMiniCritique,
  applyHelixAskObjectiveMiniSynth,
  buildHelixAskObjectiveAssemblyPrompt,
  parseHelixAskObjectiveMiniCritique,
  parseHelixAskObjectiveMiniSynth,
  parseHelixAskObjectiveRetrieveProposal,
  resolveHelixAskObjectivePromptRewriteMode,
  rewriteHelixAskObjectivePromptV1,
} from "../server/services/helix-ask/objectives/objective-llm-contracts";
import type {
  HelixAskObjectiveLoopState,
  HelixAskObjectiveMiniAnswer,
} from "../server/services/helix-ask/objectives/objective-loop-debug";

describe("helix ask objective llm contracts", () => {
  afterEach(() => {
    delete process.env.HELIX_ASK_OBJECTIVE_PROMPT_REWRITE_V1;
    vi.restoreAllMocks();
  });

  it("defaults prompt rewrite mode to on for invalid env values", () => {
    process.env.HELIX_ASK_OBJECTIVE_PROMPT_REWRITE_V1 = "invalid";
    expect(resolveHelixAskObjectivePromptRewriteMode()).toBe("on");
  });

  it("rewrites objective prompts in on mode", () => {
    const rewritten = rewriteHelixAskObjectivePromptV1({
      stage: "retrieve_proposal",
      basePrompt: "base prompt",
      mode: "on",
      responseLanguage: "en",
    });
    expect(rewritten.applied).toBe(true);
    expect(rewritten.effectivePrompt).toContain("Helix Ask technical rewrite mode (v1). stage=retrieve_proposal");
    expect(rewritten.effectivePrompt).toContain("Authoritative base prompt contract:");
  });

  it("parses objective retrieve proposal query payloads", () => {
    const parsed = parseHelixAskObjectiveRetrieveProposal(
      '```json\n{"objective_id":"obj-1","queries":["alpha","beta"],"rationale":"slot fill"}\n```',
    );
    expect(parsed).toEqual({
      objective_id: "obj-1",
      queries: ["alpha", "beta"],
      rationale: "slot fill",
    });
  });

  it("falls back to a single hinted objective when mini-synth is plain text", () => {
    const parsed = parseHelixAskObjectiveMiniSynth(
      "Status partial. Missing slots: mechanism. docs/foo.md",
      {
        objectiveHints: [
          {
            objective_id: "obj-1",
            objective_label: "Mechanism",
            required_slots: ["mechanism", "definition"],
          },
        ],
      },
    );
    expect(parsed?.objectives[0]).toMatchObject({
      objective_id: "obj-1",
      status: "partial",
      missing_slots: ["mechanism"],
      evidence_refs: ["docs/foo.md"],
    });
  });

  it("applies mini-synth results onto objective answers", () => {
    const miniAnswers: HelixAskObjectiveMiniAnswer[] = [
      {
        objective_id: "obj-1",
        objective_label: "Mechanism",
        status: "partial",
        matched_slots: ["definition"],
        missing_slots: ["mechanism"],
        evidence_refs: ["docs/foo.md"],
        summary: "Old",
      },
    ];
    const objectiveStates: HelixAskObjectiveLoopState[] = [
      {
        objective_id: "obj-1",
        objective_label: "Mechanism",
        required_slots: ["definition", "mechanism"],
        matched_slots: ["definition"],
        status: "synthesizing",
        attempt: 1,
      },
    ];
    const applied = applyHelixAskObjectiveMiniSynth({
      miniAnswers,
      synth: {
        objectives: [
          {
            objective_id: "obj-1",
            status: "covered",
            matched_slots: ["definition", "mechanism"],
            missing_slots: [],
            summary: "New",
            evidence_refs: ["docs/bar.md"],
          },
        ],
      },
      objectiveStates,
    });
    expect(applied[0]).toMatchObject({
      status: "covered",
      matched_slots: ["definition", "mechanism"],
      missing_slots: [],
      summary: "New",
      evidence_refs: ["docs/bar.md", "docs/foo.md"],
    });
  });

  it("parses and applies mini-critic results", () => {
    const critique = parseHelixAskObjectiveMiniCritique(
      '{"objectives":[{"objective_id":"obj-1","status":"partial","missing_slots":["mechanism"],"reason":"needs mechanism evidence"}]}',
    );
    expect(critique?.objectives[0]).toMatchObject({
      objective_id: "obj-1",
      status: "partial",
      missing_slots: ["mechanism"],
    });
    const miniAnswers: HelixAskObjectiveMiniAnswer[] = [
      {
        objective_id: "obj-1",
        objective_label: "Mechanism",
        status: "covered",
        matched_slots: ["definition", "mechanism"],
        missing_slots: [],
        evidence_refs: ["docs/foo.md"],
        summary: "Covered",
      },
    ];
    const objectiveStates: HelixAskObjectiveLoopState[] = [
      {
        objective_id: "obj-1",
        objective_label: "Mechanism",
        required_slots: ["definition", "mechanism"],
        matched_slots: ["definition", "mechanism"],
        status: "complete",
        attempt: 1,
      },
    ];
    const applied = applyHelixAskObjectiveMiniCritique({
      miniAnswers,
      critique: critique!,
      objectiveStates,
    });
    expect(applied[0].status).toBe("partial");
    expect(applied[0].missing_slots).toEqual(["mechanism"]);
    expect(applied[0].summary).toContain("needs mechanism evidence");
  });

  it("builds assembly prompts that fail closed for unresolved objectives", () => {
    const prompt = buildHelixAskObjectiveAssemblyPrompt({
      question: "How does it work?",
      currentAnswer: "Draft",
      miniAnswers: [
        {
          objective_id: "obj-1",
          objective_label: "Mechanism",
          status: "partial",
          matched_slots: ["definition"],
          missing_slots: ["mechanism"],
          evidence_refs: ["docs/foo.md"],
          summary: "Partial",
        },
      ],
      responseLanguage: "en",
    });
    expect(prompt).toContain("fail closed");
    expect(prompt).toContain("Objective checkpoints:");
  });

  it("builds assembly prompts that forbid meta non-answer framing", () => {
    const prompt = buildHelixAskObjectiveAssemblyPrompt({
      question: "what is this?",
      currentAnswer: "Draft",
      miniAnswers: [
        {
          objective_id: "obj-1",
          objective_label: "Definition",
          status: "covered",
          matched_slots: ["definition"],
          missing_slots: [],
          evidence_refs: ["docs/foo.md"],
          summary: "Covered",
        },
      ],
      responseLanguage: "en",
    });
    expect(prompt).toContain("Answer the user's question directly");
    expect(prompt).toContain("Forbidden meta framing");
    expect(prompt).toContain("does not provide a clear answer");
  });
});
