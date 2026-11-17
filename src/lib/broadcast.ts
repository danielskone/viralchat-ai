/** Meta's standard messaging window: automated/bulk messages only within 24h of the person's last message. */
export const BROADCAST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BROADCAST_MAX = 1000;

export type AudienceRow = { conversationId: string; contactId: string; channel: string; lastInboundAt: Date | null };

/**
 * One message per person: picks each contact's most recently active conversation that is still
 * inside the 24-hour window. People who match the audience but are outside the window are only counted.
 */
export function pickRecipients<T extends AudienceRow>(rows: T[], now = Date.now()) {
  const best = new Map<string, T>();
  const matched = new Set<string>();
  for (const r of rows) {
    matched.add(r.contactId);
    if (!r.lastInboundAt || now - r.lastInboundAt.getTime() > BROADCAST_WINDOW_MS) continue;
    const cur = best.get(r.contactId);
    if (!cur || cur.lastInboundAt!.getTime() < r.lastInboundAt.getTime()) best.set(r.contactId, r);
  }
  const eligible = [...best.values()];
  return { eligible, outsideWindow: matched.size - eligible.length };
}
