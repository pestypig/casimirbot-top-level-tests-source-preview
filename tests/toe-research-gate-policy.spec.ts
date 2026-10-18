import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

function runTsxScript(scriptPath: string, env: NodeJS.ProcessEnv): string {
  return execFileSync(process.execPath, [TSX_CLI, scriptPath], {
    cwd: process.cwd(),
    env,
    stdio: "pipe",
    encoding: "utf8",
  });
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

describe("TOE research gate policy validation", () => {
  it("passes for policy + backlog metadata when research artifacts are present", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-research-gate-pass-"));
    const policyPath = path.join(tempDir, "policy.json");
    const backlogPath = path.join(tempDir, "backlog.json");

    writeJson(policyPath, {
      schema_version: "toe_research_gate_policy/1",
      kind: "toe_research_gate_policy",
      deterministic_gate_fields: [
        "risk_class",
        "requires_audit",
        "requires_research",
        "required_artifacts",
      ],
      risk_policies: {
        contract_only: {
          risk_class: "contract_only",
          requires_audit: false,
          requires_research: false,
          required_artifacts: [],
        },
        runtime_contract: {
          risk_class: "runtime_contract",
          requires_audit: true,
          requires_research: false,
          required_artifacts: ["runtime-contract-audit"],
        },
        physics_unknown: {
          risk_class: "physics_unknown",
          requires_audit: true,
          requires_research: true,
          required_artifacts: ["physics-research-brief"],
        },
        tier_promotion: {
          risk_class: "tier_promotion",
          requires_audit: true,
          requires_research: true,
          required_artifacts: ["tier-promotion-rationale"],
        },
      },
    });

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      kind: "toe_ticket_backlog",
      tickets: [
        {
          id: "TOE-999-dummy",
          tree_owner: "ops-deployment",
          primitive: "dummy",
          primary_path_prefix: "tests",
          allowed_paths: ["tests"],
          required_tests: ["tests"],
          done_criteria: ["a", "b", "c"],
          research_gate: {
            risk_class: "physics_unknown",
            requires_audit: true,
            requires_research: true,
            required_artifacts: ["physics-research-brief"],
          },
        },
      ],
    });

    const output = runTsxScript("scripts/validate-toe-research-gate-policy.ts", {
      ...process.env,
      TOE_RESEARCH_GATE_POLICY_PATH: policyPath,
      TOE_TICKET_BACKLOG_PATH: backlogPath,
      TOE_TICKET_EXTENSION_BACKLOG_PATH: path.join(tempDir, "missing-extension.json"),
    });

    expect(output).toContain("toe-research-gate-policy validation OK");
  });

  it("fails when physics_unknown ticket metadata omits required research artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-research-gate-fail-"));
    const backlogPath = path.join(tempDir, "backlog.json");

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      kind: "toe_ticket_backlog",
      tickets: [
        {
          id: "TOE-998-dummy",
          tree_owner: "ops-deployment",
          primitive: "dummy",
          primary_path_prefix: "tests",
          allowed_paths: ["tests"],
          required_tests: ["tests"],
          done_criteria: ["a", "b", "c"],
          research_gate: {
            risk_class: "physics_unknown",
            requires_audit: true,
            requires_research: true,
            required_artifacts: [],
          },
        },
      ],
    });

    expect(() => {
      runTsxScript("scripts/validate-toe-ticket-backlog.ts", {
        ...process.env,
        TOE_TICKET_BACKLOG_PATH: backlogPath,
      });
    }).toThrow(/research_gate.required_artifacts must be non-empty/);
  });

  it("keeps backlog validator backward compatible when research_gate is absent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-research-gate-compat-"));
    const backlogPath = path.join(tempDir, "backlog.json");

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      kind: "toe_ticket_backlog",
      tickets: [
        {
          id: "TOE-997-dummy",
          tree_owner: "ops-deployment",
          primitive: "dummy",
          primary_path_prefix: "tests",
          allowed_paths: ["tests"],
          required_tests: ["tests"],
          done_criteria: ["a", "b", "c"],
        },
      ],
    });

    const output = runTsxScript("scripts/validate-toe-ticket-backlog.ts", {
      ...process.env,
      TOE_TICKET_BACKLOG_PATH: backlogPath,
    });

    expect(output).toContain("toe-ticket-backlog validation OK");
  });
});
