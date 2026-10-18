import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const runFormalWrapperMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/nhm2/run-experiment-ready-theory-formal", async () => {
  const actual = await vi.importActual<
    typeof import("../tools/nhm2/run-experiment-ready-theory-formal")
  >("../tools/nhm2/run-experiment-ready-theory-formal");
  return {
    ...actual,
    runNhm2ExperimentReadyTheoryFormal: runFormalWrapperMock,
  };
});

import {
  NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_MANIFEST_EXECUTION_PLAN_ROLES,
  NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_MANIFEST_REQUIRED_EVIDENCE_ROLES,
  NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_NUMERIC_POLICY_SET_ARTIFACT_ID,
  NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_NUMERIC_POLICY_SET_CONTRACT_VERSION,
  NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_PREDICTION_FREEZE_CONTRACT_VERSION,
  buildNhm2ExperimentReadyTheoryCandidateManifest,
  buildNhm2ExperimentReadyTheoryCandidateNumericPolicySetArtifact,
  nhm2ExperimentReadyTheoryFormalInvocation,
  nhm2ExperimentReadyTheoryFormalRunSpecPath,
  nhm2ExperimentReadyTheoryCandidateReceiptIdForRequest,
  type Nhm2ExperimentReadyTheoryCandidateBindingsV1,
  type Nhm2ExperimentReadyTheoryCandidateEvidenceRole,
  type Nhm2ExperimentReadyTheoryCandidateExecutionPlanRole,
  type Nhm2ExperimentReadyTheoryCandidateExecutionPlanV1,
} from "../shared/contracts/nhm2-experiment-ready-theory-candidate-manifest.v1";
import { NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_CONTRACT_VERSIONS } from "../shared/contracts/nhm2-experiment-ready-theory-closure.v1";
import {
  NHM2_FORMAL_KERNEL_AXIOM_TRANSCRIPT_MARKER,
  NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
  NHM2_FORMAL_KERNEL_THEOREM_TRANSCRIPT_MARKER,
  computeNhm2FormalKernelLedgerSha256,
  type Nhm2FormalKernelExecutionObservationV1,
  type Nhm2FormalKernelLedgerEntryV1,
  type Nhm2FormalKernelLedgerKind,
  type Nhm2FormalKernelSealedLedgerV1,
} from "../server/services/theory/nhm2-formal-kernel-executor";
import {
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_EXECUTION_ARTIFACT_ID,
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_EXECUTION_CONTRACT_VERSION,
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_ARTIFACT_ID,
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_CONTRACT_VERSION,
  type Nhm2ExperimentReadyTheoryFormalExecutionArtifactV1,
  type Nhm2ExperimentReadyTheoryFormalRunSpecV1,
  type RunNhm2ExperimentReadyTheoryFormalResult,
} from "../tools/nhm2/run-experiment-ready-theory-formal";
import {
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_CANDIDATE_EVIDENCE_RELATIVE_PATH,
  isExactNhm2FormalOuterObservationEvidenceV2,
  parseNhm2ExperimentReadyTheoryFormalCandidateCliArgs,
  runNhm2ExperimentReadyTheoryFormalCandidate,
} from "../tools/nhm2/run-experiment-ready-theory-formal-candidate";

const roots: string[] = [];

