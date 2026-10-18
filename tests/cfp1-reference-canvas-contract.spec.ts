import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REFERENCE_CANVAS_OPERATION,
  ReferenceCanvasContractOracle,
  type Offer,
  type Request,
} from "./helpers/cfp1-reference-canvas-contract";

type Fixture = { schema: string; timing: Record<string, number>; base: Record<string, string | number>; cases: Array<{ id: string; expect: string }> };
const fixture = JSON.parse(fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/cfp1-reference-canvas-contract.v1.json"),
  "utf8",
)) as Fixture;

const clock = (start = 1_000_000) => ({ value: start, now() { return this.value; } });
const setup = () => {
  const time = clock();
  const oracle = new ReferenceCanvasContractOracle(time, { revision: 12, content: "owner-notes", markers: [] });
  const offer = oracle.issueOffer({ id: "offer:one", nonce: "nonce:unpredictable", ownerId: "owner:maya", requesterId: "guest:jo",
    roomId: "room:canvas-1", sponsorRevision: 7, nodeId: "node:owner-laptop", documentId: "doc:opaque-17",
    documentRevision: 12, connectorEpoch: 3, operation: REFERENCE_CANVAS_OPERATION, coordinates: { x: 0.25, y: 0.75 }, snapshotAt: time.value });
  const request = (changes: Partial<Request> = {}): Request => ({ offerId: offer.id, nonce: offer.nonce, actorId: offer.requesterId,
    ownerId: offer.ownerId, roomId: offer.roomId, nodeId: offer.nodeId, documentId: offer.documentId,
    sponsorRevision: offer.sponsorRevision, connectorEpoch: offer.connectorEpoch, operation: offer.operation,
    expectedRevision: offer.documentRevision, coordinates: { ...offer.coordinates },
    idempotencyKey: "idempotency:one", ...changes });
  return { time, oracle, offer, request };
};

