import { createHash, randomBytes } from "crypto";

/** 32 random bytes, hex-encoded — used for refresh, reset, invite and verification tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

/** Only this hash is stored; the raw token lives in the cookie or email link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
