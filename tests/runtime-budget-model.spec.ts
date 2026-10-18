import { describe, expect, it } from "vitest";
import { evaluateRuntimeBudgetState } from "../server/services/runtime/budget-model";
import { resolveLocalRuntimeCaps } from "../server/services/llm/local-runtime";

const withEnv = <T>(vars: Record<string, string | undefined>, fn: () => T): T => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe("runtime budget model", () => {
  it("returns OK when pressures are low", () => {
    const state = evaluateRuntimeBudgetState({
      clockAP95Ms: 120,
      clockABudgetMs: 400,
      toolCallsLastTick: 1,
      maxToolCalls: 2,
      kvTokens: 1000,
      kvMaxTokens: 8000,
      queueDepth: 1,
      queueMaxDepth: 50,
      lanePressure: { llm: 0.2, media: 0.1 },
    });
    expect(state.level).toBe("OK");
    expect(state.recommend).toBe("none");
  });

  it("returns WARNING and reduces tool calls near saturation", () => {
    const state = evaluateRuntimeBudgetState({
      clockAP95Ms: 340,
      clockABudgetMs: 400,
      toolCallsLastTick: 2,
      maxToolCalls: 2,
      kvTokens: 1000,
      kvMaxTokens: 8000,
      queueDepth: 1,
      queueMaxDepth: 50,
      lanePressure: { llm: 0.4 },
    });
    expect(state.level).toBe("OVER");
    expect(state.recommend).toBe("reduce_output_tokens");
  });

  it("queues deep work when queue is over budget", () => {
    const state = evaluateRuntimeBudgetState({
      clockAP95Ms: 200,
      clockABudgetMs: 400,
      toolCallsLastTick: 1,
      maxToolCalls: 2,
      kvTokens: 1000,
      kvMaxTokens: 8000,
      queueDepth: 70,
      queueMaxDepth: 50,
      lanePressure: { llm: 0.9 },
    });
    expect(state.level).toBe("OVER");
    expect(state.recommend).toBe("queue_deep_work");
  });

  it("defaults claim_tier to diagnostic for local runtime caps", () => {
    const caps = withEnv(
      {
        LLM_RUNTIME: "local",
        LLM_LOCAL_CLAIM_TIER: undefined,
        CLAIM_TIER: undefined,
      },
      () => resolveLocalRuntimeCaps(),
    );
    expect(caps).toBeTruthy();
    expect(caps?.claimTier).toBe("diagnostic");
  });

  it("falls back to diagnostic for unrecognized claim_tier values", () => {
    const caps = withEnv(
      {
        LLM_RUNTIME: "local",
        LLM_LOCAL_CLAIM_TIER: "production",
        CLAIM_TIER: undefined,
      },
      () => resolveLocalRuntimeCaps(),
    );
    expect(caps).toBeTruthy();
    expect(caps?.claimTier).toBe("diagnostic");
  });
});
