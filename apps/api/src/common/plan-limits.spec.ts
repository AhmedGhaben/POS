import { Plan } from "@prisma/client";
import { planLimits } from "./plan-limits";

describe("planLimits", () => {
  it("Simple includes 1 store, Pro 3", () => {
    expect(planLimits(Plan.SIMPLE).maxStores).toBe(1);
    expect(planLimits(Plan.PRO).maxStores).toBe(3);
  });
});
