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
  nhm2ExperimentReadyTheoryCandidateReceiptIdForRequest,
  type Nhm2ExperimentReadyTheoryCandidateBindingsV1,
  type Nhm2ExperimentReadyTheoryCandidateEvidenceRole,
  type Nhm2ExperimentReadyTheoryCandidateExecutionPlanRole,
  type Nhm2ExperimentReadyTheoryCandidateExecutionPlanV1,
  type Nhm2ExperimentReadyTheoryCandidateHashedBindingV1,
} from "../shared/contracts/nhm2-experiment-ready-theory-candidate-manifest.v1";
import { NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_CONTRACT_VERSIONS } from "../shared/contracts/nhm2-experiment-ready-theory-closure.v1";
import { NHM2_FORMAL_KERNEL_THEOREM_TRANSCRIPT_MARKER } from "../server/services/theory/nhm2-formal-kernel-executor";
import {
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_FILENAME,
  Nhm2ExperimentReadyTheoryFormalPresealError,
  parseNhm2ExperimentReadyTheoryFormalPresealCliArgs,
  presealNhm2ExperimentReadyTheoryFormalRun,
} from "../tools/nhm2/preseal-experiment-ready-theory-formal-run";

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

let suiteRoot: string;
const caseRoots: string[] = [];

beforeAll(async () => {
  suiteRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nhm2-formal-preseal-suite-"),
  );
});

