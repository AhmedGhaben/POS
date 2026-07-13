import { parseDurationMs } from "./duration";

describe("parseDurationMs", () => {
  it.each([
    ["30s", 30 * 1000],
    ["30m", 30 * 60 * 1000],
    ["12h", 12 * 60 * 60 * 1000],
    ["7d", 7 * 24 * 60 * 60 * 1000],
  ])("parses %s", (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it("rejects an unrecognized format", () => {
    expect(() => parseDurationMs("banana")).toThrow();
    expect(() => parseDurationMs("30")).toThrow();
    expect(() => parseDurationMs("30w")).toThrow();
  });
});
