import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NHM2_ET0_LAYER_AUTHORITY_DEFAULT_OUTPUT,
  buildNhm2Et0LayerAuthorityInventory,
  classifyNhm2Et0LayerAuthorityOccurrence,
  findExact447Columns,
} from "../tools/nhm2/build-et0-layer-authority-inventory";

const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

describe("NHM2 ET0 exact-447 authority inventory", () => {
  it("matches exact tokens without matching numeric or hash substrings", () => {
    expect(
      findExact447Columns("447 447-layer _447_ 1447 447a a447 94470"),
    ).toHaveLength(3);
    expect(findExact447Columns("sha256:abc447def")).toEqual([]);
  });

  it("keeps authority categories distinct", () => {
    expect(
      classifyNhm2Et0LayerAuthorityOccurrence(
        "shared/contracts/example.ts",
        "const scalarFixedControlVolume = 447;",
      ),
    ).toBe("scalar_equivalence");
    expect(
      classifyNhm2Et0LayerAuthorityOccurrence(
        "shared/contracts/example.ts",
        "const regional_tensor_sample_count_min = 447;",
      ),
    ).toBe("regional_tensor_sampling");
    expect(
      classifyNhm2Et0LayerAuthorityOccurrence(
        "shared/contracts/example.ts",
        "const candidateId = 'nhm2_447_layer';",
      ),
    ).toBe("architecture_identity");
    expect(
      classifyNhm2Et0LayerAuthorityOccurrence(
        "tests/example.spec.ts",
        "expect(layerCount).toBe(447);",
      ),
    ).toBe("test_fixture");
    expect(
      classifyNhm2Et0LayerAuthorityOccurrence(
        "docs/research/example.md",
        "The historical estimate was 447.",
      ),
    ).toBe("historical_or_planning_prose");
  });

  it("builds a deterministic, bounded inventory over the current repository", () => {
    const repoRoot = process.cwd();
    const first = buildNhm2Et0LayerAuthorityInventory(repoRoot);
    const second = buildNhm2Et0LayerAuthorityInventory(repoRoot);

    expect(first).toEqual(second);
    expect(first.inventoryDigestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.summary.sourceFileCount).toBeGreaterThan(20);
    expect(first.summary.occurrenceCount).toBeGreaterThan(100);
    expect(
      first.files.some(
        (file) =>
          file.path ===
          "shared/contracts/nhm2-layer-stack-mechanical-receipt.v1.ts",
      ),
    ).toBe(true);
    expect(
      first.occurrences.some(
        (occurrence) =>
          occurrence.path ===
            "shared/contracts/nhm2-tile-source-full-apparatus-tensor-values.v1.ts" &&
          occurrence.category === "regional_tensor_sampling",
      ),
    ).toBe(true);
    expect(
      first.occurrences.some((occurrence) =>
        occurrence.path.startsWith("server/_generated/"),
      ),
    ).toBe(false);
    expect(
      first.occurrences.some(
        (occurrence) =>
          occurrence.path === "client/src/lib/i18n/messages/ar.ts",
      ),
    ).toBe(false);
    expect(
      first.occurrences.some(
        (occurrence) =>
          occurrence.path === NHM2_ET0_LAYER_AUTHORITY_DEFAULT_OUTPUT,
      ),
    ).toBe(false);
    expect(first.claimBoundary).toEqual({
      diagnosticOnly: true,
      inventoryDoesNotSelectArchitecture: true,
      inventoryDoesNotPromoteV1Evidence: true,
      physicalViabilityClaimAllowed: false,
      proposalReadyClaimAllowed: false,
    });
  });

  it("keeps the published inventory synchronized with the current scan", () => {
    const repoRoot = process.cwd();
    const published = JSON.parse(
      readFileSync(
        resolve(repoRoot, NHM2_ET0_LAYER_AUTHORITY_DEFAULT_OUTPUT),
        "utf8",
      ),
    );

    expect(published).toEqual(buildNhm2Et0LayerAuthorityInventory(repoRoot));
  });

  it("preserves the frozen v1 source and regression identities", () => {
    const repoRoot = process.cwd();
    const expected = new Map<string, string>([
      [
        "shared/contracts/nhm2-wall-source-layering-sweep.v1.ts",
        "485f1c745de36c564a21dcbb970cb2a752c51682ae52359bb6e5854fef7f1068",
      ],
      [
        "tools/nhm2/build-wall-source-layering-sweep.ts",
        "f82547f3a07f65558f0a524d235bbb5c759f022367a2038596db869dc486330e",
      ],
      [
        "shared/contracts/nhm2-layer-stack-mechanical-receipt.v1.ts",
        "4359fd979cca46a0fa7ba3cf7c7f5727c72886034adeddb3b0587f620b47b57a",
      ],
      [
        "tests/nhm2-wall-source-layering-sweep.spec.ts",
        "b50f4c0aca61513b4012f81ea89bd39261d2378191b8854cd7d9b0a3508eaf03",
      ],
      [
        "tests/nhm2-layer-stack-mechanical-receipt.spec.ts",
        "421a6e802e89f70c4736c8b70aa740a66653e7b81a59d620aa4143e19ba83d6e",
      ],
    ]);

    for (const [relativePath, digest] of expected) {
      expect(sha256File(resolve(repoRoot, relativePath)), relativePath).toBe(
        digest,
      );
    }
  });
});
