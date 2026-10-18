import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import request from "supertest";
import { adapterRouter } from "../server/routes/agi.adapter";

describe("robotics recollection lane promotion", () => {
  it("declares explicit falsifier templates and reject rules for robotics recollection nodes", () => {
    const treePath = path.resolve(process.cwd(), "docs/knowledge/robotics-recollection-tree.json");
    const tree = JSON.parse(fs.readFileSync(treePath, "utf8")) as {
      nodes: Array<{ id: string; falsifier?: { template?: string; reject_rule?: string; deterministic_fail_reasons?: string[] } }>;
    };

    const requiredNodes = [
      "robotics-recollection",
      "demonstration-ingest",
      "primitive-segmentation",
      "replay-certificate",
      "replay-veto-contract",
    ];

    for (const nodeId of requiredNodes) {
      const node = tree.nodes.find((entry) => entry.id === nodeId);
      expect(node, `missing node ${nodeId}`).toBeDefined();
      expect(node?.falsifier?.template, `missing falsifier template for ${nodeId}`).toBeTruthy();
      expect(node?.falsifier?.reject_rule, `missing reject rule for ${nodeId}`).toBeTruthy();
      expect(node?.falsifier?.deterministic_fail_reasons?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("emits deterministic failReason in robotics veto contracts", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/agi/adapter", adapterRouter);

    const response = await request(app)
      .post("/api/agi/adapter/run")
      .send({
        traceId: "trace-robotics-recollection-veto-1",
        actions: [{ id: "intent-move", kind: "intent", params: { heading: 10 } }],
        roboticsSafety: {
          collisionMargin_m: 0.01,
          collisionMarginMin_m: 0.05,
          torqueUsageRatio: 0.7,
          torqueUsageMax: 0.8,
          speedUsageRatio: 0.6,
          speedUsageMax: 0.9,
          stabilityMargin: 0.4,
          stabilityMarginMin: 0.3,
        },
      })
      .expect(200);

    expect(response.body?.verdict).toBe("FAIL");
    expect(response.body?.firstFail?.id).toBe("ROBOTICS_SAFETY_COLLISION_MARGIN");
    expect(response.body?.failReason).toBe("ROBOTICS_SAFETY_COLLISION_MARGIN");
  });
});
