import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NHM2_FORMAL_APPROVED_LAKE_VERSION_OUTPUT,
  NHM2_FORMAL_APPROVED_LEAN_COMMIT_SHA,
  NHM2_FORMAL_APPROVED_LEAN_RELEASE,
  NHM2_FORMAL_APPROVED_LEAN_TOOLCHAIN_FILE,
  NHM2_FORMAL_APPROVED_TOOLCHAIN_TARGETS,
  assertNhm2FormalApprovedToolchainPolicy,
  compareNhm2FormalApprovedToolchainUtf8,
  computeNhm2FormalApprovedToolchainPolicySemanticSha256,
  type Nhm2FormalApprovedToolchainPolicySemanticV1,
} from "../shared/contracts/nhm2-formal-approved-toolchain-policy.v1";
import {
  NHM2_FORMAL_TOOLCHAIN_ENROLLMENT_AUTHORITY_NOTICE,
  Nhm2FormalToolchainEnrollmentError,
  enrollNhm2FormalApprovedToolchainPolicy,
  parseNhm2FormalToolchainEnrollmentCliArgs,
  type EnrollNhm2FormalApprovedToolchainPolicyInput,
} from "../tools/nhm2/enroll-formal-approved-toolchain-policy";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

type Fixture = {
  temporaryRoot: string;
  workspaceRoot: string;
  toolchainRoot: string;
  leanPath: string;
  lakePath: string;
  runtimePath: string;
  outputPath: string;
  input: EnrollNhm2FormalApprovedToolchainPolicyInput;
};

const temporaryRoots: string[] = [];
const fixedNow = new Date("2026-07-19T12:00:00.000Z");

const hostTarget =
  NHM2_FORMAL_APPROVED_TOOLCHAIN_TARGETS.find(
    (target) =>
      target.platform === process.platform &&
      target.architecture === process.arch,
  ) ??
  (() => {
    throw new Error(
      `Unsupported test host ${process.platform}/${process.arch}.`,
    );
  })();

const expectedLeanVersion =
  `Lean (version ${NHM2_FORMAL_APPROVED_LEAN_RELEASE}, ${hostTarget.leanTargetTriple}, ` +
  `commit ${NHM2_FORMAL_APPROVED_LEAN_COMMIT_SHA}, Release)`;

const spawnResult = (stdout: string) => ({
  pid: 1,
  output: [null, stdout, ""],
  stdout,
  stderr: "",
  status: 0,
  signal: null,
});

const mockedSpawnSync = vi.mocked(spawnSync);

const approveExactVersions = (fixture: Fixture): void => {
  mockedSpawnSync.mockImplementation(((command: string) => {
    const absolute = path.resolve(command);
    if (absolute === path.resolve(fixture.leanPath)) {
      return spawnResult(`${expectedLeanVersion}\n`);
    }
    if (absolute === path.resolve(fixture.lakePath)) {
      return spawnResult(`${NHM2_FORMAL_APPROVED_LAKE_VERSION_OUTPUT}\n`);
    }
    return {
      ...spawnResult(""),
      status: 1,
      stderr: "unexpected executable",
    };
  }) as typeof spawnSync);
};

async function makeFixture(): Promise<Fixture> {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nhm2-toolchain-enrollment-"),
  );
  temporaryRoots.push(temporaryRoot);
  const workspaceRoot = path.join(temporaryRoot, "workspace");
  const formalRoot = path.join(workspaceRoot, "formal", "lean");
  const toolchainRoot = path.join(temporaryRoot, "toolchain");
  const binRoot = path.join(toolchainRoot, "bin");
  const libRoot = path.join(toolchainRoot, "lib");
  const outputRoot = path.join(temporaryRoot, "approved-policies");
  await fs.mkdir(formalRoot, { recursive: true });
  await fs.mkdir(binRoot, { recursive: true });
  await fs.mkdir(libRoot, { recursive: true });
  await fs.mkdir(outputRoot);
  await fs.writeFile(
    path.join(formalRoot, "lean-toolchain"),
    `${NHM2_FORMAL_APPROVED_LEAN_TOOLCHAIN_FILE.exactUtf8Line}\n`,
    "utf8",
  );
  const leanPath = path.join(binRoot, "lean.exe");
  const lakePath = path.join(binRoot, "lake.exe");
  const runtimePath = path.join(libRoot, "runtime.dat");
  await fs.writeFile(leanPath, "fixture-lean-binary", "utf8");
  await fs.writeFile(lakePath, "fixture-lake-binary", "utf8");
  await fs.writeFile(runtimePath, "fixture-runtime", "utf8");
  await fs.writeFile(path.join(toolchainRoot, "A-NOTICE"), "notice", "utf8");
  const outputPath = path.join(outputRoot, "approved-toolchain.json");
  const input: EnrollNhm2FormalApprovedToolchainPolicyInput = {
    policyId: "nhm2-formal-lean-4.31.0-test",
    workspaceRoot,
    trustedToolchainRoot: toolchainRoot,
    trustedLeanExecutablePath: leanPath,
    trustedLakeExecutablePath: lakePath,
    outputPolicyPath: outputPath,
    now: () => fixedNow,
  };
  return {
    temporaryRoot,
    workspaceRoot,
    toolchainRoot,
    leanPath,
    lakePath,
    runtimePath,
    outputPath,
    input,
  };
}

