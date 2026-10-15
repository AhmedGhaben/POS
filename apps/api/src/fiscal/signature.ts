import { createHash, createPrivateKey, createPublicKey, createSign, createVerify, generateKeyPairSync, type KeyObject } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Logger } from "@nestjs/common";

/**
 * Signs the hash chain of fiscal documents (docs/plans/ANGOLA.md, additions
 * decision 1): RSA + SHA-1, 1024-bit key, Base64. Behind an interface so a
 * detail can change during certification without touching the documents.
 * Separate from the e-invoicing (phase 9) JWS signatures.
 */
export interface SignatureProvider {
  /** The private key's version: the HashControl once the software is certified. */
  readonly keyVersion: string;
  sign(message: string): string;
  verify(message: string, signature: string): boolean;
}

export const SIGNATURE_PROVIDER = Symbol("SIGNATURE_PROVIDER");

export class RsaSha1Signer implements SignatureProvider {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(privateKeyPem: string, readonly keyVersion = "1") {
    this.privateKey = createPrivateKey(privateKeyPem);
    this.publicKey = createPublicKey(this.privateKey);
  }

  sign(message: string): string {
    return createSign("RSA-SHA1").update(message, "utf8").sign(this.privateKey, "base64");
  }

  verify(message: string, signature: string): boolean {
    return createVerify("RSA-SHA1").update(message, "utf8").verify(this.publicKey, signature, "base64");
  }

  /** SHA-256 of the public key, to tell keys apart in logs (never the key itself). */
  fingerprint(): string {
    return createHash("sha256").update(this.publicKey.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
  }
}

export interface HashFields {
  /** YYYY-MM-DD */
  invoiceDate: string;
  /** YYYY-MM-DDThh:mm:ss */
  systemEntryDate: string;
  /** e.g. "FR POS001-2026/57" */
  documentNo: string;
  /** Two decimals with a dot, e.g. "1250.00". */
  grossTotal: string;
  /** The hash of the previous document in the series; empty for the first. */
  previousHash: string;
}

/** InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;previous hash */
export function hashMessage(f: HashFields): string {
  return `${f.invoiceDate};${f.systemEntryDate};${f.documentNo};${f.grossTotal};${f.previousHash}`;
}

/** Characters 1, 11, 21 and 31 of the hash, printed before the certification line. */
export function hashExcerpt(hash: string): string {
  return [0, 10, 20, 30].map((i) => hash.charAt(i)).join("");
}

/** The key the tests sign with (and test vectors are made with). Never valid in production. */
export const TEST_KEY_FILE = join(__dirname, "testing", "test-key.pem");

/**
 * The signer from the environment: SAFT_PRIVATE_KEY (PEM, "\n" escapes
 * allowed) or SAFT_PRIVATE_KEY_FILE, with SAFT_KEY_VERSION. The key lives
 * in secrets, never in the repo. Tests use the test key. Without a key the
 * documents are signed with a temporary one (fine while the software isn't
 * certified: HashControl is "0"); once AGT_SOFTWARE_CERTIFICATE is set the
 * API refuses to start without the real key.
 */
export function signerFromEnv(env: NodeJS.ProcessEnv = process.env, logger = new Logger("Signature")): SignatureProvider {
  const version = env.SAFT_KEY_VERSION || "1";
  const pem = env.SAFT_PRIVATE_KEY?.replace(/\\n/g, "\n") || (env.SAFT_PRIVATE_KEY_FILE ? readFileSync(env.SAFT_PRIVATE_KEY_FILE, "utf8") : "");
  if (pem) {
    const signer = new RsaSha1Signer(pem, version);
    if (env.NODE_ENV === "production" && existsSync(TEST_KEY_FILE) && signer.fingerprint() === new RsaSha1Signer(readFileSync(TEST_KEY_FILE, "utf8")).fingerprint()) {
      throw new Error("SAFT_PRIVATE_KEY is the test key; use the real signing key in production");
    }
    logger.log(`Signing fiscal documents with key ${signer.fingerprint()} (version ${version})`);
    return signer;
  }
  if (env.AGT_SOFTWARE_CERTIFICATE) {
    throw new Error("SAFT_PRIVATE_KEY (or SAFT_PRIVATE_KEY_FILE) is required once AGT_SOFTWARE_CERTIFICATE is set");
  }
  if (env.NODE_ENV === "test") return new RsaSha1Signer(readFileSync(TEST_KEY_FILE, "utf8"), version);
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  logger.warn("No SAFT_PRIVATE_KEY set: signing fiscal documents with a temporary key (not certified, HashControl 0)");
  return new RsaSha1Signer(privateKey, version);
}
