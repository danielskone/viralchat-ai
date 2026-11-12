import { describe, expect, it } from "vitest";
import { interpolate, matchKeyword } from "@/lib/engine/matcher";

describe("matchKeyword", () => {
  it("matches whole words case-insensitively and ignores punctuation", () => {
    expect(matchKeyword("Info please!", ["INFO"])).toBe("INFO");
    expect(matchKeyword("information", ["info"])).toBeNull();
    expect(matchKeyword("¿Precio?", ["precio"])).toBe("precio");
  });
  it("supports exact and starts_with", () => {
    expect(matchKeyword("info", ["INFO"], "exact")).toBe("INFO");
    expect(matchKeyword("info now", ["INFO"], "exact")).toBeNull();
    expect(matchKeyword("book a call", ["book"], "starts_with")).toBe("book");
    expect(matchKeyword("I want to book", ["book"], "starts_with")).toBeNull();
  });
  it("matches multi-word keywords and accents", () => {
    expect(matchKeyword("what are your service times?", ["service times"])).toBe("service times");
    expect(matchKeyword("Café hours", ["cafe"])).toBe("cafe");
  });
  it("treats * as match-all", () => {
    expect(matchKeyword("anything", ["*"])).toBe("*");
  });
});

describe("interpolate", () => {
  it("fills variables and blanks unknown ones", () => {
    expect(interpolate("Hi {{first_name}} {{ missing }}!", { first_name: "Maya" })).toBe("Hi Maya !");
    expect(interpolate("{{field.budget}}", { "field.budget": "$2k" })).toBe("$2k");
  });
});
