import { existsSync, readFileSync } from "fs";
import { Logger } from "@nestjs/common";
import { JwsSigner } from "./jws";

/** Homologation (AGT's test environment); production is https://sifp.minfin.gov.ao/sigt/fe/v1. */
export const AGT_HOMOLOGATION_URL = "https://sifphml.minfin.gov.ao/sigt/fe/v1";

/** Documents that go to AGT (proformas don't). */
export const AGT_DOCUMENT_TYPES = ["FT", "FR", "NC", "ND", "RC"];

export interface AgtConfig {
  enabled: boolean;
  baseUrl: string;
  /** HTTP Basic credentials AGT issues to the software producer. */
  user: string;
  password: string;
  softwareSigner: JwsSigner | null;
  documentSigner: JwsSigner | null;
  productId: string;
  productVersion: string;
  softwareValidationNumber: string;
  signatureVersion: number;
  /** How often the queue runs; 0 = only when called (tests). */
  intervalMs: number;
}

const truthy = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";

function pem(env: NodeJS.ProcessEnv, name: string): string | null {
  if (env[name]) return env[name]!.replace(/\\n/g, "\n");
  const file = env[`${name}_FILE`];
  return file && existsSync(file) ? readFileSync(file, "utf8") : null;
}

/**
 * Feature flag and secrets from the environment only (never the database or
 * the repo): AGT_EINVOICE_ENABLED, AGT_EINVOICE_URL, AGT_EINVOICE_USER,
 * AGT_EINVOICE_PASSWORD, AGT_SOFTWARE_KEY(_FILE) for the producer's
 * signature, AGT_DOCUMENT_KEY(_FILE) for documents (default: the same key).
 * Switched on without its keys or credentials, it stays off and says why.
 */
export function agtConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AgtConfig {
  const log = new Logger("AgtConfig");
  const softwarePem = pem(env, "AGT_SOFTWARE_KEY");
  const documentPem = pem(env, "AGT_DOCUMENT_KEY") ?? softwarePem;
  let enabled = truthy(env.AGT_EINVOICE_ENABLED);
  let softwareSigner: JwsSigner | null = null;
  let documentSigner: JwsSigner | null = null;
  if (enabled) {
    try {
      softwareSigner = softwarePem ? new JwsSigner(softwarePem) : null;
      documentSigner = documentPem ? new JwsSigner(documentPem) : null;
    } catch (error) {
      log.error(`AGT e-invoicing stays off: ${(error as Error).message}`);
    }
    if (!softwareSigner || !documentSigner || !env.AGT_EINVOICE_USER || !env.AGT_EINVOICE_PASSWORD) {
      log.error("AGT e-invoicing stays off: AGT_SOFTWARE_KEY(_FILE), AGT_EINVOICE_USER and AGT_EINVOICE_PASSWORD are needed");
      enabled = false;
    }
  }
  return {
    enabled,
    baseUrl: (env.AGT_EINVOICE_URL || AGT_HOMOLOGATION_URL).replace(/\/+$/, ""),
    user: env.AGT_EINVOICE_USER ?? "",
    password: env.AGT_EINVOICE_PASSWORD ?? "",
    softwareSigner,
    documentSigner,
    productId: env.AGT_PRODUCT_ID || env.SAFT_PRODUCT_ID || "POS/POS",
    productVersion: env.SAFT_PRODUCT_VERSION || "0.2.4",
    softwareValidationNumber: env.AGT_SOFTWARE_CERTIFICATE || "0",
    signatureVersion: Number(env.AGT_SIGNATURE_VERSION || 1),
    intervalMs: env.AGT_QUEUE_INTERVAL_MS !== undefined ? Number(env.AGT_QUEUE_INTERVAL_MS) : 15_000,
  };
}

/** Is the e-invoicing flag on (without loading keys)? Documents are queued only then. */
export function agtFlagOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env.AGT_EINVOICE_ENABLED);
}
