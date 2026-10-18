import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const buildDiagnosticsMock = vi.fn();

vi.mock("@shared/time-dilation-diagnostics", async () => {
  const actual = await vi.importActual<typeof import("@shared/time-dilation-diagnostics")>(
    "@shared/time-dilation-diagnostics",
  );
  return {
    ...actual,
    buildTimeDilationDiagnostics: buildDiagnosticsMock,
  };
});

describe("/api/helix/time-dilation/activate contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pending diagnostics object shape for async accepted response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, overallStatus: "NOMINAL", strictCongruence: true }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    buildDiagnosticsMock.mockResolvedValue({
      kind: "time_dilation_diagnostics",
      renderingSeed: "diag:seed:full",
      gate: { banner: null, reasons: [] },
      strict: {
        strictCongruence: true,
        latticeMetricOnly: true,
        strictMetricMissing: false,
        anyProxy: false,
        mathStageOK: true,
        grCertified: true,
        banner: null,
      },
      canonical: {
        family: "natario",
        chart: "comoving_cartesian",
        observer: "ship",
        normalization: "metric",
        unitSystem: null,
        match: null,
      },
      definitions: {
        theta_definition: null,
        kij_sign_convention: null,
        gamma_field_naming: null,
        field_provenance_schema: null,
      },
      fieldProvenance: {},
      metric_contract: {
        metric_t00_contract_ok: true,
        metric_chart_contract_status: "ok",
        metric_chart_notes: null,
        metric_coordinate_map: null,
      },
      render_plan: {},
      sources: { proof_pack_proxy: false, gr_guardrails_proxy: false },
      wall: {},
      captured_at: new Date().toISOString(),
      observables: {},
      provenance: {},
      congruence: {
        kind: "ship_comoving",
        requiredFieldsOk: true,
        missingFields: [],
        gaugeNote: null,
      },
      natarioCanonical: {
        requiredFieldsOk: true,
        canonicalSatisfied: true,
        checks: {
          divBeta: { status: "pass", rms: 0, maxAbs: 0, tolerance: 0.1, source: "x" },
          thetaKConsistency: { status: "pass", theta: 0, kTrace: 0, residualAbs: 0, tolerance: 0.1, source: "x" },
        },
        reason: null,
      },
      gr: { dims: null, meta: null, solverHealth: null },
    });

    const { helixTimeDilationRouter } = await import("../server/routes/helix/time-dilation");
    const app = express();
    app.use(express.json());
    app.use("/api/helix/time-dilation", helixTimeDilationRouter);

    const res = await request(app)
      .post("/api/helix/time-dilation/activate")
      .send({ warpFieldType: "natario", grEnabled: true, strictCongruence: true, async: true });

    expect(res.status).toBe(202);
    expect(res.body?.accepted).toBe(true);
    expect(res.body?.pipelineUpdate).toEqual(expect.objectContaining({ ok: true, pending: true }));
    expect(res.body?.diagnostics).toEqual(
      expect.objectContaining({ ok: false, pending: true, error: "diagnostics_pending" }),
    );
    expect(res.body?.warnings).toEqual(expect.arrayContaining(["diagnostics_partial"]));
  });



  it("returns diagnostics_partial warning when strict gate is blocked by missing congruence fields", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, overallStatus: "NOMINAL", strictCongruence: true }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    buildDiagnosticsMock.mockResolvedValue({
      kind: "time_dilation_diagnostics",
      renderingSeed: "diag:seed:blocked",
      gate: { banner: "BLOCKED", reasons: ["verification:hard_constraints_unknown"] },
      strict: {
        strictCongruence: true,
        latticeMetricOnly: true,
        strictMetricMissing: true,
        anyProxy: true,
        mathStageOK: true,
        grCertified: false,
        banner: "BLOCKED",
        failId: "ADAPTER_CONSTRAINTS_UNKNOWN",
        failClosedReasons: ["hard_constraints_unknown"],
      },
      canonical: {
        family: "natario",
        chart: "comoving_cartesian",
        observer: "ship",
        normalization: "metric",
        unitSystem: null,
        match: null,
      },
      definitions: {
        theta_definition: null,
        kij_sign_convention: null,
        gamma_field_naming: null,
        field_provenance_schema: null,
      },
      fieldProvenance: {},
      metric_contract: {
        metric_t00_contract_ok: true,
        metric_chart_contract_status: "ok",
        metric_chart_notes: null,
        metric_coordinate_map: null,
      },
      render_plan: {},
      sources: { proof_pack_proxy: false, gr_guardrails_proxy: false },
      wall: {},
      captured_at: new Date().toISOString(),
      observables: {
        ship_comoving_dtau_dt: {
          source: "adm_worldline",
          observerFamily: "ship_comoving",
          chart: "comoving_cartesian",
          units: "dimensionless",
          valid: false,
          missingFields: ["shipKinematics.betaCoord", "shipKinematics.dxdt"],
        },
      },
      provenance: {},
      congruence: {
        kind: "ship_comoving",
        requiredFieldsOk: false,
        missingFields: ["shipKinematics.betaCoord", "shipKinematics.dxdt"],
        gaugeNote: null,
      },
      natarioCanonical: {
        requiredFieldsOk: false,
        canonicalSatisfied: false,
        checks: {
          divBeta: { status: "unknown", rms: null, maxAbs: null, tolerance: 0.1, source: "x" },
          thetaKConsistency: { status: "unknown", theta: null, kTrace: null, residualAbs: null, tolerance: 0.1, source: "x" },
        },
        reason: "natario_required_fields_missing",
      },
      gr: { dims: null, meta: null, solverHealth: null },
    });

    const { helixTimeDilationRouter } = await import("../server/routes/helix/time-dilation");
    const app = express();
    app.use(express.json());
    app.use("/api/helix/time-dilation", helixTimeDilationRouter);

    const res = await request(app)
      .post("/api/helix/time-dilation/activate")
      .send({ warpFieldType: "natario", grEnabled: true, strictCongruence: true, async: false });

    expect(res.status).toBe(200);
    expect(res.body?.warnings).toEqual(expect.arrayContaining(["diagnostics_partial"]));
    expect(res.body?.diagnostics?.strict).toEqual(
      expect.objectContaining({
        grCertified: false,
        failId: "ADAPTER_CONSTRAINTS_UNKNOWN",
      }),
    );
    expect(res.body?.diagnostics?.congruence).toEqual(
      expect.objectContaining({
        requiredFieldsOk: false,
      }),
    );
  });

  it("publishes explicit error diagnostics shape when async background fails", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, overallStatus: "CRITICAL", strictCongruence: true }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    buildDiagnosticsMock.mockRejectedValue(new Error("diagnostics offline"));

    const { helixTimeDilationRouter } = await import("../server/routes/helix/time-dilation");
    const app = express();
    app.use(express.json());
    app.use("/api/helix/time-dilation", helixTimeDilationRouter);

    const activateRes = await request(app)
      .post("/api/helix/time-dilation/activate")
      .send({ warpFieldType: "natario", grEnabled: true, strictCongruence: true, async: true });

    expect(activateRes.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const diagRes = await request(app).get("/api/helix/time-dilation/diagnostics");
    expect(diagRes.status).toBe(200);
    expect(diagRes.body).toEqual(
      expect.objectContaining({ ok: false, status: "error", reason: "activate_failed" }),
    );
  });
});

describe("/api/helix/time-dilation/control", () => {
  it("accepts codex control commands and returns latest command", async () => {
    const { helixTimeDilationRouter } = await import("../server/routes/helix/time-dilation");
    const app = express();
    app.use(express.json());
    app.use("/api/helix/time-dilation", helixTimeDilationRouter);

    const postRes = await request(app)
      .post("/api/helix/time-dilation/control")
      .send({ command: "set_debug_overrides", args: { alphaSource: "gr-brick" }, source: "codex" });

    expect(postRes.status).toBe(200);
    expect(postRes.body?.ok).toBe(true);

    const getRes = await request(app).get("/api/helix/time-dilation/control");
    expect(getRes.status).toBe(200);
    expect(getRes.body?.command).toEqual(expect.objectContaining({ command: "set_debug_overrides", source: "codex" }));
  });
});
