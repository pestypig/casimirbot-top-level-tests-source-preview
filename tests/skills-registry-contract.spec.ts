import { beforeEach, describe, expect, it } from "vitest";
import { listTools, registerTool, unregisterTool } from "../server/skills";
import { ToolSpec } from "../shared/skills";

const TOOL_NAME = "skills.registry.contract.test";

describe("skills registry contract", () => {
  beforeEach(() => {
    unregisterTool(TOOL_NAME);
  });

  it("adds risk and provenance fields to manifest output", async () => {
    registerTool({
      ...ToolSpec.parse({
        name: TOOL_NAME,
        desc: "contract tool",
        inputSchema: {},
        outputSchema: {},
        deterministic: true,
        rateLimit: { rpm: 30 },
        safety: { risks: [] },
        risk: { writesFiles: true, touchesNetwork: false, privileged: false },
        provenance: {
          maturity: "reduced-order",
          certifying: false,
          metadataComplete: true,
          sourceClass: "declared",
        },
      }),
      handler: async () => ({ ok: true }),
    });

    const manifest = listTools();
    const entry = manifest.find((tool) => tool.name === TOOL_NAME);
    expect(entry).toBeTruthy();
    expect(entry?.risk).toEqual({ writesFiles: true, touchesNetwork: false, privileged: false });
    expect(entry?.provenance).toMatchObject({
      maturity: "reduced-order",
      certifying: false,
      metadataComplete: true,
      sourceClass: "declared",
    });
  });

  it("enforces conservative defaults when metadata is incomplete", async () => {
    registerTool({
      ...ToolSpec.parse({
        name: TOOL_NAME,
        desc: "incomplete metadata tool",
        inputSchema: {},
        outputSchema: {},
      }),
      handler: async () => ({ ok: true }),
    });

    const entry = listTools().find((tool) => tool.name === TOOL_NAME);
    expect(entry).toBeTruthy();
    expect(entry?.risk).toEqual({ writesFiles: false, touchesNetwork: false, privileged: false });
    expect(entry?.provenance).toMatchObject({
      maturity: "diagnostic",
      certifying: false,
      metadataComplete: false,
      sourceClass: "inferred",
    });
  });
});
