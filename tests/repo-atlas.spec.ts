import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRepoAtlasFromSources, isDirectExecution as isBuildDirectExecution } from "../scripts/repo-atlas-build";
import {
  evaluateRegressionGate,
  loadCorpus,
  runAtlasBench,
  selectSampleTasks,
  validateCorpus,
  type AtlasBenchCorpus,
} from "../scripts/atlas-bench";
import {
  firstDivergenceG4,
  isDirectExecution as isQueryDirectExecution,
  loadAtlas,
  resolveIdentifier,
  traceIdentifier,
  whyIdentifier,
} from "../scripts/repo-atlas-query";

const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", "repo-atlas.fixture.json");
const canonicalDivergenceFixture = {
  wave: "A",
  rhoSource: "warp.metric.T00.natario.shift",
  metricT00Ref: "warp.metric.T00.natario.shift",
  metricT00Si_Jm3: -1.87466334759679e17,
  lhs_Jm3: -7.498650107089216e16,
  boundComputed_Jm3: -24,
  K: 3.8e-30,
  tau_s: 0.005,
  boundUsed_Jm3: -7.498650107089216e16,
  boundFloorApplied: true,
  boundPolicyFloor_Jm3: -7.498650107089216e16,
  boundFloor_Jm3: -7.498650107089216e16,
  marginRatioRawComputed: 3124437544620506.5,
  marginRatioRaw: 1,
  applicabilityStatus: "PASS",
  reasonCode: ["G4_QI_MARGIN_EXCEEDED"],
};

