import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HELIX_INTERPRETER_SCHEMA_VERSION,
  runHelixAskInterpreter,
  shouldRunHelixAskInterpreter,
  type HelixAskInterpreterConfig,
} from "../server/services/helix-ask/interpreter";

const baseConfig: HelixAskInterpreterConfig = {
  enabled: true,
  logOnly: false,
  model: "gpt-4o-mini",
  timeoutMs: 400,
  nBest: 3,
  top2GapMin: 0.12,
  pivotAutoMin: 0.82,
  pivotBlockMin: 0.68,
  apiKey: "test-key",
  baseUrl: "https://api.test/v1",
};

const buildResponsesPayload = (body: Record<string, unknown>): Record<string, unknown> => ({
  output: [
    {
      content: [{ text: JSON.stringify(body) }],
    },
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Helix Ask interpreter", () => {
  it("runs for non-English or code-mixed turns only", () => {
    expect(shouldRunHelixAskInterpreter({ sourceLanguage: "en" })).toBe(false);
    expect(shouldRunHelixAskInterpreter({ sourceLanguage: "en-US" })).toBe(false);
    expect(shouldRunHelixAskInterpreter({ sourceLanguage: "unknown" })).toBe(false);
    expect(shouldRunHelixAskInterpreter({ sourceLanguage: "und" })).toBe(false);
    expect(
      shouldRunHelixAskInterpreter({
        sourceLanguage: "unknown",
        sourceText: "什么是阿库比耶尔扭曲炮?",
      }),
    ).toBe(true);
    expect(shouldRunHelixAskInterpreter({ sourceLanguage: "zh-hans" })).toBe(true);
    expect(shouldRunHelixAskInterpreter({ sourceLanguage: "en", codeMixed: true })).toBe(true);
  });

  it("returns an auto-dispatch artifact when confidence and ambiguity gates pass", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        buildResponsesPayload({
          pivot_candidates: [
            { text: "What is an Alcubierre warp bubble?", confidence: 0.93 },
            { text: "Explain the Alcubierre metric.", confidence: 0.77 },
          ],
          selected_pivot: "What is an Alcubierre warp bubble?",
          concept_hints: [{ term: "warp bubble", confidence: 0.9 }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runHelixAskInterpreter({
      sourceText: "\u4ec0\u4e48\u662f\u963f\u5e93\u522b\u745e\u66f2\u901f\u6ce1\uff1f",
      sourceLanguage: "zh-hans",
      responseLanguage: "zh-hans",
      config: baseConfig,
    });

    expect(result.status).toBe("ok");
    expect(result.artifact).not.toBeNull();
    expect(result.artifact?.schema_version).toBe(HELIX_INTERPRETER_SCHEMA_VERSION);
    expect(result.artifact?.dispatch_state).toBe("auto");
    expect(result.artifact?.ambiguity.ambiguous).toBe(false);
    expect(result.artifact?.selected_pivot.confidence).toBeGreaterThanOrEqual(0.82);
  });

  it("sends json-schema format via text.format for Responses API compatibility", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        buildResponsesPayload({
          pivot_candidates: [{ text: "What is a warp bubble?", confidence: 0.9 }],
          selected_pivot: "What is a warp bubble?",
          concept_hints: [],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await runHelixAskInterpreter({
      sourceText: "什么是曲速泡？",
      sourceLanguage: "zh-hans",
      responseLanguage: "zh-hans",
      config: baseConfig,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("response_format");
    const text = payload.text as Record<string, unknown> | undefined;
    const format = text?.format as Record<string, unknown> | undefined;
    expect(format?.type).toBe("json_schema");
    expect(format?.name).toBe("helix_interpreter");
    expect(format?.strict).toBe(true);
  });

  it("keeps auto when confidence clears threshold even if top-2 gap is low", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        buildResponsesPayload({
          pivot_candidates: [
            { text: "What is a warp bubble?", confidence: 0.86 },
            { text: "What is a warp cannon?", confidence: 0.8 },
          ],
          selected_pivot: "What is a warp bubble?",
          concept_hints: [{ term: "warp bubble", confidence: 0.82 }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runHelixAskInterpreter({
      sourceText: "\u4ec0\u4e48\u662f\u66f2\u901f\u6ce1\uff1f",
      sourceLanguage: "zh-hans",
      responseLanguage: "zh-hans",
      config: baseConfig,
    });

    expect(result.status).toBe("ok");
    expect(result.artifact?.dispatch_state).toBe("auto");
    expect(result.artifact?.ambiguity.ambiguous).toBe(true);
    expect(result.artifact?.ambiguity.top2_gap).toBeLessThan(0.12);
  });

  it("keeps auto when confidence is very high even with low top-2 gap", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        buildResponsesPayload({
          pivot_candidates: [
            { text: "What is quantum physics?", confidence: 1 },
            { text: "Explain quantum physics.", confidence: 0.99 },
          ],
          selected_pivot: "What is quantum physics?",
          concept_hints: [],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runHelixAskInterpreter({
      sourceText: "\u4ec0\u4e48\u662f\u91cf\u5b50\u7269\u7406\u5b66\uff1f",
      sourceLanguage: "zh-hans",
      responseLanguage: "zh-hans",
      config: baseConfig,
    });

    expect(result.status).toBe("ok");
    expect(result.artifact?.dispatch_state).toBe("auto");
    expect(result.artifact?.selected_pivot.confidence).toBe(1);
    expect(result.artifact?.ambiguity.top2_gap).toBeLessThan(0.12);
  });

  it("rescues low-confidence blocked state when semantic anchors are strong", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        buildResponsesPayload({
          pivot_candidates: [
            { text: "What is the Alcubierre warp bubble?", confidence: 0.6 },
            { text: "What is a warp cannon?", confidence: 0.42 },
          ],
          selected_pivot: "What is the Alcubierre warp bubble?",
          concept_hints: [{ term: "warp bubble", confidence: 0.9 }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runHelixAskInterpreter({
      sourceText: "什么是阿库比耶尔扭曲炮?",
      sourceLanguage: "zh-hans",
      responseLanguage: "zh-hans",
      config: baseConfig,
    });

    expect(result.status).toBe("ok");
    expect(result.artifact?.dispatch_state).toBe("confirm");
    expect(result.artifact?.selected_pivot.confidence).toBe(0.6);
    expect(result.artifact?.term_ids).toContain("eponym_alcubierre");
  });

  it("fails safe to confirm on parse failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ text: "{not-json" }] }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runHelixAskInterpreter({
      sourceText: "\u4ec0\u4e48\u662f\u66f2\u901f\u70ae\uff1f",
      sourceLanguage: "zh-hans",
      responseLanguage: "zh-hans",
      config: baseConfig,
    });

    expect(result.status).toBe("parse_error");
    expect(result.artifact?.dispatch_state).toBe("confirm");
    expect(typeof result.artifact?.confirm_prompt).toBe("string");
  });

  it("fails safe to confirm on timeout", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runHelixAskInterpreter({
      sourceText: "\u4ec0\u4e48\u662f\u66f2\u901f\u6ce1\uff1f",
      sourceLanguage: "zh-hans",
      responseLanguage: "zh-hans",
      config: {
        ...baseConfig,
        timeoutMs: 20,
      },
    });

    expect(result.status).toBe("timeout");
    expect(result.artifact?.dispatch_state).toBe("confirm");
  });
});
