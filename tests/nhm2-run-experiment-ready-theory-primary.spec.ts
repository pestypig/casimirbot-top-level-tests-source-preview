import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_PREDICTION_FREEZE_CONTRACT_VERSION,
  NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_MANIFEST_EXECUTION_PLAN_ROLES,
  buildNhm2ExperimentReadyTheoryCandidateManifest,
  buildNhm2ExperimentReadyTheoryCandidateNumericPolicySetArtifact,
  nhm2ExperimentReadyTheoryCandidateReceiptIdForRequest,
  type Nhm2ExperimentReadyTheoryCandidateBindingsV1,
  type Nhm2ExperimentReadyTheoryCandidateEvidenceRole,
  type Nhm2ExperimentReadyTheoryCandidateExecutionPlanRole,
  type Nhm2ExperimentReadyTheoryCandidateExecutionPlanV1,
} from "../shared/contracts/nhm2-experiment-ready-theory-candidate-manifest.v1";
import {
  NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_CONTRACT_VERSIONS,
  NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_IDS,
} from "../shared/contracts/nhm2-experiment-ready-theory-closure.v1";
import { isNhm2FullApparatusSourceTensor } from "../shared/contracts/nhm2-full-apparatus-source-tensor.v1";
import { isNhm2SemiclassicalStateRealizabilityV2 as isNhm2SemiclassicalStateRealizability } from "../shared/contracts/nhm2-semiclassical-state-realizability.v2";
import { isNhm2CovariantConservation } from "../shared/contracts/nhm2-covariant-conservation.v1";
import { isNhm2ContinuousObserverOptimizer } from "../shared/contracts/nhm2-continuous-observer-optimizer.v1";
import { isNhm2WorldlineQeiCoverage } from "../shared/contracts/nhm2-worldline-qei-coverage.v1";
import { isNhm2DynamicBackreactionStabilityCausality } from "../shared/contracts/nhm2-dynamic-backreaction-stability-causality.v1";
import { isCasimirFiniteTemperatureFiniteGeometryMaxwellStress } from "../shared/contracts/casimir-finite-temperature-finite-geometry-maxwell-stress.v1";
import { isNhm2MechanicalSupportControlMargin } from "../shared/contracts/nhm2-mechanical-support-control-margin.v1";
import {
  buildNhm2PredictionFalsifierFreeze,
  isNhm2PredictionFalsifierFreeze,
  type BuildNhm2PredictionFalsifierFreezeInput,
} from "../shared/contracts/nhm2-prediction-falsifier-freeze.v1";
import {
  NHM2_ALPHA07_HISTORICAL_RUNTIME_ID,
  NHM2_ALPHA07_IMPORT_MANIFEST_PATH,
  NHM2_ALPHA07_SOURCE_COMMIT,
} from "../shared/theory/nhm2-alpha07-historical-import-governance";
import {
  NHM2_EXPERIMENT_READY_THEORY_PRIMARY_RUNTIME_ID,
  NHM2_EXPERIMENT_READY_THEORY_PRIMARY_SCRIPT,
  NHM2_PRIMARY_RAW_SOLVER_SUITE_PRODUCER_MISSING,
  deriveNhm2PrimaryProducerSummaryState,
  runNhm2LegacyGovernedPrimaryScaffoldForContractTest,
  runNhm2ExperimentReadyTheoryPrimary,
} from "../tools/nhm2/run-experiment-ready-theory-primary";

const temporaryRoots: string[] = [];
const hash = (bytes: Buffer | string): string =>
  createHash("sha256").update(bytes).digest("hex");
const hashFor = (index: number): string => index.toString(16).padStart(64, "0");
const jsonBytes = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

