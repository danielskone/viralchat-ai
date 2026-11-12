import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { parseCsv, toCsv } from "@/lib/csv";
import { selectKnowledge, buildSystemPrompt, HANDOFF_TOKEN } from "@/lib/ai-prompt";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("csv", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [["name", "note"], ["Maya, J", 'said "hi"\nthere']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("neutralises formula injection", () => {
    expect(toCsv([["=HYPERLINK()"]])).toBe("'=HYPERLINK()");
  });
});

describe("encryption", () => {
  it("encrypts and decrypts, and detects tampering", async () => {
    const { encrypt, decrypt, signState, verifyState } = await import("@/lib/crypto");
    const c = encrypt("page-token-123");
    expect(c).not.toContain("page-token");
    expect(decrypt(c)).toBe("page-token-123");
    const parts = c.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
    const st = signState({ ws: "w1" });
    expect(verifyState<{ ws: string }>(st)?.ws).toBe("w1");
    expect(verifyState(st.replace(/.$/, st.endsWith("A") ? "B" : "A"))).toBeNull();
  });
});

describe("AI prompt", () => {
  const docs = [
    { title: "Shipping", type: "faq", content: "We ship to Canada and the US in 3-5 days." },
    { title: "Pricing", type: "pricing", content: "Facial: $80. Peel: $120." },
    { title: "History", type: "text", content: "Founded in 2019 by two friends." },
  ];
  it("ranks relevant knowledge first", () => {
    expect(selectKnowledge("Do you ship to Canada?", docs)[0]!.title).toBe("Shipping");
  });
  it("includes guardrails against invented prices and the handoff token", () => {
    const p = buildSystemPrompt({ botName: "Ava", businessName: "Glow", tone: "friendly", personality: "", objective: "sales", languages: "auto", knowledge: docs });
    expect(p).toContain("Never invent prices");
    expect(p).toContain(HANDOFF_TOKEN);
    expect(p).toContain("Facial: $80");
  });
});