async function expectFailure(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    name: Nhm2FormalToolchainEnrollmentError.name,
    code,
  });
}

beforeEach(() => {
  mockedSpawnSync.mockReset();
});

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    const temporaryRoot = temporaryRoots.pop();
    if (temporaryRoot != null) {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

describe("NHM2 formal approved-toolchain administrative enrollment", () => {
  it("publishes one exact pretty policy with a sorted complete ledger and closed claims", async () => {
    const fixture = await makeFixture();
    approveExactVersions(fixture);

    const result = await enrollNhm2FormalApprovedToolchainPolicy(fixture.input);
    const bytes = await fs.readFile(fixture.outputPath);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    assertNhm2FormalApprovedToolchainPolicy(parsed);

    expect(bytes.toString("utf8")).toBe(
      `${JSON.stringify(result.policy, null, 2)}\n`,
    );
    expect(result.policyPath).toBe(fixture.outputPath);
    expect(result.policySha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(result.policySizeBytes).toBe(bytes.byteLength);
    expect(result.authorityNotice).toBe(
      NHM2_FORMAL_TOOLCHAIN_ENROLLMENT_AUTHORITY_NOTICE,
    );
    expect(result.authorityNotice).toContain(
      "administrative enrollment inputs only",
    );
    expect(result.authorityNotice).toContain("server-owned immutable policy");

    const paths = result.policy.toolchainLedger.entries.map(
      (entry) => entry.relativePath,
    );
    expect(paths).toEqual([
      "A-NOTICE",
      "bin/lake.exe",
      "bin/lean.exe",
      "lib/runtime.dat",
    ]);
    expect(
      paths.every(
        (candidate, index) =>
          index === 0 ||
          compareNhm2FormalApprovedToolchainUtf8(paths[index - 1], candidate) <
            0,
      ),
    ).toBe(true);
    expect(result.policy.executables.lean.relativePath).toBe("bin/lean.exe");
    expect(result.policy.executables.lake.relativePath).toBe("bin/lake.exe");
    expect(result.policy.approvedEnvironment).toEqual({
      allowlist: [],
      values: [],
    });
    expect(result.policy.claimBoundary.physicalViabilityClaimAllowed).toBe(
      false,
    );
    expect(result.policy.claimBoundary.theoryClosureClaimAllowed).toBe(false);
    const { semanticSha256: _semanticSha256, ...semantic } = result.policy;
    expect(result.policy.semanticSha256).toBe(
      computeNhm2FormalApprovedToolchainPolicySemanticSha256(
        semantic as Nhm2FormalApprovedToolchainPolicySemanticV1,
      ),
    );

    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockedSpawnSync.mock.calls[0][0]).toBe(fixture.leanPath);
    expect(mockedSpawnSync.mock.calls[0][1]).toEqual(["--version"]);
    expect(mockedSpawnSync.mock.calls[1][0]).toBe(fixture.lakePath);
    expect(mockedSpawnSync.mock.calls[1][1]).toEqual(["--version"]);
    for (const call of mockedSpawnSync.mock.calls) {
      expect(call[2]).toMatchObject({
        cwd: fixture.toolchainRoot,
        env: {},
        shell: false,
        windowsHide: true,
      });
    }
  });

  it("rejects Lean/Lake path aliases before treating caller labels as authority", async () => {
    const fixture = await makeFixture();
    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy({
        ...fixture.input,
        trustedLakeExecutablePath: fixture.leanPath,
      }),
      "toolchain_executable_alias",
    );
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it("rejects a reparse or symbolic-link entry in the scanned tree", async () => {
    const fixture = await makeFixture();
    const external = path.join(fixture.temporaryRoot, "external-directory");
    await fs.mkdir(external);
    await fs.writeFile(path.join(external, "foreign.dat"), "foreign", "utf8");
    await fs.symlink(
      external,
      path.join(fixture.toolchainRoot, "linked-directory"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy(fixture.input),
      "symlink_or_reparse_forbidden",
    );
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it("rejects hardlinked toolchain files", async () => {
    const fixture = await makeFixture();
    await fs.link(
      fixture.runtimePath,
      path.join(fixture.toolchainRoot, "lib", "runtime-alias.dat"),
    );

    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy(fixture.input),
      "hardlink_forbidden",
    );
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it("rejects missing and extra unbound executable paths", async () => {
    const missing = await makeFixture();
    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy({
        ...missing.input,
        trustedLeanExecutablePath: path.join(
          missing.toolchainRoot,
          "bin",
          "missing-lean.exe",
        ),
      }),
      "toolchain_executable_missing",
    );

    const extra = await makeFixture();
    const outsideExecutable = path.join(
      extra.temporaryRoot,
      "unbound-extra-lean.exe",
    );
    await fs.writeFile(outsideExecutable, "extra", "utf8");
    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy({
        ...extra.input,
        trustedLeanExecutablePath: outsideExecutable,
      }),
      "toolchain_executable_outside_root",
    );
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it("rejects exact Lean or Lake version-output drift", async () => {
    const fixture = await makeFixture();
    mockedSpawnSync.mockImplementation(((command: string) => {
      if (path.resolve(command) === path.resolve(fixture.leanPath)) {
        return spawnResult(
          "Lean (version 4.32.0, wrong-target, commit wrong, Release)\n",
        );
      }
      return spawnResult(`${NHM2_FORMAL_APPROVED_LAKE_VERSION_OUTPUT}\n`);
    }) as typeof spawnSync);

    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy(fixture.input),
      "lean_version_mismatch",
    );
    await expect(fs.lstat(fixture.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("detects a toolchain mutation across version execution with a full TOCTOU replay", async () => {
    const fixture = await makeFixture();
    mockedSpawnSync.mockImplementation(((command: string) => {
      if (path.resolve(command) === path.resolve(fixture.leanPath)) {
        writeFileSync(
          fixture.runtimePath,
          "mutated-runtime-with-new-size",
          "utf8",
        );
        return spawnResult(`${expectedLeanVersion}\n`);
      }
      return spawnResult(`${NHM2_FORMAL_APPROVED_LAKE_VERSION_OUTPUT}\n`);
    }) as typeof spawnSync);

    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy(fixture.input),
      "toolchain_changed",
    );
    await expect(fs.lstat(fixture.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("never overwrites an existing policy output", async () => {
    const fixture = await makeFixture();
    approveExactVersions(fixture);
    await enrollNhm2FormalApprovedToolchainPolicy(fixture.input);
    const before = await fs.readFile(fixture.outputPath);

    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy(fixture.input),
      "output_exists",
    );
    expect(await fs.readFile(fixture.outputPath)).toEqual(before);
  });

  it("fails closed when a tightened contract resource ceiling is exceeded", async () => {
    const fixture = await makeFixture();
    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy({
        ...fixture.input,
        scanLimits: { maxLedgerEntryBytes: 3 },
      }),
      "resource_limit_exceeded",
    );
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it("rejects repository lean-toolchain byte drift before version execution", async () => {
    const fixture = await makeFixture();
    await fs.writeFile(
      path.join(fixture.workspaceRoot, "formal", "lean", "lean-toolchain"),
      "leanprover/lean4:v4.32.0\n",
      "utf8",
    );
    await expectFailure(
      enrollNhm2FormalApprovedToolchainPolicy(fixture.input),
      "formal_lean_toolchain_file_mismatch",
    );
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it("parses only the exact administrative CLI surface", () => {
    const parsed = parseNhm2FormalToolchainEnrollmentCliArgs([
      "--policy-id",
      "policy.test",
      "--trusted-toolchain-root",
      "C:\\toolchain",
      "--trusted-lean-executable",
      "C:\\toolchain\\bin\\lean.exe",
      "--trusted-lake-executable",
      "C:\\toolchain\\bin\\lake.exe",
      "--output-policy",
      "C:\\policies\\lean.json",
    ]);
    expect(parsed.policyId).toBe("policy.test");
    expect(parsed.workspaceRoot).toBeUndefined();
    expect(() =>
      parseNhm2FormalToolchainEnrollmentCliArgs([
        "--policy-id",
        "policy.test",
        "--extra-binary",
        "untrusted.exe",
      ]),
    ).toThrow("Unknown argument: --extra-binary");
  });
});
