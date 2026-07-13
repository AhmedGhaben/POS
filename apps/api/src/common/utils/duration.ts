const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses simple "<number><unit>" durations (e.g. "30m", "30d") used by the JWT_*_TTL env vars. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}" — expected e.g. "30m" or "7d"`);
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
