import type { CustomerDto } from "@pos/shared";

/** A saved customer's address as printed: street, then postal code and city, then province. */
export function customerAddress(c: Pick<CustomerDto, "address" | "postalCode" | "city" | "province">): string {
  return [c.address, [c.postalCode, c.city].filter(Boolean).join(" "), c.province].filter((part) => part && part.trim()).join("\n");
}
