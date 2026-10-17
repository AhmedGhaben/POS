import { beforeEach, describe, expect, it } from "vitest";
import type { BusinessDto, StoreDto, UserDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { dateLocale, dateOrder, formatCalendarDate, formatDate, formatDateTime, formatShortDate, parseDateInput } from "./dates";
import i18n from "@/i18n";

const changeLanguage = (lang: string) => i18n.changeLanguage(lang);

const store = { id: "s1", businessId: "b1", name: "Loja", address: null, phone: null, timezone: "Africa/Luanda", isActive: true, country: "AO" } as StoreDto;

describe("dates for people (docs/DECISIONS.md, dates)", () => {
  beforeEach(() => {
    useAuthStore.setState({ stores: [store], currentStoreId: "s1", business: { country: "AO" } as BusinessDto, user: { id: "u1" } as UserDto });
  });

  it("an Angolan store's dates are DD/MM/YYYY, even with the screens in English", async () => {
    await changeLanguage("en");
    expect(dateLocale()).toBe("pt-AO");
    expect(formatDate("2026-10-05")).toBe("05/10/2026");
    expect(formatCalendarDate("2026-01-31")).toBe("31/01/2026");
    expect(formatShortDate("2026-10-05")).toBe("05/10");
  });

  it("with a time: DD/MM/YYYY HH:mm, 24-hour", () => {
    const at = new Date(2026, 9, 17, 14, 5); // local time, as shown on the till
    expect(formatDateTime(at)).toBe("17/10/2026 14:05");
    expect(formatDateTime(new Date(2026, 9, 17, 9, 0))).toBe("17/10/2026 09:00");
  });

  it("a calendar date is the same day whatever the computer's time zone", () => {
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
  });

  it("date fields take what's typed in the store's order", () => {
    expect(dateOrder("pt-AO")).toEqual({ order: ["day", "month", "year"], separator: "/" });
    expect(parseDateInput("17/10/2026")).toBe("2026-10-17");
    expect(parseDateInput("1/2/2026")).toBe("2026-02-01");
    expect(parseDateInput("17-10-2026")).toBe("2026-10-17");
    expect(parseDateInput("17.10.2026")).toBe("2026-10-17");
    // ISO pasted from elsewhere still works.
    expect(parseDateInput("2026-10-17")).toBe("2026-10-17");
  });

  it("refuses what isn't a real date yet", () => {
    expect(parseDateInput("31/02/2026")).toBeNull();
    expect(parseDateInput("17/13/2026")).toBeNull();
    expect(parseDateInput("17/10/26")).toBeNull();
    expect(parseDateInput("17/10")).toBeNull();
    expect(parseDateInput("")).toBeNull();
  });

  it("no country config: the screen language decides", async () => {
    useAuthStore.setState({ stores: [{ ...store, country: "XX" }], business: { country: "XX" } as BusinessDto });
    await changeLanguage("en");
    expect(formatCalendarDate("2026-10-17")).toBe("10/17/2026");
  });
});
