import { afterEach, describe, expect, it, vi } from "vitest";

const envBackup = {
  TS_AUTOSCALE_ENABLE: process.env.TS_AUTOSCALE_ENABLE,
  TS_AUTOSCALE_TARGET: process.env.TS_AUTOSCALE_TARGET,
  QI_AUTOSCALE_ENABLE: process.env.QI_AUTOSCALE_ENABLE,
  QI_AUTOSCALE_TARGET: process.env.QI_AUTOSCALE_TARGET,
  QI_AUTOSCALE_SOURCE: process.env.QI_AUTOSCALE_SOURCE,
  WARP_STRICT_CONGRUENCE: process.env.WARP_STRICT_CONGRUENCE,
};

const loadPipeline = async () => {
  vi.resetModules();
  const mod = await import("../server/energy-pipeline");
  return mod;
};

afterEach(() => {
  process.env.TS_AUTOSCALE_ENABLE = envBackup.TS_AUTOSCALE_ENABLE;
  process.env.TS_AUTOSCALE_TARGET = envBackup.TS_AUTOSCALE_TARGET;
  process.env.QI_AUTOSCALE_ENABLE = envBackup.QI_AUTOSCALE_ENABLE;
  process.env.QI_AUTOSCALE_TARGET = envBackup.QI_AUTOSCALE_TARGET;
  process.env.QI_AUTOSCALE_SOURCE = envBackup.QI_AUTOSCALE_SOURCE;
  process.env.WARP_STRICT_CONGRUENCE = envBackup.WARP_STRICT_CONGRUENCE;
});

