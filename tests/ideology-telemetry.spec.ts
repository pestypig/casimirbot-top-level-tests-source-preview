import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  buildIdeologyPanelTelemetry,
  IDEOLOGY_TELEMETRY_SCHEMA_PATH,
} from "../shared/ideology-telemetry";
import { saveConsoleTelemetry } from "../server/services/console-telemetry/store";
import { collectPanelSnapshots } from "../server/services/telemetry/panels";
import { MORAL_SOCIETY_STRICT_FAIL_REASON, searchIdeologyArtifacts } from "../server/services/ideology/artifacts";
import { resolveIdeologyGuidance } from "../server/services/ideology/guidance";

describe("ideology telemetry", () => {
  it("schema has core metrics and flags", () => {
    const schema = JSON.parse(readFileSync(IDEOLOGY_TELEMETRY_SCHEMA_PATH, "utf-8"));
    expect(schema.metrics).toBeTruthy();
    expect(schema.flags).toBeTruthy();
    expect(schema.metrics.noise_laplacian_rms).toBeTruthy();
    expect(schema.flags.artifacts_complete).toBeTruthy();
  });

  it("builds a panel telemetry payload", () => {
    const panel = buildIdeologyPanelTelemetry({
      nodeId: "citizens-arc",
      surface: "ui",
      metrics: { noise_laplacian_rms: 0.25, determinism_rate: 0.92 },
      flags: { artifacts_complete: true },
      notes: "sample",
    });

    expect(panel.panelId).toBe("ideology");
    expect(panel.kind).toBe("ideology");
    expect(panel.metrics?.noise_laplacian_rms).toBe(0.25);
    expect(panel.flags?.artifacts_complete).toBe(true);
    expect(panel.sourceIds).toContain("citizens-arc");
  });

  it("preserves additive provenance fields in panel snapshots", () => {
    const desktopId = "toe018.ideology";
    const panel = buildIdeologyPanelTelemetry({
      nodeId: "citizens-arc",
      panelId: "ideology",
      metrics: { determinism_rate: 0.92 },
    });
    saveConsoleTelemetry({ desktopId, capturedAt: panel.lastUpdated, panels: [panel] });

    const snapshot = collectPanelSnapshots({ desktopId, panelIds: ["ideology"], strictProvenance: true });
    expect(snapshot.fail_tag).toBeUndefined();
    expect(snapshot.panels[0]?.provenance_class).toBe("synthesized");
    expect(snapshot.panels[0]?.claim_tier).toBe("diagnostic");
    expect(snapshot.panels[0]?.certifying).toBe(false);
  });
  it("keeps artifact search backward compatible while allowing strict provenance gate", () => {
    const base = searchIdeologyArtifacts({ limit: 1 });
    expect(base.fail_reason).toBeUndefined();
    expect(base.items[0]?.provenance_class).toBe("inferred");

    const strict = searchIdeologyArtifacts({ limit: 1, strictProvenance: true });
    expect(strict.fail_reason).toBe(MORAL_SOCIETY_STRICT_FAIL_REASON);
  });

  it("resolves pressure bundles into deterministic ideology guidance", () => {
    const result = resolveIdeologyGuidance({
      activePressures: ["flattery_grooming", "financial_ask", "urgency_scarcity"],
      observedSignals: ["rush", "private-chat"],
      topK: 3,
    });

    expect(result.invariant).toBe("system advises, user decides.");
    expect(result.detectedBundles).toContain("flattery-financial-urgency");
    expect(result.recommendedNodeIds.length).toBeLessThanOrEqual(3);
    expect(result.recommendedNodeIds).toContain("financial-fog-warning");
    expect(result.suggestedVerificationSteps.length).toBeGreaterThan(0);
  });

});
