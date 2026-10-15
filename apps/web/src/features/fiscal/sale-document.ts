import type { SaleDto } from "@pos/shared";

/** The sale's Factura-Recibo, when sales are fiscal documents (absent on older sales). */
export function saleDocument(sale: SaleDto) {
  return sale.fiscalDocuments?.find((d) => d.documentType === "FR" || d.documentType === "FT") ?? null;
}