const makePredictionInput = (): BuildNhm2PredictionFalsifierFreezeInput => ({
  generatedAt: "2026-07-19T12:00:00.000Z",
  frozenAt: "2026-07-19T11:58:00.000Z",
  dataCollectionOpensAt: "2026-07-19T13:00:00.000Z",
  selectedProfileId: "stage1_centerline_alpha_0p7000_candidate_v1",
  freezeId: "nhm2-alpha07-freeze-v1",
  registrationBinding: {
    candidateId: "nhm2-alpha07-candidate-v1",
    candidateManifestPath: "candidate/candidate-manifest.v1.json",
    candidateManifestSha256: "7".repeat(64),
    runId: "placeholder-primary-run",
    requestId: "placeholder-primary-request",
    receiptId: nhm2ExperimentReadyTheoryCandidateReceiptIdForRequest(
      NHM2_EXPERIMENT_READY_THEORY_PRIMARY_RUNTIME_ID,
      "placeholder-primary-request",
    ),
    runtimeId: NHM2_EXPERIMENT_READY_THEORY_PRIMARY_RUNTIME_ID,
    plannedOutputDirectory: "candidate/runs/placeholder-primary-run",
  },
  model: {
    modelId: "nhm2-alpha07-apparatus-model-v1",
    modelVersion: "0.1.0-blocked",
    solverId: "nhm2-primary-theory-solver",
    solverVersion: "0.1.0",
    sourceCommitSha: "a".repeat(40),
    definitionRef: null,
    inputManifestRef: null,
  },
  parameterSet: {
    parameterSetId: "nhm2-alpha07-parameter-set-v1",
    parameterCount: 0,
    manifestRef: null,
  },
  observables: [],
  uncertaintyBudget: {
    uncertaintyBudgetId: "nhm2-alpha07-uncertainty-budget-v1",
    method: "not yet computed",
    coverageProbability: 0.95,
    sourceIds: [],
    observableIds: [],
    budgetRef: null,
    covarianceRef: null,
  },
  nullControlPlan: { controls: [], planRef: null },
  blindingPlan: {
    blindedFieldIds: [],
    unblindingTrigger: "not yet registered",
    keyCustodianRole: "unassigned",
    analysisRole: "unassigned",
    experimentRole: "unassigned",
    planRef: null,
  },
  decisionPlan: {
    multiplicityMethod: "not yet frozen",
    familywiseAlpha: 0.05,
    rules: [],
    planRef: null,
  },
  falsifierRegistry: { falsifiers: [], registryRef: null },
  registrationReceipts: [],
  analysisCode: {
    repository: "casimirbot/NHM2",
    sourceCommitSha: "a".repeat(40),
    entrypoint: "tools/nhm2/run-experiment-ready-theory-primary.ts",
    deterministicSeedPolicy: "frozen plan seed policy",
    sourceTreeRef: null,
    dependencyLockRef: null,
    environmentRef: null,
    protocolRef: null,
  },
  supersessionPolicy: {
    policyId: "nhm2-freeze-supersession-v1",
    policyRef: null,
  },
  freezeManifestRef: null,
});

const planRoleForEvidence = (
  role: Nhm2ExperimentReadyTheoryCandidateEvidenceRole,
): Nhm2ExperimentReadyTheoryCandidateExecutionPlanRole =>
  role === "independent_numerical_replication"
    ? "independent_numerical"
    : role === "formal_manifest_certificate"
      ? "formal_kernel"
      : "primary_numerical";

type Fixture = {
  root: string;
  manifestPath: string;
  manifestSha256: string;
  primaryPlan: Nhm2ExperimentReadyTheoryCandidateExecutionPlanV1;
  environment: NodeJS.ProcessEnv;
};

