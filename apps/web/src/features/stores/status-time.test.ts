import { describe, expect, it } from "vitest";
import { statusWhen } from "./status-time";

const luanda = { timezone: "Africa/Luanda", country: "AO" };
const NOW = new Date("2026-11-17T13:10:00Z"); // 14:10 in Luanda

describe("statusWhen", () => {
  it("shows the store's clock (Luanda is UTC+1)", () => {
    expect(statusWhen("2026-11-17T13:09:00Z", luanda, NOW)).toEqual({ kind: "today", time: "14:09", date: "17/11" });
  });

  it("yesterday and older days, by the store's date", () => {
    expect(statusWhen("2026-11-16T20:04:00Z", luanda, NOW)).toMatchObject({ kind: "yesterday", time: "21:04" });
    expect(statusWhen("2026-11-16T08:30:00Z", luanda, NOW)).toMatchObject({ kind: "yesterday", time: "09:30" });
    expect(statusWhen("2026-11-15T08:30:00Z", luanda, NOW)).toEqual({ kind: "other", time: "09:30", date: "15/11" });
  });

  it("23:30 UTC is already the next day in Luanda", () => {
    expect(statusWhen("2026-11-16T23:30:00Z", luanda, NOW)).toMatchObject({ kind: "today", time: "00:30" });
  });

  it("a store left on UTC uses its country's time zone", () => {
    expect(statusWhen("2026-11-17T13:09:00Z", { timezone: "UTC", country: "AO" }, NOW).time).toBe("14:09");
  });
});
