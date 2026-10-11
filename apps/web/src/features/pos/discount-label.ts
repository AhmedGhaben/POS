import type { DiscountType } from "@pos/shared";

/** "10%", or the amount when the discount was given as one. */
export function discountLabel(
  discount: { type: DiscountType; value: number | string },
  money: (value: number) => string,
): string {
  return discount.type === "PERCENT" ? `${Number(discount.value)}%` : money(Number(discount.value));
}
