import { describe, expect, it } from "vitest";

import {
  buildDeterministicHelixAskObjectiveAssembly,
  sanitizeHelixAskObjectiveUnknownBlock,
} from "../server/services/helix-ask/objectives/objective-assembly";

describe("helix ask objective assembly", () => {
  it("fail-closes when a required objective remains unresolved", () => {
    const assembled = buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "profiles voice lane",
          status: "partial",
          matched_slots: ["repo-mapping"],
          missing_slots: ["voice-lane"],
          evidence_refs: ["server/routes/voice.ts"],
          summary: "profiles voice lane: partially covered.",
        },
      ],
      currentAnswer: "Main answer body.",
      blockedReason: "objective_assembly_fail_closed_missing_scoped_retrieval",
      missingScopedRetrievalObjectiveIds: ["obj_1"],
    });

    expect(assembled).toMatch(/Assembly blocked: required objective gate failed-closed\./i);
    expect(assembled).toMatch(/Open gaps \/ UNKNOWNs:/i);
    expect(assembled).toMatch(/UNKNOWN - profiles voice lane/i);
    expect(assembled).toMatch(/What I checked:\s*server\/routes\/voice\.ts/i);
  });

  it("preserves the conversational draft for soft fallback mode", () => {
    const assembled = buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "shift vector mild-regime meaning",
          status: "partial",
          matched_slots: ["mechanism"],
          missing_slots: ["solve-connection"],
          evidence_refs: ["server/routes/agi.plan.ts"],
          summary: "shift vector mild-regime meaning: partially covered.",
        },
      ],
      currentAnswer:
        "The norm of the shift vector matters because it tells you how strong the coordinate transport term is inside the solve.",
      blockedReason: "objective_assembly_fail_closed_missing_scoped_retrieval",
      missingScopedRetrievalObjectiveIds: ["obj_1"],
      visibleFailClosed: false,
    });

    expect(assembled).toMatch(/coordinate transport term/i);
    expect(assembled).not.toMatch(/Assembly blocked:/i);
    expect(assembled).not.toMatch(/UNKNOWN -/i);
  });

  it("sanitizes generic scaffold phrasing from UNKNOWN blocks", () => {
    const block = sanitizeHelixAskObjectiveUnknownBlock({
      objectiveLabel: "first principles meaning in physics",
      missingSlots: ["definition"],
      evidenceRefs: [],
      block: {
        unknown:
          'For "What are first principles meaning in physics?", start with one concrete claim.',
        why: "core meaning of the concept in its domain context",
        what_i_checked: [],
        next_retrieval: "Sources: open-world best-effort (no repo citations required).",
      },
    });

    expect(block.unknown).toMatch(/Required objective unresolved:/i);
    expect(block.why).toMatch(/missing definition/i);
    expect(block.what_i_checked.join(" ")).toMatch(/No objective-local evidence was captured/i);
    expect(block.next_retrieval).toMatch(/Run objective-scoped retrieval/i);
    expect(block.unknown).not.toMatch(/start with one concrete claim/i);
  });

  it("injects commonality fallback before fail-closed UNKNOWN blocks", () => {
    const assembled = buildDeterministicHelixAskObjectiveAssembly({
      miniAnswers: [
        {
          objective_id: "obj_1",
          objective_label: "electron and solar-system kinematics commonality",
          status: "partial",
          matched_slots: [],
          missing_slots: ["definition"],
          evidence_refs: ["docs/knowledge/physics/physics-foundations-tree.json"],
          summary: "electron and solar-system kinematics commonality: partially covered.",
        },
      ],
      currentAnswer: "",
      blockedReason: "objective_assembly_fail_closed_required_objective_unresolved",
      question: "What is the electron and kinematics of the solar system have in common?",
    });

    expect(assembled).toMatch(/dynamical systems/i);
    expect(assembled).toMatch(/equations of motion|conservation laws/i);
    expect(assembled).toMatch(/Assembly blocked: required objective gate failed-closed\./i);
    expect(assembled).toMatch(/Sources:\s*docs\/knowledge\/physics\/physics-foundations-tree\.json/i);
  });
});
