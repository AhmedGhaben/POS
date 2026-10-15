import { createPrivateKey, createPublicKey, createSign, createVerify, type KeyObject } from "crypto";

/**
 * JWS for AGT e-invoicing (docs/plans/ANGOLA.md, phase 9; AGT "Estrutura das
 * Assinaturas Digitais"): RS256, header {"alg":"RS256","typ":"JWT"}, compact
 * serialisation, Base64URL without padding, over the whole JSON object in
 * canonical form (no spaces or line breaks; keys in the order given).
 * Separate from the SAF-T hash chain (RSA-SHA1, fiscal/signature.ts).
 */

const HEADER = { alg: "RS256", typ: "JWT" };

export function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** JSON without whitespace; numbers as JavaScript writes them (no extra formatting). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

export class JwsSigner {
  private readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;

  constructor(privateKeyPem: string) {
    this.privateKey = createPrivateKey(privateKeyPem);
    const bits = this.privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
    // AGT: RSA keys from 2048 bits.
    if (bits < 2048) throw new Error(`AGT signing keys need at least 2048 bits (this one has ${bits})`);
    this.publicKey = createPublicKey(this.privateKey);
  }

  /** header.payload.signature */
  sign(payload: object): string {
    const signingInput = `${base64url(canonicalJson(HEADER))}.${base64url(canonicalJson(payload))}`;
    const signature = createSign("RSA-SHA256").update(signingInput).sign(this.privateKey);
    return `${signingInput}.${base64url(signature)}`;
  }
}

/** Checks a compact JWS and returns its payload, or null (tests, and a fake AGT). */
export function verifyJws(token: string, publicKey: KeyObject): unknown {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const ok = createVerify("RSA-SHA256").update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  return ok ? JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) : null;
}
