import { eq } from "drizzle-orm";
import { CheckCircle2, AlertTriangle, CircleDashed, Sparkles, Copy } from "lucide-react";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { metaConfig, META_SCOPES } from "@/lib/meta";
import { stripeConfigured } from "@/lib/stripe";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { checkMetaConnection, disconnectMeta, removeOpenAIKey } from "@/lib/actions/integrations";
import { InstagramIcon, MessengerIcon } from "@/components/brand-icons";
import { OpenAIKeyForm } from "./openai-form";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Integrations" };

function Status({ status }: { status: "connected" | "error" | "disconnected" | "not_configured" }) {
  if (status === "connected") return <Badge tone="success"><CheckCircle2 className="size-3" /> Connected</Badge>;
  if (status === "error") return <Badge tone="danger"><AlertTriangle className="size-3" /> Needs attention</Badge>;
  if (status === "not_configured") return <Badge tone="warning"><AlertTriangle className="size-3" /> Setup required</Badge>;
  return <Badge><CircleDashed className="size-3" /> Not connected</Badge>;
}

const PLANNED = [
  { name: "WhatsApp Business Platform", phase: "Phase 2", note: "Official Cloud API, approved templates" },
  { name: "TikTok Business Messaging", phase: "Phase 3", note: "Where the API is available" },
  { name: "Twilio SMS", phase: "Phase 2", note: "Two-way SMS with STOP handling" },
  { name: "Brevo / SendGrid / Amazon SES", phase: "Phase 2", note: "Email sequences" },
  { name: "Google Calendar & Outlook", phase: "Phase 2", note: "Appointment booking" },
  { name: "Shopify & WooCommerce", phase: "Phase 3", note: "Catalog sync, order updates" },
  { name: "Zapier, Make, Google Sheets", phase: "Phase 2", note: "Use the Webhook step today" },
  { name: "PayPal", phase: "Phase 3", note: "Checkout links" },
];

