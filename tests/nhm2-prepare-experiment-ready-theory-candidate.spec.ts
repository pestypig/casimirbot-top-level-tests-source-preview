import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyNhm2FormalProducerBundleAdmission } from "../server/services/theory/nhm2-formal-producer-bundle-admission";
import {
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_PRESEAL_DIRECTORY_NAME,
  isNhm2ExperimentReadyTheoryCandidateManifest,
  isNhm2ExperimentReadyTheoryCandidateNumericPolicySetArtifact,
  nhm2ExperimentReadyTheoryFormalRunSpecPath,
} from "../shared/contracts/nhm2-experiment-ready-theory-candidate-manifest.v1";
import { NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_IDS } from "../shared/contracts/nhm2-experiment-ready-theory-closure.v1";
import { isNhm2FormalProducerBundleBuildMetadata } from "../shared/contracts/nhm2-formal-producer-bundle.v1";
import { isNhm2PrimaryProducerBundleBuildMetadata } from "../shared/contracts/nhm2-primary-producer-bundle.v1";
import {
  buildNhm2PredictionFalsifierFreeze,
  isNhm2PredictionFalsifierFreeze,
  type BuildNhm2PredictionFalsifierFreezeInput,
} from "../shared/contracts/nhm2-prediction-falsifier-freeze.v1";
import {
  NHM2_ALPHA07_IMPORT_MANIFEST_PATH,
  NHM2_ALPHA07_PACKAGE_DIRECTORY,
  NHM2_ALPHA07_PROFILE_ID,
  NHM2_ALPHA07_SOURCE_COMMIT,
} from "../shared/theory/nhm2-alpha07-historical-import-governance";
import {
  NHM2_EXPERIMENT_READY_THEORY_EXECUTION_ENROLLMENT_BLOCKERS,
  NHM2_EXPERIMENT_READY_THEORY_PACKAGER_SOURCE_PATHS,
  NHM2_EXPERIMENT_READY_THEORY_FORMAL_BUNDLE_SOURCE_PATHS,
  NHM2_EXPERIMENT_READY_THEORY_PRIMARY_BUNDLE_SOURCE_PATHS,
  prepareNhm2ExperimentReadyTheoryCandidate,
  type Nhm2PredictionFreezeSemanticInputV1,
  type PreparedNhm2ExperimentReadyTheoryCandidate,
} from "../tools/nhm2/prepare-experiment-ready-theory-candidate";

const sourceRepoRoot = path.resolve(process.cwd());
const execFileAsync = promisify(execFile);
let repoRoot = "";
const outputBase =
  "artifacts/research/full-solve/experiment-ready-theory-candidate-spec-output";
const manifestId = `nhm2-alpha07-packager-spec-${randomBytes(6).toString("hex")}`;
const candidateRoot = `${outputBase}/${manifestId}`;
const frozenAt = "2026-07-19T16:00:00.000Z";
const unexecutableDraftContractTest = {
  testOnlyPublishUnexecutableDraft: true,
} as const;

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const readText = (repoPath: string): Promise<string> =>
  fs.readFile(path.resolve(repoRoot, ...repoPath.split("/")), "utf8");

const expectNoCandidatePublication = async (candidateManifestId: string) => {
  const candidateAbsolute = path.resolve(
    repoRoot,
    ...outputBase.split("/"),
    candidateManifestId,
  );
  await expect(fs.lstat(candidateAbsolute)).rejects.toMatchObject({
    code: "ENOENT",
  });
  const outputEntries = await fs.readdir(
    path.resolve(repoRoot, ...outputBase.split("/")),
  );
  expect(
    outputEntries.filter((entry) =>
      entry.startsWith(`.${candidateManifestId}.staging-`),
    ),
  ).toEqual([]);
};

const copyRepoPath = async (repoPath: string): Promise<void> => {
  const source = path.resolve(sourceRepoRoot, ...repoPath.split("/"));
  const destination = path.resolve(repoRoot, ...repoPath.split("/"));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const stats = await fs.stat(source);
  if (stats.isDirectory()) {
    await fs.cp(source, destination, { recursive: true });
  } else {
    await fs.copyFile(source, destination);
  }
};

