import type { SaleDto } from "@pos/shared";

/** The sale's Factura-Recibo, when sales are fiscal documents (absent on older sales). */
export function saleDocument(sale: SaleDto) {
  return sale.fiscalDocuments?.find((d) => d.documentType === "FR" || d.documentType === "FT") ?? null;
}

/** How a sale is shown to people: its fiscal number (FR POS001-2026/57), else the internal receipt number. */
export function saleNumber(sale: SaleDto): string {
  return saleDocument(sale)?.documentNo ?? sale.receiptNumber;
}
