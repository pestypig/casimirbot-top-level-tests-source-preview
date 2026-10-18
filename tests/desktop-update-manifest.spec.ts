import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { signDesktopReleaseManifest } from "../apps/desktop/scripts/desktop-release-manifest.mjs";
import { verifyDesktopUpdateCandidate, verifyDownloadedDesktopUpdatePackage } from "../apps/desktop/src/desktop-update-manifest";

const repository = "pestypig/casimirbot-desktop-releases";
const version = "0.1.0-alpha.2";
const installerFileName = `CasimirBot-${version}-x64-setup.exe`;
const pair = generateKeyPairSync("ed25519");
const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const sha512 = (bytes: Uint8Array | string) => createHash("sha512").update(bytes).digest("base64");
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

const signedAssets = () => {
  const installerBytes = Buffer.from("signed installer bytes");
  const latestBytes = Buffer.from([
    `version: ${version}`,
    "files:",
    `  - url: ${installerFileName}`,
    `    sha512: ${sha512(installerBytes)}`,
    `path: ${installerFileName}`,
    `sha512: ${sha512(installerBytes)}`,
  ].join("\n") + "\n");
  const manifestBytes = Buffer.from(`${JSON.stringify({
    schema: "casimir_desktop_release_manifest/1",
    version,
    binaryRepository: repository,
    publisherName: "CasimirBot LLC",
    updaterMetadataSha256: sha256(latestBytes),
    files: [{ file: installerFileName, sha256: sha256(installerBytes), sha512: sha512(installerBytes) }],
  }, null, 2)}\n`);
  const signatureBytes = signDesktopReleaseManifest(manifestBytes, privateKeyPem);
  return new Map([
    [`${version}/release-manifest.json`, manifestBytes],
    [`${version}/release-manifest.sig`, Buffer.from(`${signatureBytes.toString("base64")}\n`)],
    [`${version}/latest.yml`, latestBytes],
  ]);
};

describe("desktop signed update manifest", () => {
  it("verifies the pinned key, channel, version, publisher, and updater checksums before download", async () => {
    const assets = signedAssets();
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const suffix = String(url).split(`/releases/download/desktop-v${version}/`)[1];
      const bytes = assets.get(`${version}/${suffix}`);
      return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    await expect(verifyDesktopUpdateCandidate({
      repository,
      version,
      expectedPublisher: "CasimirBot LLC",
      publicKeyPem,
      files: [{ url: installerFileName, sha512: sha512("signed installer bytes") }],
      fetcher,
    })).resolves.toEqual({ fileName: installerFileName, sha256: sha256("signed installer bytes"), version });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("hashes staged installer bytes and rejects altered files", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "casimir-manifest-test-"));
    try {
      const installerPath = path.join(root, installerFileName);
      writeFileSync(installerPath, "signed installer bytes");
      const expected = { fileName: installerFileName, sha256: sha256("signed installer bytes") };
      await expect(verifyDownloadedDesktopUpdatePackage([installerPath], expected)).resolves.toBe(true);
      writeFileSync(installerPath, "altered installer bytes");
      await expect(verifyDownloadedDesktopUpdatePackage([installerPath], expected)).resolves.toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects tampered or cross-channel signed metadata", async () => {
    const original = signedAssets();
    const assets = new Map(original);
    assets.set(`${version}/release-manifest.json`, Buffer.from("{}"));
    const fetcher = async (url: string | URL | Request) => {
      const suffix = String(url).split(`/releases/download/desktop-v${version}/`)[1];
      const bytes = assets.get(`${version}/${suffix}`);
      return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
    };
    await expect(verifyDesktopUpdateCandidate({
      repository,
      version,
      expectedPublisher: "CasimirBot LLC",
      publicKeyPem,
      files: [{ url: installerFileName, sha512: sha512("signed installer bytes") }],
      fetcher: fetcher as typeof fetch,
    })).rejects.toThrow("release_manifest_verification_failed");
  });
});
