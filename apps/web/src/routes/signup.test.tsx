import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SignupPage } from "./signup";
import { signupSchema, registrationValues } from "./signup-schema";

const appearance = vi.hoisted(() => ({ theme: "light", preference: "system", setPreference: vi.fn() }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => appearance }));

const values = { firstName: " Ana ", lastName: "Silva", businessName: "Shop", storeName: "Main", email: " ana@example.com ", password: "password123", confirmPassword: "password123" };

describe("signup validation contract", () => {
  it("trims existing fields and excludes confirmation from the API payload", () => {
    expect(registrationValues(signupSchema.parse(values))).toEqual({ firstName: "Ana", lastName: "Silva", businessName: "Shop", storeName: "Main", email: "ana@example.com", password: "password123" });
  });
  it("targets confirmation when passwords differ", () => {
    const result = signupSchema.safeParse({ ...values, confirmPassword: "different" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["confirmPassword"], message: "auth:reset.mismatch" }));
  });
  it.each([
    ["firstName", " "], ["lastName", ""], ["businessName", ""], ["storeName", ""],
    ["email", "invalid"], ["password", "short"], ["firstName", "x".repeat(51)],
    ["businessName", "x".repeat(101)], ["storeName", "x".repeat(101)],
  ])("preserves validation for %s", (key, value) => {
    expect(signupSchema.safeParse({ ...values, [key]: value }).success).toBe(false);
  });
});

describe("approved signup presentation", () => {
  beforeEach(() => { appearance.theme = "light"; });
  it.each(["en", "pt-PT", "pt-BR", "pt-AO"])("renders the real form and localized controls in %s", async (language) => {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><SignupPage /></MemoryRouter></QueryClientProvider>);
    expect(html.match(/<input\b/g)).toHaveLength(7);
    expect(html.match(/type="password"/g)).toHaveLength(2);
    expect(html.match(/alt="STORBIT"/g)).toHaveLength(1);
    expect(html).toContain('/brand/storbit-logo-original.png');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain(i18n.t("signup.headline", { ns: "auth" }));
    expect(html).toContain(i18n.t("appearance.label", { ns: "auth" }));
    expect(html).not.toContain("<select");
    expect(html).toContain(">EN</button>");
    expect(html).toContain(">PT</button>");
    for (const key of ["description", "headline", "brandDescription", "benefits.fast.title", "benefits.stores.title", "benefits.stores.description", "benefits.unified.title"] as const) {
      expect(i18n.t(`signup.${key}` as const, { ns: "auth" })).not.toMatch(/[?\uFFFD]/);
    }
    appearance.theme = "dark";
    const dark = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><SignupPage /></MemoryRouter></QueryClientProvider>);
    expect(dark).toContain('/brand/storbit-logo-light.png');
  });
});
