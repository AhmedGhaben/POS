import type { CurrencyWords } from "./countries/types";

/**
 * An amount written out in Portuguese, as on invoices: "mil duzentos e
 * cinquenta kwanzas e vinte e cinco cêntimos". European/Angolan usage: the
 * long scale (mil milhões for 10^9), "cem" for exactly 100, "mil" not "um
 * mil", and "e" before the last group when it's under a hundred or a round
 * hundred ("mil e duzentos", "dois mil e um").
 */
const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 1-999 */
function underThousand(n: number): string {
  if (n === 100) return "cem";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
    }
  }
  return parts.join(" e ");
}

/** Groups of three digits with their scale words, biggest first. */
const SCALES: [number, string, string][] = [
  [1e12, "bilião", "biliões"],
  [1e6, "milhão", "milhões"],
  [1e3, "mil", "mil"],
];

/** A whole number in words (0 to 999 999 999 999 999). */
export function integerInWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return UNITS[0];
  // Each group's own three digits decide the "e" before the last one.
  const groups: { words: string; count: number }[] = [];
  for (const [size, one, many] of SCALES) {
    const count = Math.floor(n / size);
    n %= size;
    if (!count) continue;
    if (size === 1e3) groups.push({ words: count === 1 ? "mil" : `${integerInWords(count)} mil`, count });
    else groups.push({ words: `${integerInWords(count)} ${count === 1 ? one : many}`, count });
  }
  if (n) groups.push({ words: underThousand(n), count: n });
  return groups
    .map((g, i) => {
      if (i === 0) return g.words;
      const last = i === groups.length - 1;
      const joinWithE = last && (g.count < 100 || g.count % 100 === 0);
      return `${joinWithE ? "e " : ""}${g.words}`;
    })
    .join(" ");
}

/** "um milhão de kwanzas": "de" after an exact million/billion. */
function currencyAfter(whole: number, words: CurrencyWords): string {
  if (whole === 1) return words.singular;
  const exactMillions = whole >= 1e6 && whole % 1e6 === 0;
  return exactMillions ? `de ${words.plural}` : words.plural;
}

export function amountInWords(amount: number | string, words: CurrencyWords): string {
  const cents = Math.round(Math.abs(Number(amount)) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const wholePart = `${integerInWords(whole)} ${currencyAfter(whole, words)}`;
  if (!fraction) return wholePart;
  const fractionPart = `${integerInWords(fraction)} ${fraction === 1 ? words.centSingular : words.centPlural}`;
  return whole ? `${wholePart} e ${fractionPart}` : fractionPart;
}
