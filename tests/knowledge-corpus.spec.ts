import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRouter } from "../server/routes/agi.plan";
import { knowledgeRouter } from "../server/routes/knowledge";
import { resetDbClient } from "../server/db/client";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://knowledge-corpus-tests";
process.env.ENABLE_ESSENCE = "1";
process.env.ENABLE_AGI = "1";
process.env.ENABLE_KNOWLEDGE_PROJECTS = "1";

describe("knowledge corpus", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use("/api/knowledge", knowledgeRouter);
    app.use("/api/agi", planRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await resetDbClient();
  });

  it("persists bundles and surfaces them to planners", async () => {
    const bundle = [
      {
        project: { id: "project:test", name: "Test Project", tags: ["docs"], type: "docs", hashSlug: "test-project" },
        summary: "Test project bundle",
        files: [
          {
            id: "file:alpha",
            name: "alpha.md",
            mime: "text/markdown",
            size: 256,
            hashSlug: "alpha-md",
            kind: "text",
            preview: "Alpha document describes warp safety procedures.",
            contentBase64: Buffer.from("Alpha document full body.").toString("base64"),
          },
        ],
      },
    ];

    const sync = await fetch(`${baseUrl}/api/knowledge/projects/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: bundle }),
    });
    expect(sync.status).toBe(200);
    const syncPayload = (await sync.json()) as { synced: number; projectIds: string[] };
    expect(syncPayload.synced).toBe(1);
    expect(syncPayload.projectIds).toContain("project:test");

    const planResponse = await fetch(`${baseUrl}/api/agi/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "Summarize the synced warp safety procedures.",
        personaId: "default",
        knowledgeProjects: ["project:test"],
      }),
    });
    expect(planResponse.status).toBe(200);
    const payload = (await planResponse.json()) as { knowledge_context: unknown[] };
    expect(Array.isArray(payload.knowledge_context)).toBe(true);
    const first = payload.knowledge_context[0] as KnowledgeProjectExport | undefined;
    expect(first?.project.id).toBe("project:test");
    expect(first?.files?.length).toBeGreaterThan(0);
    const retrievalAudit = (first as { audit?: { retrieval?: { claim_tier?: string; provenance?: { stage?: string } } } })?.audit
      ?.retrieval;
    expect(retrievalAudit?.claim_tier).toBe("diagnostic");
    expect(retrievalAudit?.provenance?.stage).toBe("retrieval");
  });
});

type KnowledgeProjectExport = {
  project: { id: string };
  files: Array<{ id: string }>;
};
