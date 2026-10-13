/**
 * Angolan Portuguese keeps the spelling from before the 1990 agreement
 * ("Factura", "actual", "acção", "selecção", "activo"), so the pt-AO
 * texts are the pt-PT ones run through these rules. Same rules in the API
 * (apps/api/src/common/i18n/ao-spelling.ts); a test there keeps them equal.
 *
 * Each rule is a word start (or a whole word) in the 1990 spelling and its
 * older form; the case of the original is kept ("FATURA" → "FACTURA").
 */
const RULES: [from: string, to: string, wholeWord?: true][] = [
  ["fatur", "factur"],
  ["atual", "actual"],
  ["atuais", "actuais", true],
  ["ação", "acção", true],
  ["ações", "acções", true],
  ["seleç", "selecç"],
  ["selecion", "seleccion"],
  ["receção", "recepção", true],
  ["rececion", "recepcion"],
  ["direç", "direcç"],
  ["diret", "direct"],
  ["exat", "exact"],
  ["coleç", "colecç"],
  ["correç", "correcç"],
  ["proteç", "protecç"],
  ["inspeç", "inspecç"],
  ["ativ", "activ"],
  ["desativ", "desactiv"],
  ["inativ", "inactiv"],
  ["reativ", "reactiv"],
  ["objetiv", "objectiv"],
  ["efetu", "efectu"],
  ["efetiv", "efectiv"],
  ["ótim", "óptim"],
  ["adot", "adopt"],
  ["setor", "sector"],
  ["eletr", "electr"],
  ["projet", "project"],
  ["detet", "detect"],
];

function keepCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

const COMPILED = RULES.map(([from, to, whole]) => ({
  re: new RegExp(`(?<!\\p{L})${from}${whole ? "(?!\\p{L})" : ""}`, "giu"),
  to,
}));

/** pt-PT text in Angolan spelling. */
export function aoSpelling(text: string): string {
  let out = text;
  for (const { re, to } of COMPILED) out = out.replace(re, (m) => keepCase(m, to));
  return out;
}

/** The same for every string in a translation tree (pt-PT resources → pt-AO). */
export function aoSpellingTree<T>(value: T): T {
  if (typeof value === "string") return aoSpelling(value) as T;
  if (Array.isArray(value)) return value.map(aoSpellingTree) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, aoSpellingTree(v)])) as T;
  }
  return value;
}