describe("CFP-1 reference-canvas contract fixture", () => {
  it("CF-01: commits exactly one blue marker, advances the revision once, and preserves owner content", () => {
    const { oracle, request } = setup();
    const result = oracle.request(request());
    expect(result).toMatchObject({ kind: "committed", revision: 13, idempotencyReplayed: false });
    expect(oracle.document).toEqual({ revision: 13, content: "owner-notes", markers: [{ id: "marker:offer:one:1", color: "blue", coordinates: { x: 0.25, y: 0.75 } }] });
    expect(oracle.successfulEffects).toHaveLength(1);
  });

  it("CF-02: rejects independently altered authority tuple fields", () => {
    for (const changed of [
      { actorId: "guest:other" }, { ownerId: "owner:other" }, { roomId: "room:other" },
      { sponsorRevision: 8 }, { nodeId: "node:other" }, { connectorEpoch: 4 }, { operation: "other.operation" },
    ]) {
      const { oracle, request } = setup();
      expect(oracle.request(request(changed))).toEqual({ kind: "denied", reason: "identity_mismatch" });
      expect(oracle.document.markers).toEqual([]);
    }
  });

  it("CF-03: rejects stale observation or revision and non-finite/out-of-range coordinates", () => {
    { const { time, oracle, request } = setup(); time.value += 1_001; expect(oracle.request(request())).toEqual({ kind: "denied", reason: "stale_observation" }); }
    { const { oracle, request } = setup(); expect(oracle.request(request({ expectedRevision: 11 }))).toEqual({ kind: "denied", reason: "stale_revision" }); }
    for (const coordinates of [{ x: Number.NaN, y: 0.5 }, { x: -0.01, y: 0.5 }, { x: 0.5, y: 1.01 }]) {
      const { oracle, request } = setup(); expect(oracle.request(request({ coordinates }))).toEqual({ kind: "denied", reason: "invalid_coordinates" });
    }
  });

  it("CF-04: honors 1-second freshness and 60-second grant boundaries using the injected clock", () => {
    { const { time, oracle, request } = setup(); time.value += 1_000; expect(oracle.request(request())).toMatchObject({ kind: "committed" }); }
    { const { time, oracle, offer, request } = setup(); time.value += 59_999; oracle.refreshServerSnapshot(offer.id); expect(oracle.request(request())).toMatchObject({ kind: "committed" }); }
    { const { time, oracle, offer, request } = setup(); time.value += 60_000; oracle.refreshServerSnapshot(offer.id); expect(oracle.request(request())).toEqual({ kind: "denied", reason: "grant_expired" }); }
  });

  it("CF-05: replays the durable result for the same body and conflicts on an altered body", () => {
    const { oracle, request } = setup();
    const first = oracle.request(request());
    const replay = oracle.request(request());
    expect(first).toMatchObject({ kind: "committed", effectId: "effect:offer:one:1" });
    expect(replay).toEqual({ kind: "replayed", effectId: "effect:offer:one:1", markerId: "marker:offer:one:1", revision: 13, idempotencyReplayed: true });
    expect(oracle.request(request({ coordinates: { x: 0.5, y: 0.75 } }))).toEqual({ kind: "denied", reason: "idempotency_conflict" });
    expect(oracle.document.markers).toHaveLength(1);
    const { time, oracle: retentionOracle, request: retentionRequest } = setup();
    retentionOracle.request(retentionRequest()); time.value += 86_399_999;
    expect(retentionOracle.request(retentionRequest())).toMatchObject({ kind: "replayed" });
    time.value += 1;
    expect(retentionOracle.request(retentionRequest())).toEqual({ kind: "denied", reason: "grant_expired" });
  });

  it("CF-06: consumes one grant once and holds an unknown outcome's reservation", () => {
    { const { oracle, request } = setup(); oracle.request(request()); expect(oracle.request(request({ idempotencyKey: "idempotency:two" }))).toEqual({ kind: "denied", reason: "grant_used" }); }
    { const { oracle, request } = setup(); expect(oracle.request(request({ outcome: "unknown" }))).toEqual({ kind: "outcome_unknown", reservationId: "reservation:idempotency:one" });
      expect(oracle.request(request({ outcome: "unknown" }))).toEqual({ kind: "denied", reason: "idempotency_reserved_unknown" });
      expect(oracle.document.markers).toHaveLength(1); expect(oracle.successfulEffects).toEqual([]); }
  });

  it("CF-07: cancels within the one-second fixture target before commit and preserves committed content after", () => {
    { const { time, oracle, offer, request } = setup(); const cancellation = oracle.cancelBeforeCommit(offer.id, time.value); expect(cancellation).toEqual({ cancelled: true, elapsedMs: 0 });
      expect(cancellation.elapsedMs).toBeLessThanOrEqual(1_000); expect(oracle.request(request())).toEqual({ kind: "denied", reason: "grant_revoked" }); expect(oracle.document.markers).toEqual([]); }
    { const { oracle, offer, request } = setup(); oracle.request(request()); expect(oracle.cancelBeforeCommit(offer.id, 1_000_000)).toEqual({ cancelled: false, elapsedMs: 0 });
      expect(oracle.document).toMatchObject({ revision: 13, content: "owner-notes" }); expect(oracle.document.markers).toHaveLength(1); }
  });

  it("CF-08: distinguishes verified effects from actual resource work and enforces the five-second deadline", () => {
    const { oracle, request } = setup();
    oracle.recordResourceWork("denied-lookup", 2);
    expect(oracle.request(request({ commitDelayMs: 5_001 }))).toEqual({ kind: "denied", reason: "native_deadline_exceeded" });
    expect(oracle.successfulEffects).toEqual([]);
    expect(oracle.resourceWork).toEqual([{ id: "denied-lookup", units: 2 }]);
    const { oracle: onDeadline, request: onDeadlineRequest } = setup();
    expect(onDeadline.request(onDeadlineRequest({ commitDelayMs: 5_000 }))).toMatchObject({ kind: "committed" });
  });

  it("loads the frozen hand-authored CF-01–08 fixture", () => {
    expect(fixture.schema).toBe("casimirbot.cfp1.reference_canvas_contract_fixture.v1");
    expect(fixture.timing).toMatchObject({ snapshot_max_age_ms: 1_000, native_commit_deadline_ms: 5_000, grant_lifetime_ms: 60_000 });
    expect(fixture.cases.map((item) => item.id)).toEqual(["CF-01", "CF-02", "CF-03", "CF-04", "CF-05", "CF-06", "CF-07", "CF-08"]);
  });
});
