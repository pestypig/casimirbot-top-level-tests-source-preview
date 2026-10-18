import { describe, expect, it } from "vitest";
import {
  calculateEnergyPipeline,
  initializePipelineState,
  updateParameters,
} from "../server/energy-pipeline";

describe("energy pipeline Ford-Roman duty binding", () => {
  it("maps the root adapter alias to canonical design duty and every output alias", async () => {
    const next = await updateParameters(initializePipelineState(), {
      dutyEffectiveFR: 0.0025,
    });

    expect(next.dynamicConfig?.sectorDuty).toBe(0.0025);
    expect(next.dutyEffective_FR).toBe(0.0025);
    expect(next.dutyEffectiveFR).toBe(0.0025);
    expect(next.dutyShip).toBe(0.0025);
    expect(next.dutyEff).toBe(0.0025);
    expect(next.sectorDutySource).toBe("design");
    expect((next as any).dutyEffectiveFRSource).toBe("design");
    expect(next.grRequest?.dutyEffectiveFR).toBe(0.0025);
  });

  it("keeps measured sector duty authoritative over the mapped design value", async () => {
    const next = await updateParameters(initializePipelineState(), {
      dutyEffectiveFR: 0.0025,
      dynamicConfig: {
        measuredSectorDuty: 0.001,
      },
    });

    expect(next.dynamicConfig?.sectorDuty).toBe(0.0025);
    expect(next.dynamicConfig?.measuredSectorDuty).toBe(0.001);
    expect(next.dutyEffectiveFR).toBe(0.001);
    expect(next.dutyEffective_FR).toBe(0.001);
    expect(next.dutyShip).toBe(0.001);
    expect(next.dutyEff).toBe(0.001);
    expect(next.sectorDutySource).toBe("measured");
    expect(next.grRequest?.dutyEffectiveFR).toBe(0.001);
  });

  it("accepts identical duplicate design inputs and rejects conflicting ones", async () => {
    const identical = await updateParameters(initializePipelineState(), {
      dutyEffectiveFR: 0.0025,
      dynamicConfig: { sectorDuty: 0.0025 },
    });
    expect(identical.dynamicConfig?.sectorDuty).toBe(0.0025);

    const state = initializePipelineState();
    await expect(
      updateParameters(state, {
        dutyEffectiveFR: 0.0025,
        dynamicConfig: { sectorDuty: 0.003 },
      }),
    ).rejects.toThrow(
      "dutyEffectiveFR conflicts with dynamicConfig.sectorDuty",
    );
    expect(state.dynamicConfig).toBeNull();
  });

  it.each([
    ["nonnumeric", "0.0025"],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["below minimum", 0.0000009],
    ["above one", 1.000001],
  ])("rejects %s root duty before mutating state", async (_label, value) => {
    const state = initializePipelineState();
    await expect(
      updateParameters(state, { dutyEffectiveFR: value } as any),
    ).rejects.toThrow(
      "dutyEffectiveFR must be a finite number in [0.000001, 1]",
    );
    expect(state.dynamicConfig).toBeNull();
  });

  it.each([
    ["design", "sectorDuty", 0],
    ["design above one", "sectorDuty", 1.01],
    ["measured", "measuredSectorDuty", 0],
    ["measured above one", "measuredSectorDuty", 1.01],
  ])(
    "rejects invalid nested-only %s duty without misleading provenance",
    async (_label, field, value) => {
      const state = initializePipelineState();
      await expect(
        updateParameters(state, {
          dynamicConfig: { [field]: value },
        } as any),
      ).rejects.toThrow(
        `dynamicConfig.${field} must be a finite number in [0.000001, 1]`,
      );
      expect(state.dynamicConfig).toBeNull();
      expect(state.sectorDutySource).not.toBe("measured");
    },
  );

  it("rejects invalid or conflicting root measured-duty aliases", async () => {
    const invalidState = initializePipelineState();
    await expect(
      updateParameters(invalidState, { measuredSectorDuty: 0 } as any),
    ).rejects.toThrow(
      "measuredSectorDuty must be a finite number in [0.000001, 1]",
    );
    expect(invalidState.dynamicConfig).toBeNull();

    const conflictingState = initializePipelineState();
    await expect(
      updateParameters(conflictingState, {
        measuredSectorDuty: 0.001,
        dynamicConfig: { measuredSectorDuty: 0.002 },
      } as any),
    ).rejects.toThrow(
      "measuredSectorDuty conflicts with dynamicConfig.measuredSectorDuty",
    );
    expect(conflictingState.dynamicConfig).toBeNull();
  });

  it("initializes and schedules the promoted two-sector hover duty", async () => {
    const initial = initializePipelineState();
    expect(initial.activeSectors).toBe(initial.concurrentSectors);
    expect(initial.activeSectors).toBe(2);

    const next = await calculateEnergyPipeline(initial);
    expect(next.concurrentSectors).toBe(2);
    expect(next.activeSectors).toBe(2);
    expect(next.dutyEffectiveFR).toBeCloseTo(0.003, 12);
    expect(next.sectorDutySource).toBe("schedule");
    expect(next.grRequest?.dutyEffectiveFR).toBeCloseTo(0.003, 12);
  });
});
