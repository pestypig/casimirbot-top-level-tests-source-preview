import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { persistConsoleTelemetrySnapshot, CONSOLE_TELEMETRY_SNAPSHOT_PATH } from "../server/services/console-telemetry/persist";
import { getConsoleTelemetry, saveConsoleTelemetry } from "../server/services/console-telemetry/store";
import { summarizeConsoleTelemetry } from "../server/services/console-telemetry/summarize";

describe("console telemetry provenance contract", () => {
  it("adds conservative provenance defaults for stored and summarized telemetry", () => {
    const desktopId = "toe023.default";
    saveConsoleTelemetry({
      desktopId,
      capturedAt: "2026-02-18T00:00:00.000Z",
      panels: [
        {
          panelId: "overview",
          instanceId: "overview.main",
          title: "Overview",
          lastUpdated: "2026-02-18T00:00:00.000Z",
        },
      ],
    });

    const stored = getConsoleTelemetry(desktopId) as Record<string, unknown>;
    expect(stored.provenance_class).toBe("synthesized");
    expect(stored.claim_tier).toBe("diagnostic");
    expect(stored.certifying).toBe(false);
    expect(stored.source_class).toBe("derived");

    const storedPanel = (stored.panels as Array<Record<string, unknown>>)[0];
    expect(storedPanel.provenance_class).toBe("synthesized");
    expect(storedPanel.claim_tier).toBe("diagnostic");
    expect(storedPanel.certifying).toBe(false);
    expect(storedPanel.source_class).toBe("derived");

    const summary = JSON.parse(String(summarizeConsoleTelemetry(stored as any)));
    expect(summary.desktopId).toBe(desktopId);
    expect(summary.provenance_class).toBe("synthesized");
    expect(summary.claim_tier).toBe("diagnostic");
    expect(summary.certifying).toBe(false);
    expect(summary.source_class).toBe("derived");
    expect(summary.panels[0]).toMatchObject({
      id: "overview",
      provenance_class: "synthesized",
      claim_tier: "diagnostic",
      certifying: false,
      source_class: "derived",
    });
  });

  it("keeps explicit sensor attribution while capping panel claims at diagnostic", async () => {
    const desktopId = "toe023.measured";
    saveConsoleTelemetry({
      desktopId,
      capturedAt: "2026-02-18T00:10:00.000Z",
      panels: [
        {
          panelId: "hardware",
          instanceId: "hardware.main",
          title: "Hardware",
          lastUpdated: "2026-02-18T00:10:00.000Z",
          sourceIds: ["sensor:hw-1"],
          claim_tier: "certified",
          provenance_class: "measured",
          certifying: true,
          source_class: "sensor",
          metrics: { occupancy: 0.9 },
        } as any,
      ],
      claim_tier: "certified",
      provenance_class: "measured",
      certifying: true,
      source_class: "sensor",
    } as any);

    const stored = getConsoleTelemetry(desktopId) as Record<string, unknown>;
    expect(stored.desktopId).toBe(desktopId);
    expect(stored.capturedAt).toBe("2026-02-18T00:10:00.000Z");
    expect(Array.isArray(stored.panels)).toBe(true);
    expect(stored.provenance_class).toBe("measured");
    expect(stored.claim_tier).toBe("diagnostic");
    expect(stored.certifying).toBe(false);
    expect(stored.source_class).toBe("sensor");

    const beforeSnapshot = readFileSync(CONSOLE_TELEMETRY_SNAPSHOT_PATH, "utf8");
    try {
      await persistConsoleTelemetrySnapshot(stored as any);
      const persisted = JSON.parse(readFileSync(CONSOLE_TELEMETRY_SNAPSHOT_PATH, "utf8"));
      expect(persisted.desktopId).toBe(desktopId);
      expect(persisted.panels[0].panelId).toBe("hardware");
      expect(persisted.provenance_class).toBe("measured");
      expect(persisted.claim_tier).toBe("diagnostic");
      expect(persisted.certifying).toBe(false);
      expect(persisted.source_class).toBe("sensor");
    } finally {
      await persistConsoleTelemetrySnapshot(JSON.parse(beforeSnapshot));
    }
  });
});
