import { describe, expect, it } from "vitest";
import { Role } from "@pos/shared";
import { showBackToPos } from "./back-to-pos";

/** Tester #34: an accountant has no till, so "Back to POS" leads nowhere for them. */
describe("Back to POS", () => {
  it("is shown to a manager who came from the POS or has a sale in the cart", () => {
    expect(showBackToPos({ role: Role.MANAGER, left: true, items: 0 })).toBe(true);
    expect(showBackToPos({ role: Role.OWNER, left: false, items: 2 })).toBe(true);
    expect(showBackToPos({ role: Role.MANAGER, left: false, items: 0 })).toBe(false);
  });

  it("is never shown to an accountant", () => {
    expect(showBackToPos({ role: Role.ACCOUNTANT, left: true, items: 0 })).toBe(false);
    expect(showBackToPos({ role: Role.ACCOUNTANT, left: true, items: 3 })).toBe(false);
  });
});
