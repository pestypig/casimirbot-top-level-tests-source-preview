import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { EssenceProposal } from "@shared/proposals";
import { upsertProposal, getProposalById } from "../server/db/proposals";
import { resetDbClient } from "../server/db/client";
import { handleApproveProposal } from "../server/services/proposals/engine";
import {
  startProposalJobRunner,
  __waitForProposalJobRunner,
  __resetProposalJobRunnerForTest,
} from "../server/services/proposals/job-runner";

const NOW = new Date().toISOString();

const buildProposal = (id: string): EssenceProposal => ({
  id,
  kind: "panel",
  status: "new",
  source: "essence:proposal",
  title: "Promote Operational Mode panel",
  summary: "Surface the OperationalModePanel component inside Helix Desktop",
  explanation: "Provides drive telemetry parity with console layout review.",
  target: { type: "panel-seed", componentPath: "client/src/components/OperationalModePanel.tsx" },
  patchKind: "ui-config",
  patch: JSON.stringify({ panelId: "operational-mode", width: 600 }),
  rewardTokens: 250,
  ownerId: "persona:demo",
  safetyStatus: "unknown",
  safetyReport: null,
  jobId: null,
  evalRunId: null,
  metadata: { panelId: "operational-mode", dataSources: ["client/src/hooks/use-energy-pipeline.ts"] },
  createdAt: NOW,
  updatedAt: NOW,
  createdForDay: NOW.slice(0, 10),
});

describe("proposal job runner", () => {
  beforeEach(async () => {
    process.env.ENABLE_PROPOSAL_JOB_RUNNER = "1";
    __resetProposalJobRunnerForTest();
    await resetDbClient();
  });

  afterEach(async () => {
    await __waitForProposalJobRunner();
    __resetProposalJobRunnerForTest();
    await resetDbClient();
  });

  it("moves approved proposals to applied once the runner completes", async () => {
    const seeded = buildProposal("proposal-runner-basic");
    await upsertProposal(seeded);

    startProposalJobRunner();

    const stored = await getProposalById(seeded.id);
    expect(stored).not.toBeNull();

    await handleApproveProposal(stored!, "persona:demo");

    await __waitForProposalJobRunner();
    const applied = await getProposalById(seeded.id);
    expect(applied?.status).toBe("applied");
    expect(applied?.safetyStatus).toBe("passed");
    expect(applied?.safetyScore).toBe(1);
  });
});


it("sector-control proposals validate evidence payload shape", async () => {
  const { essenceProposalSchema } = await import("../shared/proposals");
  const seeded = {
    ...buildProposal("proposal-runner-sector-control"),
    kind: "sector-control" as const,
    evidence: {
      guardrailStatus: { FordRomanQI: "pass", ThetaAudit: "pass" },
      maturity: "diagnostic" as const,
      traceRef: "adapter:sector-trace",
      runRef: "run:sector-1",
    },
  };
  const parsed = essenceProposalSchema.parse(seeded);
  expect(parsed.kind).toBe("sector-control");
  expect(parsed.evidence?.maturity).toBe("diagnostic");
});