const buildFixture = async (options?: {
  outputOutsideCandidate?: boolean;
}): Promise<Fixture> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nhm2-primary-"));
  temporaryRoots.push(root);
  const candidateRoot = "candidate";
  const manifestPath = `${candidateRoot}/candidate-manifest.v1.json`;
  const candidateId = "nhm2-alpha07-candidate-v1";
  const profileId = "stage1_centerline_alpha_0p7000_candidate_v1";
  const inputDirectory = `${candidateRoot}/inputs`;
  await fs.mkdir(path.join(root, inputDirectory), { recursive: true });

  const predictionInput = makePredictionInput();
  const seedArtifact = buildNhm2PredictionFalsifierFreeze(predictionInput);
  expect(isNhm2PredictionFalsifierFreeze(seedArtifact)).toBe(true);
  expect(seedArtifact.readiness.predictionFreezeReady).toBe(false);
  const {
    generatedAt: _generatedAt,
    registrationBinding: _registrationBinding,
    ...predictionSemanticInput
  } = predictionInput;
  const predictionPath = `${inputDirectory}/prediction-falsifier-freeze.semantic-input.v1.json`;
  const predictionSemanticInputWrapper = {
    artifactId: "nhm2.prediction_falsifier_freeze_semantic_input",
    contractVersion: "nhm2_prediction_falsifier_freeze_semantic_input/v1",
    predictionFreezeContractVersion:
      NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_PREDICTION_FREEZE_CONTRACT_VERSION,
    semanticSha256: seedArtifact.semanticSha256,
    frozenInput: predictionSemanticInput,
    completionRule: {
      generatedAtMustBeInjectedAtOrAfterFrozenAt: true,
      registrationBindingMustComeFromPrimaryPlan: true,
      candidateManifestRawSha256MustBeResolvedAfterManifestWrite: true,
      semanticSha256MustRemainUnchangedAfterEnvelopeInjection: true,
    },
    historicalSeedBoundary: {
      importManifestPath: NHM2_ALPHA07_IMPORT_MANIFEST_PATH,
      runtimeId: NHM2_ALPHA07_HISTORICAL_RUNTIME_ID,
      sourceCommitSha: NHM2_ALPHA07_SOURCE_COMMIT,
      boundToExecution: false,
      artifactFreshness: "preexisting",
      diagnosticSeedOnly: true,
    },
    claimBoundary: {
      semanticInputOnly: true,
      theoryClosureClaimAllowed: false,
      empiricalValidationClaimAllowed: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
      routeEtaClaimAllowed: false,
      speedAuthorityClaimAllowed: false,
    },
  } as const;
  const predictionBytes = jsonBytes(predictionSemanticInputWrapper);
  await fs.writeFile(path.join(root, predictionPath), predictionBytes);

  const candidateDescriptorPath = `${inputDirectory}/candidate-definition.v1.json`;
  const candidateDescriptor = {
    artifactId: "nhm2.candidate_definition",
    contractVersion: "nhm2_candidate_definition/v1",
    candidateId,
    historicalAlpha07Role: "diagnostic_seed_only_not_execution_evidence",
    predictionFreezeSemanticInput: {
      path: predictionPath,
      sha256: hash(predictionBytes),
      semanticSha256: seedArtifact.semanticSha256,
    },
  };
  const candidateDescriptorBytes = jsonBytes(candidateDescriptor);
  await fs.writeFile(
    path.join(root, candidateDescriptorPath),
    candidateDescriptorBytes,
  );

  const bindings: Nhm2ExperimentReadyTheoryCandidateBindingsV1 = {
    candidate: {
      artifactId: "nhm2.candidate_definition",
      contractVersion: "nhm2_candidate_definition/v1",
      path: candidateDescriptorPath,
      sha256: hash(candidateDescriptorBytes),
      candidateId,
    },
    profile: {
      artifactId: "nhm2.selected_profile",
      contractVersion: "nhm2_selected_profile/v1",
      path: `${inputDirectory}/selected-profile.v1.json`,
      sha256: hashFor(2),
      selectedProfileId: profileId,
    },
    chart: {
      artifactId: "nhm2.chart_definition",
      contractVersion: "nhm2_chart_definition/v1",
      path: `${inputDirectory}/chart.v1.json`,
      sha256: hashFor(3),
      chartId: "nhm2-asymptotic-cartesian-v1",
    },
    atlas: {
      artifactId: "nhm2.mask_atlas",
      contractVersion: "nhm2_mask_atlas/v1",
      path: `${inputDirectory}/atlas.v1.json`,
      sha256: hashFor(4),
      atlasId: "nhm2-alpha07-atlas-v1",
    },
    units: {
      artifactId: "nhm2.units",
      contractVersion: "nhm2_units/v1",
      path: `${inputDirectory}/units.v1.json`,
      sha256: hashFor(5),
      unitsId: "nhm2-si-stress-energy-v1",
    },
    normalization: {
      artifactId: "nhm2.normalization",
      contractVersion: "nhm2_normalization/v1",
      path: `${inputDirectory}/normalization.v1.json`,
      sha256: hashFor(6),
      normalizationId: "nhm2-full-apparatus-normalization-v1",
    },
  };

  const runtimeFor = (
    role: Nhm2ExperimentReadyTheoryCandidateExecutionPlanRole,
  ) =>
    `nhm2.experiment_ready_theory.${
      role === "primary_numerical"
        ? "primary"
        : role === "independent_numerical"
          ? "independent"
          : "formal"
    }`;
  const scriptFor = (
    role: Nhm2ExperimentReadyTheoryCandidateExecutionPlanRole,
  ) =>
    `warp:full-solve:nhm2:theory-candidate:${
      role === "primary_numerical"
        ? "primary"
        : role === "independent_numerical"
          ? "independent"
          : "formal"
    }`;
  const executionPlans =
    NHM2_EXPERIMENT_READY_THEORY_CANDIDATE_MANIFEST_EXECUTION_PLAN_ROLES.map(
      (role, index): Nhm2ExperimentReadyTheoryCandidateExecutionPlanV1 => {
        const runtimeId = runtimeFor(role);
        const requestId = `nhm2-${role}-request-v1`;
        const runId = `nhm2-${role}-run-v1`;
        const receiptId = nhm2ExperimentReadyTheoryCandidateReceiptIdForRequest(
          runtimeId,
          requestId,
        );
        const script = scriptFor(role);
        const outputDirectory =
          options?.outputOutsideCandidate && role === "primary_numerical"
            ? `outside-candidate/runs/${runId}`
            : `${candidateRoot}/runs/${runId}`;
        return {
          planRole: role,
          requestId,
          runId,
          receiptId,
          runtimeId,
          sourceCommitSha: (index + 10).toString(16).repeat(40).slice(0, 40),
          deterministicSeedPolicy: `frozen-seed:${role}`,
          solver: {
            artifactId: `nhm2.${role}_solver`,
            contractVersion: `nhm2_${role}_solver/v1`,
            path: `${inputDirectory}/${role}-solver.v1.json`,
            sha256: hashFor(index + 10),
            solverId: `nhm2-${role}-solver`,
            solverVersion: "1.0.0",
            implementationId: `casimirbot-${role}-implementation-v1`,
          },
          environmentLock: {
            artifactId: `nhm2.${role}_environment`,
            contractVersion: `nhm2_${role}_environment/v1`,
            path: `${inputDirectory}/${role}-environment.v1.json`,
            sha256: hashFor(index + 20),
            environmentId: `nhm2-${role}-environment-v1`,
          },
          expectedInvocation: {
            entrypoint: `npm run ${script} -- --candidate-manifest ${manifestPath}`,
            command: "npm",
            args: [
              "run",
              "-s",
              script,
              "--",
              "--candidate-manifest",
              manifestPath,
            ],
            cwd: ".",
            environment: [
              {
                name: "NHM2_ATLAS_SHA256",
                valueKind: "literal",
                value: bindings.atlas.sha256,
              },
              {
                name: "NHM2_CANDIDATE_ID",
                valueKind: "literal",
                value: candidateId,
              },
              {
                name: "NHM2_CANDIDATE_MANIFEST_SHA256",
                valueKind: "candidate_manifest_raw_sha256",
                value: null,
              },
              {
                name: "NHM2_CHART_ID",
                valueKind: "literal",
                value: bindings.chart.chartId,
              },
              {
                name: "NHM2_NORMALIZATION_SHA256",
                valueKind: "literal",
                value: bindings.normalization.sha256,
              },
              {
                name: "NHM2_OUTPUT_DIR",
                valueKind: "literal",
                value: outputDirectory,
              },
              { name: "NHM2_RUN_ID", valueKind: "literal", value: runId },
              {
                name: "NHM2_SELECTED_PROFILE_ID",
                valueKind: "literal",
                value: profileId,
              },
              {
                name: "NHM2_UNITS_SHA256",
                valueKind: "literal",
                value: bindings.units.sha256,
              },
              {
                name: "THEORY_RUNTIME_ID",
                valueKind: "literal",
                value: runtimeId,
              },
              {
                name: "THEORY_RUNTIME_RECEIPT_ID",
                valueKind: "literal",
                value: receiptId,
              },
              {
                name: "THEORY_RUNTIME_REQUEST_ID",
                valueKind: "literal",
                value: requestId,
              },
            ],
            outputDirectory,
          },
        };
      },
    );

  const policy =
    buildNhm2ExperimentReadyTheoryCandidateNumericPolicySetArtifact(
      "nhm2-alpha07-policy-v1",
    );
  const policyPath = `${inputDirectory}/numeric-policy.v1.json`;
  const policyBytes = jsonBytes(policy);
  await fs.writeFile(path.join(root, policyPath), policyBytes);
  const manifest = buildNhm2ExperimentReadyTheoryCandidateManifest({
    generatedAt: "2026-07-19T11:59:00.000Z",
    frozenAt: "2026-07-19T12:00:00.000Z",
    manifestId: "nhm2-alpha07-experiment-ready-theory-candidate-v1",
    bindings,
    executionPlans,
    expectedEvidenceOutputs:
      NHM2_EXPERIMENT_READY_THEORY_CLOSURE_EVIDENCE_IDS.map((evidenceRole) => {
        const plan = executionPlans.find(
          (entry) => entry.planRole === planRoleForEvidence(evidenceRole),
        );
        if (plan == null) throw new Error(`Missing plan for ${evidenceRole}.`);
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
      }),
    predictionFreezeCommitment: {
      contractVersion: "nhm2_prediction_falsifier_freeze/v1",
      semanticSha256: seedArtifact.semanticSha256,
      frozenAt: predictionInput.frozenAt,
    },
    numericCheckPolicySet: {
      artifactId: policy.artifactId,
      contractVersion: policy.contractVersion,
      policySetId: policy.policySetId,
      artifactPath: policyPath,
      artifactRawSha256: hash(policyBytes),
      semanticSha256: policy.semanticSha256,
    },
    supersession: {
      policyId: "nhm2-theory-candidate-supersession-v1",
      policyPath: `${inputDirectory}/supersession-policy.v1.json`,
      policyContractVersion: "nhm2_theory_candidate_supersession/v1",
      policySha256: hashFor(60),
      originalManifestImmutable: true,
      inPlaceMutationForbidden: true,
      supersedingManifestRequiresNewManifestId: true,
      supersedingManifestRequiresPredecessorSha256: true,
      predecessorManifestId: null,
      predecessorManifestSha256: null,
    },
  });
  const manifestBytes = jsonBytes(manifest);
  await fs.writeFile(path.join(root, manifestPath), manifestBytes);
  const manifestSha256 = hash(manifestBytes);
  const primaryPlan = executionPlans.find(
    (entry) => entry.planRole === "primary_numerical",
  );
  if (primaryPlan == null) throw new Error("Fixture primary plan missing.");
  const environment = Object.fromEntries(
    primaryPlan.expectedInvocation.environment.map((entry) => [
      entry.name,
      entry.valueKind === "candidate_manifest_raw_sha256"
        ? manifestSha256
        : (entry.value ?? ""),
    ]),
  );
  return { root, manifestPath, manifestSha256, primaryPlan, environment };
};

const listFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(absolute);
    }
  };
  await walk(root);
  return files.sort();
};

const validatorFor = (role: string): ((value: unknown) => boolean) => {
  switch (role) {
    case "full_apparatus_source_tensor":
      return isNhm2FullApparatusSourceTensor;
    case "semiclassical_state":
      return isNhm2SemiclassicalStateRealizability;
    case "covariant_conservation":
      return isNhm2CovariantConservation;
    case "continuous_observer_optimizer":
      return isNhm2ContinuousObserverOptimizer;
    case "worldline_qei":
      return isNhm2WorldlineQeiCoverage;
    case "dynamic_backreaction_stability_causality":
      return isNhm2DynamicBackreactionStabilityCausality;
    case "finite_temperature_finite_geometry_maxwell_stress":
      return isCasimirFiniteTemperatureFiniteGeometryMaxwellStress;
    case "mechanical_support_control_margin":
      return isNhm2MechanicalSupportControlMargin;
    case "prediction_falsifier_freeze":
      return isNhm2PredictionFalsifierFreeze;
    default:
      throw new Error(`No validator for ${role}.`);
  }
};

const rebindMutatedPredictionWrapper = async (
  fixture: Fixture,
  mutate: (wrapper: Record<string, unknown>) => void,
): Promise<NodeJS.ProcessEnv> => {
  const predictionPath = path.join(
    fixture.root,
    "candidate/inputs/prediction-falsifier-freeze.semantic-input.v1.json",
  );
  const descriptorPath = path.join(
    fixture.root,
    "candidate/inputs/candidate-definition.v1.json",
  );
  const manifestPath = path.join(fixture.root, fixture.manifestPath);
  const wrapper = JSON.parse(
    (await fs.readFile(predictionPath)).toString("utf8"),
  ) as Record<string, unknown>;
  mutate(wrapper);
  const wrapperBytes = jsonBytes(wrapper);
  await fs.writeFile(predictionPath, wrapperBytes);

  const descriptor = JSON.parse(
    (await fs.readFile(descriptorPath)).toString("utf8"),
  ) as {
    predictionFreezeSemanticInput: { sha256: string };
  };
  descriptor.predictionFreezeSemanticInput.sha256 = hash(wrapperBytes);
  const descriptorBytes = jsonBytes(descriptor);
  await fs.writeFile(descriptorPath, descriptorBytes);

  const manifest = JSON.parse(
    (await fs.readFile(manifestPath)).toString("utf8"),
  ) as { bindings: { candidate: { sha256: string } } };
  manifest.bindings.candidate.sha256 = hash(descriptorBytes);
  const manifestBytes = jsonBytes(manifest);
  await fs.writeFile(manifestPath, manifestBytes);
  return {
    ...fixture.environment,
    NHM2_CANDIDATE_MANIFEST_SHA256: hash(manifestBytes),
  };
};

