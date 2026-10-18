/**
 * G1-T1 test-only reference-canvas contract oracle.
 *
 * This is intentionally not imported by product code.  It models the frozen
 * contract with an injected clock so fixtures can state what a future runtime
 * must enforce.  It neither authorizes an action nor writes a native document.
 */

export type Clock = { now: () => number };

export const REFERENCE_CANVAS_OPERATION = "com.casimirbot.reference_canvas.marker.place.v1" as const;

export type Coordinates = { x: number; y: number };

export type Offer = {
  id: string;
  nonce: string;
  ownerId: string;
  requesterId: string;
  roomId: string;
  sponsorRevision: number;
  nodeId: string;
  documentId: string;
  documentRevision: number;
  connectorEpoch: number;
  operation: typeof REFERENCE_CANVAS_OPERATION;
  coordinates: Coordinates;
  issuedAt: number;
  expiresAt: number;
  snapshotAt: number;
  used: boolean;
  revokedAt: number | null;
};

export type Request = {
  offerId: string;
  nonce: string;
  actorId: string;
  ownerId: string;
  roomId: string;
  nodeId: string;
  documentId: string;
  sponsorRevision: number;
  connectorEpoch: number;
  operation: string;
  expectedRevision: number;
  coordinates: Coordinates;
  idempotencyKey: string;
  commitDelayMs?: number;
  outcome?: "success" | "unknown";
};

export type Marker = { id: string; color: "blue"; coordinates: Coordinates };
export type DocumentState = { revision: number; content: string; markers: Marker[] };
export type Outcome =
  | { kind: "committed"; effectId: string; markerId: string; revision: number; idempotencyReplayed: boolean }
  | { kind: "replayed"; effectId: string; markerId: string; revision: number; idempotencyReplayed: true }
  | { kind: "outcome_unknown"; reservationId: string }
  | { kind: "denied"; reason: DenialReason };

export type DenialReason =
  | "offer_missing"
  | "identity_mismatch"
  | "invalid_coordinates"
  | "stale_observation"
  | "stale_revision"
  | "grant_expired"
  | "grant_revoked"
  | "grant_used"
  | "idempotency_conflict"
  | "idempotency_reserved_unknown"
  | "native_deadline_exceeded";

type IdempotencyEntry = { fingerprint: string; outcome: Outcome; createdAt: number };

const fingerprint = (request: Request) => JSON.stringify({
  offerId: request.offerId, nonce: request.nonce, actorId: request.actorId,
  ownerId: request.ownerId, roomId: request.roomId, nodeId: request.nodeId,
  documentId: request.documentId, sponsorRevision: request.sponsorRevision, connectorEpoch: request.connectorEpoch,
  operation: request.operation, expectedRevision: request.expectedRevision, coordinates: request.coordinates,
});

const validCoordinates = ({ x, y }: Coordinates) =>
  Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;

export class ReferenceCanvasContractOracle {
  readonly document: DocumentState;
  readonly successfulEffects: string[] = [];
  readonly resourceWork: Array<{ id: string; units: number }> = [];
  private readonly offers = new Map<string, Offer>();
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private effectSequence = 0;

  constructor(private readonly clock: Clock, document: DocumentState) {
    this.document = { ...document, markers: [...document.markers] };
  }

  issueOffer(input: Omit<Offer, "issuedAt" | "expiresAt" | "used" | "revokedAt">): Offer {
    const issuedAt = this.clock.now();
    if (input.snapshotAt > issuedAt) throw new Error("server snapshot cannot be from the future");
    const offer: Offer = { ...input, issuedAt, expiresAt: issuedAt + 60_000, used: false, revokedAt: null };
    this.offers.set(offer.id, offer);
    return { ...offer };
  }

  revokeOffer(offerId: string): void {
    const offer = this.offers.get(offerId);
    if (offer) offer.revokedAt = this.clock.now();
  }

