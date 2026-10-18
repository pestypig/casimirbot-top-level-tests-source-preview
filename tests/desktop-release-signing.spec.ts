import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { verifyBinaryReleaseTarget } from "../apps/desktop/scripts/verify-binary-release-target.mjs";
import { isSignedCopyOfStagedPe } from "../apps/desktop/scripts/pe-signature-content.mjs";

const require = createRequire(import.meta.url);
const {
  resolveReleaseSigning,
  validateArtifactSigningEndpoint,
} = require("../apps/desktop/scripts/release-signing-config.cjs") as {
  resolveReleaseSigning: (input: {
    environment?: Record<string, string>;
    releaseMode: boolean;
  }) => {
    backend: "none" | "azure" | "pfx";
    publisherName: string | null;
    electronBuilderWin: Record<string, unknown>;
  };
  validateArtifactSigningEndpoint: (value: string) => string;
};
const { validateConfiguration } = require(
  "../apps/desktop/node_modules/app-builder-lib/out/util/config/config",
) as {
  validateConfiguration: (
    config: Record<string, unknown>,
    logger: { isEnabled: boolean; add: () => void },
  ) => Promise<void>;
};

const publisherName = "CN=CasimirBot, O=CasimirBot, C=US";
const azureEnvironment = {
  CASIMIR_DESKTOP_SIGNING_BACKEND: "azure",
  WINDOWS_PUBLISHER_NAME: publisherName,
  AZURE_ARTIFACT_SIGNING_ENDPOINT: "https://eus.codesigning.azure.net",
  AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME: "casimir-signing",
  AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME: "casimir-public-trust",
};

