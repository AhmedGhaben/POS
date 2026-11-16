import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import { LoginPage } from "./login";

const theme = vi.hoisted(() => ({ theme: "light" }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => theme }));

describe("approved login presentation", () => {
  beforeEach(async () => {
    theme.theme = "light";
    await i18n.changeLanguage("en");
  });

  function render() {
    return renderToStaticMarkup(<MemoryRouter><LoginPage /></MemoryRouter>);
  }

  it("keeps the real form, validation, recovery and registration routes", () => {
    const html = render();
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    const email = inputs.find((input) => /\bid="email"/.test(input));
    const password = inputs.find((input) => /\bid="password"/.test(input));
    expect(email).toBeDefined();
    expect(password).toBeDefined();
    expect(email).toContain('type="email"');
    expect(email).toContain('autoComplete="username"');
    expect(email).toContain('required=""');
    expect(password).toContain('type="password"');
    expect(password).toContain('autoComplete="current-password"');
    expect(password).toContain('required=""');
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain('href="/signup"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('type="password"');
    const toggle = (html.match(/<button\b[^>]*>/g) ?? []).find((button) =>
      button.includes('aria-label="Show password"'),
    );
    expect(toggle).toBeDefined();
    expect(toggle).toContain('type="button"');
    expect(toggle).toContain('aria-pressed="false"');
  });

  it("renders exactly one original logo and one compact EN/PT language group", () => {
    const html = render();
    expect(html.match(/alt="STORBIT"/g)).toHaveLength(1);
    expect(html).toContain('/brand/storbit-logo-original.png');
    expect(html.match(/role="group"/g)).toHaveLength(1);
    expect(html).not.toContain("<select");
    expect(html).toContain(">EN</button>");
    expect(html).toContain(">PT</button>");
  });

  it("uses the original light logo in the existing dark theme", () => {
    theme.theme = "dark";
    expect(render()).toContain('/brand/storbit-logo-light.png');
    expect(render()).not.toContain('/brand/storbit-logo-original.png');
  });

  it("preserves the approved English copy and explicit synthetic-data label", () => {
    const html = render();
    for (const text of ["From the counter to the bigger picture.", "Sales, inventory and store operations. Together in one clear workspace.", "Welcome back.", "Sign in to access your STORBIT Workspace.", "SAMPLE DATA"]) expect(html).toContain(text);
    // Existing sessions always persist; do not add a checkbox pretending to change that policy.
    expect(html).not.toContain('type="checkbox"');
  });

  it.each(["pt-PT", "pt-BR", "pt-AO"])("translates the introduction and accessible controls in %s", async (language) => {
    await i18n.changeLanguage(language);
    const html = render();
    expect(html).toContain(i18n.t("login.headline", { ns: "auth" }));
    expect(html).toContain(i18n.t("login.title", { ns: "auth" }));
    expect(html).not.toContain('aria-label="Show password"');
    expect(html).toContain("SAMPLE DATA");
    expect(i18n.t("login.headline", { ns: "auth" })).toBe("Do balcão à visão global.");
    expect(html).not.toContain("\uFFFD");
    for (const key of ["description", "headline", "brandDescription", "workspace", "tagline", "portugueseVariant", "preview.overview", "preview.store", "preview.transactions", "preview.review", "preview.performance", "preview.period", "preview.chart", "preview.latest"] as const) {
      expect(i18n.t(`login.${key}`, { ns: "auth" })).not.toContain("?");
    }
  });
});
