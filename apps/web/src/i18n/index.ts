import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * Languages the app ships with. Adding one: add its folder under
 * src/locales with the same files as `en`, and an entry here.
 * See docs/plans/I18N.md.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "pt-BR", label: "Português (Brasil)" },
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LANGUAGE: Language = "en";

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
  if (lower.startsWith("pt")) return "pt-PT";
  if (lower.startsWith("en")) return "en";
  return null;
}

/** Before anyone signs in: this device's last choice, then the computer's language, then English. */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // storage blocked: fall through
  }
  const tags = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  for (const tag of tags) {
    const match = matchLanguage(tag);
    if (match) return match;
  }
  return DEFAULT_LANGUAGE;
}

// Every locales/<language>/<area>.json, bundled so the app works offline.
const files = import.meta.glob<{ default: Record<string, unknown> }>("../locales/*/*.json", { eager: true });
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(files)) {
  const [, lang, ns] = path.match(/locales\/([^/]+)\/([^/]+)\.json$/)!;
  (resources[lang] ??= {})[ns] = mod.default;
}
export const NAMESPACES = Object.keys(resources[DEFAULT_LANGUAGE]);

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