describe("desktop release signing backend", () => {
  it("allows a PE certificate append without allowing a bundled executable change", () => {
    const staged = Buffer.alloc(512);
    staged.write("MZ", 0, "ascii");
    staged.writeUInt32LE(0x80, 0x3c);
    staged.write("PE\0\0", 0x80, "ascii");
    staged.writeUInt16LE(224, 0x80 + 20);
    const optional = 0x80 + 24;
    staged.writeUInt16LE(0x10b, optional);
    staged.writeUInt32LE(16, optional + 92);
    staged.fill(0x5a, 0x200 - 16);
    const signed = Buffer.concat([staged, Buffer.alloc(16)]);
    signed.writeUInt32LE(0x1234, optional + 64);
    signed.writeUInt32LE(512, optional + 128);
    signed.writeUInt32LE(16, optional + 132);
    signed.writeUInt32LE(16, 512);

    expect(isSignedCopyOfStagedPe(staged, signed)).toBe(true);
    signed[480] ^= 1;
    expect(isSignedCopyOfStagedPe(staged, signed)).toBe(false);
  });
  it("keeps ordinary local packaging unsigned and credential-free", () => {
    expect(resolveReleaseSigning({
      environment: {},
      releaseMode: false,
    })).toEqual({
      backend: "none",
      publisherName: null,
      electronBuilderWin: {},
    });
  });

  it("requires an explicit release backend", () => {
    expect(() => resolveReleaseSigning({
      environment: { WINDOWS_PUBLISHER_NAME: publisherName },
      releaseMode: true,
    })).toThrow("CASIMIR_DESKTOP_SIGNING_BACKEND is required");
    expect(() => resolveReleaseSigning({
      environment: {
        CASIMIR_DESKTOP_SIGNING_BACKEND: "automatic",
        WINDOWS_PUBLISHER_NAME: publisherName,
      },
      releaseMode: true,
    })).toThrow("must be azure or pfx");
  });

  it("retains the advanced PFX path without selecting Azure", () => {
    const resolved = resolveReleaseSigning({
      environment: {
        CASIMIR_DESKTOP_SIGNING_BACKEND: "pfx",
        WINDOWS_PUBLISHER_NAME: publisherName,
        CSC_LINK: "opaque-certificate-value",
        CSC_KEY_PASSWORD: "opaque-password-value",
      },
      releaseMode: true,
    });

    expect(resolved).toEqual({
      backend: "pfx",
      publisherName,
      electronBuilderWin: {
        signtoolOptions: { publisherName: [publisherName] },
      },
    });
    expect(resolved.electronBuilderWin).not.toHaveProperty("azureSignOptions");
  });

  it("selects Azure Artifact Signing without a private-key secret", () => {
    const resolved = resolveReleaseSigning({
      environment: azureEnvironment,
      releaseMode: true,
    });

    expect(resolved).toEqual({
      backend: "azure",
      publisherName,
      electronBuilderWin: {
        azureSignOptions: {
          publisherName,
          endpoint: "https://eus.codesigning.azure.net/",
          codeSigningAccountName: "casimir-signing",
          certificateProfileName: "casimir-public-trust",
          fileDigest: "SHA256",
          timestampDigest: "SHA256",
          timestampRfc3161: "http://timestamp.acs.microsoft.com",
        },
      },
    });
    expect(resolved.electronBuilderWin).not.toHaveProperty("signtoolOptions");
  });

  it("validates both backends against the pinned Electron Builder schema", async () => {
    const pfx = resolveReleaseSigning({
      environment: {
        CASIMIR_DESKTOP_SIGNING_BACKEND: "pfx",
        WINDOWS_PUBLISHER_NAME: publisherName,
        CSC_LINK: "opaque-certificate-value",
        CSC_KEY_PASSWORD: "opaque-password-value",
      },
      releaseMode: true,
    });
    const azure = resolveReleaseSigning({
      environment: azureEnvironment,
      releaseMode: true,
    });
    const logger = { isEnabled: false, add: () => undefined };

    await expect(validateConfiguration({
      win: pfx.electronBuilderWin,
    }, logger)).resolves.toBeUndefined();
    await expect(validateConfiguration({
      win: azure.electronBuilderWin,
    }, logger)).resolves.toBeUndefined();
  });

  it.each([
    "http://eus.codesigning.azure.net",
    "https://example.com",
    "https://eus.codesigning.azure.net/extra",
    "https://user:password@eus.codesigning.azure.net",
  ])("rejects non-regional or credential-bearing endpoint %s", (endpoint) => {
    expect(() => validateArtifactSigningEndpoint(endpoint)).toThrow(
      "regional https://*.codesigning.azure.net endpoint",
    );
  });

  it("names missing inputs without echoing supplied values", () => {
    const sensitiveValue = "do-not-echo-this-value";
    let message = "";
    try {
      resolveReleaseSigning({
        environment: {
          ...azureEnvironment,
          AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME: sensitiveValue,
          AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME: "",
        },
        releaseMode: true,
      });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain(
      "AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME is required",
    );
    expect(message).not.toContain(sensitiveValue);
  });

  it("binds cloud signing to the main-ref OIDC subject on GitHub Free", async () => {
    const workflowSource = await readFile(
      path.resolve(".github/workflows/desktop-release.yml"),
      "utf8",
    );
    const workflow = parse(workflowSource);
    const buildJob = workflow.jobs["build-verify"];
    const azureLogin = buildJob.steps.find(
      (step: { name?: string }) =>
        step.name === "Authenticate to Azure for Artifact Signing",
    );

    expect(workflow.permissions["id-token"]).toBe("write");
    expect(buildJob.environment).toBeUndefined();
    expect(azureLogin.uses).toBe(
      "azure/login@7184910d9eb2b1c5e48f7073824a90609bb9b6d6",
    );
    expect(azureLogin.if).toContain(
      "vars.CASIMIR_DESKTOP_SIGNING_BACKEND == 'azure'",
    );
    expect(azureLogin.with).toEqual({
      "client-id": "${{ vars.AZURE_CLIENT_ID }}",
      "tenant-id": "${{ vars.AZURE_TENANT_ID }}",
      "subscription-id": "${{ vars.AZURE_SUBSCRIPTION_ID }}",
    });
    expect(workflowSource).toContain("AZURE_ARTIFACT_SIGNING_ENDPOINT");
    expect(workflowSource).toContain(
      "AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME",
    );
    expect(workflowSource).not.toContain("AZURE_CLIENT_SECRET");
  });

  it("requires two explicit owner dispatches and rechecks the exact candidate before publish", async () => {
    const candidate = parse(await readFile(path.resolve(".github/workflows/desktop-release.yml"), "utf8"));
    const publish = parse(await readFile(path.resolve(".github/workflows/desktop-release-publish.yml"), "utf8"));
    expect(candidate.on.workflow_dispatch.inputs.release_tag.required).toBe(true);
    expect(candidate.on).not.toHaveProperty("push");
    expect(candidate.jobs["build-verify"].if).toContain("github.actor == github.repository_owner");
    expect(candidate.jobs).not.toHaveProperty("publish");
    const adapterGate = candidate.jobs["build-verify"].steps.find(
      (step: { name?: string }) => step.name === "Casimir adapter release gate",
    );
    expect(adapterGate.run).toContain("& npm.cmd @casimirArgs");
    for (const input of ["release_tag", "candidate_run_id", "source_sha", "installer_sha256"]) {
      expect(publish.on.workflow_dispatch.inputs[input].required).toBe(true);
    }
    expect(publish.jobs.publish.if).toContain("github.ref == 'refs/heads/main'");
    expect(publish.concurrency).toMatchObject({ group: "desktop-release-publish", "cancel-in-progress": false });
    expect(publish.jobs.publish.environment).toBeUndefined();
    expect(publish.jobs.publish.permissions ?? publish.permissions).toMatchObject({ actions: "read", contents: "read" });
    const steps = publish.jobs.publish.steps;
    expect(steps.find((step: { name?: string }) => step.name === "Download exact candidate bundle").with)
      .toMatchObject({ "run-id": "${{ inputs.candidate_run_id }}", "github-token": "${{ github.token }}" });
    expect(steps.find((step: { name?: string }) => step.name === "Verify downloaded bundle and owner attestation").run)
      .toContain("verify-publish-bundle.mjs");
    expect(steps.find((step: { name?: string }) => step.name === "Verify immutable binary release target").run)
      .toContain("verify-binary-release-target.mjs");
    expect(steps.find((step: { name?: string }) => step.name === "Verify binary repository enforces immutable releases").run)
      .toContain("immutable-releases");
    const upload = steps.find((step: { name?: string }) => step.name === "Upload unpublished versioned release");
    const draftCheck = steps.find((step: { name?: string }) => step.name === "Verify uploaded draft assets before publication");
    const publishStep = steps.find((step: { name?: string }) => step.name === "Publish verified release");
    const publicCheck = steps.find((step: { name?: string }) => step.name === "Confirm public latest release and asset set");
    expect(upload.run).toContain("gh release create");
    expect(upload.run).toContain("--draft");
    expect(draftCheck.run).toContain("gh release download");
    expect(draftCheck.run).toContain("verify-publish-bundle.mjs");
    expect(publishStep.run).toContain("--draft=false --latest");
    expect(publicCheck.run).toContain(".immutable == true");
    expect(publicCheck.run).toContain(".digest");
    expect(steps.indexOf(upload)).toBeLessThan(steps.indexOf(draftCheck));
    expect(steps.indexOf(draftCheck)).toBeLessThan(steps.indexOf(publishStep));
    expect(steps.indexOf(publishStep)).toBeLessThan(steps.indexOf(publicCheck));
  });

  it("requires active update/deletion tag rules and a vacant binary tag", async () => {
    const responses = new Map<string, [number, unknown]>([
      ["", [200, { visibility: "public", default_branch: "main" }]],
      ["/rulesets?targets=tag", [200, [{ id: 42 }]]],
      ["/rulesets/42", [200, {
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/desktop-v*"], exclude: [] } },
        rules: [{ type: "update" }, { type: "deletion" }],
      }]],
    ]);
    const fetchImpl = async (url: string) => {
      const suffix = url.replace("https://api.github.com/repos/pestypig/casimirbot-desktop-releases", "");
      const [status, body] = responses.get(suffix) ?? [404, {}];
      return new Response(JSON.stringify(body), { status });
    };
    const args = {
      repository: "pestypig/casimirbot-desktop-releases",
      releaseTag: "desktop-v0.1.0-alpha.11",
      fetchImpl,
    };
    await expect(verifyBinaryReleaseTarget(args)).resolves.toMatchObject({ protectedByRuleset: true });
    responses.set("/rulesets/42", [200, {
      target: "tag", enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/desktop-v*"], exclude: [] } },
      rules: [{ type: "update" }],
    }]);
    await expect(verifyBinaryReleaseTarget(args)).rejects.toThrow("block updates and deletions");
    responses.set("/rulesets/42", [200, {
      target: "tag", enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/desktop-v*"], exclude: [] } },
      rules: [{ type: "update" }, { type: "deletion" }],
      bypass_actors: [{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }],
    }]);
    await expect(verifyBinaryReleaseTarget(args)).rejects.toThrow("block updates and deletions");
    responses.set("/rulesets/42", [200, {
      target: "tag", enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/desktop-v*"], exclude: [] } },
      rules: [{ type: "update" }, { type: "deletion" }],
    }]);
    responses.set("/git/ref/tags/desktop-v0.1.0-alpha.11", [200, { ref: "refs/tags/desktop-v0.1.0-alpha.11" }]);
    await expect(verifyBinaryReleaseTarget(args)).rejects.toThrow("binary tag already exists");
  });
});
