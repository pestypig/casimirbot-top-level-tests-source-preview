import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  admitSourceBytePacketReceipt,
  isAdmittedSourceBytePacketReceipt,
  loadSourceBytePacketManifest,
  runSourceBytePacket,
  validateSourceBytePacketManifest,
  type SourceBytePacketManifest,
  type SourceBytePacketReceipt,
} from "../scripts/research/verify-nhm2-semiclassical-primary-source-byte-packet";

const REPOSITORY_ROOT = process.cwd();
const MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  "configs",
  "research",
  "nhm2-semiclassical-primary-source-byte-packet.v1.json",
);

const EXPECTED_SOURCE_PINS = [
  [
    "moretti_conserved_stress_and_local_wick_algebra",
    "arXiv:gr-qc/0109048v2",
    "gr-qc_0109048v2.eprint",
    38_039,
    "f28fb4b058978cf95817bc22326dc6e1d41267608f1880cf0773f81fc142425f",
  ],
  [
    "phillips_hu_noise_normalization_and_stress_construction",
    "arXiv:gr-qc/0010019v2",
    "gr-qc_0010019v2.eprint",
    30_809,
    "fdb4ccfff441524ef4f65629c3a66628f02dfca793a3c8862d03f6e283865374",
  ],
  [
    "cho_hu_conformal_mean_and_connected_noise_mapping",
    "arXiv:1407.3907v1",
    "1407.3907v1.eprint",
    11_844,
    "a6aadd6363c4105c2571ddae2e889d4056dfc249da4f0f2fdc48e9a05905443f",
  ],
  [
    "bates_centered_symmetrized_noise_distribution_audit",
    "arXiv:1301.2501v1",
    "1301.2501v1.eprint",
    295_571,
    "1c53226a4dec6fb20b755989926ebd929b809dfabd7f67627e901e1a502f17cf",
  ],
  [
    "serino_flat_improved_conformal_scalar_stress",
    "arXiv:2004.08668v2",
    "2004.08668v2.eprint",
    721_733,
    "b054efb1adc181072815a2eefeea7b8970fe9cfa8f395170636d6246cdcd9a22",
  ],
  [
    "herzog_huang_weyl_flat_trace_anomaly_stress",
    "arXiv:1301.5002v3",
    "1301.5002v3.eprint",
    13_390,
    "49421e70657a38ca275fa2c3ecd4fb2a99a758abb84090f66257c35ca435fcec",
  ],
] as const;

const EXPECTED_MANIFEST_SHA256 =
  "43c1e79ce8bc1562dce56f478baf1ae454a69e77161a7c87a933d4d1ef054bad";
const EXPECTED_MANIFEST_SIZE_BYTES = 11_332;
const temporaryRoots: string[] = [];

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

const makeTemporaryRoot = async (label: string): Promise<string> => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), `nhm2-source-${label}-`),
  );
  temporaryRoots.push(root);
  return root;
};

const readTrackedManifestObject = async (): Promise<SourceBytePacketManifest> =>
  JSON.parse(
    await fs.readFile(MANIFEST_PATH, "utf8"),
  ) as SourceBytePacketManifest;

const makeExactPacketFixture = async (label: string) => {
  const fixtureRoot = await makeTemporaryRoot(label);
  const cacheRoot = path.join(fixtureRoot, "cache");
  const manifestPath = path.join(fixtureRoot, "manifest.json");
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.copyFile(MANIFEST_PATH, manifestPath);
  return {
    fixtureRoot,
    cacheRoot,
    manifestPath,
    manifest: await readTrackedManifestObject(),
  };
};

const packetContentIdentity = (manifest: SourceBytePacketManifest): string =>
  sha256(
    JSON.stringify(
      manifest.sources.map((source) => ({
        sourceId: source.sourceId,
        sourceVersion: source.sourceVersion,
        kind: source.artifact.kind,
        sha256: source.artifact.sha256,
        sizeBytes: source.artifact.sizeBytes,
      })),
    ),
  );

