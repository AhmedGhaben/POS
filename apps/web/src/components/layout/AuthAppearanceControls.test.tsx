import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18n, { applyLanguage, currentLanguage, LANGUAGES } from "@/i18n";
import { AuthAppearanceControls } from "./AuthAppearanceControls";
import { LanguagePicker } from "./LanguagePicker";

const appearance = vi.hoisted(() => ({ theme: "light", toggleTheme: vi.fn() }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => appearance }));
vi.mock("@/i18n/use-language", () => ({ useLanguage: () => [currentLanguage(), applyLanguage] }));
vi.mock("react-i18next", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-i18next")>(),
  useTranslation: (ns: "auth" | "common") => ({ t: (key: string) => i18n.getFixedT(null, ns)(key as never) }),
}));

beforeEach(() => { appearance.theme = "light"; appearance.toggleTheme.mockClear(); applyLanguage("en"); });
afterEach(() => localStorage.removeItem("pos-language"));
function controls() {
  const root = AuthAppearanceControls();
  const [theme, group] = root.props.children as [ReactElement<{ onClick: () => void }>, ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>];
  return { theme, en: group.props.children[0], pt: group.props.children[1] };
}
it("calls the shared direct theme toggle without a dropdown or form submit", () => {
  controls().theme.props.onClick();
  expect(appearance.toggleTheme).toHaveBeenCalledTimes(1);
  const html = renderToStaticMarkup(<AuthAppearanceControls />);
  expect(html).not.toContain("<select");
  expect(html).not.toContain("aria-haspopup");
  expect(html).toContain('type="button"');
  expect(html).toContain('aria-label="Appearance: Dark"');
  appearance.theme = "dark";
  expect(renderToStaticMarkup(<AuthAppearanceControls />)).toContain('aria-label="Appearance: Light"');
});
it("PT selects and persists Angolan Portuguese; EN restores English", () => {
  controls().pt.props.onClick();
  expect(currentLanguage()).toBe("pt-AO");
  expect(localStorage.getItem("pos-language")).toBe("pt-AO");
  expect(renderToStaticMarkup(<AuthAppearanceControls />)).toContain('aria-pressed="true">PT</button>');
  controls().en.props.onClick();
  expect(currentLanguage()).toBe("en");
  expect(localStorage.getItem("pos-language")).toBe("en");
});
it.each(["pt-PT", "pt-BR", "pt-AO"] as const)("preserves existing %s support until the owner selects a segment", (language) => {
  applyLanguage(language);
  renderToStaticMarkup(<AuthAppearanceControls />);
  expect(currentLanguage()).toBe(language);
  expect(LANGUAGES.map(({ code }) => code)).toEqual(["en", "pt-PT", "pt-BR", "pt-AO"]);
  expect(i18n.hasResourceBundle(language, "auth")).toBe(true);
  controls().pt.props.onClick();
  expect(currentLanguage()).toBe("pt-AO");
});
it("keeps all four choices available through the existing in-app language picker", () => {
  const picker = LanguagePicker({});
  expect(picker.props.options.map(({ value }: { value: string }) => value)).toEqual(["en", "pt-PT", "pt-BR", "pt-AO"]);
  picker.props.onChange("pt-BR");
  expect(currentLanguage()).toBe("pt-BR");
  picker.props.onChange("pt-PT");
  expect(currentLanguage()).toBe("pt-PT");
});
