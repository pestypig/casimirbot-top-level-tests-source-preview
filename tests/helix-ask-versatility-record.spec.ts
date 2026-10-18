import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  __testOnlyEvaluateFailures,
  buildRunDiagnostics,
  buildProbabilityScorecard,
  createArtifactBundlePaths,
  toDiagnosticRollup,
} from "../scripts/helix-ask-versatility-record";

describe("helix ask versatility diagnostics", () => {
  it("emits per-run report and relation diagnostics", () => {
    expect(
      buildRunDiagnostics({
        family: "relation",
        expected_report_mode: false,
        debug: { report_mode: false, relation_packet_built: true, relation_dual_domain_ok: false },
      }),
    ).toEqual({
      report_mode_correct: true,
      relation_packet_built: true,
      relation_dual_domain_ok: false,
    });

    expect(
      buildRunDiagnostics({
        family: "repo_technical",
        expected_report_mode: false,
        debug: { report_mode: true },
      }),
    ).toEqual({
      report_mode_correct: false,
      relation_packet_built: null,
      relation_dual_domain_ok: null,
    });
  });


  it("emits known failure signatures for report/relation floor regressions", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "relation",
        prompt: "How does warp connect to mission ethos?",
        expected_report_mode: false,
      } as any,
      {
        status: 200,
        latency_ms: 42,
        payload: {
          text: "Executive summary: stub",
          report_mode: true,
          debug: {
            report_mode: true,
            relation_packet_built: false,
            relation_dual_domain_ok: false,
            relation_packet_bridge_count: 0,
            relation_packet_evidence_count: 0,
          },
        },
      } as any,
    );

    expect(failures.some((entry) => entry.startsWith("report_mode_mismatch"))).toBe(true);
    expect(failures.some((entry) => entry.startsWith("relation_packet_built"))).toBe(true);
    expect(failures.some((entry) => entry.startsWith("relation_dual_domain"))).toBe(true);
    expect(failures.some((entry) => entry.startsWith("bridge_count_low"))).toBe(true);
    expect(failures.some((entry) => entry.startsWith("evidence_count_low"))).toBe(true);
  });



  it("classifies runtime fallback and intentStrategy TDZ answers as failures", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Where is ask route logic?",
        expected_report_mode: false,
      } as any,
      {
        status: 200,
        latency_ms: 30,
        payload: {
          text: "Runtime fallback: Cannot access 'intentStrategy' before initialization\n\nSources: server/routes/agi.plan.ts",
          report_mode: false,
          debug: { report_mode: false },
        },
      } as any,
    );

    expect(failures).toContain("runtime_fallback_answer");
    expect(failures).toContain("runtime_tdz_intentStrategy");
  });

  it("classifies runtime fallback and intentProfile TDZ answers as failures", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Where is ask route logic?",
        expected_report_mode: false,
      } as any,
      {
        status: 200,
        latency_ms: 31,
        payload: {
          text: "Runtime fallback: Cannot access 'intentProfile' before initialization\n\nSources: server/routes/agi.plan.ts",
          report_mode: false,
          debug: { report_mode: false },
        },
      } as any,
    );

    expect(failures).toContain("runtime_fallback_answer");
    expect(failures).toContain("runtime_tdz_intentProfile");
  });

  it("treats runtime fallback excerpts as failures", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Where is ask route logic?",
        expected_report_mode: false,
      } as any,
      {
        status: 200,
        latency_ms: 29,
        payload: {
          text: "Observed runtime fallback excerpt in logs.\n\nSources: server/routes/agi.plan.ts",
          report_mode: false,
          debug: { report_mode: false },
        },
      } as any,
    );

    expect(failures).toContain("runtime_fallback_answer");
  });

  it("flags debug/scaffold leakage and code fragment spill signatures", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "relation",
        prompt: "Explain relation simply.",
        expected_report_mode: false,
      } as any,
      {
        status: 200,
        latency_ms: 31,
        payload: {
          text: "Tree Walk: Needle Hull\nwhat_is_mission_ethos: Mission ethos...\nexport default function ElectronOrbitalPanel() {}\nSources: docs/knowledge/warp/natario-zero-expansion.md",
          report_mode: false,
          debug: {
            report_mode: false,
            relation_packet_built: true,
            relation_dual_domain_ok: true,
            relation_packet_bridge_count: 2,
            relation_packet_evidence_count: 2,
          },
        },
      } as any,
    );

    expect(failures).toContain("debug_scaffold_leak");
    expect(failures).toContain("code_fragment_spill");
  });

  it("flags missing reasoning-debug contract and repo/hybrid final-answer contract sections", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Where is ask route logic?",
        expected_report_mode: false,
        expected_intent_domain: "repo",
      } as any,
      {
        status: 200,
        latency_ms: 33,
        payload: {
          text: [
            "Where in repo:",
            "- server/routes/agi.plan.ts",
            "",
            "Sources: server/routes/agi.plan.ts",
          ].join("\n"),
          report_mode: false,
          debug: {
            report_mode: false,
            intent_id: "repo.helix_ask_pipeline_explain",
            intent_domain: "repo",
          },
        },
      } as any,
    );

    expect(failures).toContain("reasoning_debug_incomplete:deterministic_stop_reason");
    expect(
      failures.some(
        (entry) =>
          entry.startsWith("reasoning_debug_incomplete:") &&
          entry.includes("intent_strategy") &&
          entry.includes("answer_path"),
      ),
    ).toBe(true);
    expect(failures).toContain("final_answer_contract_incomplete:direct_answer,confidence_uncertainty");
  });

  it("flags uncertainty research contract regressions for repo/hybrid outputs", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Is this experimental warp math claim ready?",
        expected_report_mode: false,
        expected_intent_domain: "repo",
      } as any,
      {
        status: 200,
        latency_ms: 44,
        payload: {
          text: [
            "Direct Answer:",
            "- The claim is not promotion-ready yet.",
            "",
            "Where in repo:",
            "- server/routes/agi.plan.ts",
            "",
            "Confidence/Uncertainty:",
            "- Uncertainty remains high for experimental math surfaces pending stronger evidence.",
            "",
            "Sources: server/routes/agi.plan.ts",
          ].join("\n"),
          report_mode: false,
          debug: {
            report_mode: false,
            intent_id: "repo.helix_ask_pipeline_explain",
            intent_domain: "repo",
            intent_strategy: "repo_grounded",
            answer_path: ["route:intent", "answer:final"],
            agent_stop_reason: "completed",
            uncertainty_research_contract_required: true,
            uncertainty_research_contract_pass: false,
            uncertainty_research_contract_missing_reasons: [
              "uncertainty_research_contract_missing:foundational_reference",
              "uncertainty_research_contract_missing:verification_reference",
            ],
            experimental_math_risk: true,
          },
        },
      } as any,
    );

    expect(
      failures.some((entry) =>
        entry.startsWith("uncertainty_research_contract_missing:"),
      ),
    ).toBe(true);
    expect(failures).toContain("experimental_math_without_research_pair");
  });

  it("flags reportable-tier uncertainty estimator gaps and tool-use-budget policy failures", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Can we certify this uncertain claim?",
        expected_report_mode: false,
        expected_intent_domain: "repo",
      } as any,
      {
        status: 200,
        latency_ms: 41,
        payload: {
          text: [
            "Direct Answer:",
            "- Not promotion ready yet due to ADAPTER_CONSTRAINT_POLICY on tool-use-budget.",
            "",
            "Where in repo:",
            "- server/routes/agi.plan.ts",
            "",
            "Confidence/Uncertainty:",
            "- Reportable tier claim remains blocked pending uncertainty-estimation evidence.",
            "",
            "Sources: server/routes/agi.plan.ts",
          ].join("\n"),
          report_mode: false,
          debug: {
            report_mode: false,
            intent_id: "repo.helix_ask_pipeline_explain",
            intent_domain: "repo",
            intent_strategy: "repo_grounded",
            answer_path: ["route:intent", "answer:final"],
            agent_stop_reason: "completed",
            uncertainty_research_contract_required: true,
            uncertainty_research_contract_pass: false,
            uncertainty_research_contract_claim_tier: "reportable",
            uncertainty_research_contract_tier_coverage_pass: false,
            uncertainty_research_contract_required_uncertainty_estimation: true,
            uncertainty_research_contract_uncertainty_estimation_count: 0,
            uncertainty_research_contract_missing_reasons: [
              "uncertainty_research_contract_missing:uncertainty_estimation_reference",
              "uncertainty_research_contract_missing:tier_coverage",
            ],
            final_mode_gate_consistency_reasons: ["ADAPTER_CONSTRAINT_POLICY:tool-use-budget"],
            experimental_math_risk: true,
          },
        },
      } as any,
    );

    expect(failures).toContain("uncertainty_research_tier_coverage_missing");
    expect(failures).toContain("uncertainty_estimation_reference_missing");
    expect(failures).toContain("adapter_constraint_policy_fail");
    expect(failures).toContain("tool_use_budget_pack_fail");
  });

  it("flags semantic repo-technical contract and claim-evidence binding regressions", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Where is the ask orchestration shell and what do we run next?",
        expected_report_mode: false,
        expected_intent_domain: "repo",
      } as any,
      {
        status: 200,
        latency_ms: 38,
        payload: {
          text: [
            "Direct Answer:",
            "- Orchestration behavior appears present but answer is not fully grounded.",
            "",
            "Where in repo:",
            "- server/routes/agi.plan.ts",
            "",
            "Confidence/Uncertainty:",
            "- Uncertainty remains broad pending stronger evidence binding.",
            "",
            "Sources: server/routes/agi.plan.ts",
          ].join("\n"),
          report_mode: false,
          debug: {
            report_mode: false,
            intent_id: "repo.helix_ask_pipeline_explain",
            intent_domain: "repo",
            intent_strategy: "repo_grounded",
            answer_path: ["route:intent", "answer:final"],
            agent_stop_reason: "completed",
            semantic_repo_tech_contract_required: true,
            semantic_repo_tech_contract_pass: false,
            semantic_repo_tech_missing_reasons: [
              "semantic_repo_tech_missing:operator_use_step",
            ],
            claim_evidence_binding_pass: false,
            claim_evidence_binding_missing: [
              "claim_evidence_binding_missing:codex_clone_reference",
              "claim_evidence_binding_missing:web_research_reference",
            ],
          },
        },
      } as any,
    );

    expect(
      failures.some((entry) => entry.startsWith("semantic_repo_tech_incomplete:")),
    ).toBe(true);
    expect(
      failures.some((entry) => entry.startsWith("claim_evidence_binding_missing:")),
    ).toBe(true);
  });

  it("keeps objective-loop debug checks backward compatible when objective loop is absent", () => {
    const failures = __testOnlyEvaluateFailures(
      {
        family: "repo_technical",
        prompt: "Explain route behavior.",
        expected_report_mode: false,
        expected_intent_domain: "repo",
      } as any,
      {
        status: 200,
        latency_ms: 36,
        payload: {
          text: [
            "Direct answer: Routing uses intent + evidence guards before finalization.",
            "",
            "Where in repo:",
            "- server/routes/agi.plan.ts",
            "",
            "Confidence/uncertainty: High confidence from current route debug flow; verify around edge-case fallback branches.",
            "",
            "Sources: server/routes/agi.plan.ts",
          ].join("\n"),
          report_mode: false,
          debug: {
            report_mode: false,
            intent_id: "repo.helix_ask_pipeline_explain",
            intent_domain: "repo",
            intent_strategy: "repo_grounded",
            answer_path: ["route:intent", "answer:final"],
            agent_stop_reason: "completed",
          },
        },
      } as any,
    );

    expect(failures.some((entry) => entry.startsWith("reasoning_debug_incomplete"))).toBe(false);
    expect(failures.some((entry) => entry.startsWith("objective_"))).toBe(false);
  });

  it("builds probability scorecard with Wilson confidence intervals", () => {
    const scorecard = buildProbabilityScorecard([
      {
        family: "relation",
        expected_intent_id: "hybrid.warp_ethos_relation",
        debug: {
          intent_id: "hybrid.warp_ethos_relation",
          relation_packet_built: true,
          relation_dual_domain_ok: true,
          relation_packet_bridge_count: 2,
          relation_packet_evidence_count: 2,
        },
        failures: [],
      },
      {
        family: "repo_technical",
        expected_intent_id: "repo.helix_ask_pipeline_explain",
        debug: {
          intent_id: "repo.helix_ask_pipeline_explain",
        },
        failures: [
          "reasoning_debug_incomplete:intent_strategy,answer_path",
          "final_answer_contract_incomplete:direct_answer",
        ],
      },
      {
        family: "ambiguous_general",
        expected_intent_id: "general.conceptual_define_compare",
        debug: {
          intent_id: "wrong.intent",
        },
        failures: ["runtime_fallback_answer", "debug_scaffold_leak"],
      },
    ] as Array<any>);

    expect(scorecard.method).toBe("wilson_95");
    expect(scorecard.metrics.route_correct_by_family.relation.p).toBe(1);
    expect(scorecard.metrics.route_correct_by_family.repo_technical.p).toBe(1);
    expect(scorecard.metrics.route_correct_by_family.ambiguous_general.p).toBe(0);
    expect(scorecard.metrics.no_runtime_fallback.p).toBeCloseTo(2 / 3, 5);
    expect(scorecard.metrics.no_debug_leak.p).toBeCloseTo(2 / 3, 5);
    expect(scorecard.metrics.reasoning_debug_complete.p).toBeCloseTo(2 / 3, 5);
    expect(scorecard.metrics.final_answer_contract_pass.p).toBeCloseTo(1 / 2, 5);
    expect(scorecard.metrics.final_answer_contract_pass.total).toBe(2);
    expect(scorecard.metrics.uncertainty_research_contract_pass.total).toBe(0);
    expect(scorecard.metrics.semantic_repo_tech_contract_pass.total).toBe(0);
    expect(scorecard.metrics.claim_evidence_binding_pass.total).toBe(0);
    expect(scorecard.metrics.research_tier_coverage_pass.total).toBe(0);
    expect(scorecard.metrics.uncertainty_estimator_present.total).toBe(0);
    expect(scorecard.metrics.experimental_math_guard_pass.total).toBe(0);
    expect(scorecard.metrics.tool_use_budget_pack_pass.p).toBe(1);
    expect(scorecard.metrics.frontier_scaffold_complete.total).toBe(3);
  });

  it("rolls up pass/fail/unknown counts for required diagnostics", () => {
    const rollup = toDiagnosticRollup([
      {
        diagnostics: { report_mode_correct: true, relation_packet_built: true, relation_dual_domain_ok: true },
      },
      {
        diagnostics: { report_mode_correct: false, relation_packet_built: false, relation_dual_domain_ok: false },
      },
      {
        diagnostics: { report_mode_correct: null, relation_packet_built: null, relation_dual_domain_ok: null },
      },
    ] as Array<any>);

    expect(rollup).toEqual({
      report_mode_correct: { pass: 1, fail: 1, unknown: 1 },
      relation_packet_built: { pass: 1, fail: 1, unknown: 1 },
      relation_dual_domain_ok: { pass: 1, fail: 1, unknown: 1 },
    });
  });
});