const forgeReceipt = async (
  fixture: Awaited<ReturnType<typeof makeExactPacketFixture>>,
): Promise<SourceBytePacketReceipt> => {
  const cacheRoot = await fs.realpath(fixture.cacheRoot);
  return {
    schemaVersion:
      "nhm2_semiclassical_primary_source_byte_verification_receipt/1",
    packetId: fixture.manifest.packetId,
    packetVersion: fixture.manifest.packetVersion,
    manifestFileSha256: EXPECTED_MANIFEST_SHA256,
    manifestFileSizeBytes: EXPECTED_MANIFEST_SIZE_BYTES,
    packetContentIdentitySha256: packetContentIdentity(fixture.manifest),
    verifiedAt: "2026-08-12T20:00:00.000Z",
    mode: "verify_only",
    cacheRoot,
    sourceCount: 6,
    totalSizeBytes: 1_111_386,
    artifacts: fixture.manifest.sources.map((source) => ({
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      localRelativePath: source.artifact.localFilename,
      sha256: source.artifact.sha256,
      sizeBytes: source.artifact.sizeBytes,
      localBytePresenceVerified: true,
      sourceBytesVendored: false,
      remoteOriginProvenanceVerified: false,
      formulaInterpretationVerified: false,
      authorizesExecution: false,
    })),
    integrityObservation: {
      allDeclaredLocalBytesPresent: true,
      allDeclaredSizesMatch: true,
      allDeclaredSha256Match: true,
      localContentIntegrityVerified: true,
      sourceBytesVendored: false,
      remoteOriginProvenanceVerified: false,
      formulaInterpretationVerified: false,
    },
    trustBoundary: {
      plainJsonReceiptTrustedWithoutAdmission: false,
      admissionRequiresExactManifestIdentity: true,
      admissionRequiresLocalByteReverification: true,
      operatorControlledContentCache: true,
      secureLaunchOrPresealRootVerified: false,
      pathOrOriginAuthorityGranted: false,
    },
    blockerBoundary: {
      eligibleLocalByteIdentityBlockers: [
        "primary_source_artifact_bytes_not_verified",
        "primary_source_artifact_bytes_not_observed_or_pinned",
      ],
      blockersResolvedByReceiptWithoutConsumerBinding: false,
      vendoringRequirementResolved: false,
      formulaRequirementResolved: false,
      executionRequirementResolved: false,
    },
    authorityLocks: Object.fromEntries(
      Object.keys(fixture.manifest.authorityLocks).map((key) => [key, false]),
    ),
  };
};

