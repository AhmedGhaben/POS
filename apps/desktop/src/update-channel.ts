/**
 * Which releases a computer installs (This device -> Update channel).
 * Releases are published as pre-releases first; Stable (the default, for
 * shops) only takes full releases, Beta takes pre-releases too.
 */
export type UpdateChannel = "stable" | "beta";

export function allowsPrerelease(channel: UpdateChannel | undefined): boolean {
  return channel === "beta";
}