describe("NHM2 primary producer terminal-state derivation", () => {
  it("admits a ready primary lane only from eight passes, a ready freeze, and no blockers", () => {
    expect(
      deriveNhm2PrimaryProducerSummaryState({
        physicsDispositions: Array.from({ length: 8 }, () => "pass"),
        predictionDisposition: "ready",
        blockers: [],
      }),
    ).toEqual({ status: "ready", blockers: [] });
  });

  it("distinguishes falsification from incomplete evidence", () => {
    expect(
      deriveNhm2PrimaryProducerSummaryState({
        physicsDispositions: [
          "pass",
          "pass",
          "fail",
          "pass",
          "pass",
          "pass",
          "pass",
          "pass",
        ],
        predictionDisposition: "ready",
        blockers: ["covariant_conservation:residual_above_tolerance"],
      }).status,
    ).toBe("falsified");
    expect(
      deriveNhm2PrimaryProducerSummaryState({
        physicsDispositions: [
          "pass",
          "pass",
          "blocked",
          "pass",
          "pass",
          "pass",
          "pass",
          "pass",
        ],
        predictionDisposition: "ready",
        blockers: ["covariant_conservation:raw_array_missing"],
      }).status,
    ).toBe("not_ready");
  });

  it("rejects incoherent disposition counts and blocker cardinality", () => {
    expect(() =>
      deriveNhm2PrimaryProducerSummaryState({
        physicsDispositions: ["pass"],
        predictionDisposition: "ready",
        blockers: [],
      }),
    ).toThrow(/exactly eight/i);
    expect(() =>
      deriveNhm2PrimaryProducerSummaryState({
        physicsDispositions: Array.from({ length: 8 }, () => "pass"),
        predictionDisposition: "ready",
        blockers: ["stale_blocker"],
      }),
    ).toThrow(/cannot retain blockers/i);
    expect(() =>
      deriveNhm2PrimaryProducerSummaryState({
        physicsDispositions: Array.from({ length: 8 }, () => "blocked"),
        predictionDisposition: "not_ready",
        blockers: [],
      }),
    ).toThrow(/concrete blocker/i);
    expect(() =>
      deriveNhm2PrimaryProducerSummaryState({
        physicsDispositions: Array.from({ length: 8 }, () => "blocked"),
        predictionDisposition: "not_ready",
        blockers: [" malformed"],
      }),
    ).toThrow(/invalid blocker/i);
  });
});

