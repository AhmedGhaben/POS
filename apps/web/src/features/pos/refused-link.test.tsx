import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "@/i18n";
import type { OutboxEntry } from "@/lib/offline-db";
import { RefusedList } from "./components/RefusedEntries";
import { REFUSED_ANCHOR, highlightTarget, refusedEntriesPath, scrollBehavior } from "./refused-link";

const entry = (clientId: string, lastError: string): OutboxEntry =>
  ({
    clientId,
    kind: "sale",
    state: "failed",
    attempts: 1,
    createdAt: "2026-11-17T10:00:00.000Z",
    lastError,
    payload: {},
  }) as unknown as OutboxEntry;

describe("sync-error deep link", () => {
  it("goes to This device, at the refused sales", () => {
    expect(refusedEntriesPath()).toBe(`/device#${REFUSED_ANCHOR}`);
    expect(refusedEntriesPath("a b")).toBe(`/device?entry=a%20b#${REFUSED_ANCHOR}`);
  });

  it("outlines the entry the link names, or the oldest refused one", () => {
    const list = [entry("old", "x"), entry("new", "y")];
    expect(highlightTarget(list, "new")).toBe("new");
    expect(highlightTarget(list, null)).toBe("old");
    // Already retried and gone: the oldest still refused.
    expect(highlightTarget(list, "gone")).toBe("old");
    expect(highlightTarget([], "new")).toBeNull();
  });

  it("scrolls without animation for people who ask for reduced motion", () => {
    expect(scrollBehavior(true)).toBe("auto");
    expect(scrollBehavior(false)).toBe("smooth");
  });
});

describe("RefusedList", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });
  const list = [entry("e1", "Shift not found"), entry("e2", "Product archived")];

  it("lists every refused entry, each focusable and named for screen readers", () => {
    const html = renderToStaticMarkup(<RefusedList entries={list} highlightedId={null} onRetry={() => {}} />);
    expect(html).toContain(`id="${REFUSED_ANCHOR}"`);
    expect(html).toContain("(2)");
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(html).toContain('data-outbox-entry="e1"');
    expect(html).toContain('data-outbox-entry="e2"');
    expect(html).toMatch(/aria-label="Refused sale from [^"]+: Shift not found"/);
    expect(html).not.toContain("data-highlighted");
  });

  it("outlines only the highlighted entry, subtly, with no motion when reduced", () => {
    const html = renderToStaticMarkup(<RefusedList entries={list} highlightedId="e2" onRetry={() => {}} />);
    const e1 = html.slice(html.indexOf('data-outbox-entry="e1"'), html.indexOf('data-outbox-entry="e2"'));
    const e2 = html.slice(html.indexOf('data-outbox-entry="e2"'));
    expect(e2).toContain('data-highlighted="true"');
    expect(e2).toContain('aria-current="true"');
    expect(e2).toContain("outline-destructive/70");
    expect(e1).not.toContain("outline-destructive/70");
    // The fade is motion-safe only.
    expect(html).toContain("motion-safe:transition-[outline-color]");
  });

  it("has a Retry per entry and nothing that retries, deletes or changes an entry by itself", () => {
    const html = renderToStaticMarkup(<RefusedList entries={list} highlightedId="e1" onRetry={() => {}} />);
    // The only actions are the two Retry buttons the person presses.
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/>Retry<\/button>/g)).toHaveLength(2);
  });
});