describe("repo atlas", () => {
  it("builds deterministic shape for fixed source payload", () => {
    const atlas = buildRepoAtlasFromSources({
      generatedAt: "2026-01-01T00:00:00.000Z",
      commitHash: "abc123",
      repoIndex: [
        {
          id: "doc:one",
          kind: "doc",
          title: "Doc One",
          summary: "",
          body: "",
          tags: ["doc"],
          source: { path: "docs/one.md" },
          tokens: [],
          embedding: null,
        },
      ],
      repoGraph: {
        builtAt: 0,
        nodes: [{ id: "docs/one.md", kind: "file", name: "one.md", path: "docs/one.md" }],
        edges: [],
      },
      codeLattice: {
        version: "code-lattice/0.1.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        repoRoot: ".",
        commit: "abc123",
        filesIndexed: 1,
        nodes: [],
        edges: [],
        envelopes: [],
        latticeVersion: 1,
      },
    });

    expect(atlas.version).toBe("repo-atlas/1");
    expect(atlas.snapshot.commitHash).toBe("abc123");
    expect(atlas.snapshot.repoGraphBuiltAt).toBe(0);
    expect(atlas.snapshot.treeDagWalkLoaded).toBe(false);
    expect(atlas.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "file:docs/one.md",
        "index:doc:one",
        "gate:G4_QI_margin",
        "value:boundComputed_Jm3",
        "value:boundUsed_Jm3",
        "value:lhs_Jm3",
        "value:marginRatioRaw",
        "value:rhoSource",
      ]),
    );
    expect(atlas.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(
      expect.arrayContaining([
        "value:boundComputed_Jm3->value:boundUsed_Jm3",
        "value:boundUsed_Jm3->value:marginRatioRaw",
        "value:lhs_Jm3->value:boundComputed_Jm3",
        "value:marginRatioRaw->gate:G4_QI_margin",
        "value:rhoSource->value:lhs_Jm3",
        "index:doc:one->file:docs/one.md",
      ]),
    );
  });

  it("extracts stage hints and ingests tree DAG walk edges", () => {
    const atlas = buildRepoAtlasFromSources({
      generatedAt: "2026-01-01T00:00:00.000Z",
      commitHash: "abc123",
      repoIndex: [
        {
          id: "artifact:sample",
          kind: "artifact",
          title: "Sample",
          summary: "Tracks lhs_Jm3 from rhoSource for reporting",
          body: "",
          tags: [],
          source: { path: "artifacts/sample.json" },
          tokens: [],
          embedding: null,
        },
      ],
      repoGraph: {
        builtAt: 123,
        nodes: [],
        edges: [],
      },
      codeLattice: {
        version: "code-lattice/0.1.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        repoRoot: ".",
        commit: "abc123",
        filesIndexed: 1,
        nodes: [],
        edges: [],
        envelopes: [],
        latticeVersion: 1,
      },
      treeDagWalk: {
        visited: [
          {
            id: "lhs_Jm3",
            depth: 1,
            via: {
              source: "rhoSource",
              target: "lhs_Jm3",
              edgeType: "derives",
              note: "QI sample stage",
            },
          },
        ],
      },
    });

    expect(atlas.snapshot.treeDagWalkLoaded).toBe(true);
    expect(atlas.nodes.find((node) => node.id === "index:artifact:sample")?.stageHints).toEqual([
      "S0_source",
      "S1_qi_sample",
    ]);
    expect(atlas.nodes.find((node) => node.id === "tree:rhoSource")?.stageHints).toEqual(["S0_source", "S1_qi_sample"]);
    expect(atlas.nodes.find((node) => node.id === "tree:lhs_Jm3")?.stageHints).toEqual(["S0_source", "S1_qi_sample"]);
    expect(atlas.edges.some((edge) => edge.source === "tree:rhoSource" && edge.target === "tree:lhs_Jm3")).toBe(true);
  });

  it("indexes quoted TS path literals for the HaloBank proof tree", () => {
    const atlas = buildRepoAtlasFromSources({
      generatedAt: "2026-01-01T00:00:00.000Z",
      commitHash: "abc123",
      repoIndex: [],
      repoGraph: {
        builtAt: 0,
        nodes: [],
        edges: [],
      },
      codeLattice: {
        version: "code-lattice/0.1.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        repoRoot: ".",
        commit: "abc123",
        filesIndexed: 0,
        nodes: [],
        edges: [],
        envelopes: [],
        latticeVersion: 1,
      },
    });

    expect(resolveIdentifier(atlas, "docs/knowledge/halobank-solar-proof-tree.json")?.id).toBe(
      "file:docs/knowledge/halobank-solar-proof-tree.json",
    );
    expect(
      atlas.edges.some(
        (edge) =>
          edge.source === "file:scripts/paper-framework-binding.ts"
          && edge.target === "file:docs/knowledge/halobank-solar-proof-tree.json"
          && edge.sourceSystem === "script-doc-ref",
      ),
    ).toBe(true);
  });

  it("indexes quoted TS path literals for the microphysics transport plan", () => {
    const atlas = buildRepoAtlasFromSources({
      generatedAt: "2026-01-01T00:00:00.000Z",
      commitHash: "abc123",
      repoIndex: [],
      repoGraph: {
        builtAt: 0,
        nodes: [],
        edges: [],
      },
      codeLattice: {
        version: "code-lattice/0.1.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        repoRoot: ".",
        commit: "abc123",
        filesIndexed: 0,
        nodes: [],
        edges: [],
        envelopes: [],
        latticeVersion: 1,
      },
    });

    expect(resolveIdentifier(atlas, "docs/architecture/microphysics-hamiltonian-transport-observables-plan.md")?.id).toBe(
      "file:docs/architecture/microphysics-hamiltonian-transport-observables-plan.md",
    );
    expect(
      atlas.edges.some(
        (edge) =>
          edge.source === "file:scripts/paper-gpt-pro-packet.ts"
          && edge.target === "file:docs/architecture/microphysics-hamiltonian-transport-observables-plan.md"
          && edge.sourceSystem === "script-doc-ref",
      ),
    ).toBe(true);
  });

  it("indexes quoted TS path literals for the microphysics transport tree", () => {
    const atlas = buildRepoAtlasFromSources({
      generatedAt: "2026-01-01T00:00:00.000Z",
      commitHash: "abc123",
      repoIndex: [],
      repoGraph: {
        builtAt: 0,
        nodes: [],
        edges: [],
      },
      codeLattice: {
        version: "code-lattice/0.1.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        repoRoot: ".",
        commit: "abc123",
        filesIndexed: 0,
        nodes: [],
        edges: [],
        envelopes: [],
        latticeVersion: 1,
      },
    });

    expect(resolveIdentifier(atlas, "docs/knowledge/physics/physics-microphysics-transport-tree.json")?.id).toBe(
      "file:docs/knowledge/physics/physics-microphysics-transport-tree.json",
    );
    expect(
      atlas.edges.some(
        (edge) =>
          edge.source === "file:scripts/paper-framework-binding.ts"
          && edge.target === "file:docs/knowledge/physics/physics-microphysics-transport-tree.json"
      && edge.sourceSystem === "script-doc-ref",
      ),
    ).toBe(true);
  });

  it("indexes quoted TS path literals for the Orch-OR time-crystal research packet and source audit", () => {
    const atlas = buildRepoAtlasFromSources({
      generatedAt: "2026-01-01T00:00:00.000Z",
      commitHash: "abc123",
      repoIndex: [],
      repoGraph: {
        builtAt: 0,
        nodes: [],
        edges: [],
      },
      codeLattice: {
        version: "code-lattice/0.1.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        repoRoot: ".",
        commit: "abc123",
        filesIndexed: 0,
        nodes: [],
        edges: [],
        envelopes: [],
        latticeVersion: 1,
      },
    });

    expect(resolveIdentifier(atlas, "docs/architecture/orch-or-time-crystal-research-packet.md")?.id).toBe(
      "file:docs/architecture/orch-or-time-crystal-research-packet.md",
    );
    expect(resolveIdentifier(atlas, "docs/audits/research/orch-or-time-crystal-source-packet-2026-03-25.md")?.id).toBe(
      "file:docs/audits/research/orch-or-time-crystal-source-packet-2026-03-25.md",
    );
    expect(resolveIdentifier(atlas, "docs/audits/research/bandyopadhyay-triplet-hierarchy-triage-2026-03-25.md")?.id).toBe(
      "file:docs/audits/research/bandyopadhyay-triplet-hierarchy-triage-2026-03-25.md",
    );
    expect(
      atlas.edges.some(
        (edge) =>
          edge.source === "file:scripts/paper-gpt-pro-packet.ts"
          && edge.target === "file:docs/architecture/orch-or-time-crystal-research-packet.md"
          && edge.sourceSystem === "script-doc-ref",
      ),
    ).toBe(true);
    expect(
      atlas.edges.some(
        (edge) =>
          edge.source === "file:scripts/paper-gpt-pro-packet.ts"
          && edge.target === "file:docs/audits/research/orch-or-time-crystal-source-packet-2026-03-25.md"
          && edge.sourceSystem === "script-doc-ref",
      ),
    ).toBe(true);
    expect(
      atlas.edges.some(
        (edge) =>
          edge.source === "file:scripts/paper-gpt-pro-packet.ts"
          && edge.target === "file:docs/audits/research/bandyopadhyay-triplet-hierarchy-triage-2026-03-25.md"
          && edge.sourceSystem === "script-doc-ref",
      ),
    ).toBe(true);
  });

  it("why returns producer and consumer paths when present", async () => {
    const atlas = await loadAtlas(fixturePath);
    const result = whyIdentifier(atlas, "symbol:consumer");
    expect(result).not.toBeNull();
    expect(result?.producers).toContainEqual(["symbol:consumer", "gate:test-a"]);
    expect(result?.consumers).toContainEqual(["symbol:consumer", "symbol:producer"]);
  });

  it("trace traversal is stable for fixture", async () => {
    const atlas = await loadAtlas(fixturePath);
    const result = traceIdentifier(atlas, "producer", "upstream");
    expect(result).not.toBeNull();
    expect(result?.paths).toEqual([
      ["symbol:producer", "symbol:consumer"],
      ["symbol:producer", "symbol:consumer", "gate:test-a"],
    ]);
  });

  it("prefers exact identifier matches over substring matches", () => {
    const node = resolveIdentifier(
      {
        version: "repo-atlas/1",
        snapshot: {
          generatedAt: "2026-01-01T00:00:00.000Z",
          commitHash: "abc123",
        },
        nodes: [
          { id: "graph:scripts/warp.ts::isMetricRhoSource", kind: "symbol", label: "isMetricRhoSource" },
          { id: "value:rhoSource", kind: "value", label: "rhoSource" },
        ],
        edges: [],
      },
      "rhoSource",
    );

    expect(node?.id).toBe("value:rhoSource");
  });

  it("computes first divergence for the qi margin route", () => {
    const result = firstDivergenceG4(canonicalDivergenceFixture, {
      cases: [
        {
          ...canonicalDivergenceFixture,
          id: "case_0001",
          rhoSource: "warp.metric.T00.natario_sdf.shift",
          metricT00Ref: "warp.metric.T00.natario_sdf.shift",
        },
      ],
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.firstDivergence?.stageId).toBe("S0_source");
    expect(result.firstDivergence?.differingFields).toContain("rhoSource");
  });

  it("supports same-rho-source selection for first divergence", () => {
    const result = firstDivergenceG4(canonicalDivergenceFixture, {
      cases: [
        {
          ...canonicalDivergenceFixture,
          id: "case_mismatch",
          rhoSource: "warp.metric.T00.natario_sdf.shift",
          metricT00Ref: "warp.metric.T00.natario_sdf.shift",
        },
        {
          ...canonicalDivergenceFixture,
          id: "case_match",
        },
      ],
      bestCandidate: { id: "case_mismatch" },
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.recoveryCaseIdSelected).toBe("case_match");
    expect(result.selectionReason).toBe("same_rho_source");
    expect(result.firstDivergence).toBeNull();
  });

  it("direct execution guard handles Windows-style argv paths", () => {
    const buildPath = path.resolve(process.cwd(), "scripts", "repo-atlas-build.ts");
    const queryPath = path.resolve(process.cwd(), "scripts", "repo-atlas-query.ts");
    const buildUrl = pathToFileURL(buildPath).href;
    const queryUrl = pathToFileURL(queryPath).href;

    expect(isBuildDirectExecution(buildUrl, buildPath)).toBe(true);
    expect(isQueryDirectExecution(queryUrl, queryPath)).toBe(true);
    expect(isBuildDirectExecution(buildUrl, queryPath)).toBe(false);
    expect(isQueryDirectExecution(queryUrl, buildPath)).toBe(false);
  });
});


describe("repo atlas benchmark", () => {
  it("loads and validates the repo-wide corpus", async () => {
    const corpus = await loadCorpus();
    expect(corpus.version).toBe("repo-atlas-bench-corpus/1");
    expect(corpus.tasks.length).toBeGreaterThanOrEqual(80);
    expect(new Set(corpus.tasks.map((task) => task.id)).size).toBe(corpus.tasks.length);
  });

  it("selects sampled tasks with hard-gate coverage when available", async () => {
    const corpus = await loadCorpus();
    const sampled = selectSampleTasks(corpus.tasks, 20, { ensureHardGateCoverage: true });
    expect(sampled).toHaveLength(20);
    expect(sampled.some((task) => task.success_check.hard_gate === true)).toBe(true);
  });

  it("rejects invalid corpus payloads", () => {
    const invalid = {
      version: "repo-atlas-bench-corpus/1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [
        {
          id: "dup",
          domain: "docs",
          prompt: "find file",
          expected_files: ["docs/atlas-operator-guide.md"],
          success_check: { file_hit: true },
        },
        {
          id: "dup",
          domain: "docs",
          prompt: "find file",
          expected_files: ["docs/atlas-operator-guide.md"],
          success_check: { file_hit: true },
        },
      ],
    } satisfies AtlasBenchCorpus;

    expect(() => validateCorpus(invalid)).toThrow(/Duplicate or missing task id/);
  });

  it("evaluates regression thresholds correctly", () => {
    const passing = evaluateRegressionGate(
      {
        baseline: {
          lane: "baseline",
          task_count: 20,
          hard_gate_task_count: 8,
          pass_rate: 0.5,
          hard_gate_pass_rate: 0.6,
          median_time_to_first_correct_file_ms: 100,
          p90_time_to_first_correct_file_ms: 200,
          median_time_to_first_valid_patch_ms: 110,
          p90_time_to_first_valid_patch_ms: 210,
          median_files_opened_count: 6,
          median_commands_run_count: 1,
        },
        atlas: {
          lane: "atlas",
          task_count: 20,
          hard_gate_task_count: 8,
          pass_rate: 0.8,
          hard_gate_pass_rate: 0.6,
          median_time_to_first_correct_file_ms: 70,
          p90_time_to_first_correct_file_ms: 120,
          median_time_to_first_valid_patch_ms: 75,
          p90_time_to_first_valid_patch_ms: 130,
          median_files_opened_count: 3,
          median_commands_run_count: 1,
        },
      },
      {
        version: "repo-atlas-bench-policy/1",
        thresholds: {
          median_time_to_first_correct_file_improvement_pct: 25,
          task_pass_rate_improvement_pct: 15,
          hard_gate_pass_rate_drop_allowed_pct: 0,
        },
      },
      {
        hardGateTasksInCorpus: 8,
        hardGateTasksInSample: 8,
      },
    );
    expect(passing.verdict).toBe("PASS");

    const failing = evaluateRegressionGate(
      {
        baseline: {
          lane: "baseline",
          task_count: 20,
          hard_gate_task_count: 8,
          pass_rate: 0.8,
          hard_gate_pass_rate: 1,
          median_time_to_first_correct_file_ms: 100,
          p90_time_to_first_correct_file_ms: 200,
          median_time_to_first_valid_patch_ms: 110,
          p90_time_to_first_valid_patch_ms: 210,
          median_files_opened_count: 6,
          median_commands_run_count: 1,
        },
        atlas: {
          lane: "atlas",
          task_count: 20,
          hard_gate_task_count: 8,
          pass_rate: 0.81,
          hard_gate_pass_rate: 0.9,
          median_time_to_first_correct_file_ms: 90,
          p90_time_to_first_correct_file_ms: 120,
          median_time_to_first_valid_patch_ms: 95,
          p90_time_to_first_valid_patch_ms: 130,
          median_files_opened_count: 3,
          median_commands_run_count: 1,
        },
      },
      {
        version: "repo-atlas-bench-policy/1",
        thresholds: {
          median_time_to_first_correct_file_improvement_pct: 25,
          task_pass_rate_improvement_pct: 15,
          hard_gate_pass_rate_drop_allowed_pct: 0,
        },
      },
      {
        hardGateTasksInCorpus: 8,
        hardGateTasksInSample: 8,
      },
    );
    expect(failing.verdict).toBe("FAIL");
    expect(failing.reasons.length).toBeGreaterThan(0);
  });

  it("fails closed when sampled benchmark misses hard-gate coverage", () => {
    const gated = evaluateRegressionGate(
      {
        baseline: {
          lane: "baseline",
          task_count: 20,
          hard_gate_task_count: 0,
          pass_rate: 0.7,
          hard_gate_pass_rate: null,
          median_time_to_first_correct_file_ms: 120,
          p90_time_to_first_correct_file_ms: 200,
          median_time_to_first_valid_patch_ms: 130,
          p90_time_to_first_valid_patch_ms: 210,
          median_files_opened_count: 10,
          median_commands_run_count: 0,
        },
        atlas: {
          lane: "atlas",
          task_count: 20,
          hard_gate_task_count: 0,
          pass_rate: 0.9,
          hard_gate_pass_rate: null,
          median_time_to_first_correct_file_ms: 80,
          p90_time_to_first_correct_file_ms: 140,
          median_time_to_first_valid_patch_ms: 95,
          p90_time_to_first_valid_patch_ms: 150,
          median_files_opened_count: 8,
          median_commands_run_count: 0,
        },
      },
      {
        version: "repo-atlas-bench-policy/1",
        thresholds: {
          median_time_to_first_correct_file_improvement_pct: 25,
          task_pass_rate_improvement_pct: 15,
          hard_gate_pass_rate_drop_allowed_pct: 0,
        },
      },
      {
        hardGateTasksInCorpus: 5,
        hardGateTasksInSample: 0,
      },
    );

    expect(gated.verdict).toBe("FAIL");
    expect(gated.reasons.join(" ")).toMatch(/hard-gate/i);
  });

  it("emits deterministic artifact schema for sampled runs", async () => {
    const artifact = await runAtlasBench({
      sample: 3,
      atlasPath: fixturePath,
      outPath: path.join(process.cwd(), "artifacts", "repo-atlas", "atlas-bench.test.json"),
    });
    expect(artifact.version).toBe("repo-atlas-bench/1");
    expect(artifact.tasks).toHaveLength(6);
    expect(artifact.sampling.strategy).toBe("stratified_hard_gate");
    expect(artifact.limits.max_files_to_open).toBeGreaterThan(0);
    expect(artifact.tasks[0]?.task_id <= artifact.tasks[1]?.task_id || artifact.tasks[0]?.lane === "atlas").toBe(true);
  });
});
