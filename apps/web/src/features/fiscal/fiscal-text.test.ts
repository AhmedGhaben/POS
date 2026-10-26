import { describe, expect, it } from "vitest";
import { copyLabels, operatorName, REPRINT_LABEL } from "./fiscal-text";

describe("copies of a fiscal document", () => {
  it("the first print: Original, Duplicado, Triplicado", () => {
    expect(copyLabels(1, false)).toEqual(["Original"]);
    expect(copyLabels(3, false)).toEqual(["Original", "Duplicado", "Triplicado"]);
  });

  it("any later print is a 2ª Via, on every copy", () => {
    expect(REPRINT_LABEL).toBe("2ª Via");
    expect(copyLabels(2, true)).toEqual(["2ª Via", "2ª Via"]);
  });

  it("copies stay between 1 and 5", () => {
    expect(copyLabels(0, false)).toEqual(["Original"]);
    expect(copyLabels(9, false)).toHaveLength(5);
  });
});

describe("operatorName", () => {
  it("prints the first name and the initial of the last", () => {
    expect(operatorName({ firstName: "Maria", lastName: "silva" })).toBe("Maria S.");
    expect(operatorName({ firstName: "Caio", lastName: "" })).toBe("Caio");
    expect(operatorName(null)).toBeNull();
  });
});
