import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "ENABLE_AGI",
  "HELIX_ASK_MICRO_PASS",
  "HELIX_ASK_MICRO_PASS_AUTO",
  "HELIX_ASK_TWO_PASS",
  "HELIX_ASK_ALLOW_FORCE_LLM_PROBE",
  "LLM_RUNTIME",
  "LLM_HTTP_BASE",
  "OPENAI_API_KEY",
  "HULL_MODE",
] as const;

describe("Helix Ask llm debug skip metadata", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";
  const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
    }
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_ASK_MICRO_PASS = "0";
    process.env.HELIX_ASK_MICRO_PASS_AUTO = "0";
    process.env.HELIX_ASK_TWO_PASS = "0";
    process.env.HELIX_ASK_ALLOW_FORCE_LLM_PROBE = "1";
    process.env.LLM_RUNTIME = "http";
    process.env.LLM_HTTP_BASE = "http://127.0.0.1:9";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.HULL_MODE = "0";

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
    for (const key of ENV_KEYS) {
      const value = previousEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("exposes skip reason when a forced answer path avoids LLM invocation", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is 2 + 2?",
        debug: true,
        sessionId: "llm-skip-proof",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text?: string;
      debug?: {
        llm_route_expected_backend?: string;
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        intent_domain?: string;
        requires_repo_evidence?: boolean;
        llm_backend_used?: string;
        llm_provider_called?: boolean;
        llm_short_circuit_rule?: string;
        llm_short_circuit_reason?: string;
        llm_short_circuit_bypassed?: boolean;
        llm_force_probe_requested?: boolean;
        llm_force_probe_enabled?: boolean;
        llm_calls?: Array<unknown>;
        answer_path?: string[];
      };
    };
    expect(payload.debug?.llm_route_expected_backend).toBe("http");
    expect(payload.debug?.llm_invoke_attempted).toBe(false);
    expect(payload.debug?.llm_skip_reason).toBe("short_circuit_forced_answer");
    expect(payload.debug?.llm_skip_reason_detail).toBe("forcedAnswer:math_solver");
    expect(payload.debug?.llm_short_circuit_rule).toBe("fallback_answer_short_circuit_v1");
    expect(typeof payload.debug?.llm_short_circuit_reason).toBe("string");
    expect((payload.debug?.llm_short_circuit_reason ?? "").length).toBeGreaterThan(0);
    expect(payload.debug?.llm_short_circuit_bypassed).toBe(false);
    expect(payload.debug?.llm_force_probe_requested).toBe(false);
    expect(payload.debug?.llm_force_probe_enabled).toBe(false);
    expect((payload.debug?.llm_calls ?? []).length).toBe(0);
    expect(payload.text ?? "").toMatch(/\b4\b/);
    expect(payload.text ?? "").not.toMatch(/Evidence is limited in current retrieval/i);
    expect((payload.debug?.answer_path ?? []).includes("answer:forced")).toBe(true);
    expect((payload.debug?.answer_path ?? []).includes("fallback:RenderPlatonicFallback")).toBe(false);
  }, 45000);

  it("keeps conversational ideology prompts on invoke path without forced short-circuit", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does Feedback Loop Hygiene affect society?",
        debug: true,
        verbosity: "brief",
        sessionId: "llm-ideology-open-world",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        intent_domain?: string;
        requires_repo_evidence?: boolean;
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        llm_backend_used?: string;
        llm_provider_called?: boolean;
        llm_calls?: Array<unknown>;
      };
    };
    expect(payload.debug?.llm_invoke_attempted).toBe(true);
    expect(payload.debug?.llm_skip_reason).toBeUndefined();
    expect(payload.debug?.llm_skip_reason_detail).toBeUndefined();
    expect(payload.debug?.llm_backend_used).toBe("http");
    expect(payload.debug?.llm_provider_called).toBe(true);
    expect((payload.debug?.llm_calls ?? []).length).toBeGreaterThan(0);
  }, 45000);

  it("keeps repo-api lookup prompts on invoke path when force-answer is unlabeled", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does llm.local.generate route to HTTP in this codebase?",
        debug: true,
        verbosity: "brief",
        sessionId: "llm-repo-api-open-world",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        intent_id?: string;
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        llm_backend_used?: string;
        llm_provider_called?: boolean;
        llm_calls?: Array<unknown>;
      };
    };
    expect(payload.debug?.llm_invoke_attempted).toBe(true);
    expect(payload.debug?.llm_skip_reason).toBeUndefined();
    expect(payload.debug?.llm_skip_reason_detail).toBeUndefined();
    expect(payload.debug?.llm_backend_used).toBe("http");
    expect(payload.debug?.llm_provider_called).toBe(true);
    expect((payload.debug?.llm_calls ?? []).length).toBeGreaterThan(0);
    expect(
      ["repo.repo_api_lookup", "hybrid.concept_plus_system_mapping"].includes(
        String(payload.debug?.intent_id ?? ""),
      ),
    ).toBe(true);
  }, 45000);

  it("does not short-circuit conceptual equation prompts into math solver output", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "what's the equation of the collapse of the wave function?",
        debug: true,
        sessionId: "llm-equation-concept-open-world",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text?: string;
      debug?: {
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        answer_path?: string[];
      };
    };
    expect(payload.debug?.llm_invoke_attempted).toBe(true);
    expect(payload.debug?.llm_skip_reason_detail).not.toBe("forcedAnswer:math_solver");
    expect((payload.debug?.answer_path ?? []).includes("forcedAnswer:math_solver")).toBe(false);
    expect((payload.debug?.answer_path ?? []).includes("clarify:ambiguity")).toBe(false);
    expect(payload.text ?? "").not.toMatch(/The value of equation of the collapse of the wave function is/i);
  }, 45000);

  it("keeps conceptual repo-term prompts on invoke path without primary contract short-circuit", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is the natario solve?",
        debug: true,
        verbosity: "brief",
        sessionId: "llm-natario-open-world",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        llm_backend_used?: string;
        llm_provider_called?: boolean;
        llm_calls?: Array<unknown>;
      };
    };
    expect(payload.debug?.llm_invoke_attempted).toBe(true);
    expect(payload.debug?.llm_skip_reason).toBeUndefined();
    expect(payload.debug?.llm_skip_reason_detail).toBeUndefined();
    expect(payload.debug?.llm_backend_used).toBe("http");
    expect(payload.debug?.llm_provider_called).toBe(true);
    expect((payload.debug?.llm_calls ?? []).length).toBeGreaterThan(0);
  }, 45000);

  it("keeps open-world explainers out of repo auto-promotion without explicit repo hints", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does the universe produce life?",
        debug: true,
        verbosity: "brief",
        sessionId: "llm-open-world-no-auto-repo",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        intent_domain?: string;
        is_repo_question?: boolean;
        preflight_retrieval_upgrade?: boolean;
        ambiguity_gate_applied?: boolean;
        ambiguity_resolver_bypassed?: string;
      };
    };
    expect(payload.debug?.preflight_retrieval_upgrade).not.toBe(true);
    expect(payload.debug?.is_repo_question).not.toBe(true);
    expect(payload.debug?.intent_domain).not.toBe("repo");
    expect(payload.debug?.intent_domain).not.toBe("hybrid");
    expect(payload.debug?.ambiguity_gate_applied).not.toBe(true);
    if (payload.debug?.ambiguity_resolver_bypassed) {
      expect(payload.debug?.ambiguity_resolver_bypassed).toBe("open_world_explainer_mode");
    }
  }, 45000);

  it("keeps security self-protection prompts out of forced repo retrieval without explicit repo hints", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How can I protect myself from AI-driven financial fraud?",
        debug: true,
        verbosity: "brief",
        sessionId: "llm-security-open-world-no-auto-repo",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        intent_domain?: string;
        is_repo_question?: boolean;
        preflight_retrieval_upgrade?: boolean;
        security_guardrail_retrieval_required?: boolean;
        ambiguity_gate_applied?: boolean;
        ambiguity_resolver_bypassed?: string;
      };
    };
    expect(payload.debug?.security_guardrail_retrieval_required).not.toBe(true);
    expect(payload.debug?.preflight_retrieval_upgrade).not.toBe(true);
    expect(payload.debug?.is_repo_question).not.toBe(true);
    expect(payload.debug?.intent_domain).not.toBe("repo");
    expect(payload.debug?.intent_domain).not.toBe("hybrid");
    expect(payload.debug?.ambiguity_gate_applied).not.toBe(true);
    if (payload.debug?.ambiguity_resolver_bypassed) {
      expect(payload.debug?.ambiguity_resolver_bypassed).toBe("security_open_world_query");
    }
  }, 45000);

  it("treats endpoint plus tool-id prompts as explicit repo lookup (not ideology open-world)", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Summarize how /api/agi/ask routes through llm.local.generate.",
        debug: true,
        verbosity: "brief",
        sessionId: "llm-endpoint-tool-repo-proof",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        intent_id?: string;
        intent_reason?: string;
        concept_source?: string;
        concept_fast_path_blocked_reason?: string;
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        llm_backend_used?: string;
        llm_provider_called?: boolean;
        llm_calls?: Array<unknown>;
      };
    };
    expect(
      ["repo.repo_api_lookup", "hybrid.concept_plus_system_mapping"].includes(
        String(payload.debug?.intent_id ?? ""),
      ),
    ).toBe(true);
    expect(payload.debug?.intent_reason ?? "").not.toContain("ideology_open_world");
    expect(payload.debug?.concept_source ?? "").not.toMatch(/docs\/(?:ethos|knowledge\/ethos)\//i);
    expect(payload.debug?.llm_invoke_attempted).toBe(true);
    expect(payload.debug?.llm_skip_reason).toBeUndefined();
    expect(payload.debug?.llm_skip_reason_detail).toBeUndefined();
    expect(payload.debug?.llm_backend_used).toBe("http");
    expect(payload.debug?.llm_provider_called).toBe(true);
    expect((payload.debug?.llm_calls ?? []).length).toBeGreaterThan(0);
  }, 45000);

  it("blocks concept preintent short-circuit for explicit repo-evidence prompts", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question:
          "In this repo, how does Feedback Loop Hygiene map to server/routes/agi.plan.ts? Cite file paths.",
        debug: true,
        verbosity: "brief",
        sessionId: "llm-repo-explicit-no-concept-short-circuit",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        llm_backend_used?: string;
        llm_provider_called?: boolean;
        llm_calls?: Array<unknown>;
      };
    };
    expect(payload.debug?.llm_invoke_attempted).toBe(true);
    expect(payload.debug?.llm_skip_reason).toBeUndefined();
    expect(payload.debug?.llm_skip_reason_detail).toBeUndefined();
    expect(payload.debug?.llm_backend_used).toBe("http");
    expect(payload.debug?.llm_provider_called).toBe(true);
    expect((payload.debug?.llm_calls ?? []).length).toBeGreaterThan(0);
  }, 45000);

  it("allows debug forceLlmProbe to bypass short-circuit and record an LLM attempt", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is 2 + 2?",
        debug: true,
        forceLlmProbe: true,
        sessionId: "llm-probe-proof",
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      debug?: {
        llm_invoke_attempted?: boolean;
        llm_skip_reason?: string;
        llm_skip_reason_detail?: string;
        llm_short_circuit_bypassed?: boolean;
        llm_force_probe_requested?: boolean;
        llm_force_probe_enabled?: boolean;
        llm_calls?: Array<unknown>;
      };
    };
    expect(payload.debug?.llm_force_probe_requested).toBe(true);
    expect(payload.debug?.llm_force_probe_enabled).toBe(true);
    expect(payload.debug?.llm_short_circuit_bypassed).toBe(true);
    expect(payload.debug?.llm_invoke_attempted).toBe(true);
    expect(payload.debug?.llm_skip_reason).toBeUndefined();
    expect(payload.debug?.llm_skip_reason_detail).toBeUndefined();
    expect((payload.debug?.llm_calls ?? []).length).toBeGreaterThan(0);
  }, 45000);
});

