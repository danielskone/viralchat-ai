import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, workspaces } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { acceptInvite } from "@/lib/actions/team";
import { Logo } from "@/components/logo";
import { Card, CardContent, Alert } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonVariants } from "@/components/ui/button";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [row] = await db
    .select({ inv: invitations, ws: workspaces.name })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
    .limit(1);
  const user = await getCurrentUser();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <Logo className="mb-8" />
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {!row ? (
            <Alert tone="danger" title="This invitation is invalid or has expired">Ask your teammate to send a new one.</Alert>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Join {row.ws} on ViralChat AI</h1>
              <p className="text-sm text-muted-foreground">You’ve been invited as <strong className="capitalize">{row.inv.role}</strong> ({row.inv.email}).</p>
              {!user ? (
                <div className="flex gap-2">
                  <Link href={`/signup?invite=${token}`} className={buttonVariants({ variant: "gradient" })}>Create account</Link>
                  <Link href={`/login?next=/invite/${token}`} className={buttonVariants({ variant: "outline" })}>Sign in</Link>
                </div>
              ) : user.email.toLowerCase() !== row.inv.email ? (
                <Alert tone="warning">You’re signed in as {user.email}. Sign in with {row.inv.email} to accept.</Alert>
              ) : (
                <form action={acceptInvite}>
                  <input type="hidden" name="token" value={token} />
                  <SubmitButton variant="gradient">Accept invitation</SubmitButton>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
