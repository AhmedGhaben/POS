import { countryConfig, type FiscalDocumentType } from "@pos/shared";

/**
 * Wording that has to appear on fiscal documents exactly as the law has it,
 * in Portuguese whatever language the screens are in (fiscal terms stay in
 * Portuguese: docs/plans/ANGOLA.md).
 */

/** Printed across documents until the software is certified by AGT. */
export const NOT_VALID_WATERMARK = "DOCUMENTO SEM VALIDADE FISCAL";

export const ANNULLED_STAMP = "ANULADO";

/** Printed on a fiscal document printed again after its first print. */
export const REPRINT_LABEL = "2ª Via";

/** The copies printed when a document is issued. */
const COPY_NAMES = ["Original", "Duplicado", "Triplicado", "Quadruplicado", "Quintuplicado"];

/**
 * The label on each copy of a print: Original, Duplicado... the first time;
 * "2ª Via" on every copy of a later print.
 */
export function copyLabels(copies: number, reprint: boolean): string[] {
  const n = Math.min(Math.max(Math.trunc(copies) || 1, 1), COPY_NAMES.length);
  return Array.from({ length: n }, (_, i) => (reprint ? REPRINT_LABEL : COPY_NAMES[i]));
}

/** "Factura-Recibo", "Nota de Crédito"... from the country config. */
export function documentTitle(type: FiscalDocumentType, country: string | null | undefined): string {
  return countryConfig(country ?? "AO")?.documentTypes[type] ?? type;
}

/**
 * The line under the totals: the hash's 4 characters, then who processed it.
 * Certified: "pqf3-Processado por programa validado nº 77/AGT/2019".
 */
export function certificationLine(hashExcerpt: string, certificate: string | null | undefined): string {
  const text = certificate ? `Processado por programa validado nº ${certificate}` : "Processado por programa não validado";
  return hashExcerpt ? `${hashExcerpt}-${text}` : text;
}

/** The AGT link encoded in the document's QR code. */
export function documentQrValue(country: string | null | undefined, issuerTaxId: string | null | undefined, documentNo: string): string | null {
  const config = countryConfig(country ?? "AO");
  return config && issuerTaxId ? config.documentQrUrl(issuerTaxId, documentNo) : null;
}

/** Payment mechanism names (SAF-T PaymentMechanism), as printed. */
export const MECHANISM_NAMES: Record<string, string> = {
  NU: "Numerário",
  CD: "Cartão de débito / Multicaixa",
  CC: "Cartão de crédito",
  MB: "Referência Multicaixa",
  TB: "Transferência bancária",
  CH: "Cheque",
  OU: "Outros",
};

/** How the person who issued a document is printed: "Maria S.". */
export function operatorName(person: { firstName: string; lastName: string } | null | undefined): string | null {
  if (!person) return null;
  const first = person.firstName.trim();
  const initial = person.lastName.trim().charAt(0);
  return [first, initial && `${initial.toUpperCase()}.`].filter(Boolean).join(" ") || null;
}
