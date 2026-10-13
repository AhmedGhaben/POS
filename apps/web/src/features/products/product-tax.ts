import type { ProductDto, TaxRateDto } from "@pos/shared";

/** What the product form's tax field holds: a rate by id, exempt, or an older product's bare percentage. */
export type TaxChoice = { kind: "rate"; id: string } | { kind: "exempt" } | { kind: "legacy"; rate: number };

export const EXEMPT = "exempt";
export const LEGACY = "legacy";

export function choiceValue(choice: TaxChoice | null): string | null {
  if (!choice) return null;
  return choice.kind === "rate" ? choice.id : choice.kind === "exempt" ? EXEMPT : LEGACY;
}

/**
 * The tax a product has now. A new product starts on the default rate. An
 * older product that only has a percentage shows the rate with that
 * percentage, or its own percentage until someone picks one.
 */
export function currentTaxChoice(
  product: Pick<ProductDto, "taxRate" | "taxRateId" | "exemptionCode"> | null,
  rates: Pick<TaxRateDto, "id" | "percentage" | "isDefault" | "active">[],
): TaxChoice | null {
  if (!product) {
    const def = rates.find((r) => r.isDefault && r.active);
    return def ? { kind: "rate", id: def.id } : null;
  }
  if (product.taxRateId && rates.some((r) => r.id === product.taxRateId)) return { kind: "rate", id: product.taxRateId };
  const rate = Number(product.taxRate);
  if (rate <= 0) return { kind: "exempt" };
  const match = rates.find((r) => r.active && Number(r.percentage) === rate);
  return match ? { kind: "rate", id: match.id } : { kind: "legacy", rate };
}

/** The tax fields to send, or nothing when an older product's percentage is left as it was. */
export function taxPayload(
  choice: TaxChoice | null,
  exemptionCode: string | null,
): { taxRateId: string | null; exemptionCode: string | null } | Record<string, never> {
  if (!choice || choice.kind === "legacy") return {};
  if (choice.kind === "rate") return { taxRateId: choice.id, exemptionCode: null };
  return { taxRateId: null, exemptionCode };
}
