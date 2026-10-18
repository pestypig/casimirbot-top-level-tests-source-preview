import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const threadTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-ask-live-thread-"));
const threadLedgerPath = path.join(threadTempDir, "helix-thread-ledger.jsonl");
const threadIndexPath = path.join(threadTempDir, "helix-thread-index.json");

describe("Helix Ask live events", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_ASK_MICRO_PASS = "0";
    process.env.HELIX_ASK_MICRO_PASS_AUTO = "0";
    process.env.HELIX_ASK_TWO_PASS = "0";
    process.env.HELIX_THREAD_LEDGER_PATH = threadLedgerPath;
    process.env.HELIX_THREAD_INDEX_PATH = threadIndexPath;
    process.env.HELIX_THREAD_PERSIST = "1";
    vi.resetModules();
    const { planRouter } = await import("../server/routes/agi.plan");
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use("/api/agi", planRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  }, 60000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    const { __resetHelixThreadLedgerStore } = await import(
      "../server/services/helix-thread/ledger"
    );
    const { __resetHelixThreadRegistryStore } = await import(
      "../server/services/helix-thread/registry"
    );
    __resetHelixThreadLedgerStore();
    __resetHelixThreadRegistryStore();
    fs.rmSync(threadTempDir, { recursive: true, force: true });
    delete process.env.HELIX_THREAD_LEDGER_PATH;
    delete process.env.HELIX_THREAD_INDEX_PATH;
    delete process.env.HELIX_THREAD_PERSIST;
  });

  it("dual-writes /ask lifecycle events into the helix thread ledger", async () => {
    const sessionId = "test-ask-thread-dualwrite";
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does Helix Ask keep conversation replay deterministic?",
        debug: true,
        sessionId,
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      thread_id?: string;
      debug?: { answer_surface_mode?: string };
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
    };
    const { getHelixThreadLedgerEvents } = await import("../server/services/helix-thread/ledger");
    const events = getHelixThreadLedgerEvents({ sessionId });
    const eventTypes = events.map((entry) => entry.event_type);
    const completedEvent = [...events]
      .reverse()
      .find((entry) => entry.event_type === "ask_completed");

    expect(eventTypes).toContain("ask_started");
    expect(eventTypes).toContain("ask_completed");
    expect(String(payload.thread_id ?? "")).toMatch(/^thread:/);
    expect(completedEvent?.route).toBe("/ask");
    expect(completedEvent?.answer_surface_mode ?? null).toBe(
      payload.debug?.answer_surface_mode ?? null,
    );
    expect(completedEvent?.memory_citation?.entries?.length ?? 0).toBeGreaterThanOrEqual(
      payload.memory_citation?.entries?.length ?? 0,
    );
  }, 45000);

  it("emits ladder stages in live events for a repo definition prompt", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does the Helix Ask pipeline work in this system?",
        debug: true,
        sessionId: "test-session",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        live_events?: Array<{ stage: string }>;
        synthesis_mode?: string;
        synthesis_reason?: string;
      };
    };
    const stages = new Set(
      (payload.debug?.live_events ?? []).map((entry) => entry.stage),
    );
    const requiredStages = [
      "Intent resolved",
      "Topic tags",
      "Topic profile",
      "Plan",
      "Evidence gate",
      "Arbiter",
      "Synthesis prompt ready",
      "Platonic gates",
      "Coverage gate",
      "Belief gate",
      "Rattling gate",
      "Citations",
    ];
    const stageGroups: Array<{ label: string; alternatives: string[] }> = [
      { label: "Context ready", alternatives: ["Context ready", "Graph pack", "Preflight retrieval"] },
      { label: "Allowlist tier", alternatives: ["Allowlist tier", "Retrieval scope", "Topic profile"] },
    ];
    const missing = requiredStages.filter((stage) => !stages.has(stage));
    const missingGroups = stageGroups
      .filter((group) => !group.alternatives.some((alt) => stages.has(alt)))
      .map((group) => group.label);
    const allMissing = [...missing, ...missingGroups];
    if (allMissing.length) {
      console.log("Missing stages:", allMissing.join(", "));
    }
    expect(allMissing).toEqual([]);
    expect(payload.debug?.synthesis_mode).toBeDefined();
    expect(payload.debug?.synthesis_reason).toMatch(/mode=/);
  }, 45000);

  it("short-circuits greeting-only prompts before planner and gates", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Hello",
        debug: true,
        sessionId: "test-smalltalk-fast-path-short-circuit",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      debug?: {
        fallback_reason?: string;
        fallback_reason_taxonomy?: string;
        smalltalk_fast_path_applied?: boolean;
        live_events?: Array<{ stage?: string }>;
      };
    };
    const stages = new Set((payload.debug?.live_events ?? []).map((entry) => entry.stage));
    expect(payload.text.trim()).toBe("Hello! How can I assist you today?");
    expect(payload.text).not.toMatch(/^Sources:/im);
    expect(payload.debug?.smalltalk_fast_path_applied).toBe(true);
    expect(payload.debug?.fallback_reason).toBe("smalltalk_fast_path");
    expect(payload.debug?.fallback_reason_taxonomy).toBe("smalltalk_fast_path");
    expect(stages.has("Smalltalk fast path")).toBe(true);
    expect(stages.has("Plan")).toBe(false);
    expect(stages.has("Plan pass")).toBe(false);
    expect(stages.has("Coverage gate")).toBe(false);
    expect(stages.has("Belief gate")).toBe(false);
    expect(stages.has("Rattling gate")).toBe(false);
    expect(stages.has("Citations")).toBe(false);
  }, 45000);

  it("answers ideology concept query with grounded narrative + technical notes", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does Feedback Loop Hygiene affect society?",
        debug: true,
        sessionId: "test-ideology-concept",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
      debug?: {
        answer_path?: string[];
        answer_extension_appended?: boolean;
        tree_walk_mode?: string;
        graph_pack_skip_reason?: string;
        graph_framework?: { trees?: Array<{ tree: string; nodes: string[] }> };
      };
      answer_path?: string[];
      answer_extension_appended?: boolean;
    };
    const answerPath = payload.debug?.answer_path ?? payload.answer_path ?? [];
    const text = payload.text.trim();
    expect(text).toContain("In practice,");
    expect(text).not.toMatch(/^Sources:/im);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
    expect(answerPath).not.toContain("forcedAnswer:ideology");
    expect(answerPath).not.toContain("answer:forced");
    expect(answerPath).toContain("answer:llm");
    expect(answerPath.some((entry) => /forcedAnswer:|answer:forced|concept_fast_path|tree_walk:skip/i.test(entry))).toBe(false);
    expect(payload.debug?.answer_extension_appended ?? false).toBe(false);
    expect(payload.debug?.tree_walk_mode).toBe("root_to_leaf");
    expect(payload.debug?.graph_pack_skip_reason).toBeUndefined();
    expect((payload.debug?.graph_framework?.trees?.length ?? 0)).toBeGreaterThan(0);
    expect(text).not.toMatch(/^Confirmed:/i);
    expect(text).not.toMatch(/Next evidence:/i);
    expect(text).not.toMatch(/^additional repo context:/i);
    expect(text).not.toMatch(/client\/src\/components\/MissionEthosSourcePanel\.tsx/i);
    expect(text).toMatch(/docs\/knowledge\/ethos\/feedback-loop-hygiene\.md/i);
    expect(answerPath.some((entry) => entry.startsWith("concept_fast_path"))).toBe(false);
  }, 45000);

  it("keeps narrative ideology queries in full-root-to-leaf mode", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does Feedback Loop Hygiene affect society and public trust?",
        debug: true,
        sessionId: "test-ideology-narrative",
        verbosity: "extended",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
      debug?: {
        answer_path?: string[];
        tree_walk_mode?: string;
        graph_pack_skip_reason?: string;
      };
    };
    const answerPath = payload.debug?.answer_path ?? [];
    const text = payload.text.trim();
    expect(text).toContain("In practice,");
    expect(text).not.toMatch(/^Sources:/im);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
    expect(text).toMatch(/docs\/knowledge\/ethos\/feedback-loop-hygiene\.md|docs\/ethos\/ideology\.json/i);
    expect(payload.debug?.tree_walk_mode).toBe("root_to_leaf");
    expect(payload.debug?.graph_pack_skip_reason).toBeUndefined();
    expect(answerPath).toContain("answer:llm");
    expect(answerPath).not.toContain("answer:forced");
    expect(answerPath).not.toContain("forcedAnswer:ideology");
    expect(answerPath.some((entry) => /concept_fast_path|tree_walk:skip/.test(entry))).toBe(false);
  }, 45000);

  it("does not fan out simple ideology explain prompts into report mode", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "explain warp bubble mission ethos",
        debug: true,
        sessionId: "test-ideology-explain-no-report",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      debug?: {
        report_mode?: boolean;
        report_mode_reason?: string;
        report_blocks_count?: number;
      };
    };
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.debug?.report_mode_reason).toBe("ideology_chat_mode");
    expect(payload.debug?.report_blocks_count ?? 0).toBeLessThanOrEqual(1);
    expect(payload.text).toMatch(/mission ethos|warp vessel|radiance/i);
  }, 45000);

  it("routes dual-domain relation prompts through relation packet assembly", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does a warp bubble fit in with the mission ethos?",
        debug: true,
        sessionId: "test-relation-packet",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
      debug?: {
        intent_id?: string;
        intent_strategy?: string;
        relation_packet_built?: boolean;
        relation_packet_bridge_count?: number;
        relation_packet_evidence_count?: number;
        relation_dual_domain_ok?: boolean;
      };
    };
    expect(payload.debug?.intent_id).toBe("hybrid.warp_ethos_relation");
    expect(payload.debug?.intent_strategy).toBe("hybrid_explain");
    expect(payload.debug?.relation_packet_built).toBe(true);
    expect(payload.debug?.relation_dual_domain_ok).toBe(true);
    expect(payload.debug?.relation_packet_bridge_count ?? 0).toBeGreaterThanOrEqual(2);
    expect(payload.debug?.relation_packet_evidence_count ?? 0).toBeGreaterThan(1);
    expect(payload.text.length).toBeGreaterThanOrEqual(220);
    expect(payload.text).not.toMatch(/llm\.local stub result/i);
    expect(payload.text).not.toMatch(/\b(?:title|heading|slug)\s*:/i);
    expect(payload.text).toMatch(/warp bubble|warp/i);
    expect(payload.text).toMatch(/mission ethos|ethos/i);
    expect(payload.text).not.toMatch(/^Sources:/im);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
  }, 45000);

  it("keeps the mild-shift follow-up conversational while preserving sidecar artifacts", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question:
          "The text proves the regime is mild by looking at the norm of the shift vector. Why is this important to the solve it belongs to?",
        debug: true,
        sessionId: "test-shift-mild-conversational",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
      envelope?: {
        answer?: string;
        sections?: Array<{ title?: string; body?: string }>;
        extension?: { title?: string; body?: string } | null;
      } | null;
      debug?: {
        report_mode?: boolean;
        answer_surface_mode?: string;
        tree_walk_block_present?: boolean;
      };
    };
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.debug?.answer_surface_mode).toBe("conversational");
    expect(payload.text.length).toBeGreaterThanOrEqual(120);
    expect(payload.text).not.toMatch(/Assembly blocked:/i);
    expect(payload.text).not.toMatch(/Open gaps \/ UNKNOWNs:/i);
    expect(payload.text).not.toMatch(/\bTree Walk:/i);
    expect(payload.text).not.toMatch(/\bAdditional Repo Context\b/i);
    expect(payload.text).not.toMatch(/\bProof:/i);
    expect(payload.text).not.toMatch(/^Summary:/im);
    expect(payload.text).not.toMatch(/^Evidence:/im);
    expect(payload.text).not.toMatch(/^Definition:/im);
    expect(payload.text).not.toMatch(/^Mechanism Explanation:/im);
    expect(payload.text).not.toMatch(/grounded in/i);
    expect(payload.text).not.toMatch(/anchored in/i);
    expect(payload.text).not.toMatch(/Primary implementation anchors/i);
    expect(payload.text).not.toMatch(/Current evidence is incomplete/i);
    expect(payload.text).not.toMatch(/Remaining gap: missing/i);
    expect(payload.text).toMatch(/That matters because|keeps the shift contribution small enough|reduced-order branch/i);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
    const sectionTitles = (payload.envelope?.sections ?? []).map((section) => section.title ?? "");
    if (payload.debug?.tree_walk_block_present) {
      expect(sectionTitles).toContain("Tree Walk");
    }
    if (payload.envelope?.extension) {
      expect(payload.envelope.extension.title).toBe("Additional Repo Context");
    }
  }, 45000);

  it("keeps roadmap planning prompts conversational by default", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question:
          "Ok please organize my ideas to how they could be implemented in my code base in the future. I want profiles, a paywall, a voice lane, translation, and better retrieval planning.",
        debug: true,
        sessionId: "test-roadmap-conversational-surface",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      debug?: {
        report_mode?: boolean;
        answer_surface_mode?: string;
      };
    };
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.debug?.answer_surface_mode).toBe("conversational");
    expect(payload.text).not.toMatch(/^Repo-Grounded Findings:/im);
    expect(payload.text).not.toMatch(/^Implementation Roadmap:/im);
    expect(payload.text).not.toMatch(/^Evidence Gaps:/im);
    expect(payload.text).not.toMatch(/^Next Anchors Needed:/im);
    expect(payload.text).not.toMatch(/grounded in|anchored in/i);
    expect(payload.text).not.toMatch(/Remaining gap: missing/i);
    expect(payload.text).not.toMatch(/^Sources:/im);
  }, 45000);

  it("keeps frontier continuity follow-ups conversational by default", async () => {
    const sessionId = "test-frontier-conversational-followup";
    const firstResponse = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Is the sun conscious under Orch-OR style reasoning?",
        debug: true,
        sessionId,
      }),
    });
    expect(firstResponse.status).toBe(200);

    const followUpResponse = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What in the reasoning ladder should we focus on since this is the case?",
        debug: true,
        sessionId,
      }),
    });
    expect(followUpResponse.status).toBe(200);
    const payload = (await followUpResponse.json()) as {
      text: string;
      debug?: {
        report_mode?: boolean;
        answer_surface_mode?: string;
      };
    };
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.debug?.answer_surface_mode).toBe("conversational");
    expect(payload.text).not.toMatch(/^Definitions:/im);
    expect(payload.text).not.toMatch(/^Baseline:/im);
    expect(payload.text).not.toMatch(/^Hypothesis:/im);
    expect(payload.text).not.toMatch(/^Anti-hypothesis:/im);
    expect(payload.text).not.toMatch(/^Claim tier:/im);
    expect(payload.text).not.toMatch(/grounded in|anchored in/i);
    expect(payload.text).not.toMatch(/Remaining gap: missing/i);
    expect(payload.text).not.toMatch(/^Sources:/im);
  }, 45000);

  it("keeps long relation prompts out of report mode unless explicitly requested", async () => {
    const question = [
      "Explain how warp bubble viability relates to mission ethos stewardship and governance.",
      "Also map falsifiability hooks to policy checkpoints and safety constraints.",
      "Keep this as one direct relation answer with sources, not a multi-block report.",
    ].join(" ");
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        debug: true,
        sessionId: "test-relation-long-no-report",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        report_mode?: boolean;
        report_mode_reason?: string;
        intent_id?: string;
      };
      text?: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
    };
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.debug?.report_mode_reason).not.toBe("long_prompt");
    expect(payload.debug?.intent_id).toBe("hybrid.warp_ethos_relation");
    expect(payload.text ?? "").toMatch(/Sources:/i);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
  }, 45000);

  it("does not auto-fanout relation prompts into report mode", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Now the warp bubble relation to ideology mission ethos?",
        debug: true,
        sessionId: "test-relation-no-report-fanout",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
      debug?: {
        report_mode?: boolean;
        report_mode_reason?: string;
        intent_id?: string;
        relation_packet_built?: boolean;
      };
    };
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.debug?.report_mode_reason).not.toBe("multi_slot");
    expect(payload.debug?.report_mode_reason).not.toBe("slot_plan");
    expect(payload.debug?.intent_id).toBe("hybrid.warp_ethos_relation");
    expect(payload.debug?.relation_packet_built).toBe(true);
    expect(payload.text).not.toMatch(/Executive summary:/i);
    expect(payload.text).not.toMatch(/^Sources:/im);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
  }, 45000);

  it("keeps structured output available for explicit report prompts", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question:
          "Generate a report for Helix Ask explaining how it keeps Tree Walk, Proof, and Additional Repo Context out of the default visible answer.",
        debug: true,
        sessionId: "test-explicit-report-mode",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text?: string;
      debug?: {
        report_mode?: boolean;
        report_mode_reason?: string;
      };
    };
    expect(payload.debug?.report_mode).toBe(true);
    expect(payload.debug?.report_mode_reason).toBe("explicit_report_request");
    expect(payload.text ?? "").toMatch(
      /Direct Answer:|Mechanism Explanation:|Inputs\/Outputs:|Constraints:|Common failure modes:|Sources:/i,
    );
  }, 45000);


  it("keeps repo technical prompts out of auto report-mode fanout", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Show pipeline stages captured in debug live events for Helix Ask.",
        debug: true,
        sessionId: "test-repo-tech-no-report-fanout",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text?: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
      debug?: {
        report_mode?: boolean;
        report_mode_reason?: string;
        intent_id?: string;
      };
    };
    expect(payload.debug?.intent_id).toBe("hybrid.concept_plus_system_mapping");
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.debug?.report_mode_reason).not.toBe("multi_slot");
    expect(payload.debug?.report_mode_reason).not.toBe("slot_plan");
    expect(payload.text ?? "").not.toMatch(/Executive summary:/i);
    expect(payload.text ?? "").not.toMatch(/^Sources:/im);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
  }, 45000);
  it("routes implicit warp-in-ideology phrasing to relation intent", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is a warp bubble in ideology?",
        debug: true,
        sessionId: "test-warp-ideology-implicit-relation",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      memory_citation?: { entries?: Array<{ path?: string }>; rollout_ids?: string[] } | null;
      debug?: {
        intent_id?: string;
        report_mode?: boolean;
      };
    };
    expect(payload.debug?.intent_id).toBe("hybrid.warp_ethos_relation");
    expect(payload.debug?.intent_id).not.toBe("repo.warp_definition_docs_first");
    expect(payload.debug?.report_mode).toBe(false);
    expect(payload.text).not.toMatch(/^Sources:/im);
    expect(payload.memory_citation?.entries?.length ?? 0).toBeGreaterThan(0);
  }, 45000);

});


