import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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
  type Nhm2ExperimentReadyTheoryCandidateHashedBindingV1,
} from "../shared/contracts/nhm2-experiment-ready-theory-candidate-manifest.v1";
import { NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_CONTRACT_VERSIONS } from "../shared/contracts/nhm2-experiment-ready-theory-closure.v1";
import {
  NHM2_FORMAL_KERNEL_AXIOM_TRANSCRIPT_MARKER,
  NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
  NHM2_FORMAL_KERNEL_THEOREM_TRANSCRIPT_MARKER,
  Nhm2FormalKernelExecutorError,
  computeNhm2FormalKernelLedgerSha256,
  type Nhm2FormalKernelExecutableBindingV1,
  type Nhm2FormalKernelLedgerEntryV1,
  type Nhm2FormalKernelLedgerKind,
  type Nhm2FormalKernelSealedLedgerV1,
} from "../server/services/theory/nhm2-formal-kernel-executor";
import {
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_OUTER_FILENAME,
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_ARTIFACT_ID,
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_CONTRACT_VERSION,
  Nhm2ExperimentReadyTheoryFormalWrapperError,
  isNhm2ExperimentReadyTheoryFormalCliEntrypoint,
  parseNhm2ExperimentReadyTheoryFormalCliArgs,
  runNhm2ExperimentReadyTheoryFormal,
  type Nhm2ExperimentReadyTheoryFormalClaimBoundaryV1,
  type Nhm2ExperimentReadyTheoryFormalRunSpecV1,
  type Nhm2ExperimentReadyTheoryFormalSourceRoleV1,
} from "../tools/nhm2/run-experiment-ready-theory-formal";

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const compareUtf8 = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

let suiteRoot: string;
let toolchainRoot: string;
let leanFixtureExecutable: string;
let lakeFixtureExecutable: string;
let runtimeDependencyPath: string;
let leanExecutableBinding: Nhm2FormalKernelExecutableBindingV1;
let lakeExecutableBinding: Nhm2FormalKernelExecutableBindingV1;
let toolchainLedger: Nhm2FormalKernelSealedLedgerV1;
const caseRoots: string[] = [];

async function sealLedger(input: {
  kind: Nhm2FormalKernelLedgerKind;
  rootPath: string;
  relativePaths: string[];
}): Promise<Nhm2FormalKernelSealedLedgerV1> {
  const entries: Nhm2FormalKernelLedgerEntryV1[] = [];
  for (const relativePath of [...input.relativePaths].sort(compareUtf8)) {
    const bytes = await fs.readFile(
      path.join(input.rootPath, ...relativePath.split("/")),
    );
    entries.push({
      relativePath,
      sha256: sha256(bytes),
      sizeBytes: bytes.byteLength,
    });
  }
  return {
    kind: input.kind,
    rootPath: input.rootPath,
    entries,
    ledgerSha256: computeNhm2FormalKernelLedgerSha256({
      kind: input.kind,
      entries,
    }),
  };
}

beforeAll(async () => {
  suiteRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nhm2-formal-wrapper-suite-"),
  );
  toolchainRoot = path.join(suiteRoot, "sealed-toolchain");
  await fs.mkdir(toolchainRoot);
  leanFixtureExecutable = path.join(
    toolchainRoot,
    process.platform === "win32" ? "lean-fixture.exe" : "lean-fixture",
  );
  lakeFixtureExecutable = path.join(
    toolchainRoot,
    process.platform === "win32" ? "lake-fixture.exe" : "lake-fixture",
  );
  await fs.copyFile(process.execPath, leanFixtureExecutable);
  await fs.copyFile(process.execPath, lakeFixtureExecutable);
  await fs.appendFile(
    lakeFixtureExecutable,
    Buffer.from("\nNHM2_LAKE_FIXTURE_ROLE\n", "utf8"),
  );
  runtimeDependencyPath = path.join(toolchainRoot, "lean-runtime-fixture.dll");
  await fs.writeFile(
    runtimeDependencyPath,
    Buffer.from("sealed-runtime-dependency", "utf8"),
  );
  if (process.platform !== "win32") {
    await fs.chmod(leanFixtureExecutable, 0o755);
    await fs.chmod(lakeFixtureExecutable, 0o755);
  }
  toolchainLedger = await sealLedger({
    kind: "toolchain",
    rootPath: toolchainRoot,
    relativePaths: [
      path.basename(leanFixtureExecutable),
      path.basename(lakeFixtureExecutable),
      path.basename(runtimeDependencyPath),
    ],
  });
  const executableByName = new Map(
    toolchainLedger.entries.map((entry) => [entry.relativePath, entry]),
  );
  const leanExecutable = executableByName.get(
    path.basename(leanFixtureExecutable),
  );
  const lakeExecutable = executableByName.get(
    path.basename(lakeFixtureExecutable),
  );
  if (leanExecutable == null || lakeExecutable == null) {
    throw new Error("fixture toolchain binding missing");
  }
  leanExecutableBinding = {
    absolutePath: leanFixtureExecutable,
    sha256: leanExecutable.sha256,
    sizeBytes: leanExecutable.sizeBytes,
  };
  lakeExecutableBinding = {
    absolutePath: lakeFixtureExecutable,
    sha256: lakeExecutable.sha256,
    sizeBytes: lakeExecutable.sizeBytes,
  };
}, 30_000);

