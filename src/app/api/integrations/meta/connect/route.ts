import { NextResponse } from "next/server";
import { getWorkspaceContext, hasRole } from "@/lib/auth";
import { buildAuthUrl, metaConfig } from "@/lib/meta";
import { signState } from "@/lib/crypto";

export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  if (!hasRole(ctx.role, "admin")) return NextResponse.redirect(new URL("/integrations?error=forbidden", req.url));
  const cfg = metaConfig();
  if (!cfg.configured) return NextResponse.redirect(new URL("/integrations?error=meta_not_configured", req.url));
  const state = signState({ ws: ctx.workspace.id, u: ctx.user.id });
  return NextResponse.redirect(buildAuthUrl(state));
}