export default async function IntegrationsPage({ searchParams }: PageProps<"/integrations">) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const rows = await db.select().from(integrations).where(eq(integrations.workspaceId, ctx.workspace.id));
  const meta = rows.find((r) => r.provider === "meta");
  const openai = rows.find((r) => r.provider === "openai");
  const cfg = metaConfig();
  const isAdmin = hasRole(ctx.role, "admin");
  const metaStatus = !cfg.configured ? "not_configured" : meta?.status ?? "disconnected";

  return (
    <>
      <PageHeader title="Integrations" description="Connect the accounts ViralChat AI automates. Credentials are encrypted at rest and never shown again after saving." />
      {typeof sp.error === "string" && <div className="mb-4"><Alert tone="danger" title="Connection problem">{sp.error === "meta_not_configured" ? "The Meta app credentials are not configured on the server yet (see below)." : sp.error === "forbidden" ? "Only workspace admins can connect integrations." : sp.error}</Alert></div>}
      {sp.connected === "meta" && <div className="mb-4"><Alert tone="success" title="Meta connected">Instagram and Messenger events will now reach your automations and inbox.</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 text-white"><InstagramIcon className="size-5" /></span>
                <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500 text-white"><MessengerIcon className="size-5" /></span>
              </div>
              <Status status={metaStatus} />
            </div>
            <CardTitle className="mt-3">Instagram & Facebook Messenger</CardTitle>
            <CardDescription>DMs, comments, story replies and mentions via Meta’s official Graph API and webhooks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {meta?.status === "connected" || meta?.status === "error" ? (
              <div className="rounded-xl bg-muted p-3">
                <p><span className="text-muted-foreground">Facebook Page:</span> {meta.pageName} <span className="text-xs text-muted-foreground">({meta.pageId})</span></p>
                <p><span className="text-muted-foreground">Instagram:</span> {meta.instagramUsername ? `@${meta.instagramUsername}` : "No professional account linked"}</p>
                {meta.connectedAt && <p className="text-xs text-muted-foreground">Connected {timeAgo(meta.connectedAt)}</p>}
                {meta.lastError && <p className="mt-2 text-destructive">{meta.lastError}</p>}
              </div>
            ) : null}

            {!cfg.configured && (
              <Alert tone="warning" title="Server setup required before connecting">
                Set these environment variables on the server: <strong>{cfg.missing.join(", ")}</strong>. Create a Business app at developers.facebook.com with Facebook Login for Business, Messenger and Instagram products.
              </Alert>
            )}

            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer font-medium">Setup details for your Meta app</summary>
              <dl className="mt-3 flex flex-col gap-2">
                <div><dt className="text-muted-foreground">OAuth redirect URI</dt><dd><code className="break-all text-xs">{cfg.redirectUri}</code></dd></div>
                <div><dt className="text-muted-foreground">Webhook callback URL</dt><dd><code className="break-all text-xs">{cfg.webhookUrl}</code></dd></div>
                <div><dt className="text-muted-foreground">Verify token</dt><dd className="text-xs">The value of META_WEBHOOK_VERIFY_TOKEN</dd></div>
                <div><dt className="text-muted-foreground">Webhook fields</dt><dd className="text-xs">Page: messages, messaging_postbacks, feed · Instagram: messages, messaging_postbacks, comments</dd></div>
                <div><dt className="text-muted-foreground">Permissions requested</dt><dd className="text-xs">{META_SCOPES.join(", ")}</dd></div>
                <div><dt className="text-muted-foreground">Requirements</dt><dd className="text-xs">Instagram professional (Business or Creator) account linked to a Facebook Page you admin, with “Allow access to messages” enabled in Instagram settings. Advanced Access via Meta App Review is required before non-tester accounts can use it.</dd></div>
              </dl>
            </details>

            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                {cfg.configured && (
                  <a href="/api/integrations/meta/connect" className={buttonVariants({ variant: meta?.status === "connected" ? "outline" : "gradient" })}>
                    {meta?.status === "connected" ? "Reconnect / change Page" : meta?.status === "error" ? "Reconnect" : "Connect with Facebook"}
                  </a>
                )}
                {meta && meta.status !== "disconnected" && (
                  <>
                    <form action={checkMetaConnection}><Button variant="outline">Check connection</Button></form>
                    <form action={disconnectMeta}><Button variant="ghost" className="text-destructive">Disconnect</Button></form>
                  </>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Ask a workspace admin to manage this connection.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="brand-gradient flex size-9 items-center justify-center rounded-xl text-white"><Sparkles className="size-5" /></span>
              <Status status={openai?.status === "connected" ? "connected" : process.env.OPENAI_API_KEY ? "connected" : "disconnected"} />
            </div>
            <CardTitle className="mt-3">OpenAI (AI chatbot)</CardTitle>
            <CardDescription>Powers AI replies, suggested replies and the AI step in automations.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {openai?.status === "connected" ? (
              <p>Using <strong>your workspace’s own API key</strong> (encrypted). AI usage is billed to your OpenAI account.</p>
            ) : process.env.OPENAI_API_KEY ? (
              <p>Using the <strong>platform’s OpenAI key</strong>. AI replies count toward your plan’s monthly AI reply limit. You can add your own key instead.</p>
            ) : (
              <Alert tone="warning">No OpenAI key is configured. Add your workspace’s key below, or set OPENAI_API_KEY on the server.</Alert>
            )}
            {isAdmin && <OpenAIKeyForm />}
            {isAdmin && openai?.status === "connected" && (
              <form action={removeOpenAIKey}><Button variant="ghost" size="sm" className="text-destructive">Remove workspace key</Button></form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white">S</span>
              <Status status={stripeConfigured() ? "connected" : "not_configured"} />
            </div>
            <CardTitle className="mt-3">Stripe Billing</CardTitle>
            <CardDescription>Platform subscription billing for ViralChat AI plans.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {stripeConfigured() ? "Configured by the platform. Manage your plan on the Billing page." : "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the STRIPE_PRICE_* variables on the server to enable paid plans."}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-xl bg-cyan-600 text-white"><Copy className="size-4" /></span>
              <Badge tone="success">Available</Badge>
            </div>
            <CardTitle className="mt-3">Outgoing webhooks</CardTitle>
            <CardDescription>Send contact data to Zapier, Make, Google Sheets (via Apps Script) or your own API.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Add a <strong>Webhook</strong> step to any automation. It POSTs JSON with the contact, tags, lead score and collected answers to an https URL.</CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">On the roadmap</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANNED.map((p) => (
          <Card key={p.name} className="p-4 opacity-80">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{p.name}</p>
              <Badge>{p.phase}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