describe("pipeline ts/qi autoscale integration", () => {
  it("keeps QI guard consistent when TS autoscale is active", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "0";
    process.env.TS_AUTOSCALE_ENABLE = "true";
    process.env.TS_AUTOSCALE_TARGET = "1000000"; // force TS servo to engage hard
    process.env.QI_AUTOSCALE_ENABLE = "false";
    process.env.QI_AUTOSCALE_SOURCE = "metric";

    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();

    const baseline = await calculateEnergyPipeline(initializePipelineState());
    await new Promise((resolve) => setTimeout(resolve, 200));
    const autoscaled = await calculateEnergyPipeline(baseline);

    const baseBurst =
      (baseline as any).lightCrossing?.burst_ns ??
      ((baseline as any).lightCrossing?.burst_ms ?? 0) * 1e6;
    const autoBurst =
      (autoscaled as any).lightCrossing?.burst_ns ??
      ((autoscaled as any).lightCrossing?.burst_ms ?? 0) * 1e6;

    expect(autoscaled.tsAutoscale?.engaged ?? false).toBe(true);
    expect(autoBurst).toBeLessThanOrEqual(baseBurst);

    const guard = (autoscaled as any).qiGuardrail;
    expect(guard?.marginRatioRaw).toBeDefined();
    expect(Number.isFinite(guard?.marginRatioRaw ?? Number.NaN)).toBe(true);
    expect(guard?.marginRatioRaw ?? 0).toBeGreaterThan(0);
    expect(Math.abs((guard?.sumWindowDt ?? 1) - 1)).toBeLessThanOrEqual(0.1);
  });

  it("keeps TS timing stable when only QI autoscale is active", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "0";
    process.env.TS_AUTOSCALE_ENABLE = "false";
    process.env.TS_AUTOSCALE_TARGET = "120";
    process.env.QI_AUTOSCALE_ENABLE = "true";
    process.env.QI_AUTOSCALE_TARGET = "0.0000005"; // force QI servo to engage
    process.env.QI_AUTOSCALE_SOURCE = "metric";

    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();

    const baseline = await calculateEnergyPipeline(initializePipelineState());
    await new Promise((resolve) => setTimeout(resolve, 200));
    const autoscaled = await calculateEnergyPipeline(baseline);

    const baseBurst =
      (baseline as any).lightCrossing?.burst_ns ??
      ((baseline as any).lightCrossing?.burst_ms ?? 0) * 1e6;
    const autoBurst =
      (autoscaled as any).lightCrossing?.burst_ns ??
      ((autoscaled as any).lightCrossing?.burst_ms ?? 0) * 1e6;

    expect(autoscaled.qiAutoscale?.engaged ?? false).toBe(true);
    expect((autoscaled.qiAutoscale as any).gating).toBe("active");
    expect(autoBurst).toBeCloseTo(baseBurst, 6);
    expect(autoscaled.tsAutoscale?.engaged ?? false).toBe(false);
  });

  it("marks TS as metric-derived when charted metric adapter and derived timing are active", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    process.env.TS_AUTOSCALE_ENABLE = "false";
    process.env.QI_AUTOSCALE_ENABLE = "false";

    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const snapshot = await calculateEnergyPipeline(initializePipelineState());

    expect((snapshot as any).tsMetricDerived).toBe(true);
    expect((snapshot as any).tsMetricDerivedSource).toBe("warp.metricAdapter+clocking");
    expect((snapshot as any).clocking?.metricDerived).toBe(true);
    expect((snapshot as any).ts?.metricDerived).toBe(true);
    expect((snapshot as any).natario?.metricMode).toBe(true);
    expect((snapshot as any).natario?.metricT00Source).toBe("metric");
    expect(String((snapshot as any).natario?.metricT00Ref ?? "")).toContain(
      "warp.metric.T00.natario",
    );
    expect((snapshot as any).natario?.metricT00Derivation).toBe(
      "forward_shift_to_K_to_rho_E",
    );
    expect((snapshot as any).natarioLegacy).toBeUndefined();
  });

  it("wires canonical metric T00 refs for non-alcubierre warp families", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    process.env.TS_AUTOSCALE_ENABLE = "false";
    process.env.QI_AUTOSCALE_ENABLE = "false";

    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const cases = [
      { fieldType: "natario", ref: "warp.metric.T00.natario.shift" },
      { fieldType: "natario_sdf", ref: "warp.metric.T00.natario_sdf.shift" },
      { fieldType: "irrotational", ref: "warp.metric.T00.irrotational.shift" },
    ] as const;

    for (const testCase of cases) {
      const state = initializePipelineState();
      state.warpFieldType = testCase.fieldType as any;
      state.dynamicConfig = {
        ...(state.dynamicConfig ?? {}),
        warpFieldType: testCase.fieldType,
      } as any;

      const snapshot = await calculateEnergyPipeline(state);
      expect((snapshot as any).warp?.metricT00Source).toBe("metric");
      expect((snapshot as any).warp?.metricT00Ref).toBe(testCase.ref);
      expect((snapshot as any).natario?.metricMode).toBe(true);
      expect((snapshot as any).natario?.metricT00Source).toBe("metric");
      expect((snapshot as any).natario?.metricT00Ref).toBe(testCase.ref);
    }
  });

  it("surfaces Casimir material receipt status in the solve state", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    process.env.TS_AUTOSCALE_ENABLE = "false";
    process.env.QI_AUTOSCALE_ENABLE = "false";

    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const snapshot = await calculateEnergyPipeline(initializePipelineState());

    expect((snapshot as any).casimirMaterialReceipt?.contractVersion).toBe(
      "casimir_material_receipt/v1",
    );
    expect((snapshot as any).casimirMaterialReceipt?.status).toBe(
      "ideal_scalar_only",
    );
    expect((snapshot as any).natario?.casimirMaterialReceipt?.status).toBe(
      "ideal_scalar_only",
    );
    const wallSourceClosure =
      (snapshot as any).nhm2WallSourceClosure ??
      (snapshot as any).natario?.nhm2WallSourceClosure;
    if (wallSourceClosure) {
      expect(wallSourceClosure.available?.sourceKind).not.toBe(
        "material_receipted",
      );
    }
  });

  it("marks TS as non-metric when hardware timing telemetry drives clocking", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    process.env.TS_AUTOSCALE_ENABLE = "false";
    process.env.QI_AUTOSCALE_ENABLE = "false";

    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const state = initializePipelineState();
    state.hardwareTruth = {
      ...(state.hardwareTruth ?? {}),
      sectorState: {
        sectorsTotal: Number(state.sectorCount ?? 400),
        sectorsLive: Number(state.concurrentSectors ?? 1),
        dwell_ms: 1,
        burst_ms: 0.02,
        tauLC_ms: 0.003,
      } as any,
    };
    const snapshot = await calculateEnergyPipeline(state);

    expect((snapshot as any).clockingProvenance).toBe("hardware");
    expect((snapshot as any).tsMetricDerived).toBe(false);
    expect((snapshot as any).tsMetricDerivedSource).toBe("hardware_timing");
    expect((snapshot as any).clocking?.metricDerived).toBe(false);
    expect((snapshot as any).ts?.metricDerived).toBe(false);
  });

  it("promotes VdB region-II metric adapter fallback when warp module adapter is missing", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    process.env.TS_AUTOSCALE_ENABLE = "false";
    process.env.QI_AUTOSCALE_ENABLE = "false";

    const { calculateEnergyPipeline, initializePipelineState, computeTauLcMsFromHull } =
      await loadPipeline();
    const warpModule = await import("../modules/warp/warp-module");
    const warpSpy = vi
      .spyOn(warpModule.warpBubbleModule, "calculate")
      .mockResolvedValue({} as any);

    try {
      const snapshot = await calculateEnergyPipeline(initializePipelineState());
      expect((snapshot as any).vdbRegionII?.support).toBe(true);
      expect((snapshot as any).warp?.metricT00Ref).toBe("warp.metric.T00.vdb.regionII");
      expect((snapshot as any).warp?.metricAdapter?.family).toBe("vdb");
      expect((snapshot as any).warp?.metricAdapter?.chart?.label).toBe("comoving_cartesian");
      expect((snapshot as any).warp?.metricAdapter?.gammaDiag?.[0]).toBeGreaterThan(1);
      expect((snapshot as any).warp?.metricAdapter?.betaDiagnostics?.method).toBe(
        "finite-diff+conformal",
      );
      expect(
        Number((snapshot as any).warp?.metricAdapter?.betaDiagnostics?.thetaConformalMax),
      ).toBeGreaterThan(0);
      expect((snapshot as any).warp?.metricT00Contract?.status).toBe("ok");
      expect((snapshot as any).theta_metric_derived).toBe(true);
      expect((snapshot as any).theta_metric_reason).toBe("metric_adapter_theta_projection");
      expect(Number.isFinite((snapshot as any).theta_geom)).toBe(true);
      const hullTauLcMs = computeTauLcMsFromHull((snapshot as any).hull);
      if (
        Number.isFinite(hullTauLcMs as number) &&
        Number.isFinite((snapshot as any)?.lightCrossing?.tauLC_ms)
      ) {
        expect((snapshot as any).lightCrossing.tauLC_ms).toBeGreaterThan(hullTauLcMs as number);
      }
      expect((snapshot as any).tsMetricDerived).toBe(true);
      expect((snapshot as any).tsMetricDerivedSource).toBe("warp.metricAdapter+clocking");
      expect((snapshot as any).clocking?.metricDerived).toBe(true);
      expect((snapshot as any).clocking?.metricDerivedSource).toBe("warp.metricAdapter+clocking");
      expect(String((snapshot as any).clocking?.detail ?? "")).toContain(
        "tau_LC from metric adapter gammaDiag",
      );
      expect((snapshot as any).ts?.metricDerived).toBe(true);
      expect((snapshot as any).ts?.metricDerivedSource).toBe("warp.metricAdapter+clocking");
      expect((snapshot as any).qiGuardrail?.metricDerived).toBe(true);
      expect(String((snapshot as any).qiGuardrail?.metricDerivedSource ?? "")).toContain(
        "warp.metricAdapter+clocking",
      );
      expect(String((snapshot as any).qiGuardrail?.metricDerivedSource ?? "")).toContain(
        "warp.metric.T00.vdb.regionII",
      );
    } finally {
      warpSpy.mockRestore();
    }
  });


  it("emits QI applicability and repayment heuristic labels", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const snapshot = await calculateEnergyPipeline(initializePipelineState());
    const app = String((snapshot as any).qiGuardrail?.applicabilityStatus ?? "UNKNOWN");
    expect(["PASS", "NOT_APPLICABLE", "UNKNOWN"]).toContain(app);
    expect((snapshot as any).qiGuardrail?.strictMode).toBe(true);
    expect(typeof (snapshot as any).qiGuardrail?.metricContractOk).toBe("boolean");
    expect((snapshot as any).qi?.repayment_label).toBe("repayment_heuristic");
  });

  it("emits NHM2 strict-signal readiness into the pipeline and natario payloads", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const state = initializePipelineState();
    state.warpFieldType = "nhm2_shift_lapse" as any;
    state.dynamicConfig = {
      ...(state.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
    } as any;

    const snapshot = await calculateEnergyPipeline(state);
    const artifact = (snapshot as any).nhm2StrictSignalReadiness;

    expect(artifact).toBeTruthy();
    expect((snapshot as any).natario?.nhm2StrictSignalReadiness).toEqual(artifact);
    expect(artifact.family.familyId).toBe("nhm2_shift_lapse");
    expect(artifact.family.lapseSummary?.shiftLapseProfileId).toBeTruthy();
    expect(artifact.signals.theta.metricDerived).toBe(
      (snapshot as any).theta_metric_derived === true,
    );
    expect(artifact.signals.ts.metricDerived).toBe(
      (snapshot as any).tsMetricDerived === true,
    );
    expect(artifact.signals.qi.metricDerived).toBe(
      (snapshot as any).qiGuardrail?.metricDerived === true,
    );
    expect(artifact.signals.qi.applicabilityStatus).toBe(
      (snapshot as any).qiGuardrail?.applicabilityStatus ?? null,
    );
    const qeiDossier = (snapshot as any).nhm2QeiWorldlineDossier;
    expect(qeiDossier).toBeTruthy();
    expect((snapshot as any).natario?.nhm2QeiWorldlineDossier).toEqual(qeiDossier);
    expect(qeiDossier.contractVersion).toBe("nhm2_qei_worldline_dossier/v1");
    expect(qeiDossier.summary.hasWallWorldline).toBe(true);
    expect(typeof qeiDossier.summary.dossierComplete).toBe("boolean");
    const wallWorldline = qeiDossier.worldlines.find(
      (worldline: any) => worldline.regionId === "wall",
    );
    expect(wallWorldline).toBeTruthy();
    expect(wallWorldline.sampledRho.status).toMatch(/computed|proxy|missing/);
    expect(wallWorldline.bound.status).toMatch(/computed|literature_bound|proxy|missing/);
    expect(wallWorldline.sampledRho.valueSI).toBe(
      (snapshot as any).qiGuardrail?.lhs_Jm3 ?? null,
    );
    expect(wallWorldline.claimBoundary).toBeUndefined();
    const natarioAudit = (snapshot as any).nhm2NatarioInvariantAudit;
    expect(natarioAudit).toBeTruthy();
    expect((snapshot as any).natario?.nhm2NatarioInvariantAudit).toEqual(natarioAudit);
    expect(natarioAudit.contractVersion).toBe("nhm2_natario_invariant_audit/v1");
    expect(natarioAudit.claimBoundary.zeroExpansionIsNotSafetyCertificate).toBe(true);
    expect(["computed", "partial", "missing"]).toContain(natarioAudit.invariants.status);
  });

  it("labels NHM2 hardware-timed strict signals as proxy instead of metric-derived", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const state = initializePipelineState();
    state.warpFieldType = "nhm2_shift_lapse" as any;
    state.dynamicConfig = {
      ...(state.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
    } as any;
    state.hardwareTruth = {
      ...(state.hardwareTruth ?? {}),
      sectorState: {
        sectorsTotal: Number(state.sectorCount ?? 400),
        sectorsLive: Number(state.concurrentSectors ?? 1),
        dwell_ms: 1,
        burst_ms: 0.02,
        tauLC_ms: 0.003,
      } as any,
    };

    const snapshot = await calculateEnergyPipeline(state);
    const artifact = (snapshot as any).nhm2StrictSignalReadiness;

    expect(artifact.status).toBe("fail");
    expect(artifact.signals.ts.metricDerived).toBe(false);
    expect(artifact.signals.ts.provenance).toBe("proxy");
    expect(artifact.signals.ts.sourcePath).toBe("hardware_timing");
    expect(artifact.signals.ts.reasonCode).toBe("hardware_timing");
    expect(artifact.signals.qi.provenance).toBe("proxy");
  });

  it("emits NHM2 observer audit for both metric-required and tile-effective tensors with explicit limits", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const state = initializePipelineState();
    state.warpFieldType = "nhm2_shift_lapse" as any;
    state.dynamicConfig = {
      ...(state.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
    } as any;

    const snapshot = await calculateEnergyPipeline(state);
    const artifact = (snapshot as any).nhm2ObserverAudit;
    const sourceClosure = (snapshot as any).nhm2SourceClosure;

    expect(artifact).toBeTruthy();
    expect((snapshot as any).natario?.nhm2ObserverAudit).toEqual(artifact);
    expect(artifact.familyId).toBe("nhm2_shift_lapse");
    expect(artifact.tensors.metricRequired.tensorRef).toContain("warp.metric");
    expect(artifact.tensors.metricRequired.fluxDiagnostics.status).toBe(
      "available",
    );
    expect(artifact.tensors.metricRequired.model.pressureModel).toBe(
      "diagonal_tensor_components",
    );
    expect(artifact.tensors.metricRequired.model.limitationNotes.length).toBeGreaterThan(0);
    expect(artifact.tensors.tileEffective.tensorRef).toBe(
      "warp.tileEffectiveStressEnergy",
    );
    expect(["available", "unavailable"]).toContain(
      artifact.tensors.tileEffective.fluxDiagnostics.status,
    );
    expect([
      "isotropic_pressure_proxy",
      "diagonal_tensor_components",
      "same_chart_metric_tensor_projection",
    ]).toContain(artifact.tensors.tileEffective.model.pressureModel);
    expect(typeof artifact.tensors.tileEffective.typeI.fraction).toBe("number");
    const wallRegion = sourceClosure?.regionComparisons?.regions?.find(
      (region: any) => region.regionId === "wall",
    );
    const globalRegion = sourceClosure?.regionComparisons?.regions?.find(
      (region: any) => region.regionId === "global",
    );
    expect(
      sourceClosure?.regionComparisons?.regions?.map((region: any) => region.regionId),
    ).toEqual(["global", "hull", "wall", "exterior_shell"]);
    expect(globalRegion?.sampleCount).toBeGreaterThan(0);
    expect(globalRegion?.metricAccounting?.aggregationMode).toBe("mean");
    expect(globalRegion?.metricAccounting?.normalizationBasis).toBe("sample_count");
    expect(
      globalRegion?.metricRequiredSameChartFullTensor?.completeness?.fullTensorComplete,
    ).toBe(true);
    expect(globalRegion?.metricT00Diagnostics?.trace?.regionMaskRef).toContain(
      "global",
    );
    expect(wallRegion?.metricRequiredSameChartFullTensor?.contractVersion).toBe(
      "nhm2_same_chart_full_tensor/v1",
    );
    expect(
      wallRegion?.metricRequiredSameChartFullTensor?.completeness?.fullTensorComplete,
    ).toBe(true);
    const wallComponent = (componentId: string) =>
      wallRegion?.metricRequiredSameChartFullTensor?.components?.find(
        (component: any) => component.componentId === componentId,
      );
    for (const componentId of [
      "T00",
      "T0x",
      "T0y",
      "T0z",
      "Txx",
      "Txy",
      "Txz",
      "Tyy",
      "Tyz",
      "Tzz",
    ]) {
      expect(wallComponent(componentId)?.status).toBe("derived_same_chart");
      expect(Number.isFinite(wallComponent(componentId)?.valueSI)).toBe(true);
    }
    expect(wallRegion?.metricAccounting?.aggregationMode).toBe("mean");
    expect(wallRegion?.metricAccounting?.normalizationBasis).toBe("sample_count");
    expect(wallRegion?.metricT00Diagnostics?.trace?.regionMaskRef).toContain(
      "wall",
    );
  });

  it("applies the selected NHM2 shift-lapse profile on the metric T00 lane and keeps tile observer lanes profile-consistent", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();

    const baselineState = initializePipelineState();
    baselineState.warpFieldType = "nhm2_shift_lapse" as any;
    baselineState.shiftLapseProfileId = "stage1_centerline_alpha_0p9900_v1" as any;
    baselineState.dynamicConfig = {
      ...(baselineState.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
      shiftLapseProfileId: "stage1_centerline_alpha_0p9900_v1",
    } as any;

    const tunedState = initializePipelineState();
    tunedState.warpFieldType = "nhm2_shift_lapse" as any;
    tunedState.shiftLapseProfileId = "stage1_centerline_alpha_0p995_v1" as any;
    tunedState.dynamicConfig = {
      ...(tunedState.dynamicConfig ?? {}),
      warpFieldType: "nhm2_shift_lapse",
      shiftLapseProfileId: "stage1_centerline_alpha_0p995_v1",
    } as any;

    const baselineSnapshot = await calculateEnergyPipeline(baselineState);
    const tunedSnapshot = await calculateEnergyPipeline(tunedState);
    const baselineObserver = (baselineSnapshot as any).nhm2ObserverAudit;
    const tunedObserver = (tunedSnapshot as any).nhm2ObserverAudit;

    expect((baselineSnapshot as any).warp?.metricT00Ref).toBe(
      "warp.metric.T00.nhm2.shift_lapse",
    );
    expect((tunedSnapshot as any).warp?.metricT00Ref).toBe(
      "warp.metric.T00.nhm2.shift_lapse",
    );
    expect((tunedSnapshot as any).warp?.metricT00).toBeCloseTo(
      (baselineSnapshot as any).warp?.metricT00,
      12,
    );
    expect(
      tunedObserver.tensors.metricRequired.conditions.wec.robustMin,
    ).toBeCloseTo(
      baselineObserver.tensors.metricRequired.conditions.wec.robustMin,
      12,
    );
    expect(
      tunedObserver.tensors.metricRequired.conditions.dec.robustMin,
    ).toBeCloseTo(
      baselineObserver.tensors.metricRequired.conditions.dec.robustMin,
      12,
    );
    expect(
      tunedObserver.tensors.tileEffective.conditions.wec.robustMin,
    ).toBeCloseTo(
      baselineObserver.tensors.tileEffective.conditions.wec.robustMin,
      12,
    );
    expect(
      tunedObserver.tensors.tileEffective.conditions.dec.robustMin,
    ).toBeCloseTo(
      baselineObserver.tensors.tileEffective.conditions.dec.robustMin,
      12,
    );
    const expectedTileScale = 1;
    const authorityMode = String(
      tunedObserver.tileObserverConditionAuthorityMode ?? "unknown",
    );
    if (authorityMode === "commensurate_reconstituted_authoritative") {
      expect(baselineObserver.tileObserverConditionAuthorityMode).toBe(
        "commensurate_reconstituted_authoritative",
      );
      expect(baselineObserver.tileObserverLegacyProxyDiagnostics).toBeTruthy();
      expect(tunedObserver.tileObserverLegacyProxyDiagnostics).toBeTruthy();
      expect(
        tunedObserver.tileObserverLegacyProxyDiagnostics.wecRobustMin,
      ).toBeCloseTo(
        baselineObserver.tileObserverLegacyProxyDiagnostics.wecRobustMin,
        12,
      );
      expect(
        tunedObserver.tileObserverLegacyProxyDiagnostics.decRobustMin,
      ).toBeCloseTo(
        baselineObserver.tileObserverLegacyProxyDiagnostics.decRobustMin,
        12,
      );
      expect(
        tunedObserver.tensors.tileEffective.conditions.wec.robustMin,
      ).toBeCloseTo(
        tunedObserver.tensors.metricRequired.conditions.wec.robustMin,
        12,
      );
      expect(
        tunedObserver.tensors.tileEffective.conditions.dec.robustMin,
      ).toBeCloseTo(
        tunedObserver.tensors.metricRequired.conditions.dec.robustMin,
        12,
      );
    } else {
      expect(
        tunedObserver.tensors.tileEffective.conditions.wec.robustMin /
          baselineObserver.tensors.tileEffective.conditions.wec.robustMin,
      ).toBeCloseTo(expectedTileScale, 6);
      expect(
        tunedObserver.tensors.tileEffective.conditions.dec.robustMin /
          baselineObserver.tensors.tileEffective.conditions.dec.robustMin,
      ).toBeCloseTo(expectedTileScale, 6);
    }
  });

  it("preserves configured QI tau/sampler for guard evaluation after telemetry refresh", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const { initializePipelineState, updateParameters, evaluateQiGuardrail } = await loadPipeline();
    const state = initializePipelineState();
    state.qi = {
      ...(state.qi ?? {}),
      sampler: "hann",
      fieldType: "em",
      tau_s_ms: 0.02,
    } as any;

    const next = await updateParameters(state, {});
    expect(Number((next as any).qi?.tau_s_ms)).toBeCloseTo(0.02, 12);
    expect(String((next as any).qi?.sampler)).toBe("hann");
    expect(Number((next as any).qi?.tau_monitor_s_ms)).toBeGreaterThanOrEqual(0.5);

    const guard = evaluateQiGuardrail(next as any);
    expect(guard.tauConfigured_s).toBeCloseTo(0.00002, 12);
    expect(guard.sampler).toBe("hann");
  });
});




  it("emits explicit Natário contract metadata fields in strict mode", async () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const { calculateEnergyPipeline, initializePipelineState } = await loadPipeline();
    const snapshot = await calculateEnergyPipeline(initializePipelineState());
    expect((snapshot as any).warp?.metricT00Observer).toBeTruthy();
    expect((snapshot as any).warp?.metricT00Normalization).toBeTruthy();
    expect((snapshot as any).warp?.metricT00UnitSystem).toBe("SI");
    expect((snapshot as any).warp?.metricAdapter?.chart?.label).toBeTruthy();
    expect((snapshot as any).warp?.metricAdapter?.chart?.contractStatus).toBeTruthy();
  });
