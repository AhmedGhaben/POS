import { describe, expect, it } from "vitest";
import { mergeSeries, peekNumber, seriesCode } from "./numbering";

const terminal = { id: "t1", code: "POS-001" };

describe("till document numbering", () => {
  it("series codes match the server's", () => {
    expect(seriesCode("POS-001", 2026)).toBe("POS001-2026");
  });

  it("a till that never read its series from the server doesn't number", () => {
    expect(peekNumber({ terminalId: "t1", synced: false, series: {} }, terminal, "FR", 2026)).toBeNull();
    expect(peekNumber({ terminalId: "other", synced: true, series: {} }, terminal, "FR", 2026)).toBeNull();
    expect(peekNumber({ terminalId: "t1", synced: true, series: {} }, null, "FR", 2026)).toBeNull();
  });

  it("carries on from the local series, and starts at 1 in a new year", () => {
    const state = { terminalId: "t1", synced: true, series: { FR: { code: "POS001-2026", next: 58 } } };
    expect(peekNumber(state, terminal, "FR", 2026)).toEqual({ series: "POS001-2026", number: 58 });
    expect(peekNumber(state, terminal, "FR", 2027)).toEqual({ series: "POS001-2027", number: 1 });
  });

  it("merging with the server keeps whichever is further ahead (queued sales may be ahead of it)", () => {
    const local = { FR: { code: "POS001-2026", next: 60 } };
    const server = { terminalCode: "POS-001", prefix: "POS001", series: [{ documentType: "FR" as const, code: "POS001-2026", year: 2026, nextNumber: 57 }] };
    expect(mergeSeries(local, server, 2026)).toEqual({ FR: { code: "POS001-2026", next: 60 } });
    expect(mergeSeries({}, server, 2026)).toEqual({ FR: { code: "POS001-2026", next: 57 } });
    expect(mergeSeries({ FR: { code: "POS001-2026", next: 3 } }, server, 2026)).toEqual({ FR: { code: "POS001-2026", next: 57 } });
    // Last year's series doesn't count for this year.
    expect(mergeSeries({}, server, 2027)).toEqual({});
  });
});
