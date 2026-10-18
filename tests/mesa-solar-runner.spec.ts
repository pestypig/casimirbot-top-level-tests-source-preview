import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStarSimSolverRuntimePolicy } from "../server/modules/starsim/external/solver-runtime-policy";
import {
  runMesaSolarReference,
  sha256Text,
} from "../server/modules/starsim/external/mesa-solar-runner";

const profilePath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "starsim-solar-reference",
  "solar-mesa-profile.fixture.json",
);

const mesa = {
  initialMass_Msun: 1,
  targetAge_Gyr: 4.57,
  inlistHash: "fixture-inlist",
  network: "pp_cno_extras.net",
  ratesSource: "jina-reaclib-fixture",
};

describe("MESA solar runner runtime policy", () => {
  it("reports disabled runtime", () => {
    const status = resolveStarSimSolverRuntimePolicy({
      runtimeKind: "disabled",
      allowFixtureFallback: false,
      requireExternalHashes: false,
      failIfSolverUnavailable: false,
    });
    expect(status.status).toBe("disabled");
  });

  it("loads fixture profile explicitly in fixture_only mode", () => {
    const result = runMesaSolarReference({
      runtimePolicy: {
        runtimeKind: "fixture_only",
        allowFixtureFallback: false,
        requireExternalHashes: false,
        failIfSolverUnavailable: true,
      },
      fixtureProfilePath: profilePath,
      mesa,
    });
    expect(result.status).toBe("fixture_only");
    expect(result.profile?.objectId).toBe("Sun");
  });

  it("reports unavailable when an external solver is missing", () => {
    expect(() =>
      runMesaSolarReference({
        runtimePolicy: {
          runtimeKind: "local",
          allowFixtureFallback: false,
          requireExternalHashes: true,
          failIfSolverUnavailable: true,
        },
        fixtureProfilePath: profilePath,
        mesa,
      }),
    ).toThrow(/unavailable/);
  });

  it("hash helper is deterministic", () => {
    expect(sha256Text("solar")).toBe(sha256Text("solar"));
    expect(sha256Text("solar")).not.toBe(sha256Text("lunar"));
  });

  it("does not silently fall back to fixture for external runtime", () => {
    expect(() =>
      runMesaSolarReference({
        runtimePolicy: {
          runtimeKind: "docker",
          allowFixtureFallback: true,
          requireExternalHashes: true,
          failIfSolverUnavailable: true,
        },
        fixtureProfilePath: profilePath,
        mesa,
      }),
    ).toThrow(/fallback/);
  });

  it("fixture exists as valid JSON", () => {
    expect(JSON.parse(readFileSync(profilePath, "utf8")).schemaVersion).toBe(
      "starsim-fusion-profile-import.v1",
    );
  });
});