afterEach(async () => {
  for (const root of caseRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

afterAll(async () => {
  if (suiteRoot != null) {
    await fs.rm(suiteRoot, { recursive: true, force: true });
  }
});

const relativeToSuite = (absolutePath: string): string =>
  path.relative(suiteRoot, absolutePath).split(path.sep).join("/");

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

type Fixture = {
  root: string;
  inputRoot: string;
  sourceRoot: string;
  toolchainRoot: string;
  candidatePath: string;
  stagingRoot: string;
  outputRoot: string;
  leanPath: string;
  lakePath: string;
  dependencyPath: string;
  replayDriverPath: string;
};

async function fixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(suiteRoot, "case-"));
  caseRoots.push(root);
  const inputRoot = path.join(root, "sealed-input");
  const sourceRoot = path.join(root, "trusted-formal-source");
  const toolchainRoot = path.join(root, "trusted-toolchain");
  const formalRunId = "nhm2-formal_kernel-run-001";
  const stagingParent = path.join(root, "formal-preseal");
  const runsParent = path.join(root, "runs");
  const stagingRoot = path.join(stagingParent, formalRunId);
  const outputRoot = path.join(runsParent, formalRunId);
  await fs.mkdir(inputRoot);
  await fs.mkdir(path.join(sourceRoot, "NHM2Formal"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "NHM2Formal", "Generated"));
  await fs.mkdir(path.join(toolchainRoot, "bin"), { recursive: true });
  await fs.mkdir(path.join(toolchainRoot, "lib", "lean"), {
    recursive: true,
  });
  await fs.mkdir(stagingParent);
  await fs.mkdir(runsParent);

  const replayDriverPath = path.join(
    sourceRoot,
    "NHM2Formal",
    "ExperimentReadyReplayDriver.lean",
  );
  await fs.writeFile(
    replayDriverPath,
    [
      "theorem nhm2_pre_experimental_claim_locks : True := by trivial",
      "#check nhm2_pre_experimental_claim_locks",
      "#print axioms nhm2_pre_experimental_claim_locks",
      `#eval IO.println ${JSON.stringify(NHM2_FORMAL_KERNEL_THEOREM_TRANSCRIPT_MARKER)}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "lakefile.lean"),
    "package nhm2_formal\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "lean-toolchain"),
    "leanprover/lean4:v4.32.0\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "NHM2Formal.lean"),
    "namespace NHM2Formal\nend NHM2Formal\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "NHM2Formal", "ClaimBoundary.lean"),
    "namespace NHM2Formal\ndef claimsClosed : Prop := True\nend NHM2Formal\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "NHM2Formal", "ExperimentReadyClaimLocks.lean"),
    "theorem experiment_ready_claim_locks : True := by trivial\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "NHM2Formal", "Generated", "Support.lean"),
    "theorem generated_support : True := by trivial\n",
    "utf8",
  );
  await fs.writeFile(path.join(sourceRoot, "lake-manifest.json"), "{}", "utf8");
  await fs.writeFile(
    path.join(sourceRoot, "README.md"),
    "not executable source\n",
  );

  const leanPath = path.join(
    toolchainRoot,
    "bin",
    process.platform === "win32" ? "lean.exe" : "lean",
  );
  const lakePath = path.join(
    toolchainRoot,
    "bin",
    process.platform === "win32" ? "lake.exe" : "lake",
  );
  const dependencyPath = path.join(toolchainRoot, "lib", "lean", "empty.h");
  await fs.writeFile(leanPath, "lean-executable", "utf8");
  await fs.writeFile(lakePath, "lake-executable", "utf8");
  await fs.writeFile(dependencyPath, Buffer.alloc(0));
  await fs.writeFile(
    path.join(toolchainRoot, "lib", "lean", "Init.olean"),
    "sealed-runtime-dependency",
    "utf8",
  );

  const outerWrapper = await writeCanonical(
    path.join(inputRoot, "run-experiment-ready-theory-formal.ts"),
    { runtime: "outer-formal-wrapper" },
  );
  const candidateDefinition = await writeCanonical(
    path.join(inputRoot, "candidate-definition.json"),
    { artifactId: "nhm2.fresh_candidate_definition" },
  );
  const profile = await writeCanonical(path.join(inputRoot, "profile.json"), {
    artifactId: "nhm2.fresh_profile",
  });
  const chart = await writeCanonical(path.join(inputRoot, "chart.json"), {
    artifactId: "nhm2.fresh_chart",
  });
  const atlas = await writeCanonical(path.join(inputRoot, "atlas.json"), {
    artifactId: "nhm2.fresh_atlas",
  });
  const units = await writeCanonical(path.join(inputRoot, "units.json"), {
    artifactId: "nhm2.fresh_units",
  });
  const normalization = await writeCanonical(
    path.join(inputRoot, "normalization.json"),
    { artifactId: "nhm2.fresh_normalization" },
  );
  const environment = await writeCanonical(
    path.join(inputRoot, "formal-environment.json"),
    { artifactId: "nhm2.formal_environment", engine: "direct-lean" },
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
  const solverBinding = {
    artifactId: "nhm2.formal_runtime_wrapper",
    contractVersion: "nhm2_formal_runtime_wrapper/v1",
    path: outerWrapper.path,
    sha256: outerWrapper.sha256,
    solverId: "nhm2-formal-runtime-wrapper",
    solverVersion: "1.0.0",
    implementationId: "casimirbot-pinned-formal-wrapper-v1",
  };
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
            ? relativeToSuite(outputRoot)
            : `${relativeToSuite(root)}/${planRole}-unused-output`;
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
                  path: `${relativeToSuite(root)}/unused-${planRole}-solver.json`,
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
                  path: environment.path,
                  sha256: environment.sha256,
                  environmentId: "nhm2-formal-environment-001",
                }
              : {
                  artifactId: `nhm2.${planRole}_environment`,
                  contractVersion: `nhm2_${planRole}_environment/v1`,
                  path: `${relativeToSuite(root)}/unused-${planRole}-environment.json`,
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
    generatedAt: "2026-07-18T09:59:00.000Z",
    frozenAt: "2026-07-18T10:00:00.000Z",
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
      frozenAt: "2026-07-18T09:58:00.000Z",
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
      policyPath: `${relativeToSuite(root)}/supersession-policy.json`,
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
  return {
    root,
    inputRoot,
    sourceRoot,
    toolchainRoot,
    candidatePath: path.resolve(suiteRoot, candidateWritten.path),
    stagingRoot,
    outputRoot,
    leanPath,
    lakePath,
    dependencyPath,
    replayDriverPath,
  };
}

const preseal = (value: Fixture) =>
  presealNhm2ExperimentReadyTheoryFormalRun({
    workspaceRoot: suiteRoot,
    candidateManifestPath: value.candidatePath,
    stagingRoot: value.stagingRoot,
    trustedFormalProjectRoot: value.sourceRoot,
    trustedToolchainRoot: value.toolchainRoot,
    trustedLeanExecutablePath: value.leanPath,
    trustedLakeExecutablePath: value.lakePath,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
  });

const expectFailure = async (
  promise: Promise<unknown>,
  code: string,
): Promise<Nhm2ExperimentReadyTheoryFormalPresealError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Nhm2ExperimentReadyTheoryFormalPresealError);
    expect((error as Nhm2ExperimentReadyTheoryFormalPresealError).code).toBe(
      code,
    );
    return error as Nhm2ExperimentReadyTheoryFormalPresealError;
  }
  throw new Error(`Expected preseal failure ${code}`);
};

describe.sequential("NHM2 direct-Lean formal preseal", () => {
  it("stages exact source/toolchain closures, preserves a zero-byte runtime dependency, and emits a canonical closed-claim run spec", async () => {
    const value = await fixture();
    const result = await preseal(value);

    expect(result.runSpec.executor.executableRole).toBe("lean");
    expect(result.runSpec.executor.executableArguments).toEqual([
      path.join(
        value.stagingRoot,
        "formal-source",
        "NHM2Formal",
        "ExperimentReadyReplayDriver.lean",
      ),
      "-o",
      "proof.olean",
    ]);
    expect(result.runSpec.executor.replayWorkdirs).toEqual([
      path.join(value.outputRoot, "replay-one"),
      path.join(value.outputRoot, "replay-two"),
    ]);
    await expect(fs.lstat(value.outputRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(result.toolchainLedger.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "lib/lean/empty.h",
          sizeBytes: 0,
          sha256: sha256(Buffer.alloc(0)),
        }),
      ]),
    );
    expect(result.runSpec.toolchainBindings.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolchainRole: "runtime_dependency",
          sizeBytes: 0,
        }),
      ]),
    );
    expect(result.runSpec.formalSourceBindings.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceRole: "replay_driver" }),
        expect.objectContaining({ sourceRole: "supporting_source" }),
      ]),
    );
    expect(
      result.runSpec.formalSourceBindings.entries.some((entry) =>
        entry.path.endsWith("README.md"),
      ),
    ).toBe(false);
    expect(result.claimBoundary).toMatchObject({
      experimentReadyTheoryClosureClaimAllowed: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
      routeEtaClaimAllowed: false,
      speedAuthorityClaimAllowed: false,
    });
    const specPath = path.join(
      value.stagingRoot,
      NHM2_EXPERIMENT_READY_THEORY_FORMAL_RUN_SPEC_FILENAME,
    );
    const specBytes = await fs.readFile(specPath);
    expect(JSON.stringify(JSON.parse(specBytes.toString("utf8")))).toBe(
      specBytes.toString("utf8"),
    );
    expect(sha256(specBytes)).toBe(result.formalRunSpecSha256);
  });

  it.each(["import NHM2Formal", "sorry", "axiom forged : True"])(
    "rejects standalone replay driver proof/import violation %s",
    async (violation) => {
      const value = await fixture();
      await fs.appendFile(value.replayDriverPath, `\n${violation}\n`, "utf8");
      await expectFailure(preseal(value), "formal_driver_not_standalone");
    },
  );

  it.each(["missing", "duplicate"] as const)(
    "rejects %s required formal source roles",
    async (variant) => {
      const value = await fixture();
      if (variant === "missing") {
        await fs.rm(
          path.join(value.sourceRoot, "NHM2Formal", "ClaimBoundary.lean"),
        );
      } else {
        await fs.mkdir(path.join(value.sourceRoot, "duplicate"));
        await fs.writeFile(
          path.join(value.sourceRoot, "duplicate", "lakefile.lean"),
          "package duplicate\n",
          "utf8",
        );
      }
      await expectFailure(preseal(value), "formal_source_role_mismatch");
    },
  );

  it("rejects hardlinked toolchain members", async () => {
    const value = await fixture();
    await fs.link(
      path.join(value.toolchainRoot, "lib", "lean", "Init.olean"),
      path.join(value.toolchainRoot, "lib", "lean", "Init-alias.olean"),
    );
    await expectFailure(preseal(value), "hardlink_forbidden");
  });

  it.skipIf(process.platform === "win32")(
    "rejects symbolic links in the trusted closure",
    async () => {
      const value = await fixture();
      await fs.symlink(
        path.join(value.toolchainRoot, "lib", "lean", "Init.olean"),
        path.join(value.toolchainRoot, "lib", "lean", "Init-alias.olean"),
      );
      await expectFailure(preseal(value), "symlink_or_reparse_forbidden");
    },
  );

  it("stages exactly the bound candidate inputs and ignores an unbound sibling", async () => {
    const value = await fixture();
    await fs.writeFile(
      path.join(value.inputRoot, "undeclared.json"),
      "{}",
      "utf8",
    );
    const result = await preseal(value);
    expect(
      result.inputLedger.entries.some((entry) =>
        entry.relativePath.endsWith("undeclared.json"),
      ),
    ).toBe(false);
  });

  it("rejects an in-workspace staging root that is not frozen by the formal plan", async () => {
    const value = await fixture();
    await expectFailure(
      presealNhm2ExperimentReadyTheoryFormalRun({
        workspaceRoot: suiteRoot,
        candidateManifestPath: value.candidatePath,
        stagingRoot: path.join(value.root, "caller-selected-staging"),
        trustedFormalProjectRoot: value.sourceRoot,
        trustedToolchainRoot: value.toolchainRoot,
        trustedLeanExecutablePath: value.leanPath,
        trustedLakeExecutablePath: value.lakePath,
      }),
      "formal_staging_binding_mismatch",
    );
  });

  it("rejects extra or reordered formal producer arguments", async () => {
    const value = await fixture();
    const candidate = JSON.parse(
      await fs.readFile(value.candidatePath, "utf8"),
    ) as {
      executionPlans: Array<{
        planRole: string;
        expectedInvocation: { args: string[] };
      }>;
    };
    const formalPlan = candidate.executionPlans.find(
      (entry) => entry.planRole === "formal_kernel",
    );
    if (formalPlan == null) throw new Error("formal plan missing");
    formalPlan.expectedInvocation.args.push("--unexpected");
    await fs.writeFile(
      value.candidatePath,
      `${JSON.stringify(candidate, null, 2)}\n`,
      "utf8",
    );
    await expectFailure(preseal(value), "formal_plan_invocation_mismatch");
  });

  it.each(["staging", "output"] as const)(
    "rejects a pre-existing %s root without overwrite",
    async (kind) => {
      const value = await fixture();
      const target = kind === "staging" ? value.stagingRoot : value.outputRoot;
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, "keep.txt"), "preserve", "utf8");
      await expectFailure(preseal(value), "fresh_root_required");
      await expect(
        fs.readFile(path.join(target, "keep.txt"), "utf8"),
      ).resolves.toBe("preserve");
    },
  );

  it("rejects path escape and bounded-resource overflow", async () => {
    const escaped = await fixture();
    await expectFailure(
      presealNhm2ExperimentReadyTheoryFormalRun({
        workspaceRoot: suiteRoot,
        candidateManifestPath: escaped.candidatePath,
        stagingRoot: path.join(suiteRoot, "..", "escaped-formal-stage"),
        trustedFormalProjectRoot: escaped.sourceRoot,
        trustedToolchainRoot: escaped.toolchainRoot,
        trustedLeanExecutablePath: escaped.leanPath,
        trustedLakeExecutablePath: escaped.lakePath,
      }),
      "path_escape",
    );

    const bounded = await fixture();
    await expectFailure(
      presealNhm2ExperimentReadyTheoryFormalRun({
        workspaceRoot: suiteRoot,
        candidateManifestPath: bounded.candidatePath,
        stagingRoot: bounded.stagingRoot,
        trustedFormalProjectRoot: bounded.sourceRoot,
        trustedToolchainRoot: bounded.toolchainRoot,
        trustedLeanExecutablePath: bounded.leanPath,
        trustedLakeExecutablePath: bounded.lakePath,
        resourceLimits: {
          maxFileBytes: 128,
          maxCandidateManifestBytes: 128,
        },
      }),
      "resource_limit_exceeded",
    );
  });

  it("parses explicit trusted roots and rejects incomplete CLI invocation", () => {
    expect(
      parseNhm2ExperimentReadyTheoryFormalPresealCliArgs([
        "--candidate-manifest",
        "candidate.json",
        "--staging-root",
        "stage/run-1",
        "--trusted-toolchain-root",
        "C:/lean",
        "--trusted-lean-executable",
        "C:/lean/bin/lean.exe",
        "--trusted-lake-executable",
        "C:/lean/bin/lake.exe",
        "--trusted-formal-project-root",
        "C:/repo/formal/lean",
      ]),
    ).toEqual({
      candidateManifestPath: "candidate.json",
      stagingRoot: "stage/run-1",
      trustedToolchainRoot: "C:/lean",
      trustedLeanExecutablePath: "C:/lean/bin/lean.exe",
      trustedLakeExecutablePath: "C:/lean/bin/lake.exe",
      trustedFormalProjectRoot: "C:/repo/formal/lean",
    });
    expect(() =>
      parseNhm2ExperimentReadyTheoryFormalPresealCliArgs([
        "--candidate-manifest",
        "candidate.json",
      ]),
    ).toThrow("--staging-root is required");
  });
});
