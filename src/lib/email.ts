import type { EmailStep } from "@/db/schema";

export const MAX_EMAIL_STEPS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Plain text → safe HTML: escaped, links clickable, line breaks kept. */
export function textToHtml(text: string) {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#4f46e5">${u}</a>`)
    .replace(/\n/g, "<br>");
}

export function renderEmail(opts: { body: string; businessName: string; address?: string | null; unsubscribeUrl: string }) {
  const footerText = [opts.businessName, opts.address].filter(Boolean).join(" · ");
  const text = `${opts.body}\n\n--\n${footerText}\nUnsubscribe: ${opts.unsubscribeUrl}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;font-size:15px;line-height:1.6">${textToHtml(opts.body)}</div>
<p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;color:#6b7280">${escapeHtml(footerText)}<br><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a></p>
</body></html>`;
  return { html, text };
}

/** When the step at `index` is due, counted from `from`. */
export function stepDueAt(steps: EmailStep[], index: number, from: Date) {
  const step = steps[index];
  if (!step) return null;
  return new Date(from.getTime() + Math.max(0, step.delayDays) * DAY_MS);
}

export function formatFrom(name: string, email: string) {
  const clean = name.replace(/["<>\r\n]/g, "").trim();
  return clean ? `${clean} <${email}>` : email;
}