afterEach(async () => {
  runFormalWrapperMock.mockReset();
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const hash = (character: string): string => character.repeat(64);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ledger = (
  kind: Nhm2FormalKernelLedgerKind,
  rootPath: string,
  entries: Nhm2FormalKernelLedgerEntryV1[],
): Nhm2FormalKernelSealedLedgerV1 => ({
  kind,
  rootPath,
  entries,
  ledgerSha256: computeNhm2FormalKernelLedgerSha256({ kind, entries }),
});

const outputInventorySha256 = (
  entries: Array<{ relativePath: string; sha256: string; sizeBytes: number }>,
): string =>
  sha256(
    JSON.stringify({
      domain: "nhm2_formal_kernel_output_inventory/v1",
      entries: entries.map(({ relativePath, sha256: digest, sizeBytes }) => ({
        relativePath,
        sha256: digest,
        sizeBytes,
      })),
    }),
  );

const outerInventorySha256 = (
  entries: Array<{ path: string; sha256: string; sizeBytes: number }>,
): string =>
  sha256(
    `nhm2_formal_outer_inventory/v1\0${JSON.stringify(
      entries.map((entry) => [entry.path, entry.sha256, entry.sizeBytes]),
    )}`,
  );

const planRoleForEvidence = (
  evidenceRole: Nhm2ExperimentReadyTheoryCandidateEvidenceRole,
): Nhm2ExperimentReadyTheoryCandidateExecutionPlanRole => {
  if (evidenceRole === "independent_numerical_replication") {
    return "independent_numerical";
  }
  if (evidenceRole === "formal_manifest_certificate") return "formal_kernel";
  return "primary_numerical";
};

const invocationEnvironment = (input: {
  bindings: Nhm2ExperimentReadyTheoryCandidateBindingsV1;
  candidateId: string;
  outputDirectory: string;
  requestId: string;
  runId: string;
  receiptId: string;
  runtimeId: string;
}) =>
  [
    {
      name: "NHM2_ATLAS_SHA256",
      valueKind: "literal" as const,
      value: input.bindings.atlas.sha256,
    },
    {
      name: "NHM2_CANDIDATE_ID",
      valueKind: "literal" as const,
      value: input.candidateId,
    },
    {
      name: "NHM2_CANDIDATE_MANIFEST_SHA256",
      valueKind: "candidate_manifest_raw_sha256" as const,
      value: null,
    },
    {
      name: "NHM2_CHART_ID",
      valueKind: "literal" as const,
      value: input.bindings.chart.chartId,
    },
    {
      name: "NHM2_NORMALIZATION_SHA256",
      valueKind: "literal" as const,
      value: input.bindings.normalization.sha256,
    },
    {
      name: "NHM2_OUTPUT_DIR",
      valueKind: "literal" as const,
      value: input.outputDirectory,
    },
    {
      name: "NHM2_RUN_ID",
      valueKind: "literal" as const,
      value: input.runId,
    },
    {
      name: "NHM2_SELECTED_PROFILE_ID",
      valueKind: "literal" as const,
      value: input.bindings.profile.selectedProfileId,
    },
    {
      name: "NHM2_UNITS_SHA256",
      valueKind: "literal" as const,
      value: input.bindings.units.sha256,
    },
    {
      name: "THEORY_RUNTIME_ID",
      valueKind: "literal" as const,
      value: input.runtimeId,
    },
    {
      name: "THEORY_RUNTIME_RECEIPT_ID",
      valueKind: "literal" as const,
      value: input.receiptId,
    },
    {
      name: "THEORY_RUNTIME_REQUEST_ID",
      valueKind: "literal" as const,
      value: input.requestId,
    },
  ].sort((left, right) => left.name.localeCompare(right.name));

type Fixture = {
  root: string;
  candidatePath: string;
  specPath: string;
  outputRoot: string;
  evidencePath: string;
};

async function makeFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "nhm2-formal-candidate-producer-"),
  );
  roots.push(root);
  const inputRoot = path.join(root, "input");
  const candidateManifestRelativePath = "input/candidate.json";
  const formalRunId = "formal_kernel-run-001";
  const formalOutputDirectory = `candidate/runs/${formalRunId}`;
  const outputRoot = path.join(root, ...formalOutputDirectory.split("/"));
  const formalRunSpecRelativePath = nhm2ExperimentReadyTheoryFormalRunSpecPath({
    outputDirectory: formalOutputDirectory,
    runId: formalRunId,
  });
  await fs.mkdir(inputRoot, { recursive: true });

  const binding = (
    name: string,
    character: string,
  ): {
    artifactId: string;
    contractVersion: string;
    path: string;
    sha256: string;
  } => ({
    artifactId: `nhm2.${name}`,
    contractVersion: `nhm2_${name}/v1`,
    path: `input/${name}.json`,
    sha256: hash(character),
  });
  const bindings: Nhm2ExperimentReadyTheoryCandidateBindingsV1 = {
    candidate: {
      ...binding("candidate", "1"),
      candidateId: "nhm2-formal-candidate-001",
    },
    profile: {
      ...binding("profile", "2"),
      selectedProfileId: "profile-001",
    },
    chart: { ...binding("chart", "3"), chartId: "chart-001" },
    atlas: { ...binding("atlas", "4"), atlasId: "atlas-001" },
    units: { ...binding("units", "5"), unitsId: "si-001" },
    normalization: {
      ...binding("normalization", "6"),
      normalizationId: "normalization-001",
    },
  };
  const candidateId = bindings.candidate.candidateId;
  const plans =
    NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_MANIFEST_EXECUTION_PLAN_ROLES.map(
      (planRole, index): Nhm2ExperimentReadyTheoryCandidateExecutionPlanV1 => {
        const requestId = `${planRole}-request-001`;
        const runId = `${planRole}-run-001`;
        const runtimeId = `nhm2.${planRole}.runtime`;
        const receiptId = nhm2ExperimentReadyTheoryCandidateReceiptIdForRequest(
          runtimeId,
          requestId,
        );
        const outputDirectory =
          planRole === "formal_kernel"
            ? formalOutputDirectory
            : `runs/${planRole}`;
        const formalInvocation =
          planRole === "formal_kernel"
            ? nhm2ExperimentReadyTheoryFormalInvocation({
                candidateManifestPath: candidateManifestRelativePath,
                outputDirectory,
                runId,
              })
            : null;
        return {
          planRole,
          requestId,
          runId,
          receiptId,
          runtimeId,
          sourceCommitSha: String(index + 7).repeat(40),
          deterministicSeedPolicy: `${planRole}-deterministic/v1`,
          solver: {
            ...binding(`${planRole}_solver`, String(index + 7)),
            solverId: `${planRole}-solver`,
            solverVersion: "1.0.0",
            implementationId: `${planRole}-implementation-v1`,
          },
          environmentLock: {
            ...binding(`${planRole}_environment`, String(index + 4)),
            environmentId: `${planRole}-environment-001`,
          },
          expectedInvocation: {
            entrypoint:
              formalInvocation?.entrypoint ?? `tools/nhm2/${planRole}.ts`,
            command: formalInvocation?.command ?? "tsx",
            args: formalInvocation?.args ?? [`run-${planRole}`],
            cwd: formalInvocation?.cwd ?? ".",
            environment: invocationEnvironment({
              bindings,
              candidateId,
              outputDirectory,
              requestId,
              runId,
              receiptId,
              runtimeId,
            }),
            outputDirectory,
          },
        };
      },
    );
  const policy =
    buildNhm2ExperimentReadyTheoryCandidateNumericPolicySetArtifact(
      "formal-producer-policy-001",
    );
  const candidate = buildNhm2ExperimentReadyTheoryCandidateManifest({
    generatedAt: "2026-07-19T09:59:00.000Z",
    frozenAt: "2026-07-19T10:00:00.000Z",
    manifestId: "nhm2-formal-candidate-manifest-001",
    bindings,
    executionPlans: plans,
    expectedEvidenceOutputs:
      NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_MANIFEST_REQUIRED_EVIDENCE_ROLES.map(
        (evidenceRole) => {
          const plan = plans.find(
            (entry) => entry.planRole === planRoleForEvidence(evidenceRole),
          );
          if (plan == null) throw new Error(`plan missing for ${evidenceRole}`);
          return {
            evidenceRole,
            outputPath: `${plan.expectedInvocation.outputDirectory}/evidence/${evidenceRole}.json`,
            contractVersion:
              NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_CONTRACT_VERSIONS[
                evidenceRole
              ],
            requestId: plan.requestId,
            runId: plan.runId,
            receiptId: plan.receiptId,
            runtimeId: plan.runtimeId,
          };
        },
      ),
    predictionFreezeCommitment: {
      contractVersion:
        NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_PREDICTION_FREEZE_CONTRACT_VERSION,
      semanticSha256: hash("a"),
      frozenAt: "2026-07-19T09:58:00.000Z",
    },
    numericCheckPolicySet: {
      artifactId:
        NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_NUMERIC_POLICY_SET_ARTIFACT_ID,
      contractVersion:
        NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_NUMERIC_POLICY_SET_CONTRACT_VERSION,
      policySetId: policy.policySetId,
      artifactPath: "input/numeric-policy.json",
      artifactRawSha256: hash("b"),
      semanticSha256: policy.semanticSha256,
    },
    supersession: {
      policyId: "nhm2-formal-supersession-policy-001",
      policyPath: "input/supersession.json",
      policyContractVersion: "nhm2_supersession_policy/v1",
      policySha256: hash("c"),
      originalManifestImmutable: true,
      inPlaceMutationForbidden: true,
      supersedingManifestRequiresNewManifestId: true,
      supersedingManifestRequiresPredecessorSha256: true,
      predecessorManifestId: null,
      predecessorManifestSha256: null,
    },
  });
  expect(candidate.readiness.status).toBe("pre_run_manifest_ready");
  const candidateBytes = Buffer.from(
    `${JSON.stringify(candidate, null, 2)}\n`,
    "utf8",
  );
  const candidatePath = path.join(
    root,
    ...candidateManifestRelativePath.split("/"),
  );
  await fs.writeFile(candidatePath, candidateBytes);
  const candidateDigest = sha256(candidateBytes);
  const formalPlan = plans.find((entry) => entry.planRole === "formal_kernel");
  if (formalPlan == null) throw new Error("formal plan missing");

  const sourceRoot = path.join(root, "sealed-source");
  const toolchainRoot = path.join(root, "sealed-toolchain");
  const sealedInputRoot = path.join(root, "sealed-input");
  const replayOne = path.join(outputRoot, "replay-one");
  const replayTwo = path.join(outputRoot, "replay-two");
  const driverPath = path.join(sourceRoot, "ExperimentReadyReplayDriver.lean");
  const leanPath = path.join(toolchainRoot, "bin", "lean.exe");
  const lakePath = path.join(toolchainRoot, "bin", "lake.exe");
  const sourceLedger = ledger("source", sourceRoot, [
    {
      relativePath: "ExperimentReadyReplayDriver.lean",
      sha256: hash("d"),
      sizeBytes: 420,
    },
  ]);
  const toolchainLedger = ledger("toolchain", toolchainRoot, [
    { relativePath: "bin/lake.exe", sha256: hash("e"), sizeBytes: 2_000 },
    { relativePath: "bin/lean.exe", sha256: hash("f"), sizeBytes: 3_000 },
  ]);
  const inputLedger = ledger("input", sealedInputRoot, [
    {
      relativePath: "input/candidate.json",
      sha256: candidateDigest,
      sizeBytes: candidateBytes.byteLength,
    },
  ]);
  const identity = {
    candidateId,
    candidateManifestId: candidate.manifestId,
    candidateManifestSha256: candidateDigest,
    candidateFrozenAt: candidate.frozenAt,
    requestId: formalPlan.requestId,
    runId: formalPlan.runId,
    receiptId: formalPlan.receiptId,
    runtimeId: formalPlan.runtimeId,
    sourceCommitSha: formalPlan.sourceCommitSha,
  };
  const formalClaimBoundary = {
    formalLogicReplayOnly: true,
    outerObservedExecutionOnly: true,
    numericalPhysicsValidated: false,
    empiricalValidationEstablished: false,
    experimentReadyTheoryClosureClaimAllowed: false,
    physicalViabilityClaimAllowed: false,
    transportClaimAllowed: false,
    propulsionClaimAllowed: false,
    routeEtaClaimAllowed: false,
    speedAuthorityClaimAllowed: false,
  } as const;
  const spec: Nhm2ExperimentReadyTheoryFormalRunSpecV1 = {
    artifactId: NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_ARTIFACT_ID,
    contractVersion:
      NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_CONTRACT_VERSION,
    generatedAt: "2026-07-19T10:00:01.000Z",
    sealedAt: "2026-07-19T10:00:02.000Z",
    identity,
    planBinding: clone(formalPlan),
    theoremName: NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
    formalSourceBindings: {
      authority: "server_owned_formal_project",
      projectRoot: sourceRoot,
      entries: [
        {
          sourceRole: "replay_driver",
          path: driverPath,
          sha256: hash("d"),
          sizeBytes: 420,
        },
      ],
    },
    toolchainBindings: {
      authority: "sealed_lean_toolchain",
      toolchainRoot,
      entries: [
        {
          toolchainRole: "lake_executable",
          path: lakePath,
          sha256: hash("e"),
          sizeBytes: 2_000,
        },
        {
          toolchainRole: "lean_executable",
          path: leanPath,
          sha256: hash("f"),
          sizeBytes: 3_000,
        },
      ],
    },
    executor: {
      theoremName: NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
      executableRole: "lean",
      executables: {
        lean: { absolutePath: leanPath, sha256: hash("f"), sizeBytes: 3_000 },
        lake: { absolutePath: lakePath, sha256: hash("e"), sizeBytes: 2_000 },
      },
      ledgers: {
        source: sourceLedger,
        toolchain: toolchainLedger,
        input: inputLedger,
      },
      outputRoot,
      replayWorkdirs: [replayOne, replayTwo],
      environmentAllowlist: ["LEAN_PATH"],
      environment: { LEAN_PATH: sourceRoot },
      executableArguments: [driverPath, "-o", "proof.olean"],
      expectedOutputPaths: ["proof.olean"],
      timeoutMs: 60_000,
      maxCapturedOutputBytes: 1_048_576,
    },
    outerArtifactPath: path.join(
      outputRoot,
      "formal-kernel-execution-observation.json",
    ),
    claimBoundary: formalClaimBoundary,
  };
  const specBytes = Buffer.from(JSON.stringify(spec), "utf8");
  const specPath = path.join(root, ...formalRunSpecRelativePath.split("/"));
  await fs.mkdir(path.dirname(specPath), { recursive: true });
  await fs.writeFile(specPath, specBytes);
  const specDigest = sha256(specBytes);

  const stdout = `${NHM2_FORMAL_KERNEL_AXIOM_TRANSCRIPT_MARKER}\n${NHM2_FORMAL_KERNEL_THEOREM_TRANSCRIPT_MARKER}\n`;
  const output = {
    relativePath: "proof.olean",
    sha256: hash("7"),
    sizeBytes: 7_000,
    modifiedAt: "2026-07-19T10:00:05.500Z",
    freshness: "new" as const,
  };
  const makeLedgerObservation = (kind: Nhm2FormalKernelLedgerKind) => ({
    kind,
    observedAt: "2026-07-19T10:00:03.000Z",
    ledgerSha256: spec.executor.ledgers[kind].ledgerSha256,
    entryCount: spec.executor.ledgers[kind].entries.length,
    entries: clone(spec.executor.ledgers[kind].entries),
  });
  const makeReplay = (replayIndex: 1 | 2, cwd: string) => ({
    replayIndex,
    executableRole: "lean" as const,
    process: {
      executableRole: "lean" as const,
      command: leanPath,
      args: [...spec.executor.executableArguments],
      cwd,
      environment: { ...spec.executor.environment },
      startedAt:
        replayIndex === 1
          ? "2026-07-19T10:00:05.000Z"
          : "2026-07-19T10:00:06.000Z",
      completedAt:
        replayIndex === 1
          ? "2026-07-19T10:00:06.000Z"
          : "2026-07-19T10:00:07.000Z",
      durationMs: 1_000,
      exitCode: 0,
      signal: null,
      stdout,
      stderr: "",
      stdoutSha256: sha256(Buffer.from(stdout, "utf8")),
      stderrSha256: sha256(Buffer.alloc(0)),
      stdoutBytes: Buffer.byteLength(stdout, "utf8"),
      stderrBytes: 0,
      timedOut: false,
      outputLimitExceeded: false,
      spawnError: null,
    },
    transcript: {
      theoremMarker: NHM2_FORMAL_KERNEL_THEOREM_TRANSCRIPT_MARKER,
      axiomMarker: NHM2_FORMAL_KERNEL_AXIOM_TRANSCRIPT_MARKER,
    },
    outputInventorySha256: outputInventorySha256([output]),
    outputs: [clone(output)],
    postRunLedgers: {
      source: makeLedgerObservation("source"),
      toolchain: makeLedgerObservation("toolchain"),
      input: makeLedgerObservation("input"),
    },
  });
  const observation: Nhm2FormalKernelExecutionObservationV1 = {
    artifactId: "nhm2.formal_kernel_execution_observation",
    contractVersion: "nhm2_formal_kernel_execution_observation/v1",
    generatedAt: "2026-07-19T10:00:08.000Z",
    status: "pass",
    theoremName: NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
    executableRole: "lean",
    executables: clone(spec.executor.executables),
    preRunLedgers: {
      source: makeLedgerObservation("source"),
      toolchain: makeLedgerObservation("toolchain"),
      input: makeLedgerObservation("input"),
    },
    replays: [makeReplay(1, replayOne), makeReplay(2, replayTwo)],
    replayAgreement: {
      executableRolesExact: true,
      commandsExact: true,
      environmentsExact: true,
      transcriptsExact: true,
      outputInventoriesExact: true,
      sealedLedgersStable: true,
    },
    claimBoundary: {
      formalLogicReplayOnly: true,
      numericalPhysicsValidated: false,
      empiricalValidationEstablished: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
      routeEtaClaimAllowed: false,
      speedAuthorityClaimAllowed: false,
      operatingSystemHermeticityAsserted: false,
      filesystemSandboxAsserted: false,
    },
  };
  const replayEntries = [
    {
      path: "replay-one/proof.olean",
      sha256: output.sha256,
      sizeBytes: output.sizeBytes,
    },
    {
      path: "replay-two/proof.olean",
      sha256: output.sha256,
      sizeBytes: output.sizeBytes,
    },
  ];
  const artifact: Nhm2ExperimentReadyTheoryFormalExecutionArtifactV1 = {
    artifactId: NHM2_EXPERIMENT_READY_THEORY_FORMAL_EXECUTION_ARTIFACT_ID,
    contractVersion:
      NHM2_EXPERIMENT_READY_THEORY_FORMAL_EXECUTION_CONTRACT_VERSION,
    generatedAt: observation.generatedAt,
    identity,
    inputs: {
      candidateManifest: {
        path: candidateManifestRelativePath,
        sha256: candidateDigest,
        sizeBytes: candidateBytes.byteLength,
      },
      formalRunSpec: {
        path: formalRunSpecRelativePath,
        sha256: specDigest,
        sizeBytes: specBytes.byteLength,
      },
    },
    planRole: "formal_kernel",
    theoremName: NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
    replayOutputInventory: {
      algorithm: "sha256_canonical_tuple_list/v1",
      entries: replayEntries,
      inventorySha256: outerInventorySha256(replayEntries),
    },
    executionObservation: observation,
    claimBoundary: formalClaimBoundary,
  };
  const artifactBytes = Buffer.from(JSON.stringify(artifact), "utf8");
  const outerPath = path.join(
    outputRoot,
    "formal-kernel-execution-observation.json",
  );
  const outerRelativePath = path
    .relative(root, outerPath)
    .split(path.sep)
    .join("/");

  runFormalWrapperMock.mockImplementationOnce(
    async (): Promise<RunNhm2ExperimentReadyTheoryFormalResult> => {
      await fs.mkdir(replayOne, { recursive: true });
      await fs.mkdir(replayTwo, { recursive: true });
      await fs.writeFile(outerPath, artifactBytes);
      return {
        executionArtifactPath: outerRelativePath,
        executionArtifactSha256: sha256(artifactBytes),
        executionArtifactSizeBytes: artifactBytes.byteLength,
        candidateManifestSha256: candidateDigest,
        formalRunSpecSha256: specDigest,
        finalOutputInventory: [
          {
            path: "formal-kernel-execution-observation.json",
            sha256: sha256(artifactBytes),
            sizeBytes: artifactBytes.byteLength,
          },
          ...replayEntries,
        ],
        finalOutputInventorySha256: hash("8"),
        observation,
        claimBoundary: formalClaimBoundary,
      };
    },
  );
  return {
    root,
    candidatePath: candidateManifestRelativePath,
    specPath: formalRunSpecRelativePath,
    outputRoot,
    evidencePath: path.join(
      outputRoot,
      ...NHM2_EXPERIMENT_READY_THEORY_FORMAL_CANDIDATE_EVIDENCE_RELATIVE_PATH.split(
        "/",
      ),
    ),
  };
}

