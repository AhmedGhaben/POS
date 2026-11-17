import { shiftIsElsewhere, tillMismatch } from "./terminal-exceptions";

describe("shift/till rules", () => {
  it("tillMismatch: a browser shift is 'no till'", () => {
    expect(tillMismatch("t1", "t1")).toBe(false);
    expect(tillMismatch(null, null)).toBe(false);
    expect(tillMismatch(undefined, null)).toBe(false);
    expect(tillMismatch(null, "t1")).toBe(true);
    expect(tillMismatch("t1", null)).toBe(true);
    expect(tillMismatch("t1", "t2")).toBe(true);
  });

  it("an authenticated till sells only in its own shift", () => {
    expect(shiftIsElsewhere("t1", "t1", true)).toBe(false);
    expect(shiftIsElsewhere(null, "t1", true)).toBe(true);
    expect(shiftIsElsewhere("t2", "t1", true)).toBe(true);
  });

  it("without a key (browsers, older apps) only two different named tills clash, as before", () => {
    expect(shiftIsElsewhere(null, null, false)).toBe(false);
    expect(shiftIsElsewhere(null, "t1", false)).toBe(false);
    expect(shiftIsElsewhere("t1", null, false)).toBe(false);
    expect(shiftIsElsewhere("t2", "t1", false)).toBe(true);
  });
});
