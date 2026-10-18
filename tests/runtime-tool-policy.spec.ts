import { beforeEach, describe, expect, it } from "vitest";
import {
  buildFallbackTraceRecord,
  isCertifyingLane,
  resolveAdapterEndpoint,
} from "../cli/casimir-verify";
import { listToolMeta } from "../server/services/runtime/tool-metadata";
import { resolveRuntimeToolPolicy } from "../server/services/runtime/tool-policy";

describe("runtime tool policy", () => {
  it("merges tool metadata with profile timeout overrides", () => {
    const policy = resolveRuntimeToolPolicy("repo.search");
    expect(policy).toBeTruthy();
    expect(policy?.lane).toBe("io");
    expect(policy?.hardTimeoutMs).toBe(900);
  });

  it("accepts underscore profile aliases", () => {
    const policy = resolveRuntimeToolPolicy("tts.local");
    expect(policy).toBeTruthy();
    expect(policy?.hardTimeoutMs).toBe(650);
  });

  it("returns null for unknown tool", () => {
    expect(resolveRuntimeToolPolicy("missing.tool")).toBeNull();
  });
});


describe("runtime tool metadata provenance defaults", () => {
  it("marks tools without complete metadata as diagnostic/non-certifying", () => {
    const repoSearch = listToolMeta().find((tool) => tool.id === "repo.search");
    expect(repoSearch).toBeTruthy();
    expect(repoSearch?.provenance).toEqual({
      maturity: "diagnostic",
      certifying: false,
      metadataComplete: false,
    });
  });
});

describe("casimir verify endpoint hardening", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CASIMIR_CERTIFY;
    delete process.env.CASIMIR_PUBLIC_BASE_URL;
    delete process.env.SHADOW_OF_INTENT_BASE_URL;
    delete process.env.CASIMIR_VERIFY_URL;
    delete process.env.AGI_ADAPTER_URL;
  });

  it("requires explicit url in certifying mode via cli lane", () => {
    expect(isCertifyingLane({ ci: true })).toBe(true);
  });

  it("requires explicit url in certifying mode via env lane", () => {
    process.env.CASIMIR_CERTIFY = "1";
    expect(isCertifyingLane({})).toBe(true);
  });

  it("resolves adapter endpoint only from explicit url when certifying", () => {
    process.env.CASIMIR_PUBLIC_BASE_URL = "http://localhost:5173";
    expect(resolveAdapterEndpoint("http://example.com")).toBe(
      "http://example.com/api/agi/adapter/run",
    );
  });

  it("marks synthetic fallback traces as non-certifying", () => {
    const trace = buildFallbackTraceRecord({
      payload: { mode: "constraint-pack", pack: { id: "repo-convergence" } },
      response: {
        traceId: "trace-1",
        runId: "run-1",
        verdict: "PASS",
        pass: true,
        certificate: {
          status: "ADMISSIBLE",
          certificateHash: "abc",
          integrityOk: true,
        },
      },
    });

    expect(trace.certificate?.status).toBe("NOT_CERTIFIED");
    expect(trace.certificate?.integrityOk).toBe(false);
    expect(trace.notes).toContain("synthetic_fallback_non_certifying=true");
  });
});
