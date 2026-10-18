import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  NHM2_ALPHA07_EXPECTED_PACKAGE_ARTIFACTS,
  NHM2_ALPHA07_IMPORT_MANIFEST_PATH,
  NHM2_ALPHA07_PACKAGE_DIRECTORY,
  NHM2_ALPHA07_SOURCE_COMMIT,
  buildNhm2Alpha07HistoricalImportManifest,
  renderNhm2Alpha07HistoricalImportManifest,
  validateNhm2Alpha07HistoricalImportManifest,
} from "../tools/nhm2/govern-alpha07-historical-import";

const repoPath = (root: string, repoRelativePath: string): string =>
  path.resolve(root, ...repoRelativePath.split("/"));

const sourceRepoRoot = process.cwd();
const temporaryRoots = new Set<string>();

async function createHistoricalImportFixture(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nhm2-a07-"));
  temporaryRoots.add(temporaryRoot);
  const sourcePackage = repoPath(sourceRepoRoot, NHM2_ALPHA07_PACKAGE_DIRECTORY);
  const targetPackage = repoPath(temporaryRoot, NHM2_ALPHA07_PACKAGE_DIRECTORY);
  await fs.mkdir(path.dirname(targetPackage), { recursive: true });
  await fs.cp(sourcePackage, targetPackage, { recursive: true });

  const frontierPath =
    "artifacts/research/full-solve/profile-search/nhm2-profile-campaign-frontier-latest.json";
  const targetFrontier = repoPath(temporaryRoot, frontierPath);
  await fs.mkdir(path.dirname(targetFrontier), { recursive: true });
  await fs.copyFile(repoPath(sourceRepoRoot, frontierPath), targetFrontier);
  return temporaryRoot;
}

async function mutateJson(
  root: string,
  repoRelativePath: string,
  mutate: (json: Record<string, unknown>) => void,
): Promise<void> {
  const absolutePath = repoPath(root, repoRelativePath);
  const json = JSON.parse(await fs.readFile(absolutePath, "utf8")) as Record<
    string,
    unknown
  >;
  mutate(json);
  await fs.writeFile(absolutePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  for (const root of temporaryRoots) {
    await fs.rm(root, { recursive: true, force: true });
  }
  temporaryRoots.clear();
});