afterEach(async () => {
  for (const root of caseRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

afterAll(async () => {
  if (suiteRoot != null) {
    await fs.rm(suiteRoot, { recursive: true, force: true });
  }
}, 30_000);

const relativeToSuite = (absolutePath: string): string =>
  path.relative(suiteRoot, absolutePath).split(path.sep).join("/");

const sourceRoleFor = (
  relativePath: string,
): Nhm2ExperimentReadyTheoryFormalSourceRoleV1 => {
  const roles: Record<string, Nhm2ExperimentReadyTheoryFormalSourceRoleV1> = {
    "lakefile.lean": "lakefile",
    "lean-toolchain": "lean_toolchain",
    "NHM2Formal.lean": "root_module",
    "NHM2Formal/ClaimBoundary.lean": "claim_boundary",
    "NHM2Formal/ExperimentReadyClaimLocks.lean": "experiment_ready_claim_locks",
    "NHM2Formal/ExperimentReadyReplayDriver.lean": "replay_driver",
  };
  const role = roles[relativePath];
  if (role == null) throw new Error(`unassigned formal source ${relativePath}`);
  return role;
};

const writeCanonical = async (
  absolutePath: string,
  value: unknown,
): Promise<{ path: string; sha256: string; sizeBytes: number }> => {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, bytes);
  return {
    path: relativeToSuite(absolutePath),
    sha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
  };
};

const writePrettyCandidate = async (
  absolutePath: string,
  value: unknown,
): Promise<{ path: string; sha256: string; sizeBytes: number }> => {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, bytes);
  return {
    path: relativeToSuite(absolutePath),
    sha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
  };
};

const claimBoundary = (): Nhm2ExperimentReadyTheoryFormalClaimBoundaryV1 => ({
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
});

const binding = (
  artifactId: string,
  contractVersion: string,
  written: { path: string; sha256: string },
): Nhm2ExperimentReadyTheoryCandidateHashedBindingV1 => ({
  artifactId,
  contractVersion,
  path: written.path,
  sha256: written.sha256,
});

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
}) => [
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
];

type FixtureMode = "success" | "nonzero" | "mutate-input";

type Fixture = {
  root: string;
  sourceRoot: string;
  candidatePath: string;
  specPath: string;
  outputRoot: string;
  spec: Nhm2ExperimentReadyTheoryFormalRunSpecV1;
};

