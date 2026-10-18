import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetDebateStore,
  listDebateEvents,
  startDebate,
  subscribeToDebate,
  type DebateStreamEvent,
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

describe("debate SSE buffering", () => {
  beforeEach(() => {
    __resetDebateStore();
  });

  it("replays backlog and streams subsequent events", async () => {
    const { debateId } = await startDebate({
      goal: "Does the skeptic ever win?",
      persona_id: "persona:test",
      max_rounds: 1,
      max_wall_ms: 3000,
      verifiers: [],
    });

    const backlog = await waitFor(() => {
      const events = listDebateEvents(debateId);
      return events.length > 0 ? events : null;
    });
    expect(backlog[0].type).toBeDefined();
    const lastSeq = backlog[backlog.length - 1].seq;
    const replay = listDebateEvents(debateId, lastSeq);
    expect(replay.length).toBe(0);

    const nextEvent = await new Promise<DebateStreamEvent>((resolve, reject) => {
      let unsub: () => void = () => {};
      const timer = setTimeout(() => {
        unsub();
        reject(new Error("event timeout"));
      }, 3000);
      unsub = subscribeToDebate(debateId, (event) => {
        if (event.seq > lastSeq) {
          clearTimeout(timer);
          unsub();
          resolve(event);
        }
      });
    });
    expect(nextEvent.seq).toBeGreaterThan(lastSeq);
  });

  it("streams additive provenance metadata on turn/outcome events", async () => {
    const { debateId } = await startDebate({
      goal: "provenance metadata in SSE",
      persona_id: "persona:test",
      max_rounds: 1,
      max_wall_ms: 3000,
      verifiers: [],
      context: {
        warp_grounding: {
          status: "ADMISSIBLE",
          summary: "ok",
          certificateHash: "cert:sse",
          constraints: [],
        },
      },
    });

    const events = await waitFor(() => {
      const current = listDebateEvents(debateId);
      return current.some((event) => event.type === "outcome") ? current : null;
    });

    const turnEvent = events.find((event) => event.type === "turn");
    expect(turnEvent && turnEvent.type === "turn" ? turnEvent.turn.provenance_class : undefined).toBe("measured");
    expect(turnEvent && turnEvent.type === "turn" ? turnEvent.turn.claim_tier : undefined).toBe("certified");
    expect(turnEvent && turnEvent.type === "turn" ? turnEvent.turn.certifying : undefined).toBe(true);

    const outcomeEvent = events.find((event) => event.type === "outcome");
    expect(outcomeEvent && outcomeEvent.type === "outcome" ? outcomeEvent.outcome.provenance_class : undefined).toBe("measured");
    expect(outcomeEvent && outcomeEvent.type === "outcome" ? outcomeEvent.outcome.claim_tier : undefined).toBe("certified");
    expect(outcomeEvent && outcomeEvent.type === "outcome" ? outcomeEvent.outcome.certifying : undefined).toBe(true);
  });

});