  /** Test stand-in for a server-owned, same-revision document observation. */
  refreshServerSnapshot(offerId: string): void {
    const offer = this.offers.get(offerId);
    if (!offer || offer.used || this.document.revision !== offer.documentRevision) return;
    offer.snapshotAt = this.clock.now();
  }

  recordResourceWork(id: string, units: number): void {
    if (!Number.isFinite(units) || units < 0) throw new Error("resource units must be a finite non-negative number");
    this.resourceWork.push({ id, units });
  }

  request(request: Request): Outcome {
    const existing = this.idempotency.get(request.idempotencyKey);
    const requestFingerprint = fingerprint(request);
    if (existing && this.clock.now() - existing.createdAt < 86_400_000) {
      if (existing.fingerprint !== requestFingerprint) return { kind: "denied", reason: "idempotency_conflict" };
      if (existing.outcome.kind === "outcome_unknown") return { kind: "denied", reason: "idempotency_reserved_unknown" };
      if (existing.outcome.kind === "committed" || existing.outcome.kind === "replayed") {
        return { kind: "replayed", effectId: existing.outcome.effectId, markerId: existing.outcome.markerId,
          revision: existing.outcome.revision, idempotencyReplayed: true };
      }
      return existing.outcome;
    }
    if (existing) this.idempotency.delete(request.idempotencyKey);

    const offer = this.offers.get(request.offerId);
    const denied = (reason: DenialReason): Outcome => ({ kind: "denied", reason });
    if (!offer) return denied("offer_missing");
    if (!validCoordinates(request.coordinates)) return denied("invalid_coordinates");
    if (this.clock.now() >= offer.expiresAt) return denied("grant_expired");
    if (offer.issuedAt - offer.snapshotAt > 1_000 || this.clock.now() - offer.snapshotAt > 1_000) return denied("stale_observation");
    if (offer.revokedAt !== null) return denied("grant_revoked");
    if (offer.used) return denied("grant_used");
    if (
      offer.nonce !== request.nonce || offer.ownerId !== request.ownerId || offer.requesterId !== request.actorId ||
      offer.roomId !== request.roomId || offer.sponsorRevision !== request.sponsorRevision || offer.nodeId !== request.nodeId ||
      offer.documentId !== request.documentId || offer.connectorEpoch !== request.connectorEpoch || offer.operation !== request.operation ||
      offer.coordinates.x !== request.coordinates.x ||
      offer.coordinates.y !== request.coordinates.y
    ) return denied("identity_mismatch");
    if (offer.documentRevision !== request.expectedRevision || this.document.revision !== request.expectedRevision) return denied("stale_revision");
    if ((request.commitDelayMs ?? 0) > 5_000) return denied("native_deadline_exceeded");

    offer.used = true;
    const sequence = ++this.effectSequence;
    const effectId = `effect:${offer.id}:${sequence}`;
    const markerId = `marker:${offer.id}:${sequence}`;
    this.document.markers.push({ id: markerId, color: "blue", coordinates: { ...request.coordinates } });
    this.document.revision += 1;

    if (request.outcome === "unknown") {
      const outcome: Outcome = { kind: "outcome_unknown", reservationId: `reservation:${request.idempotencyKey}` };
      this.idempotency.set(request.idempotencyKey, { fingerprint: requestFingerprint, outcome, createdAt: this.clock.now() });
      return outcome;
    }

    const outcome: Outcome = { kind: "committed", effectId, markerId, revision: this.document.revision, idempotencyReplayed: false };
    this.successfulEffects.push(effectId);
    this.idempotency.set(request.idempotencyKey, { fingerprint: requestFingerprint, outcome, createdAt: this.clock.now() });
    return outcome;
  }

  cancelBeforeCommit(offerId: string, requestedAt: number): { cancelled: boolean; elapsedMs: number } {
    const offer = this.offers.get(offerId);
    if (!offer || offer.used) return { cancelled: false, elapsedMs: this.clock.now() - requestedAt };
    this.revokeOffer(offerId);
    return { cancelled: true, elapsedMs: this.clock.now() - requestedAt };
  }
}
