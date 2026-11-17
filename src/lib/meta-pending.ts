import "server-only";
import { cookies } from "next/headers";
import { decrypt } from "./crypto";
import { getGrantedScopes, listPages } from "./meta";

export const META_PAGES_COOKIE = "vc_meta_pages";

export type PendingPages = {
  ws: string;
  scopes: string[];
  pages: { id: string; name: string; token: string; igId: string | null; igUsername: string | null }[];
};

/**
 * Reads the short-lived encrypted cookie set by the OAuth callback. The cookie only holds the
 * workspace id and the long-lived user token (Page tokens for several Pages overflow the 4KB
 * cookie limit), so Pages are fetched from the Graph API here.
 */
export async function readPendingPages(): Promise<PendingPages | null> {
  const raw = (await cookies()).get(META_PAGES_COOKIE)?.value;
  if (!raw) return null;
  let data: { ws: string; t: string };
  try {
    data = JSON.parse(decrypt(raw));
  } catch {
    return null;
  }
  if (!data?.ws || !data?.t) return null;
  const [pages, scopes] = await Promise.all([listPages(data.t), getGrantedScopes(data.t)]);
  return {
    ws: data.ws,
    scopes,
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      token: p.access_token,
      igId: p.instagram_business_account?.id ?? null,
      igUsername: p.instagram_business_account?.username ?? null,
    })),
  };
}
