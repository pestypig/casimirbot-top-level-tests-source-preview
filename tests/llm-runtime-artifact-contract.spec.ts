import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getRuntimeArtifactStatuses,
  hydrateRuntimeArtifacts,
} from "../server/services/llm/runtime-artifacts";

const sha256 = (input: string): string => createHash("sha256").update(input).digest("hex");

const withEnv = async (vars: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe("llm runtime artifact provenance contract", () => {
  beforeEach(async () => {
    await withEnv(
      {
        LLM_LOCAL_CMD_OBJECT_KEY: undefined,
        LLM_LOCAL_MODEL_OBJECT_KEY: undefined,
        LLM_LOCAL_LORA_OBJECT_KEY: undefined,
        LLM_LOCAL_INDEX_OBJECT_KEY: undefined,
        LLM_LOCAL_INDEX_PATH: undefined,
        LLM_LOCAL_INDEX_SHA256: undefined,
      },
      async () => {
        await hydrateRuntimeArtifacts();
      },
    );
  });

  it("records conservative local provenance for missing integrity input", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-artifacts-"));
    const indexPath = path.join(tmpDir, "code-lattice.json");
    await fs.writeFile(indexPath, "diagnostic index");

    await withEnv(
      {
        LLM_LOCAL_INDEX_OBJECT_KEY: undefined,
        LLM_LOCAL_INDEX_PATH: indexPath,
        LLM_LOCAL_INDEX_SHA256: undefined,
      },
      async () => {
        await hydrateRuntimeArtifacts();
      },
    );

    const index = getRuntimeArtifactStatuses().find((entry) => entry.label === "index");
    expect(index).toBeTruthy();
    expect(index?.provenance.sourceClass).toBe("local-env");
    expect(index?.provenance.hydrationMode).toBe("local_only");
    expect(index?.provenance.integrityState).toBe("unverifiable");
  });

  it("fails conservatively and marks mismatch when local integrity hash differs", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-artifacts-"));
    const indexPath = path.join(tmpDir, "code-lattice.json");
    const content = "runtime index artifact";
    await fs.writeFile(indexPath, content);

    const wrongHash = sha256(`${content}-not-matching`);

    await expect(
      withEnv(
        {
          LLM_LOCAL_INDEX_OBJECT_KEY: undefined,
          LLM_LOCAL_INDEX_PATH: indexPath,
          LLM_LOCAL_INDEX_SHA256: wrongHash,
        },
        async () => {
          await hydrateRuntimeArtifacts();
        },
      ),
    ).rejects.toThrow(/sha256 mismatch/);

    const index = getRuntimeArtifactStatuses().find((entry) => entry.label === "index");
    expect(index).toBeTruthy();
    expect(index?.provenance.sourceClass).toBe("local-env");
    expect(index?.provenance.hydrationMode).toBe("local_only");
    expect(index?.provenance.integrityState).toBe("mismatch");
    expect(index?.provenance.expectedSha256).toBe(wrongHash);
    expect(index?.provenance.observedSha256).toBe(sha256(content));
  });
});
