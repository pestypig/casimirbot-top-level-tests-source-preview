import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLeanCampaignCertificate } from "../../tools/nhm2/emit-lean-campaign-certificate";

const PROFILE_ID =
  "stage1_centerline_alpha_0p7000_observer_compatible_source_campaign_screen_v1";

const SOURCE_RUN_ROOT = path.join(
  "artifacts",
  "research",
  "full-solve",
  "profile-campaign-runs",
  PROFILE_ID,
);

const SOURCE_FRONTIER = path.join(
  "artifacts",
  "research",
  "full-solve",
  "profile-search",
  "nhm2-profile-campaign-frontier-latest.json",
);

const readJson = (filePath: string): any =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const writeJson = (filePath: string, value: unknown): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const copyFixture = (): { tempRoot: string; runRoot: string; frontierPath: string } => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nhm2-lean-cert-"));
  const runRoot = path.join(tempRoot, "run");
  fs.cpSync(SOURCE_RUN_ROOT, runRoot, { recursive: true });
  const frontierPath = path.join(tempRoot, "frontier.json");
  fs.copyFileSync(SOURCE_FRONTIER, frontierPath);
  return { tempRoot, runRoot, frontierPath };
};

const buildFrom = (runRoot: string, frontierPath: string) =>
  buildLeanCampaignCertificate({
    runRoot,
    frontierPath,
    outJson: path.join(runRoot, "nhm2-lean-campaign-certificate.json"),
    outLean: path.join("formal", "lean", "NHM2Formal", "Generated", "CurrentCampaignCertificate.lean"),
  });

describe("NHM2 Lean campaign certificate exporter", () => {
  it("admits the current 0p7000 campaign certificate diagnostically", () => {
    const certificate = buildFrom(SOURCE_RUN_ROOT, SOURCE_FRONTIER);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(true);
    expect(certificate.certificate.missingOrFailedFields).toEqual([]);
    expect(certificate.claimLocks.physicalViabilityClaimAllowed).toBe(false);
    expect(certificate.claimLocks.transportClaimAllowed).toBe(false);
    expect(certificate.clocking.routeEtaCertified).toBe(false);
  });

  it("fails closed when T0i evidence is missing", () => {
    const { runRoot, frontierPath } = copyFixture();
    const residualPath = path.join(runRoot, "nhm2-regional-full-tensor-residual.json");
    const residual = readJson(residualPath);
    residual.regions[0].missingTileComponentIds = ["T01"];
    writeJson(residualPath, residual);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain("tensor.hasT0i");
  });

  it("fails closed when off-diagonal spatial stress evidence is missing", () => {
    const { runRoot, frontierPath } = copyFixture();
    const residualPath = path.join(runRoot, "nhm2-regional-full-tensor-residual.json");
    const residual = readJson(residualPath);
    residual.regions[0].missingTileComponentIds = ["T12"];
    writeJson(residualPath, residual);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain("tensor.hasOffDiagonalTij");
  });

  it("fails closed when source evidence is target-derived or echoed", () => {
    const { runRoot, frontierPath } = copyFixture();
    const campaignPath = path.join(runRoot, "nhm2-time-dependent-source-campaign.json");
    const campaign = readJson(campaignPath);
    campaign.sourceIndependence.copiedFromMetricRequiredTensor = true;
    campaign.sourceIndependence.targetEchoDetected = true;
    writeJson(campaignPath, campaign);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain(
      "sourceIndependence.notCopiedFromMetricRequiredTensor",
    );
    expect(certificate.certificate.missingOrFailedFields).toContain("sourceIndependence.noTargetEcho");
  });

  it("fails closed on stale atlas hash congruence", () => {
    const { runRoot, frontierPath } = copyFixture();
    const observerPath = path.join(runRoot, "nhm2-observer-robust-energy-conditions.json");
    const observer = readJson(observerPath);
    observer.atlasHash = "0".repeat(64);
    writeJson(observerPath, observer);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain("identity.atlasHashMatches");
  });

  it("fails closed when observer evidence is Eulerian-only", () => {
    const { runRoot, frontierPath } = copyFixture();
    const observerPath = path.join(runRoot, "nhm2-observer-robust-energy-conditions.json");
    const observer = readJson(observerPath);
    observer.summary.eulerianOnly = true;
    for (const family of observer.observerFamilies) {
      if (family.familyId !== "eulerian") family.status = "not_run";
    }
    writeJson(observerPath, observer);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain("observer.notEulerianOnly");
    expect(certificate.certificate.missingOrFailedFields).toContain("observer.hasNonEulerianFamilyPass");
  });

  it("fails closed when frequency convergence exceeds its rational bound", () => {
    const { runRoot, frontierPath } = copyFixture();
    const frequencyPath = path.join(runRoot, "nhm2-frequency-convergence-evidence.json");
    const frequency = readJson(frequencyPath);
    frequency.entries[1].residualLInf = 0.2;
    writeJson(frequencyPath, frequency);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain(
      "frequency.maxResidualWithinTolerance",
    );
  });

  it("fails closed when dynamic effective geometry is not bounded", () => {
    const { runRoot, frontierPath } = copyFixture();
    const dynamicPath = path.join(runRoot, "nhm2-dynamic-effective-geometry-evidence.json");
    const dynamic = readJson(dynamicPath);
    dynamic.bounded = false;
    dynamic.residualLInf = 0.2;
    writeJson(dynamicPath, dynamic);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain("dynamicGeometry.bounded");
    expect(certificate.certificate.missingOrFailedFields).toContain(
      "dynamicGeometry.residualWithinBound",
    );
  });

  it("fails closed when QEI is scalar-only or lacks wall worldline dossier evidence", () => {
    const { runRoot, frontierPath } = copyFixture();
    const qeiPath = path.join(runRoot, "nhm2-qei-worldline-dossier.json");
    const qei = readJson(qeiPath);
    qei.summary.hasWallWorldline = false;
    qei.summary.dossierComplete = false;
    writeJson(qeiPath, qei);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain("qei.hasWallWorldline");
    expect(certificate.certificate.missingOrFailedFields).toContain("qei.dossierComplete");
  });

  it("fails closed when physical claim locks are open", () => {
    const { runRoot, frontierPath } = copyFixture();
    const campaignPath = path.join(runRoot, "nhm2-time-dependent-source-campaign.json");
    const campaign = readJson(campaignPath);
    campaign.claimBoundary.physicalViabilityClaimAllowed = true;
    writeJson(campaignPath, campaign);

    const certificate = buildFrom(runRoot, frontierPath);
    expect(certificate.certificate.diagnosticCampaignAdmissible).toBe(false);
    expect(certificate.certificate.missingOrFailedFields).toContain("claimLocks.closed");
  });
});
