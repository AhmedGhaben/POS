/** One choice in a <Combobox>: a readable name first; codes, rates etc. as secondary text. */
export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text under or beside the name, e.g. "M10" or "14%". Searchable. */
  description?: string;
  /** Extra words that should find this option (not shown). */
  keywords?: string[];
  disabled?: boolean;
}

/** Lower case, no accents, no outer spaces: "Crédito " and "credito" compare equal. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * The options matching what was typed: every word typed must appear in the
 * name, the secondary text or the keywords. Names that start with the text
 * come first; otherwise the original order is kept.
 */
export function filterOptions<T extends ComboboxOption>(options: T[], query: string): T[] {
  const q = normalizeSearch(query);
  if (!q) return options;
  const words = q.split(/\s+/);
  const scored: { option: T; index: number; starts: boolean }[] = [];
  options.forEach((option, index) => {
    const label = normalizeSearch(option.label);
    const haystack = [label, normalizeSearch(option.description ?? ""), ...(option.keywords ?? []).map(normalizeSearch)].join(" ");
    if (words.every((w) => haystack.includes(w))) scored.push({ option, index, starts: label.startsWith(q) });
  });
  return scored.sort((a, b) => Number(b.starts) - Number(a.starts) || a.index - b.index).map((s) => s.option);
}
