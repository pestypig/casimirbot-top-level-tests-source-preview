import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHelixAskDiagnosticJournal } from "../apps/desktop/src/helix-ask-diagnostic-journal";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it("keeps only allowlisted canonical terminal diagnostics", () => {
  const directory = mkdtempSync(join(tmpdir(), "helix-journal-"));
  directories.push(directory);
  const filePath = join(directory, "diagnostic.log");
  const journal = createHelixAskDiagnosticJournal(filePath);
  journal.append("stderr", `[helix][invalid-canonical-terminal-kind] ${JSON.stringify({
    required_terminal_kind_type: "undefined",
    required_terminal_kind_own: false,
    frame_key_count: 12,
    goal_kind_code: "model_only_concept",
    answer_scope_code: "model_only",
    caller_site: "dist/service.mjs:123:45",
    prompt: "private user text",
  })}\n`);
  const persisted = readFileSync(filePath, "utf8");
  expect(persisted).toContain('"caller_site":"dist/service.mjs:123:45"');
  expect(persisted).toContain('"frame_key_count":12');
  expect(persisted).not.toContain("private user text");
  expect(persisted).not.toContain('"prompt"');
});

it("rejects unrecognized diagnostic values", () => {
  const directory = mkdtempSync(join(tmpdir(), "helix-journal-"));
  directories.push(directory);
  const filePath = join(directory, "diagnostic.log");
  const journal = createHelixAskDiagnosticJournal(filePath);
  journal.append("stderr", `[helix][invalid-canonical-terminal-kind] ${JSON.stringify({
    required_terminal_kind_type: "secret",
    required_terminal_kind_own: "yes",
    frame_key_count: 999,
    goal_kind_code: "secret",
    answer_scope_code: "secret",
    caller_site: "C:/private/location:1:2",
  })}\n`);
  const persisted = readFileSync(filePath, "utf8");
  expect(persisted).toContain('"required_terminal_kind_type":"unknown"');
  expect(persisted).toContain('"frame_key_count":null');
  expect(persisted).toContain('"caller_site":null');
  expect(persisted).not.toContain("secret");
});

