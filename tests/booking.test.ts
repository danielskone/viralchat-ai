import { describe, expect, it } from "vitest";
import { computeSlots, zonedToUtc, localYmd, slugify, weekdayOf } from "@/lib/booking";

describe("time zones", () => {
  it("converts New York wall time to UTC across DST", () => {
    expect(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
    // Day after DST ends (Nov 1 2026)
    expect(zonedToUtc("2026-11-02", "09:00", "America/New_York").toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
  it("gives the local date of an instant", () => {
    expect(localYmd(new Date("2026-11-17T03:00:00Z"), "America/New_York")).toBe("2026-11-16");
  });
  it("knows weekdays", () => {
    expect(weekdayOf("2026-11-17")).toBe(2); // Tuesday
  });
});

describe("computeSlots", () => {
  const cfg = {
    timezone: "America/New_York",
    weeklyHours: { "2": [{ start: "09:00", end: "11:00" }] },
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeHours: 0,
    maxDaysAhead: 0,
  };
  const now = new Date("2026-11-17T12:00:00Z"); // 7:00 local, Tuesday

  it("lists slots inside opening hours", () => {
    const days = computeSlots(cfg, [], now);
    expect(days).toHaveLength(1);
    expect(days[0]!.slots).toEqual([
      "2026-11-17T14:00:00.000Z",
      "2026-11-17T14:30:00.000Z",
      "2026-11-17T15:00:00.000Z",
      "2026-11-17T15:30:00.000Z",
    ]);
  });
  it("skips taken and too-soon slots", () => {
    const taken = [{ startsAt: new Date("2026-11-17T14:30:00Z"), endsAt: new Date("2026-11-17T15:00:00Z") }];
    const days = computeSlots({ ...cfg, minNoticeHours: 2.5 }, taken, now);
    expect(days[0]!.slots).toEqual(["2026-11-17T15:00:00.000Z", "2026-11-17T15:30:00.000Z"]);
  });
  it("applies the buffer around bookings", () => {
    const taken = [{ startsAt: new Date("2026-11-17T15:00:00Z"), endsAt: new Date("2026-11-17T15:30:00Z") }];
    const days = computeSlots({ ...cfg, bufferMinutes: 15 }, taken, now);
    // 45-minute steps: 9:00, 9:45, 10:30 local; 9:45 (14:45Z) ends 15:15 which overlaps the booking.
    expect(days[0]!.slots).toEqual(["2026-11-17T14:00:00.000Z"]);
  });
});

it("slugifies", () => {
  expect(slugify("Daniel King Automotive!")).toBe("daniel-king-automotive");
  expect(slugify("!!!")).toBe("book");
});