async function fixture(mode: FixtureMode): Promise<Fixture> {
  const caseRoot = await fs.mkdtemp(path.join(suiteRoot, "case-"));
  caseRoots.push(caseRoot);
  const inputRoot = path.join(caseRoot, "sealed-input");
  const sourceRoot = path.join(caseRoot, "server-owned-formal-project");
  await fs.mkdir(inputRoot);
  await fs.mkdir(path.join(sourceRoot, "NHM2Formal"), { recursive: true });

  const outerWrapperPath = path.join(
    inputRoot,
    "run-experiment-ready-theory-formal.ts",
  );
  const outerWrapperBytes = Buffer.from(
    'export const runtimeRole = "outer-formal-orchestrator" as const;\n',
    "utf8",
  );
  await fs.writeFile(outerWrapperPath, outerWrapperBytes);

  const replayDriverPath = path.join(
    sourceRoot,
    "NHM2Formal",
    "ExperimentReadyReplayDriver.lean",
  );
  await fs.writeFile(
    replayDriverPath,
    `
// theorem nhm2_pre_experimental_claim_locks
// #print axioms nhm2_pre_experimental_claim_locks
const fs = require("node:fs");
const path = require("node:path");
const configPath = process.env.NHM2_FIXTURE_CONFIG_PATH;
const mutableInputPath = process.env.NHM2_FIXTURE_MUTABLE_INPUT_PATH;
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
fs.writeFileSync(path.join(process.cwd(), "proof.olean"), "deterministic-formal-proof", "utf8");
fs.writeSync(1, ${JSON.stringify(`${NHM2_FORMAL_KERNEL_THEOREM_TRANSCRIPT_MARKER}\n`)});
fs.writeSync(1, ${JSON.stringify(`${NHM2_FORMAL_KERNEL_AXIOM_TRANSCRIPT_MARKER}\n`)});
if (config.mode === "mutate-input") fs.appendFileSync(mutableInputPath, "mutated", "utf8");
process.exit(config.mode === "nonzero" ? 9 : 0);
`,
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "lakefile.lean"),
    "import Lake\nopen Lake DSL\npackage nhm2_formal\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "lean-toolchain"),
    "leanprover/lean4:v4.19.0\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "NHM2Formal.lean"),
    "import NHM2Formal.ExperimentReadyClaimLocks\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "NHM2Formal", "ClaimBoundary.lean"),
    "namespace NHM2Formal\ndef claimLocksClosed : Prop := True\nend NHM2Formal\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "NHM2Formal", "ExperimentReadyClaimLocks.lean"),
    "import NHM2Formal.ClaimBoundary\ntheorem nhm2_pre_experimental_claim_locks : True := by trivial\n",
    "utf8",
  );
  const formalSourceRelativePaths = [
    "lakefile.lean",
    "lean-toolchain",
    "NHM2Formal.lean",
    "NHM2Formal/ClaimBoundary.lean",
    "NHM2Formal/ExperimentReadyClaimLocks.lean",
    "NHM2Formal/ExperimentReadyReplayDriver.lean",
  ];
  const sourceLedger = await sealLedger({
    kind: "source",
    rootPath: sourceRoot,
    relativePaths: formalSourceRelativePaths,
  });
  const solverBinding = {
    artifactId: "nhm2.formal_runtime_wrapper",
    contractVersion: "nhm2_formal_runtime_wrapper/v1",
    path: relativeToSuite(outerWrapperPath),
    sha256: sha256(outerWrapperBytes),
    solverId: "nhm2-formal-runtime-wrapper",
    solverVersion: "1.0.0",
    implementationId: "casimirbot-pinned-formal-wrapper-v1",
  };

  const candidateDefinition = await writeCanonical(
    path.join(inputRoot, "candidate-definition.json"),
    { artifactId: "nhm2.fresh_candidate_definition", mode },
  );
  const profile = await writeCanonical(path.join(inputRoot, "profile.json"), {
    artifactId: "nhm2.fresh_profile",
    selectedProfileId: "nhm2-fresh-profile-001",
  });
  const chart = await writeCanonical(path.join(inputRoot, "chart.json"), {
    artifactId: "nhm2.fresh_chart",
    chartId: "nhm2-asymptotic-cartesian-001",
  });
  const atlas = await writeCanonical(path.join(inputRoot, "atlas.json"), {
    artifactId: "nhm2.fresh_atlas",
    atlasId: "nhm2-fresh-atlas-001",
  });
  const units = await writeCanonical(path.join(inputRoot, "units.json"), {
    artifactId: "nhm2.fresh_units",
    unitsId: "nhm2-si-units-001",
  });
  const normalization = await writeCanonical(
    path.join(inputRoot, "normalization.json"),
    {
      artifactId: "nhm2.fresh_normalization",
      normalizationId: "nhm2-normalization-001",
    },
  );
  const environmentLock = await writeCanonical(
    path.join(inputRoot, "formal-environment.json"),
    { artifactId: "nhm2.formal_environment", runtime: "pinned-node-fixture" },
  );
  const policyArtifact =
    buildNhm2ExperimentReadyTheoryCandidateNumericPolicySetArtifact(
      "nhm2-fresh-authoritative-policy-001",
    );
  const policy = await writeCanonical(
    path.join(inputRoot, "numeric-policy.json"),
    policyArtifact,
  );

  const candidateId = "nhm2-fresh-theory-candidate-001";
  const bindings: Nhm2ExperimentReadyTheoryCandidateBindingsV1 = {
    candidate: {
      ...binding(
        "nhm2.fresh_candidate_definition",
        "nhm2_fresh_candidate_definition/v1",
        candidateDefinition,
      ),
      candidateId,
    },
    profile: {
      ...binding("nhm2.fresh_profile", "nhm2_fresh_profile/v1", profile),
      selectedProfileId: "nhm2-fresh-profile-001",
    },
    chart: {
      ...binding("nhm2.fresh_chart", "nhm2_fresh_chart/v1", chart),
      chartId: "nhm2-asymptotic-cartesian-001",
    },
    atlas: {
      ...binding("nhm2.fresh_atlas", "nhm2_fresh_atlas/v1", atlas),
      atlasId: "nhm2-fresh-atlas-001",
    },
    units: {
      ...binding("nhm2.fresh_units", "nhm2_fresh_units/v1", units),
      unitsId: "nhm2-si-units-001",
    },
    normalization: {
      ...binding(
        "nhm2.fresh_normalization",
        "nhm2_fresh_normalization/v1",
        normalization,
      ),
      normalizationId: "nhm2-normalization-001",
    },
  };

  const formalRunId = "nhm2-formal_kernel-run-001";
  const outputDirectory = `${relativeToSuite(caseRoot)}/runs/${formalRunId}`;
  const candidateManifestPath = relativeToSuite(
    path.join(inputRoot, "candidate-manifest.json"),
  );
  const plans =
    NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_MANIFEST_EXECUTION_PLAN_ROLES.map(
      (planRole, index): Nhm2ExperimentReadyTheoryCandidateExecutionPlanV1 => {
        const requestId = `nhm2-${planRole}-request-001`;
        const runId = `nhm2-${planRole}-run-001`;
        const runtimeId = `nhm2.experiment_ready.${planRole}`;
        const receiptId = nhm2ExperimentReadyTheoryCandidateReceiptIdForRequest(
          runtimeId,
          requestId,
        );
        const roleOutput =
          planRole === "formal_kernel"
            ? outputDirectory
            : `${relativeToSuite(caseRoot)}/${planRole}-unused-output`;
        const formalInvocation =
          planRole === "formal_kernel"
            ? nhm2ExperimentReadyTheoryFormalInvocation({
                candidateManifestPath,
                outputDirectory: roleOutput,
                runId,
              })
            : null;
        return {
          planRole,
          requestId,
          runId,
          receiptId,
          runtimeId,
          sourceCommitSha:
            planRole === "formal_kernel"
              ? "c".repeat(40)
              : String(index + 1).repeat(40),
          deterministicSeedPolicy: `sealed-seed-${planRole}`,
          solver:
            planRole === "formal_kernel"
              ? solverBinding
              : {
                  artifactId: `nhm2.${planRole}_solver`,
                  contractVersion: `nhm2_${planRole}_solver/v1`,
                  path: `${relativeToSuite(caseRoot)}/unused-${planRole}-solver.json`,
                  sha256: String(index + 4).repeat(64),
                  solverId: `nhm2-${planRole}-solver`,
                  solverVersion: "1.0.0",
                  implementationId: `unused-${planRole}-implementation-v1`,
                },
          environmentLock:
            planRole === "formal_kernel"
              ? {
                  artifactId: "nhm2.formal_environment",
                  contractVersion: "nhm2_formal_environment/v1",
                  path: environmentLock.path,
                  sha256: environmentLock.sha256,
                  environmentId: "nhm2-formal-environment-001",
                }
              : {
                  artifactId: `nhm2.${planRole}_environment`,
                  contractVersion: `nhm2_${planRole}_environment/v1`,
                  path: `${relativeToSuite(caseRoot)}/unused-${planRole}-environment.json`,
                  sha256: String(index + 7).repeat(64),
                  environmentId: `nhm2-${planRole}-environment-001`,
                },
          expectedInvocation: {
            entrypoint:
              formalInvocation?.entrypoint ?? `nhm2-${planRole}-entrypoint`,
            command: formalInvocation?.command ?? "node",
            args: formalInvocation?.args ?? [`run-${planRole}`],
            cwd: formalInvocation?.cwd ?? ".",
            environment: invocationEnvironment({
              bindings,
              candidateId,
              outputDirectory: roleOutput,
              requestId,
              runId,
              receiptId,
              runtimeId,
            }),
            outputDirectory: roleOutput,
          },
        };
      },
    );
  const candidate = buildNhm2ExperimentReadyTheoryCandidateManifest({
    generatedAt: "2099-07-19T09:59:00.000Z",
    frozenAt: "2099-07-19T10:00:00.000Z",
    manifestId: "nhm2-fresh-theory-candidate-manifest-001",
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
      semanticSha256: "e".repeat(64),
      frozenAt: "2099-07-19T09:58:00.000Z",
    },
    numericCheckPolicySet: {
      artifactId:
        NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_NUMERIC_POLICY_SET_ARTIFACT_ID,
      contractVersion:
        NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_NUMERIC_POLICY_SET_CONTRACT_VERSION,
      policySetId: policyArtifact.policySetId,
      artifactPath: policy.path,
      artifactRawSha256: policy.sha256,
      semanticSha256: policyArtifact.semanticSha256,
    },
    supersession: {
      policyId: "nhm2-fresh-candidate-supersession-001",
      policyPath: `${relativeToSuite(caseRoot)}/supersession-policy.json`,
      policyContractVersion: "nhm2_theory_candidate_supersession/v1",
      policySha256: "f".repeat(64),
      originalManifestImmutable: true,
      inPlaceMutationForbidden: true,
      supersedingManifestRequiresNewManifestId: true,
      supersedingManifestRequiresPredecessorSha256: true,
      predecessorManifestId: null,
      predecessorManifestSha256: null,
    },
  });
  const candidateWritten = await writePrettyCandidate(
    path.join(inputRoot, "candidate-manifest.json"),
    candidate,
  );
  const inputFiles = [
    "candidate-definition.json",
    "profile.json",
    "chart.json",
    "atlas.json",
    "units.json",
    "normalization.json",
    "formal-environment.json",
    "numeric-policy.json",
    "candidate-manifest.json",
    "run-experiment-ready-theory-formal.ts",
  ];
  const sealedInputRoot = path.join(caseRoot, "sealed-input-staging");
  const sealedInputRelativePaths: string[] = [];
  for (const fileName of inputFiles) {
    const sourcePath = path.join(inputRoot, fileName);
    const relativePath = relativeToSuite(sourcePath);
    const destinationPath = path.join(
      sealedInputRoot,
      ...relativePath.split("/"),
    );
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
    sealedInputRelativePaths.push(relativePath);
  }
  const inputLedger = await sealLedger({
    kind: "input",
    rootPath: sealedInputRoot,
    relativePaths: sealedInputRelativePaths,
  });
  const formalPlan = plans.find((entry) => entry.planRole === "formal_kernel");
  if (formalPlan == null) throw new Error("formal plan missing");
  const outputRoot = path.resolve(
    suiteRoot,
    formalPlan.expectedInvocation.outputDirectory,
  );
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  const formalSourceBindings = sourceLedger.entries.map((entry) => ({
    sourceRole: sourceRoleFor(entry.relativePath),
    path: relativeToSuite(
      path.join(sourceRoot, ...entry.relativePath.split("/")),
    ),
    sha256: entry.sha256,
    sizeBytes: entry.sizeBytes,
  }));
  const toolchainBindings = toolchainLedger.entries.map((entry) => ({
    toolchainRole:
      entry.relativePath === path.basename(leanFixtureExecutable)
        ? ("lean_executable" as const)
        : entry.relativePath === path.basename(lakeFixtureExecutable)
          ? ("lake_executable" as const)
          : ("runtime_dependency" as const),
    path: relativeToSuite(
      path.join(toolchainRoot, ...entry.relativePath.split("/")),
    ),
    sha256: entry.sha256,
    sizeBytes: entry.sizeBytes,
  }));
  const spec: Nhm2ExperimentReadyTheoryFormalRunSpecV1 = {
    artifactId: NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_ARTIFACT_ID,
    contractVersion:
      NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_CONTRACT_VERSION,
    generatedAt: "2099-07-19T10:01:00.000Z",
    sealedAt: "2099-07-19T10:02:00.000Z",
    identity: {
      candidateId,
      candidateManifestId: candidate.manifestId,
      candidateManifestSha256: candidateWritten.sha256,
      candidateFrozenAt: candidate.frozenAt,
      requestId: formalPlan.requestId,
      runId: formalPlan.runId,
      receiptId: formalPlan.receiptId,
      runtimeId: formalPlan.runtimeId,
      sourceCommitSha: formalPlan.sourceCommitSha,
    },
    planBinding: formalPlan,
    theoremName: NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
    formalSourceBindings: {
      authority: "server_owned_formal_project",
      projectRoot: sourceRoot,
      entries: formalSourceBindings,
    },
    toolchainBindings: {
      authority: "sealed_lean_toolchain",
      toolchainRoot,
      entries: toolchainBindings,
    },
    executor: {
      theoremName: NHM2_FORMAL_KERNEL_REQUIRED_THEOREM_NAME,
      executableRole: "lean",
      executables: {
        lean: { ...leanExecutableBinding },
        lake: { ...lakeExecutableBinding },
      },
      ledgers: {
        source: sourceLedger,
        toolchain: {
          ...toolchainLedger,
          entries: toolchainLedger.entries.map((entry) => ({ ...entry })),
        },
        input: inputLedger,
      },
      outputRoot,
      replayWorkdirs: [
        path.join(outputRoot, "replay-one"),
        path.join(outputRoot, "replay-two"),
      ],
      environmentAllowlist: [
        "NHM2_FIXTURE_CONFIG_PATH",
        "NHM2_FIXTURE_MUTABLE_INPUT_PATH",
      ],
      environment: {
        NHM2_FIXTURE_CONFIG_PATH: path.join(
          sealedInputRoot,
          ...relativeToSuite(
            path.join(inputRoot, "candidate-definition.json"),
          ).split("/"),
        ),
        NHM2_FIXTURE_MUTABLE_INPUT_PATH: path.join(
          sealedInputRoot,
          ...relativeToSuite(
            path.join(inputRoot, "formal-environment.json"),
          ).split("/"),
        ),
      },
      executableArguments: [replayDriverPath, "-o", "proof.olean"],
      expectedOutputPaths: ["proof.olean"],
      timeoutMs: 10_000,
      maxCapturedOutputBytes: 64 * 1024,
    },
    outerArtifactPath: `${formalPlan.expectedInvocation.outputDirectory}/${NHM2_EXPERIMENT_READY_THEORY_FORMAL_OUTER_FILENAME}`,
    claimBoundary: claimBoundary(),
  };
  const specWritten = await writeCanonical(
    path.resolve(
      suiteRoot,
      ...nhm2ExperimentReadyTheoryFormalRunSpecPath({
        outputDirectory: formalPlan.expectedInvocation.outputDirectory,
        runId: formalPlan.runId,
      }).split("/"),
    ),
    spec,
  );
  return {
    root: caseRoot,
    sourceRoot,
    candidatePath: candidateWritten.path,
    specPath: specWritten.path,
    outputRoot,
    spec,
  };
}