describe.sequential("NHM2 formal candidate evidence producer", () => {
  it("publishes only canonical v2 evidence derived from the reopened outer observation", async () => {
    const fixture = await makeFixture();
    const result = await runNhm2ExperimentReadyTheoryFormalCandidate({
      workspaceRoot: fixture.root,
      candidateManifestPath: fixture.candidatePath,
      formalRunSpecPath: fixture.specPath,
    });

    expect(runFormalWrapperMock).toHaveBeenCalledOnce();
    expect(result.status).toBe("pass");
    expect(result.evidencePath).toBe(
      "candidate/runs/formal_kernel-run-001/evidence/formal_manifest_certificate.json",
    );
    const bytes = await fs.readFile(fixture.evidencePath);
    expect(JSON.stringify(JSON.parse(bytes.toString("utf8")))).toBe(
      bytes.toString("utf8"),
    );
    const evidence: unknown = JSON.parse(bytes.toString("utf8"));
    expect(isExactNhm2FormalOuterObservationEvidenceV2(evidence)).toBe(true);
    expect(evidence).toMatchObject({
      contractVersion: "nhm2_formal_manifest_certificate/v2",
      status: "pass",
      formalClaim: {
        theoremResult: "proved",
        nativeAxiomAudit: "no_axioms",
        replayCount: 2,
      },
      claimBoundary: {
        numericalPhysicsValidated: false,
        theoryClosureEstablished: false,
        empiricalValidationEstablished: false,
        physicalViabilityEstablished: false,
        transportEstablished: false,
        propulsionEstablished: false,
        routeEtaEstablished: false,
        speedAuthorityEstablished: false,
      },
    });
    expect(await fs.readdir(path.dirname(fixture.evidencePath))).toEqual([
      "formal_manifest_certificate.json",
    ]);
  });

  it("refuses a pre-existing formal output tree before invoking the wrapper", async () => {
    const fixture = await makeFixture();
    await fs.mkdir(fixture.outputRoot, { recursive: true });

    await expect(
      runNhm2ExperimentReadyTheoryFormalCandidate({
        workspaceRoot: fixture.root,
        candidateManifestPath: fixture.candidatePath,
        formalRunSpecPath: fixture.specPath,
      }),
    ).rejects.toMatchObject({ code: "output_preexists" });
    expect(runFormalWrapperMock).not.toHaveBeenCalled();
  });

  it("rejects a byte-identical run spec copied away from the frozen plan path", async () => {
    const fixture = await makeFixture();
    const alternateSpecPath = path.join(
      fixture.root,
      "alternate-formal-spec.json",
    );
    await fs.copyFile(
      path.join(fixture.root, ...fixture.specPath.split("/")),
      alternateSpecPath,
    );
    await expect(
      runNhm2ExperimentReadyTheoryFormalCandidate({
        workspaceRoot: fixture.root,
        candidateManifestPath: fixture.candidatePath,
        formalRunSpecPath: alternateSpecPath,
      }),
    ).rejects.toMatchObject({ code: "formal_run_spec_path_mismatch" });
    expect(runFormalWrapperMock).not.toHaveBeenCalled();
  });

  it("accepts exact fail semantics but rejects opened physical authority", async () => {
    const fixture = await makeFixture();
    await runNhm2ExperimentReadyTheoryFormalCandidate({
      workspaceRoot: fixture.root,
      candidateManifestPath: fixture.candidatePath,
      formalRunSpecPath: fixture.specPath,
    });
    const passEvidence = JSON.parse(
      await fs.readFile(fixture.evidencePath, "utf8"),
    ) as Record<string, unknown>;
    const failEvidence = clone(passEvidence) as {
      status: "pass" | "fail";
      checks: Array<{
        status: "pass" | "fail";
        blockers: string[];
      }>;
      blockers: string[];
      formalClaim: {
        theoremResult: "proved" | "not_certified";
        nativeAxiomAudit: "no_axioms" | "not_certified";
      };
      claimBoundary: { physicalViabilityEstablished: boolean };
    };
    failEvidence.checks[0].status = "fail";
    failEvidence.checks[0].blockers = ["formal_outer_test_failure"];
    failEvidence.blockers = ["formal_outer_test_failure"];
    failEvidence.status = "fail";
    failEvidence.formalClaim.theoremResult = "not_certified";
    failEvidence.formalClaim.nativeAxiomAudit = "not_certified";
    expect(isExactNhm2FormalOuterObservationEvidenceV2(failEvidence)).toBe(
      true,
    );

    failEvidence.claimBoundary.physicalViabilityEstablished = true;
    expect(isExactNhm2FormalOuterObservationEvidenceV2(failEvidence)).toBe(
      false,
    );
  });

  it("enforces bounded canonical inputs before invoking the formal wrapper", async () => {
    const fixture = await makeFixture();
    await expect(
      runNhm2ExperimentReadyTheoryFormalCandidate({
        workspaceRoot: fixture.root,
        candidateManifestPath: fixture.candidatePath,
        formalRunSpecPath: fixture.specPath,
        resourceLimits: { maxCandidateManifestBytes: 1 },
      }),
    ).rejects.toMatchObject({ code: "resource_limit_exceeded" });
    expect(runFormalWrapperMock).not.toHaveBeenCalled();

    await expect(
      runNhm2ExperimentReadyTheoryFormalCandidate({
        workspaceRoot: fixture.root,
        candidateManifestPath: fixture.candidatePath,
        formalRunSpecPath: fixture.specPath,
        resourceLimits: { maxEvidenceBytes: Number.MAX_SAFE_INTEGER },
      }),
    ).rejects.toMatchObject({ code: "resource_limits_invalid" });
    expect(runFormalWrapperMock).not.toHaveBeenCalled();

    const candidateAbsolutePath = path.join(
      fixture.root,
      ...fixture.candidatePath.split("/"),
    );
    const candidate = JSON.parse(
      await fs.readFile(candidateAbsolutePath, "utf8"),
    ) as unknown;
    await fs.writeFile(candidateAbsolutePath, JSON.stringify(candidate));
    await expect(
      runNhm2ExperimentReadyTheoryFormalCandidate({
        workspaceRoot: fixture.root,
        candidateManifestPath: fixture.candidatePath,
        formalRunSpecPath: fixture.specPath,
      }),
    ).rejects.toMatchObject({ code: "canonical_json_invalid" });
    expect(runFormalWrapperMock).not.toHaveBeenCalled();
  });

  it("requires exactly one value for each governed CLI binding", () => {
    expect(
      parseNhm2ExperimentReadyTheoryFormalCandidateCliArgs([
        "--candidate-manifest",
        "candidate.json",
        "--formal-run-spec",
        "formal-run-spec.json",
      ]),
    ).toEqual({
      candidateManifestPath: "candidate.json",
      formalRunSpecPath: "formal-run-spec.json",
    });
    expect(() =>
      parseNhm2ExperimentReadyTheoryFormalCandidateCliArgs([
        "--candidate-manifest",
        "candidate.json",
      ]),
    ).toThrow("--formal-run-spec is required");
    expect(() =>
      parseNhm2ExperimentReadyTheoryFormalCandidateCliArgs([
        "--candidate-manifest",
        "candidate.json",
        "--candidate-manifest",
        "other.json",
        "--formal-run-spec",
        "formal-run-spec.json",
      ]),
    ).toThrow("--candidate-manifest may be supplied only once");
  });
});
