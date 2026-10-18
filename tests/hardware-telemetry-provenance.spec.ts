import { describe, expect, it } from "vitest";
import { saveConsoleTelemetry } from "../server/services/console-telemetry/store";
import { collectPanelSnapshots } from "../server/services/telemetry/panels";
import { collectBadgeTelemetry } from "../server/services/telemetry/badges";

describe("hardware telemetry provenance gate", () => {
  it("surfaces provenance_class + claim_tier and marks fallback telemetry as diagnostic/non-certifying", () => {
    const desktopId = "toe018.fallback";
    saveConsoleTelemetry({
      desktopId,
      capturedAt: "2026-01-01T00:00:00.000Z",
      panels: [
        {
          panelId: "hardware-bus",
          instanceId: "hardware-bus.main",
          title: "Hardware Bus",
          lastUpdated: "2026-01-01T00:00:00.000Z",
          metrics: { occupancy: 0.42, coherence: 0.7, avgQFactor: 0.72 },
        },
      ],
    });

    const panelSnapshot = collectPanelSnapshots({ desktopId });
    const fallbackPanel = panelSnapshot.panels.find((panel) => panel.panelId === "hardware-bus");
    expect(fallbackPanel?.provenance_class).toBe("synthesized");
    expect(fallbackPanel?.claim_tier).toBe("diagnostic");
    expect(fallbackPanel?.certifying).toBe(false);

    const badgeSnapshot = collectBadgeTelemetry({ desktopId }).snapshot;
    const fallbackBadge = badgeSnapshot.entries.find((entry) => entry.panelId === "hardware-bus");
    expect(fallbackBadge?.provenance_class).toBe("synthesized");
    expect(fallbackBadge?.claim_tier).toBe("diagnostic");
    expect(fallbackBadge?.certifying).toBe(false);
  });

  it("returns deterministic strict-mode fail reason/tag when provenance is absent", () => {
    const desktopId = "toe018.strict-missing";
    saveConsoleTelemetry({
      desktopId,
      capturedAt: "2026-01-01T00:00:00.000Z",
      panels: [
        {
          panelId: "hardware-rail",
          instanceId: "hardware-rail.main",
          title: "Hardware Rail",
          lastUpdated: "2026-01-01T00:00:00.000Z",
          metrics: { occupancy: 0.33 },
        },
      ],
    });

    const panelSnapshot = collectPanelSnapshots({ desktopId, strictProvenance: true });
    expect(panelSnapshot.fail_tag).toBe("telemetry_provenance_missing");
    expect(panelSnapshot.fail_reason).toBe("strict provenance mode requires sourceIds for telemetry panels");

    const badgeSnapshot = collectBadgeTelemetry({ desktopId, strictProvenance: true }).snapshot;
    expect(badgeSnapshot.fail_tag).toBe("telemetry_provenance_missing");
    expect(badgeSnapshot.fail_reason).toBe("strict provenance mode requires sourceIds for telemetry badges");
  });

  it("keeps source attribution without inferring measurement or certification", () => {
    const desktopId = "toe018.measured";
    saveConsoleTelemetry({
      desktopId,
      capturedAt: "2026-01-01T00:00:00.000Z",
      panels: [
        {
          panelId: "hardware-node",
          instanceId: "hardware-node.main",
          title: "Hardware Node",
          lastUpdated: "2026-01-01T00:00:00.000Z",
          metrics: { occupancy: 0.25, coherence: 0.78, avgQFactor: 0.81 },
          sourceIds: ["sensor:hw-node-1"],
        },
      ],
    });

    const panelSnapshot = collectPanelSnapshots({ desktopId, panelIds: ["hardware-node"] });
    expect(panelSnapshot.panels[0]?.provenance_class).toBe("synthesized");
    expect(panelSnapshot.panels[0]?.claim_tier).toBe("diagnostic");
    expect(panelSnapshot.panels[0]?.certifying).toBe(false);

    const badgeSnapshot = collectBadgeTelemetry({ desktopId, panelIds: ["hardware-node"] }).snapshot;
    expect(badgeSnapshot.entries[0]?.provenance_class).toBe("synthesized");
    expect(badgeSnapshot.entries[0]?.claim_tier).toBe("diagnostic");
    expect(badgeSnapshot.entries[0]?.certifying).toBe(false);
  });
});
