import { beforeEach, describe, expect, it } from "vitest";

describe("helix ask route seam registration", () => {
  beforeEach(() => {
    process.env.ENABLE_AGI = "1";
  });

  it("keeps the /ask post route registered after entry-preflight extraction", async () => {
    const { planRouter } = await import("../server/routes/agi.plan");
    const askLayers = planRouter.stack.filter((layer: any) => {
      const route = layer?.route;
      return route?.path === "/ask" && route?.methods?.post === true;
    });

    expect(askLayers).toHaveLength(1);
  }, 20000);
});