describe("NHM2 experiment-ready theory primary producer", () => {
  it("fails production before writing when the genuine raw solver-suite producer is absent", async () => {
    const fixture = await buildFixture();
    const outputRoot = path.join(
      fixture.root,
      fixture.primaryPlan.expectedInvocation.outputDirectory,
    );

    await expect(
      runNhm2ExperimentReadyTheoryPrimary({
        workspaceRoot: fixture.root,
        manifestPath: fixture.manifestPath,
        environment: fixture.environment,
      }),
    ).rejects.toThrow(NHM2_PRIMARY_RAW_SOLVER_SUITE_PRODUCER_MISSING);
    await expect(fs.lstat(outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects the legacy contract-test scaffold in the canonical checkout", async () => {
    await expect(
      runNhm2LegacyGovernedPrimaryScaffoldForContractTest({
        workspaceRoot: process.cwd(),
        manifestPath: "candidate-manifest.v1.json",
      }),
    ).rejects.toThrow(
      /legacy_governed_primary_scaffold_forbidden_outside_contract_tests/,
    );
  });

  it("keeps the legacy governed-wrapper builder confined to contract tests", async () => {
    const fixture = await buildFixture();
    const result = await runNhm2LegacyGovernedPrimaryScaffoldForContractTest({
      workspaceRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      environment: fixture.environment,
    });
    const outputRoot = path.join(
      fixture.root,
      fixture.primaryPlan.expectedInvocation.outputDirectory,
    );
    const files = await listFiles(outputRoot);

    expect(result.artifacts).toHaveLength(9);
    expect(files).toHaveLength(9);
    expect(result.status).toBe("not_ready");
    expect(
      Buffer.byteLength(`${JSON.stringify(result, null, 2)}\n`, "utf8"),
    ).toBeLessThan(64_000);
    expect(
      result.artifacts
        .filter((entry) => entry.evidenceRole !== "prediction_falsifier_freeze")
        .every(
          (entry) =>
            entry.disposition === "blocked" || entry.disposition === "fail",
        ),
    ).toBe(true);
    expect(result.claimBoundary).toMatchObject({
      historicalAlpha07PackageIsExecutionEvidence: false,
      idealParallelPlateScalarIsAuthority: false,
      experimentReadyTheoryClosureClaimAllowed: false,
      physicalViabilityClaimAllowed: false,
      transportClaimAllowed: false,
      propulsionClaimAllowed: false,
    });

    for (const entry of result.artifacts) {
      const bytes = await fs.readFile(
        path.join(fixture.root, entry.outputPath),
      );
      const value = JSON.parse(bytes.toString("utf8")) as unknown;
      expect(hash(bytes)).toBe(entry.sha256);
      expect(validatorFor(entry.evidenceRole)(value)).toBe(true);
      if (entry.evidenceRole === "full_apparatus_source_tensor") {
        const blocked = value as {
          sourceTensor: { rawTotalTensorArray: Record<string, unknown> };
          metricComparison: Record<string, Record<string, unknown>>;
          evolutionCoupling: Record<string, Record<string, unknown>>;
          status: string;
        };
        const unproducedArrays = [
          blocked.sourceTensor.rawTotalTensorArray,
          blocked.metricComparison.rawMetricTensorArray,
          blocked.metricComparison.rawRequiredSourceTensorArray,
          blocked.metricComparison.rawAbsoluteResidualArray,
          blocked.metricComparison.rawRelativeResidualArray,
          blocked.evolutionCoupling.coupledStateArray,
          blocked.evolutionCoupling.couplingResidualArray,
        ];
        for (const array of unproducedArrays) {
          expect(array).toEqual({
            path: null,
            sha256: null,
            dtype: null,
            shape: [],
            sizeBytes: null,
            storageOrder: null,
            componentOrder: [],
          });
        }
        expect(blocked.status).not.toBe("pass");
      } else if (entry.evidenceRole === "prediction_falsifier_freeze") {
        expect((value as { semanticSha256: string }).semanticSha256).toBe(
          (
            JSON.parse(
              (
                await fs.readFile(path.join(fixture.root, fixture.manifestPath))
              ).toString("utf8"),
            ) as { predictionFreezeCommitment: { semanticSha256: string } }
          ).predictionFreezeCommitment.semanticSha256,
        );
        expect(
          (value as { readiness: { predictionFreezeReady: boolean } }).readiness
            .predictionFreezeReady,
        ).toBe(false);
      } else {
        expect((value as { status: string }).status).not.toBe("pass");
      }
    }
  });

  it("rejects a changed raw manifest hash and a tampered executor environment", async () => {
    const changed = await buildFixture();
    await fs.appendFile(path.join(changed.root, changed.manifestPath), "\n");
    await expect(
      runNhm2LegacyGovernedPrimaryScaffoldForContractTest({
        workspaceRoot: changed.root,
        manifestPath: changed.manifestPath,
        environment: changed.environment,
      }),
    ).rejects.toThrow(/NHM2_CANDIDATE_MANIFEST_SHA256/i);

    const tampered = await buildFixture();
    await expect(
      runNhm2LegacyGovernedPrimaryScaffoldForContractTest({
        workspaceRoot: tampered.root,
        manifestPath: tampered.manifestPath,
        environment: { ...tampered.environment, NHM2_RUN_ID: "tampered-run" },
      }),
    ).rejects.toThrow(/NHM2_RUN_ID/i);
  });

  it("rejects a governed semantic-input wrapper that promotes the historical seed to execution evidence", async () => {
    const fixture = await buildFixture();
    const environment = await rebindMutatedPredictionWrapper(
      fixture,
      (wrapper) => {
        const boundary = wrapper.historicalSeedBoundary as Record<
          string,
          unknown
        >;
        boundary.boundToExecution = true;
      },
    );

    await expect(
      runNhm2LegacyGovernedPrimaryScaffoldForContractTest({
        workspaceRoot: fixture.root,
        manifestPath: fixture.manifestPath,
        environment,
      }),
    ).rejects.toThrow(/historicalSeedBoundary/i);
  });

  it("rejects a nonempty preallocated output directory before writing", async () => {
    const fixture = await buildFixture();
    const outputRoot = path.join(
      fixture.root,
      fixture.primaryPlan.expectedInvocation.outputDirectory,
    );
    await fs.mkdir(outputRoot, { recursive: true });
    await fs.writeFile(path.join(outputRoot, "preexisting.json"), "{}\n");

    await expect(
      runNhm2LegacyGovernedPrimaryScaffoldForContractTest({
        workspaceRoot: fixture.root,
        manifestPath: fixture.manifestPath,
        environment: fixture.environment,
      }),
    ).rejects.toThrow(/initially empty/i);
    expect(await listFiles(outputRoot)).toEqual([
      path.join(outputRoot, "preexisting.json"),
    ]);
  });

  it("rejects a valid manifest whose primary output tree is outside the candidate tree", async () => {
    const fixture = await buildFixture({ outputOutsideCandidate: true });
    await expect(
      runNhm2LegacyGovernedPrimaryScaffoldForContractTest({
        workspaceRoot: fixture.root,
        manifestPath: fixture.manifestPath,
        environment: fixture.environment,
      }),
    ).rejects.toThrow(/beneath the candidate manifest directory/i);
    await expect(
      fs.stat(
        path.join(
          fixture.root,
          fixture.primaryPlan.expectedInvocation.outputDirectory,
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
