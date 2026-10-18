import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNhm2ProofSurfaceManifestArtifact,
  publishNhm2ProofSurfaceManifestLatest,
  renderNhm2ProofSurfaceManifestMarkdown,
} from "../scripts/warp-york-control-family-proof-pack";
import {
  WARP_PROOF_SURFACE_MANIFEST_CONTRACT_VERSION,
  WARP_PROOF_SURFACE_MANIFEST_PUBLICATION_MODE,
  WARP_PROOF_SURFACE_MANIFEST_SURFACE_ORDER,
  type WarpProofSurfaceManifestSurfaceEntryV1,
  buildWarpProofSurfaceManifestContract,
  isCertifiedWarpProofSurfaceManifestContract,
} from "../shared/contracts/warp-proof-surface-manifest.v1";

const checksumFor = (seed: string): string =>
  crypto.createHash("sha256").update(seed).digest("hex");

const SURFACE_METADATA: Record<
  WarpProofSurfaceManifestSurfaceEntryV1["surfaceId"],
  { artifactType: string; jsonPath: string; mdPath: string; contractVersion: string; status: string }
> = {
  warp_worldline: {
    artifactType: "nhm2_warp_worldline_proof/v1",
    jsonPath: "artifacts/research/full-solve/nhm2-warp-worldline-proof-latest.json",
    mdPath: "docs/audits/research/warp-nhm2-warp-worldline-proof-latest.md",
    contractVersion: "warp_worldline/v1",
    status: "bounded_worldline_certified",
  },
  cruise_preflight: {
    artifactType: "nhm2_cruise_envelope_preflight/v1",
    jsonPath: "artifacts/research/full-solve/nhm2-cruise-envelope-preflight-latest.json",
    mdPath: "docs/audits/research/warp-nhm2-cruise-envelope-preflight-latest.md",
    contractVersion: "warp_cruise_envelope_preflight/v1",
    status: "bounded_preflight_ready",
  },
  route_time_worldline: {
    artifactType: "nhm2_route_time_worldline/v1",
    jsonPath: "artifacts/research/full-solve/nhm2-route-time-worldline-latest.json",
    mdPath: "docs/audits/research/warp-nhm2-route-time-worldline-latest.md",
    contractVersion: "warp_route_time_worldline/v1",
    status: "bounded_route_time_ready",
  },
  mission_time_estimator: {
    artifactType: "nhm2_mission_time_estimator/v1",
    jsonPath: "artifacts/research/full-solve/nhm2-mission-time-estimator-latest.json",
    mdPath: "docs/audits/research/warp-nhm2-mission-time-estimator-latest.md",
    contractVersion: "warp_mission_time_estimator/v1",
    status: "bounded_target_coupled_estimate_ready",
  },
  mission_time_comparison: {
    artifactType: "nhm2_mission_time_comparison/v1",
    jsonPath: "artifacts/research/full-solve/nhm2-mission-time-comparison-latest.json",
    mdPath: "docs/audits/research/warp-nhm2-mission-time-comparison-latest.md",
    contractVersion: "warp_mission_time_comparison/v1",
    status: "bounded_mission_time_comparison_ready",
  },
  cruise_envelope: {
    artifactType: "nhm2_cruise_envelope/v1",
    jsonPath: "artifacts/research/full-solve/nhm2-cruise-envelope-latest.json",
    mdPath: "docs/audits/research/warp-nhm2-cruise-envelope-latest.md",
    contractVersion: "warp_cruise_envelope/v1",
    status: "bounded_cruise_envelope_certified",
  },
  in_hull_proper_acceleration: {
    artifactType: "nhm2_in_hull_proper_acceleration/v1",
    jsonPath: "artifacts/research/full-solve/nhm2-in-hull-proper-acceleration-latest.json",
    mdPath: "docs/audits/research/warp-nhm2-in-hull-proper-acceleration-latest.md",
    contractVersion: "warp_in_hull_proper_acceleration/v1",
    status: "bounded_in_hull_profile_certified",
  },
  proof_pack_latest: {
    artifactType: "warp_york_control_family_proof_pack/v1",
    jsonPath: "artifacts/research/full-solve/warp-york-control-family-proof-pack-latest.json",
    mdPath: "docs/audits/research/warp-york-control-family-proof-pack-latest.md",
    contractVersion: "warp_york_control_family_proof_pack/v1",
    status: "published_latest_summary",
  },
};

