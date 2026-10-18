import { describe, expect, it } from "vitest";
import { runCommand } from "../server/utils/execute-command";

describe("runCommand", () => {
  it("captures stdout and stdin using the Node executable", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.stdin.on('data', value => process.stdout.write(value))"],
      { input: "patch input" },
    );
    expect(result).toMatchObject({
      stdout: "patch input",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
  });

  it("returns a nonzero result when rejection is disabled", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.stderr.write('failed'); process.exit(2)"],
      { reject: false },
    );
    expect(result).toMatchObject({ exitCode: 2, stderr: "failed", timedOut: false });
  });

  it("rejects a nonzero exit by default", async () => {
    await expect(runCommand(process.execPath, ["-e", "process.exit(3)"]))
      .rejects.toMatchObject({ exitCode: 3 });
  });
});
