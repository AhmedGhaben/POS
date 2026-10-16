import { describe, expect, it } from "vitest";
import { isDisplaySize, rootFontSize } from "./display-size";

describe("display size", () => {
  it("scales the root font size; normal and unknown sizes leave the browser's", () => {
    expect(rootFontSize(115)).toBe("115%");
    expect(rootFontSize(90)).toBe("90%");
    expect(rootFontSize(100)).toBe("");
    expect(rootFontSize(null)).toBe("");
    expect(rootFontSize(250)).toBe("");
  });

  it("knows the four sizes", () => {
    expect([90, 100, 115, 130].every(isDisplaySize)).toBe(true);
    expect(isDisplaySize(120)).toBe(false);
  });
});
