import { describe, expect, it } from "vitest";
import { formatFrom, renderEmail, stepDueAt, textToHtml } from "@/lib/email";

describe("email rendering", () => {
  it("escapes HTML and makes links clickable", () => {
    const html = textToHtml('Hi <b>Ann</b>\nBook: https://x.co/book?a=1&b=2');
    expect(html).toContain("&lt;b&gt;Ann&lt;/b&gt;<br>");
    expect(html).toContain('<a href="https://x.co/book?a=1&amp;b=2"');
  });
  it("adds business name, address and unsubscribe link", () => {
    const { html, text } = renderEmail({ body: "Hello", businessName: "Kings Auto", address: "1 Main St", unsubscribeUrl: "https://app/u?t=1" });
    expect(text).toContain("Kings Auto · 1 Main St");
    expect(text).toContain("Unsubscribe: https://app/u?t=1");
    expect(html).toContain('href="https://app/u?t=1"');
  });
  it("formats the sender safely", () => {
    expect(formatFrom('Kings "Auto" <x>', "a@b.com")).toBe("Kings Auto x <a@b.com>");
    expect(formatFrom("", "a@b.com")).toBe("a@b.com");
  });
  it("schedules steps by days", () => {
    const from = new Date("2026-11-17T12:00:00Z");
    const steps = [{ delayDays: 0, subject: "a", body: "a" }, { delayDays: 2, subject: "b", body: "b" }];
    expect(stepDueAt(steps, 0, from)?.toISOString()).toBe("2026-11-17T12:00:00.000Z");
    expect(stepDueAt(steps, 1, from)?.toISOString()).toBe("2026-11-19T12:00:00.000Z");
    expect(stepDueAt(steps, 2, from)).toBeNull();
  });
});
