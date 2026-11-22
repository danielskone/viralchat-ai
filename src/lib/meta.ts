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
  // Business-type apps using "Facebook Login for Business" can supply a login configuration id instead of scopes.
  const configId = process.env.META_LOGIN_CONFIG_ID;
  if (configId) u.searchParams.set("config_id", configId);
  else u.searchParams.set("scope", META_SCOPES.join(","));
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

export type MetaButton = { type: "postback"; title: string; payload: string } | { type: "web_url"; title: string; url: string };

/** A plain text message, or a button template when buttons are given (works on Instagram and Messenger). */
function messageBody(text: string, buttons?: MetaButton[]) {
  if (!buttons?.length) return { text };
  return {
    attachment: {
      type: "template",
      payload: { template_type: "button", text: text.slice(0, 640), buttons: buttons.slice(0, 3).map((b) => ({ ...b, title: b.title.slice(0, 20) })) },
    },
  };
}

/** Sends a DM. Instagram (via Facebook Login) and Messenger both use the Page's /messages endpoint with the Page token. */
export async function sendDirectMessage(opts: {
  pageId: string;
  pageToken: string;
  recipientId: string;
  text: string;
  buttons?: MetaButton[];
  tag?: "HUMAN_AGENT" | null;
}) {
  const body: Record<string, unknown> = {
    recipient: { id: opts.recipientId },
    message: messageBody(opts.text, opts.buttons),
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
export async function sendPrivateReply(opts: { pageId: string; pageToken: string; commentId: string; text: string; buttons?: MetaButton[] }) {
  return call<SendResult>(graph(`/${opts.pageId}/messages?access_token=${opts.pageToken}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: opts.commentId }, message: messageBody(opts.text, opts.buttons) }),
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

/** Instagram only: does this person follow the business account? null if Meta won't say. */
export async function checkFollowsBusiness(igsid: string, pageToken: string): Promise<boolean | null> {
  try {
    const p = await call<{ is_user_follow_business?: boolean }>(graph(`/${igsid}?fields=is_user_follow_business&access_token=${pageToken}`));
    return typeof p.is_user_follow_business === "boolean" ? p.is_user_follow_business : null;
  } catch {
    return null;
  }
}

export type RecentPost = { id: string; channel: "instagram" | "messenger"; thumb: string | null; caption: string; permalink: string | null; timestamp: string | null };

export async function listInstagramMedia(igId: string, pageToken: string): Promise<RecentPost[]> {
  const res = await call<{ data: { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string }[] }>(
    graph(`/${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=24&access_token=${pageToken}`),
  );
  return res.data.map((m) => ({
    id: m.id,
    channel: "instagram",
    thumb: m.thumbnail_url ?? (m.media_type === "VIDEO" ? null : m.media_url ?? null),
    caption: (m.caption ?? "").slice(0, 200),
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? null,
  }));
}

export async function listPagePosts(pageId: string, pageToken: string): Promise<RecentPost[]> {
  const res = await call<{ data: { id: string; message?: string; full_picture?: string; permalink_url?: string; created_time?: string }[] }>(
    graph(`/${pageId}/posts?fields=id,message,full_picture,permalink_url,created_time&limit=24&access_token=${pageToken}`),
  );
  return res.data.map((p) => ({
    id: p.id,
    channel: "messenger",
    thumb: p.full_picture ?? null,
    caption: (p.message ?? "").slice(0, 200),
    permalink: p.permalink_url ?? null,
    timestamp: p.created_time ?? null,
  }));
}

/** When was this post/reel published? */
export async function fetchPostTime(channel: "instagram" | "messenger", postId: string, pageToken: string): Promise<Date | null> {
  try {
    const field = channel === "instagram" ? "timestamp" : "created_time";
    const p = await call<Record<string, string>>(graph(`/${postId}?fields=${field}&access_token=${pageToken}`));
    return p[field] ? new Date(p[field]!) : null;
  } catch {
    return null;
  }
}
