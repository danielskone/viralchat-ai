import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth";
import { encrypt, verifyState } from "@/lib/crypto";
import { META_PAGES_COOKIE } from "@/lib/meta-pending";
import { exchangeCodeForLongLivedToken, listPages } from "@/lib/meta";


export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/integrations?${q}`, req.url));
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent(url.searchParams.get("error_description") ?? "Authorization was cancelled")}`);

  const ctx = await getWorkspaceContext();
  const state = verifyState<{ ws: string; u: string }>(url.searchParams.get("state") ?? "");
  if (!ctx || !state || state.ws !== ctx.workspace.id || state.u !== ctx.user.id) return back("error=Invalid%20or%20expired%20authorization%20state");
  const code = url.searchParams.get("code");
  if (!code) return back("error=Missing%20authorization%20code");

  try {
    const userToken = await exchangeCodeForLongLivedToken(code);
    const pages = await listPages(userToken);
    if (!pages.length) return back("error=" + encodeURIComponent("No Facebook Pages were shared. Re-connect and select the Page linked to your Instagram professional account."));
    // Keep the cookie small (well under the 4KB browser limit) and attach it to the redirect itself.
    const res = NextResponse.redirect(new URL("/integrations/meta-select", req.url));
    res.cookies.set(META_PAGES_COOKIE, encrypt(JSON.stringify({ ws: ctx.workspace.id, t: userToken })), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (e) {
    return back("error=" + encodeURIComponent(e instanceof Error ? e.message : "Meta authorization failed"));
  }
}