describe("NHM2 alpha=0.7 historical campaign import manifest", () => {
  it("governs the exact package as preexisting diagnostic evidence without execution binding", async () => {
    await expect(
      validateNhm2Alpha07HistoricalImportManifest({ repoRoot: sourceRepoRoot }),
    ).resolves.toEqual([]);

    const manifest = JSON.parse(
      await fs.readFile(repoPath(sourceRepoRoot, NHM2_ALPHA07_IMPORT_MANIFEST_PATH), "utf8"),
    ) as {
      requestId: string | null;
      runtimeId: string;
      gitSha: string | null;
      startedAt: string | null;
      completedAt: string | null;
      boundToExecution: boolean;
      manifestSha256: string | null;
      entries: Array<{ freshness: string; path: string }>;
    };

    expect(manifest.requestId).toBeNull();
    expect(manifest.gitSha).toBe(NHM2_ALPHA07_SOURCE_COMMIT);
    expect(manifest.startedAt).toBeNull();
    expect(manifest.completedAt).toBeNull();
    expect(manifest.boundToExecution).toBe(false);
    expect(manifest.manifestSha256).toBeNull();
    expect(manifest.entries).toHaveLength(
      NHM2_ALPHA07_EXPECTED_PACKAGE_ARTIFACTS.length,
    );
    expect(manifest.entries.every((entry) => entry.freshness === "preexisting")).toBe(
      true,
    );
    expect(
      manifest.entries.some((entry) => entry.path === NHM2_ALPHA07_IMPORT_MANIFEST_PATH),
    ).toBe(false);

    const certificate = JSON.parse(
      await fs.readFile(
        repoPath(
          sourceRepoRoot,
          `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-lean-campaign-certificate.json`,
        ),
        "utf8",
      ),
    ) as { artifactHashes: unknown[]; claimLocks: Record<string, boolean> };
    expect(certificate.artifactHashes).toHaveLength(10);
    expect(Object.values(certificate.claimLocks)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("regenerates byte-for-byte deterministically", async () => {
    const first = await buildNhm2Alpha07HistoricalImportManifest({
      repoRoot: sourceRepoRoot,
    });
    const second = await buildNhm2Alpha07HistoricalImportManifest({
      repoRoot: sourceRepoRoot,
    });
    const checkedIn = await fs.readFile(
      repoPath(sourceRepoRoot, NHM2_ALPHA07_IMPORT_MANIFEST_PATH),
      "utf8",
    );

    expect(renderNhm2Alpha07HistoricalImportManifest(first)).toBe(
      renderNhm2Alpha07HistoricalImportManifest(second),
    );
    expect(renderNhm2Alpha07HistoricalImportManifest(first)).toBe(checkedIn);
  });

  it("fails closed for an extra package JSON artifact", async () => {
    const root = await createHistoricalImportFixture();
    await fs.writeFile(
      repoPath(root, `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/unexpected.json`),
      '{"generatedAt":"2026-06-19T19:03:11.035Z"}\n',
      "utf8",
    );

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain("unexpected historical package artifact: unexpected.json");
    expect(issues).toContain(
      `unmanifested package artifact: ${NHM2_ALPHA07_PACKAGE_DIRECTORY}/unexpected.json`,
    );
  });

  it("fails closed for an unmanifested non-JSON package file", async () => {
    const root = await createHistoricalImportFixture();
    await fs.writeFile(
      repoPath(root, `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/operator-notes.txt`),
      "unmanifested package material\n",
      "utf8",
    );

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain("unexpected historical package artifact: operator-notes.txt");
    expect(issues).toContain(
      `unmanifested package artifact: ${NHM2_ALPHA07_PACKAGE_DIRECTORY}/operator-notes.txt`,
    );
    expect(
      issues.some((issue) =>
        issue.startsWith(
          `invalid package JSON ${NHM2_ALPHA07_PACKAGE_DIRECTORY}/operator-notes.txt:`,
        ),
      ),
    ).toBe(true);
  });

  it("fails closed for a missing package JSON artifact", async () => {
    const root = await createHistoricalImportFixture();
    const missingPath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-qei-worldline-dossier.json`;
    await fs.unlink(repoPath(root, missingPath));

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain(
      "missing historical package artifact: nhm2-qei-worldline-dossier.json",
    );
    expect(issues).toContain(`manifest entry has no package artifact: ${missingPath}`);
    expect(issues.some((issue) => issue.includes(`certificate pin target is unreadable: ${missingPath}`))).toBe(
      true,
    );
  });

  it("fails closed for tampered content and a broken Lean certificate pin", async () => {
    const root = await createHistoricalImportFixture();
    const tamperedPath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-frequency-convergence-evidence.json`;
    await mutateJson(root, tamperedPath, (json) => {
      json.tampered = true;
    });

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain(`manifest SHA-256 mismatch: ${tamperedPath}`);
    expect(issues).toContain(`manifest size mismatch: ${tamperedPath}`);
    expect(issues).toContain(`Lean certificate pin hash mismatch: ${tamperedPath}`);
  });

  it("rejects absolute workstation paths even when the JSON remains parseable", async () => {
    const root = await createHistoricalImportFixture();
    const artifactPath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-averaged-source-tensor-receipt.json`;
    await mutateJson(root, artifactPath, (json) => {
      json.debugArtifactRoot = "C:\\Users\\operator\\Desktop\\private-run";
    });

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(
      issues.some(
        (issue) =>
          issue.includes("absolute workstation path") &&
          issue.includes("C:\\Users\\operator\\Desktop\\private-run"),
      ),
    ).toBe(true);
  });

  it("fails closed when producer, mask, normalization, or tensor-ledger surfaces disappear", async () => {
    const root = await createHistoricalImportFixture();
    const sourcePath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-candidate-tile-effective-full-tensor-source.json`;
    await mutateJson(root, sourcePath, (json) => {
      delete (json.sourceModel as Record<string, unknown>).sourceModelVersion;
      const globalRegion = (json.regions as Array<Record<string, unknown>>)[0];
      delete globalRegion.regionMaskRef;
      delete globalRegion.normalizationBasis;
      delete (globalRegion.tensor as Record<string, unknown>).T23;
    });

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain("source tensor must retain sourceModelVersion=v1");
    expect(issues).toContain("source-tensor region global must retain its regionMaskRef");
    expect(issues).toContain(
      "source-tensor region global normalizationBasis must remain sample_count",
    );
    expect(issues).toContain("missing source-tensor global component: T23");
  });

  it("fails closed when encoded mask/tensor channels, observer families, or QEI plans disappear", async () => {
    const root = await createHistoricalImportFixture();
    const brickPath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-dynamic-geometry-sample.brick.json`;
    await mutateJson(root, brickPath, (json) => {
      json.channelOrder = (json.channelOrder as string[]).filter(
        (channelId) => channelId !== "tile_support_mask" && channelId !== "S_xy",
      );
      delete (json.channels as Record<string, unknown>).tile_support_mask;
      delete (json.channels as Record<string, unknown>).S_xy;
    });
    const observerPath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-observer-robust-energy-conditions.json`;
    await mutateJson(root, observerPath, (json) => {
      json.observerFamilies = (json.observerFamilies as Array<Record<string, unknown>>).filter(
        (family) => family.familyId !== "continuous_optimizer",
      );
    });
    const planPath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-qei-worldline-sample-plan.json`;
    await mutateJson(root, planPath, (json) => {
      json.worldlines = (json.worldlines as Array<Record<string, unknown>>).filter(
        (worldline) => worldline.worldlineId !== "qei:wall_exterior_transition:atlas",
      );
    });

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain(
      "nhm2-dynamic-geometry-sample.brick.json must retain channelOrder entry tile_support_mask",
    );
    expect(issues).toContain(
      "nhm2-dynamic-geometry-sample.brick.json must retain encoded channel data for S_xy",
    );
    expect(issues).toContain("missing observer family: continuous_optimizer");
    expect(issues).toContain(
      "missing QEI sample-plan worldline: qei:wall_exterior_transition:atlas",
    );
  });

  it("fails closed when the pinned external profile frontier loses diagnostic semantics", async () => {
    const root = await createHistoricalImportFixture();
    const frontierPath =
      "artifacts/research/full-solve/profile-search/nhm2-profile-campaign-frontier-latest.json";
    await mutateJson(root, frontierPath, (json) => {
      (json.frontier as Record<string, unknown>).fastestCampaignAdmissibleProfileId =
        "unrelated_profile";
      (json.claimBoundary as Record<string, unknown>).transportClaimAllowed = true;
    });

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain(
      "profile-frontier certificate input no longer selects the alpha=0.7 profile",
    );
    expect(issues).toContain(
      "profile-frontier certificate input transportClaimAllowed must remain false",
    );
    expect(issues.some((issue) => issue.includes("Lean certificate pin hash mismatch"))).toBe(
      true,
    );
  });

  it("rejects source-commit or claim-lock promotion drift", async () => {
    const root = await createHistoricalImportFixture();
    const referenceRunPath = `${NHM2_ALPHA07_PACKAGE_DIRECTORY}/nhm2-reference-run.json`;
    await mutateJson(root, referenceRunPath, (json) => {
      (json.repo as Record<string, unknown>).commitSha = "a".repeat(40);
      (json.claimLock as Record<string, unknown>).validationClaimAllowed = true;
    });

    const issues = await validateNhm2Alpha07HistoricalImportManifest({ repoRoot: root });
    expect(issues).toContain(
      `reference-run source commit must be ${NHM2_ALPHA07_SOURCE_COMMIT}`,
    );
    expect(issues).toContain("reference-run validationClaimAllowed must remain false");
  });
});
