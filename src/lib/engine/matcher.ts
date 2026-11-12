export type MatchType = "exact" | "contains" | "starts_with";

export function normalize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#@]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the keyword that matched, or null. A keyword of "*" matches any message. */
export function matchKeyword(text: string, keywords: string[], matchType: MatchType | string = "contains"): string | null {
  const t = normalize(text);
  if (!t && !keywords.includes("*")) return null;
  for (const raw of keywords) {
    if (raw.trim() === "*") return "*";
    const k = normalize(raw);
    if (!k) continue;
    if (matchType === "exact" && t === k) return raw;
    if (matchType === "starts_with" && (t === k || t.startsWith(k + " "))) return raw;
    if (matchType === "contains" && (` ${t} `).includes(` ${k} `)) return raw;
  }
  return null;
}

export function interpolate(template: string, vars: Record<string, string | undefined | null>) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
