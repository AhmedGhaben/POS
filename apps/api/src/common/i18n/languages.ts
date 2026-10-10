/** Languages the app ships with; matches apps/web/src/i18n. See docs/plans/I18N.md. */
export const SUPPORTED_LANGUAGES = ["en", "pt-PT", "pt-BR"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