afterEach(async () => {
  vi.restoreAllMocks();
  const roots = temporaryRoots.splice(0, temporaryRoots.length);
  await Promise.all(
    roots.map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("NHM2 semiclassical primary source byte packet", () => {
  it("hard-pins the tracked manifest bytes and all six ordered source identities", async () => {
    const loaded = await loadSourceBytePacketManifest(MANIFEST_PATH);
    expect(loaded.sha256).toBe(EXPECTED_MANIFEST_SHA256);
    expect(loaded.rawBytes.byteLength).toBe(EXPECTED_MANIFEST_SIZE_BYTES);
    expect(
      loaded.manifest.sources.map((source) => [
        source.sourceId,
        source.sourceVersion,
        source.artifact.localFilename,
        source.artifact.sizeBytes,
        source.artifact.sha256,
      ]),
    ).toEqual(EXPECTED_SOURCE_PINS);
    expect(loaded.manifest.localCachePolicy).toMatchObject({
      trustBoundary:
        "operator_controlled_local_content_cache_not_secure_launch_or_preseal_root",
      receiptAdmissionAlwaysReopensAndRehashesBytes: true,
      parentPathRaceClosureGuaranteed: false,
    });
    expect(Object.values(loaded.manifest.authorityLocks)).not.toContain(true);
  });

  it("rejects same-packet source identity, filename, URL, hash, and size substitutions", async () => {
    const mutations: Array<(manifest: SourceBytePacketManifest) => void> = [
      (manifest) => {
        manifest.sources[0].sourceId = "substituted_source";
      },
      (manifest) => {
        manifest.sources[0].artifact.localFilename = "substitute.eprint";
      },
      (manifest) => {
        manifest.sources[0].artifact.downloadUrl =
          "https://arxiv.org/e-print/gr-qc/0010019v2";
      },
      (manifest) => {
        manifest.sources[0].artifact.sha256 = "0".repeat(64);
      },
      (manifest) => {
        manifest.sources[0].artifact.sizeBytes += 1;
        manifest.scope.declaredTotalSizeBytes += 1;
      },
    ];
    const base = await readTrackedManifestObject();
    for (const mutate of mutations) {
      const candidate = structuredClone(base);
      mutate(candidate);
      expect(() => validateSourceBytePacketManifest(candidate)).toThrow();
    }
  });

  it("rejects added manifest, source, artifact, and license keys", async () => {
    const base = await readTrackedManifestObject();
    const additions: Array<(manifest: SourceBytePacketManifest) => void> = [
      (manifest) => {
        (manifest as unknown as Record<string, unknown>).extra = false;
      },
      (manifest) => {
        (manifest.sources[0] as unknown as Record<string, unknown>).extra =
          false;
      },
      (manifest) => {
        (
          manifest.sources[0].artifact as unknown as Record<string, unknown>
        ).extra = false;
      },
      (manifest) => {
        (
          manifest.sources[0].license as unknown as Record<string, unknown>
        ).extra = false;
      },
    ];
    for (const add of additions) {
      const candidate = structuredClone(base);
      add(candidate);
      expect(() => validateSourceBytePacketManifest(candidate)).toThrow();
    }
  });

  it("rejects omitted authority locks and reordered blocker scopes", async () => {
    const base = await readTrackedManifestObject();
    const omitted = structuredClone(base);
    delete omitted.authorityLocks.physicalClaimAuthority;
    expect(() => validateSourceBytePacketManifest(omitted)).toThrow(
      /authority_lock_keys_invalid/,
    );

    const reordered = structuredClone(base);
    reordered.blockerBoundary.receiptMayResolveOnly.reverse();
    expect(() => validateSourceBytePacketManifest(reordered)).toThrow(
      /receipt_resolution_scope_invalid/,
    );
  });

  it("rejects a byte-different --manifest override even when its JSON is equivalent", async () => {
    const fixture = await makeExactPacketFixture("manifest-bytes");
    await fs.appendFile(fixture.manifestPath, "\n");
    await expect(
      loadSourceBytePacketManifest(fixture.manifestPath),
    ).rejects.toThrow(/manifest_file_identity_mismatch/);
  });

  it("defaults to offline verification and never fetches missing bytes", async () => {
    const fixture = await makeExactPacketFixture("offline");
    const fetchImpl = vi.fn(async () => {
      throw new Error("network_must_not_be_called");
    }) as unknown as typeof fetch;
    await expect(
      runSourceBytePacket({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        fetchImpl,
        writeReceipt: false,
      }),
    ).rejects.toThrow(/source_artifact_missing/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a controlled cap-plus-one local artifact without unbounded reading", async () => {
    const fixture = await makeExactPacketFixture("cap-plus-one");
    const source = fixture.manifest.sources[0];
    await fs.writeFile(
      path.join(fixture.cacheRoot, source.artifact.localFilename),
      Buffer.alloc(source.artifact.sizeBytes + 1),
    );
    await expect(
      runSourceBytePacket({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        writeReceipt: false,
      }),
    ).rejects.toThrow(/source_artifact_too_large/);
  });

  it("rejects same-size local bytes with a different SHA-256", async () => {
    const fixture = await makeExactPacketFixture("hash-mismatch");
    const source = fixture.manifest.sources[0];
    await fs.writeFile(
      path.join(fixture.cacheRoot, source.artifact.localFilename),
      Buffer.alloc(source.artifact.sizeBytes),
    );
    await expect(
      runSourceBytePacket({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        writeReceipt: false,
      }),
    ).rejects.toThrow(/source_artifact_sha256_mismatch/);
  });

  it("rejects a symlinked cache-root chain", async () => {
    const fixture = await makeExactPacketFixture("symlink");
    const realCache = path.join(fixture.fixtureRoot, "real-cache");
    const linkedCache = path.join(fixture.fixtureRoot, "linked-cache");
    await fs.mkdir(realCache);
    await fs.symlink(
      realCache,
      linkedCache,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      runSourceBytePacket({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: linkedCache,
        writeReceipt: false,
      }),
    ).rejects.toThrow(/symlink_path_rejected/);
  });

  it("refuses an in-repository cache outside the ignored source-byte subtree", async () => {
    const fixture = await makeExactPacketFixture("internal-path");
    const fakeRepository = await makeTemporaryRoot("repository");
    await expect(
      runSourceBytePacket({
        repositoryRoot: fakeRepository,
        manifestPath: fixture.manifestPath,
        cacheRoot: path.join(fakeRepository, "tracked-cache"),
        writeReceipt: false,
      }),
    ).rejects.toThrow(/repository_internal_cache_path_not_ignored/);
  });

  it("rejects redirect hosts outside the exact HTTPS allowlist", async () => {
    const fixture = await makeExactPacketFixture("redirect-host");
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/untrusted.eprint" },
        }),
    ) as unknown as typeof fetch;
    await expect(
      runSourceBytePacket({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        acquire: true,
        fetchImpl,
        writeReceipt: false,
      }),
    ).rejects.toThrow(/download_url_not_allowed/);
  });

  it("rejects allowed-host redirects to a different artifact path", async () => {
    const fixture = await makeExactPacketFixture("redirect-path");
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://export.arxiv.org/e-print/1301.2501v1" },
        }),
    ) as unknown as typeof fetch;
    await expect(
      runSourceBytePacket({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        acquire: true,
        fetchImpl,
        writeReceipt: false,
      }),
    ).rejects.toThrow(/download_url_artifact_path_mismatch/);
  });

  it("does not admit a structurally exact forged receipt without reopening all bytes", async () => {
    const fixture = await makeExactPacketFixture("forged-receipt");
    const forged = await forgeReceipt(fixture);
    expect(isAdmittedSourceBytePacketReceipt(forged)).toBe(false);
    await expect(
      admitSourceBytePacketReceipt({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        receipt: forged,
      }),
    ).rejects.toThrow(/source_artifact_missing/);
    expect(isAdmittedSourceBytePacketReceipt(forged)).toBe(false);
  });

  it("rejects forged receipt authority and blocker fields before byte admission", async () => {
    const fixture = await makeExactPacketFixture("forged-fields");
    const forgedAuthority = await forgeReceipt(fixture);
    forgedAuthority.authorityLocks.physicalClaimAuthority = true as false;
    await expect(
      admitSourceBytePacketReceipt({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        receipt: forgedAuthority,
      }),
    ).rejects.toThrow(/receipt_authority_locks_invalid/);

    const forgedBlocker = await forgeReceipt(fixture);
    forgedBlocker.blockerBoundary.eligibleLocalByteIdentityBlockers.reverse();
    await expect(
      admitSourceBytePacketReceipt({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        receipt: forgedBlocker,
      }),
    ).rejects.toThrow(/receipt_blocker_scope_invalid/);
  });

  it("descriptor-snapshots untrusted receipts and never invokes accessor fields", async () => {
    const fixture = await makeExactPacketFixture("receipt-accessor");
    let reads = 0;
    const receipt: Record<string, unknown> = {};
    Object.defineProperty(receipt, "schemaVersion", {
      enumerable: true,
      get() {
        reads += 1;
        return "nhm2_semiclassical_primary_source_byte_verification_receipt/1";
      },
    });
    await expect(
      admitSourceBytePacketReceipt({
        repositoryRoot: REPOSITORY_ROOT,
        manifestPath: fixture.manifestPath,
        cacheRoot: fixture.cacheRoot,
        receipt,
      }),
    ).rejects.toThrow(/receipt_snapshot_accessor_rejected/);
    expect(reads).toBe(0);
  });
});
