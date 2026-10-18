import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadSolarKernelBundle,
  loadSolarLocalRestReferenceManifest,
  loadSolarMetricContextManifest,
  validateKernelBundleAssets,
  verifyKernelBundleSignature,
} from "../server/modules/halobank-solar/config";
import type { SolarKernelBundleManifest } from "../server/modules/halobank-solar/types";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("halobank solar kernel manifest integrity", () => {
  it("validates in-repo manifest signature and pinned asset digests", async () => {
    const manifest = await loadSolarKernelBundle();
    const signature = verifyKernelBundleSignature(manifest);
    expect(signature.ok).toBe(true);

    const assets = await validateKernelBundleAssets(manifest);
    expect(assets.ok).toBe(true);
    expect(assets.missing).toEqual([]);
    expect(assets.digestMismatch).toEqual([]);
    expect(assets.verified.length).toBeGreaterThan(0);
  });

  it("reports deterministic missing and digest-mismatch assets", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "halobank-solar-config-"));
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, "a"), { recursive: true });
    fs.writeFileSync(path.join(root, "a", "ok.txt"), "hello", "utf8");

    const manifest: SolarKernelBundleManifest = {
      schema_version: "halobank.solar.kernel.bundle/1",
      bundle_id: "fixture",
      release_policy: "pinned-manual-promotion",
      epoch_range: {
        start_iso: "1900-01-01T00:00:00.000Z",
        end_iso: "2100-12-31T23:59:59.000Z",
      },
      assets: [
        {
          id: "missing",
          kind: "spk",
          path: "a/missing.txt",
          digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          id: "mismatch",
          kind: "lsk",
          path: "a/ok.txt",
          digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
      signature: {
        alg: "sha256",
        signed_payload_hash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        signer: "fixture",
      },
    };

    const assets = await validateKernelBundleAssets(manifest, root);
    expect(assets.ok).toBe(false);
    expect(assets.missing).toEqual(["missing"]);
    expect(assets.digestMismatch).toEqual(["mismatch"]);
  });
});

describe("halobank solar local-rest reference manifest", () => {
  it("loads a pinned published solar-motion reference set", async () => {
    const manifest = await loadSolarLocalRestReferenceManifest();
    expect(manifest.schema_version).toBe("halobank.solar.local_rest_reference/1");
    expect(manifest.default_reference_id).toBe("schonrich2010");
    expect(manifest.references.some((entry) => entry.id === "schonrich2010")).toBe(true);
    expect(manifest.references.some((entry) => entry.id === "huang2015")).toBe(true);
  });
});

describe("halobank solar metric-context manifest", () => {
  it("loads the pinned weak-field solar metric model contract", async () => {
    const manifest = await loadSolarMetricContextManifest();
    expect(manifest.schema_version).toBe("halobank.solar.metric_context/1");
    expect(manifest.model_id).toBe("halobank.solar.iau2000b1.3-weak-field-ppn-gr/1");
    expect(manifest.ppn_parameters.gamma).toBe(1);
    expect(manifest.source_potentials.some((entry) => entry.id === "sun_monopole")).toBe(true);
    expect(manifest.standards.some((entry) => entry.id === "iau2000_b1_3")).toBe(true);
  });
});
