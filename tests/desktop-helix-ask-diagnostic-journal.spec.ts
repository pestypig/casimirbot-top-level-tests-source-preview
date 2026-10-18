import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHelixAskDiagnosticJournal } from "../apps/desktop/src/helix-ask-diagnostic-journal";

describe("desktop Helix Ask diagnostic journal", () => {
  it("retains only bounded code fields across split stderr chunks", () => {
    const filePath = path.join(tmpdir(), `casimirbot-ask-diagnostic-${randomUUID()}.log`);
    try {
      const journal = createHelixAskDiagnosticJournal(filePath);
      journal.append("stderr", "[helix][external-turn-finalization] {\"stage\":\"turn_finalizer\",\"error_class\":\"Type");
      journal.append("stderr", "Error\",\"private_prompt\":\"must not persist\",\"prior_envelope\":true}\n");
      journal.append("stdout", "[helix][ask-runtime-fallback] {\"error_class\":\"ReferenceError\",\"stack_site\":\"dist/service.mjs:123:45\",\"message\":\"private\"}\n");
      const content = readFileSync(filePath, "utf8");
      expect(content).toContain('"stage":"turn_finalizer"');
      expect(content).toContain('"error_class":"ReferenceError"');
      expect(content).toContain('"stack_site":"dist/service.mjs:123:45"');
      expect(content).not.toContain("private");
      expect(content).not.toContain("private_prompt");
    } finally {
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });

  it("rotates an old journal and discards unrecognized content", () => {
    const filePath = path.join(tmpdir(), `casimirbot-ask-diagnostic-${randomUUID()}.log`);
    try {
      writeFileSync(filePath, "x".repeat(64 * 1024));
      const journal = createHelixAskDiagnosticJournal(filePath);
      journal.append("stderr", "[helix][invalid-canonical-terminal-kind] {\"required_terminal_kind_type\":\"undefined\",\"prompt\":\"private\"}\n");
      journal.append("stderr", "[helix][unrecognized] {\"prompt\":\"private\"}\n");
      journal.append("stderr", "user text [helix][invalid-canonical-terminal-kind] {\"required_terminal_kind_type\":\"string\"}\n");
      journal.append("stderr", "[helix][invalid-canonical-terminal-kind] {\"required_terminal_kind_type\":{\"toString\":\"poison\"}}\n");
      const content = readFileSync(filePath, "utf8");
      expect(content).toContain('"required_terminal_kind_type":"undefined"');
      expect(content).toContain('"required_terminal_kind_type":"unknown"');
      expect(content).not.toContain('"required_terminal_kind_type":"string"');
      expect(content).not.toContain("private");
      expect(content).not.toContain("unrecognized");
      expect(content.length).toBeLessThan(1_024);
    } finally {
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });
});
