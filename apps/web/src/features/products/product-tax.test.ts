import { describe, expect, it } from "vitest";
import { currentTaxChoice, needsTaxReview, taxPayload } from "./product-tax";

const rates = [
  { id: "nor", percentage: "14.00", isDefault: true, active: true },
  { id: "red", percentage: "5.00", isDefault: false, active: true },
  { id: "old", percentage: "10.00", isDefault: false, active: false },
];

describe("product tax choice", () => {
  it("a new product starts on the default rate", () => {
    expect(currentTaxChoice(null, rates)).toEqual({ kind: "rate", id: "nor" });
    expect(currentTaxChoice(null, [])).toBeNull();
  });

  it("an existing product shows its rate, or the rate with its percentage", () => {
    expect(currentTaxChoice({ taxRate: "5.00", taxRateId: "red", exemptionCode: null }, rates)).toEqual({ kind: "rate", id: "red" });
    expect(currentTaxChoice({ taxRate: "14.00", taxRateId: null, exemptionCode: null }, rates)).toEqual({ kind: "rate", id: "nor" });
    expect(currentTaxChoice({ taxRate: "0", taxRateId: null, exemptionCode: "M10" }, rates)).toEqual({ kind: "exempt" });
    // An old percentage with no rate to match stays as it is until someone picks one.
    expect(currentTaxChoice({ taxRate: "19.00", taxRateId: null, exemptionCode: null }, rates)).toEqual({ kind: "legacy", rate: 19 });
  });

  it("sends the rate, or exempt with its reason, and nothing for an untouched old percentage", () => {
    expect(taxPayload({ kind: "rate", id: "red" }, "M10")).toEqual({ taxRateId: "red", exemptionCode: null });
    expect(taxPayload({ kind: "exempt" }, "M10")).toEqual({ taxRateId: null, exemptionCode: "M10" });
    expect(taxPayload({ kind: "legacy", rate: 19 }, null)).toEqual({});
  });
});

describe("needsTaxReview (Produtos a rever)", () => {
  it("lists products exempt from IVA without a reason, only where the country needs one", () => {
    expect(needsTaxReview({ taxRate: "0.00", exemptionCode: null }, "AO")).toBe(true);
    expect(needsTaxReview({ taxRate: "0.00", exemptionCode: "M10" }, "AO")).toBe(false);
    expect(needsTaxReview({ taxRate: "14.00", exemptionCode: null }, "AO")).toBe(false);
    expect(needsTaxReview({ taxRate: "0.00", exemptionCode: null }, null)).toBe(false);
  });
});
