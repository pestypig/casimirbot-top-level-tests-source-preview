import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const req = createRequire(import.meta.url);
const tsxCli = path.join(path.dirname(req.resolve("tsx")), "cli.mjs");
const tempDirs: string[] = [];

function mkTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paper-gpt-pro-validate-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function runValidator(reportPath: string) {
  return spawnSync(process.execPath, [tsxCli, path.join(repoRoot, "scripts/paper-gpt-pro-validate.ts"), "--report", reportPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function baseReport() {
  return {
    schema_version: 1,
    report_id: "gptreport:test-001",
    generated_at: new Date().toISOString(),
    generator: {
      platform: "chatgpt",
      model: "gpt-pro",
      notes: "validator fixture",
    },
    paper: {
      title: "Validator Fixture",
      source_type: "pdf",
      attachment_names: ["fixture.pdf"],
      topic_tags: ["physics", "validation"],
    },
    claims: [
      {
        claim_id: "claim:test:001",
        claim_type: "theory",
        text: "A prediction contract links one equation and one observable.",
        confidence: 0.9,
        evidence_spans: [{ page: 1, quote: "A prediction contract links one equation and one observable." }],
      },
    ],
    citations: [],
    citation_links: [],
    paper_card: {
      concepts: [
        {
          concept_id: "concept:test:frame",
          term: "Reference frame",
          aliases: ["BCRS"],
          definition: "BCRS reference frame.",
          confidence: 0.9,
          evidence_claim_ids: ["claim:test:001"],
        },
      ],
      quantitative_values: [],
      systems: [
        {
          system_id: "system:test:observer",
          name: "Observer system",
          components: ["observer", "signal path"],
          interactions: ["propagation"],
          confidence: 0.9,
          evidence_claim_ids: ["claim:test:001"],
        },
      ],
      math_objects: {
        equations: [
          {
            equation_id: "eq:test:001",
            canonical_form: "y = x",
            variable_ids: ["var:test:obs", "var:test:pred"],
            dimensionally_consistent: true,
          },
        ],
        definitions: [
          {
            definition_id: "def:test:001",
            term: "Observer",
            statement: "Observer definition.",
          },
        ],
        variables: [
          {
            variable_id: "var:test:obs",
            symbol: "x",
            unit: "s",
          },
          {
            variable_id: "var:test:pred",
            symbol: "y",
            unit: "s",
          },
        ],
        units: [
          {
            unit_id: "unit:test:s",
            symbol: "s",
            quantity_kind: "time",
          },
        ],
        assumptions: [
          {
            assumption_id: "asm:test:001",
            statement: "Local linearity.",
            scope: "model",
          },
        ],
      },
      congruence_assessments: [],
    },
    canonical_bindings: [
      {
        local_id: "concept:test:frame",
        local_type: "concept",
        canonical_id: "halobank-solar-reference-frame",
        relation: "equivalent_to",
        score: 0.95,
        source_tree: "docs/knowledge/halobank-solar-proof-tree.json",
        rationale: "Frame definition aligns with the HaloBank reference-frame node.",
      },
    ],
    executable_mappings: [
      {
        canonical_id: "halobank-solar-time-scale",
        model_kind: "model",
        implementation_candidates: [
          {
            file_path: "server/modules/halobank-solar/time-core.ts",
            kind: "function",
            symbol: "computeSolarTimeScales",
            confidence: 0.8,
            rationale: "Time-scale conversion implementation.",
          },
        ],
      },
    ],
    prediction_contract_candidates: [
      {
        contract_id: "pred:test:001",
        model_node_id: "halobank-solar-time-scale",
        equation_ids: ["eq:test:001"],
        input_bindings: [
          {
            variable_id: "var:test:obs",
            value: 1,
            unit: "s",
          },
        ],
        predicted_observable: {
          variable_id: "var:test:pred",
          value: 1,
          unit: "s",
        },
        measured_observable: {
          variable_id: "var:test:obs",
          value: 1,
          unit: "s",
        },
        status: "match",
        rationale: "The measured value matches the prediction in the fixture.",
      },
    ],
    symbol_equivalence_entries: [
      {
        canonical_symbol: "t",
        mapping_type: "exact",
        aliases: [
          {
            symbol: "tau",
            unit: "s",
          },
        ],
      },
    ],
    derivation_lineage: {
      lineage_version: 1,
      lineage_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      replay_seed: "seed:test",
      steps: [
        {
          step_id: "step:test:define",
          version: 1,
          operation: "define",
          at: "2026-01-01T00:00:00.000Z",
          input_hashes: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          output_hashes: ["cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
        },
        {
          step_id: "step:test:merge",
          version: 1,
          operation: "merge",
          at: "2026-01-01T00:00:01.000Z",
          input_hashes: ["cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
          output_hashes: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        },
      ],
    },
    maturity_gate_candidates: [
      {
        gate_id: "gate:test:001",
        target_id: "eq:test:001",
        required_stage: "reduced-order",
        current_stage: "diagnostic",
        status: "pass",
        blocking_reason: "none",
      },
    ],
    codex_patch_guidance: {
      target_files: ["scripts/paper-gpt-pro-validate.ts"],
      merge_strategy: "merge_with_dedupe",
      notes: "validator fixture",
    },
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("paper gpt pro validate", () => {
  it("passes a report with consistent prediction, symbol, and maturity semantics", () => {
    const dir = mkTempDir();
    const reportPath = path.join(dir, "report.json");
    writeJson(reportPath, baseReport());

    const result = runValidator(reportPath);
    expect(result.status).toBe(0);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"predictionContracts": 1');
    expect(result.stdout).toContain('"symbolEquivalenceEntries": 1');
    expect(result.stdout).toContain('"derivationLineageSteps": 2');
    expect(result.stdout).toContain('"maturityGateCandidates": 1');
  });

  it("fails when symbol-equivalence transforms contradict mapping semantics", () => {
    const dir = mkTempDir();
    const reportPath = path.join(dir, "report.json");
    const report = baseReport();
    report.symbol_equivalence_entries = [
      {
        canonical_symbol: "t",
        mapping_type: "exact",
        aliases: [
          {
            symbol: "tau",
            unit: "s",
          },
        ],
        transform: {
          scale: 2,
        },
      },
      {
        canonical_symbol: "tau_canonical",
        mapping_type: "contextual",
        aliases: [
          {
            symbol: "tau",
            unit: "s",
          },
        ],
      },
    ];
    writeJson(reportPath, report);

    const result = runValidator(reportPath);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("invalid_exact_symbol_transform");
    expect(`${result.stdout}${result.stderr}`).toContain("ambiguous_symbol_alias");
  });

  it("fails when prediction references are unresolved and maturity ordering is impossible", () => {
    const dir = mkTempDir();
    const reportPath = path.join(dir, "report.json");
    const report = baseReport();
    report.prediction_contract_candidates = [
      {
        contract_id: "pred:test:001",
        model_node_id: "model:test:missing",
        equation_ids: ["eq:test:missing"],
        input_bindings: [
          {
            variable_id: "var:test:missing",
            value: 1,
            unit: "s",
          },
        ],
        predicted_observable: {
          variable_id: "var:test:missing",
          value: 1,
          unit: "s",
        },
        measured_observable: {
          variable_id: "var:test:obs",
          value: 1,
          unit: "ms",
        },
        status: "tension",
      },
    ];
    report.maturity_gate_candidates = [
      {
        gate_id: "gate:test:001",
        target_id: "eq:test:missing",
        required_stage: "certified",
        current_stage: "exploratory",
        status: "pass",
        blocking_reason: "should fail",
      },
    ];
    writeJson(reportPath, report);

    const result = runValidator(reportPath);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("unknown_prediction_equation_id");
    expect(`${result.stdout}${result.stderr}`).toContain("unknown_prediction_input_variable");
    expect(`${result.stdout}${result.stderr}`).toContain("prediction_observable_unit_mismatch");
    expect(`${result.stdout}${result.stderr}`).toContain("unknown_maturity_gate_target");
    expect(`${result.stdout}${result.stderr}`).toContain("invalid_maturity_gate_stage_order");
  });

  it("fails when derivation lineage steps are out of order or unchained", () => {
    const dir = mkTempDir();
    const reportPath = path.join(dir, "report.json");
    const report = baseReport();
    report.derivation_lineage = {
      lineage_version: 1,
      lineage_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      replay_seed: "seed:test",
      steps: [
        {
          step_id: "step:test:define",
          version: 1,
          operation: "define",
          at: "2026-01-01T00:00:02.000Z",
          input_hashes: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          output_hashes: ["cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
        },
        {
          step_id: "step:test:merge",
          version: 1,
          operation: "merge",
          at: "2026-01-01T00:00:01.000Z",
          input_hashes: ["dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
          output_hashes: ["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
        },
      ],
    };
    writeJson(reportPath, report);

    const result = runValidator(reportPath);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("derivation_lineage_out_of_order");
    expect(`${result.stdout}${result.stderr}`).toContain("derivation_lineage_unlinked_step");
    expect(`${result.stdout}${result.stderr}`).toContain("derivation_lineage_hash_mismatch");
  });
});
