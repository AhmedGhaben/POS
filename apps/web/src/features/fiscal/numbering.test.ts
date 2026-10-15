import { describe, expect, it } from "vitest";
import { mergeSeries, peekNumber, seriesCode } from "./numbering";

const terminal = { id: "t1", code: "POS-001" };
const server = (nextNumber: number, lastHash = "SERVERHASH") => ({
  series: [{ documentType: "FR" as const, code: "POS001-2026", year: 2026, nextNumber, lastHash }],
});

describe("till document numbering", () => {
  it("series codes match the server's", () => {
    expect(seriesCode("POS-001", 2026)).toBe("POS001-2026");
  });

  it("a till that never read its series from the server doesn't number", () => {
    expect(peekNumber({ terminalId: "t1", synced: false, series: {} }, terminal, "FR", 2026)).toBeNull();
    expect(peekNumber({ terminalId: "other", synced: true, series: {} }, terminal, "FR", 2026)).toBeNull();
    expect(peekNumber({ terminalId: "t1", synced: true, series: {} }, null, "FR", 2026)).toBeNull();
  });

  it("carries on from the local series over its last hash, and starts at 1 (no previous hash) in a new year", () => {
    const state = { terminalId: "t1", synced: true, series: { FR: { code: "POS001-2026", next: 58, lastHash: "H57" } } };
    expect(peekNumber(state, terminal, "FR", 2026)).toEqual({ series: "POS001-2026", number: 58, previousHash: "H57" });
    expect(peekNumber(state, terminal, "FR", 2027)).toEqual({ series: "POS001-2027", number: 1, previousHash: "" });
  });

  it("merging keeps whichever is further ahead; when the server is, its last hash comes with it", () => {
    const local = { FR: { code: "POS001-2026", next: 60, lastHash: "H59" } };
    expect(mergeSeries(local, server(57), 2026)).toEqual(local);
    expect(mergeSeries({}, server(57), 2026)).toEqual({ FR: { code: "POS001-2026", next: 57, lastHash: "SERVERHASH" } });
    expect(mergeSeries({ FR: { code: "POS001-2026", next: 3, lastHash: "H2" } }, server(57), 2026)).toEqual({
      FR: { code: "POS001-2026", next: 57, lastHash: "SERVERHASH" },
    });
    // Last year's series doesn't count for this year.
    expect(mergeSeries({}, server(57), 2027)).toEqual({});
  });
});