const expectWrapperFailure = async (
  promise: Promise<unknown>,
  code: string,
): Promise<Nhm2ExperimentReadyTheoryFormalWrapperError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Nhm2ExperimentReadyTheoryFormalWrapperError);
    expect((error as Nhm2ExperimentReadyTheoryFormalWrapperError).code).toBe(
      code,
    );
    return error as Nhm2ExperimentReadyTheoryFormalWrapperError;
  }
  throw new Error(`Expected wrapper failure ${code}`);
};

const expectExecutorFailure = async (
  promise: Promise<unknown>,
  code: string,
): Promise<Nhm2FormalKernelExecutorError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Nhm2FormalKernelExecutorError);
    expect((error as Nhm2FormalKernelExecutorError).code).toBe(code);
    return error as Nhm2FormalKernelExecutorError;
  }
  throw new Error(`Expected executor failure ${code}`);
};

describe.sequential("NHM2 experiment-ready formal runtime wrapper", () => {
  it("runs two sealed replays and atomically publishes only outer-observed formal execution evidence", async () => {
    const value = await fixture("success");
    const result = await runNhm2ExperimentReadyTheoryFormal({
      workspaceRoot: suiteRoot,
      candidateManifestPath: value.candidatePath,
      formalRunSpecPath: value.specPath,
    });

    expect(result.observation.replays).toHaveLength(2);
    expect(result.observation.executableRole).toBe("lean");
    expect(
      result.observation.replays.map((entry) => entry.process.executableRole),
    ).toEqual(["lean", "lean"]);
    expect(value.spec.toolchainBindings.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolchainRole: "runtime_dependency" }),
      ]),
    );
    expect(result.observation.preRunLedgers.toolchain.entryCount).toBe(3);
    const driver = value.spec.formalSourceBindings.entries.find(
      (entry) => entry.sourceRole === "replay_driver",
    );
    expect(driver).toBeDefined();
    expect(value.spec.executor.executableArguments).toEqual([
      path.resolve(suiteRoot, driver?.path ?? "missing-driver"),
      "-o",
      "proof.olean",
    ]);
    expect(value.spec.executor.executableArguments).not.toContain(
      path.resolve(suiteRoot, value.spec.planBinding.solver.path),
    );
    expect(
      result.observation.replays.map((entry) => entry.process.exitCode),
    ).toEqual([0, 0]);
    expect(result.finalOutputInventory.map((entry) => entry.path)).toEqual([
      NHM2_EXPERIMENT_READY_THEORY_FORMAL_OUTER_FILENAME,
      "replay-one/proof.olean",
      "replay-two/proof.olean",
    ]);
    const artifactBytes = await fs.readFile(
      path.join(suiteRoot, ...result.executionArtifactPath.split("/")),
    );
    expect(sha256(artifactBytes)).toBe(result.executionArtifactSha256);
    expect(JSON.stringify(JSON.parse(artifactBytes.toString("utf8")))).toBe(
      artifactBytes.toString("utf8"),
    );
    expect(result.claimBoundary).toMatchObject({
      numericalPhysicsValidated: false,
      empiricalValidationEstablished: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
      routeEtaClaimAllowed: false,
      speedAuthorityClaimAllowed: false,
    });
    expect(artifactBytes.toString("utf8")).not.toContain(
      "nhm2_lean_campaign_certificate",
    );
  });

  it("rejects fake candidate bytes and an identity-mismatched run spec", async () => {
    const fake = await fixture("success");
    const fakeCandidate = await writePrettyCandidate(
      path.join(fake.root, "fake-candidate.json"),
      { artifactId: "fake-candidate" },
    );
    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: fakeCandidate.path,
        formalRunSpecPath: fake.specPath,
      }),
      "candidate_manifest_invalid",
    );

    const mismatch = await fixture("success");
    mismatch.spec.identity.candidateManifestSha256 = "d".repeat(64);
    await writeCanonical(
      path.join(suiteRoot, ...mismatch.specPath.split("/")),
      mismatch.spec,
    );
    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: mismatch.candidatePath,
        formalRunSpecPath: mismatch.specPath,
      }),
      "formal_spec_binding_mismatch",
    );
  });

  it("rejects candidate/spec path escape and mismatched candidate identity", async () => {
    const value = await fixture("success");
    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: "../outside-candidate.json",
        formalRunSpecPath: value.specPath,
      }),
      "path_escape",
    );

    value.spec.identity.candidateId = "nhm2-alpha07-historical-candidate";
    await writeCanonical(
      path.join(suiteRoot, ...value.specPath.split("/")),
      value.spec,
    );
    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        formalRunSpecPath: value.specPath,
      }),
      "formal_spec_binding_mismatch",
    );
  });

  it("rejects any opened physical claim lock before execution", async () => {
    const value = await fixture("success");
    (
      value.spec.claimBoundary as {
        physicalViabilityClaimAllowed: boolean;
      }
    ).physicalViabilityClaimAllowed = true;
    await writeCanonical(
      path.join(suiteRoot, ...value.specPath.split("/")),
      value.spec,
    );

    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        formalRunSpecPath: value.specPath,
      }),
      "formal_run_spec_invalid",
    );
    await expect(
      fs.lstat(
        path.join(
          value.outputRoot,
          NHM2_EXPERIMENT_READY_THEORY_FORMAL_OUTER_FILENAME,
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a toolchain that aliases the Lean and Lake roles", async () => {
    const value = await fixture("success");
    value.spec.executor.executables.lake = {
      ...value.spec.executor.executables.lean,
    };
    await writeCanonical(
      path.join(suiteRoot, ...value.specPath.split("/")),
      value.spec,
    );

    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        formalRunSpecPath: value.specPath,
      }),
      "formal_toolchain_role_alias",
    );
  });

  it("rejects the outer TypeScript wrapper when substituted for the sealed Lean driver", async () => {
    const value = await fixture("success");
    value.spec.executor.executableArguments[0] = path.resolve(
      suiteRoot,
      value.spec.planBinding.solver.path,
    );
    await writeCanonical(
      path.join(suiteRoot, ...value.specPath.split("/")),
      value.spec,
    );

    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        formalRunSpecPath: value.specPath,
      }),
      "formal_invocation_mismatch",
    );
  });

  it("rejects Lake as proof authority for the standalone replay", async () => {
    const value = await fixture("success");
    value.spec.executor.executableRole = "lake";
    await writeCanonical(
      path.join(suiteRoot, ...value.specPath.split("/")),
      value.spec,
    );

    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        formalRunSpecPath: value.specPath,
      }),
      "formal_invocation_mismatch",
    );
  });

  it("rejects a sealed replay driver containing a project import", async () => {
    const value = await fixture("success");
    const sourceEntry = value.spec.executor.ledgers.source.entries.find(
      (entry) =>
        entry.relativePath.endsWith("ExperimentReadyReplayDriver.lean"),
    );
    const sourceBinding = value.spec.formalSourceBindings.entries.find(
      (entry) => entry.sourceRole === "replay_driver",
    );
    if (sourceEntry == null || sourceBinding == null) {
      throw new Error("replay driver binding missing");
    }
    const driverPath = path.resolve(suiteRoot, sourceBinding.path);
    await fs.appendFile(
      driverPath,
      "\nimport NHM2Formal.ExperimentReadyClaimLocks\n",
    );
    const driverBytes = await fs.readFile(driverPath);
    sourceEntry.sha256 = sha256(driverBytes);
    sourceEntry.sizeBytes = driverBytes.byteLength;
    sourceBinding.sha256 = sourceEntry.sha256;
    sourceBinding.sizeBytes = sourceEntry.sizeBytes;
    value.spec.executor.ledgers.source.ledgerSha256 =
      computeNhm2FormalKernelLedgerSha256({
        kind: "source",
        entries: value.spec.executor.ledgers.source.entries,
      });
    await writeCanonical(
      path.join(suiteRoot, ...value.specPath.split("/")),
      value.spec,
    );

    await expectWrapperFailure(
      runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        formalRunSpecPath: value.specPath,
      }),
      "formal_driver_not_standalone",
    );
  });

  it.each(["missing", "extra"] as const)(
    "rejects a %s file in the exact server-owned formal source closure",
    async (variant) => {
      const value = await fixture("success");
      if (variant === "missing") {
        await fs.rm(
          path.join(value.sourceRoot, "NHM2Formal", "ClaimBoundary.lean"),
        );
      } else {
        await fs.writeFile(
          path.join(value.sourceRoot, "NHM2Formal", "UndeclaredSource.lean"),
          "theorem undeclared_source : True := by trivial\n",
          "utf8",
        );
      }
      await expectExecutorFailure(
        runNhm2ExperimentReadyTheoryFormal({
          workspaceRoot: suiteRoot,
          candidateManifestPath: value.candidatePath,
          formalRunSpecPath: value.specPath,
        }),
        "ledger_inventory_mismatch",
      );
    },
  );

  it("rejects an undeclared toolchain dependency", async () => {
    const value = await fixture("success");
    const undeclared = path.join(toolchainRoot, "undeclared-runtime.dll");
    await fs.writeFile(undeclared, "undeclared", "utf8");
    try {
      await expectExecutorFailure(
        runNhm2ExperimentReadyTheoryFormal({
          workspaceRoot: suiteRoot,
          candidateManifestPath: value.candidatePath,
          formalRunSpecPath: value.specPath,
        }),
        "ledger_inventory_mismatch",
      );
    } finally {
      await fs.rm(undeclared, { force: true });
    }
  });

  it("accepts a declared zero-byte runtime dependency in the exact toolchain closure", async () => {
    const value = await fixture("success");
    const relativePath = "zero-byte-runtime-marker.h";
    const zeroPath = path.join(toolchainRoot, relativePath);
    const emptySha256 = sha256(Buffer.alloc(0));
    const originalEntries = toolchainLedger.entries.map((entry) => ({
      ...entry,
    }));
    const originalLedgerSha256 = toolchainLedger.ledgerSha256;
    await fs.writeFile(zeroPath, Buffer.alloc(0));
    try {
      value.spec.executor.ledgers.toolchain.entries.push({
        relativePath,
        sha256: emptySha256,
        sizeBytes: 0,
      });
      value.spec.executor.ledgers.toolchain.entries.sort((left, right) =>
        compareUtf8(left.relativePath, right.relativePath),
      );
      value.spec.executor.ledgers.toolchain.ledgerSha256 =
        computeNhm2FormalKernelLedgerSha256({
          kind: "toolchain",
          entries: value.spec.executor.ledgers.toolchain.entries,
        });
      value.spec.toolchainBindings.entries.push({
        toolchainRole: "runtime_dependency",
        path: relativeToSuite(zeroPath),
        sha256: emptySha256,
        sizeBytes: 0,
      });
      value.spec.toolchainBindings.entries.sort((left, right) =>
        compareUtf8(left.path, right.path),
      );
      await writeCanonical(
        path.join(suiteRoot, ...value.specPath.split("/")),
        value.spec,
      );

      const result = await runNhm2ExperimentReadyTheoryFormal({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        formalRunSpecPath: value.specPath,
      });
      expect(result.observation.preRunLedgers.toolchain.entries).toEqual(
        expect.arrayContaining([
          { relativePath, sha256: emptySha256, sizeBytes: 0 },
        ]),
      );
    } finally {
      await fs.rm(zeroPath, { force: true });
      toolchainLedger.entries = originalEntries;
      toolchainLedger.ledgerSha256 = originalLedgerSha256;
    }
  });

  it.each(["lean", "lake"] as const)(
    "rejects a zero-byte %s executable binding",
    async (role) => {
      const value = await fixture("success");
      const toolchainRole = `${role}_executable` as const;
      const binding = value.spec.toolchainBindings.entries.find(
        (entry) => entry.toolchainRole === toolchainRole,
      );
      const executable = value.spec.executor.executables[role];
      const ledgerEntry = value.spec.executor.ledgers.toolchain.entries.find(
        (entry) =>
          path.resolve(
            value.spec.executor.ledgers.toolchain.rootPath,
            ...entry.relativePath.split("/"),
          ) === executable.absolutePath,
      );
      if (binding == null || ledgerEntry == null) {
        throw new Error(`${role} fixture binding missing`);
      }
      const emptySha256 = sha256(Buffer.alloc(0));
      binding.sha256 = emptySha256;
      binding.sizeBytes = 0;
      executable.sha256 = emptySha256;
      executable.sizeBytes = 0;
      ledgerEntry.sha256 = emptySha256;
      ledgerEntry.sizeBytes = 0;
      value.spec.executor.ledgers.toolchain.ledgerSha256 =
        computeNhm2FormalKernelLedgerSha256({
          kind: "toolchain",
          entries: value.spec.executor.ledgers.toolchain.entries,
        });
      await writeCanonical(
        path.join(suiteRoot, ...value.specPath.split("/")),
        value.spec,
      );

      await expectWrapperFailure(
        runNhm2ExperimentReadyTheoryFormal({
          workspaceRoot: suiteRoot,
          candidateManifestPath: value.candidatePath,
          formalRunSpecPath: value.specPath,
        }),
        "formal_run_spec_invalid",
      );
    },
  );

  it("rejects missing bytes from a declared toolchain dependency", async () => {
    const value = await fixture("success");
    const dependencyBytes = await fs.readFile(runtimeDependencyPath);
    await fs.rm(runtimeDependencyPath);
    try {
      await expectExecutorFailure(
        runNhm2ExperimentReadyTheoryFormal({
          workspaceRoot: suiteRoot,
          candidateManifestPath: value.candidatePath,
          formalRunSpecPath: value.specPath,
        }),
        "ledger_inventory_mismatch",
      );
    } finally {
      await fs.writeFile(runtimeDependencyPath, dependencyBytes);
    }
  });

  it.each([
    ["nonzero", "replay_exit_nonzero"],
    ["mutate-input", "ledger_entry_hash_mismatch"],
  ] as const)(
    "propagates %s executor failure without publishing outer evidence",
    async (mode, expectedCode) => {
      const value = await fixture(mode);
      try {
        await runNhm2ExperimentReadyTheoryFormal({
          workspaceRoot: suiteRoot,
          candidateManifestPath: value.candidatePath,
          formalRunSpecPath: value.specPath,
        });
        throw new Error("expected executor failure");
      } catch (error) {
        expect(error).toBeInstanceOf(Nhm2FormalKernelExecutorError);
        expect((error as Nhm2FormalKernelExecutorError).code).toBe(
          expectedCode,
        );
      }
      await expect(
        fs.lstat(
          path.join(
            value.outputRoot,
            NHM2_EXPERIMENT_READY_THEORY_FORMAL_OUTER_FILENAME,
          ),
        ),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("parses both mandatory CLI bindings and rejects incomplete invocation", () => {
    expect(
      parseNhm2ExperimentReadyTheoryFormalCliArgs([
        "--candidate-manifest",
        "candidate.json",
        "--formal-run-spec",
        "formal-spec.json",
      ]),
    ).toEqual({
      candidateManifestPath: "candidate.json",
      formalRunSpecPath: "formal-spec.json",
    });
    expect(() =>
      parseNhm2ExperimentReadyTheoryFormalCliArgs([
        "--candidate-manifest",
        "candidate.json",
      ]),
    ).toThrow("--formal-run-spec is required");
  });

  it("does not run the formal CLI when the server bundle is the process entrypoint", () => {
    const sourceCli = path.join(
      os.tmpdir(),
      "tools",
      "nhm2",
      "run-experiment-ready-theory-formal.ts",
    );
    const serverBundle = path.join(os.tmpdir(), "dist", "index.js");

    expect(isNhm2ExperimentReadyTheoryFormalCliEntrypoint(sourceCli, sourceCli)).toBe(true);
    expect(isNhm2ExperimentReadyTheoryFormalCliEntrypoint(serverBundle, serverBundle)).toBe(false);
    expect(isNhm2ExperimentReadyTheoryFormalCliEntrypoint(undefined, sourceCli)).toBe(false);
  });
});

it("rejects a byte-identical run spec copied away from the plan-derived path", async () => {
  const value = await fixture("success");
  const alternateSpecPath = path.join(value.root, "alternate-formal-spec.json");
  await fs.copyFile(
    path.resolve(suiteRoot, ...value.specPath.split("/")),
    alternateSpecPath,
  );
  await expectWrapperFailure(
    runNhm2ExperimentReadyTheoryFormal({
      workspaceRoot: suiteRoot,
      candidateManifestPath: value.candidatePath,
      formalRunSpecPath: alternateSpecPath,
    }),
    "formal_run_spec_path_mismatch",
  );
});
