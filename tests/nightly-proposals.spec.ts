import { beforeEach, describe, expect, it } from "vitest";
import { resetDbClient, ensureDatabase, getPool } from "../server/db/client";
import { recordActivityEvents } from "../server/services/essence/activity-log";
import { runNightlyProposalSynthesis } from "../server/services/essence/nightly-proposals";

const OWNER_ID = "persona:test-nightly";

describe("nightly proposal synthesis", () => {
  beforeEach(async () => {
    await resetDbClient();
    await seedTemplate();
  });

  it("generates a layout proposal from recent activity", async () => {
    const now = new Date();
    await recordActivityEvents(OWNER_ID, [
      {
        ts: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        panelId: "Hull3DRenderer",
        tag: "physics",
        durationSec: 900,
        updates: 4,
        meta: { envHints: { tiltGain: 0.8 } },
      },
      {
        ts: now.toISOString(),
        panelId: "nhm2-solve-state",
        tag: "physics",
        durationSec: 600,
        updates: 2,
        meta: { envHints: { casimirPreset: "dynamic" } },
      },
    ]);

    const results = await runNightlyProposalSynthesis({
      ownerId: OWNER_ID,
      limit: 1,
    });

    expect(results).toHaveLength(1);
    const [entry] = results;
    expect(entry.profile.id).toBe("physics");
    expect(entry.template.changes.openPanels?.[0]?.id).toMatch(/Hull3DRenderer|nhm2-solve-state/);
    expect(entry.template.changes.setEnv).toMatchObject({ tiltGain: 0.8, casimirPreset: "dynamic" });
    expect(entry.proposal?.target.type).toBe("environment");
    expect(entry.proposal?.patchKind).toBe("ui-config");
  });
});

async function seedTemplate(): Promise<void> {
  await ensureDatabase();
  const pool = getPool();
  await pool.query(`
    INSERT INTO essence_templates (template_id, template_version, os_version, schema_version, default_desktop_layout, default_panels, default_theme, metadata)
    VALUES ('helix-os-default', 1, 'helix-os@1.0.0', 1, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (template_id, template_version) DO NOTHING;
  `);
}
