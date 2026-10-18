import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

fs.mkdirSync(path.resolve(".tmp"), { recursive: true });
const root = fs.mkdtempSync(path.resolve(".tmp/local-mvp-update-guards-"));
afterAll(() => {
  const resolved = fs.realpathSync(root);
  if (!resolved.startsWith(fs.realpathSync(path.resolve(".tmp")) + path.sep)) throw Error("fixture_cleanup_escape");
  fs.rmSync(resolved, { recursive: true });
});

describe("private incremental update admission", () => {
  it.each(["signed", "desktop", "source_inventory"])("rejects %s before creating backups or replacing files", kind => {
    const oldRoot = path.join(root, kind, "old"), newRoot = path.join(root, kind, "new");
    const receipts = [oldRoot, newRoot].map(candidateRoot => {
      const desktop = path.join(candidateRoot, "apps/desktop");
      fs.mkdirSync(desktop, { recursive: true });
      return { status: "prepared", privateLocalMvp: true, signed: false, published: false, desktop, sourceSha256: { "server/services/reference-canvas/default-service.ts": candidateRoot } };
    });
    if (kind === "signed") receipts[1].signed = true;
    if (kind === "desktop") receipts[1].desktop = receipts[0].desktop;
    if (kind === "source_inventory") Object.assign(receipts[1].sourceSha256, { "extra.ts": "extra" });
    [oldRoot, newRoot].forEach((candidateRoot, index) => fs.writeFileSync(path.join(candidateRoot, "candidate.json"), JSON.stringify(receipts[index])));
    const before = [oldRoot, newRoot].map(candidateRoot => fs.readFileSync(path.join(candidateRoot, "candidate.json"), "utf8"));
    const result = spawnSync(process.execPath, ["scripts/environment-packages/update-local-mvp-service.mjs", oldRoot, newRoot], { encoding: "utf8", windowsHide: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain({ signed: "unsigned_unpublished_candidates_required", desktop: "candidate_desktop_mismatch", source_inventory: "source_inventory_changed" }[kind]);
    [oldRoot, newRoot].forEach((candidateRoot, index) => {
      expect(fs.readFileSync(path.join(candidateRoot, "candidate.json"), "utf8")).toBe(before[index]);
      expect(fs.readdirSync(candidateRoot).sort()).toEqual(["apps", "candidate.json"]);
    });
  });
});
