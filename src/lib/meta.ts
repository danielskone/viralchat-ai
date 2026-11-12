import "server-only";

export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_read_engagement",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "business_management",
];

export function metaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const missing = [
    !appId && "META_APP_ID",
    !appSecret && "META_APP_SECRET",
    !verifyToken && "META_WEBHOOK_VERIFY_TOKEN",
    !process.env.ENCRYPTION_KEY && "ENCRYPTION_KEY",
  ].filter(Boolean) as string[];
  return {
    appId,
    appSecret,
    verifyToken,
    version,
    redirectUri: `${appUrl}/api/integrations/meta/callback`,
    webhookUrl: `${appUrl}/api/webhooks/meta`,
    missing,
    configured: missing.length === 0,
  };
}

const graph = (path: string) => `https://graph.facebook.com/${metaConfig().version}${path}`;

export class MetaApiError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { error?: { message: string; code?: number; error_subcode?: number } } & T;
  if (!res.ok || json.error) {
    const e = json.error;
    throw new MetaApiError(e?.message ?? `Meta API error ${res.status}`, e?.code, e?.error_subcode);
  }
  return json;
}

export function buildAuthUrl(state: string) {
  const cfg = metaConfig();
  const u = new URL(`https://www.facebook.com/${cfg.version}/dialog/oauth`);
  u.searchParams.set("client_id", cfg.appId!);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", META_SCOPES.join(","));
  return u.toString();
}

export async function exchangeCodeForLongLivedToken(code: string) {
  const cfg = metaConfig();
  const short = await call<{ access_token: string }>(
    graph(
      `/oauth/access_token?client_id=${cfg.appId}&client_secret=${cfg.appSecret}&redirect_uri=${encodeURIComponent(cfg.redirectUri)}&code=${encodeURIComponent(code)}`,
    ),
  );
  const long = await call<{ access_token: string }>(
    graph(
      `/oauth/access_token?grant_type=fb_exchange_token&client_id=${cfg.appId}&client_secret=${cfg.appSecret}&fb_exchange_token=${short.access_token}`,
    ),
  );
  return long.access_token;
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  instagram_business_account?: { id: string; username?: string };
};

export async function listPages(userToken: string): Promise<MetaPage[]> {
  const res = await call<{ data: MetaPage[] }>(
    graph(`/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username}&limit=100&access_token=${userToken}`),
  );
  return res.data;
}

export async function getGrantedScopes(userToken: string): Promise<string[]> {
  const res = await call<{ data: { permission: string; status: string }[] }>(graph(`/me/permissions?access_token=${userToken}`));
  return res.data.filter((p) => p.status === "granted").map((p) => p.permission);
}

/** Subscribes our app to the Page's webhooks. Required for Messenger and for Instagram messaging webhooks. */
export async function subscribePage(pageId: string, pageToken: string) {
  return call<{ success: boolean }>(
    graph(`/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_echoes,feed&access_token=${pageToken}`),
    { method: "POST" },
  );
}

export async function unsubscribePage(pageId: string, pageToken: string) {
  return call<{ success: boolean }>(graph(`/${pageId}/subscribed_apps?access_token=${pageToken}`), { method: "DELETE" });
}

type SendResult = { message_id?: string; recipient_id?: string };

/** Sends a DM. Instagram (via Facebook Login) and Messenger both use the Page's /messages endpoint with the Page token. */
export async function sendDirectMessage(opts: {
  pageId: string;
  pageToken: string;
  recipientId: string;
  text: string;
  tag?: "HUMAN_AGENT" | null;
}) {
  const body: Record<string, unknown> = {
    recipient: { id: opts.recipientId },
    message: { text: opts.text },
    messaging_type: opts.tag ? "MESSAGE_TAG" : "RESPONSE",
  };
  if (opts.tag) body.tag = opts.tag;
  return call<SendResult>(graph(`/${opts.pageId}/messages?access_token=${opts.pageToken}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Private reply: one DM in response to a comment (allowed within 7 days of the comment). */
export async function sendPrivateReply(opts: { pageId: string; pageToken: string; commentId: string; text: string }) {
  return call<SendResult>(graph(`/${opts.pageId}/messages?access_token=${opts.pageToken}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: opts.commentId }, message: { text: opts.text } }),
  });
}

/** Public reply under a comment. */
export async function replyToComment(opts: { channel: "instagram" | "messenger"; commentId: string; pageToken: string; text: string }) {
  const path = opts.channel === "instagram" ? `/${opts.commentId}/replies` : `/${opts.commentId}/comments`;
  return call<{ id: string }>(graph(`${path}?access_token=${opts.pageToken}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: opts.text }),
  });
}

export async function fetchProfile(channel: "instagram" | "messenger", userId: string, pageToken: string) {
  try {
    if (channel === "instagram") {
      const p = await call<{ name?: string; username?: string; profile_pic?: string }>(
        graph(`/${userId}?fields=name,username,profile_pic&access_token=${pageToken}`),
      );
      return { name: p.name || p.username || "Instagram user", username: p.username ?? null, avatarUrl: p.profile_pic ?? null };
    }
    const p = await call<{ first_name?: string; last_name?: string; profile_pic?: string }>(
      graph(`/${userId}?fields=first_name,last_name,profile_pic&access_token=${pageToken}`),
    );
    return { name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Messenger user", username: null, avatarUrl: p.profile_pic ?? null };
  } catch {
    return null;
  }
}
