import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyRoboticsSafetyCertificate,
  verifyRoboticsSafetyCertificateIntegrity,
} from "../tools/verifyCertificate";

describe("robotics safety certificate integrity", () => {
  it("validates certificate hash for robotics safety payload", () => {
    const cert = {
      mode: "robotics-safety-v1" as const,
      checks: [
        { id: "collision.margin", pass: true, value: 0.1, limit: ">= 0.05", severity: "HARD" as const },
      ],
      certificateHash: "0b35fe1487d6d369b7abb3b46409951d294d174d31e396502a3e4ee011d5196b",
    };
    expect(verifyRoboticsSafetyCertificateIntegrity(cert)).toBe(true);
  });

  it("reports integrity and authenticity independently for non-hardened profile", () => {
    const cert = {
      mode: "robotics-safety-v1" as const,
      checks: [
        { id: "collision.margin", pass: true, value: 0.1, limit: ">= 0.05", severity: "HARD" as const },
      ],
      certificateHash: "0b35fe1487d6d369b7abb3b46409951d294d174d31e396502a3e4ee011d5196b",
    };

    const result = verifyRoboticsSafetyCertificate(cert);
    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.ok).toBe(true);
    expect(result.authenticity.enforced).toBe(false);
    expect(result.authenticity.signaturePresent).toBe(false);
    expect(result.authenticity.reasonCodes).toContain("signature_missing");
  });

  it("fails closed in hardened profile when signature is missing", () => {
    const cert = {
      mode: "robotics-safety-v1" as const,
      checks: [
        { id: "collision.margin", pass: true, value: 0.1, limit: ">= 0.05", severity: "HARD" as const },
      ],
      certificateHash: "0b35fe1487d6d369b7abb3b46409951d294d174d31e396502a3e4ee011d5196b",
      signer: { keyId: "robotics-prod-signer" },
    };

    const result = verifyRoboticsSafetyCertificate(cert, {
      hardened: true,
      trustedSignerKeyIds: ["robotics-prod-signer"],
    });
    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.ok).toBe(false);
    expect(result.authenticity.enforced).toBe(true);
    expect(result.authenticity.reasonCodes).toContain("signature_missing");
    expect(result.overallOk).toBe(false);
  });

  it("fails closed in hardened profile when signer key id is untrusted", () => {
    const cert = {
      mode: "robotics-safety-v1" as const,
      checks: [
        { id: "collision.margin", pass: true, value: 0.1, limit: ">= 0.05", severity: "HARD" as const },
      ],
      certificateHash: "0b35fe1487d6d369b7abb3b46409951d294d174d31e396502a3e4ee011d5196b",
      signature: "sig:stub",
      signer: { keyId: "robotics-unknown-signer" },
    };

    const result = verifyRoboticsSafetyCertificate(cert, {
      hardened: true,
      trustedSignerKeyIds: ["robotics-prod-signer"],
    });
    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.ok).toBe(false);
    expect(result.authenticity.signerTrusted).toBe(false);
    expect(result.authenticity.reasonCodes).toContain("signer_key_id_untrusted");
    expect(result.overallOk).toBe(false);
  });

  it("accepts a robotics signature only with the trusted Ed25519 public key", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const checks = [
      { id: "collision.margin", pass: true, value: 0.1, limit: ">= 0.05", severity: "HARD" as const },
    ];
    const payload = { mode: "robotics-safety-v1", checks };
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const signer = { keyId: "robotics-prod-signer" };
    const header = {
      id: "robotics-safety",
      kind: "stress-energy-check",
      issuedAt: new Date(0).toISOString(),
      issuer: "robotics/safety-adapter",
      signer,
    };
    const signature = crypto.sign(null, Buffer.from(JSON.stringify({ header, payload, payloadHash })), privateKey).toString("base64");
    const result = verifyRoboticsSafetyCertificate({
      mode: "robotics-safety-v1",
      checks,
      certificateHash: payloadHash,
      signer,
      signature,
    }, {
      hardened: true,
      trustedSignerKeyIds: [signer.keyId],
      trustedSignerPublicKeys: { [signer.keyId]: publicKey.export({ type: "spki", format: "pem" }).toString() },
    });
    expect(result.integrity.ok).toBe(true);
    expect(result.authenticity.signatureValid).toBe(true);
    expect(result.overallOk).toBe(true);
  });
});
