import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createAgiAdmissionControl } from "../server/routes";

describe("agi admission control", () => {
  it("returns deterministic 429 envelope when overloaded", async () => {
    const app = express();
    app.use("/api/agi", createAgiAdmissionControl(0));
    app.post("/api/agi/ask", (_req, res) => res.status(200).json({ ok: true }));

    const res = await request(app).post("/api/agi/ask").send({});
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe("agi_overload_admission_control");
    expect(res.body.error).toBe("agi_overloaded");
  });
});
