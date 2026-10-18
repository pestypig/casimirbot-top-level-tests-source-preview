import { beforeEach, describe, expect, it, vi } from "vitest";

const putBlobMock = vi.hoisted(() => vi.fn());
const putEnvelopeWithPolicyMock = vi.hoisted(() => vi.fn());
const assertHullAllowedMock = vi.hoisted(() => vi.fn());

vi.mock("../server/storage", () => ({
  putBlob: putBlobMock,
}));

vi.mock("../server/skills/provenance", () => ({
  putEnvelopeWithPolicy: putEnvelopeWithPolicyMock,
}));

vi.mock("../server/security/hull-guard", () => ({
  assertHullAllowed: assertHullAllowedMock,
}));

describe("stt.whisper.http tool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    putBlobMock.mockReset();
    putEnvelopeWithPolicyMock.mockReset();
    assertHullAllowedMock.mockReset();
    putBlobMock.mockResolvedValue({
      uri: "storage://fs/stt-whisper-http.txt",
      cid: `cid:${"a".repeat(64)}`,
    });
    putEnvelopeWithPolicyMock.mockResolvedValue(undefined);
    assertHullAllowedMock.mockImplementation(() => undefined);
    delete process.env.WHISPER_HTTP_MODEL;
  });

  it("decodes codec-parameter data URIs and uploads a file part for OpenAI transcribe", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.startsWith("data:")) {
        throw new Error("data-url fetch unsupported in runtime");
      }

      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      const body = init?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get("model")).toBe("gpt-4o-mini-transcribe");
      expect(body.get("file_url")).toBeNull();
      const filePart = body.get("file");
      expect(filePart).toBeInstanceOf(Blob);
      expect((filePart as Blob).type).toBe("audio/webm");

      return new Response(JSON.stringify({ text: "hello world", language: "en", segments: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const { sttHttpHandler } = await import("../server/skills/stt.whisper.http");
    const dataUri = `data:audio/webm;codecs=opus;base64,${Buffer.from("fake-webm-binary").toString("base64")}`;

    const result = await sttHttpHandler(
      {
        audio_url: dataUri,
        backend_mode: "openai",
        backend_url: "https://api.openai.com",
        model: "gpt-4o-mini-transcribe",
        task: "transcribe",
      },
      { personaId: "persona:test" },
    );

    expect(result.text).toBe("hello world");
    expect(result.language).toBe("en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
