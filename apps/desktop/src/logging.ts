import log from "electron-log/main";

/**
 * Rotating log in the app's data folder (logs/main.log, 5 MB, previous file
 * kept as main.old.log). Every line passes through `scrub` first, so tokens,
 * passwords and card numbers never reach disk whatever the caller logged.
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]"],
  [
    /("?(?:password|accessToken|refreshToken|refresh_token|token|authorization|cookie)"?\s*[:=]\s*)("[^"]*"|[^\s,;}&]+)/gi,
    "$1[redacted]",
  ],
];

/** Luhn check, so barcodes and timestamps aren't mistaken for card numbers. */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function scrub(text: string): string {
  const out = SECRET_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
  return out.replace(/\b\d(?:[ -]?\d){14,18}\b/g, (m) => (luhn(m.replace(/\D/g, "")) ? "[card]" : m));
}

export function initLogging() {
  log.initialize();
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.hooks.push((message) => {
    message.data = message.data.map((part) => (typeof part === "string" ? scrub(part) : part));
    return message;
  });
}

export function logFilePath(): string {
  return log.transports.file.getFile().path;
}

export { log };