describe("mission voice mode controls", () => {
  it("gates mission voice callouts using explicit UX controls", async () => {
    const { shouldSpeakMissionEvent } = await import("../client/src/lib/mission-overwatch");

    expect(
      shouldSpeakMissionEvent({
        controls: { voiceEnabled: false, criticalOnly: false, muteWhileTyping: false },
        classification: "critical",
        isUserTyping: false,
      }),
    ).toBe(false);

    expect(
      shouldSpeakMissionEvent({
        controls: { voiceEnabled: true, criticalOnly: true, muteWhileTyping: false },
        classification: "warn",
        isUserTyping: false,
      }),
    ).toBe(false);

    expect(
      shouldSpeakMissionEvent({
        controls: { voiceEnabled: true, criticalOnly: true, muteWhileTyping: false },
        classification: "critical",
        isUserTyping: false,
      }),
    ).toBe(true);

    expect(
      shouldSpeakMissionEvent({
        controls: { voiceEnabled: true, criticalOnly: false, muteWhileTyping: true },
        classification: "action",
        isUserTyping: true,
      }),
    ).toBe(false);
  });

  it("keeps voice mode controls independent from text ask semantics", async () => {
    const { shouldSpeakMissionEvent } = await import("../client/src/lib/mission-overwatch");
    const forTextPipeline = {
      source: "ask_text",
      question: "Explain mission status",
      expectedAnswerMode: "text-only",
    };

    expect(forTextPipeline.expectedAnswerMode).toBe("text-only");
    expect(
      shouldSpeakMissionEvent({
        controls: { voiceEnabled: true, criticalOnly: false, muteWhileTyping: false },
        classification: "info",
        isUserTyping: false,
      }),
    ).toBe(true);
  });
});
