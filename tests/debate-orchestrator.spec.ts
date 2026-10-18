import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetDebateStore,
  getDebateSnapshot,
  startDebate,
  startDebateAndWaitForOutcome,
  waitForDebateOutcome,
  type DebateSnapshot,
} from "../server/services/debate/orchestrator";

const waitFor = async <T>(fn: () => T | null, timeoutMs = 4000, stepMs = 20): Promise<T> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = fn();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error("timeout");
};

describe("debate orchestrator", () => {
  beforeEach(() => {
    __resetDebateStore();
  });

  it("produces turns and a verdict within configured bounds", async () => {
    const { debateId } = await startDebate({
      goal: "Should we prefer math.expr or math.sum for small programs?",
      persona_id: "persona:test",
      max_rounds: 2,
      max_wall_ms: 3000,
      verifiers: ["math.sympy.verify"],
    });

    const snapshot = await waitFor<DebateSnapshot | null>(() => {
      const snap = getDebateSnapshot(debateId);
      if (!snap) return null;
      const hasReferee = snap.turns.some((turn) => turn.role === "referee");
      if (hasReferee && snap.outcome) {
        return snap;
      }
      return null;
    });

    const proponentTurns = snapshot.turns.filter((turn) => turn.role === "proponent");
    const skepticTurns = snapshot.turns.filter((turn) => turn.role === "skeptic");
    expect(proponentTurns.length).toBeGreaterThan(0);
    expect(skepticTurns.length).toBeGreaterThan(0);
    expect(snapshot.outcome).not.toBeNull();
    expect(typeof snapshot.outcome?.verdict).toBe("string");
  });

  it("waits for a debate outcome via helper", async () => {
    const { debateId } = await startDebate({
      goal: "Will the helper resolve outcomes?",
      persona_id: "persona:test",
      max_rounds: 1,
      max_wall_ms: 3000,
      verifiers: [],
    });
    const outcome = await waitForDebateOutcome(debateId, 4000);
    expect(outcome?.debate_id).toBe(debateId);

    const combined = await startDebateAndWaitForOutcome({
      goal: "Helper should return verdict payloads",
      persona_id: "persona:test",
      max_rounds: 1,
      max_wall_ms: 3000,
      verifiers: [],
    });
    expect(combined.debateId).toBeDefined();
    expect(combined.outcome?.debate_id).toBe(combined.debateId);
  });

  it("adds additive provenance fields and enforces strict missing-provenance fail reason", async () => {
    const strictEnv = process.env.DEBATE_STRICT_PROVENANCE;
    process.env.DEBATE_STRICT_PROVENANCE = "1";
    try {
      const { debateId } = await startDebate({
        goal: "strict provenance gate",
        persona_id: "persona:test",
        max_rounds: 1,
        max_wall_ms: 3000,
        verifiers: [],
      });
      const outcome = await waitForDebateOutcome(debateId, 4000);
      expect(outcome?.fail_reason).toBe("DEBATE_EVIDENCE_PROVENANCE_MISSING");
      expect(outcome?.provenance_class).toBe("proxy");
      expect(outcome?.claim_tier).toBe("diagnostic");
      expect(outcome?.certifying).toBe(false);
    } finally {
      process.env.DEBATE_STRICT_PROVENANCE = strictEnv;
    }

    const { debateId: groundedDebateId } = await startDebate({
      goal: "grounded metadata",
      persona_id: "persona:test",
      max_rounds: 1,
      max_wall_ms: 3000,
      verifiers: [],
      context: {
        warp_grounding: {
          status: "ADMISSIBLE",
          summary: "ok",
          certificateHash: "cert:abc",
          constraints: [],
        },
      },
    });

    const grounded = await waitForDebateOutcome(groundedDebateId, 4000);
    expect(grounded?.provenance_class).toBe("measured");
    expect(grounded?.claim_tier).toBe("certified");
    expect(grounded?.certifying).toBe(true);
  });

});