const makeProofSurfaceEntries = (): WarpProofSurfaceManifestSurfaceEntryV1[] =>
  WARP_PROOF_SURFACE_MANIFEST_SURFACE_ORDER.map((surfaceId) => {
    const metadata = SURFACE_METADATA[surfaceId];
    return {
      surfaceId,
      artifactType: metadata.artifactType,
      jsonPath: metadata.jsonPath,
      mdPath: metadata.mdPath,
      jsonChecksum: checksumFor(`${surfaceId}:json`),
      generatedOn: "2026-04-02",
      generatedAt: "2026-04-02T12:00:00.000Z",
      status: metadata.status,
      certified: true,
      contractVersion: metadata.contractVersion,
    };
  });

const makeProofPackPayload = () =>
  ({
    artifactType: "warp_york_control_family_proof_pack/v1",
    generatedOn: "2026-04-02",
    generatedAt: "2026-04-02T12:00:00.000Z",
    checksum: checksumFor("proof-pack-latest"),
    notes: [],
  }) as any;

const writeTempRepoFile = (root: string, relativePath: string, content: string) => {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
};

const seedBoundedLatestEvidenceRepo = (
  mode: "trackable" | "tracked" | "clean",
): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warp-proof-surface-manifest-"));
  execFileSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
  execFileSync(
    "git",
    ["config", "user.email", "warp-proof-surface-tests@example.invalid"],
    { cwd: tempDir, stdio: "ignore" },
  );
  execFileSync("git", ["config", "user.name", "Warp Proof Surface Tests"], {
    cwd: tempDir,
    stdio: "ignore",
  });
  for (const entry of makeProofSurfaceEntries()) {
    writeTempRepoFile(tempDir, entry.jsonPath, `{"surfaceId":"${entry.surfaceId}"}\n`);
    writeTempRepoFile(tempDir, entry.mdPath, `# ${entry.surfaceId}\n`);
  }
  if (mode !== "trackable") {
    execFileSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
  }
  if (mode === "clean") {
    execFileSync("git", ["commit", "--no-gpg-sign", "-m", "seed bounded latest evidence"], {
      cwd: tempDir,
      stdio: "ignore",
    });
  }
  return tempDir;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("warp proof surface manifest", () => {
  it("rejects missing proof surfaces at contract build time", () => {
    const contract = buildWarpProofSurfaceManifestContract({
      generatedOn: "2026-04-02",
      generatedAt: "2026-04-02T12:00:00.000Z",
      proofSurfaces: makeProofSurfaceEntries().slice(0, -1),
      proofPackPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackChecksum: checksumFor("proof-pack-latest"),
      trackedRepoEvidenceStatus: "repo_trackable_latest_evidence",
    });

    expect(contract).toBeNull();
  });

  it("builds a certified manifest contract only when the canonical bounded stack is present in canonical order", () => {
    const contract = buildWarpProofSurfaceManifestContract({
      generatedOn: "2026-04-02",
      generatedAt: "2026-04-02T12:00:00.000Z",
      proofSurfaces: makeProofSurfaceEntries(),
      proofPackPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackChecksum: checksumFor("proof-pack-latest"),
      trackedRepoEvidenceStatus: "repo_trackable_latest_evidence",
    });

    expect(contract).toMatchObject({
      contractVersion: WARP_PROOF_SURFACE_MANIFEST_CONTRACT_VERSION,
      publicationMode: WARP_PROOF_SURFACE_MANIFEST_PUBLICATION_MODE,
      proofSurfaceCount: WARP_PROOF_SURFACE_MANIFEST_SURFACE_ORDER.length,
      trackedRepoEvidenceStatus: "repo_trackable_latest_evidence",
    });
    expect(isCertifiedWarpProofSurfaceManifestContract(contract)).toBe(true);
  });

  it("accepts the stricter repo-tracked evidence state when the same canonical stack is already landed in git", () => {
    const contract = buildWarpProofSurfaceManifestContract({
      generatedOn: "2026-04-02",
      generatedAt: "2026-04-02T12:00:00.000Z",
      proofSurfaces: makeProofSurfaceEntries(),
      proofPackPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackChecksum: checksumFor("proof-pack-latest"),
      trackedRepoEvidenceStatus: "repo_tracked_latest_evidence",
    });

    expect(contract).toMatchObject({
      contractVersion: WARP_PROOF_SURFACE_MANIFEST_CONTRACT_VERSION,
      publicationMode: WARP_PROOF_SURFACE_MANIFEST_PUBLICATION_MODE,
      proofSurfaceCount: WARP_PROOF_SURFACE_MANIFEST_SURFACE_ORDER.length,
      trackedRepoEvidenceStatus: "repo_tracked_latest_evidence",
    });
    expect(isCertifiedWarpProofSurfaceManifestContract(contract)).toBe(true);
  });

  it("accepts the strongest clean-landed evidence state when the bounded latest stack is git-tracked and clean", () => {
    const contract = buildWarpProofSurfaceManifestContract({
      generatedOn: "2026-04-02",
      generatedAt: "2026-04-02T12:00:00.000Z",
      proofSurfaces: makeProofSurfaceEntries(),
      proofPackPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackChecksum: checksumFor("proof-pack-latest"),
      trackedRepoEvidenceStatus: "repo_landed_clean_latest_evidence",
    });

    expect(contract).toMatchObject({
      contractVersion: WARP_PROOF_SURFACE_MANIFEST_CONTRACT_VERSION,
      publicationMode: WARP_PROOF_SURFACE_MANIFEST_PUBLICATION_MODE,
      proofSurfaceCount: WARP_PROOF_SURFACE_MANIFEST_SURFACE_ORDER.length,
      trackedRepoEvidenceStatus: "repo_landed_clean_latest_evidence",
    });
    expect(isCertifiedWarpProofSurfaceManifestContract(contract)).toBe(true);
  });

  it("computes deterministic manifest checksums from a fixed bounded-stack surface set", () => {
    const tempDir = seedBoundedLatestEvidenceRepo("tracked");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T12:00:00.000Z"));

    const args = {
      generatedOn: "2026-04-02",
      proofPackPayload: makeProofPackPayload(),
      proofPackLatestJsonPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackLatestMdPath: SURFACE_METADATA.proof_pack_latest.mdPath,
      proofSurfaces: makeProofSurfaceEntries(),
      gitRepoRootPath: tempDir,
    };
    const first = buildNhm2ProofSurfaceManifestArtifact(args);
    const second = buildNhm2ProofSurfaceManifestArtifact(args);
    const markdown = renderNhm2ProofSurfaceManifestMarkdown(first);

    expect(first.checksum).toBe(second.checksum);
    expect(first.trackedRepoEvidenceStatus).toBe("repo_tracked_latest_evidence");
    expect(first.proofSurfaceCount).toBe(WARP_PROOF_SURFACE_MANIFEST_SURFACE_ORDER.length);
    expect(markdown).toContain("NHM2 Proof Surface Manifest");
    expect(markdown).toContain("bounded_stack_latest_sequential_single_writer");
    expect(markdown).toContain("warp_worldline");
    expect(markdown).toContain("proof_pack_latest");
  });

  it("reports repo-trackable evidence when the bounded latest stack is unignored but not yet git-tracked", () => {
    const tempDir = seedBoundedLatestEvidenceRepo("trackable");

    const artifact = buildNhm2ProofSurfaceManifestArtifact({
      generatedOn: "2026-04-02",
      proofPackPayload: makeProofPackPayload(),
      proofPackLatestJsonPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackLatestMdPath: SURFACE_METADATA.proof_pack_latest.mdPath,
      proofSurfaces: makeProofSurfaceEntries(),
      gitRepoRootPath: tempDir,
    });

    expect(artifact.trackedRepoEvidenceStatus).toBe("repo_trackable_latest_evidence");
  });

  it("reports repo-tracked evidence when the bounded latest stack is git-tracked but not yet clean-landed", () => {
    const tempDir = seedBoundedLatestEvidenceRepo("tracked");

    const artifact = buildNhm2ProofSurfaceManifestArtifact({
      generatedOn: "2026-04-02",
      proofPackPayload: makeProofPackPayload(),
      proofPackLatestJsonPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackLatestMdPath: SURFACE_METADATA.proof_pack_latest.mdPath,
      proofSurfaces: makeProofSurfaceEntries(),
      gitRepoRootPath: tempDir,
    });

    expect(artifact.trackedRepoEvidenceStatus).toBe("repo_tracked_latest_evidence");
  });

  it("reports repo-clean-landed evidence only when the bounded latest stack is git-tracked and clean", () => {
    const tempDir = seedBoundedLatestEvidenceRepo("clean");

    const artifact = buildNhm2ProofSurfaceManifestArtifact({
      generatedOn: "2026-04-02",
      proofPackPayload: makeProofPackPayload(),
      proofPackLatestJsonPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
      proofPackLatestMdPath: SURFACE_METADATA.proof_pack_latest.mdPath,
      proofSurfaces: makeProofSurfaceEntries(),
      gitRepoRootPath: tempDir,
    });

    expect(artifact.trackedRepoEvidenceStatus).toBe("repo_landed_clean_latest_evidence");
  });

  it("fails closed when any bounded latest proof surface path remains git-ignored", () => {
    const proofSurfaces = makeProofSurfaceEntries().map((entry) =>
      entry.surfaceId === "mission_time_comparison"
        ? {
            ...entry,
            jsonPath: "artifacts/local-only/nhm2-mission-time-comparison-latest.json",
            mdPath: "artifacts/local-only/warp-nhm2-mission-time-comparison-latest.md",
          }
        : entry,
    );

    expect(() =>
      buildNhm2ProofSurfaceManifestArtifact({
        generatedOn: "2026-04-02",
        proofPackPayload: makeProofPackPayload(),
        proofPackLatestJsonPath: SURFACE_METADATA.proof_pack_latest.jsonPath,
        proofPackLatestMdPath: SURFACE_METADATA.proof_pack_latest.mdPath,
        proofSurfaces,
      }),
    ).toThrow("proof_surface_manifest_repo_evidence_not_trackable");
  });

  it("fails deterministically when a second publication writer is already active", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warp-proof-surface-manifest-lock-"));
    const lockPath = path.join(tempDir, ".publication.lock");
    fs.writeFileSync(lockPath, '{"pid":1}\n');

    await expect(
      publishNhm2ProofSurfaceManifestLatest({
        publicationLockPath: lockPath,
        outJsonPath: path.join(tempDir, "manifest-out.json"),
        latestJsonPath: path.join(tempDir, "manifest-latest.json"),
        outMdPath: path.join(tempDir, "manifest-out.md"),
        latestMdPath: path.join(tempDir, "manifest-latest.md"),
        proofPackLatestJsonPath: path.join(tempDir, "proof-pack-latest.json"),
        proofPackLatestMdPath: path.join(tempDir, "proof-pack-latest.md"),
      }),
    ).rejects.toThrow(/proof_surface_publication_locked:.*publish-proof-surface-manifest-latest/);
  });

  it("falls back to the current proof-pack payload when low-expansion refresh cannot fetch live data", async () => {
    const tempDir = seedBoundedLatestEvidenceRepo("tracked");
    const proofPackLatestJsonPath = path.join(tempDir, SURFACE_METADATA.proof_pack_latest.jsonPath);
    const proofPackLatestMdPath = path.join(tempDir, SURFACE_METADATA.proof_pack_latest.mdPath);
    const repoProofPackLatestJsonPath = path.resolve(SURFACE_METADATA.proof_pack_latest.jsonPath);
    const repoProofPackLatestMdPath = path.resolve(SURFACE_METADATA.proof_pack_latest.mdPath);
    writeTempRepoFile(
      tempDir,
      SURFACE_METADATA.proof_pack_latest.jsonPath,
      fs.readFileSync(repoProofPackLatestJsonPath, "utf8"),
    );
    writeTempRepoFile(
      tempDir,
      SURFACE_METADATA.proof_pack_latest.mdPath,
      fs.readFileSync(repoProofPackLatestMdPath, "utf8"),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const result = await publishNhm2ProofSurfaceManifestLatest({
      outJsonPath: path.join(tempDir, "artifacts/research/full-solve/nhm2-proof-surface-manifest-2026-04-02.json"),
      latestJsonPath: path.join(tempDir, "artifacts/research/full-solve/nhm2-proof-surface-manifest-latest.json"),
      outMdPath: path.join(tempDir, "docs/audits/research/warp-nhm2-proof-surface-manifest-2026-04-02.md"),
      latestMdPath: path.join(tempDir, "docs/audits/research/warp-nhm2-proof-surface-manifest-latest.md"),
      proofPackLatestJsonPath,
      proofPackLatestMdPath,
      publicationLockPath: path.join(tempDir, ".publication.lock"),
    });

    expect(result.artifact.status).toBe("bounded_stack_publication_hardened");
    expect(result.artifact.proofSurfaceCount).toBe(
      WARP_PROOF_SURFACE_MANIFEST_SURFACE_ORDER.length,
    );
    expect(fs.existsSync(result.latestJsonPath)).toBe(true);
    expect(fs.existsSync(result.latestMdPath)).toBe(true);
  });
});
