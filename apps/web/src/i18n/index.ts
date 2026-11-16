import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { aoSpellingTree } from "./ao-spelling";
import { PT_AO_OVERRIDES, withOverrides } from "./pt-ao-overrides";

/**
 * Languages the app ships with, in the order the language picker shows
 * them, each named in its own language. Adding one: add its folder under
 * src/locales with the same files as `en`, and an entry here.
 * See docs/plans/I18N.md.
 */
export const LANGUAGES = [
  // Made from pt-PT with the Angolan spelling (Factura, actual…): no files of its own.
  { code: "pt-AO", label: "Português (Angola)" },
  { code: "en", label: "English" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "pt-BR", label: "Português (Brasil)" },
] as const;

/** Languages made from another one rather than shipped as files. */
export const DERIVED_LANGUAGES: Partial<Record<Language, Language>> = { "pt-AO": "pt-PT" };
export type Language = (typeof LANGUAGES)[number]["code"];
/** Fallback for missing translations and unknown document languages (unchanged). */
export const DEFAULT_LANGUAGE: Language = "en";
/** What the screens open in on a first run, whatever the computer's language. */
export const FIRST_RUN_LANGUAGE: Language = "pt-AO";

const STORAGE_KEY = "pos-language";

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

/** Maps a browser language tag to one we ship: pt-BR → Brazilian, any other pt → European. */
export function matchLanguage(tag: string | undefined | null): Language | null {
  if (!tag) return null;
  if (isLanguage(tag)) return tag;
  const lower = tag.toLowerCase();
  if (lower === "pt-br") return "pt-BR";
  if (lower === "pt-ao") return "pt-AO";
  if (lower.startsWith("pt")) return "pt-PT";
  if (lower.startsWith("en")) return "en";
  return null;
}

/**
 * Before anyone signs in: this device's last choice, otherwise Angolan
 * Portuguese (first run). A signed-in person's saved language still wins
 * (useLanguageSync).
 */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // storage blocked: fall through
  }
  return FIRST_RUN_LANGUAGE;
}

// Every locales/<language>/<area>.json, bundled so the app works offline.
const files = import.meta.glob<{ default: Record<string, unknown> }>("../locales/*/*.json", { eager: true });
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(files)) {
  const [, lang, ns] = path.match(/locales\/([^/]+)\/([^/]+)\.json$/)!;
  (resources[lang] ??= {})[ns] = mod.default;
}
export const NAMESPACES = Object.keys(resources[DEFAULT_LANGUAGE]);
resources["pt-AO"] = withOverrides(aoSpellingTree(resources["pt-PT"]), PT_AO_OVERRIDES);

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGES.map((l) => l.code),
  ns: NAMESPACES,
  defaultNS: "common",
  interpolation: { escapeValue: false }, // React escapes already
  returnNull: false,
});
syncDocumentLanguage(i18n.language);

function syncDocumentLanguage(lang: string) {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** Switches the screens to `lang` and remembers it on this device. */
export function applyLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not remembered on this device; the server copy still is
  }
  syncDocumentLanguage(lang);
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

/** The language the screens are in, for Intl formatting and the X-Language header. */
export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

export default i18n;