describe("helix ask versatility artifact bundle paths", () => {
  it("builds stable bundle paths for summary/recommendation/failures/checkpoint/prompts/raw, ab outputs, and trace export", () => {
    const bundle = createArtifactBundlePaths({
      outRootDir: "artifacts/experiments/step1-eval-integrity",
      runOutDir: "artifacts/experiments/step1-eval-integrity/run-123",
      rawRecordPath: "artifacts/experiments/step1-eval-integrity/run-123/raw/row.json",
      traceExportPath: "artifacts/experiments/step1-eval-integrity/training-trace-export.jsonl",
      abOutputPaths: ["artifacts/evidence-cards-ab/a.json", "artifacts/evidence-cards-ab/b.json"],
    });

    expect(bundle).toEqual({
      output_root_dir: path.resolve("artifacts/experiments/step1-eval-integrity"),
      output_run_dir: path.resolve("artifacts/experiments/step1-eval-integrity/run-123"),
      summary: path.resolve("artifacts/experiments/step1-eval-integrity/run-123/summary.json"),
      recommendation: path.resolve("artifacts/experiments/step1-eval-integrity/run-123/recommendation.json"),
      failures: path.resolve("artifacts/experiments/step1-eval-integrity/run-123/failures.json"),
      checkpoint: path.resolve("artifacts/experiments/step1-eval-integrity/run-123/checkpoint.json"),
      prompts: path.resolve("artifacts/experiments/step1-eval-integrity/run-123/prompts.jsonl"),
      raw_dir: path.resolve("artifacts/experiments/step1-eval-integrity/run-123/raw"),
      raw_record: path.resolve("artifacts/experiments/step1-eval-integrity/run-123/raw/row.json"),
      ab_outputs: [
        path.resolve("artifacts/evidence-cards-ab/a.json"),
        path.resolve("artifacts/evidence-cards-ab/b.json"),
      ],
      trace_export: path.resolve("artifacts/experiments/step1-eval-integrity/training-trace-export.jsonl"),
    });
  });
});
