import "server-only";

/** Lets ViralChat read comments on the channel and post replies as the channel. */
export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"];

export function youtubeConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !process.env.ENCRYPTION_KEY && "ENCRYPTION_KEY",
  ].filter(Boolean) as string[];
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/integrations/youtube/callback`, missing, configured: missing.length === 0 };
}

export class YoutubeApiError extends Error {
  constructor(message: string, public status?: number, public reason?: string) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string | { message?: string; errors?: { reason?: string }[] };
    error_description?: string;
  };
  if (!res.ok || json.error) {
    const e = json.error;
    const message = typeof e === "string" ? json.error_description || e : e?.message || `YouTube API error ${res.status}`;
    const reason = typeof e === "string" ? e : e?.errors?.[0]?.reason;
    throw new YoutubeApiError(message, res.status, reason);
  }
  return json;
}

export function buildYoutubeAuthUrl(state: string) {
  const cfg = youtubeConfig();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", cfg.clientId!);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeYoutubeCode(code: string) {
  const cfg = youtubeConfig();
  return call<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId!, client_secret: cfg.clientSecret!, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }),
  });
}

export async function refreshYoutubeToken(refreshToken: string) {
  const cfg = youtubeConfig();
  const r = await call<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: cfg.clientId!, client_secret: cfg.clientSecret!, grant_type: "refresh_token" }),
  });
  return r.access_token;
}

export async function revokeYoutubeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", cache: "no-store" }).catch(() => null);
}

const yt = (path: string, params: Record<string, string>) => `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(params)}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function getMyChannel(token: string) {
  const r = await call<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }[] }>(
    yt("channels", { part: "snippet", mine: "true" }),
    { headers: auth(token) },
  );
  const c = r.items?.[0];
  if (!c) return null;
  return { id: c.id, title: c.snippet.title, handle: c.snippet.customUrl ?? null, thumb: c.snippet.thumbnails?.default?.url ?? null };
}

export type YtThread = {
  threadId: string;
  videoId: string | null;
  authorName: string;
  authorChannelId: string | null;
  text: string;
  publishedAt: Date;
  replyCount: number;
};

/** Newest top-level comments on any of the channel's videos (1 quota unit per page). */
export async function listRecentComments(token: string, channelId: string, maxResults = 50): Promise<YtThread[]> {
  type Raw = {
    id: string;
    snippet: {
      videoId?: string;
      totalReplyCount?: number;
      topLevelComment: { snippet: { authorDisplayName: string; authorChannelId?: { value: string }; textOriginal?: string; textDisplay?: string; publishedAt: string } };
    };
  };
  const r = await call<{ items?: Raw[] }>(
    yt("commentThreads", { part: "snippet", allThreadsRelatedToChannelId: channelId, order: "time", maxResults: String(maxResults), textFormat: "plainText" }),
    { headers: auth(token) },
  );
  return (r.items ?? []).map((t) => {
    const s = t.snippet.topLevelComment.snippet;
    return {
      threadId: t.id,
      videoId: t.snippet.videoId ?? null,
      authorName: s.authorDisplayName,
      authorChannelId: s.authorChannelId?.value ?? null,
      text: s.textOriginal ?? s.textDisplay ?? "",
      publishedAt: new Date(s.publishedAt),
      replyCount: t.snippet.totalReplyCount ?? 0,
    };
  });
}

/** Replies under a top-level comment, as the connected channel (50 quota units). */
export async function replyToComment(token: string, threadId: string, text: string) {
  return call<{ id: string }>(yt("comments", { part: "snippet" }), {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { parentId: threadId, textOriginal: text } }),
  });
}
