import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TMemoryRecord, TTaskTrace } from "../shared/essence-persona";
import type { ToolSpecShape } from "../shared/skills";
import {
  PLAN_DSL_CHAIN,
  buildChatBPlan,
  compilePlan,
  executeCompiledPlan,
  renderChatBPlannerPrompt,
  type ExecutorStep,
} from "../server/services/planner/chat-b";
import { listMemoryRecords, putMemoryRecord, resetMemoryStore } from "../server/services/essence/memory-store";
import { llmLocalHandler, llmLocalSpec } from "../server/skills/llm.local";
import { registerTool } from "../server/skills";
import { kvReset } from "../server/services/llm/kv-budgeter";
import { __resetToolLogStore, getToolLogs } from "../server/services/observability/tool-log-store";
import { scorePremeditation } from "../server/services/premeditation-scorer";

const baseRecord: TMemoryRecord = {
  id: "m-base",
  owner_id: "alice",
  created_at: "2025-11-09T00:00:00Z",
  kind: "semantic",
  text: "Alpha warp bubble is stable and ready for the handoff.",
  keys: ["warp bubble status", "handoff ready"],
  visibility: "public",
};

describe("Chat B planner", () => {
  beforeAll(() => {
    registerTool({ ...llmLocalSpec, handler: llmLocalHandler });
  });

  beforeEach(async () => {
    await resetMemoryStore();
    kvReset();
    __resetToolLogStore();
  });

  it("renders a planner prompt that references the PlanDSL chain and manifest", () => {
    const prompt = renderChatBPlannerPrompt({
      goal: "Report on Alpha bubble",
      personaId: "alice",
      manifest: [
        { name: "llm.local.generate", desc: "Local stub", deterministic: false, rateLimit: { rpm: 60 } },
      ],
      searchQuery: "Alpha warp bubble status",
      topK: 4,
      summaryFocus: "Call out blockers",
    });
    expect(prompt).toContain(PLAN_DSL_CHAIN);
    expect(prompt).toContain("Alpha warp bubble status");
    expect(prompt).toContain("llm.local.generate");
  });

  it("executes the SEARCH->SUMMARIZE->CALL(tool) plan", async () => {
    await putMemoryRecord(baseRecord);
    const { nodes } = buildChatBPlan({
      goal: "Summarize Alpha warp status",
      searchQuery: "Alpha warp bubble status",
      finalTool: llmLocalSpec.name,
    });
    const compiled = compilePlan(nodes);
    const sessionId = randomUUID();
    const goal = "Summarize Alpha warp status";
    const results = await executeCompiledPlan(compiled, { goal, sessionId });
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ kind: "memory.search", ok: true });
    expect(results[1]).toMatchObject({ kind: "summary.compose", ok: true });
    const summaryOutput = results[1].ok ? (results[1].output as string) : "";
    expect(summaryOutput).toContain("Goal: Summarize Alpha warp status");
    const finalStep = results[2];
    expect(finalStep.ok).toBe(true);
    expect(finalStep).toMatchObject({ kind: "tool.call" });
    expect((finalStep.ok && (finalStep.output as any)?.text) ?? "").toBe("llm.local stub result");
    const expectedCitation = `memory:${baseRecord.id}`;
    expect(results[0].citations).toContain(expectedCitation);
    expect(results[1].citations).toEqual(results[0].citations);
    expect(results[2].citations).toEqual(results[1].citations);
  });

  it("summarizes evicted turns to Essence when the KV budget is exceeded", async () => {
    const previousBudget = process.env.KV_BUDGET_BYTES;
    const previousEssence = process.env.ENABLE_ESSENCE;
    process.env.KV_BUDGET_BYTES = "1";
    process.env.ENABLE_ESSENCE = "1";
    await putMemoryRecord(baseRecord);
    const { nodes } = buildChatBPlan({
      goal: "Summarize Alpha warp status",
      searchQuery: "Alpha warp bubble status",
      finalTool: llmLocalSpec.name,
    });
    const compiled = compilePlan(nodes);
    const sessionId = randomUUID();
    await executeCompiledPlan(compiled, { goal: "Summarize Alpha warp status", sessionId });
    const evictionSummaries = (await listMemoryRecords()).filter((record) => record.keys.includes("kv-eviction"));
    expect(evictionSummaries.length).toBeGreaterThan(0);
    const latest = evictionSummaries[evictionSummaries.length - 1];
    expect(latest.text ?? "").toContain("KV eviction summary");
    expect(latest.text ?? "").toContain(baseRecord.id);
    expect(latest.keys).toContain(`session:${sessionId}`);
    if (previousBudget === undefined) {
      delete process.env.KV_BUDGET_BYTES;
    } else {
      process.env.KV_BUDGET_BYTES = previousBudget;
    }
    if (previousEssence === undefined) {
      delete process.env.ENABLE_ESSENCE;
    } else {
      process.env.ENABLE_ESSENCE = previousEssence;
    }
  });

  it("records approvals for tools flagged as risky", async () => {
    const spec: ToolSpecShape = {
      name: "fs.write.test",
      desc: "writes envelopes to disk",
      inputSchema: {} as any,
      outputSchema: {} as any,
      deterministic: true,
      rateLimit: { rpm: 10 },
      safety: { risks: ["writes_files"] },
    };
    registerTool({
      ...spec,
      handler: async () => ({ ok: true }),
    });
    const steps: ExecutorStep[] = [
      { id: "call-1", kind: "tool.call", tool: spec.name, promptTemplate: "{{goal}}", extra: {} },
    ];
    const taskTrace: TTaskTrace = {
      id: "trace-approval",
      persona_id: "alice",
      created_at: new Date().toISOString(),
      goal: "Ensure approvals log",
      plan_json: [],
      steps: [],
      approvals: [],
    };
    await executeCompiledPlan(steps, { goal: "Ensure approvals log", sessionId: "trace-approval", taskTrace });
    expect(taskTrace.approvals).toHaveLength(1);
    expect(taskTrace.approvals[0]).toMatchObject({ tool: spec.name, capability: "writes_files" });
  });

  it("writes procedural reflections and readable tool logs when enabled", async () => {
    process.env.ENABLE_REFLECTION = "1";
    process.env.ENABLE_LOG_TEXT = "1";
    await putMemoryRecord(baseRecord);
    const { nodes } = buildChatBPlan({
      goal: "Summarize Alpha warp status",
      searchQuery: "Alpha warp bubble status",
      finalTool: llmLocalSpec.name,
    });
    const compiled = compilePlan(nodes);
    const taskTrace: TTaskTrace = {
      id: "trace-reflection",
      persona_id: "alice",
      created_at: new Date().toISOString(),
      goal: "Summarize Alpha warp status",
      plan_json: [],
      steps: [],
      approvals: [],
    };
    const results = await executeCompiledPlan(compiled, {
      goal: "Summarize Alpha warp status",
      sessionId: taskTrace.id,
      personaId: "alice",
      taskTrace,
    });
    const memories = await listMemoryRecords();
    const reflection = memories.find((record) => record.kind === "procedural" && record.keys.includes("reflection"));
    expect(reflection).toBeTruthy();
    expect(reflection?.keys).toContain(`task:${taskTrace.id}`);
    const logs = getToolLogs({ limit: 1 });
    expect(logs[0]?.text).toContain("[ok] llm.local.generate");
    delete process.env.ENABLE_REFLECTION;
    delete process.env.ENABLE_LOG_TEXT;
  });

  it("records scientific-method metadata on task traces", async () => {
    await putMemoryRecord(baseRecord);
    const { nodes } = buildChatBPlan({
      goal: "Summarize Alpha warp status",
      searchQuery: "Alpha warp bubble status",
      finalTool: llmLocalSpec.name,
    });
    const compiled = compilePlan(nodes);
    const taskTrace: TTaskTrace = {
      id: "trace-scientific-method",
      persona_id: "alice",
      created_at: new Date().toISOString(),
      goal: "Summarize Alpha warp status",
      plan_json: nodes,
      steps: [],
      approvals: [],
    };
    await executeCompiledPlan(compiled, {
      goal: taskTrace.goal,
      sessionId: taskTrace.id,
      personaId: "alice",
      taskTrace,
    });

    expect(taskTrace.scientific_method).toBeTruthy();
    expect(taskTrace.scientific_method?.hypothesis).toContain(taskTrace.goal);
    expect(taskTrace.scientific_method?.anti_hypothesis).toContain(taskTrace.goal);
    expect(taskTrace.scientific_method?.counterfactual_test.tested).toBe(true);
    expect(taskTrace.scientific_method?.counterfactual_test.result).toBe("supports_hypothesis");
    expect(taskTrace.scientific_method?.reproducibility.run_id).toBe(taskTrace.id);
    expect(taskTrace.scientific_method?.reproducibility.plan_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(taskTrace.scientific_method?.reproducibility.step_count).toBeGreaterThan(0);
    expect(taskTrace.scientific_method?.uncertainty_interval.confidence).toBeGreaterThan(0);
    expect(taskTrace.scientific_method?.corrective_action.required).toBe(false);
  });

  it("marks anti-hypothesis and corrective action when a scientific workflow step fails", async () => {
    const failSpec: ToolSpecShape = {
      name: "llm.local.fail",
      desc: "fails for testing",
      inputSchema: {} as any,
      outputSchema: {} as any,
      deterministic: true,
      rateLimit: { rpm: 10 },
    };
    registerTool({
      ...failSpec,
      handler: async () => {
        throw new Error("forced scientific failure");
      },
    });

    const { nodes } = buildChatBPlan({
      goal: "Run scientific method analysis for Alpha warp status",
      searchQuery: "Alpha warp bubble status",
      finalTool: failSpec.name,
    });
    const compiled = compilePlan(nodes);
    const taskTrace: TTaskTrace = {
      id: "trace-scientific-failure",
      persona_id: "alice",
      created_at: new Date().toISOString(),
      goal: "Run scientific method analysis for Alpha warp status",
      plan_json: nodes,
      steps: [],
      approvals: [],
    };

    const results = await executeCompiledPlan(compiled, {
      goal: taskTrace.goal,
      sessionId: taskTrace.id,
      personaId: "alice",
      taskTrace,
    });

    expect(results.some((step) => step.ok === false)).toBe(true);
    expect(taskTrace.ok).toBe(false);
    expect(taskTrace.scientific_method?.counterfactual_test.result).toBe("supports_anti_hypothesis");
    expect(taskTrace.scientific_method?.counterfactual_test.failed_step_id).toBeTruthy();
    expect(taskTrace.scientific_method?.corrective_action.required).toBe(true);
  });

  it("enforces citation gate in scientific mode when verification is enabled", async () => {
    process.env.ENABLE_KNOWLEDGE_CITATION_VERIFY = "1";
    await putMemoryRecord(baseRecord);
    const taskTrace: TTaskTrace = {
      id: "trace-scientific-citation-gate",
      persona_id: "alice",
      created_at: new Date().toISOString(),
      goal: "Use scientific method to summarize Alpha warp status",
      plan_json: [],
      steps: [],
      approvals: [],
    };
    const { nodes } = buildChatBPlan({
      goal: taskTrace.goal,
      searchQuery: "Alpha warp bubble status",
      finalTool: llmLocalSpec.name,
    });
    taskTrace.plan_json = nodes;
    const compiled = compilePlan(nodes);
    const results = await executeCompiledPlan(compiled, {
      goal: taskTrace.goal,
      sessionId: taskTrace.id,
      personaId: "alice",
      taskTrace,
      knowledgeContext: [
        {
          version: 1,
          project: { name: "alpha" },
          title: "Alpha Knowledge",
          summary: "alpha",
          files: [
            {
              name: "alpha.md",
              content: "Alpha warp bubble status file.",
            },
          ],
        } as any,
      ],
    });

    expect(taskTrace.scientific_method?.counterfactual_test.method.toLowerCase()).toContain("citation");
    expect(taskTrace.scientific_method?.counterfactual_test.result).toBe("supports_anti_hypothesis");
    expect(taskTrace.scientific_method?.corrective_action.required).toBe(true);
    expect(taskTrace.ok).toBe(false);
    expect(results.some((step) => step.id === "scientific.citation_gate" && step.ok === false)).toBe(true);
    delete process.env.ENABLE_KNOWLEDGE_CITATION_VERIFY;
  });



});

describe("TOE-007 ideology hard action gates", () => {
  it("emits explicit firstFail when covered action violates jurisdictional floor", () => {
    const result = scorePremeditation({
      candidates: [
        {
          id: "candidate-covered-jurisdiction-fail",
          valueLongevity: 0.8,
          risk: 0.1,
          entropy: 0.2,
          tags: ["covered-action", "legal-key", "ethos-key"],
        },
      ],
    });
    expect(result.chosenCandidateId).toBeUndefined();
    expect(result.rationaleTags).toContain(
      "ideology_gate.firstFail:IDEOLOGY_JURISDICTIONAL_FLOOR_VIOLATION",
    );
  });

  it("requires both legal and ethos key for covered actions", () => {
    const result = scorePremeditation({
      candidates: [
        {
          id: "candidate-covered-missing-ethos",
          valueLongevity: 0.9,
          risk: 0.1,
          entropy: 0.1,
          tags: ["covered-action", "legal-key", "jurisdiction-floor-ok"],
        },
      ],
    });
    expect(result.chosenCandidateId).toBeUndefined();
    expect(result.rationaleTags).toContain("ideology_gate.firstFail:IDEOLOGY_MISSING_ETHOS_KEY");
  });
});
