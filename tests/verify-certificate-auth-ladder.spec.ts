import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyPhysicsCertificate,
  verifyRoboticsSafetyCertificate,
} from "../tools/verifyCertificate";

describe("certificate authenticity ladder", () => {
  it("keeps low-consequence verification integrity-only by default", () => {
    const result = verifyRoboticsSafetyCertificate({
      mode: "robotics-safety-v1",
      checks: [
        { id: "collision.margin", pass: true, value: 0.1, limit: ">= 0.05", severity: "HARD" },
      ],
      certificateHash: "0b35fe1487d6d369b7abb3b46409951d294d174d31e396502a3e4ee011d5196b",
    });

    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.consequence).toBe("low");
    expect(result.authenticity.enforced).toBe(false);
    expect(result.authenticity.ok).toBe(true);
  });

  it("enforces authenticity for high-consequence verification", () => {
    const result = verifyRoboticsSafetyCertificate(
      {
        mode: "robotics-safety-v1",
        checks: [
          { id: "collision.margin", pass: true, value: 0.1, limit: ">= 0.05", severity: "HARD" },
        ],
        certificateHash: "0b35fe1487d6d369b7abb3b46409951d294d174d31e396502a3e4ee011d5196b",
      },
      {
        authenticityConsequence: "high",
      },
    );

    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.consequence).toBe("high");
    expect(result.authenticity.enforced).toBe(true);
    expect(result.authenticity.ok).toBe(false);
    expect(result.authenticity.reasonCodes).toContain("signature_missing");
  });

  it("allows medium consequence to stay non-enforced unless required", () => {
    const cert = {
      header: {
        id: "c1",
        kind: "warp-viability" as const,
        issuedAt: new Date(0).toISOString(),
        issuer: "test",
      },
      payload: { a: 1 },
      payloadHash: "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
    };
    const result = verifyPhysicsCertificate(cert, { authenticityConsequence: "medium" });

    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.consequence).toBe("medium");
    expect(result.authenticity.enforced).toBe(false);
    expect(result.authenticity.ok).toBe(true);
  });

  it("does not accept a signature string and signer ID without a trusted public key", () => {
    const cert = {
      header: { id: "c2", kind: "warp-viability" as const, issuedAt: "2026-10-17T00:00:00.000Z", issuer: "test", signer: { keyId: "signer-1" } },
      payload: { a: 1 },
      payloadHash: crypto.createHash("sha256").update('{"a":1}').digest("hex"),
      signature: "sig:stub",
    };
    const result = verifyPhysicsCertificate(cert, {
      authenticityConsequence: "high",
      trustedSignerKeyIds: ["signer-1"],
    });
    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.signaturePresent).toBe(true);
    expect(result.authenticity.signatureValid).toBe(false);
    expect(result.authenticity.signerTrusted).toBe(false);
    expect(result.authenticity.reasonCodes).toContain("signer_public_key_missing");
    expect(result.overallOk).toBe(false);
  });

  it("verifies an Ed25519 signature over the certificate data and rejects alteration", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const { publicKey: otherPublicKey } = crypto.generateKeyPairSync("ed25519");
    const header = { id: "c3", kind: "warp-viability" as const, issuedAt: "2026-10-17T00:00:00.000Z", issuer: "test", signer: { keyId: "signer-1" } };
    const payload = { a: 1 };
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const certificateData = { header, payload, payloadHash };
    const signature = crypto.sign(null, Buffer.from(JSON.stringify(certificateData)), privateKey).toString("base64");
    const certificateHash = crypto.createHash("sha256").update(JSON.stringify(certificateData)).digest("hex");
    const cert = { ...certificateData, certificateHash, signature };
    const profile = {
      authenticityConsequence: "high" as const,
      trustedSignerKeyIds: ["signer-1"],
      trustedSignerPublicKeys: { "signer-1": publicKey.export({ type: "spki", format: "pem" }).toString() },
    };

    const valid = verifyPhysicsCertificate(cert, profile);
    expect(valid.integrity.ok).toBe(true);
    expect(valid.authenticity.signatureValid).toBe(true);
    expect(valid.authenticity.signerTrusted).toBe(true);
    expect(valid.overallOk).toBe(true);

    const wrongKey = verifyPhysicsCertificate(cert, {
      ...profile,
      trustedSignerPublicKeys: { "signer-1": otherPublicKey.export({ type: "spki", format: "pem" }).toString() },
    });
    expect(wrongKey.authenticity.signatureValid).toBe(false);
    expect(wrongKey.authenticity.reasonCodes).toContain("signature_invalid");
    expect(wrongKey.overallOk).toBe(false);

    const malformed = verifyPhysicsCertificate({ ...cert, signature: "sig:stub" }, profile);
    expect(malformed.authenticity.signatureValid).toBe(false);
    expect(malformed.authenticity.reasonCodes).toContain("signature_invalid");
    expect(malformed.overallOk).toBe(false);

    expect(verifyPhysicsCertificate({ ...cert, signature: ` ${signature}` }, profile).authenticity.signatureValid).toBe(false);

    const altered = verifyPhysicsCertificate({ ...cert, header: { ...header, issuer: "altered" } }, profile);
    expect(altered.integrity.ok).toBe(false);
    expect(altered.authenticity.signatureValid).toBe(false);
    expect(altered.overallOk).toBe(false);
  });
});