describe("sector-control adapter hooks", () => {
  it("tracks monotonic QI behavior vs tau", async () => {
    const { fordRomanBound, isQiBoundMonotoneByTau } = await import("../server/qi/qi-bounds");
    const bounds = [2, 4, 8].map((tau) => fordRomanBound({ tau_s_ms: tau, sampler: "lorentzian" }));
    const magnitudes = bounds.map((bound) => Math.abs(bound));
    expect(isQiBoundMonotoneByTau(magnitudes)).toBe(true);
  });

  it("maps scheduler roles and fail-closes planner on hard QI constraints", async () => {
    const { computeSectorPhaseOffsets, buildSectorRoleAssignment } = await import("../server/energy/phase-scheduler");
    const { buildSectorControlPlan } = await import("../server/control/sectorControlPlanner");

    const schedule = computeSectorPhaseOffsets({
      N: 8,
      sectorPeriod_ms: 8,
      phase01: 0.25,
      tau_s_ms: 2,
      sampler: "gaussian",
      negativeFraction: 0.25,
    });
    const roles = buildSectorRoleAssignment(schedule);
    expect(Array.from(roles.neg).length).toBeGreaterThan(0);
    expect(Array.from(roles.pos).length).toBeGreaterThan(0);

    const plan = buildSectorControlPlan({
      mode: "diagnostic",
      timing: { strobeHz: 125, sectorPeriod_ms: 8, TS_ratio: 1.4, tauLC_ms: 8, tauPulse_ms: 6 },
      constraints: { FordRomanQI: "fail" },
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.firstFail).toBe("FordRomanQI");
    }
  });
});
