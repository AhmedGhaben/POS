import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import { SidebarNav } from "./Sidebar";
import { AuthLayout } from "./AuthLayout";

const appearance = vi.hoisted(() => ({ theme: "light" }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => appearance }));
beforeEach(() => { appearance.theme = "light"; });
it.each(["light", "dark"])("uses the authentic proportional wordmark in the %s sidebar", theme => {
  appearance.theme = theme;
  const html = renderToStaticMarkup(<MemoryRouter><SidebarNav /></MemoryRouter>);
  expect(html.match(/alt="STORBIT"/g)).toHaveLength(1);
  expect(html).toContain(theme === "dark" ? "/brand/storbit-logo-light.png" : "/brand/storbit-logo-original.png");
  expect(html).toContain('width="2172" height="724"');
  expect(html).toContain("max-w-full");
  expect(html).not.toContain(">POS</div>");
  expect(html).toContain('href="/pos"');
});
it.each(["light", "dark"])("replaces the legacy reference asset on recovery/invitation pages in %s", theme => {
  appearance.theme = theme;
  const html = renderToStaticMarkup(<AuthLayout title="Existing heading"><input name="existing-form" /></AuthLayout>);
  expect(html).toContain(theme === "dark" ? "/brand/storbit-logo-light.png" : "/brand/storbit-logo-original.png");
  expect(html).not.toContain("storbit-original-reference.png");
  expect(html).toContain('name="existing-form"');
  expect(html).toContain("Existing heading");
});
