import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeHelixAskTermPriorDecision,
  detectHelixAskTermHits,
  resetHelixAskLanguageDirectoryCache,
  type HelixAskLanguageDirectory,
} from "../server/services/helix-ask/multilang";

const createTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helix-term-dir-"));

const writeDirectory = (filePath: string, directory: HelixAskLanguageDirectory): void => {
  fs.writeFileSync(filePath, JSON.stringify(directory, null, 2), "utf8");
};

const baseDirectory = (entries: HelixAskLanguageDirectory["entries"]): HelixAskLanguageDirectory => ({
  schema_version: "helix.lang.directory.v1",
  denylist_term_ids: [],
  overrides_by_term_id: {},
  entries,
});

const buildEponymEntry = (termId: string, canonical: string, aliases: string[]): HelixAskLanguageDirectory["entries"][number] => ({
  term_id: termId,
  category: "eponym",
  canonical,
  aliases_by_locale: {
    en: aliases,
    "zh-hans": aliases,
  },
  romanized_aliases: aliases,
  concept_expansions: ["warp bubble"],
  conceptual_patterns: ["\\b(?:what\\s+is|explain|define|meaning)\\b"],
  explicit_repo_blockers: ["\\b(?:repo|codebase|module|file|path|api|endpoint)\\b"],
  enabled: true,
});

const cleanupDirs: string[] = [];

