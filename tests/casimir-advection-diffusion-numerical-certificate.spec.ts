import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import record from "../docs/research/casimir-advection-diffusion-numerical-certificate.v1.json";
import primaryManifest from "../configs/research/casimir-numerical/advection-diffusion-lanyon-adapter-build.v1.json";
import independentManifest from "../configs/research/casimir-numerical/advection-diffusion-analytic-reference-build.v1.json";
import harnessManifest from "../configs/research/casimir-numerical/advection-diffusion-harness-runtime.v1.json";
import {
  validateCasimirIndependentNumericalVerificationCertificateIntegrityV1,
  type CasimirIndependentNumericalVerificationCertificateV1,
} from "../shared/contracts/casimir-independent-numerical-verification.v1";

const ROOT = path.resolve(import.meta.dirname, "..");
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

describe("Casimir Advection-Diffusion numerical certificate record", () => {
  it("retains an integrity-valid certificate with bounded authority", async () => {
    const certificate =
      record.certificate as CasimirIndependentNumericalVerificationCertificateV1;
    expect(
      await validateCasimirIndependentNumericalVerificationCertificateIntegrityV1(
        certificate,
      ),
    ).toEqual([]);
    expect(certificate).toMatchObject({
      status: "passed",
      artifactSha256:
        "1a3a6fd62f9684cf0c9beeed8f1361588cd9bda6a1d27f9ece0d6083588ffb65",
      authority: {
        frozenNumericalComparisonChecked: true,
        independentImplementationCompared: true,
        validatesSemanticIntent: false,
        validatesTheory: false,
        validatesGeneratedCode: false,
        validatesNumericalImplementation: false,
        validatesEmpiricalClaim: false,
        validatesPhysicalMechanism: false,
        assistantAnswer: false,
        terminalEligible: false,
        promotionAllowed: false,
      },
    });
    expect(record.upstreamLanyon).toMatchObject({
      vendored: false,
      licenseFileObserved: false,
      completeSimulationDriver: false,
    });
  });

  it("binds the portable record to the checked-in sources and manifests", async () => {
    const primaryManifestPath =
      "configs/research/casimir-numerical/advection-diffusion-lanyon-adapter-build.v1.json";
    const independentManifestPath =
      "configs/research/casimir-numerical/advection-diffusion-analytic-reference-build.v1.json";
    const harnessManifestPath =
      "configs/research/casimir-numerical/advection-diffusion-harness-runtime.v1.json";
    expect(
      sha256(await fs.readFile(path.join(ROOT, primaryManifestPath))),
    ).toBe(record.builds.primaryManifestSha256);
    expect(
      sha256(await fs.readFile(path.join(ROOT, independentManifestPath))),
    ).toBe(record.builds.independentManifestSha256);
    expect(
      sha256(await fs.readFile(path.join(ROOT, harnessManifestPath))),
    ).toBe(record.builds.harnessManifestSha256);
    expect(
      sha256(
        await fs.readFile(path.join(ROOT, primaryManifest.driver.logical_path)),
      ),
    ).toBe(primaryManifest.driver.sha256);
    expect(
      sha256(
        await fs.readFile(
          path.join(ROOT, independentManifest.source.logical_path),
        ),
      ),
    ).toBe(independentManifest.source.sha256);
    expect(
      sha256(
        await fs.readFile(path.join(ROOT, harnessManifest.source.logical_path)),
      ),
    ).toBe(harnessManifest.source.sha256);
  });
});
