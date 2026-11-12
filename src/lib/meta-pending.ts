import "server-only";
import { cookies } from "next/headers";
import { decrypt } from "./crypto";

export const META_PAGES_COOKIE = "vc_meta_pages";

export type PendingPages = {
  ws: string;
  scopes: string[];
  pages: { id: string; name: string; token: string; igId: string | null; igUsername: string | null }[];
};

/** Reads the short-lived encrypted cookie holding Page tokens between OAuth callback and Page selection. */
export async function readPendingPages(): Promise<PendingPages | null> {
  const raw = (await cookies()).get(META_PAGES_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as PendingPages;
  } catch {
    return null;
  }
}