afterEach(() => {
  resetHelixAskLanguageDirectoryCache();
  for (const dirPath of cleanupDirs.splice(0, cleanupDirs.length)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
});

describe("helix ask multilingual term directory", () => {
  it("detects exact and romanized aliases across source and pivot text", () => {
    const tempDir = createTempDir();
    cleanupDirs.push(tempDir);
    const configPath = path.join(tempDir, "directory.json");
    writeDirectory(
      configPath,
      baseDirectory([
        {
          ...buildEponymEntry("eponym_alcubierre", "Alcubierre", [
            "alcubierre",
            "alcubierre drive",
            "阿库比埃雷",
          ]),
          romanized_aliases: ["akubielei"],
        },
      ]),
    );

    const exact = detectHelixAskTermHits({
      sourceText: "什么是阿库比埃雷曲速泡？",
      pivotText: "What is an Alcubierre warp bubble?",
      directoryPath: configPath,
      directoryReloadMs: 60_000,
    });
    expect(exact.term_hits.length).toBe(1);
    expect(exact.term_hits[0].term_id).toBe("eponym_alcubierre");
    expect(exact.term_hits[0].matched_in).toBe("both");
    expect(exact.term_hits[0].match_type).toBe("exact");

    const romanized = detectHelixAskTermHits({
      sourceText: "akubielei 是什么？",
      pivotText: "Explain this concept.",
      directoryPath: configPath,
      directoryReloadMs: 60_000,
    });
    expect(romanized.term_hits.length).toBe(1);
    expect(romanized.term_hits[0].match_type).toBe("romanized");
  });

  it("maps zh variant aliases for warp-bubble-like prompts", () => {
    const tempDir = createTempDir();
    cleanupDirs.push(tempDir);
    const configPath = path.join(tempDir, "directory.json");
    writeDirectory(
      configPath,
      baseDirectory([
        {
          term_id: "framework_warp_bubble",
          category: "framework",
          canonical: "warp bubble",
          aliases_by_locale: {
            en: ["warp bubble"],
            "zh-hans": ["曲速泡", "曲速炮", "取速炮"],
          },
          romanized_aliases: ["qu su pao"],
          concept_expansions: ["alcubierre", "metric", "warp drive"],
          conceptual_patterns: ["\\b(?:what\\s+is|explain|define|meaning)\\b"],
          explicit_repo_blockers: ["\\b(?:repo|codebase|module|file|path|api|endpoint)\\b"],
          enabled: true,
        },
      ]),
    );

    const detection = detectHelixAskTermHits({
      sourceText: "什么是取速炮？",
      pivotText: "what is warp bubble",
      directoryPath: configPath,
      directoryReloadMs: 60_000,
    });
    expect(detection.term_hits.length).toBe(1);
    expect(detection.term_hits[0].term_id).toBe("framework_warp_bubble");
    expect(detection.term_hits[0].match_type).toBe("exact");
  });

  it("reloads denylist and suppresses matching terms without restart", async () => {
    const tempDir = createTempDir();
    cleanupDirs.push(tempDir);
    const configPath = path.join(tempDir, "directory.json");
    writeDirectory(
      configPath,
      baseDirectory([buildEponymEntry("eponym_casimir", "Casimir", ["casimir", "casimir effect"])]),
    );

    const before = detectHelixAskTermHits({
      sourceText: "What is the Casimir effect?",
      pivotText: "What is the Casimir effect?",
      directoryPath: configPath,
      directoryReloadMs: 1,
      nowMs: 1_000,
    });
    expect(before.term_hits.length).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 15));
    writeDirectory(configPath, {
      ...baseDirectory([buildEponymEntry("eponym_casimir", "Casimir", ["casimir", "casimir effect"])]),
      denylist_term_ids: ["eponym_casimir"],
    });

    const after = detectHelixAskTermHits({
      sourceText: "What is the Casimir effect?",
      pivotText: "What is the Casimir effect?",
      directoryPath: configPath,
      directoryReloadMs: 1,
      nowMs: 10_000,
    });
    expect(after.term_hits.length).toBe(0);
    expect(after.disabled_term_ids).toContain("eponym_casimir");
  });

  it("applies confidence-gated weighted prior and hard-force only at high confidence", () => {
    const tempDir = createTempDir();
    cleanupDirs.push(tempDir);
    const configPath = path.join(tempDir, "directory.json");
    writeDirectory(
      configPath,
      baseDirectory([buildEponymEntry("eponym_alcubierre", "Alcubierre", ["alcubierre", "warp bubble"])]),
    );

    const weighted = computeHelixAskTermPriorDecision({
      sourceText: "什么是阿库比埃雷曲速泡？",
      pivotText: "What is an Alcubierre warp bubble?",
      explicitRepoCue: false,
      enabled: true,
      pivotConfidence: 0.9,
      directoryPath: configPath,
    });
    expect(weighted.applied).toBe(true);
    expect(weighted.hard_force_general).toBe(false);

    const hardForce = computeHelixAskTermPriorDecision({
      sourceText: "什么是阿库比埃雷曲速泡？",
      pivotText: "What is an Alcubierre warp bubble?",
      explicitRepoCue: false,
      enabled: true,
      pivotConfidence: 0.95,
      directoryPath: configPath,
    });
    expect(hardForce.applied).toBe(true);
    expect(hardForce.hard_force_general).toBe(true);

    const explicitRepo = computeHelixAskTermPriorDecision({
      sourceText: "What is Alcubierre in this repo module?",
      pivotText: "What is Alcubierre in this repo module?",
      explicitRepoCue: true,
      enabled: true,
      pivotConfidence: 0.95,
      directoryPath: configPath,
    });
    expect(explicitRepo.applied).toBe(false);
    expect(explicitRepo.prior_suppressed_reason).toBe("explicit_repo_cue");
  });

  it("treats 'how does' prompts as conceptual for term-prior decisions", () => {
    const tempDir = createTempDir();
    cleanupDirs.push(tempDir);
    const configPath = path.join(tempDir, "directory.json");
    writeDirectory(
      configPath,
      baseDirectory([buildEponymEntry("eponym_casimir", "Casimir", ["casimir", "dynamic casimir"])]),
    );

    const decision = computeHelixAskTermPriorDecision({
      sourceText: "How does dynamic Casimir modulation feed into the system's physics outputs?",
      pivotText: "How does dynamic Casimir modulation feed into the system's physics outputs?",
      explicitRepoCue: false,
      enabled: true,
      pivotConfidence: 0.9,
      directoryPath: configPath,
    });

    expect(decision.term_hits.some((hit) => hit.term_id === "eponym_casimir")).toBe(true);
    expect(decision.conceptual_prompt).toBe(true);
    expect(decision.prior_suppressed_reason).toBeNull();
    expect(decision.applied).toBe(true);
  });

  it("suppresses prior when polysemy group is ambiguous", () => {
    const tempDir = createTempDir();
    cleanupDirs.push(tempDir);
    const configPath = path.join(tempDir, "directory.json");
    writeDirectory(
      configPath,
      baseDirectory([
        {
          ...buildEponymEntry("eponym_ford_roman", "Ford-Roman", ["ford", "ford roman"]),
          polysemy_group: "ford_group",
        },
        {
          term_id: "framework_ford_automotive",
          category: "framework",
          canonical: "Ford (automotive)",
          aliases_by_locale: {
            en: ["ford"],
          },
          romanized_aliases: [],
          concept_expansions: ["automotive company"],
          conceptual_patterns: ["\\b(?:what\\s+is|explain|define|meaning)\\b"],
          explicit_repo_blockers: [],
          polysemy_group: "ford_group",
          enabled: true,
        },
      ]),
    );

    const decision = computeHelixAskTermPriorDecision({
      sourceText: "What is Ford?",
      pivotText: "What is Ford?",
      explicitRepoCue: false,
      enabled: true,
      pivotConfidence: 0.95,
      directoryPath: configPath,
    });
    expect(decision.applied).toBe(false);
    expect(decision.prior_suppressed_reason).toBe("polysemy_ambiguous");
    expect(decision.polysemy_ambiguous).toBe(true);
  });

  it("falls back to repo term directory when configured path is missing", () => {
    resetHelixAskLanguageDirectoryCache();
    const detection = detectHelixAskTermHits({
      sourceText: "What is Alcubierre warp bubble?",
      pivotText: "What is Alcubierre warp bubble?",
      directoryPath: "configs/missing-term-directory.json",
      directoryReloadMs: 1,
    });
    expect(detection.term_hits.some((hit) => hit.term_id === "eponym_alcubierre")).toBe(true);
  });
});
