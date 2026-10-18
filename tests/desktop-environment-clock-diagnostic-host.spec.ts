import { describe, it } from "vitest";
import { runPrivateClockHostDiagnostic } from "../scripts/environment-packages/measure-private-clock-host";

// Requires a newly built private diagnostic helper/empty trace from --build-host.
// This tests the real composition in a worker; it never approves diagnostic bytes.
describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("instrumented full native host", () => {
  it("retains first-use and reused deadline outcomes inside the Vitest worker", async () => {
    await runPrivateClockHostDiagnostic(true);
  }, 30000);
});