describe("NHM2 candidate packager and fail-closed production enrollment gate", () => {
  let prepared: PreparedNhm2ExperimentReadyTheoryCandidate;

  beforeAll(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nhm2-packager-spec-"));
    await Promise.all([
      copyRepoPath(".gitignore"),
      copyRepoPath(NHM2_ALPHA07_PACKAGE_DIRECTORY),
      copyRepoPath(
        "artifacts/research/full-solve/profile-search/nhm2-profile-campaign-frontier-latest.json",
      ),
      copyRepoPath("package-lock.json"),
      copyRepoPath("tools/nhm2/build-regional-full-tensor-residual.ts"),
      copyRepoPath("tools/nhm2/emit-lean-campaign-certificate.ts"),
      ...Array.from(
        new Set([
          ...NHM2_EXPERIMENT_READY_THEORY_PACKAGER_SOURCE_PATHS,
          ...NHM2_EXPERIMENT_READY_THEORY_FORMAL_BUNDLE_SOURCE_PATHS,
          ...NHM2_EXPERIMENT_READY_THEORY_PRIMARY_BUNDLE_SOURCE_PATHS,
        ]),
      ).map(copyRepoPath),
    ]);
    await execFileAsync("git", ["init"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "core.autocrlf", "false"], {
      cwd: repoRoot,
    });
    await execFileAsync("git", ["config", "user.name", "NHM2 Spec"], {
      cwd: repoRoot,
    });
    await execFileAsync(
      "git",
      ["config", "user.email", "nhm2-spec@example.invalid"],
      {
        cwd: repoRoot,
      },
    );
    await execFileAsync("git", ["add", "--all"], { cwd: repoRoot });
    await execFileAsync(
      "git",
      ["commit", "--no-gpg-sign", "-m", "spec fixture"],
      {
        cwd: repoRoot,
      },
    );
    prepared = await prepareNhm2ExperimentReadyTheoryCandidate(
      {
        repoRoot,
        outputBaseDirectory: outputBase,
        manifestId,
        frozenAt,
        dataCollectionOpensAt: "2026-07-20T16:00:00.000Z",
      },
      unexecutableDraftContractTest,
    );
  }, 60_000);

  afterAll(async () => {
    const relative = path.relative(os.tmpdir(), repoRoot);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      !path.basename(repoRoot).startsWith("nhm2-packager-spec-")
    ) {
      throw new Error(
        `refusing to remove unexpected spec repository: ${repoRoot}`,
      );
    }
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it("lets only the path-guarded contract fixture inspect the structurally complete unexecutable draft", async () => {
    const manifest = prepared.manifest;

    expect(isNhm2ExperimentReadyTheoryCandidateManifest(manifest)).toBe(true);
    expect(manifest.readiness).toMatchObject({
      status: "pre_run_manifest_ready",
      preRunManifestReady: true,
      blockerCount: 0,
      firstBlocker: "none",
      requiredExecutionPlanCount: 3,
      suppliedExecutionPlanCount: 3,
      requiredEvidenceRoleCount: 11,
      suppliedEvidenceRoleCount: 11,
    });
    expect(manifest.executionPlans.map((entry) => entry.planRole)).toEqual([
      "primary_numerical",
      "independent_numerical",
      "formal_kernel",
    ]);
    expect(manifest.executionPlans.map((entry) => entry.runtimeId)).toEqual([
      "nhm2.experiment_ready_theory.primary",
      "nhm2.experiment_ready_theory.independent",
      "nhm2.experiment_ready_theory.formal",
    ]);
    expect(
      new Set(manifest.executionPlans.map((entry) => entry.runId)),
    ).toHaveProperty("size", 3);
    expect(
      new Set(
        manifest.executionPlans.map(
          (entry) => entry.expectedInvocation.outputDirectory,
        ),
      ),
    ).toHaveProperty("size", 3);
    for (const plan of manifest.executionPlans) {
      expect(plan.expectedInvocation.outputDirectory).toBe(
        `${candidateRoot}/runs/${plan.runId}`,
      );
      expect(plan.expectedInvocation.command).toBe("npm");
      const formalRunSpecArgs =
        plan.planRole === "formal_kernel"
          ? [
              "--formal-run-spec",
              nhm2ExperimentReadyTheoryFormalRunSpecPath({
                outputDirectory: plan.expectedInvocation.outputDirectory,
                runId: plan.runId,
              }),
            ]
          : [];
      expect(plan.expectedInvocation.args).toEqual([
        "run",
        "-s",
        expect.stringMatching(/^warp:full-solve:nhm2:theory-candidate:/),
        "--",
        "--candidate-manifest",
        prepared.manifestPath,
        ...formalRunSpecArgs,
      ]);

      const solverDescriptorRaw = await readText(plan.solver.path);
      const solverDescriptor = JSON.parse(solverDescriptorRaw) as {
        artifactId: string;
        contractVersion: string;
        solverId: string;
        solverVersion: string;
        implementationId: string;
        sourceRef: { path: string; sha256: string };
      };
      expect(sha256(solverDescriptorRaw)).toBe(plan.solver.sha256);
      expect(solverDescriptor).toMatchObject({
        artifactId: plan.solver.artifactId,
        contractVersion: plan.solver.contractVersion,
        solverId: plan.solver.solverId,
        solverVersion: plan.solver.solverVersion,
        implementationId: plan.solver.implementationId,
      });
      expect(solverDescriptor.sourceRef.path).toMatch(/\.ts$/);
      expect(sha256(await readText(solverDescriptor.sourceRef.path))).toBe(
        solverDescriptor.sourceRef.sha256,
      );

      const environmentDescriptorRaw = await readText(
        plan.environmentLock.path,
      );
      const environmentDescriptor = JSON.parse(environmentDescriptorRaw) as {
        artifactId: string;
        contractVersion: string;
        environmentId: string;
        dependencyLockRef: { path: string; sha256: string };
      };
      expect(sha256(environmentDescriptorRaw)).toBe(
        plan.environmentLock.sha256,
      );
      expect(environmentDescriptor).toMatchObject({
        artifactId: plan.environmentLock.artifactId,
        contractVersion: plan.environmentLock.contractVersion,
        environmentId: plan.environmentLock.environmentId,
      });
      expect(environmentDescriptor.dependencyLockRef.path).toBe(
        "package-lock.json",
      );
      expect(
        sha256(await readText(environmentDescriptor.dependencyLockRef.path)),
      ).toBe(environmentDescriptor.dependencyLockRef.sha256);
    }
    expect(
      (
        await fs.stat(
          path.resolve(repoRoot, ...candidateRoot.split("/"), "runs"),
        )
      ).isDirectory(),
    ).toBe(true);
    expect(
      (
        await fs.stat(
          path.resolve(
            repoRoot,
            ...candidateRoot.split("/"),
            NHM2_EXPERIMENT_READY_THEORY_FORMAL_PRESEAL_DIRECTORY_NAME,
          ),
        )
      ).isDirectory(),
    ).toBe(true);
    expect(
      manifest.expectedEvidenceOutputs.map((entry) => entry.evidenceRole),
    ).toEqual(NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_IDS);
    expect(manifest.claimBoundary).toMatchObject({
      experimentReadyTheoryClosureClaimAllowed: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
      routeEtaClaimAllowed: false,
      speedAuthorityClaimAllowed: false,
      empiricalReceiptsRequiredForPhysicalPromotion: true,
    });

    const rawManifest = await readText(prepared.manifestPath);
    expect(sha256(rawManifest)).toBe(prepared.manifestRawSha256);
    expect(rawManifest).not.toMatch(
      /"(?:startedAt|completedAt|durationMs|outputManifestSha256|receiptSha256|artifactSha256)"/,
    );
  });

  it(
    "refuses to publish the production candidate until both numerical execution enrollments exist",
    async () => {
      const blockedManifestId = `${manifestId}-enrollment-blocked`;
      await expect(
        prepareNhm2ExperimentReadyTheoryCandidate({
          repoRoot,
          outputBaseDirectory: outputBase,
          manifestId: blockedManifestId,
          frozenAt,
          dataCollectionOpensAt: "2026-07-20T16:00:00.000Z",
        }),
      ).rejects.toThrow(
        new RegExp(
          NHM2_EXPERIMENT_READY_THEORY_EXECUTION_ENROLLMENT_BLOCKERS.join(
            ".*",
          ),
        ),
      );
      await expectNoCandidatePublication(blockedManifestId);
    },
    60_000,
  );

  it("does not permit the contract-test draft seam in the canonical checkout", async () => {
    await expect(
      prepareNhm2ExperimentReadyTheoryCandidate(
        {
          repoRoot: sourceRepoRoot,
          outputBaseDirectory: outputBase,
          manifestId: `${manifestId}-canonical-bypass-rejected`,
          frozenAt,
        },
        unexecutableDraftContractTest,
      ),
    ).rejects.toThrow(/candidate execution enrollment incomplete/i);
  });

  it("strictly labels the committed alpha=0.7 package as a preexisting diagnostic seed", async () => {
    const definition = prepared.candidateDefinition;
    const historicalManifest = JSON.parse(
      await readText(NHM2_ALPHA07_IMPORT_MANIFEST_PATH),
    ) as {
      boundToExecution: boolean;
      entries: Array<{ freshness: string }>;
    };

    expect(definition.selectedProfileId).toBe(NHM2_ALPHA07_PROFILE_ID);
    expect(definition.committedHistoricalSeed).toMatchObject({
      importManifestPath: NHM2_ALPHA07_IMPORT_MANIFEST_PATH,
      sourceCommitSha: NHM2_ALPHA07_SOURCE_COMMIT,
      boundToExecution: false,
      artifactFreshness: "preexisting",
      diagnosticSeedOnly: true,
      cannotSatisfyFreshRuntimeEvidence: true,
    });
    expect(definition.committedHistoricalSeed.refs).toHaveLength(6);
    expect(definition.packagerProvenance).toMatchObject({
      packagerId: "casimirbot-nhm2-experiment-ready-theory-packager-v1",
      sourceCommitSha: prepared.manifest.executionPlans[0].sourceCommitSha,
      worktreeCleanAtConstructionStart: true,
      worktreeCleanAndStableRequiredBeforeReturn: true,
    });
    expect(definition.packagerProvenance.refs.map((ref) => ref.path)).toEqual(
      NHM2_EXPERIMENT_READY_THEORY_PACKAGER_SOURCE_PATHS,
    );
    expect(definition.packagerProvenance.refs.map((ref) => ref.path)).toContain(
      "shared/contracts/nhm2-formal-kernel-replay-manifest.v1.ts",
    );
    expect(definition.packagerProvenance.refs.map((ref) => ref.path)).toEqual(
      expect.arrayContaining([
        "server/services/theory/nhm2-independent-numerical-replication-content-assessor.ts",
        "server/services/theory/nhm2-independent-numerical-replication-executor.ts",
        "server/services/theory/nhm2-primary-comparison-projection-assessor.ts",
        "shared/contracts/nhm2-independent-field-array-manifest.v1.ts",
        "shared/contracts/nhm2-independent-numerical-replication.v1.ts",
        "shared/contracts/nhm2-primary-comparison-projection.v1.ts",
      ]),
    );
    for (const ref of definition.packagerProvenance.refs) {
      expect(sha256(await readText(ref.path))).toBe(ref.sha256);
    }
    expect(historicalManifest.boundToExecution).toBe(false);
    expect(
      historicalManifest.entries.every(
        (entry) => entry.freshness === "preexisting",
      ),
    ).toBe(true);
    expect(definition.claimBoundary).toMatchObject({
      theoryClosureClaimAllowed: false,
      empiricalValidationClaimAllowed: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
    });

    const identityFields = {
      candidate: "candidateId",
      profile: "selectedProfileId",
      chart: "chartId",
      atlas: "atlasId",
      units: "unitsId",
      normalization: "normalizationId",
    } as const;
    for (const [bindingKey, identityField] of Object.entries(identityFields)) {
      const binding = prepared.manifest.bindings[
        bindingKey as keyof typeof prepared.manifest.bindings
      ] as Record<string, string>;
      const descriptorRaw = await readText(binding.path);
      const descriptor = JSON.parse(descriptorRaw) as Record<string, unknown>;
      expect(sha256(descriptorRaw)).toBe(binding.sha256);
      expect(descriptor.artifactId).toBe(binding.artifactId);
      expect(descriptor.contractVersion).toBe(binding.contractVersion);
      expect(descriptor[identityField]).toBe(binding[identityField]);
      if (bindingKey !== "candidate") {
        const sourceRef = descriptor.sourceRef as {
          path: string;
          sha256: string;
        };
        expect(sourceRef.path).toContain(NHM2_ALPHA07_PACKAGE_DIRECTORY);
        expect(sha256(await readText(sourceRef.path))).toBe(sourceRef.sha256);
      }
    }
  });

  it("freezes distinct deterministic standalone primary and formal ESM producer bundles with exact source closures and host-specific Node bindings", async () => {
    const metadataRaw = await readText(
      prepared.primaryProducerBundleBuildMetadataPath,
    );
    const metadataJson: unknown = JSON.parse(metadataRaw);
    expect(isNhm2PrimaryProducerBundleBuildMetadata(metadataJson)).toBe(true);
    if (!isNhm2PrimaryProducerBundleBuildMetadata(metadataJson)) {
      throw new Error("bundle build metadata guard did not narrow fixture");
    }
    const metadata = metadataJson;
    const bundleBytes = await fs.readFile(
      path.resolve(repoRoot, prepared.primaryProducerBundlePath),
    );
    expect(sha256(metadataRaw)).toBe(
      prepared.candidateDefinition.primaryProducerBundle.buildMetadataRef
        .sha256,
    );
    expect(metadata.bundleRef).toEqual(
      prepared.candidateDefinition.primaryProducerBundle.bundleRef,
    );
    expect(metadata.bundleRef.path).toBe(prepared.primaryProducerBundlePath);
    expect(sha256(bundleBytes)).toBe(metadata.bundleRef.sha256);
    expect(bundleBytes.byteLength).toBe(metadata.bundleRef.sizeBytes);
    expect(metadata.inputClosure.inputs.map((entry) => entry.path)).toEqual(
      [...NHM2_EXPERIMENT_READY_THEORY_PRIMARY_BUNDLE_SOURCE_PATHS].sort(),
    );
    expect(metadata.inputClosure.inputs.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        "shared/contracts/nhm2-semiclassical-state-realizability.v1.ts",
        "shared/contracts/nhm2-semiclassical-state-realizability.v2.ts",
      ]),
    );
    for (const source of metadata.inputClosure.inputs) {
      const bytes = await fs.readFile(path.resolve(repoRoot, source.path));
      expect(sha256(bytes)).toBe(source.sha256);
      expect(bytes.byteLength).toBe(source.sizeBytes);
    }
    expect(
      metadata.metafile.externalImports.every(
        (entry) => entry.external && entry.path.startsWith("node:"),
      ),
    ).toBe(true);
    expect(metadata.dependencyClosure).toMatchObject({
      bundledSourceClosureComplete: true,
      runtimeNodeModulesRequired: false,
      externalNpmPackages: [],
    });
    expect(metadata.claimBoundary).toMatchObject({
      operatingSystemHermeticityAsserted: false,
      nodeRuntimeHermeticityAsserted: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
      routeEtaClaimAllowed: false,
      speedAuthorityClaimAllowed: false,
    });

    const primary = prepared.manifest.executionPlans.find(
      (entry) => entry.planRole === "primary_numerical",
    );
    if (primary == null) throw new Error("primary plan missing");
    const solver = JSON.parse(await readText(primary.solver.path)) as {
      bundleRef: unknown;
      bundleBuildMetadataRef: unknown;
    };
    expect(solver.bundleRef).toEqual(metadata.bundleRef);
    expect(solver.bundleBuildMetadataRef).toEqual(
      prepared.candidateDefinition.primaryProducerBundle.buildMetadataRef,
    );
    const environment = JSON.parse(
      await readText(primary.environmentLock.path),
    ) as {
      runtime: {
        standaloneBundle: boolean;
        runtimeNodeModulesRequired: boolean;
        bundledDependencyClosureAttested: boolean;
        hostNodeRuntime: {
          executablePath: string;
          sha256: string;
          sizeBytes: number;
          nodeVersion: string;
          platform: string;
          arch: string;
          hostSpecificDiagnosticRuntimeClosure: boolean;
          operatingSystemHermeticityAsserted: boolean;
          nodeRuntimeReproducibilityAsserted: boolean;
        };
      };
    };
    const executablePath = await fs.realpath(process.execPath);
    const executableBytes = await fs.readFile(executablePath);
    expect(environment.runtime).toMatchObject({
      standaloneBundle: true,
      runtimeNodeModulesRequired: false,
      bundledDependencyClosureAttested: true,
    });
    expect(environment.runtime.hostNodeRuntime).toEqual({
      executablePath,
      sha256: sha256(executableBytes),
      sizeBytes: executableBytes.byteLength,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      hostSpecificDiagnosticRuntimeClosure: true,
      operatingSystemHermeticityAsserted: false,
      nodeRuntimeReproducibilityAsserted: false,
    });

    const formalMetadataRaw = await readText(
      prepared.formalProducerBundleBuildMetadataPath,
    );
    const formalMetadataJson: unknown = JSON.parse(formalMetadataRaw);
    expect(isNhm2FormalProducerBundleBuildMetadata(formalMetadataJson)).toBe(
      true,
    );
    if (!isNhm2FormalProducerBundleBuildMetadata(formalMetadataJson)) {
      throw new Error(
        "formal bundle build metadata guard did not narrow fixture",
      );
    }
    const formalMetadata = formalMetadataJson;
    const formalBundleBytes = await fs.readFile(
      path.resolve(repoRoot, prepared.formalProducerBundlePath),
    );
    expect(sha256(formalMetadataRaw)).toBe(
      prepared.candidateDefinition.formalProducerBundle.buildMetadataRef.sha256,
    );
    expect(formalMetadata.bundleRef).toEqual(
      prepared.candidateDefinition.formalProducerBundle.bundleRef,
    );
    expect(formalMetadata.bundleRef.path).toBe(
      prepared.formalProducerBundlePath,
    );
    expect(sha256(formalBundleBytes)).toBe(formalMetadata.bundleRef.sha256);
    expect(formalBundleBytes.byteLength).toBe(
      formalMetadata.bundleRef.sizeBytes,
    );
    expect(
      formalMetadata.inputClosure.inputs.map((entry) => entry.path),
    ).toEqual(
      [...NHM2_EXPERIMENT_READY_THEORY_FORMAL_BUNDLE_SOURCE_PATHS].sort(),
    );
    expect(formalMetadata.bundleRef.sha256).not.toBe(metadata.bundleRef.sha256);

    const formal = prepared.manifest.executionPlans.find(
      (entry) => entry.planRole === "formal_kernel",
    );
    if (formal == null) throw new Error("formal plan missing");
    const formalSolver = JSON.parse(await readText(formal.solver.path)) as {
      bundleRef: unknown;
      bundleBuildMetadataRef: unknown;
    };
    expect(formalSolver.bundleRef).toEqual(formalMetadata.bundleRef);
    expect(formalSolver.bundleBuildMetadataRef).toEqual(
      prepared.candidateDefinition.formalProducerBundle.buildMetadataRef,
    );
    const formalEnvironment = JSON.parse(
      await readText(formal.environmentLock.path),
    ) as typeof environment;
    expect(formalEnvironment.runtime).toEqual(environment.runtime);

    const formalAdmission = await verifyNhm2FormalProducerBundleAdmission({
      projectRoot: repoRoot,
      frozenAt: prepared.manifest.frozenAt,
      candidateDescriptor: prepared.candidateDefinition,
      solverDescriptor: formalSolver,
      environmentDescriptor: formalEnvironment,
    });
    expect(formalAdmission.bundle).toMatchObject({
      path: prepared.formalProducerBundlePath,
      sha256: formalMetadata.bundleRef.sha256,
      sizeBytes: formalMetadata.bundleRef.sizeBytes,
    });
    expect(formalAdmission.sourceFiles.map((entry) => entry.path)).toEqual(
      [...NHM2_EXPERIMENT_READY_THEORY_FORMAL_BUNDLE_SOURCE_PATHS].sort(),
    );
    expect(formalAdmission.claimBoundary).toMatchObject({
      standaloneFormalProducerReproduced: true,
      formalLogicReplayEstablished: false,
      theoryClosureEstablished: false,
      physicalViabilityEstablished: false,
      transportEstablished: false,
    });
    await expect(
      verifyNhm2FormalProducerBundleAdmission({
        projectRoot: repoRoot,
        frozenAt: prepared.manifest.frozenAt,
        candidateDescriptor: prepared.candidateDefinition,
        solverDescriptor: {
          ...formalSolver,
          bundleRef: metadata.bundleRef,
        },
        environmentDescriptor: formalEnvironment,
      }),
    ).rejects.toThrow("formal producer bundle ref");
    await expect(
      verifyNhm2FormalProducerBundleAdmission({
        projectRoot: repoRoot,
        frozenAt: prepared.manifest.frozenAt,
        candidateDescriptor: prepared.candidateDefinition,
        solverDescriptor: formalSolver,
        environmentDescriptor: formalEnvironment,
        resourceLimits: { maxBundleBytes: 1 },
      }),
    ).rejects.toThrow("exceeds limits");
  });

  it("binds detached numeric policy and a cycle-free complete prediction semantic input", async () => {
    const policyRaw = await readText(prepared.numericPolicyPath);
    const policy: unknown = JSON.parse(policyRaw);
    const semanticInputRaw = await readText(
      prepared.predictionFreezeSemanticInputPath,
    );
    const semanticInput = JSON.parse(
      semanticInputRaw,
    ) as Nhm2PredictionFreezeSemanticInputV1;

    expect(
      isNhm2ExperimentReadyTheoryCandidateNumericPolicySetArtifact(policy),
    ).toBe(true);
    expect(sha256(policyRaw)).toBe(
      prepared.candidateDefinition.numericPolicy.sha256,
    );
    expect(sha256(semanticInputRaw)).toBe(
      prepared.candidateDefinition.predictionFreezeSemanticInput.sha256,
    );
    expect(semanticInput.semanticSha256).toBe(
      prepared.manifest.predictionFreezeCommitment.semanticSha256,
    );
    expect("registrationBinding" in semanticInput.frozenInput).toBe(false);
    expect("generatedAt" in semanticInput.frozenInput).toBe(false);
    expect(semanticInput.historicalSeedBoundary).toMatchObject({
      boundToExecution: false,
      artifactFreshness: "preexisting",
      diagnosticSeedOnly: true,
    });

    const primary = prepared.manifest.executionPlans.find(
      (entry) => entry.planRole === "primary_numerical",
    );
    expect(primary).toBeDefined();
    const completedFreeze = buildNhm2PredictionFalsifierFreeze({
      generatedAt: semanticInput.frozenInput.frozenAt,
      registrationBinding: {
        candidateId: prepared.manifest.bindings.candidate.candidateId,
        candidateManifestPath: prepared.manifestPath,
        candidateManifestSha256: prepared.manifestRawSha256,
        runId: primary!.runId,
        requestId: primary!.requestId,
        receiptId: primary!.receiptId,
        runtimeId: primary!.runtimeId,
        plannedOutputDirectory: primary!.expectedInvocation.outputDirectory,
      },
      ...(semanticInput.frozenInput as Omit<
        BuildNhm2PredictionFalsifierFreezeInput,
        "generatedAt" | "registrationBinding"
      >),
    });

    expect(isNhm2PredictionFalsifierFreeze(completedFreeze)).toBe(true);
    expect(completedFreeze.readiness).toMatchObject({
      predictionFreezeReady: true,
      blockerCount: 0,
      firstBlocker: "none",
    });
    expect(completedFreeze.semanticSha256).toBe(semanticInput.semanticSha256);
    expect(completedFreeze.claimBoundary).toMatchObject({
      predictionFreezeCannotSubstituteForExperimentalEvidence: true,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
    });
  });

  it("detects semantic tampering and refuses in-place regeneration", async () => {
    const semanticInput = structuredClone(
      prepared.predictionFreezeSemanticInput,
    );
    semanticInput.frozenInput.observables[0].expectedSignOrPhase =
      "post-freeze altered sign";
    const primary = prepared.manifest.executionPlans.find(
      (entry) => entry.planRole === "primary_numerical",
    )!;
    const tampered = buildNhm2PredictionFalsifierFreeze({
      generatedAt: semanticInput.frozenInput.frozenAt,
      registrationBinding: {
        candidateId: prepared.manifest.bindings.candidate.candidateId,
        candidateManifestPath: prepared.manifestPath,
        candidateManifestSha256: prepared.manifestRawSha256,
        runId: primary.runId,
        requestId: primary.requestId,
        receiptId: primary.receiptId,
        runtimeId: primary.runtimeId,
        plannedOutputDirectory: primary.expectedInvocation.outputDirectory,
      },
      ...semanticInput.frozenInput,
    });

    expect(tampered.semanticSha256).not.toBe(
      prepared.manifest.predictionFreezeCommitment.semanticSha256,
    );
    await expect(
      prepareNhm2ExperimentReadyTheoryCandidate(
        {
          repoRoot,
          outputBaseDirectory: outputBase,
          manifestId,
          frozenAt,
        },
        unexecutableDraftContractTest,
      ),
    ).rejects.toThrow(/immutable candidate root already exists/);
  });

  it("rejects a dirty packager and any other dirty worktree path", async () => {
    const packagerPath = path.resolve(
      repoRoot,
      ...NHM2_EXPERIMENT_READY_THEORY_PACKAGER_SOURCE_PATHS[0].split("/"),
    );
    const originalPackager = await fs.readFile(packagerPath);
    try {
      await fs.appendFile(packagerPath, "\n// dirty packager fixture\n");
      await expect(
        prepareNhm2ExperimentReadyTheoryCandidate(
          {
            repoRoot,
            outputBaseDirectory: outputBase,
            manifestId: `${manifestId}-dirty-packager`,
            frozenAt,
          },
          unexecutableDraftContractTest,
        ),
      ).rejects.toThrow(/entire Git worktree.*clean/i);
    } finally {
      await fs.writeFile(packagerPath, originalPackager);
    }

    const unrelatedDirtyPath = path.join(repoRoot, "unrelated-dirty-file.txt");
    try {
      await fs.writeFile(unrelatedDirtyPath, "dirty\n", "utf8");
      await expect(
        prepareNhm2ExperimentReadyTheoryCandidate(
          {
            repoRoot,
            outputBaseDirectory: outputBase,
            manifestId: `${manifestId}-dirty-global`,
            frozenAt,
          },
          unexecutableDraftContractTest,
        ),
      ).rejects.toThrow(/entire Git worktree.*clean/i);
    } finally {
      await fs.unlink(unrelatedDirtyPath).catch(() => undefined);
    }
  });

  it("fails closed when source status or HEAD changes during construction", async () => {
    const statusInstabilityManifestId = `${manifestId}-status-instability`;
    const dirtyDuringConstruction = path.join(
      repoRoot,
      "dirty-during-construction.txt",
    );
    try {
      await expect(
        prepareNhm2ExperimentReadyTheoryCandidate(
          {
            repoRoot,
            outputBaseDirectory: outputBase,
            manifestId: statusInstabilityManifestId,
            frozenAt,
          },
          {
            beforeFinalSourceStabilityCheck: async () => {
              await fs.writeFile(dirtyDuringConstruction, "dirty\n", "utf8");
            },
            ...unexecutableDraftContractTest,
          },
        ),
      ).rejects.toThrow(/changed during candidate construction/i);
    } finally {
      await fs.unlink(dirtyDuringConstruction).catch(() => undefined);
    }
    await expectNoCandidatePublication(statusInstabilityManifestId);

    const headInstabilityManifestId = `${manifestId}-head-instability`;
    await expect(
      prepareNhm2ExperimentReadyTheoryCandidate(
        {
          repoRoot,
          outputBaseDirectory: outputBase,
          manifestId: headInstabilityManifestId,
          frozenAt,
        },
        {
          beforeFinalSourceStabilityCheck: async () => {
            await execFileAsync(
              "git",
              ["commit", "--allow-empty", "--no-gpg-sign", "-m", "move head"],
              { cwd: repoRoot },
            );
          },
          ...unexecutableDraftContractTest,
        },
      ),
    ).rejects.toThrow(/changed during candidate construction/i);
    await expectNoCandidatePublication(headInstabilityManifestId);
  }, 60_000);

  it("rejects a symlinked output base without writing through it", async () => {
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "nhm2-packager-symlink-target-"),
    );
    const linkRepoPath = `${outputBase}/symlink-output-base`;
    const linkAbsolutePath = path.resolve(repoRoot, ...linkRepoPath.split("/"));
    await fs.symlink(
      externalRoot,
      linkAbsolutePath,
      process.platform === "win32" ? "junction" : "dir",
    );
    try {
      await expect(
        prepareNhm2ExperimentReadyTheoryCandidate(
          {
            repoRoot,
            outputBaseDirectory: linkRepoPath,
            manifestId: `${manifestId}-symlink-rejected`,
            frozenAt,
          },
          unexecutableDraftContractTest,
        ),
      ).rejects.toThrow(/symbolic-link component/i);
      await expect(
        fs.lstat(path.join(externalRoot, `${manifestId}-symlink-rejected`)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.unlink(linkAbsolutePath).catch(() => undefined);
      await fs.rm(externalRoot, { recursive: true, force: true });
    }
  });
});
