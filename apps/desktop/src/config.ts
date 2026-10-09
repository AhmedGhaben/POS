import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Per-computer settings, kept in the app's data folder (never synced). */
const configSchema = z.object({
  /** API base URL, e.g. http://localhost:4000 or https://pos.example.com/api */
  serverUrl: z.string().url().optional(),
});

export type DesktopConfig = z.infer<typeof configSchema>;

let cached: DesktopConfig | null = null;

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

export function getConfig(): DesktopConfig {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    const parsed = configSchema.safeParse(raw);
    cached = parsed.success ? parsed.data : {};
  } catch {
    cached = {};
  }
  return cached;
}

export function updateConfig(patch: Partial<DesktopConfig>): DesktopConfig {
  const next = configSchema.parse({ ...getConfig(), ...patch });
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  // Write-then-rename so a crash mid-write can't leave a half-written file.
  const tmp = `${configPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, configPath());
  cached = next;
  return next;
}

/** Normalizes what the user typed into an API base URL without a trailing slash. */
export function normalizeServerUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server address must start with http:// or https://");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}
